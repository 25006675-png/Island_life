-- Server-only helpers for the Edge Functions. Only the service role can call
-- these; the app (anon, authenticated) cannot see the private schema at all.

-- which island block became which event in the student's "Island Life"
-- Google calendar (two-way sync), one row per dated occurrence
create table private.pushed_events (
  user_id    uuid not null references public.profiles on delete cascade,
  block_key  text not null,          -- '<block id>|<date>'
  event_id   text not null,
  hash       text not null,          -- what was sent, so unchanged blocks are skipped
  primary key (user_id, block_key)
);
alter table private.pushed_events enable row level security;

create function public.svc_google_token(uid uuid)
returns table (refresh_token text, scope text, access_token text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select refresh_token, scope, access_token, expires_at from private.google_tokens where user_id = uid
$$;

create function public.svc_save_google_token(uid uuid, refresh text, granted text, access text, expires timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into private.google_tokens (user_id, refresh_token, scope, access_token, expires_at)
  values (uid, refresh, coalesce(granted, ''), access, expires)
  on conflict (user_id) do update set
    refresh_token = coalesce(excluded.refresh_token, private.google_tokens.refresh_token),
    scope         = case when excluded.scope = '' then private.google_tokens.scope else excluded.scope end,
    access_token  = excluded.access_token,
    expires_at    = excluded.expires_at
$$;

create function public.svc_forget_google(uid uuid)
returns void language sql security definer set search_path = '' as $$
  delete from private.google_tokens where user_id = uid;
  delete from private.pushed_events where user_id = uid;
$$;

create function public.svc_title_kinds(uid uuid, keys text[])
returns table (title_key text, cat text)
language sql stable security definer set search_path = '' as $$
  select title_key, cat from private.title_kinds where user_id = uid and title_key = any(keys)
$$;

create function public.svc_save_title_kinds(uid uuid, keys text[], cats text[])
returns void language sql security definer set search_path = '' as $$
  insert into private.title_kinds (user_id, title_key, cat)
  select uid, k, c from unnest(keys, cats) as t(k, c)
  on conflict (user_id, title_key) do update set cat = excluded.cat
$$;

create function public.svc_pushed_events(uid uuid)
returns table (block_key text, event_id text, hash text)
language sql stable security definer set search_path = '' as $$
  select block_key, event_id, hash from private.pushed_events where user_id = uid
$$;

create function public.svc_save_pushed_events(uid uuid, rows jsonb, gone text[])
returns void language sql security definer set search_path = '' as $$
  delete from private.pushed_events where user_id = uid and block_key = any(gone);
  insert into private.pushed_events (user_id, block_key, event_id, hash)
  select uid, r->>'block_key', r->>'event_id', r->>'hash' from jsonb_array_elements(rows) r
  on conflict (user_id, block_key) do update set event_id = excluded.event_id, hash = excluded.hash;
$$;

revoke execute on function public.svc_google_token(uuid), public.svc_save_google_token(uuid, text, text, text, timestamptz),
  public.svc_forget_google(uuid), public.svc_title_kinds(uuid, text[]), public.svc_save_title_kinds(uuid, text[], text[]),
  public.svc_pushed_events(uuid), public.svc_save_pushed_events(uuid, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.svc_google_token(uuid), public.svc_save_google_token(uuid, text, text, text, timestamptz),
  public.svc_forget_google(uuid), public.svc_title_kinds(uuid, text[]), public.svc_save_title_kinds(uuid, text[], text[]),
  public.svc_pushed_events(uuid), public.svc_save_pushed_events(uuid, jsonb, text[]) to service_role;
