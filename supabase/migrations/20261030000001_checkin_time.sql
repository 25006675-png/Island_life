-- When "How are you?" may ring, chosen by each student (the menu, under Your sky): minutes after
-- midnight in their own time zone. 20:00 by default; never earlier than 08:00, and late enough
-- before the 22:00 quiet hours that the 15-minute prompt run still reaches it.
alter table public.profiles
  add column checkin_min smallint not null default 1200 check (checkin_min between 480 and 1290);
