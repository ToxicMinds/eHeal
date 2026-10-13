-- Slice 1.2: the audit log, creating a consultation, consent, and the two audio tracks.
-- Rules are in MASTER_BUILD_SPEC.md sections 8.1, 10.2, 10.4, 11 and 15.

-- Helpers that must never be callable through the API live here.
create schema private;
revoke all on schema private from public, anon, authenticated, service_role;

-- From now on the engine credential may read tables but changes state only
-- through functions, like everyone else.
revoke insert, update, delete, truncate on public.consultations from service_role;

-- ---------------------------------------------------------------------------
-- Audit log: append-only, hash-chained per consultation, never clinical content.
-- ---------------------------------------------------------------------------

create table public.audit_events (
  seq bigint generated always as identity primary key,
  event_id uuid not null unique,
  event_type text not null,
  timestamp_utc timestamptz not null,
  consultation_id uuid not null references public.consultations (id) on delete restrict,
  actor_id text not null,
  actor_role text not null check (actor_role in ('practitioner', 'engine')),
  resource_type text not null,
  resource_id uuid,
  result text not null check (result in ('success', 'failure', 'rejected')),
  metadata_without_clinical_content jsonb not null default '{}'::jsonb,
  previous_event_hash text,
  event_hash text not null
);

create index audit_events_consultation_idx on public.audit_events (consultation_id, seq);

alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon, authenticated, service_role;
grant select on public.audit_events to authenticated, service_role;

create policy "Practitioners read the audit events of their own consultations"
  on public.audit_events for select to authenticated
  using (exists (
    select 1 from public.consultations c
    where c.id = audit_events.consultation_id and c.practitioner_id = (select auth.uid())
  ));

