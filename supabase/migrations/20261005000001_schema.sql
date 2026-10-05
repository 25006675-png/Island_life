-- Island Life: accounts, skies (friend groups of up to five), plans, answers,
-- feelings, notes, the task board, the carousel and calendar links.
--
-- Privacy rule of thumb (docs/algorithm.md, README "privacy-first bridges"):
-- a student's own rows are theirs alone. Friends in the same sky only ever
-- read what the island shows: weather, altitude, lanterns, and blocks with
-- their visibility applied. Everything friend-facing goes through a security
-- definer function or a sky-wide policy written for that purpose.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null default '' check (char_length(name) <= 40),
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now()
);

-- every new account gets a profile, named from Google or the email address
create function private.new_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(nullif(new.raw_user_meta_data->>'name', ''),
                                nullif(new.raw_user_meta_data->>'full_name', ''),
                                split_part(new.email, '@', 1), ''), 40));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.new_profile();

-- ---------------------------------------------------------------------------
-- skies: one shared sky per friend group, five islands at most
-- ---------------------------------------------------------------------------
create table public.skies (
  id           uuid primary key default gen_random_uuid(),
  invite_code  text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  timezone     text not null default 'UTC',
  created_by   uuid references public.profiles on delete set null,
  created_at   timestamptz not null default now()
);

create table public.sky_members (
  sky_id     uuid not null references public.skies on delete cascade,
  user_id    uuid not null unique references public.profiles on delete cascade,
  slot       smallint not null check (slot between 1 and 5),
  joined_at  timestamptz not null default now(),
  primary key (sky_id, user_id),
  unique (sky_id, slot)
);

-- the caller's sky, and whether someone shares it; used by every policy below
create function public.my_sky() returns uuid
language sql stable security definer set search_path = '' as $$
  select sky_id from public.sky_members where user_id = auth.uid()
$$;
create function public.shares_sky(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sky_members a join public.sky_members b using (sky_id)
                 where a.user_id = auth.uid() and b.user_id = other)
$$;

-- ---------------------------------------------------------------------------
-- blocks: the plan. Repeating blocks are one row with per-date exceptions,
-- exactly like src/plan.js.
-- ---------------------------------------------------------------------------
create table public.blocks (
  id                 uuid primary key default gen_random_uuid(),
  owner              uuid not null default auth.uid() references public.profiles on delete cascade,
  date               date not null,
  start_min          smallint not null check (start_min between 0 and 1439),
  mins               smallint not null check (mins between 5 and 1440),
  cat                text not null check (cat in ('study','work','errands','social','exercise','rest','other')),
  title              text not null check (char_length(title) between 1 and 120),
  vis                text not null default 'silhouette' check (vis in ('open','silhouette','hidden')),
  priority           text not null default 'normal' check (priority in ('normal','low')),
  repeat             boolean not null default false,
  skipped            boolean not null default false,
  done               boolean not null default false,
  skipped_on         date[] not null default '{}',
  done_on            date[] not null default '{}',
  except_on          date[] not null default '{}',
  -- where it came from: made on the island, or imported from Google Calendar
  source             text not null default 'island' check (source in ('island','google')),
  external_id        text,
  external_calendar  text,
  kept_cat           boolean not null default false,   -- the student changed the kind; sync keeps theirs
  -- two-way sync: the event this block became in the "Island Life" calendar
  google_event_id    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (owner, source, external_id)
);
create index blocks_owner_date on public.blocks (owner, date);

create function private.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger blocks_touch before update on public.blocks for each row execute function private.touch();

-- ---------------------------------------------------------------------------
-- answers to "How draining was that?" (owner only; never shown to friends)
-- ---------------------------------------------------------------------------
create table public.drain_answers (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references public.profiles on delete cascade,
  block_id     uuid references public.blocks on delete set null,
  occurred_on  date not null,
  start_min    smallint not null check (start_min between 0 and 1439),
  mins         smallint not null check (mins between 5 and 1440),
  cat          text not null check (cat in ('study','work','errands','social','exercise','rest','other')),
  answer       text not null check (answer in ('light','okay','draining')),
  created_at   timestamptz not null default now(),
  unique (block_id, occurred_on)
);
create index drain_answers_owner on public.drain_answers (owner, occurred_on);

