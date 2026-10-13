-- Slice 1.1: consultations, and who may read them.
-- State names and transitions follow MASTER_BUILD_SPEC.md section 10.2.

create type public.consultation_status as enum (
  'consent_pending',
  'ready_for_audio',
  'audio_imported',
  'transcription_processing',
  'transcription_failed',
  'transcript_ready',
  'transcript_under_review',
  'transcript_reviewed',
  'extraction_processing',
  'extraction_failed',
  'draft_ready',
  'under_review',
  'approved',
  'corrected',
  'consent_withdrawn',
  'archived'
);

-- 'auto' is the explicit "mixed or unsure" choice (section 12.2).
create type public.consultation_language as enum ('en', 'de', 'sk', 'auto');

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references auth.users (id) on delete restrict,
  -- Synthetic mode: only invented references are accepted (section 5.1).
  synthetic_patient_ref text not null check (synthetic_patient_ref ~ '^SYN-[0-9]{1,8}$'),
  scheduled_at timestamptz not null,
  language public.consultation_language not null,
  status public.consultation_status not null,
  consent_recorded_at timestamptz,
  consent_recorded_by uuid references auth.users (id),
  consent_withdrawn_at timestamptz,
  -- Notes describe the invented scenario. Never clinical content.
  scenario_notes text not null default '' check (char_length(scenario_notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index consultations_practitioner_idx
  on public.consultations (practitioner_id, scheduled_at desc);

-- Deny by default. Rows are written only by database functions (later slices);
-- a practitioner can read their own rows and nothing else.
alter table public.consultations enable row level security;
revoke all on public.consultations from anon, authenticated;
grant select on public.consultations to authenticated;
-- The engine credential (and test setup) can reach everything; narrowing it is a Gate R item.
grant all on public.consultations to service_role;

create policy "Practitioners read their own consultations"
  on public.consultations for select to authenticated
  using (practitioner_id = (select auth.uid()));
