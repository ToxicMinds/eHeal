-- Watson's WhatsApp gateway on Render's free plan (owner, 16 October 2026: no card anywhere). Render
-- wipes its disk at every restart, so the gateway keeps its WhatsApp pairing here, sealed with a key
-- only the gateway holds: this database sees ciphertext. Watson's five-minute schedule knocks on the
-- gateway (which keeps it awake) and records what it says; the owner gets an email when WhatsApp
-- needs linking again or the gateway stops answering. Only the whatsapp function calls these.

create table private.whatsapp_gateway_state (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table private.whatsapp_gateway_state enable row level security;

create function public.whatsapp_gateway_state_read() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'state', coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb))
  from private.whatsapp_gateway_state s;
$$;

-- {key: sealed value} writes a key, {key: null} removes it; all of one call or none.
create function public.whatsapp_gateway_state_write(p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    return private.refuse('VALIDATION', 'changes');
  end if;
  delete from private.whatsapp_gateway_state s
    using jsonb_each(p_changes) c where s.key = c.key and jsonb_typeof(c.value) = 'null';
  insert into private.whatsapp_gateway_state (key, value)
    select c.key, c.value #>> '{}' from jsonb_each(p_changes) c where jsonb_typeof(c.value) = 'string'
    on conflict (key) do update set value = excluded.value, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- The gateway's last answer to the schedule's knock.
create table private.whatsapp_gateway_health (
  id boolean primary key default true check (id),
  status text not null,
  seen_at timestamptz not null default now()
);
alter table private.whatsapp_gateway_health enable row level security;

create function public.whatsapp_gateway_seen(p_status text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.whatsapp_gateway_health (id, status, seen_at) values (true, left(coalesce(p_status, ''), 40), now())
    on conflict (id) do update set status = excluded.status, seen_at = excluded.seen_at;
  if p_status in ('SCAN_QR', 'LOGGED_OUT') then
    perform private.notify_owner('whatsapp-link-' || to_char(now(), 'YYYY-MM-DD'),
      'Watson''s WhatsApp needs linking again',
      'Watson''s WhatsApp gateway has lost its link to your number (it was unlinked from the phone, '
      || 'or WhatsApp ended the session). Until it is linked again, Watson neither answers patients '
      || 'on WhatsApp nor sends reminders. Ask Claude to show the QR code, then scan it in WhatsApp: '
      || 'Settings, Linked devices, Link a device.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- The knock went unanswered. One miss is a restart; twenty minutes is a problem worth an email.
create function public.whatsapp_gateway_unreachable() returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from private.whatsapp_gateway_health where seen_at < now() - interval '20 minutes') then
    perform private.notify_owner('whatsapp-down-' || to_char(now(), 'YYYY-MM-DD'),
      'Watson''s WhatsApp is not answering',
      'Watson''s WhatsApp gateway on Render has not answered for twenty minutes. Patients'' messages '
      || 'wait on WhatsApp and reach Watson once it is back. If it stays down, check render.com '
      || '(service watson-whatsapp) or ask Claude.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function
  public.whatsapp_gateway_state_read(), public.whatsapp_gateway_state_write(jsonb),
  public.whatsapp_gateway_seen(text), public.whatsapp_gateway_unreachable()
from public, anon, authenticated, service_role;
grant execute on function
  public.whatsapp_gateway_state_read(), public.whatsapp_gateway_state_write(jsonb),
  public.whatsapp_gateway_seen(text), public.whatsapp_gateway_unreachable()
to service_role;
