-- Little Reminders schema. Safe to re-run.
-- XP is awarded ONLY by the record_event() function; clients cannot write it directly.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  created_at timestamptz not null default now()
);
-- Migration from the streak version
alter table public.profiles drop column if exists streak;
alter table public.profiles drop column if exists last_seen;
alter table public.profiles alter column xp set default 0;

create table if not exists public.saved_reminders (
  user_id uuid references auth.users(id) on delete cascade,
  reminder_number text not null check (char_length(reminder_number) <= 10),
  created_at timestamptz not null default now(),
  primary key (user_id, reminder_number)
);

create table if not exists public.reminder_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_number text not null check (char_length(reminder_number) <= 10),
  event_type text not null check (event_type in ('view','next','save','unsave')),
  xp_awarded integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists activity_user_day on public.reminder_activity (user_id, created_at);

alter table public.profiles enable row level security;
alter table public.saved_reminders enable row level security;
alter table public.reminder_activity enable row level security;

drop policy if exists "Users can read their profile" on public.profiles;
drop policy if exists "Users can create their profile" on public.profiles;
drop policy if exists "Users can update their profile" on public.profiles;
drop policy if exists "Users manage their saved reminders" on public.saved_reminders;
drop policy if exists "Users read own activity" on public.reminder_activity;
drop policy if exists "Users add own activity" on public.reminder_activity;

create policy "Users can read their profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "Users manage their saved reminders" on public.saved_reminders
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users read own activity" on public.reminder_activity
  for select to authenticated using (auth.uid() = user_id);

-- No client writes to profiles or activity: only the function below.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.reminder_activity from anon, authenticated;

-- Auto-create a profile for every new (anonymous) user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Server-side gamification: +10 XP per new reminder, +10 XP the first time a reminder
-- is saved, capped at 100 XP per day so the counter can't be farmed.
create or replace function public.record_event(p_reminder text, p_event text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  gained int := 0;
  today_xp int;
  new_xp int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_event not in ('view','next','save','unsave') or char_length(p_reminder) > 10 then
    raise exception 'invalid event';
  end if;

  select coalesce(sum(xp_awarded), 0) into today_xp
  from public.reminder_activity
  where user_id = uid and created_at >= date_trunc('day', now());

  if p_event = 'next' then
    gained := 10;
  elsif p_event = 'save' and not exists (
    select 1 from public.reminder_activity
    where user_id = uid and reminder_number = p_reminder
      and event_type = 'save' and xp_awarded > 0
  ) then
    gained := 10;
  end if;
  gained := least(gained, greatest(0, 100 - today_xp));

  insert into public.reminder_activity (user_id, reminder_number, event_type, xp_awarded)
  values (uid, p_reminder, p_event, gained);

  update public.profiles set xp = xp + gained where id = uid returning xp into new_xp;
  return jsonb_build_object('xp', coalesce(new_xp, 0), 'awarded', gained);
end; $$;

revoke all on function public.record_event(text, text) from public, anon;
grant execute on function public.record_event(text, text) to authenticated;

-- Community quotes: anonymous, moderated. New quotes are hidden until approved.
create table if not exists public.public_quotes (
  id bigint generated always as identity primary key,
  quote text not null check (char_length(quote) between 2 and 240),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.public_quotes add column if not exists approved boolean not null default false;
alter table public.public_quotes enable row level security;
drop policy if exists "Anyone can read public quotes" on public.public_quotes;
drop policy if exists "Anyone can share public quotes" on public.public_quotes;
create policy "Anyone can read approved quotes" on public.public_quotes
  for select to anon, authenticated using (approved = true);
create policy "Anyone can submit unapproved quotes" on public.public_quotes
  for insert to anon, authenticated with check (approved = false);
-- Approve in the Supabase Table Editor, or for a demo: update public.public_quotes set approved = true;