-- The dewdrop shop. Dewdrops themselves are never stored: what you have earned
-- is counted from what you have lived (the same sources as src/life.js dew(),
-- but over all time rather than this week, so savings never reset on Monday),
-- and what you have spent is your purchases. buy() checks the price and your
-- balance in one step, so the app can't spend drops you don't have.

create table public.shop_items (
  id    text primary key,
  cost  smallint not null check (cost > 0)
);
-- keep in step with src/shop.js ITEMS
insert into public.shop_items (id, cost) values
  ('flowers', 15), ('bench', 30), ('lanterns', 40), ('kite', 50), ('well', 60);

create table public.purchases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles on delete cascade,
  item        text not null references public.shop_items,
  cost        smallint not null,
  created_at  timestamptz not null default now(),
  unique (user_id, item)
);

alter table public.shop_items enable row level security;
alter table public.purchases  enable row level security;
create policy "prices are public to the signed in" on public.shop_items for select to authenticated using (true);
-- what you bought stands on your island, so your sky sees it; rows are only
-- ever written by buy()
create policy "sky purchases" on public.purchases for select to authenticated
  using (user_id = auth.uid() or public.shares_sky(user_id));

alter publication supabase_realtime add table public.purchases;

-- Everything earned, ever (src/life.js dew()):
--   1 per block done, at most 12 a day (plan.js isDone: earlier days count
--     unless let go; today only once marked Done), from the week you joined
--   3 per golden-window photo
--   1 per note you read, and 1 per friend you leave a note for, once a day
--   a shared task's reward, plus 1 for each friend who finished it too
create function private.dew_earned(uid uuid) returns integer
language sql stable security definer set search_path = '' as $$
  with me as (
    select (now() at time zone p.timezone)::date as today, date_trunc('week', p.created_at)::date as since
      from public.profiles p where p.id = uid
  ),
  done as (
    select b.date as day from public.blocks b, me
     where b.owner = uid and not b.repeat and not b.skipped
       and b.date >= me.since and (b.date < me.today or (b.done and b.date = me.today))
    union all
    select o.day from public.blocks b, me,
           lateral (select g::date as day from generate_series(greatest(b.date, me.since), me.today, interval '1 day') g) o
     where b.owner = uid and b.repeat and extract(isodow from o.day) = extract(isodow from b.date)
       and not o.day = any(b.except_on) and not o.day = any(b.skipped_on)
       and (o.day < me.today or o.day = any(b.done_on))
  )
  select (
      coalesce((select sum(least(n, 12)) from (select count(*) as n from done group by day) d), 0)
    + 3 * (select count(*) from public.moments where owner = uid and golden)
    + (select count(*) from public.notes where to_id = uid and read_at is not null)
    + (select count(distinct to_id::text || (created_at at time zone 'UTC')::date) from public.notes where from_id = uid)
    + coalesce((select sum(t.reward + (select count(*) from public.task_members f where f.task_id = t.id and f.done_at is not null) - 1)
                  from public.task_members m join public.tasks t on t.id = m.task_id
                 where m.user_id = uid and m.done_at is not null), 0)
  )::integer
$$;

create function public.dew_balance() returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(private.dew_earned(auth.uid()), 0)
       - coalesce((select sum(cost) from public.purchases where user_id = auth.uid()), 0)::integer
$$;

create function public.buy(item_id text) returns public.purchases
language plpgsql security definer set search_path = '' as $$
declare price smallint; bought public.purchases;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  -- two taps at once can't both spend the same drops
  perform pg_advisory_xact_lock(hashtext('dew:' || auth.uid()::text));
  select cost into price from public.shop_items where id = item_id;
  if price is null then raise exception 'no such item' using errcode = 'P0002'; end if;
  if exists (select 1 from public.purchases where user_id = auth.uid() and item = item_id) then
    raise exception 'already on your island' using errcode = '23505';
  end if;
  if public.dew_balance() < price then raise exception 'not enough dewdrops' using errcode = 'P0001'; end if;
  insert into public.purchases (user_id, item, cost) values (auth.uid(), item_id, price) returning * into bought;
  return bought;
end $$;

revoke all on function private.dew_earned(uuid) from public, anon, authenticated;
revoke execute on function public.dew_balance(), public.buy(text) from public, anon;
grant execute on function public.dew_balance(), public.buy(text) to authenticated;
