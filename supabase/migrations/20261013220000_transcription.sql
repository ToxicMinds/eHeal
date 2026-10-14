-- Slice 1.3: transcription jobs, engines, transcripts.
-- Rules are in MASTER_BUILD_SPEC.md sections 8.2, 10.2, 11, 12.4, 12.7 and 15.

-- ---------------------------------------------------------------------------
-- Engines. An engine is an ordinary account that may do three things only:
-- call the engine functions, read the audio of the job it has claimed, and nothing else.
-- ---------------------------------------------------------------------------

create table public.engines (
  user_id uuid primary key references auth.users (id) on delete cascade,
  label text not null,
  last_seen_at timestamptz
);
alter table public.engines enable row level security;
revoke all on public.engines from anon, authenticated, service_role;
grant select on public.engines to service_role;

create function private.is_engine() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.engines where user_id = (select auth.uid()));
$$;

-- Administration only: the owner registers an engine account with the master key.
create function public.register_engine(p_user_id uuid, p_label text) returns void
language sql security definer set search_path = ''
as $$
  insert into public.engines (user_id, label) values (p_user_id, p_label)
  on conflict (user_id) do update set label = excluded.label;
$$;

-- For the status screen: is anything listening? Never says which engine.
create function public.engine_status() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'online', coalesce(max(last_seen_at) > now() - interval '60 seconds', false),
    'last_seen_at', max(last_seen_at))
  from public.engines;
$$;

-- ---------------------------------------------------------------------------
-- Jobs, transcripts and segments
-- ---------------------------------------------------------------------------

create type public.job_status as enum ('queued', 'processing', 'completed', 'failed', 'cancelled');
create type public.job_stage as enum ('validating', 'transcribing_practitioner', 'transcribing_patient', 'merging');

create table public.transcription_jobs (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations (id) on delete restrict,
  status public.job_status not null default 'queued',
  stage public.job_stage,
  attempt int not null default 1,
  requested_by uuid not null references auth.users (id),
  queued_at timestamptz not null default now(),
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  engine_user_id uuid references auth.users (id),
  error_category text,
  failed_speaker public.speaker,
  -- Durations, counts and model names. Never text (section 19).
  metrics jsonb not null default '{}'::jsonb
);
create unique index one_active_job_per_consultation
  on public.transcription_jobs (consultation_id) where status in ('queued', 'processing');
create index transcription_jobs_queue_idx on public.transcription_jobs (queued_at) where status = 'queued';

create type public.transcript_review_status as enum ('unreviewed', 'under_review', 'reviewed', 'superseded');
create type public.transcript_ordering as enum ('exact', 'approximate');

create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations (id) on delete restrict,
  job_id uuid not null unique references public.transcription_jobs (id) on delete restrict,
  schema_version text not null,
  ordering public.transcript_ordering not null,
  low_confidence_threshold numeric not null check (low_confidence_threshold between 0 and 1),
  -- Per-track facts from the engine: hash, measured length, language, model. No text.
  tracks jsonb not null,
  review_status public.transcript_review_status not null default 'unreviewed',
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create unique index one_current_transcript_per_consultation
  on public.transcripts (consultation_id) where review_status <> 'superseded';

-- The only clinical content in the database so far.
create table public.transcript_segments (
  id uuid primary key,
  transcript_id uuid not null references public.transcripts (id) on delete cascade,
  position int not null check (position >= 0),
  speaker public.speaker not null,
  start_seconds numeric not null check (start_seconds >= 0),
  end_seconds numeric not null,
  machine_text text not null,
  reviewed_text text,
  confidence numeric check (confidence is null or confidence between 0 and 1),
  possibly_not_speech boolean not null default false,
  overlap boolean,
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed', 'reviewed')),
  unique (transcript_id, position),
  check (end_seconds >= start_seconds)
);

