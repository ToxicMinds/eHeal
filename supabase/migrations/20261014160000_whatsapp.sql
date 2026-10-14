-- WhatsApp through Meta's official Cloud API (owner's decision of 14 October): Watson's own
-- number, Meta's free test number until there are paying customers. A patient links their
-- WhatsApp by sending the code from their link; Watson then answers them there, and photos or
-- PDFs they send become their documents. Only the `whatsapp` edge function, holding the service
-- key, calls the functions below.

-- The code a patient sends from their link: "Watson 1A2B3C4D".
alter table public.consultations add column whatsapp_code text;
update public.consultations
  set whatsapp_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  where whatsapp_code is null;
alter table public.consultations
  alter column whatsapp_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  alter column whatsapp_code set not null,
  add constraint whatsapp_code_unique unique (whatsapp_code),
  add constraint whatsapp_code_format check (whatsapp_code ~ '^[0-9A-F]{8}$');

-- A WhatsApp number and the consultation it last linked itself to.
create table public.whatsapp_contacts (
  phone text primary key check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  consultation_id uuid not null references public.consultations (id) on delete cascade,
  profile_name text check (char_length(profile_name) <= 120),
  linked_at timestamptz not null default now(),
  last_inbound_at timestamptz
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  -- Meta's id for the message; a delivery Meta repeats is recognised by it.
  wa_message_id text unique,
  direction text not null check (direction in ('in', 'out')),
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  consultation_id uuid references public.consultations (id) on delete cascade,
  kind text not null check (kind in ('text', 'image', 'document', 'audio', 'other')),
  body text check (char_length(body) <= 4096),
  status text not null check (status in ('received', 'sent', 'delivered', 'read', 'failed')),
  error text check (char_length(error) <= 300),
  created_at timestamptz not null default now()
);
create index whatsapp_messages_consultation on public.whatsapp_messages (consultation_id, created_at);

alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_contacts, public.whatsapp_messages from anon, authenticated, service_role;
grant select on public.whatsapp_contacts, public.whatsapp_messages to authenticated, service_role;
create policy "Practitioners read the WhatsApp links of their consultations"
  on public.whatsapp_contacts for select to authenticated
  using (exists (select 1 from public.consultations c
                 where c.id = whatsapp_contacts.consultation_id and c.practitioner_id = (select auth.uid())));
create policy "Practitioners read the WhatsApp messages of their consultations"
  on public.whatsapp_messages for select to authenticated
  using (exists (select 1 from public.consultations c
                 where c.id = whatsapp_messages.consultation_id and c.practitioner_id = (select auth.uid())));

