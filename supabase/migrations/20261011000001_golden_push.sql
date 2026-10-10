-- The golden window rings on phones and desktops. A push goes out the moment a
-- sky's window opens: windows now start on the minute, and a job looks every
-- minute for one that has just opened. rung_at marks the push as sent, so a
-- window rings once however often the job runs.
alter table public.golden_windows add column rung_at timestamptz;

create or replace function private.schedule_golden_windows() returns void
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
    -- on the minute, so the every-minute job below catches it as it opens
    pick := date_trunc('minute', earliest + random() * (latest - earliest));
    insert into public.golden_windows (sky_id, local_date, opens_at)
    values (s.id, local_now::date, pick at time zone s.timezone)
    on conflict do nothing;
  end loop;
end $$;

-- Cheap when nothing is open: only calls the Edge Function (which sends the
-- pushes and sets rung_at) while a window is open and not yet rung.
create function private.ring_golden_windows() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.golden_windows
              where rung_at is null and now() >= opens_at and now() < opens_at + interval '2 minutes') then
    perform private.call_function('prompts/golden');
  end if;
end $$;

revoke all on function private.ring_golden_windows() from public, anon, authenticated;

select cron.schedule('golden-push', '* * * * *', 'select private.ring_golden_windows()');
