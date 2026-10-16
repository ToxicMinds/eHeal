-- Work the database starts by itself every five minutes (owner, 16 October): read each connected
-- Google Calendar, and send WhatsApp reminders about an hour before a call. The edge functions do
-- the work; this only knocks on their door, with a secret they check.

-- Reminders due now: calls starting within 65 minutes, still on (paid or free), not reminded yet,
-- for a patient who asked when booking (and gave a phone number) or who linked their number by
-- messaging Watson. Each with what the message needs.
create function public.whatsapp_due_reminders() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'reminders', coalesce(jsonb_agg(
      private.whatsapp_view(c.id) || jsonb_build_object('phone', coalesce(w.phone, p.phone)) order by c.scheduled_at), '[]'::jsonb))
  from public.consultations c
    left join public.patients p on p.id = c.patient_id
    left join lateral (select w.phone from public.whatsapp_contacts w where w.consultation_id = c.id limit 1) w on true
  where c.scheduled_at > now() and c.scheduled_at <= now() + interval '65 minutes'
    and c.reminder_sent_at is null
    and c.status in ('consent_pending', 'ready_for_audio')
    and private.takes_time(c) and (c.fee_cents is null or c.paid_at is not null)
    and (w.phone is not null or (c.remind_whatsapp and p.phone is not null));
$$;

-- Claims a reminder before it is sent: only the first claim wins, so two runs of the schedule at
-- once cannot both send it, and a failing template never repeats every five minutes (the message,
-- with any error, is recorded in whatsapp_messages).
create function public.whatsapp_reminder_sent(p_consultation uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  update public.consultations set reminder_sent_at = now() where id = p_consultation and reminder_sent_at is null;
  if not found then
    return private.refuse('ALREADY_SENT');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.whatsapp_due_reminders(), public.whatsapp_reminder_sent(uuid) from public, anon, authenticated, service_role;
grant execute on function public.whatsapp_due_reminders(), public.whatsapp_reminder_sent(uuid) to service_role;

-- The schedule. The functions' address and the secret live in Vault, set once per project by
-- scripts/configure-schedule.sh; where they are missing (the local stack) the knock does nothing.
create extension if not exists pg_cron;

create function private.knock(p_function text, p_body jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
begin
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(url := v_url || '/' || p_function, body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-watson-cron', v_secret));
end;
$$;
revoke all on function private.knock(text, jsonb) from public, anon, authenticated, service_role;

select cron.schedule('watson-google-calendars', '*/5 * * * *', $$select private.knock('google', '{}'::jsonb)$$);
select cron.schedule('watson-whatsapp-reminders', '*/5 * * * *', $$select private.knock('whatsapp', '{"action": "reminders"}'::jsonb)$$);