-- ---------------------------------------------------------------------------
-- check-ins: "How are you?" Each one is a lantern; friends see a week of them.
-- ---------------------------------------------------------------------------
create table public.checkins (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references public.profiles on delete cascade,
  at          timestamptz not null default now(),
  local_date  date not null,
  minute      smallint not null check (minute between 0 and 1439),
  mood        text not null check (mood in ('calm','happy','tired','stressed','low')),
  photo_path  text
);
create index checkins_owner_at on public.checkins (owner, at desc);

-- what friends see of an island, published by its owner's own app: how far
-- it has sunk (0..1) and its weather (0..1). Never hours, never titles.
create table public.island_status (
  user_id     uuid primary key default auth.uid() references public.profiles on delete cascade,
  sink        real not null default 0 check (sink between 0 and 1),
  strain      real not null default 0 check (strain between 0 and 1),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- notes: a few words left at a friend's gate
-- ---------------------------------------------------------------------------
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  to_id       uuid not null references public.profiles on delete cascade,
  text        text not null check (char_length(text) between 1 and 200),
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  check (from_id <> to_id)
);
create index notes_to on public.notes (to_id, created_at desc);

-- ---------------------------------------------------------------------------
-- the task board
-- ---------------------------------------------------------------------------
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  sky_id      uuid not null references public.skies on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  cat         text not null check (cat in ('study','work','errands','social','exercise','rest','other')),
  mins        smallint not null default 30 check (mins between 5 and 240),
  posted_by   uuid references public.profiles on delete set null,   -- null: suggested for the group
  reward      smallint not null default 2 check (reward between 1 and 5),
  created_at  timestamptz not null default now()
);
create index tasks_sky on public.tasks (sky_id, created_at desc);

create table public.task_members (
  task_id     uuid not null references public.tasks on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  joined_at   timestamptz not null default now(),
  done_at     timestamptz,
  photo_path  text,
  primary key (task_id, user_id)
);

-- ---------------------------------------------------------------------------
-- the carousel and the golden window
-- ---------------------------------------------------------------------------
create table public.golden_windows (
  sky_id      uuid not null references public.skies on delete cascade,
  local_date  date not null,
  opens_at    timestamptz not null,
  primary key (sky_id, local_date)
);

create table public.moments (
  id          uuid primary key default gen_random_uuid(),
  sky_id      uuid not null default public.my_sky() references public.skies on delete cascade,
  owner       uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at  timestamptz not null default now(),
  local_date  date not null,
  minute      smallint not null check (minute between 0 and 1439),
  caption     text not null default '' check (char_length(caption) <= 80),
  photo_path  text not null,
  golden      boolean not null default false
);
create index moments_sky on public.moments (sky_id, created_at desc);

-- golden is decided here, not by the app: inside the sky's two-minute window,
-- and only once per person per window
create function private.moment_golden() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w record;
begin
  new.golden := false;
  new.created_at := now();
  select * into w from public.golden_windows
   where sky_id = new.sky_id and now() between opens_at and opens_at + interval '2 minutes'
   order by opens_at desc limit 1;
  if found and not exists (select 1 from public.moments m where m.sky_id = new.sky_id and m.owner = new.owner
                           and m.golden and m.created_at >= w.opens_at) then
    new.golden := true;
  end if;
  return new;
end $$;
create trigger moments_golden before insert on public.moments for each row execute function private.moment_golden();

