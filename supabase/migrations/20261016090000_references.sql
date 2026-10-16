-- Patient references by Watson (owner, 16 October): nobody types one, and two consultations never
-- share one. A counter in the database numbers them: SYN-100001, SYN-100002, …

create sequence public.consultation_reference start 100001;
revoke all on sequence public.consultation_reference from public, anon, authenticated;

create function private.new_reference() returns text
language sql volatile set search_path = ''
as $$
  select 'SYN-' || nextval('public.consultation_reference')::text;
$$;
revoke all on function private.new_reference() from public, anon, authenticated, service_role;

-- create_consultation: the reference becomes optional (named last; callers name their arguments).
drop function public.create_consultation(text, timestamptz, public.consultation_language, boolean, text, int);
create function public.create_consultation(
  p_scheduled_at timestamptz,
  p_language public.consultation_language,
  p_consent_recorded boolean,
  p_scenario_notes text default '',
  p_fee_cents int default null,
  p_synthetic_patient_ref text default null
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
  if p_synthetic_patient_ref is not null and p_synthetic_patient_ref !~ '^SYN-[0-9]{1,8}$' then
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
    v_user, coalesce(p_synthetic_patient_ref, private.new_reference()), p_scheduled_at, p_language, v_status,
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
revoke all on function public.create_consultation(timestamptz, public.consultation_language, boolean, text, int, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_consultation(timestamptz, public.consultation_language, boolean, text, int, text)
  to authenticated;
