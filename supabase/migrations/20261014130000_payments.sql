-- Patient payment with Stripe Checkout, and a patient link that exists from the start, so the
-- practitioner can send it before the call (decision 0007). Test mode only until Gate R.

alter table public.consultations
  -- What the patient pays, in euro cents. Null: no payment step.
  add column fee_cents int check (fee_cents is null or fee_cents between 50 and 100000),
  -- Whoever holds this opens the patient page, pays and joins the call. Readable only by the
  -- practitioner (row security), never listed to anyone else.
  add column invite_token text unique,
  add column paid_at timestamptz,
  add column paid_amount_cents int,
  add column stripe_checkout_session_id text unique;

update public.consultations
  set invite_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  where invite_token is null;
alter table public.consultations
  alter column invite_token set default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  alter column invite_token set not null,
  add constraint invite_token_format check (invite_token ~ '^[0-9a-f]{64}$');

-- The payment provider is an actor of its own in the audit log.
alter table public.audit_events drop constraint audit_events_actor_role_check;
alter table public.audit_events add constraint audit_events_actor_role_check
  check (actor_role in ('practitioner', 'engine', 'payment'));

-- create_consultation gains the fee.
drop function public.create_consultation(text, timestamptz, public.consultation_language, boolean, text);
create function public.create_consultation(
  p_synthetic_patient_ref text,
  p_scheduled_at timestamptz,
  p_language public.consultation_language,
  p_consent_recorded boolean,
  p_scenario_notes text default '',
  p_fee_cents int default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_status public.consultation_status :=
    case when p_consent_recorded then 'ready_for_audio' else 'consent_pending' end;
begin
  if v_user is null then
    return private.refuse('NOT_SIGNED_IN');
  end if;
  if private.is_engine() then
    return private.refuse('NOT_A_PRACTITIONER');
  end if;
  if p_synthetic_patient_ref is null or p_synthetic_patient_ref !~ '^SYN-[0-9]{1,8}$' then
    return private.refuse('VALIDATION', 'synthetic_patient_ref');
  end if;
  if p_scheduled_at is null then
    return private.refuse('VALIDATION', 'scheduled_at');
  end if;
  if char_length(coalesce(p_scenario_notes, '')) > 500 then
    return private.refuse('VALIDATION', 'scenario_notes');
  end if;
  if p_fee_cents is not null and p_fee_cents not between 50 and 100000 then
    return private.refuse('VALIDATION', 'fee_cents');
  end if;

  insert into public.consultations (
    practitioner_id, synthetic_patient_ref, scheduled_at, language, status,
    consent_recorded_at, consent_recorded_by, scenario_notes, fee_cents
  ) values (
    v_user, p_synthetic_patient_ref, p_scheduled_at, p_language, v_status,
    case when p_consent_recorded then now() end,
    case when p_consent_recorded then v_user end,
    coalesce(p_scenario_notes, ''), p_fee_cents
  ) returning id into v_id;

  perform private.log_event(v_id, 'consultation.created', v_user::text, 'practitioner',
    'consultation', v_id, 'success', jsonb_build_object('to_status', v_status));
  if p_consent_recorded then
    perform private.log_event(v_id, 'consent.recorded', v_user::text, 'practitioner',
      'consultation', v_id, 'success');
  end if;
  return jsonb_build_object('ok', true, 'consultation_id', v_id);
end;
$$;

-- What the patient's page may know: when, how much, whether it is paid. Nothing else.
create function public.invite_details(p_token text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('ok', true, 'scheduled_at', c.scheduled_at, 'fee_cents', c.fee_cents,
              'currency', 'eur', 'paid', c.paid_at is not null, 'paid_at', c.paid_at)
     from public.consultations c
     where p_token ~ '^[0-9a-f]{64}$' and c.invite_token = p_token and c.status <> 'consent_withdrawn'),
    private.refuse('NOT_FOUND'));
$$;

-- Called by the payment function with the service key, after Stripe confirmed the payment.
-- Safe to call twice: the webhook and the patient's return both fulfil.
create function public.record_payment(p_consultation_id uuid, p_session_id text, p_amount_cents int)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_consultation public.consultations;
begin
  select * into v_consultation from public.consultations where id = p_consultation_id for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  if v_consultation.paid_at is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if v_consultation.fee_cents is null or p_amount_cents is distinct from v_consultation.fee_cents then
    return private.refuse('VALIDATION', 'amount');
  end if;
  update public.consultations
    set paid_at = now(), paid_amount_cents = p_amount_cents, stripe_checkout_session_id = p_session_id,
        updated_at = now()
    where id = p_consultation_id;
  perform private.log_event(p_consultation_id, 'payment.received', 'stripe', 'payment',
    'consultation', p_consultation_id, 'success');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function
  public.create_consultation(text, timestamptz, public.consultation_language, boolean, text, int),
  public.invite_details(text),
  public.record_payment(uuid, text, int)
from public, anon, authenticated, service_role;
grant execute on function public.create_consultation(text, timestamptz, public.consultation_language, boolean, text, int)
  to authenticated;
grant execute on function public.invite_details(text) to anon, authenticated, service_role;
grant execute on function public.record_payment(uuid, text, int) to service_role;
revoke all on all functions in schema private from public, anon, service_role;