-- ---------------------------------------------------------------------------
-- calendars and phone prompts
-- ---------------------------------------------------------------------------
create table public.calendar_connections (
  user_id            uuid primary key default auth.uid() references public.profiles on delete cascade,
  provider           text not null default 'google' check (provider in ('google')),
  account_email      text,
  write_enabled      boolean not null default false,   -- two-way: send island blocks to Google
  island_calendar_id text,                             -- the separate "Island Life" calendar we write to
  last_synced_at     timestamptz,
  status             text not null default 'ok' check (status in ('ok','needs_reconnect','error')),
  error              text,
  created_at         timestamptz not null default now()
);

-- refresh tokens never leave the server: no API role can read this schema
create table private.google_tokens (
  user_id        uuid primary key references public.profiles on delete cascade,
  refresh_token  text not null,
  scope          text not null default '',
  access_token   text,
  expires_at     timestamptz
);
create table private.title_kinds (            -- Gemini's sorting of event titles, per student
  user_id    uuid not null references public.profiles on delete cascade,
  title_key  text not null,
  cat        text not null,
  primary key (user_id, title_key)
);

create table public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create table public.prompts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles on delete cascade,
  kind         text not null check (kind in ('drain','mood','forecast')),
  block_id     uuid references public.blocks on delete cascade,
  occurred_on  date not null,
  sent_at      timestamptz not null default now(),
  answered_at  timestamptz,
  unique (user_id, kind, block_id, occurred_on)
);
create index prompts_user on public.prompts (user_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.skies               enable row level security;
alter table public.sky_members         enable row level security;
alter table public.blocks              enable row level security;
alter table public.drain_answers       enable row level security;
alter table public.checkins            enable row level security;
alter table public.island_status       enable row level security;
alter table public.notes               enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_members        enable row level security;
alter table public.golden_windows      enable row level security;
alter table public.moments             enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.prompts             enable row level security;
alter table private.google_tokens      enable row level security;
alter table private.title_kinds        enable row level security;

-- profiles: yourself, and the names of people in your sky
create policy "read own and sky profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_sky(id));
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- skies are created and joined through functions; members can read theirs
create policy "read my sky" on public.skies for select to authenticated using (id = public.my_sky());
create policy "read my sky members" on public.sky_members for select to authenticated using (sky_id = public.my_sky());

-- the owner's own rows
create policy "own blocks" on public.blocks for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy "own answers" on public.drain_answers for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy "own connection" on public.calendar_connections for select to authenticated using (user_id = auth.uid());
create policy "own subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own prompts" on public.prompts for select to authenticated using (user_id = auth.uid());
create policy "answer own prompts" on public.prompts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- lanterns: yours, plus your sky's from the last eight days
create policy "own checkins" on public.checkins for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy "sky lanterns" on public.checkins for select to authenticated
  using (public.shares_sky(owner) and at > now() - interval '8 days');

-- island status: write your own, read your sky's
create policy "own status" on public.island_status for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sky status" on public.island_status for select to authenticated using (public.shares_sky(user_id));

-- notes: only to someone in your sky; readable by sender and recipient;
-- the recipient marks them read
create policy "write notes in sky" on public.notes for insert to authenticated
  with check (from_id = auth.uid() and public.shares_sky(to_id));
create policy "read my notes" on public.notes for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());
create policy "mark my notes read" on public.notes for update to authenticated
  using (to_id = auth.uid()) with check (to_id = auth.uid());

-- the task board belongs to the sky
create policy "sky tasks" on public.tasks for select to authenticated using (sky_id = public.my_sky());
create policy "post sky tasks" on public.tasks for insert to authenticated
  with check (sky_id = public.my_sky() and posted_by = auth.uid());
create policy "sky task members" on public.task_members for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and t.sky_id = public.my_sky()));
create policy "join sky tasks" on public.task_members for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id and t.sky_id = public.my_sky()));
create policy "finish own tasks" on public.task_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "leave own tasks" on public.task_members for delete to authenticated using (user_id = auth.uid());

-- the carousel: today's photos in your sky
create policy "sky moments" on public.moments for select to authenticated
  using (sky_id = public.my_sky() and created_at > now() - interval '36 hours');
