-- Booking (owner, 16 October 2026): a practitioner opens hours on a page of their own; patients
-- find them, see the open times and book one. Open times leave out consultations and the busy
-- times read from the practitioner's Google Calendar. An unpaid booking holds its time while the
-- patient pays, then lets it go. Times are counted on the practitioner's clock (their time zone).

create table public.practitioner_profiles (
  practitioner_id uuid primary key references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  offer text not null default '' check (char_length(offer) <= 140),
  about text not null default '' check (char_length(about) <= 1000),
  languages public.consultation_language[] not null default '{}',
  -- Bookable hours per ISO weekday (1 Monday … 7 Sunday): {"1": ["09:00", "17:00"], …}.
  hours jsonb not null default '{}'::jsonb,
  length_minutes int not null default 45 check (length_minutes in (30, 45, 60, 90)),
  gap_minutes int not null default 15 check (gap_minutes in (0, 15, 30)),
  fee_cents int check (fee_cents is null or fee_cents between 50 and 100000),
  time_zone text not null default 'Europe/Bratislava',
  updated_at timestamptz not null default now()
);
alter table public.practitioner_profiles enable row level security;
revoke all on public.practitioner_profiles from anon, authenticated;
grant select on public.practitioner_profiles to authenticated;
grant all on public.practitioner_profiles to service_role;
create policy "Practitioners read their own booking page"
  on public.practitioner_profiles for select to authenticated
  using (practitioner_id = (select auth.uid()));

alter table public.consultations
  add column duration_minutes int not null default 45 check (duration_minutes between 15 and 240),
  -- Set when the patient booked the time themselves, from the practitioner's page.
  add column booked_at timestamptz,
  -- An unpaid booking keeps its time until then; afterwards the time is open again.
  add column hold_until timestamptz,
  add column remind_whatsapp boolean not null default false,
  add column reminder_sent_at timestamptz,
  add column google_event_id text;

-- The practitioner's Google Calendar: the key Google gave Watson, and Watson's own calendar inside
-- it, where bookings are written. Only the server's key reads or writes these two tables.
create table public.google_calendars (
  practitioner_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  refresh_token text not null,
  calendar_id text not null,
  connected_at timestamptz not null default now(),
  checked_at timestamptz,
  problem text check (problem in ('GOOGLE_REVOKED', 'GOOGLE_UNAVAILABLE'))
);
-- When the practitioner is busy, as Google last reported it. Never what the events are.
create table public.busy_times (
  practitioner_id uuid not null references auth.users (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at)
);
create index busy_times_practitioner_idx on public.busy_times (practitioner_id, starts_at);
alter table public.google_calendars enable row level security;
alter table public.busy_times enable row level security;
revoke all on public.google_calendars, public.busy_times from anon, authenticated;
grant all on public.google_calendars, public.busy_times to service_role;

-- True when every weekday key is 1 to 7 and holds a start before its end, as "HH:MM" ("24:00" ends a day).
-- CASE, not AND: the casts run only once the format is known to be right.
create function private.valid_hours(p_hours jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p_hours) = 'object' and not exists (
    select 1 from jsonb_each(p_hours) as h(day, span)
    where case
      when h.day !~ '^[1-7]$' then true
      when jsonb_typeof(h.span) <> 'array' then true
      when jsonb_array_length(h.span) <> 2 then true
      when coalesce(h.span ->> 0, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then true
      when coalesce(h.span ->> 1, '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' then true
      else (h.span ->> 0)::time >= (h.span ->> 1)::time
    end);
$$;

-- Whether a consultation still takes up its time: not withdrawn, and paid, free, or still held.
create function private.takes_time(p_consultation public.consultations) returns boolean
language sql stable set search_path = ''
as $$
  select p_consultation.status not in ('consent_withdrawn', 'archived')
    and (p_consultation.hold_until is null or p_consultation.paid_at is not null or p_consultation.hold_until > now());
$$;

-- Whether anything other than p_except blocks a consultation of this practitioner over [p_start, p_end).
create function private.time_blocked(p_practitioner uuid, p_start timestamptz, p_end timestamptz, p_except uuid default null)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
      select 1 from public.consultations c
      where c.practitioner_id = p_practitioner and c.id is distinct from p_except and private.takes_time(c)
        and tstzrange(c.scheduled_at, c.scheduled_at + make_interval(mins => c.duration_minutes)) && tstzrange(p_start, p_end))
    or exists (
      select 1 from public.busy_times b
      where b.practitioner_id = p_practitioner and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_start, p_end));
