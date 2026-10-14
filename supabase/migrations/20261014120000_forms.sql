-- Slice 1.5: the practitioner's form, filled in from the transcript by a model that runs on
-- the engine's own computer (decision 0005). The practitioner checks every answer and approves.

-- ---------------------------------------------------------------------------
-- Templates: one per practitioner for now. A field is either taken from what was said
-- ('extract') or an assessment the model suggests ('suggest'), shown as a suggestion.
-- ---------------------------------------------------------------------------

create function private.valid_template(p jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
    and jsonb_typeof(p -> 'title') = 'string' and char_length(p ->> 'title') between 1 and 120
    and jsonb_typeof(p -> 'sections') = 'array' and jsonb_array_length(p -> 'sections') between 1 and 20
    and not exists (
      select 1 from jsonb_array_elements(p -> 'sections') s
      where jsonb_typeof(s -> 'title') is distinct from 'string'
         or char_length(s ->> 'title') not between 1 and 120
         or jsonb_typeof(s -> 'fields') is distinct from 'array'
         or jsonb_array_length(s -> 'fields') not between 1 and 40)
    and not exists (
      select 1 from jsonb_array_elements(p -> 'sections') s, jsonb_array_elements(s -> 'fields') f
      where coalesce(f ->> 'key', '') !~ '^[a-z][a-z0-9_]{0,39}$'
         or char_length(coalesce(f ->> 'label', '')) not between 1 and 120
         or coalesce(f ->> 'mode', 'extract') not in ('extract', 'suggest')
         or char_length(coalesce(f ->> 'hint', '')) > 300)
    and (select count(*) = count(distinct f ->> 'key')
         from jsonb_array_elements(p -> 'sections') s, jsonb_array_elements(s -> 'fields') f);
$$;

create table public.form_templates (
  practitioner_id uuid primary key references auth.users (id) on delete cascade,
  definition jsonb not null check (private.valid_template(definition)),
  updated_at timestamptz not null default now()
);
alter table public.form_templates enable row level security;
revoke all on public.form_templates from anon, authenticated, service_role;
grant select on public.form_templates to authenticated, service_role;
create policy "Practitioners read their own form template"
  on public.form_templates for select to authenticated
  using (practitioner_id = (select auth.uid()));

-- A practitioner sets their own template; later forms use the new one, earlier forms keep theirs.
create function public.set_form_template(p_definition jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    return private.refuse('NOT_SIGNED_IN');
  end if;
  if private.is_engine() then
    return private.refuse('NOT_A_PRACTITIONER');
  end if;
  if not coalesce(private.valid_template(p_definition), false) then
    return private.refuse('VALIDATION', 'definition');
  end if;
  insert into public.form_templates (practitioner_id, definition) values (v_user, p_definition)
  on conflict (practitioner_id) do update set definition = excluded.definition, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Jobs, forms and answers
-- ---------------------------------------------------------------------------

create table public.form_jobs (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations (id) on delete restrict,
  transcript_id uuid not null references public.transcripts (id) on delete cascade,
  status public.job_status not null default 'queued',
  attempt int not null default 1,
  queued_at timestamptz not null default now(),
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  engine_user_id uuid references auth.users (id) on delete set null,
  error_category text,
  metrics jsonb not null default '{}'::jsonb
);
create unique index one_active_form_job_per_consultation
  on public.form_jobs (consultation_id) where status in ('queued', 'processing');

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations (id) on delete restrict,
  job_id uuid not null unique references public.form_jobs (id) on delete cascade,
  transcript_id uuid not null references public.transcripts (id) on delete cascade,
  -- The template as it was when the form was filled.
  template jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create unique index one_current_form_per_consultation
  on public.forms (consultation_id) where status <> 'superseded';

create table public.form_answers (
  form_id uuid not null references public.forms (id) on delete cascade,
  field_key text not null,
  position int not null,
  -- What the model wrote; null when the topic was not discussed.
  machine_text text check (char_length(machine_text) <= 2000),
  -- Positions of the transcript lines the answer rests on.
  evidence int[] not null default '{}',
  -- The practitioner's own wording, when they edit or fill in a field.
  practitioner_text text check (char_length(practitioner_text) <= 4000),
  review text not null default 'unreviewed' check (review in ('unreviewed', 'accepted', 'edited', 'rejected')),
  primary key (form_id, field_key),
  unique (form_id, position)
);

alter table public.form_jobs enable row level security;
alter table public.forms enable row level security;
alter table public.form_answers enable row level security;
revoke all on public.form_jobs, public.forms, public.form_answers from anon, authenticated, service_role;
grant select on public.form_jobs, public.forms, public.form_answers to authenticated, service_role;

create policy "Practitioners read the form jobs of their own consultations"
  on public.form_jobs for select to authenticated
  using (exists (select 1 from public.consultations c
                 where c.id = form_jobs.consultation_id and c.practitioner_id = (select auth.uid())));
create policy "Practitioners read the forms of their own consultations"
  on public.forms for select to authenticated
  using (exists (select 1 from public.consultations c
                 where c.id = forms.consultation_id and c.practitioner_id = (select auth.uid())));
create policy "Practitioners read the answers of their own forms"
  on public.form_answers for select to authenticated
  using (exists (select 1 from public.forms f join public.consultations c on c.id = f.consultation_id
                 where f.id = form_answers.form_id and c.practitioner_id = (select auth.uid())));

-- Queues a form for the current transcript, if the practitioner has a template.
-- The caller holds the consultation's row lock.
create function private.queue_form(p_consultation_id uuid, p_actor uuid, p_from public.consultation_status)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_transcript uuid;
  v_job uuid;
begin
  select t.id into v_transcript from public.transcripts t
    join public.consultations c on c.id = t.consultation_id
    where t.consultation_id = p_consultation_id and t.review_status <> 'superseded'
      and exists (select 1 from public.form_templates ft where ft.practitioner_id = c.practitioner_id);
  if v_transcript is null then
    return null;
  end if;
  insert into public.form_jobs (consultation_id, transcript_id) values (p_consultation_id, v_transcript)
    returning id into v_job;
  update public.consultations set status = 'extraction_processing', updated_at = now()
    where id = p_consultation_id;
  perform private.log_event(p_consultation_id, 'form.queued', p_actor::text, 'practitioner',
    'form_job', v_job, 'success',
    jsonb_build_object('job_id', v_job, 'from_status', p_from, 'to_status', 'extraction_processing'));
  return v_job;
end;
$$;

-- A finished transcript goes straight on to the form: the practitioner presses nothing.
create function private.form_after_transcript() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.queue_form(new.id, new.practitioner_id, 'transcript_ready');
  return null;
end;
$$;
create trigger form_after_transcript
  after update of status on public.consultations
  for each row when (new.status = 'transcript_ready' and old.status is distinct from 'transcript_ready')
  execute function private.form_after_transcript();

-- "Try again" after a failure, or a form for a transcript that finished before the template existed.
create function public.start_form(p_consultation_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_consultation public.consultations;
  v_job uuid;
begin
  select * into v_consultation from public.consultations
    where id = p_consultation_id and practitioner_id = v_user for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  if v_consultation.status not in ('transcript_ready', 'transcript_under_review', 'transcript_reviewed', 'extraction_failed') then
    return private.reject_transition(p_consultation_id, 'start_form', v_consultation.status);
  end if;
  v_job := private.queue_form(p_consultation_id, v_user, v_consultation.status);
  if v_job is null then
    return private.refuse('FORM_TEMPLATE_MISSING');
  end if;
  return jsonb_build_object('ok', true, 'job_id', v_job);
end;
$$;

-- The practitioner's decision on one answer. 'edit' also fills in a field the model left empty.
create function public.review_form_answer(
  p_form_id uuid, p_field_key text, p_decision text, p_text text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_form public.forms;
  v_status public.consultation_status;
  v_answer public.form_answers;
begin
  select f.* into v_form from public.forms f
    join public.consultations c on c.id = f.consultation_id
    where f.id = p_form_id and c.practitioner_id = v_user;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  select status into v_status from public.consultations where id = v_form.consultation_id for update;
  if v_form.status <> 'draft' or v_status not in ('draft_ready', 'under_review') then
    return private.reject_transition(v_form.consultation_id, 'review_form_answer', v_status);
  end if;
  select * into v_answer from public.form_answers where form_id = p_form_id and field_key = p_field_key for update;
  if not found then
    return private.refuse('NOT_FOUND', 'field_key');
  end if;
  if p_decision = 'edit' then
    if p_text is null or char_length(btrim(p_text)) not between 1 and 4000 then
      return private.refuse('VALIDATION', 'text');
    end if;
    update public.form_answers set review = 'edited', practitioner_text = btrim(p_text)
      where form_id = p_form_id and field_key = p_field_key;
  elsif p_decision in ('accept', 'reject') then
    if p_decision = 'accept' and v_answer.machine_text is null then
      return private.refuse('VALIDATION', 'decision');
    end if;
    update public.form_answers
      set review = case p_decision when 'accept' then 'accepted' else 'rejected' end, practitioner_text = null
      where form_id = p_form_id and field_key = p_field_key;
  elsif p_decision = 'undo' then
    update public.form_answers set review = 'unreviewed', practitioner_text = null
      where form_id = p_form_id and field_key = p_field_key;
  else
    return private.refuse('VALIDATION', 'decision');
  end if;
  if v_status = 'draft_ready' then
    update public.consultations set status = 'under_review', updated_at = now() where id = v_form.consultation_id;
    perform private.log_event(v_form.consultation_id, 'form.review_started', v_user::text, 'practitioner',
      'form', p_form_id, 'success', jsonb_build_object('from_status', 'draft_ready', 'to_status', 'under_review'));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Approval needs a decision on every answer the model gave.
create function public.approve_form(p_form_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_form public.forms;
  v_status public.consultation_status;
begin
  select f.* into v_form from public.forms f
    join public.consultations c on c.id = f.consultation_id
    where f.id = p_form_id and c.practitioner_id = v_user;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  select status into v_status from public.consultations where id = v_form.consultation_id for update;
  if v_form.status <> 'draft' or v_status not in ('draft_ready', 'under_review') then
    return private.reject_transition(v_form.consultation_id, 'approve_form', v_status);
  end if;
  if exists (select 1 from public.form_answers
             where form_id = p_form_id and review = 'unreviewed' and machine_text is not null) then
    return private.refuse('FORM_NOT_REVIEWED');
  end if;
  update public.forms set status = 'approved', approved_at = now(), approved_by = v_user where id = p_form_id;
  update public.consultations set status = 'approved', updated_at = now() where id = v_form.consultation_id;
  perform private.log_event(v_form.consultation_id, 'form.approved', v_user::text, 'practitioner',
    'form', p_form_id, 'success', jsonb_build_object('from_status', v_status, 'to_status', 'approved'));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Engine functions for forms, on the pattern of the transcription ones.
-- ---------------------------------------------------------------------------

create function private.fail_form_job(p_job public.form_jobs, p_error_category text, p_actor_id text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.form_jobs set status = 'failed', finished_at = now(), error_category = p_error_category
    where id = p_job.id;
  update public.consultations set status = 'extraction_failed', updated_at = now()
    where id = p_job.consultation_id;
  perform private.log_event(p_job.consultation_id, 'form.failed', p_actor_id, 'engine',
    'form_job', p_job.id, 'failure',
    jsonb_build_object('job_id', p_job.id, 'attempt', p_job.attempt, 'error_category', p_error_category,
      'from_status', 'extraction_processing', 'to_status', 'extraction_failed'));
end;
$$;

create function public.engine_claim_form_job() returns jsonb
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
      where s.transcript_id = v_job.transcript_id and not s.possibly_not_speech)));
end;
$$;

create function public.engine_form_heartbeat(p_job_id uuid, p_attempt int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_engine uuid := (select auth.uid());
  v_job public.form_jobs;
begin
  if not private.is_engine() then
    return private.refuse('NOT_AN_ENGINE');
  end if;
  update public.engines set last_seen_at = now() where user_id = v_engine;
  perform 1 from public.consultations
    where id = (select consultation_id from public.form_jobs where id = p_job_id) for update;
  select * into v_job from public.form_jobs
    where id = p_job_id and attempt = p_attempt and status = 'processing' and engine_user_id = v_engine
    for update;
  if not found then
    return jsonb_build_object('ok', true, 'continue', false);
  end if;
  -- A small model on a laptop needs minutes, never an hour.
  if now() > v_job.claimed_at + interval '60 minutes' then
    perform private.fail_form_job(v_job, 'FORM_TIMEOUT', v_engine::text);
    return jsonb_build_object('ok', true, 'continue', false);
  end if;
  update public.form_jobs set heartbeat_at = now() where id = p_job_id;
  return jsonb_build_object('ok', true, 'continue', true);
end;
$$;

create function public.engine_fail_form_job(p_job_id uuid, p_attempt int, p_error_category text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_engine uuid := (select auth.uid());
  v_job public.form_jobs;
begin
  if not private.is_engine() then
    return private.refuse('NOT_AN_ENGINE');
  end if;
  if p_error_category is null or p_error_category <> all (array['FORM_MODEL_UNAVAILABLE', 'FORM_FAILED']) then
    return private.refuse('VALIDATION', 'error_category');
  end if;
  perform 1 from public.consultations
    where id = (select consultation_id from public.form_jobs where id = p_job_id) for update;
  select * into v_job from public.form_jobs
    where id = p_job_id and attempt = p_attempt and status = 'processing' and engine_user_id = v_engine
    for update;
  if not found then
    return private.refuse('JOB_NOT_YOURS');
  end if;
  perform private.fail_form_job(v_job, p_error_category, v_engine::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- The answers are checked whole and written whole, like a transcript.
create function public.engine_complete_form_job(
  p_job_id uuid, p_attempt int, p_answers jsonb, p_metrics jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_engine uuid := (select auth.uid());
  v_job public.form_jobs;
  v_template jsonb;
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
  select ft.definition into v_template from public.form_templates ft
    join public.consultations c on c.practitioner_id = ft.practitioner_id
    where c.id = v_job.consultation_id;

  begin
    -- Exactly the template's fields, each once, citing only lines that exist.
    if jsonb_typeof(p_answers) is distinct from 'array'
       or (select array_agg(a ->> 'key' order by a ->> 'key') from jsonb_array_elements(p_answers) a)
          is distinct from (select array_agg(f ->> 'key' order by f ->> 'key')
                            from jsonb_array_elements(v_template -> 'sections') s, jsonb_array_elements(s -> 'fields') f)
       or exists (select 1 from jsonb_array_elements(p_answers) a, jsonb_array_elements_text(coalesce(a -> 'evidence', '[]')) e
                  where not exists (select 1 from public.transcript_segments s
                                    where s.transcript_id = v_job.transcript_id and s.position = e::int))
    then
      return private.refuse('VALIDATION', 'answers');
    end if;

    update public.forms set status = 'superseded'
      where consultation_id = v_job.consultation_id and status <> 'superseded';
    insert into public.forms (consultation_id, job_id, transcript_id, template)
      values (v_job.consultation_id, v_job.id, v_job.transcript_id, v_template)
      returning id into v_form_id;
    insert into public.form_answers (form_id, field_key, position, machine_text, evidence)
      select v_form_id, f.field ->> 'key', f.position - 1,
             nullif(btrim(a ->> 'text'), ''),
             coalesce(array(select distinct e::int from jsonb_array_elements_text(a -> 'evidence') e order by 1), '{}')
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

-- The metrics a form job may report, alongside the transcription ones. Never text.
create or replace function private.clean_metrics(p_metrics jsonb) returns jsonb
language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(coalesce(p_metrics, '{}'::jsonb))
  where key = any (array[
      'audio_duration_seconds', 'transcription_duration_seconds', 'transcription_model_name',
      'transcription_model_size', 'device_type', 'compute_type', 'transcript_segment_count',
      'low_confidence_segment_count', 'overlap_segment_count',
      'form_model_name', 'form_duration_seconds', 'prompt_tokens', 'completion_tokens',
      'answered_field_count'])
    and (jsonb_typeof(value) in ('number', 'boolean')
         or (jsonb_typeof(value) = 'string' and char_length(value #>> '{}') <= 60));
$$;

-- Who may call what.
revoke all on function
  public.set_form_template(jsonb),
  public.start_form(uuid),
  public.review_form_answer(uuid, text, text, text),
  public.approve_form(uuid),
  public.engine_claim_form_job(),
  public.engine_form_heartbeat(uuid, int),
  public.engine_fail_form_job(uuid, int, text),
  public.engine_complete_form_job(uuid, int, jsonb, jsonb)
from public, anon, authenticated, service_role;
revoke all on all functions in schema private from public, anon, service_role;
grant execute on function
  public.set_form_template(jsonb),
  public.start_form(uuid),
  public.review_form_answer(uuid, text, text, text),
  public.approve_form(uuid),
  public.engine_claim_form_job(),
  public.engine_form_heartbeat(uuid, int),
  public.engine_fail_form_job(uuid, int, text),
  public.engine_complete_form_job(uuid, int, jsonb, jsonb)
to authenticated;