-- What a reply needs to know about a consultation. Nothing clinical.
create function private.whatsapp_view(p_consultation_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('consultation_id', c.id, 'scheduled_at', c.scheduled_at, 'language', c.language,
    'invite_token', c.invite_token, 'must_pay', c.fee_cents is not null and c.paid_at is null,
    'patient_name', p.name)
  from public.consultations c left join public.patients p on p.id = c.patient_id
  where c.id = p_consultation_id;
$$;

-- Records a message that arrived. A message carrying a consultation's code links the sender's
-- number to that consultation and, when the patient is not known yet, makes them known by it.
create function public.whatsapp_receive(
  p_wa_message_id text, p_phone text, p_profile_name text, p_kind text, p_body text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_phone text := private.normal_phone(p_phone);
  v_profile text := nullif(left(btrim(coalesce(p_profile_name, '')), 120), '');
  v_kind text := case when p_kind in ('text', 'image', 'document', 'audio') then p_kind else 'other' end;
  v_code text := upper(substring(coalesce(p_body, '') from '(?i)\m([0-9a-f]{8})\M'));
  v_consultation public.consultations;
  v_contact public.whatsapp_contacts;
  v_inserted uuid;
begin
  if v_phone is null or p_wa_message_id is null then
    return private.refuse('VALIDATION', 'message');
  end if;
  insert into public.whatsapp_messages (wa_message_id, direction, phone, kind, body, status)
    values (p_wa_message_id, 'in', v_phone, v_kind, left(p_body, 4096), 'received')
    on conflict (wa_message_id) do nothing
    returning id into v_inserted;
  if v_inserted is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if v_kind = 'text' and v_code is not null then
    select * into v_consultation from public.consultations
      where whatsapp_code = v_code and status <> 'consent_withdrawn' for update;
  end if;
  if v_consultation.id is not null then
    insert into public.whatsapp_contacts (phone, consultation_id, profile_name, last_inbound_at)
      values (v_phone, v_consultation.id, v_profile, now())
      on conflict (phone) do update
        set consultation_id = excluded.consultation_id, profile_name = coalesce(excluded.profile_name, public.whatsapp_contacts.profile_name),
            linked_at = now(), last_inbound_at = now();
    if v_consultation.patient_id is null then
      perform private.identify_patient(v_consultation, coalesce(v_profile, 'WhatsApp patient'), v_phone);
    else
      -- A known patient without a phone number gets this one, unless it is another patient's.
      update public.patients p set phone = v_phone, updated_at = now()
        where p.id = v_consultation.patient_id and p.phone is null
          and not exists (select 1 from public.patients o
                          where o.practitioner_id = p.practitioner_id and o.phone = v_phone);
    end if;
    update public.whatsapp_messages set consultation_id = v_consultation.id where id = v_inserted;
    perform private.log_event(v_consultation.id, 'whatsapp.linked', 'patient', 'patient',
      'consultation', v_consultation.id, 'success');
    return jsonb_build_object('ok', true, 'linked', true, 'consultation', private.whatsapp_view(v_consultation.id));
  end if;

  update public.whatsapp_contacts set last_inbound_at = now() where phone = v_phone
    returning * into v_contact;
  if v_contact.phone is null then
    return jsonb_build_object('ok', true, 'linked', false, 'consultation', null);
  end if;
  update public.whatsapp_messages set consultation_id = v_contact.consultation_id where id = v_inserted;
  return jsonb_build_object('ok', true, 'linked', false, 'consultation', private.whatsapp_view(v_contact.consultation_id));
end;
$$;

-- A photo or PDF sent in the chat: a document of the linked consultation's patient.
create function public.whatsapp_add_document(p_phone text, p_file_name text, p_media_type text, p_size_bytes int)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_consultation public.consultations;
begin
  select c.* into v_consultation from public.consultations c
    join public.whatsapp_contacts w on w.consultation_id = c.id
    where w.phone = private.normal_phone(p_phone) and c.status <> 'consent_withdrawn'
    for update of c;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  return private.add_document(v_consultation, p_file_name, p_media_type, p_size_bytes, 'whatsapp');
end;
$$;

create function public.whatsapp_confirm_document(p_document_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_document public.patient_documents;
begin
  select * into v_document from public.patient_documents
    where id = p_document_id and source = 'whatsapp' for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  return private.confirm_document(v_document, 'whatsapp', 'patient');
end;
$$;

-- What Watson sent, and what Meta later says became of it.
create function public.whatsapp_sent(
  p_wa_message_id text, p_phone text, p_consultation_id uuid, p_body text, p_error text default null
) returns jsonb
language sql security definer set search_path = ''
as $$
  insert into public.whatsapp_messages (wa_message_id, direction, phone, consultation_id, kind, body, status, error)
    values (p_wa_message_id, 'out', private.normal_phone(p_phone), p_consultation_id, 'text', left(p_body, 4096),
            case when p_error is null then 'sent' else 'failed' end, left(p_error, 300))
    on conflict (wa_message_id) do nothing
  returning jsonb_build_object('ok', true);
$$;

create function public.whatsapp_status(p_wa_message_id text, p_status text, p_error text default null) returns jsonb
language sql security definer set search_path = ''
as $$
  update public.whatsapp_messages
    set status = p_status, error = coalesce(left(p_error, 300), error)
    where wa_message_id = p_wa_message_id and direction = 'out' and p_status in ('sent', 'delivered', 'read', 'failed')
      -- Meta's status updates can arrive out of order; never step back, except to say it failed.
      and (p_status = 'failed' or array_position(array['sent', 'delivered', 'read'], p_status) >=
           coalesce(array_position(array['sent', 'delivered', 'read'], status), 0))
  returning jsonb_build_object('ok', true);
$$;

-- The patient's page gets the code for its "Message Watson on WhatsApp" button.
create or replace function public.invite_details(p_token text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('ok', true, 'scheduled_at', c.scheduled_at, 'fee_cents', c.fee_cents,
              'currency', 'eur', 'paid', c.paid_at is not null, 'paid_at', c.paid_at,
              'whatsapp_code', c.whatsapp_code,
              'patient', (select jsonb_build_object('name', p.name, 'contact', coalesce(p.phone, p.email))
                          from public.patients p where p.id = c.patient_id),
              'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                                'id', d.id, 'file_name', d.file_name, 'media_type', d.media_type,
                                'size_bytes', d.size_bytes, 'created_at', d.created_at)
                              order by d.created_at), '[]'::jsonb)
                            from public.patient_documents d
                            where d.consultation_id = c.id and d.uploaded_at is not null))
     from private.consultation_for_token(p_token) c
     where c.id is not null),
    private.refuse('NOT_FOUND'));
$$;

revoke all on function
  public.whatsapp_receive(text, text, text, text, text),
  public.whatsapp_add_document(text, text, text, int),
  public.whatsapp_confirm_document(uuid),
  public.whatsapp_sent(text, text, uuid, text, text),
  public.whatsapp_status(text, text, text)
from public, anon, authenticated, service_role;
grant execute on function
  public.whatsapp_receive(text, text, text, text, text),
  public.whatsapp_add_document(text, text, text, int),
  public.whatsapp_confirm_document(uuid),
  public.whatsapp_sent(text, text, uuid, text, text),
  public.whatsapp_status(text, text, text)
to service_role;
revoke all on all functions in schema private from public, anon, service_role;
grant execute on function private.document_access(text, text) to anon, authenticated;