alter table public.transcription_jobs enable row level security;
alter table public.transcripts enable row level security;
alter table public.transcript_segments enable row level security;
revoke all on public.transcription_jobs, public.transcripts, public.transcript_segments
  from anon, authenticated, service_role;
grant select on public.transcription_jobs, public.transcripts, public.transcript_segments
  to authenticated, service_role;

create policy "Practitioners read the jobs of their own consultations"
  on public.transcription_jobs for select to authenticated
  using (exists (select 1 from public.consultations c
                 where c.id = transcription_jobs.consultation_id and c.practitioner_id = (select auth.uid())));
create policy "Practitioners read the transcripts of their own consultations"
  on public.transcripts for select to authenticated
  using (exists (select 1 from public.consultations c
                 where c.id = transcripts.consultation_id and c.practitioner_id = (select auth.uid())));
create policy "Practitioners read the segments of their own transcripts"
  on public.transcript_segments for select to authenticated
  using (exists (select 1 from public.transcripts t
                 join public.consultations c on c.id = t.consultation_id
                 where t.id = transcript_segments.transcript_id and c.practitioner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Audio rules, tightened. A file may be added only to a consultation that is waiting
-- for audio and has no record for that speaker yet. It may be deleted only once no
-- track record points at it, so the record always goes first. An engine may read
-- only the audio of the job it has claimed.
-- ---------------------------------------------------------------------------

drop policy "Practitioners read their own audio" on storage.objects;
drop policy "Practitioners add audio to their own consultations" on storage.objects;
drop policy "Practitioners delete audio before transcription" on storage.objects;
drop function private.may_touch_audio(text, boolean);

create function private.audio_access(p_object_name text, p_action text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.consultations c
    where c.practitioner_id = (select auth.uid())
      and p_object_name in (c.practitioner_id::text || '/' || c.id::text || '/practitioner',
                            c.practitioner_id::text || '/' || c.id::text || '/patient')
      and case p_action
        when 'read' then true
        when 'add' then c.status = 'ready_for_audio' and c.consent_recorded_at is not null
          and not exists (select 1 from public.audio_tracks t where t.storage_path = p_object_name)
        when 'delete' then not exists (select 1 from public.audio_tracks t where t.storage_path = p_object_name)
        else false
      end
  ) or (
    p_action = 'read' and exists (
      select 1 from public.transcription_jobs j
      join public.audio_tracks t on t.consultation_id = j.consultation_id
      where j.status = 'processing' and j.engine_user_id = (select auth.uid())
        and t.storage_path = p_object_name
    )
  );
$$;
revoke all on function private.audio_access(text, text) from public, anon, authenticated, service_role;
grant execute on function private.audio_access(text, text) to authenticated;

create policy "Owners, and the engine working on the job, read audio"
  on storage.objects for select to authenticated
  using (bucket_id = 'audio' and private.audio_access(name, 'read'));
create policy "Practitioners add audio while a consultation waits for it"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'audio' and private.audio_access(name, 'add'));
create policy "Practitioners delete audio that no track record points at"
  on storage.objects for delete to authenticated
  using (bucket_id = 'audio' and private.audio_access(name, 'delete'));

-- ---------------------------------------------------------------------------
-- Practitioner functions
-- ---------------------------------------------------------------------------

create function public.start_transcription(p_consultation_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_consultation public.consultations;
  v_job_id uuid;
begin
  select * into v_consultation from public.consultations
    where id = p_consultation_id and practitioner_id = v_user for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  if v_consultation.consent_recorded_at is null then
    return private.refuse('CONSENT_MISSING');
  end if;
  if v_consultation.status not in ('audio_imported', 'transcription_failed')
     or (select count(*) from public.audio_tracks where consultation_id = p_consultation_id) <> 2 then
    return private.reject_transition(p_consultation_id, 'start_transcription', v_consultation.status);
  end if;

  update public.audio_tracks set validation = 'pending', validation_error = null
    where consultation_id = p_consultation_id;
  insert into public.transcription_jobs (consultation_id, requested_by)
    values (p_consultation_id, v_user) returning id into v_job_id;
  update public.consultations set status = 'transcription_processing', updated_at = now()
    where id = p_consultation_id;
  perform private.log_event(p_consultation_id, 'transcription.queued', v_user::text, 'practitioner',
    'transcription_job', v_job_id, 'success',
    jsonb_build_object('job_id', v_job_id, 'from_status', v_consultation.status, 'to_status', 'transcription_processing'));
  return jsonb_build_object('ok', true, 'job_id', v_job_id);
end;
$$;

create function public.cancel_transcription(p_consultation_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_consultation public.consultations;
  v_job_id uuid;
begin
  select * into v_consultation from public.consultations
    where id = p_consultation_id and practitioner_id = v_user for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  update public.transcription_jobs set status = 'cancelled', finished_at = now()
    where consultation_id = p_consultation_id and status = 'queued'
    returning id into v_job_id;
  if v_job_id is null then
    return private.reject_transition(p_consultation_id, 'cancel_transcription', v_consultation.status);
  end if;
  update public.consultations set status = 'audio_imported', updated_at = now()
    where id = p_consultation_id;
  perform private.log_event(p_consultation_id, 'transcription.cancelled', v_user::text, 'practitioner',
    'transcription_job', v_job_id, 'success',
    jsonb_build_object('job_id', v_job_id, 'from_status', 'transcription_processing', 'to_status', 'audio_imported'));
  return jsonb_build_object('ok', true);
end;
$$;

-- Withdrawal stops any work and removes the track, transcript and segment records.
-- The caller then deletes the audio files through storage. Audit events stay.
create function public.withdraw_consent(p_consultation_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_consultation public.consultations;
  v_job_id uuid;
  v_track record;
  v_transcript_id uuid;
begin
  select * into v_consultation from public.consultations
    where id = p_consultation_id and practitioner_id = v_user for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  if v_consultation.status not in (
       'consent_pending', 'ready_for_audio', 'audio_imported', 'transcription_processing',
       'transcription_failed', 'transcript_ready', 'transcript_under_review', 'transcript_reviewed',
       'extraction_processing', 'extraction_failed', 'draft_ready', 'under_review') then
    return private.reject_transition(p_consultation_id, 'withdraw_consent', v_consultation.status);
  end if;

  perform private.log_event(p_consultation_id, 'consent.withdrawn', v_user::text, 'practitioner',
    'consultation', p_consultation_id, 'success',
    jsonb_build_object('from_status', v_consultation.status, 'to_status', 'consent_withdrawn'));

  update public.transcription_jobs set status = 'cancelled', finished_at = now()
    where consultation_id = p_consultation_id and status in ('queued', 'processing')
    returning id into v_job_id;
  if v_job_id is not null then
    perform private.log_event(p_consultation_id, 'transcription.cancelled', v_user::text, 'practitioner',
      'transcription_job', v_job_id, 'success', jsonb_build_object('job_id', v_job_id));
  end if;

  for v_transcript_id in
    delete from public.transcripts where consultation_id = p_consultation_id returning id
  loop
    perform private.log_event(p_consultation_id, 'transcript.deleted', v_user::text, 'practitioner',
      'transcript', v_transcript_id, 'success');
  end loop;
  for v_track in
    delete from public.audio_tracks where consultation_id = p_consultation_id returning id, speaker
  loop
    perform private.log_event(p_consultation_id, 'audio.deleted', v_user::text, 'practitioner',
      'audio_track', v_track.id, 'success', jsonb_build_object('speaker', v_track.speaker));
  end loop;

  update public.consultations
    set status = 'consent_withdrawn', consent_withdrawn_at = now(), consent_withdrawn_by = v_user,
        updated_at = now()
    where id = p_consultation_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Engine functions (section 12.7). Each first checks that the caller is an engine.
-- ---------------------------------------------------------------------------

create function private.fail_job(
  p_job public.transcription_jobs, p_error_category text, p_speaker public.speaker,
  p_metrics jsonb, p_actor_id text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_track_id uuid;
begin
  update public.transcription_jobs
    set status = 'failed', finished_at = now(), error_category = p_error_category,
        failed_speaker = p_speaker, metrics = p_metrics
    where id = p_job.id;
  update public.consultations set status = 'transcription_failed', updated_at = now()
    where id = p_job.consultation_id;
  if p_speaker is not null and p_error_category like 'AUDIO\_%' then
    update public.audio_tracks set validation = 'invalid', validation_error = p_error_category
      where consultation_id = p_job.consultation_id and speaker = p_speaker
      returning id into v_track_id;
    perform private.log_event(p_job.consultation_id, 'audio.validation_failed', p_actor_id, 'engine',
      'audio_track', v_track_id, 'failure',
      jsonb_build_object('speaker', p_speaker, 'error_category', p_error_category));
  end if;
  perform private.log_event(p_job.consultation_id, 'transcription.failed', p_actor_id, 'engine',
    'transcription_job', p_job.id, 'failure',
    jsonb_build_object('job_id', p_job.id, 'attempt', p_job.attempt, 'error_category', p_error_category,
      'from_status', 'transcription_processing', 'to_status', 'transcription_failed'));
end;
$$;

create function public.engine_claim_job() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_engine uuid := (select auth.uid());
  v_job public.transcription_jobs;
  v_consultation public.consultations;
begin
  if not private.is_engine() then
    return private.refuse('NOT_AN_ENGINE');
  end if;
  update public.engines set last_seen_at = now() where user_id = v_engine;

  -- Work whose engine went silent is offered again, at most three times.
  for v_job in
    select * from public.transcription_jobs
    where status = 'processing' and heartbeat_at < now() - interval '2 minutes'
    for update skip locked
  loop
    if v_job.attempt >= 3 then
      perform private.fail_job(v_job, 'ENGINE_STALLED', null, v_job.metrics, v_engine::text);
    else
      update public.transcription_jobs
        set status = 'queued', attempt = attempt + 1, stage = null, claimed_at = null,
            heartbeat_at = null, engine_user_id = null
        where id = v_job.id;
      perform private.log_event(v_job.consultation_id, 'transcription.requeued', v_engine::text, 'engine',
        'transcription_job', v_job.id, 'success',
        jsonb_build_object('job_id', v_job.id, 'attempt', v_job.attempt + 1));
    end if;
  end loop;

  select * into v_job from public.transcription_jobs
    where status = 'queued' order by queued_at limit 1 for update skip locked;
  if not found then
    return jsonb_build_object('ok', true, 'job', null);
  end if;

  select * into v_consultation from public.consultations where id = v_job.consultation_id for update;
  update public.transcription_jobs
    set status = 'processing', stage = 'validating', claimed_at = now(), heartbeat_at = now(),
        engine_user_id = v_engine
    where id = v_job.id returning * into v_job;
  if v_consultation.consent_recorded_at is null then
    perform private.fail_job(v_job, 'CONSENT_MISSING', null, '{}'::jsonb, v_engine::text);
    return jsonb_build_object('ok', true, 'job', null);
  end if;

  perform private.log_event(v_job.consultation_id, 'transcription.started', v_engine::text, 'engine',
    'transcription_job', v_job.id, 'success',
    jsonb_build_object('job_id', v_job.id, 'attempt', v_job.attempt));
  return jsonb_build_object('ok', true, 'job', jsonb_build_object(
    'job_id', v_job.id,
    'attempt', v_job.attempt,
    'consultation_id', v_consultation.id,
    'language', v_consultation.language,
    'recorded_together', v_consultation.recorded_together,
    'tracks', (
      select jsonb_agg(jsonb_build_object(
        'speaker', t.speaker, 'storage_path', t.storage_path, 'format', t.format,
        'sha256', t.sha256, 'size_bytes', t.size_bytes, 'offset_seconds', t.offset_seconds)
        order by t.speaker)
      from public.audio_tracks t where t.consultation_id = v_consultation.id)));
end;
$$;

-- The engine says where it is; the answer says whether to go on.
create function public.engine_heartbeat(
  p_job_id uuid, p_stage public.job_stage, p_audio_seconds numeric default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_engine uuid := (select auth.uid());
  v_job public.transcription_jobs;
begin
  if not private.is_engine() then
    return private.refuse('NOT_AN_ENGINE');
  end if;
  update public.engines set last_seen_at = now() where user_id = v_engine;
  select * into v_job from public.transcription_jobs
    where id = p_job_id and status = 'processing' and engine_user_id = v_engine for update;
  if not found then
    -- Cancelled, taken back, or never this engine's: stop.
    return jsonb_build_object('ok', true, 'continue', false);
  end if;
  -- Three times the combined length of the tracks, plus five minutes (section 12.4).
  if now() > v_job.claimed_at + make_interval(secs => 3 * coalesce(p_audio_seconds, 14400) + 300) then
    perform private.fail_job(v_job, 'TRANSCRIPTION_TIMEOUT', null, v_job.metrics, v_engine::text);
    return jsonb_build_object('ok', true, 'continue', false);
  end if;
  update public.transcription_jobs set heartbeat_at = now(), stage = p_stage where id = p_job_id;
  return jsonb_build_object('ok', true, 'continue', true);
end;
$$;

create function public.engine_fail_job(
  p_job_id uuid, p_error_category text, p_speaker public.speaker default null,
  p_metrics jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_engine uuid := (select auth.uid());
  v_job public.transcription_jobs;
begin
  if not private.is_engine() then
    return private.refuse('NOT_AN_ENGINE');
  end if;
  if p_error_category is null or p_error_category <> all (array[
       'AUDIO_FILE_MISSING', 'AUDIO_FORMAT_UNSUPPORTED', 'AUDIO_CORRUPT', 'AUDIO_TOO_LARGE',
       'AUDIO_DURATION_INVALID', 'TRANSCRIPTION_MODEL_UNAVAILABLE', 'TRANSCRIPTION_FAILED',
       'TRANSCRIPT_MERGE_FAILED', 'STORAGE_UNAVAILABLE']) then
    return private.refuse('VALIDATION', 'error_category');
  end if;
  select * into v_job from public.transcription_jobs
    where id = p_job_id and status = 'processing' and engine_user_id = v_engine for update;
  if not found then
    return private.refuse('JOB_NOT_YOURS');
  end if;
  perform private.fail_job(v_job, p_error_category, p_speaker, private.clean_metrics(p_metrics), v_engine::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- Keeps only the metric names of section 19, and only numbers, booleans and short names.
create function private.clean_metrics(p_metrics jsonb) returns jsonb
language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(coalesce(p_metrics, '{}'::jsonb))
  where key = any (array[
      'audio_duration_seconds', 'transcription_duration_seconds', 'transcription_model_name',
      'transcription_model_size', 'device_type', 'compute_type', 'transcript_segment_count',
      'low_confidence_segment_count', 'overlap_segment_count'])
    and (jsonb_typeof(value) in ('number', 'boolean')
         or (jsonb_typeof(value) = 'string' and char_length(value #>> '{}') <= 40));
$$;

create function public.engine_complete_job(p_job_id uuid, p_transcript jsonb, p_metrics jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_engine uuid := (select auth.uid());
  v_job public.transcription_jobs;
  v_transcript_id uuid;
  v_segments int;
  v_track jsonb;
begin
  if not private.is_engine() then
    return private.refuse('NOT_AN_ENGINE');
  end if;
  select * into v_job from public.transcription_jobs
    where id = p_job_id and status = 'processing' and engine_user_id = v_engine for update;
  if not found then
    -- A late result from an attempt that was cancelled or taken back is refused.
    return private.refuse('JOB_NOT_YOURS');
  end if;
  if p_transcript ->> 'schema_version' <> '2.0.0'
     or (p_transcript ->> 'consultation_id')::uuid <> v_job.consultation_id
     or jsonb_typeof(p_transcript -> 'segments') <> 'array'
     or jsonb_typeof(p_transcript -> 'tracks') <> 'array'
     or jsonb_array_length(p_transcript -> 'tracks') <> 2 then
    return private.refuse('VALIDATION', 'transcript');
  end if;

  update public.transcripts set review_status = 'superseded'
    where consultation_id = v_job.consultation_id and review_status <> 'superseded';
  insert into public.transcripts (consultation_id, job_id, schema_version, ordering, low_confidence_threshold, tracks)
    values (v_job.consultation_id, v_job.id, '2.0.0',
            (p_transcript ->> 'ordering')::public.transcript_ordering,
            (p_transcript ->> 'low_confidence_threshold')::numeric,
            p_transcript -> 'tracks')
    returning id into v_transcript_id;
  insert into public.transcript_segments
      (id, transcript_id, position, speaker, start_seconds, end_seconds, machine_text, confidence,
       possibly_not_speech, overlap)
    select s.segment_id, v_transcript_id, s.position, s.speaker, s.start_seconds, s.end_seconds,
           s.machine_text, s.confidence, coalesce(s.possibly_not_speech, false), s.overlap
    from jsonb_to_recordset(p_transcript -> 'segments') as s(
      segment_id uuid, position int, speaker public.speaker, start_seconds numeric,
      end_seconds numeric, machine_text text, confidence numeric, possibly_not_speech boolean,
      overlap boolean);
  get diagnostics v_segments = row_count;

  -- What the engine measured replaces what the browser estimated.
  for v_track in select * from jsonb_array_elements(p_transcript -> 'tracks') loop
    update public.audio_tracks
      set validation = 'valid', validation_error = null,
          duration_seconds = (v_track ->> 'duration_seconds')::numeric
      where consultation_id = v_job.consultation_id and speaker = (v_track ->> 'speaker')::public.speaker;
  end loop;

  update public.transcription_jobs
    set status = 'completed', finished_at = now(), stage = 'merging', metrics = private.clean_metrics(p_metrics)
    where id = v_job.id;
  update public.consultations set status = 'transcript_ready', updated_at = now()
    where id = v_job.consultation_id;
  perform private.log_event(v_job.consultation_id, 'transcription.completed', v_engine::text, 'engine',
    'transcript', v_transcript_id, 'success',
    jsonb_build_object('job_id', v_job.id, 'attempt', v_job.attempt, 'segment_count', v_segments,
      'from_status', 'transcription_processing', 'to_status', 'transcript_ready'));
  return jsonb_build_object('ok', true, 'transcript_id', v_transcript_id);
end;
$$;

-- Who may call what.
revoke all on function
  public.register_engine(uuid, text),
  public.engine_status(),
  public.start_transcription(uuid),
  public.cancel_transcription(uuid),
  public.withdraw_consent(uuid),
  public.engine_claim_job(),
  public.engine_heartbeat(uuid, public.job_stage, numeric),
  public.engine_fail_job(uuid, text, public.speaker, jsonb),
  public.engine_complete_job(uuid, jsonb, jsonb)
from public, anon, authenticated, service_role;
revoke all on all functions in schema private from public, anon, service_role;

grant execute on function public.register_engine(uuid, text) to service_role;
grant execute on function
  public.engine_status(),
  public.start_transcription(uuid),
  public.cancel_transcription(uuid),
  public.withdraw_consent(uuid),
  public.engine_claim_job(),
  public.engine_heartbeat(uuid, public.job_stage, numeric),
  public.engine_fail_job(uuid, text, public.speaker, jsonb),
  public.engine_complete_job(uuid, jsonb, jsonb)
to authenticated;
