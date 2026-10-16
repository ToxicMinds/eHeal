-- The number patients message Watson on. With the gateway it is the owner's own (owner, 16 October
-- 2026), so it lives in Vault and is given only to someone holding a patient's link, never published
-- in the website's code. Null where it is not set: the page then uses its built-in number.
create function public.watson_whatsapp(p_token text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('ok', true, 'number',
              (select decrypted_secret from vault.decrypted_secrets where name = 'watson_whatsapp_number'))
     from private.consultation_for_token(p_token) c
     where c.id is not null),
    private.refuse('NOT_FOUND'));
$$;

revoke all on function public.watson_whatsapp(text) from public;
grant execute on function public.watson_whatsapp(text) to anon, authenticated;
