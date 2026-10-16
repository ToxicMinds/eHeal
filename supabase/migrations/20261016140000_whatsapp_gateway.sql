-- Watson's own WhatsApp gateway (owner, 16 October 2026): a linked WhatsApp number on the owner's
-- Google Cloud, while Meta waits for a registered business. The number is the owner's own, so the
-- gateway passes on photos and PDFs only from these numbers: patients linked to a consultation that
-- is ahead or took place in the last three days (a late lab result still reaches the form).
create function public.whatsapp_gateway_contacts() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'phones', coalesce(jsonb_agg(w.phone order by w.phone), '[]'::jsonb))
  from public.whatsapp_contacts w
    join public.consultations c on c.id = w.consultation_id
  where c.scheduled_at > now() - interval '3 days' and c.status <> 'consent_withdrawn';
$$;

revoke all on function public.whatsapp_gateway_contacts() from public, anon, authenticated, service_role;
grant execute on function public.whatsapp_gateway_contacts() to service_role;
