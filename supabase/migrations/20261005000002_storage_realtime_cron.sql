-- Photos, live updates between friends, and the jobs that run while nobody
-- has the app open.

-- ---------------------------------------------------------------------------
-- storage: one private bucket, folders by sky then by person:
--   moments/<sky id>/<user id>/<file>.jpg
-- Anyone in the sky can look; only you can add or remove your own.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moments', 'moments', false, 2097152, array['image/jpeg','image/webp','image/png'])
on conflict (id) do nothing;

create policy "sky photos are visible to the sky" on storage.objects for select to authenticated
  using (bucket_id = 'moments' and (storage.foldername(name))[1] = public.my_sky()::text);
create policy "hang your own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'moments' and (storage.foldername(name))[1] = public.my_sky()::text
              and (storage.foldername(name))[2] = auth.uid()::text);
create policy "remove your own photos" on storage.objects for delete to authenticated
  using (bucket_id = 'moments' and (storage.foldername(name))[2] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- realtime: friends' weather, lanterns, notes, the board and the carousel
-- arrive without a refresh. Row-level security still decides who gets what.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.island_status, public.checkins, public.notes, public.tasks, public.task_members,
  public.moments, public.golden_windows, public.sky_members;

-- ---------------------------------------------------------------------------
-- scheduled jobs
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The golden window: once a day per sky, at a surprise time between 10:00
-- and 20:00 in the sky's own time zone. Runs hourly; a sky that has no window
-- yet today gets one at least half an hour ahead, unless the day is nearly over.
create function private.schedule_golden_windows() returns void
language plpgsql security definer set search_path = '' as $$
declare s record; local_now timestamp; earliest timestamp; latest timestamp; pick timestamp;
begin
  for s in select id, timezone from public.skies loop
    local_now := now() at time zone s.timezone;
    if exists (select 1 from public.golden_windows where sky_id = s.id and local_date = local_now::date) then
      continue;
    end if;
    earliest := greatest(local_now::date + time '10:00', local_now + interval '30 minutes');
    latest   := local_now::date + time '20:00';
    if earliest >= latest then continue; end if;
    pick := earliest + random() * (latest - earliest);
    insert into public.golden_windows (sky_id, local_date, opens_at)
    values (s.id, local_now::date, pick at time zone s.timezone)
    on conflict do nothing;
  end loop;
end $$;

-- New small things on every sky's task board each Monday, so it never goes stale.
create function private.suggest_tasks() returns void
language plpgsql security definer set search_path = '' as $$
declare ideas text[][] := array[
  array['A 30-minute walk outside','exercise','30','3'],
  array['Cook yourself a proper dinner','other','60','3'],
  array['One evening with no screens after 9pm','rest','60','3'],
  array['One focused hour, phone in another room','study','60','2'],
  array['Message someone you miss','social','30','2'],
  array['Ten minutes outside in daylight','rest','15','2'],
  array['Tidy one small corner of your room','errands','30','2'],
  array['Stretch for ten minutes before bed','exercise','15','2']];
  wk int := extract(week from now())::int;
  i int;
begin
  for i in 0..1 loop
    insert into public.tasks (sky_id, title, cat, mins, reward)
    select s.id, ideas[1 + (wk * 2 + i) % 8][1], ideas[1 + (wk * 2 + i) % 8][2],
           ideas[1 + (wk * 2 + i) % 8][3]::smallint, ideas[1 + (wk * 2 + i) % 8][4]::smallint
      from public.skies s;
  end loop;
end $$;

-- Calls one of our Edge Functions. The project URL and the shared cron
-- secret live in Vault (set once per project, never in this file).
create function private.call_function(path text) returns void
language plpgsql security definer set search_path = '' as $$
declare base text; secret text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base is null or secret is null then return; end if;
  perform net.http_post(url := base || '/functions/v1/' || path,
                        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
                        body := '{}'::jsonb, timeout_milliseconds := 60000);
end $$;

revoke all on all functions in schema private from public, anon, authenticated;

select cron.schedule('golden-windows', '5 * * * *', 'select private.schedule_golden_windows()');
select cron.schedule('suggest-tasks', '0 1 * * 1', 'select private.suggest_tasks()');
select cron.schedule('calendar-sync', '17 */3 * * *', $$select private.call_function('google-calendar/sync-all')$$);
select cron.schedule('island-prompts', '*/15 * * * *', $$select private.call_function('prompts')$$);
