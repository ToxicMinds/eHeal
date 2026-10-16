-- The owner hears about it when Watson stops doing its work by itself (owner, 16 October 2026):
-- an email through Resend to the owner's own address, once per event. The first event: the cloud
-- engine's monthly allowance is used while work waits (migration 20261016150000).

create table private.owner_notices (
  key text primary key, -- what happened and when, e.g. 'engine-allowance-2026-10': one email each
  subject text not null,
  sent_at timestamptz not null default now()
);
alter table private.owner_notices enable row level security;

-- Records the notice and emails it, once per key. Resend's key and the owner's address live in
-- Vault (scripts/configure-owner-notices.sh); where they are missing (the local stack) the notice is
-- recorded and nothing is sent.
create function private.notify_owner(p_key text, p_subject text, p_text text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key');
  v_to text := (select decrypted_secret from vault.decrypted_secrets where name = 'owner_email');
begin
  insert into private.owner_notices (key, subject) values (p_key, p_subject) on conflict (key) do nothing;
  if not found or v_key is null or v_to is null then
    return;
  end if;
  perform net.http_post(url := 'https://api.resend.com/emails',
    body := jsonb_build_object('from', 'Watson <onboarding@resend.dev>', 'to', jsonb_build_array(v_to),
      'subject', p_subject, 'text', p_text),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key));
end;
$$;

create or replace function private.wake_engine() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'engine_wake_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'engine_wake_secret');
  v_decision text := private.engine_wake_decision();
begin
  if v_decision = 'allowance used' then
    perform private.notify_owner('engine-allowance-' || to_char(now(), 'YYYY-MM'),
      'Watson''s engine is paused for the rest of the month',
      'Watson has used this month''s allowance of engine time, so transcripts, documents and forms '
      || 'now wait until the 1st. Nothing is lost: they are done as soon as the engine may run again.'
      || E'\n\n' || 'To carry on now: add a card on Modal (modal.com, workspace nikshanbhag), which '
      || 'raises its free credit from $1 to $30 a month, and ask Claude to raise the allowance.');
    return;
  end if;
  if v_url is null or v_secret is null or v_decision <> 'wake' then
    return;
  end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret));
end;
$$;

revoke all on function private.notify_owner(text, text, text), private.wake_engine()
from public, anon, authenticated, service_role;
