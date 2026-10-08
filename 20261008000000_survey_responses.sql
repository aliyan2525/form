-- Survey responses: one row per respondent session, updated as they progress.

create table public.survey_responses (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null unique,
  answers       jsonb not null default '{}'::jsonb,
  last_step     smallint not null default 0,      -- furthest step reached: 0-7 questions, 8 contact, 9 finished
  completed     boolean not null default false,
  name          text not null default '',
  company       text not null default '',
  contact       text not null default '',
  score         integer not null default 0,
  skips         smallint not null default 0,
  user_agent    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz,
  constraint answers_is_object check (jsonb_typeof(answers) = 'object'),
  constraint answers_small check (pg_column_size(answers) < 8192),
  constraint step_range check (last_step between 0 and 9),
  constraint field_lengths check (
    char_length(name) <= 120 and char_length(company) <= 120 and char_length(contact) <= 120
  )
);

create index survey_responses_created_idx on public.survey_responses (created_at desc);

-- Lock the table down: RLS on, no policies, no grants to the public API roles.
-- Only the server (service role, used by the Vercel function) can read or write.
alter table public.survey_responses enable row level security;
revoke all on table public.survey_responses from anon, authenticated;

-- Upsert that never moves a respondent backwards (step, completed), merges answers
-- (so a late, stale save cannot erase newer ones) and keeps contact details once given.
create or replace function public.save_survey_response(
  p_session_id uuid, p_answers jsonb, p_step smallint, p_completed boolean,
  p_name text, p_company text, p_contact text, p_score integer, p_skips smallint,
  p_user_agent text
) returns void
language sql
set search_path = public
as $$
  insert into public.survey_responses as r
    (session_id, answers, last_step, completed, completed_at, name, company, contact, score, skips, user_agent)
  values
    (p_session_id, p_answers, p_step, p_completed, case when p_completed then now() end,
     p_name, p_company, p_contact, p_score, p_skips, p_user_agent)
  on conflict (session_id) do update set
    answers      = r.answers || excluded.answers,
    last_step    = greatest(r.last_step, excluded.last_step),
    completed    = r.completed or excluded.completed,
    completed_at = coalesce(r.completed_at, excluded.completed_at),
    name         = coalesce(nullif(excluded.name, ''), r.name),
    company      = coalesce(nullif(excluded.company, ''), r.company),
    contact      = coalesce(nullif(excluded.contact, ''), r.contact),
    score        = excluded.score,
    skips        = excluded.skips,
    updated_at   = now();
$$;

revoke all on function public.save_survey_response(uuid, jsonb, smallint, boolean, text, text, text, integer, smallint, text)
  from public, anon, authenticated;
grant execute on function public.save_survey_response(uuid, jsonb, smallint, boolean, text, text, text, integer, smallint, text)
  to service_role;

-- Funnel: how many people reached at least each step (spot where they drop off).
create view public.survey_funnel with (security_invoker = true) as
select s.step, count(r.id) as reached
from generate_series(0, 9) as s(step)
left join public.survey_responses r on r.last_step >= s.step
group by s.step
order by s.step;

-- Flat, spreadsheet-friendly view of every response.
create view public.survey_answers_flat with (security_invoker = true) as
select
  created_at, updated_at, completed, last_step, name, company, contact,
  answers->>'Role'               as role,
  answers->>'Team size'          as team_size,
  answers->>'Who tests'          as who_tests,
  answers->>'Backlog task'       as backlog_task,
  answers->>'Student experience' as student_experience,
  answers->>'Price'              as price,
  answers->'Comfort'             as comfort,
  answers->>'Trial'              as trial
from public.survey_responses
order by created_at desc;

revoke all on public.survey_funnel, public.survey_answers_flat from anon, authenticated;
