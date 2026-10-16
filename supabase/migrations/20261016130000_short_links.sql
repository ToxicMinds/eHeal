-- Short links (owner, 16 October): a link a practitioner can read out or type,
-- watson-app.onrender.com/j/K7P4QX9M. Watson's own, not a public shortener: the patient's link is
-- the only key to their consultation, and public short links can be scanned.
-- Eight characters from 32 without look-alikes (no 0, O, 1, I): 32^8, about 10^12 codes.

-- Cryptographically random: each byte modulo 32 is uniform, because 256 is a multiple of 32.
create function private.new_short_code() returns text
language sql volatile set search_path = ''
as $$
  select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + get_byte(b, i) % 32, 1), '' order by i)
  from (select extensions.gen_random_bytes(8) as b) r, generate_series(0, 7) i;
$$;
revoke all on function private.new_short_code() from public, anon, authenticated, service_role;

alter table public.consultations add column short_code text;
update public.consultations set short_code = private.new_short_code() where short_code is null;
alter table public.consultations
  alter column short_code set default private.new_short_code(),
  alter column short_code set not null,
  add constraint short_code_unique unique (short_code),
  add constraint short_code_format check (short_code ~ '^[2-9A-HJ-NP-Z]{8}$');

-- For anyone with a short link: the patient's page it stands for. Typed in any case, with spaces
-- or dashes.
create function public.open_short_link(p_code text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('ok', true, 'token', c.invite_token) from public.consultations c
     where c.short_code = upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'))
       and c.status <> 'consent_withdrawn'),
    private.refuse('NOT_FOUND'));
$$;
revoke all on function public.open_short_link(text) from public, anon, authenticated, service_role;
grant execute on function public.open_short_link(text) to anon, authenticated;

-- What Watson's WhatsApp messages need about a consultation now includes its short link.
create or replace function private.whatsapp_view(p_consultation_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('consultation_id', c.id, 'scheduled_at', c.scheduled_at, 'language', c.language,
    'invite_token', c.invite_token, 'short_code', c.short_code, 'must_pay', c.fee_cents is not null and c.paid_at is null,
    'patient_name', p.name)
  from public.consultations c left join public.patients p on p.id = c.patient_id
  where c.id = p_consultation_id;
$$;
