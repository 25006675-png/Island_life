// Google Calendar: connect, import, and (if the student turns it on) send
// island blocks out to a separate "Island Life" calendar.
//
//   POST /google-calendar/start       signed in  -> { url } of Google's consent screen
//   GET  /google-calendar/callback    from Google -> store tokens, first sync, back to the app
//   POST /google-calendar/sync        signed in  -> sync now
//   POST /google-calendar/settings    signed in  -> { write: bool }; may return { url } to grant more
//   POST /google-calendar/disconnect  signed in  -> revoke and forget
//   POST /google-calendar/sync-all    cron       -> everyone, oldest sync first
//
// Import is one-way and read-only: Island Life never edits or deletes events
// in a student's own calendars. Two-way writes only to the calendar it made.
import { admin, allowedReturn, caller, cors, fromCron, json, PUBLIC_FUNCTIONS, sign, verify } from '../_shared/supa.ts';
import { eventFor, eventToBlock, occurrencesBetween, titleKey, type GoogleEvent, type IslandBlock, type Kind } from '../_shared/events.ts';
import { classify } from '../_shared/gemini.ts';

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const REDIRECT = `${PUBLIC_FUNCTIONS}/google-calendar/callback`;
const READ = 'https://www.googleapis.com/auth/calendar.readonly';
const WRITE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/calendar/v3';
const WINDOW_BACK = 28, WINDOW_AHEAD = 28;   // four weeks of history set your normal week on day one

class Reconnect extends Error {}

// ---- tokens -------------------------------------------------------------------
async function tokenRequest(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const body = await res.json();
  if (!res.ok) {
    if (body.error === 'invalid_grant') throw new Reconnect(body.error_description ?? 'invalid_grant');
    throw new Error(`token ${res.status}: ${body.error}`);
  }
  return body as { access_token: string; refresh_token?: string; expires_in: number; scope?: string; id_token?: string };
}

async function accessToken(uid: string): Promise<{ token: string; scope: string }> {
  const { data } = await admin.rpc('svc_google_token', { uid });
  const row = data?.[0];
  if (!row) throw new Reconnect('no token');
  if (row.access_token && Date.parse(row.expires_at) > Date.now() + 60_000) return { token: row.access_token, scope: row.scope };
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: row.refresh_token });
  await admin.rpc('svc_save_google_token', {
    uid, refresh: t.refresh_token ?? null, granted: t.scope ?? '', access: t.access_token,
    expires: new Date(Date.now() + t.expires_in * 1000).toISOString(),
  });
  return { token: t.access_token, scope: t.scope ?? row.scope };
}

async function gcal(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401) throw new Reconnect('unauthorised');
  return res;
}

// ---- sync ---------------------------------------------------------------------
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const todayIn = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

async function kindsFor(uid: string, titles: string[]): Promise<Map<string, Kind>> {
  const keys = [...new Set(titles.map(titleKey))];
  const known = new Map<string, Kind>();
  for (let i = 0; i < keys.length; i += 500) {
    const { data } = await admin.rpc('svc_title_kinds', { uid, keys: keys.slice(i, i + 500) });
    for (const r of data ?? []) known.set(r.title_key, r.cat);
  }
  const missing = keys.filter(k => !known.has(k));
  if (missing.length) {
    const kinds = await classify(missing);
    missing.forEach((k, i) => known.set(k, kinds[i]));
    await admin.rpc('svc_save_title_kinds', { uid, keys: missing, cats: kinds });
  }
  return known;
}

