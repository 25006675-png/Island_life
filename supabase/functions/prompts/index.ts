// Phone prompts (docs/algorithm.md 5.2), run every 15 minutes by pg_cron.
//
//   "How are you?"  once in the evening, unless already answered. The app
//                   follows it with "How draining was that?" about at most two
//                   of the day's activities (src/readings.js eveningAsks), so
//                   the whole day costs one notification.
//
// Never between 22:00 and 08:00, never during an activity, and three ignored
// prompts in a row halve the asking for a week. Tapping the notification opens
// the app on the question.
//
// prompts/golden, called by pg_cron the minute a sky's golden window opens:
// everyone in the sky hears it at once, outside quiet hours.
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { admin, cors, fromCron, json } from '../_shared/supa.ts';
import { occurrencesBetween, type IslandBlock } from '../_shared/events.ts';

let server: webpush.ApplicationServer | null = null;
async function pushServer() {
  if (server) return server;
  const keys = await webpush.importVapidKeys(JSON.parse(Deno.env.get('VAPID_KEYS') ?? '{}'), { extractable: false });
  server = await webpush.ApplicationServer.new({ contactInformation: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@island.life', vapidKeys: keys });
  return server;
}

function localNow(tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: +p.hour * 60 + +p.minute };
}

async function send(userId: string, payload: Record<string, string>,
                    { ttl = 3600, urgency = webpush.Urgency.Normal }: { ttl?: number; urgency?: webpush.Urgency } = {}) {
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', userId);
  const app = await pushServer();
  let delivered = false;
  for (const s of subs ?? []) {
    try {
      await app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(JSON.stringify(payload), { ttl, urgency, topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) });
      delivered = true;
    } catch (e) {
      if (e instanceof webpush.PushMessageError && (e.isGone() || e.response.status === 404))
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      else console.warn('push', e);
    }
  }
  return delivered;
}

async function promptUser(userId: string, tz: string) {
  const now = localNow(tz);
  if (now.minute < 8 * 60 || now.minute >= 22 * 60) return 'quiet hours';

  const { data: rows } = await admin.from('blocks')
    .select('id,date,start_min,mins,title,cat,repeat,skipped,skipped_on,except_on')
    .eq('owner', userId).lte('date', now.date);
  const today = ((rows ?? []) as IslandBlock[])
    .filter(b => occurrencesBetween(b, now.date, now.date).length);
  if (today.some(b => b.start_min <= now.minute && now.minute < b.start_min + b.mins)) return 'busy';

  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: recent } = await admin.from('prompts').select('kind,occurred_on,sent_at,answered_at')
    .eq('user_id', userId).gte('sent_at', weekAgo).order('sent_at', { ascending: false });
  const sentToday = (recent ?? []).filter(p => p.occurred_on === now.date);
  const ignored = (recent ?? []).slice(0, 3);
  const backingOff = ignored.length === 3 && ignored.every(p => !p.answered_at);

  // "How are you?" -- once, between 20:00 and 22:00, unless already answered today
  if (now.minute >= 20 * 60 && !sentToday.some(p => p.kind === 'mood') && !(backingOff && new Date().getUTCDate() % 2)) {
    const { count } = await admin.from('checkins').select('id', { count: 'exact', head: true }).eq('owner', userId).eq('local_date', now.date);
    if (!count) {
      const { error } = await admin.from('prompts').insert({ user_id: userId, kind: 'mood', occurred_on: now.date });
      if (!error) {
        await send(userId, { title: 'How are you?', body: 'One tap for a lantern, then a quick word about today.', url: '/?ask=mood', tag: `mood-${now.date}` });
        return 'asked mood';
      }
    }
  }
  return 'nothing to ask';
}

// The golden window: claim the windows that have just opened (rung_at keeps
// it to one push per window), then ring every member. The push expires with
// the window, so a phone that was off never buzzes about a window long gone.
const WINDOW_MS = 120_000;
async function ringGolden() {
  const now = Date.now();
  const { data: windows } = await admin.from('golden_windows').update({ rung_at: new Date(now).toISOString() })
    .is('rung_at', null).lte('opens_at', new Date(now).toISOString()).gt('opens_at', new Date(now - WINDOW_MS).toISOString())
    .select('sky_id,opens_at');
  const rung: Record<string, number> = {};
  for (const w of windows ?? []) {
    const ttl = Math.max(1, Math.floor((Date.parse(w.opens_at) + WINDOW_MS - now) / 1000));
    const { data: members } = await admin.from('sky_members').select('user_id').eq('sky_id', w.sky_id);
    const ids = (members ?? []).map(m => m.user_id);
    const { data: profiles } = ids.length ? await admin.from('profiles').select('id,timezone').in('id', ids) : { data: [] };
    rung[w.sky_id] = 0;
    for (const p of profiles ?? []) {
      const { minute } = localNow(p.timezone || 'UTC');
      if (minute < 8 * 60 || minute >= 22 * 60) continue;
      try {
        if (await send(p.id, { title: '✦ The golden window is open', body: 'Two minutes, everyone at once. Share this moment.',
          url: '/?golden', tag: 'golden-window', keep: '1' }, { ttl, urgency: webpush.Urgency.High })) rung[w.sky_id]++;
      } catch (e) { console.error('golden', p.id, e); }
    }
  }
  return rung;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!fromCron(req)) return json({ error: 'forbidden' }, 403);
  if (new URL(req.url).pathname.split('/').pop() === 'golden') return json({ rung: await ringGolden() });
  const { data: subs } = await admin.from('push_subscriptions').select('user_id');
  const users = [...new Set((subs ?? []).map(s => s.user_id))];
  const { data: profiles } = users.length ? await admin.from('profiles').select('id,timezone').in('id', users) : { data: [] };
  const results: Record<string, string> = {};
  for (const p of profiles ?? []) {
    try { results[p.id] = await promptUser(p.id, p.timezone || 'UTC'); }
    catch (e) { console.error('prompt', p.id, e); results[p.id] = 'error'; }
  }
  return json({ users: users.length, results });
});