$$;

-- The times a patient may book between p_from and p_to: the practitioner's hours cut into
-- consultation length plus the time between, at least two hours ahead, and not blocked.
create function private.open_times(p_page public.practitioner_profiles, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with days as (
    select d::date as day, extract(isodow from d)::int::text as weekday
    from generate_series((p_from at time zone p_page.time_zone)::date, (p_to at time zone p_page.time_zone)::date, interval '1 day') d
  ), windows as (
    select (day + (p_page.hours -> weekday ->> 0)::time) at time zone p_page.time_zone as opens,
           (day + (p_page.hours -> weekday ->> 1)::time) at time zone p_page.time_zone as closes
    from days where p_page.hours ? weekday
  )
  select s from windows,
    generate_series(opens, closes - make_interval(mins => p_page.length_minutes),
                    make_interval(mins => p_page.length_minutes + p_page.gap_minutes)) s
  where s >= greatest(p_from, now() + interval '2 hours') and s < p_to
    and not private.time_blocked(p_page.practitioner_id, s, s + make_interval(mins => p_page.length_minutes))
  order by s;
$$;

-- What a patient sees of a practitioner's page.
create function private.public_page(p_page public.practitioner_profiles) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object('slug', p_page.slug, 'display_name', p_page.display_name, 'offer', p_page.offer,
    'about', p_page.about, 'languages', to_jsonb(p_page.languages), 'length_minutes', p_page.length_minutes,
    'fee_cents', p_page.fee_cents, 'time_zone', p_page.time_zone);
$$;

-- A new page's address, from the login name ("robin" for robin@watson.test).
create function private.new_slug(p_user uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_base text;
begin
  select left(btrim(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9]+', '-', 'g'), '-'), 32)
    into v_base from auth.users where id = p_user;
  v_base := coalesce(nullif(v_base, ''), 'practitioner');
  if exists (select 1 from public.practitioner_profiles where slug = v_base) then
    v_base := v_base || '-' || left(md5(p_user::text), 6);
  end if;
  return v_base;
end;
$$;

create function public.save_booking_page(
  p_display_name text, p_offer text, p_about text, p_languages public.consultation_language[],
  p_hours jsonb, p_length_minutes int, p_gap_minutes int, p_fee_cents int
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_slug text;
begin
  if v_user is null then
    return private.refuse('NOT_SIGNED_IN');
  end if;
  if private.is_engine() then
    return private.refuse('NOT_A_PRACTITIONER');
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 120 then
    return private.refuse('VALIDATION', 'display_name');
  end if;
  if char_length(coalesce(p_offer, '')) > 140 then
    return private.refuse('VALIDATION', 'offer');
  end if;
  if char_length(coalesce(p_about, '')) > 1000 then
    return private.refuse('VALIDATION', 'about');
  end if;
  if p_languages is null or 'auto' = any (p_languages) then
    return private.refuse('VALIDATION', 'languages');
  end if;
  if p_hours is null or not private.valid_hours(p_hours) then
    return private.refuse('VALIDATION', 'hours');
  end if;
  if p_length_minutes is null or p_length_minutes not in (30, 45, 60, 90) then
    return private.refuse('VALIDATION', 'length_minutes');
  end if;
  if p_gap_minutes is null or p_gap_minutes not in (0, 15, 30) then
    return private.refuse('VALIDATION', 'gap_minutes');
  end if;
  if p_fee_cents is not null and p_fee_cents not between 50 and 100000 then
    return private.refuse('VALIDATION', 'fee_cents');
  end if;

  select slug into v_slug from public.practitioner_profiles where practitioner_id = v_user;
  insert into public.practitioner_profiles as p (practitioner_id, slug, display_name, offer, about, languages,
      hours, length_minutes, gap_minutes, fee_cents)
    values (v_user, coalesce(v_slug, private.new_slug(v_user)), btrim(p_display_name), coalesce(p_offer, ''),
      coalesce(p_about, ''), (select coalesce(array_agg(distinct l), '{}') from unnest(p_languages) l),
      p_hours, p_length_minutes, p_gap_minutes, p_fee_cents)
    on conflict (practitioner_id) do update set
      display_name = excluded.display_name, offer = excluded.offer, about = excluded.about,
      languages = excluded.languages, hours = excluded.hours, length_minutes = excluded.length_minutes,
      gap_minutes = excluded.gap_minutes, fee_cents = excluded.fee_cents, updated_at = now()
    returning p.slug into v_slug;
  return jsonb_build_object('ok', true, 'slug', v_slug);
end;
$$;

-- For patients: a practitioner's page and the times open between p_from and p_to (at most 5 weeks).
create function public.booking_times(p_slug text, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_page public.practitioner_profiles;
begin
  select * into v_page from public.practitioner_profiles where slug = p_slug;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '35 days' then
    return private.refuse('VALIDATION', 'range');
  end if;
  return jsonb_build_object('ok', true, 'practitioner', private.public_page(v_page),
    'times', (select coalesce(jsonb_agg(t.starts_at order by t.starts_at), '[]'::jsonb) from private.open_times(v_page, p_from, p_to) t));
end;
$$;

-- For patients: every practitioner with bookable hours, and their next free time in four weeks.
create function public.find_practitioners() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'practitioners', coalesce(jsonb_agg(
      private.public_page(p) || jsonb_build_object('next_free',
        (select min(t.starts_at) from private.open_times(p, now(), now() + interval '28 days') t))
      order by p.display_name), '[]'::jsonb))
  from public.practitioner_profiles p
  where p.hours <> '{}'::jsonb;
$$;

-- A patient books an open time. The consultation, the patient and the audit entry are written
-- together or not at all; a fee holds the time for 35 minutes while the patient pays.
create function public.book_time(
  p_slug text, p_starts_at timestamptz, p_name text, p_contact text,
  p_language public.consultation_language, p_remind_whatsapp boolean
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_page public.practitioner_profiles;
  v_consultation public.consultations;
  v_patient jsonb;
begin
  -- One booking at a time per practitioner: the check and the insert cannot interleave with another's.
  select * into v_page from public.practitioner_profiles where slug = p_slug for update;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  if p_language is null or not (p_language = any (v_page.languages)) then
    return private.refuse('VALIDATION', 'language');
  end if;
  if p_starts_at is null or not exists (
    select 1 from private.open_times(v_page, p_starts_at, p_starts_at + interval '1 minute') t where t.starts_at = p_starts_at
  ) then
    return private.refuse('TIME_TAKEN');
  end if;

  begin
    insert into public.consultations (practitioner_id, synthetic_patient_ref, scheduled_at, duration_minutes,
        language, status, fee_cents, booked_at, hold_until, remind_whatsapp)
      values (v_page.practitioner_id, 'SYN-' || lpad(floor(random() * 100000000)::bigint::text, 8, '0'),
        p_starts_at, v_page.length_minutes, p_language, 'consent_pending', v_page.fee_cents, now(),
        case when v_page.fee_cents is not null then now() + interval '35 minutes' end, coalesce(p_remind_whatsapp, false))
      returning * into v_consultation;
    v_patient := private.identify_patient(v_consultation, p_name, p_contact);
    if not (v_patient ->> 'ok')::boolean then
      raise exception using errcode = 'W0001'; -- undoes the insert above
    end if;
  exception when sqlstate 'W0001' then
    return v_patient;
  end;

  perform private.log_event(v_consultation.id, 'consultation.booked', 'patient', 'patient',
    'consultation', v_consultation.id, 'success', jsonb_build_object('to_status', v_consultation.status));
  return jsonb_build_object('ok', true, 'token', v_consultation.invite_token);
end;
$$;

-- Before a payment starts: keep an unpaid booking's time for another 35 minutes, if nobody took it.
create function public.renew_hold(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_practitioner uuid;
  v_consultation public.consultations;
begin
  select practitioner_id into v_practitioner from public.consultations where invite_token = p_token;
  if not found then
    return private.refuse('NOT_FOUND');
  end if;
  -- The same lock as book_time, taken first, so a renewal and a booking cannot both win the time.
  perform 1 from public.practitioner_profiles where practitioner_id = v_practitioner for update;
  select * into v_consultation from public.consultations where invite_token = p_token for update;
  if v_consultation.hold_until is null or v_consultation.paid_at is not null then
    return jsonb_build_object('ok', true, 'hold_until', null);
  end if;
  if private.time_blocked(v_practitioner, v_consultation.scheduled_at,
       v_consultation.scheduled_at + make_interval(mins => v_consultation.duration_minutes), v_consultation.id) then
    return private.refuse('TIME_TAKEN');
  end if;
  update public.consultations set hold_until = now() + interval '35 minutes', updated_at = now()
    where id = v_consultation.id returning * into v_consultation;
  return jsonb_build_object('ok', true, 'hold_until', v_consultation.hold_until);
end;
$$;

-- For the practitioner: their page, open times, Google busy times and Google connection, for a week.
create function public.calendar_week(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_page public.practitioner_profiles;
begin
  if v_user is null then
    return private.refuse('NOT_SIGNED_IN');
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '35 days' then
    return private.refuse('VALIDATION', 'range');
  end if;
  select * into v_page from public.practitioner_profiles where practitioner_id = v_user;
  return jsonb_build_object('ok', true,
    'page', case when v_page.practitioner_id is null then null else private.public_page(v_page)
      || jsonb_build_object('hours', v_page.hours, 'gap_minutes', v_page.gap_minutes) end,
    'open', case when v_page.practitioner_id is null then '[]'::jsonb else
      (select coalesce(jsonb_agg(t.starts_at order by t.starts_at), '[]'::jsonb) from private.open_times(v_page, p_from, p_to) t) end,
    'busy', (select coalesce(jsonb_agg(jsonb_build_object('starts_at', b.starts_at, 'ends_at', b.ends_at) order by b.starts_at), '[]'::jsonb)
             from public.busy_times b
             where b.practitioner_id = v_user and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_from, p_to)),
    'google', (select jsonb_build_object('email', g.email, 'connected_at', g.connected_at, 'checked_at', g.checked_at, 'problem', g.problem)
               from public.google_calendars g where g.practitioner_id = v_user));
end;
$$;

-- For the Google edge function (server key only).
create function public.google_save_connection(p_practitioner uuid, p_email text, p_refresh_token text, p_calendar_id text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.google_calendars (practitioner_id, email, refresh_token, calendar_id)
    values (p_practitioner, p_email, p_refresh_token, p_calendar_id)
    on conflict (practitioner_id) do update set email = excluded.email, refresh_token = excluded.refresh_token,
      calendar_id = excluded.calendar_id, connected_at = now(), checked_at = null, problem = null;
  return jsonb_build_object('ok', true);
end;
$$;

-- Replaces the practitioner's busy times with a fresh read from Google, all at once.
create function public.google_replace_busy(p_practitioner uuid, p_busy jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if jsonb_typeof(p_busy) <> 'array' then
    return private.refuse('VALIDATION', 'busy');
  end if;
  delete from public.busy_times where practitioner_id = p_practitioner;
  insert into public.busy_times (practitioner_id, starts_at, ends_at)
    select p_practitioner, (b ->> 'starts_at')::timestamptz, (b ->> 'ends_at')::timestamptz
    from jsonb_array_elements(p_busy) b;
  update public.google_calendars set checked_at = now(), problem = null where practitioner_id = p_practitioner;
  return jsonb_build_object('ok', true);
end;
$$;

-- Records why Google could not be read (a revoked key, or Google not answering).
create function public.google_problem(p_practitioner uuid, p_problem text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  update public.google_calendars set problem = p_problem, checked_at = now() where practitioner_id = p_practitioner;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.google_disconnect(p_practitioner uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.busy_times where practitioner_id = p_practitioner;
  delete from public.google_calendars where practitioner_id = p_practitioner;
  update public.consultations set google_event_id = null where practitioner_id = p_practitioner;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function
  public.save_booking_page(text, text, text, public.consultation_language[], jsonb, int, int, int),
  public.booking_times(text, timestamptz, timestamptz),
  public.find_practitioners(),
  public.book_time(text, timestamptz, text, text, public.consultation_language, boolean),
  public.renew_hold(text),
  public.calendar_week(timestamptz, timestamptz),
  public.google_save_connection(uuid, text, text, text),
  public.google_replace_busy(uuid, jsonb),
  public.google_problem(uuid, text),
  public.google_disconnect(uuid)
from public, anon, authenticated, service_role;
grant execute on function
  public.booking_times(text, timestamptz, timestamptz),
  public.find_practitioners(),
  public.book_time(text, timestamptz, text, text, public.consultation_language, boolean)
to anon, authenticated;
grant execute on function
  public.save_booking_page(text, text, text, public.consultation_language[], jsonb, int, int, int),
  public.calendar_week(timestamptz, timestamptz)
to authenticated;
grant execute on function
  public.renew_hold(text),
  public.google_save_connection(uuid, text, text, text),
  public.google_replace_busy(uuid, jsonb),
  public.google_problem(uuid, text),
  public.google_disconnect(uuid)
to service_role;
revoke all on all functions in schema private from public, anon, service_role;
grant execute on function private.document_access(text, text) to anon, authenticated;
