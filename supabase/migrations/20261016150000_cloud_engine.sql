-- Watson's engine in the cloud (owner, 16 October 2026; decision 0009). It runs on Modal only while
-- work waits: the database wakes it when a transcript, a document or a form is queued, the engine
-- stops when nothing is left, and a monthly allowance of running time keeps the bill inside Modal's
-- free credit. Synculariti's three caps, copied: this allowance, Modal's workspace budget, the credit.
-- The laptop engine is unchanged: it is simply not "on demand".

alter table public.engines add column on_demand boolean not null default false;

-- One row per time the cloud engine ran: what the allowance is counted from.
create table public.engine_runs (
  id uuid primary key default gen_random_uuid(),
  engine_user_id uuid not null references public.engines (user_id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index engine_runs_month on public.engine_runs (started_at);
alter table public.engine_runs enable row level security;
revoke all on public.engine_runs from anon, authenticated, service_role;
grant select on public.engine_runs to service_role;

-- ponytail: about $0.76 of Modal's processors a month (4 cores and 8 GB, ~$0.25 an hour), inside
-- the $1 Modal gives without a card. With a card on Modal ($30 a month), raise it to '80 hours'.
create function private.engine_month_allowance() returns interval
language sql immutable set search_path = ''
as $$ select interval '3 hours' $$;

-- Running time this month. A run that never finished (its container died) counts up to the
-- engine's longest possible run, an hour, plus a little.
create function private.engine_month_used() returns interval
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(coalesce(r.finished_at, least(now(), r.started_at + interval '70 minutes')) - r.started_at), interval '0')
  from public.engine_runs r
  where r.started_at >= date_trunc('month', now());
$$;

-- What the engine would claim next: queued work, or work whose engine went quiet (claimable again).
create function private.engine_work_waiting() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.transcription_jobs j
                 where j.status = 'queued' or (j.status = 'processing' and j.heartbeat_at < now() - interval '2 minutes'))
      or exists (select 1 from public.form_jobs j
                 where j.status = 'queued' or (j.status = 'processing' and j.heartbeat_at < now() - interval '2 minutes'))
      or exists (select 1 from public.patient_documents d
                 where (d.reading = 'waiting' and d.uploaded_at is not null)
                    or (d.reading = 'reading' and d.claimed_at < now() - interval '10 minutes'));
$$;

-- Whether to wake the cloud engine now, and if not, why. Waking and stopping take the same lock, so
-- work queued while the engine stops either stops it from stopping or wakes it again.
create function private.engine_wake_decision() returns text
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('watson-cloud-engine'));
  if not exists (select 1 from public.engines where on_demand) then
    return 'no on-demand engine';
  end if;
  if exists (select 1 from public.engine_runs r join public.engines e on e.user_id = r.engine_user_id
             where e.on_demand and r.finished_at is null and r.started_at > now() - interval '70 minutes') then
    return 'running';
  end if;
  if not private.engine_work_waiting() then
    return 'no work';
  end if;
  if private.engine_month_used() >= private.engine_month_allowance() then
    return 'allowance used';
  end if;
  return 'wake';
end;
$$;

-- Knocks on the engine's door on Modal. Its address and secret live in Vault, set by
-- scripts/configure-cloud-engine.sh; where they are missing (the local stack) nothing is sent.
create function private.wake_engine() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'engine_wake_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'engine_wake_secret');
begin
  if v_url is null or v_secret is null or private.engine_wake_decision() <> 'wake' then
    return;
  end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret));
end;
$$;

create function private.wake_engine_on_work() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.wake_engine();
  return null;
end;
$$;

create trigger wake_engine after insert or update of status on public.transcription_jobs
  for each row when (new.status = 'queued') execute function private.wake_engine_on_work();
create trigger wake_engine after insert or update of status on public.form_jobs
  for each row when (new.status = 'queued') execute function private.wake_engine_on_work();
create trigger wake_engine after insert or update of reading, uploaded_at on public.patient_documents
  for each row when (new.reading = 'waiting' and new.uploaded_at is not null) execute function private.wake_engine_on_work();

-- The engine, starting: its earlier runs that never finished are over (their container died).
create function public.engine_run_started() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_engine uuid := (select auth.uid());
  v_run uuid;
begin
  if not private.is_engine() then
    return private.refuse('NOT_AN_ENGINE');
  end if;
  update public.engine_runs set finished_at = now() where engine_user_id = v_engine and finished_at is null;
  insert into public.engine_runs (engine_user_id) values (v_engine) returning id into v_run;
  update public.engines set last_seen_at = now() where user_id = v_engine;
  return jsonb_build_object('ok', true, 'run_id', v_run);
end;
$$;

-- The engine, about to stop: refused while work waits, so nothing is left behind.
create function public.engine_run_finished(p_run_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_engine() then
    return private.refuse('NOT_AN_ENGINE');
  end if;
  perform pg_advisory_xact_lock(hashtext('watson-cloud-engine'));
  if private.engine_work_waiting() then
    return jsonb_build_object('ok', false, 'work_waiting', true);
  end if;
  update public.engine_runs set finished_at = now()
    where id = p_run_id and engine_user_id = (select auth.uid()) and finished_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- What Home shows: the laptop's heartbeat as before, and for a cloud engine whether it can start.
create or replace function public.engine_status() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'online', coalesce(max(e.last_seen_at) > now() - interval '60 seconds', false),
    'last_seen_at', max(e.last_seen_at),
    'on_demand', coalesce(bool_or(e.on_demand), false),
    'paused', coalesce(bool_or(e.on_demand), false) and private.engine_month_used() >= private.engine_month_allowance())
  from public.engines e;
$$;

revoke all on function
  private.engine_month_allowance(), private.engine_month_used(), private.engine_work_waiting(),
  private.engine_wake_decision(), private.wake_engine(), private.wake_engine_on_work()
from public, anon, authenticated, service_role;
revoke all on function public.engine_run_started(), public.engine_run_finished(uuid) from public, anon, service_role;
grant execute on function public.engine_run_started(), public.engine_run_finished(uuid) to authenticated;
