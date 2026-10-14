-- Patients and their documents (roadmap: raised by the owner on 14 October). A patient has no
-- account: they are known to a practitioner by their phone number or email, whichever they
-- have. Documents (lab results, reports, letters) go into a private bucket; the engine on the
-- practitioner's computer reads them, and the form may quote them by page.

-- The patient's page and the payment provider act too.
alter table public.audit_events drop constraint audit_events_actor_role_check;
alter table public.audit_events add constraint audit_events_actor_role_check
  check (actor_role in ('practitioner', 'engine', 'payment', 'patient'));

-- Two more non-clinical keys for document events: where a document came from and its page count.
create or replace function private.log_event(
  p_consultation_id uuid, p_event_type text, p_actor_id text, p_actor_role text,
  p_resource_type text, p_resource_id uuid, p_result text, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_previous text;
  v_event_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
begin
  -- Free text cannot reach the log: only these non-clinical keys are accepted.
  if exists (
    select 1 from jsonb_object_keys(p_metadata) as k
    where k <> all (array[
      'from_status', 'to_status', 'attempted', 'speaker', 'format', 'size_bytes',
      'duration_seconds', 'job_id', 'attempt', 'stage', 'error_category', 'engine_id',
      'segment_count', 'model', 'source', 'pages'
    ])
  ) then
    raise exception 'audit metadata may contain only allow-listed, non-clinical keys';
  end if;

  -- One writer per consultation at a time, so the chain cannot fork.
  perform pg_advisory_xact_lock(hashtextextended(p_consultation_id::text, 42));
  select event_hash into v_previous
    from public.audit_events
    where consultation_id = p_consultation_id
    order by seq desc limit 1;

  insert into public.audit_events (
    event_id, event_type, timestamp_utc, consultation_id, actor_id, actor_role,
    resource_type, resource_id, result, metadata_without_clinical_content,
    previous_event_hash, event_hash
  ) values (
    v_event_id, p_event_type, v_now, p_consultation_id, p_actor_id, p_actor_role,
    p_resource_type, p_resource_id, p_result, p_metadata, v_previous,
    private.event_hash(v_previous, v_event_id, p_event_type, v_now, p_consultation_id,
      p_actor_id, p_actor_role, p_resource_type, p_resource_id, p_result, p_metadata)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------------

-- "+421 900 123 456", "00421 900-123-456" and "(+421) 900123456" are all +421900123456.
-- A number without its country code cannot be placed, so it is refused.
create function private.normal_phone(p text) returns text
language sql immutable set search_path = ''
as $$
  select case when v ~ '^\+[1-9][0-9]{6,14}$' then v end
  from (select regexp_replace(regexp_replace(btrim(coalesce(p, '')), '^00', '+'), '[^0-9+]', '', 'g') as v) s;
$$;

create function private.normal_email(p text) returns text
language sql immutable set search_path = ''
as $$
  select case when v ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(v) <= 254 then v end
  from (select lower(btrim(coalesce(p, ''))) as v) s;
$$;

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references auth.users (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  phone text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email text check (email = lower(email) and char_length(email) <= 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);
create unique index patients_phone on public.patients (practitioner_id, phone) where phone is not null;
create unique index patients_email on public.patients (practitioner_id, email) where email is not null;

alter table public.consultations
  add column patient_id uuid references public.patients (id) on delete restrict;

alter table public.patients enable row level security;
revoke all on public.patients from anon, authenticated, service_role;
grant select on public.patients to authenticated, service_role;
create policy "Practitioners read their own patients"
  on public.patients for select to authenticated
  using (practitioner_id = (select auth.uid()));

-- Puts a name and a phone number or email on a consultation's patient. The same number or
-- email of this practitioner always means the same patient, so documents follow them from one
-- consultation to the next. Caller holds the consultation's row lock.
create function private.identify_patient(p_consultation public.consultations, p_name text, p_contact text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text;
  v_email text;
  v_patient uuid;
begin
  if char_length(v_name) not between 1 and 120 then
    return private.refuse('VALIDATION', 'name');
  end if;
  if position('@' in coalesce(p_contact, '')) > 0 then
    v_email := private.normal_email(p_contact);
  else
    v_phone := private.normal_phone(p_contact);
  end if;
  if v_phone is null and v_email is null then
    return private.refuse('VALIDATION', 'contact');
  end if;

  select id into v_patient from public.patients
    where practitioner_id = p_consultation.practitioner_id
      and (phone = v_phone or email = v_email);
  if v_patient is null and p_consultation.patient_id is not null then
    -- A new number or email for the patient already on this consultation: a correction.
    update public.patients
      set name = v_name, phone = coalesce(v_phone, phone), email = coalesce(v_email, email), updated_at = now()
      where id = p_consultation.patient_id
      returning id into v_patient;
  elsif v_patient is null then
    insert into public.patients (practitioner_id, name, phone, email)
      values (p_consultation.practitioner_id, v_name, v_phone, v_email)
      returning id into v_patient;
  else
    update public.patients set name = v_name, updated_at = now() where id = v_patient;
  end if;

  if p_consultation.patient_id is distinct from v_patient then
    update public.consultations set patient_id = v_patient, updated_at = now() where id = p_consultation.id;
    -- What was sent for this consultation follows it to the patient it now belongs to.
    update public.patient_documents set patient_id = v_patient where consultation_id = p_consultation.id;
  end if;
  return jsonb_build_object('ok', true, 'patient_id', v_patient);
end;
$$;

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

create type public.document_reading as enum ('waiting', 'reading', 'read', 'unreadable', 'failed');

create table public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references auth.users (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  consultation_id uuid not null references public.consultations (id) on delete restrict,
  -- <practitioner id>/<document id>: identifiers only, never the file's name.
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  media_type text not null check (media_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  source text not null check (source in ('patient', 'practitioner', 'whatsapp')),
  created_at timestamptz not null default now(),
  -- Null until the file is confirmed in storage.
  uploaded_at timestamptz,
  reading public.document_reading not null default 'waiting',
  reading_attempt int not null default 0,
  claimed_at timestamptz,
  engine_user_id uuid references auth.users (id) on delete set null,
  read_at timestamptz,
  -- What the engine read, one entry per page.
  page_texts text[] check (cardinality(page_texts) <= 100),
  error_category text
);
create index patient_documents_patient on public.patient_documents (patient_id, created_at);
create index patient_documents_waiting on public.patient_documents (created_at)
  where reading in ('waiting', 'reading') and uploaded_at is not null;

alter table public.patient_documents enable row level security;
revoke all on public.patient_documents from anon, authenticated, service_role;
grant select on public.patient_documents to authenticated, service_role;
create policy "Practitioners read their patients' documents"
  on public.patient_documents for select to authenticated
  using (practitioner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

-- Who may do what with a file in the documents bucket:
--  add:    anyone holding the path of a document record that is still waiting for its file
--          (the path goes only to whoever created the record: the patient's page or the
--          practitioner), for 30 minutes;
--  read:   the practitioner it belongs to, and the engine reading it;
--  remove: anyone, once no record points at the file (records are removed first).
create function private.document_access(p_object_name text, p_action text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case p_action
    when 'add' then exists (
      select 1 from public.patient_documents d
      where d.storage_path = p_object_name and d.uploaded_at is null
        and d.created_at > now() - interval '30 minutes'
        and (d.source = 'patient' or d.practitioner_id = (select auth.uid())))
    when 'read' then exists (
      select 1 from public.patient_documents d
      where d.storage_path = p_object_name
        and (d.practitioner_id = (select auth.uid())
             or (d.reading = 'reading' and d.engine_user_id = (select auth.uid()))))
      or not exists (select 1 from public.patient_documents d where d.storage_path = p_object_name)
    when 'remove' then not exists (select 1 from public.patient_documents d where d.storage_path = p_object_name)
    else false
  end;
$$;
revoke all on function private.document_access(text, text) from public, anon, authenticated, service_role;
grant usage on schema private to anon;
grant execute on function private.document_access(text, text) to anon, authenticated;

create policy "Documents are added only to a record waiting for its file"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'documents' and private.document_access(name, 'add'));
create policy "Documents are read by their practitioner and the engine"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'documents' and private.document_access(name, 'read'));
create policy "Documents are removed once no record points at them"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'documents' and private.document_access(name, 'remove'));

-- Starts a document: checks it and makes the record the file will be attached to.
-- Caller holds the consultation's row lock.
create function private.add_document(
  p_consultation public.consultations, p_file_name text, p_media_type text, p_size_bytes int, p_source text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_path text := p_consultation.practitioner_id::text || '/' || v_id::text;
  v_name text := btrim(regexp_replace(coalesce(p_file_name, ''), '[/\\[:cntrl:]]', '', 'g'));
begin
  if p_consultation.patient_id is null then
    return private.refuse('PATIENT_MISSING');
  end if;
  if char_length(v_name) not between 1 and 200 then
    return private.refuse('VALIDATION', 'file_name');
  end if;
  if p_media_type is null or p_media_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then
    return private.refuse('DOCUMENT_FORMAT_UNSUPPORTED');
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 then
    return private.refuse('VALIDATION', 'size_bytes');
  end if;
  if p_size_bytes > 10485760 then
    return private.refuse('DOCUMENT_TOO_LARGE');
  end if;
  if (select count(*) from public.patient_documents where consultation_id = p_consultation.id) >= 20 then
    return private.refuse('DOCUMENT_LIMIT');
  end if;
  insert into public.patient_documents (id, practitioner_id, patient_id, consultation_id, storage_path,
                                        file_name, media_type, size_bytes, source)
    values (v_id, p_consultation.practitioner_id, p_consultation.patient_id, p_consultation.id, v_path,
            v_name, p_media_type, p_size_bytes, p_source);
  return jsonb_build_object('ok', true, 'document_id', v_id, 'path', v_path);
end;
$$;

-- Confirms the file arrived whole; only then does the engine read it.
create function private.confirm_document(p_document public.patient_documents, p_actor_id text, p_actor_role text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_stored bigint;
begin
  if p_document.uploaded_at is not null then
    return jsonb_build_object('ok', true);
  end if;
  select (metadata ->> 'size')::bigint into v_stored
    from storage.objects where bucket_id = 'documents' and name = p_document.storage_path;
  if not found then
    return private.refuse('DOCUMENT_FILE_MISSING');
  end if;
  if v_stored is distinct from p_document.size_bytes then
    return private.refuse('DOCUMENT_CORRUPT');
  end if;
  update public.patient_documents set uploaded_at = now() where id = p_document.id;
  perform private.log_event(p_document.consultation_id, 'document.added', p_actor_id, p_actor_role,
    'patient_document', p_document.id, 'success',
    jsonb_build_object('format', p_document.media_type, 'size_bytes', p_document.size_bytes,
      'source', p_document.source));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- The patient's page: everything goes through the link's token
-- ---------------------------------------------------------------------------

create function private.consultation_for_token(p_token text) returns public.consultations
language sql stable security definer set search_path = ''
as $$
  select c.* from public.consultations c
  where p_token ~ '^[0-9a-f]{64}$' and c.invite_token = p_token and c.status <> 'consent_withdrawn';
$$;

-- What the patient's page may know: when, how much, whether it is paid, who they said they are,
-- and the documents sent for this consultation. Never anything from other consultations.
create or replace function public.invite_details(p_token text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('ok', true, 'scheduled_at', c.scheduled_at, 'fee_cents', c.fee_cents,
              'currency', 'eur', 'paid', c.paid_at is not null, 'paid_at', c.paid_at,
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

create function public.patient_identify(p_token text, p_name text, p_contact text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_consultation public.consultations;
begin
  select * into v_consultation from public.consultations
    where id = (select id from private.consultation_for_token(p_token)) for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  return private.identify_patient(v_consultation, p_name, p_contact);
end;
$$;

create function public.patient_add_document(p_token text, p_file_name text, p_media_type text, p_size_bytes int)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_consultation public.consultations;
begin
  select * into v_consultation from public.consultations
    where id = (select id from private.consultation_for_token(p_token)) for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  return private.add_document(v_consultation, p_file_name, p_media_type, p_size_bytes, 'patient');
end;
$$;

create function public.patient_confirm_document(p_token text, p_document_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_document public.patient_documents;
begin
  select d.* into v_document from public.patient_documents d
    where d.id = p_document_id and d.source = 'patient'
      and d.consultation_id = (select id from private.consultation_for_token(p_token))
    for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  return private.confirm_document(v_document, 'patient', 'patient');
end;
$$;

-- The patient may take back what they sent for this consultation. The page then deletes the file.
create function public.patient_remove_document(p_token text, p_document_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_document public.patient_documents;
begin
  delete from public.patient_documents d
    where d.id = p_document_id and d.source = 'patient'
      and d.consultation_id = (select id from private.consultation_for_token(p_token))
    returning * into v_document;
  if v_document.id is null then
    return private.refuse('NOT_FOUND');
  end if;
  if v_document.uploaded_at is not null then
    perform private.log_event(v_document.consultation_id, 'document.removed', 'patient', 'patient',
      'patient_document', v_document.id, 'success', jsonb_build_object('source', v_document.source));
  end if;
  return jsonb_build_object('ok', true, 'path', v_document.storage_path);
end;
$$;

-- ---------------------------------------------------------------------------
-- The practitioner
-- ---------------------------------------------------------------------------

create function public.set_patient(p_consultation_id uuid, p_name text, p_contact text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_consultation public.consultations;
begin
  select * into v_consultation from public.consultations
    where id = p_consultation_id and practitioner_id = (select auth.uid()) for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  return private.identify_patient(v_consultation, p_name, p_contact);
end;
$$;

create function public.add_document(p_consultation_id uuid, p_file_name text, p_media_type text, p_size_bytes int)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_consultation public.consultations;
begin
  select * into v_consultation from public.consultations
    where id = p_consultation_id and practitioner_id = (select auth.uid()) for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  return private.add_document(v_consultation, p_file_name, p_media_type, p_size_bytes, 'practitioner');
end;
$$;

create function public.confirm_document(p_document_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_document public.patient_documents;
begin
  select * into v_document from public.patient_documents
    where id = p_document_id and practitioner_id = (select auth.uid()) for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  return private.confirm_document(v_document, (select auth.uid())::text, 'practitioner');
end;
$$;

-- Removes any document of the practitioner's patients. The caller then deletes the file.
create function public.remove_document(p_document_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_document public.patient_documents;
begin
  delete from public.patient_documents
    where id = p_document_id and practitioner_id = (select auth.uid())
    returning * into v_document;
  if v_document.id is null then
    return private.refuse('NOT_FOUND');
  end if;
  if v_document.uploaded_at is not null then
    perform private.log_event(v_document.consultation_id, 'document.removed', (select auth.uid())::text,
      'practitioner', 'patient_document', v_document.id, 'success', jsonb_build_object('source', v_document.source));
  end if;
  return jsonb_build_object('ok', true, 'path', v_document.storage_path);
end;
$$;

-- "Try again" for a document Watson could not read, for example before its reading models were installed.
create function public.read_document_again(p_document_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  update public.patient_documents
    set reading = 'waiting', reading_attempt = 0, error_category = null, read_at = null
    where id = p_document_id and practitioner_id = (select auth.uid()) and reading in ('unreadable', 'failed')
      and uploaded_at is not null;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- The engine reads documents
-- ---------------------------------------------------------------------------

create function public.engine_claim_document() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_engine uuid := (select auth.uid());
  v_document public.patient_documents;
begin
  if not private.is_engine() then
    return private.refuse('NOT_AN_ENGINE');
  end if;
  update public.engines set last_seen_at = now() where user_id = v_engine;

  -- A document left half-read by a computer that went to sleep goes back in line, three times.
  update public.patient_documents
    set reading = case when reading_attempt >= 3 then 'failed'::public.document_reading else 'waiting' end,
        error_category = case when reading_attempt >= 3 then 'ENGINE_STALLED' end,
        engine_user_id = null, claimed_at = null
    where reading = 'reading' and claimed_at < now() - interval '10 minutes';

  select * into v_document from public.patient_documents
    where reading = 'waiting' and uploaded_at is not null
    order by created_at limit 1
    for update skip locked;
  if not found then
    return jsonb_build_object('ok', true, 'document', null);
  end if;
  update public.patient_documents
    set reading = 'reading', reading_attempt = reading_attempt + 1, claimed_at = now(), engine_user_id = v_engine
    where id = v_document.id returning * into v_document;
  return jsonb_build_object('ok', true, 'document', jsonb_build_object(
    'document_id', v_document.id, 'attempt', v_document.reading_attempt,
    'storage_path', v_document.storage_path, 'media_type', v_document.media_type));
end;
$$;

-- Pages that came out empty everywhere mean Watson could not read it (handwriting, a photo of a face).
create function public.engine_complete_document(p_document_id uuid, p_attempt int, p_pages text[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_engine uuid := (select auth.uid());
  v_document public.patient_documents;
  v_readable boolean;
begin
  if not private.is_engine() then
    return private.refuse('NOT_AN_ENGINE');
  end if;
  select * into v_document from public.patient_documents
    where id = p_document_id and reading_attempt = p_attempt and reading = 'reading' and engine_user_id = v_engine
    for update;
  if not found then
    return private.refuse('JOB_NOT_YOURS');
  end if;
  if p_pages is null or cardinality(p_pages) not between 1 and 100
     or exists (select 1 from unnest(p_pages) t where t is null or char_length(t) > 20000) then
    return private.refuse('VALIDATION', 'pages');
  end if;
  v_readable := exists (select 1 from unnest(p_pages) t where char_length(btrim(t)) >= 10);
  update public.patient_documents
    set reading = case when v_readable then 'read'::public.document_reading else 'unreadable' end,
        page_texts = case when v_readable then p_pages end, read_at = now(), claimed_at = null
    where id = p_document_id;
  perform private.log_event(v_document.consultation_id,
    case when v_readable then 'document.read' else 'document.unreadable' end, v_engine::text, 'engine',
    'patient_document', v_document.id, 'success', jsonb_build_object('pages', cardinality(p_pages)));
  return jsonb_build_object('ok', true, 'readable', v_readable);
end;
$$;

create function public.engine_fail_document(p_document_id uuid, p_attempt int, p_error_category text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_engine uuid := (select auth.uid());
  v_document public.patient_documents;
begin
  if not private.is_engine() then
    return private.refuse('NOT_AN_ENGINE');
  end if;
  if p_error_category is null or p_error_category <> all (array['DOCUMENT_UNREADABLE', 'OCR_MODEL_UNAVAILABLE', 'DOCUMENT_FAILED']) then
    return private.refuse('VALIDATION', 'error_category');
  end if;
  select * into v_document from public.patient_documents
    where id = p_document_id and reading_attempt = p_attempt and reading = 'reading' and engine_user_id = v_engine
    for update;
  if not found then
    return private.refuse('JOB_NOT_YOURS');
  end if;
  update public.patient_documents
    set reading = case when p_error_category = 'DOCUMENT_UNREADABLE' then 'unreadable'::public.document_reading
                       else 'failed' end,
        error_category = p_error_category, read_at = now(), claimed_at = null
    where id = p_document_id;
  perform private.log_event(v_document.consultation_id, 'document.unreadable', v_engine::text, 'engine',
    'patient_document', v_document.id, 'failure', jsonb_build_object('error_category', p_error_category));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- The form reads the documents too, and may quote them by page
-- ---------------------------------------------------------------------------

alter table public.form_answers
  add column document_quotes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(document_quotes) = 'array' and jsonb_array_length(document_quotes) <= 6);

-- The job now carries the patient's documents Watson could read, newest first.
create or replace function public.engine_claim_form_job() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_engine uuid := (select auth.uid());
  v_job public.form_jobs;
  v_consultation public.consultations;
begin
  if not private.is_engine() then
    return private.refuse('NOT_AN_ENGINE');
  end if;
  update public.engines set last_seen_at = now() where user_id = v_engine;

  for v_job in
    select j.* from public.form_jobs j
      join public.consultations c on c.id = j.consultation_id
    where j.status = 'processing' and j.heartbeat_at < now() - interval '2 minutes'
    for update of c, j skip locked
  loop
    if v_job.attempt >= 3 then
      perform private.fail_form_job(v_job, 'ENGINE_STALLED', v_engine::text);
    else
      update public.form_jobs
        set status = 'queued', attempt = attempt + 1, claimed_at = null, heartbeat_at = null, engine_user_id = null
        where id = v_job.id;
    end if;
  end loop;

  select j.* into v_job from public.form_jobs j
    join public.consultations c on c.id = j.consultation_id
    where j.status = 'queued' order by j.queued_at limit 1
    for update of c, j skip locked;
  if not found then
    return jsonb_build_object('ok', true, 'job', null);
  end if;
  select * into v_consultation from public.consultations where id = v_job.consultation_id;
  update public.form_jobs
    set status = 'processing', claimed_at = now(), heartbeat_at = now(), engine_user_id = v_engine
    where id = v_job.id returning * into v_job;
  perform private.log_event(v_job.consultation_id, 'form.started', v_engine::text, 'engine',
    'form_job', v_job.id, 'success', jsonb_build_object('job_id', v_job.id, 'attempt', v_job.attempt));
  return jsonb_build_object('ok', true, 'job', jsonb_build_object(
    'job_id', v_job.id,
    'attempt', v_job.attempt,
    'consultation_id', v_consultation.id,
    'language', coalesce(
      nullif(v_consultation.language::text, 'auto'),
      (select tr.tracks -> 0 ->> 'language' from public.transcripts tr where tr.id = v_job.transcript_id)),
    'template', (select definition from public.form_templates where practitioner_id = v_consultation.practitioner_id),
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'position', s.position, 'speaker', s.speaker, 'text', coalesce(s.reviewed_text, s.machine_text))
        order by s.position), '[]'::jsonb)
      from public.transcript_segments s
      where s.transcript_id = v_job.transcript_id and not s.possibly_not_speech),
    'documents', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'document_id', d.id, 'file_name', d.file_name, 'sent_at', d.uploaded_at, 'pages', to_jsonb(d.page_texts))
        order by d.uploaded_at desc), '[]'::jsonb)
      from (select * from public.patient_documents
            where patient_id = v_consultation.patient_id and reading = 'read'
            order by uploaded_at desc limit 10) d)));
end;
$$;

-- Answers may now carry quotes from the patient's documents: which document, which page, which words.
create or replace function public.engine_complete_form_job(
  p_job_id uuid, p_attempt int, p_answers jsonb, p_metrics jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_engine uuid := (select auth.uid());
  v_job public.form_jobs;
  v_template jsonb;
  v_patient uuid;
  v_form_id uuid;
  v_answered int;
begin
  if not private.is_engine() then
    return private.refuse('NOT_AN_ENGINE');
  end if;
  perform 1 from public.consultations
    where id = (select consultation_id from public.form_jobs where id = p_job_id) for update;
  select * into v_job from public.form_jobs
    where id = p_job_id and attempt = p_attempt and status = 'processing' and engine_user_id = v_engine
    for update;
  if not found then
    return private.refuse('JOB_NOT_YOURS');
  end if;
  select ft.definition, c.patient_id into v_template, v_patient from public.form_templates ft
    join public.consultations c on c.practitioner_id = ft.practitioner_id
    where c.id = v_job.consultation_id;

  begin
    -- Exactly the template's fields, each once, citing only lines that exist and only pages of
    -- this patient's documents that were read.
    if jsonb_typeof(p_answers) is distinct from 'array'
       or (select array_agg(a ->> 'key' order by a ->> 'key') from jsonb_array_elements(p_answers) a)
          is distinct from (select array_agg(f ->> 'key' order by f ->> 'key')
                            from jsonb_array_elements(v_template -> 'sections') s, jsonb_array_elements(s -> 'fields') f)
       or exists (select 1 from jsonb_array_elements(p_answers) a, jsonb_array_elements_text(coalesce(a -> 'evidence', '[]')) e
                  where not exists (select 1 from public.transcript_segments s
                                    where s.transcript_id = v_job.transcript_id and s.position = e::int))
       or exists (select 1 from jsonb_array_elements(p_answers) a, jsonb_array_elements(coalesce(a -> 'documents', '[]')) q
                  where jsonb_typeof(q -> 'text') is distinct from 'string'
                     or char_length(q ->> 'text') not between 1 and 400
                     or not exists (select 1 from public.patient_documents d
                                    where d.id = (q ->> 'document_id')::uuid and d.patient_id = v_patient
                                      and d.reading = 'read'
                                      and (q ->> 'page')::int between 1 and cardinality(d.page_texts)))
    then
      return private.refuse('VALIDATION', 'answers');
    end if;

    update public.forms set status = 'superseded'
      where consultation_id = v_job.consultation_id and status <> 'superseded';
    insert into public.forms (consultation_id, job_id, transcript_id, template)
      values (v_job.consultation_id, v_job.id, v_job.transcript_id, v_template)
      returning id into v_form_id;
    insert into public.form_answers (form_id, field_key, position, machine_text, evidence, document_quotes)
      select v_form_id, f.field ->> 'key', f.position - 1,
             nullif(btrim(a ->> 'text'), ''),
             coalesce(array(select distinct e::int from jsonb_array_elements_text(a -> 'evidence') e order by 1), '{}'),
             coalesce((select jsonb_agg(jsonb_build_object(
                         'document_id', q ->> 'document_id', 'page', (q ->> 'page')::int, 'text', q ->> 'text'))
                       from jsonb_array_elements(coalesce(a -> 'documents', '[]')) q), '[]'::jsonb)
      from (select field, row_number() over (order by si, fi) as position
            from jsonb_array_elements(v_template -> 'sections') with ordinality s(section, si),
                 jsonb_array_elements(s.section -> 'fields') with ordinality x(field, fi)) f
      join jsonb_array_elements(p_answers) a on a ->> 'key' = f.field ->> 'key';
    select count(*) into v_answered from public.form_answers where form_id = v_form_id and machine_text is not null;
  exception when others then
    return private.refuse('VALIDATION', 'answers');
  end;

  update public.form_jobs set status = 'completed', finished_at = now(), metrics = private.clean_metrics(p_metrics)
    where id = v_job.id;
  update public.consultations set status = 'draft_ready', updated_at = now() where id = v_job.consultation_id;
  perform private.log_event(v_job.consultation_id, 'form.completed', v_engine::text, 'engine',
    'form', v_form_id, 'success',
    jsonb_build_object('job_id', v_job.id, 'attempt', v_job.attempt, 'segment_count', v_answered,
      'from_status', 'extraction_processing', 'to_status', 'draft_ready'));
  return jsonb_build_object('ok', true, 'form_id', v_form_id);
end;
$$;

-- Who may call what.
revoke all on function
  public.patient_identify(text, text, text),
  public.patient_add_document(text, text, text, int),
  public.patient_confirm_document(text, uuid),
  public.patient_remove_document(text, uuid),
  public.set_patient(uuid, text, text),
  public.add_document(uuid, text, text, int),
  public.confirm_document(uuid),
  public.remove_document(uuid),
  public.read_document_again(uuid),
  public.engine_claim_document(),
  public.engine_complete_document(uuid, int, text[]),
  public.engine_fail_document(uuid, int, text)
from public, anon, authenticated, service_role;
grant execute on function
  public.patient_identify(text, text, text),
  public.patient_add_document(text, text, text, int),
  public.patient_confirm_document(text, uuid),
  public.patient_remove_document(text, uuid)
to anon, authenticated;
grant execute on function
  public.set_patient(uuid, text, text),
  public.add_document(uuid, text, text, int),
  public.confirm_document(uuid),
  public.remove_document(uuid),
  public.read_document_again(uuid),
  public.engine_claim_document(),
  public.engine_complete_document(uuid, int, text[]),
  public.engine_fail_document(uuid, int, text)
to authenticated;
revoke all on all functions in schema private from public, anon, service_role;
grant execute on function private.document_access(text, text) to anon, authenticated;
