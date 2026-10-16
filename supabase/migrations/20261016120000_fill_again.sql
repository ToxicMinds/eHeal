-- Filling the form in again (owner, 16 October): a document can arrive after Watson filled in the
-- form. The practitioner asks for it again; answers they already checked stay as they left them.

-- From a filled-in form (checked or not yet), back to Watson. The current form stays readable
-- until the new one replaces it, and cannot be changed meanwhile.
create function public.fill_form_again(p_consultation_id uuid) returns jsonb
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
  if v_consultation.status not in ('draft_ready', 'under_review') then
    return private.reject_transition(p_consultation_id, 'fill_form_again', v_consultation.status);
  end if;
  v_job := private.queue_form(p_consultation_id, v_user, v_consultation.status);
  if v_job is null then
    return private.refuse('FORM_TEMPLATE_MISSING');
  end if;
  return jsonb_build_object('ok', true, 'job_id', v_job);
end;
$$;
revoke all on function public.fill_form_again(uuid) from public, anon, authenticated, service_role;
grant execute on function public.fill_form_again(uuid) to authenticated;

-- As in the documents migration, plus: carry the checked answers over from the form it replaces,
-- and go straight to "under review" when some answers are already checked.
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
  v_previous uuid;
  v_answered int;
  v_status public.consultation_status;
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

    select id into v_previous from public.forms where consultation_id = v_job.consultation_id and status <> 'superseded';
    update public.forms set status = 'superseded' where id = v_previous;
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
    -- Filled in again: what the practitioner already checked stays exactly as they left it.
    update public.form_answers n
      set machine_text = o.machine_text, evidence = o.evidence, document_quotes = o.document_quotes,
          practitioner_text = o.practitioner_text, review = o.review
      from public.form_answers o
      where n.form_id = v_form_id and o.form_id = v_previous and o.field_key = n.field_key and o.review <> 'unreviewed';
    select count(*) into v_answered from public.form_answers where form_id = v_form_id and machine_text is not null;
  exception when others then
    return private.refuse('VALIDATION', 'answers');
  end;

  update public.form_jobs set status = 'completed', finished_at = now(), metrics = private.clean_metrics(p_metrics)
    where id = v_job.id;
  v_status := case when exists (select 1 from public.form_answers where form_id = v_form_id and review <> 'unreviewed')
                   then 'under_review' else 'draft_ready' end;
  update public.consultations set status = v_status, updated_at = now() where id = v_job.consultation_id;
  perform private.log_event(v_job.consultation_id, 'form.completed', v_engine::text, 'engine',
    'form', v_form_id, 'success',
    jsonb_build_object('job_id', v_job.id, 'attempt', v_job.attempt, 'segment_count', v_answered,
      'from_status', 'extraction_processing', 'to_status', v_status));
  return jsonb_build_object('ok', true, 'form_id', v_form_id);
end;
$$;