async function importEvents(uid: string, token: string, tz: string, islandCalendar: string | null) {
  const today = todayIn(tz), from = addDays(today, -WINDOW_BACK), to = addDays(today, WINDOW_AHEAD);
  const list = await (await gcal(token, '/users/me/calendarList?minAccessRole=reader&maxResults=250')).json();
  const calendars = (list.items ?? []).filter((c: { id: string; selected?: boolean; hidden?: boolean }) =>
    c.selected !== false && !c.hidden && c.id !== islandCalendar && !/#(holiday|contacts|weather)@/.test(c.id));

  const blocks = new Map<string, ReturnType<typeof eventToBlock> & { calendar: string }>();
  const timeMin = new Date(`${from}T00:00:00Z`).getTime() - 86400_000, timeMax = new Date(`${to}T00:00:00Z`).getTime() + 2 * 86400_000;
  for (const cal of calendars) {
    let page: string | undefined;
    do {
      const q = new URLSearchParams({ singleEvents: 'true', showDeleted: 'false', maxResults: '2500',
        timeMin: new Date(timeMin).toISOString(), timeMax: new Date(timeMax).toISOString(), ...(page ? { pageToken: page } : {}) });
      const res = await gcal(token, `/calendars/${encodeURIComponent(cal.id)}/events?${q}`);
      if (!res.ok) { console.warn('events', cal.id, res.status); break; }
      const body = await res.json();
      for (const ev of (body.items ?? []) as GoogleEvent[]) {
        const b = eventToBlock(ev, tz);
        if (b && b.date >= from && b.date <= to && !blocks.has(b.external_id)) blocks.set(b.external_id, { ...b, calendar: cal.id });
      }
      page = body.nextPageToken;
    } while (page);
  }

  const { data: existing } = await admin.from('blocks').select('id,external_id,cat,kept_cat,date')
    .eq('owner', uid).eq('source', 'google').gte('date', from).lte('date', to);
  const byId = new Map((existing ?? []).map(r => [r.external_id, r]));
  const kinds = await kindsFor(uid, [...blocks.values()].map(b => b!.title));

  const rows = [...blocks.values()].map(b => {
    const old = byId.get(b!.external_id);
    return {
      owner: uid, source: 'google', external_id: b!.external_id, external_calendar: b!.calendar,
      date: b!.date, start_min: b!.start_min, mins: b!.mins, title: b!.title,
      cat: old?.kept_cat ? old.cat : kinds.get(titleKey(b!.title)) ?? 'other',
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from('blocks').upsert(rows.slice(i, i + 500), { onConflict: 'owner,source,external_id' });
    if (error) throw error;
  }
  // events that disappeared from Google inside the window go from the island too
  const gone = (existing ?? []).filter(r => !blocks.has(r.external_id)).map(r => r.id);
  for (let i = 0; i < gone.length; i += 200) await admin.from('blocks').delete().in('id', gone.slice(i, i + 200));
  return { imported: rows.length, removed: gone.length };
}

// Two-way: every island block from yesterday to four weeks ahead appears in the
// "Island Life" calendar. Only that calendar is ever written to.
async function pushBlocks(uid: string, token: string, tz: string, calendarId: string) {
  const today = todayIn(tz), from = addDays(today, -1), to = addDays(today, WINDOW_AHEAD);
  const { data: blocks } = await admin.from('blocks')
    .select('id,date,start_min,mins,title,cat,repeat,skipped,skipped_on,except_on')
    .eq('owner', uid).eq('source', 'island').lte('date', to);
  const desired = new Map<string, ReturnType<typeof eventFor>>();
  for (const b of (blocks ?? []) as IslandBlock[])
    for (const d of occurrencesBetween(b, from, to)) { const e = eventFor(b, d, tz); desired.set(e.key, e); }

  const { data: pushed } = await admin.rpc('svc_pushed_events', { uid });
  const have = new Map<string, { event_id: string; hash: string }>((pushed ?? []).map((p: { block_key: string; event_id: string; hash: string }) => [p.block_key, p]));
  const saved: { block_key: string; event_id: string; hash: string }[] = [], gone: string[] = [];
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  let budget = 150;   // API calls per run; the rest catch up next time

  for (const [key, e] of desired) {
    if (budget <= 0) break;
    const old = have.get(key);
    if (old?.hash === e.hash) continue;
    budget--;
    let res = old ? await gcal(token, `${base}/${encodeURIComponent(old.event_id)}`, { method: 'PUT', body: JSON.stringify(e.body) }) : null;
    if (!res || res.status === 404 || res.status === 410) res = await gcal(token, base, { method: 'POST', body: JSON.stringify(e.body) });
    if (res.status === 404) throw Object.assign(new Error('island calendar gone'), { calendarGone: true });
    if (!res.ok) { console.warn('push', res.status, await res.text()); continue; }
    saved.push({ block_key: key, event_id: (await res.json()).id, hash: e.hash });
  }
  for (const [key, old] of have) {
    if (desired.has(key) || budget <= 0) continue;
    if (key.split('|')[1] < from) continue;   // the past stays as it was
    budget--;
    const res = await gcal(token, `${base}/${encodeURIComponent(old.event_id)}`, { method: 'DELETE' });
    if (res.ok || res.status === 404 || res.status === 410) gone.push(key);
  }
  await admin.rpc('svc_save_pushed_events', { uid, rows: saved, gone });
  return { pushed: saved.length, unpushed: gone.length };
}

async function ensureIslandCalendar(uid: string, token: string, tz: string, current: string | null) {
  if (current) return current;
  const res = await gcal(token, '/calendars', { method: 'POST', body: JSON.stringify({
    summary: 'Island Life', description: 'Blocks you planned on your island. Island Life only ever writes to this calendar.', timeZone: tz }) });
  if (!res.ok) throw new Error(`create calendar ${res.status}`);
  const id = (await res.json()).id as string;
  await admin.from('calendar_connections').update({ island_calendar_id: id }).eq('user_id', uid);
  return id;
}

async function sync(uid: string) {
  const { data: conn } = await admin.from('calendar_connections').select('*').eq('user_id', uid).maybeSingle();
  if (!conn) return { connected: false };
  const { data: profile } = await admin.from('profiles').select('timezone').eq('id', uid).single();
  const tz = profile?.timezone || 'UTC';
  try {
    const { token, scope } = await accessToken(uid);
    const result: Record<string, unknown> = await importEvents(uid, token, tz, conn.island_calendar_id);
    if (conn.write_enabled && scope.includes(WRITE)) {
      try {
        const cal = await ensureIslandCalendar(uid, token, tz, conn.island_calendar_id);
        Object.assign(result, await pushBlocks(uid, token, tz, cal));
      } catch (e) {
        // the student deleted the Island Life calendar: take that as "stop sending"
        if ((e as { calendarGone?: boolean }).calendarGone) {
          await admin.from('calendar_connections').update({ write_enabled: false, island_calendar_id: null }).eq('user_id', uid);
          result.writeStopped = true;
        } else throw e;
      }
    }
    await admin.from('calendar_connections').update({ last_synced_at: new Date().toISOString(), status: 'ok', error: null }).eq('user_id', uid);
    return { connected: true, ...result };
  } catch (e) {
    const reconnect = e instanceof Reconnect;
    await admin.from('calendar_connections').update({ status: reconnect ? 'needs_reconnect' : 'error', error: String(e).slice(0, 300) }).eq('user_id', uid);
    if (!reconnect) console.error('sync', uid, e);
    return { connected: true, status: reconnect ? 'needs_reconnect' : 'error' };
  }
}

// ---- routes -------------------------------------------------------------------
async function consentUrl(uid: string, returnTo: string, write: boolean) {
  const state = await sign({ uid, returnTo, write });
  const q = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code', access_type: 'offline', prompt: 'consent',
    include_granted_scopes: 'true', state, scope: ['openid', 'email', READ, ...(write ? [WRITE] : [])].join(' '),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
const back = (to: string, result: string) => {
  const u = new URL(to); u.searchParams.set('calendar', result);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const route = new URL(req.url).pathname.split('/').pop();

  if (route === 'callback') {
    const url = new URL(req.url);
    const state = await verify<{ uid: string; returnTo: string; write: boolean }>(url.searchParams.get('state'));
    if (!state) return new Response('This link has expired. Go back to Island Life and try again.', { status: 400 });
    const to = allowedReturn(state.returnTo);
    const code = url.searchParams.get('code');
    if (!code) return back(to, 'cancelled');
    try {
      const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT });
      if (!t.refresh_token) return back(to, 'error');
      const claims = t.id_token ? JSON.parse(atob(t.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) : {};
      await admin.rpc('svc_save_google_token', { uid: state.uid, refresh: t.refresh_token, granted: t.scope ?? '',
        access: t.access_token, expires: new Date(Date.now() + t.expires_in * 1000).toISOString() });
      const { data: old } = await admin.from('calendar_connections').select('island_calendar_id').eq('user_id', state.uid).maybeSingle();
      await admin.from('calendar_connections').upsert({
        user_id: state.uid, account_email: claims.email ?? null, status: 'ok', error: null,
        write_enabled: state.write && (t.scope ?? '').includes(WRITE), island_calendar_id: old?.island_calendar_id ?? null,
      });
      await sync(state.uid);
      return back(to, 'connected');
    } catch (e) {
      console.error('callback', e);
      return back(to, 'error');
    }
  }

  if (route === 'sync-all') {
    if (!fromCron(req)) return json({ error: 'forbidden' }, 403);
    const { data } = await admin.from('calendar_connections').select('user_id')
      .neq('status', 'needs_reconnect').order('last_synced_at', { ascending: true, nullsFirst: true }).limit(200);
    const started = Date.now(); let done = 0;
    for (const c of data ?? []) { if (Date.now() - started > 120_000) break; await sync(c.user_id); done++; }
    return json({ synced: done });
  }

  const uid = await caller(req);
  if (!uid) return json({ error: 'sign in first' }, 401);
  const body = await req.json().catch(() => ({}));

  if (route === 'start') return json({ url: await consentUrl(uid, allowedReturn(body.return_to), !!body.write) });
  if (route === 'sync') return json(await sync(uid));
  if (route === 'settings') {
    if (body.write) {
      const { scope } = await accessToken(uid).catch(() => ({ scope: '' }));
      if (!scope.includes(WRITE)) return json({ url: await consentUrl(uid, allowedReturn(body.return_to), true) });
    }
    await admin.from('calendar_connections').update({ write_enabled: !!body.write }).eq('user_id', uid);
    return json(body.write ? await sync(uid) : { write: false });
  }
  if (route === 'disconnect') {
    const { data } = await admin.rpc('svc_google_token', { uid });
    if (data?.[0]?.refresh_token)
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data[0].refresh_token)}`, { method: 'POST' }).catch(() => {});
    const { data: p } = await admin.from('profiles').select('timezone').eq('id', uid).single();
    // imported plans leave the island from today on; past weeks stay as history
    await admin.from('blocks').delete().eq('owner', uid).eq('source', 'google').gte('date', todayIn(p?.timezone || 'UTC'));
    await admin.rpc('svc_forget_google', { uid });
    await admin.from('calendar_connections').delete().eq('user_id', uid);
    return json({ connected: false });
  }
  return json({ error: 'not found' }, 404);
});