create function private.event_hash(
  p_previous text, p_event_id uuid, p_event_type text, p_timestamp timestamptz,
  p_consultation_id uuid, p_actor_id text, p_actor_role text, p_resource_type text,
  p_resource_id uuid, p_result text, p_metadata jsonb
) returns text
language sql immutable set search_path = ''
as $$
  select encode(sha256(convert_to(concat_ws('|',
    coalesce(p_previous, ''), p_event_id, p_event_type,
    to_char(p_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    p_consultation_id, p_actor_id, p_actor_role, p_resource_type,
    coalesce(p_resource_id::text, ''), p_result, p_metadata::text
  ), 'UTF8')), 'hex');
$$;

-- The only way an audit event is ever written.
create function private.log_event(
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
      'segment_count', 'model'
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

-- True when every event still matches its hash and links to the one before it.
-- This shows accidental damage and careless edits. It is not tamper-proof (section 10.4).
create function public.verify_audit_chain(p_consultation_id uuid) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_event public.audit_events;
  v_previous text := null;
begin
  if (select auth.role()) <> 'service_role' and not exists (
    select 1 from public.consultations
    where id = p_consultation_id and practitioner_id = (select auth.uid())
  ) then
    return null;
  end if;
  for v_event in
    select * from public.audit_events where consultation_id = p_consultation_id order by seq
  loop
    if v_event.previous_event_hash is distinct from v_previous
       or v_event.event_hash <> private.event_hash(
            v_event.previous_event_hash, v_event.event_id, v_event.event_type,
            v_event.timestamp_utc, v_event.consultation_id, v_event.actor_id,
            v_event.actor_role, v_event.resource_type, v_event.resource_id, v_event.result,
            v_event.metadata_without_clinical_content) then
      return false;
    end if;
    v_previous := v_event.event_hash;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Results. Functions return {"ok": true, ...} or {"ok": false, "error_category": ...}
-- instead of raising, because a refusal must still leave its audit event behind.
-- ---------------------------------------------------------------------------

create function private.refuse(p_error_category text, p_field text default null) returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object('ok', false, 'error_category', p_error_category, 'field', p_field));
$$;

-- A transition the table in section 10.2 does not allow.
create function private.reject_transition(
  p_consultation_id uuid, p_attempted text, p_from public.consultation_status
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.log_event(
    p_consultation_id, 'state.transition_rejected', (select auth.uid())::text, 'practitioner',
    'consultation', p_consultation_id, 'rejected',
    jsonb_build_object('attempted', p_attempted, 'from_status', p_from));
  return private.refuse('INVALID_STATE_TRANSITION');
end;
$$;

-- ---------------------------------------------------------------------------
-- Consultations and consent
-- ---------------------------------------------------------------------------

alter table public.consultations
  add column consent_withdrawn_by uuid references auth.users (id),
  -- The practitioner's declaration that both files start at the same moment.
  -- Without it the order of turns is a best guess (section 12.6).
  add column recorded_together boolean not null default false;

create function public.create_consultation(
  p_synthetic_patient_ref text,
  p_scheduled_at timestamptz,
  p_language public.consultation_language,
  p_consent_recorded boolean,
  p_scenario_notes text default ''
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
  if p_synthetic_patient_ref is null or p_synthetic_patient_ref !~ '^SYN-[0-9]{1,8}$' then
    return private.refuse('VALIDATION', 'synthetic_patient_ref');
  end if;
  if p_scheduled_at is null then
    return private.refuse('VALIDATION', 'scheduled_at');
  end if;
  if char_length(coalesce(p_scenario_notes, '')) > 500 then
    return private.refuse('VALIDATION', 'scenario_notes');
  end if;

  insert into public.consultations (
    practitioner_id, synthetic_patient_ref, scheduled_at, language, status,
    consent_recorded_at, consent_recorded_by, scenario_notes
  ) values (
    v_user, p_synthetic_patient_ref, p_scheduled_at, p_language, v_status,
    case when p_consent_recorded then now() end,
    case when p_consent_recorded then v_user end,
    coalesce(p_scenario_notes, '')
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

create function public.record_consent(p_consultation_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_consultation public.consultations;
begin
  select * into v_consultation from public.consultations
    where id = p_consultation_id and practitioner_id = v_user for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  if v_consultation.status <> 'consent_pending' then
    return private.reject_transition(p_consultation_id, 'record_consent', v_consultation.status);
  end if;

  update public.consultations
    set status = 'ready_for_audio', consent_recorded_at = now(), consent_recorded_by = v_user,
        updated_at = now()
    where id = p_consultation_id;
  perform private.log_event(p_consultation_id, 'consent.recorded', v_user::text, 'practitioner',
    'consultation', p_consultation_id, 'success',
    jsonb_build_object('from_status', 'consent_pending', 'to_status', 'ready_for_audio'));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Audio tracks: one per speaker. The file lives in the private `audio` bucket at
-- <practitioner id>/<consultation id>/<speaker>, a path built only from identifiers.
-- ---------------------------------------------------------------------------

create type public.speaker as enum ('practitioner', 'patient');
create type public.track_validation as enum ('pending', 'valid', 'invalid');

create table public.audio_tracks (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations (id) on delete restrict,
  speaker public.speaker not null,
  storage_path text not null,
  format text not null check (format in ('wav', 'mp3', 'm4a', 'mp4', 'flac', 'ogg', 'webm')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- As measured by the browser, for display. The engine measures it again.
  duration_seconds numeric check (duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 7200)),
  -- Applied by the engine before merging (section 12.6).
  offset_seconds numeric not null default 0,
  validation public.track_validation not null default 'pending',
  validation_error text,
  created_at timestamptz not null default now(),
  unique (consultation_id, speaker)
);

alter table public.audio_tracks enable row level security;
revoke all on public.audio_tracks from anon, authenticated, service_role;
grant select on public.audio_tracks to authenticated, service_role;

create policy "Practitioners read the tracks of their own consultations"
  on public.audio_tracks for select to authenticated
  using (exists (
    select 1 from public.consultations c
    where c.id = audio_tracks.consultation_id and c.practitioner_id = (select auth.uid())
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', false, 52428800,
  array['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/flac', 'audio/ogg', 'audio/webm']);

-- A practitioner may put, read or delete a file only at their own
-- <practitioner id>/<consultation id>/<speaker> path, and may change it only while the
-- consultation is still waiting for audio. Once transcription starts the audio is fixed.
create function private.may_touch_audio(p_object_name text, p_for_write boolean) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.consultations c
    where c.practitioner_id = (select auth.uid())
      and p_object_name = c.practitioner_id::text || '/' || c.id::text || '/practitioner'
          or (c.practitioner_id = (select auth.uid())
              and p_object_name = c.practitioner_id::text || '/' || c.id::text || '/patient')
  ) and (
    not p_for_write or exists (
      select 1 from public.consultations c
      where c.practitioner_id = (select auth.uid())
        and c.id::text = split_part(p_object_name, '/', 2)
        and c.status in ('ready_for_audio', 'audio_imported', 'transcription_failed')
    )
  );
$$;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function private.may_touch_audio(text, boolean) to authenticated;

create policy "Practitioners read their own audio"
  on storage.objects for select to authenticated
  using (bucket_id = 'audio' and private.may_touch_audio(name, false));
create policy "Practitioners add audio to their own consultations"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'audio' and private.may_touch_audio(name, true));
create policy "Practitioners delete audio before transcription"
  on storage.objects for delete to authenticated
  using (bucket_id = 'audio' and private.may_touch_audio(name, true));

create function public.register_audio_track(
  p_consultation_id uuid,
  p_speaker public.speaker,
  p_format text,
  p_size_bytes bigint,
  p_sha256 text,
  p_duration_seconds numeric default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_consultation public.consultations;
  v_path text;
  v_stored_size bigint;
  v_track_id uuid;
  v_tracks int;
begin
  select * into v_consultation from public.consultations
    where id = p_consultation_id and practitioner_id = v_user for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  if v_consultation.consent_recorded_at is null then
    return private.refuse('CONSENT_MISSING');
  end if;
  if v_consultation.status <> 'ready_for_audio'
     or exists (select 1 from public.audio_tracks where consultation_id = p_consultation_id and speaker = p_speaker) then
    return private.reject_transition(p_consultation_id, 'register_audio_track', v_consultation.status);
  end if;
  if p_format is null or p_format not in ('wav', 'mp3', 'm4a', 'mp4', 'flac', 'ogg', 'webm') then
    return private.refuse('AUDIO_FORMAT_UNSUPPORTED');
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 then
    return private.refuse('AUDIO_FILE_MISSING');
  end if;
  if p_size_bytes > 52428800 then
    return private.refuse('AUDIO_TOO_LARGE');
  end if;
  if p_duration_seconds is not null and (p_duration_seconds <= 0 or p_duration_seconds > 7200) then
    return private.refuse('AUDIO_DURATION_INVALID');
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    return private.refuse('VALIDATION', 'sha256');
  end if;

  -- The file must already be in storage, at the one path this track may use.
  v_path := v_user::text || '/' || p_consultation_id::text || '/' || p_speaker::text;
  select (metadata ->> 'size')::bigint into v_stored_size
    from storage.objects where bucket_id = 'audio' and name = v_path;
  if not found then
    return private.refuse('AUDIO_FILE_MISSING');
  end if;
  if v_stored_size is distinct from p_size_bytes then
    return private.refuse('AUDIO_CORRUPT');
  end if;

  insert into public.audio_tracks (consultation_id, speaker, storage_path, format, size_bytes, sha256, duration_seconds)
    values (p_consultation_id, p_speaker, v_path, p_format, p_size_bytes, p_sha256, p_duration_seconds)
    returning id into v_track_id;
  perform private.log_event(p_consultation_id, 'audio.imported', v_user::text, 'practitioner',
    'audio_track', v_track_id, 'success',
    jsonb_strip_nulls(jsonb_build_object('speaker', p_speaker, 'format', p_format,
      'size_bytes', p_size_bytes, 'duration_seconds', p_duration_seconds)));

  select count(*) into v_tracks from public.audio_tracks where consultation_id = p_consultation_id;
  if v_tracks = 2 then
    update public.consultations set status = 'audio_imported', updated_at = now()
      where id = p_consultation_id;
  end if;
  return jsonb_build_object('ok', true, 'track_id', v_track_id);
end;
$$;

-- Removes the track's record. The caller then deletes the file itself through storage.
create function public.remove_audio_track(p_consultation_id uuid, p_speaker public.speaker) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_consultation public.consultations;
  v_track_id uuid;
begin
  select * into v_consultation from public.consultations
    where id = p_consultation_id and practitioner_id = v_user for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  if v_consultation.status not in ('ready_for_audio', 'audio_imported', 'transcription_failed') then
    return private.reject_transition(p_consultation_id, 'remove_audio_track', v_consultation.status);
  end if;
  delete from public.audio_tracks
    where consultation_id = p_consultation_id and speaker = p_speaker
    returning id into v_track_id;
  if v_track_id is null then
    return private.refuse('NOT_FOUND');
  end if;

  update public.consultations set status = 'ready_for_audio', updated_at = now()
    where id = p_consultation_id;
  perform private.log_event(p_consultation_id, 'audio.removed', v_user::text, 'practitioner',
    'audio_track', v_track_id, 'success',
    jsonb_build_object('speaker', p_speaker, 'from_status', v_consultation.status, 'to_status', 'ready_for_audio'));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.declare_recorded_together(p_consultation_id uuid, p_recorded_together boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_consultation public.consultations;
begin
  select * into v_consultation from public.consultations
    where id = p_consultation_id and practitioner_id = v_user for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  if v_consultation.status not in ('ready_for_audio', 'audio_imported', 'transcription_failed') then
    return private.reject_transition(p_consultation_id, 'declare_recorded_together', v_consultation.status);
  end if;
  update public.consultations
    set recorded_together = coalesce(p_recorded_together, false), updated_at = now()
    where id = p_consultation_id;
  perform private.log_event(p_consultation_id, 'audio.synchronisation_declared', v_user::text,
    'practitioner', 'consultation', p_consultation_id, 'success');
  return jsonb_build_object('ok', true);
end;
$$;

-- Who may call what. Postgres lets everyone execute a new function unless told otherwise.
revoke all on function
  public.verify_audit_chain(uuid),
  public.create_consultation(text, timestamptz, public.consultation_language, boolean, text),
  public.record_consent(uuid),
  public.register_audio_track(uuid, public.speaker, text, bigint, text, numeric),
  public.remove_audio_track(uuid, public.speaker),
  public.declare_recorded_together(uuid, boolean)
from public, anon, authenticated, service_role;

grant execute on function
  public.create_consultation(text, timestamptz, public.consultation_language, boolean, text),
  public.record_consent(uuid),
  public.register_audio_track(uuid, public.speaker, text, bigint, text, numeric),
  public.remove_audio_track(uuid, public.speaker),
  public.declare_recorded_together(uuid, boolean)
to authenticated;
grant execute on function public.verify_audit_chain(uuid) to authenticated, service_role;