create policy "hang own moments" on public.moments for insert to authenticated
  with check (owner = auth.uid() and sky_id = public.my_sky());
create policy "take down own moments" on public.moments for delete to authenticated using (owner = auth.uid());
create policy "sky golden windows" on public.golden_windows for select to authenticated using (sky_id = public.my_sky());

-- ---------------------------------------------------------------------------
-- functions the app calls
-- ---------------------------------------------------------------------------

-- start a new sky; you take the first island
create function public.create_sky(tz text default 'UTC') returns public.skies
language plpgsql security definer set search_path = '' as $$
declare s public.skies;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.sky_members where user_id = auth.uid()) then
    raise exception 'already in a sky';
  end if;
  insert into public.skies (created_by, timezone) values (auth.uid(), coalesce(nullif(tz, ''), 'UTC')) returning * into s;
  insert into public.sky_members (sky_id, user_id, slot) values (s.id, auth.uid(), 1);
  insert into public.tasks (sky_id, title, cat, mins, reward) values
    (s.id, 'A 30-minute walk outside', 'exercise', 30, 3),
    (s.id, 'Message someone you miss', 'social', 30, 2);
  return s;
end $$;

-- join with an invite code; you take the lowest free island
create function public.join_sky(code text) returns public.skies
language plpgsql security definer set search_path = '' as $$
declare s public.skies; free smallint;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.sky_members where user_id = auth.uid()) then
    raise exception 'already in a sky';
  end if;
  select * into s from public.skies where invite_code = upper(trim(code)) for update;
  if not found then raise exception 'no sky with that code'; end if;
  select min(n) into free from generate_series(1, 5) n
   where n not in (select slot from public.sky_members where sky_id = s.id);
  if free is null then raise exception 'this sky is full'; end if;
  insert into public.sky_members (sky_id, user_id, slot) values (s.id, auth.uid(), free);
  return s;
end $$;

create function public.leave_sky() returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  delete from public.sky_members where user_id = auth.uid() returning sky_id into sid;
  delete from public.skies where id = sid and not exists (select 1 from public.sky_members where sky_id = sid);
end $$;

-- friends' blocks with visibility applied: hidden ones never leave the
-- database, and a title is only sent when its owner chose "Everything"
create function public.sky_blocks(from_date date, to_date date)
returns table (id uuid, owner uuid, date date, start_min smallint, mins smallint, cat text, title text, vis text,
               repeat boolean, skipped boolean, done boolean, skipped_on date[], done_on date[], except_on date[])
language sql stable security definer set search_path = '' as $$
  select b.id, b.owner, b.date, b.start_min, b.mins, b.cat,
         case when b.vis = 'open' then b.title end, b.vis,
         b.repeat, b.skipped, b.done, b.skipped_on, b.done_on, b.except_on
    from public.blocks b
   where b.owner <> auth.uid() and public.shares_sky(b.owner) and b.vis <> 'hidden'
     and b.date <= to_date and (b.repeat or b.date >= from_date)
$$;

-- what waits at each gate in your sky: who left notes for whom, never the words
create function public.gate_notes()
returns table (from_id uuid, to_id uuid, created_at timestamptz, is_read boolean)
language sql stable security definer set search_path = '' as $$
  select n.from_id, n.to_id, n.created_at, n.read_at is not null
    from public.notes n
   where public.shares_sky(n.to_id) and public.shares_sky(n.from_id)
     and n.created_at > now() - interval '14 days'
$$;

-- functions are callable by everyone unless revoked: signed-in students only
revoke execute on function public.my_sky(), public.shares_sky(uuid), public.create_sky(text), public.join_sky(text),
                public.leave_sky(), public.sky_blocks(date, date), public.gate_notes() from public, anon;
grant execute on function public.my_sky(), public.shares_sky(uuid), public.create_sky(text), public.join_sky(text),
                public.leave_sky(), public.sky_blocks(date, date), public.gate_notes() to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
