// Phone prompts (docs/algorithm.md 5.2), run every 15 minutes by pg_cron.
//
//   "How draining was <activity>?"  soon after a block of 30+ minutes ends,
//                                   at most 2 a day, least-known kinds first
//   "How are you?"                  once in the evening, unless already answered
//
// Never between 22:00 and 08:00, never during an activity, and three ignored
// prompts in a row halve the asking for a week. Tapping a notification opens
// the app on the question.
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { admin, cors, fromCron, json } from '../_shared/supa.ts';
import { occurrencesBetween, type IslandBlock } from '../_shared/events.ts';

const KIND_LABEL: Record<string, string> = { study: 'study', work: 'work', errands: 'errand', social: 'time with friends',
  exercise: 'exercise', rest: 'rest', other: 'activity' };

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

async function send(userId: string, payload: Record<string, string>) {
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', userId);
  const app = await pushServer();
  let delivered = false;
  for (const s of subs ?? []) {
    try {
      await app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(JSON.stringify(payload), { ttl: 3600, topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) });
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
    .select('id,date,start_min,mins,title,cat,repeat,skipped,skipped_on,except_on,done,done_on')
    .eq('owner', userId).lte('date', now.date);
  const today = ((rows ?? []) as (IslandBlock & { done: boolean; done_on: string[] })[])
    .filter(b => occurrencesBetween(b, now.date, now.date).length);
  if (today.some(b => b.start_min <= now.minute && now.minute < b.start_min + b.mins)) return 'busy';

  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: recent } = await admin.from('prompts').select('kind,occurred_on,sent_at,answered_at')
    .eq('user_id', userId).gte('sent_at', weekAgo).order('sent_at', { ascending: false });
  const sentToday = (recent ?? []).filter(p => p.occurred_on === now.date);
  const ignored = (recent ?? []).slice(0, 3);
  const backingOff = ignored.length === 3 && ignored.every(p => !p.answered_at);
  const drainCap = backingOff ? 1 : 2;

  // "How draining was that?" -- a block of 30+ minutes that ended in the last hour
  const ended = today.filter(b => b.mins >= 30 && b.start_min + b.mins <= now.minute && b.start_min + b.mins > now.minute - 60);
  if (ended.length && sentToday.filter(p => p.kind === 'drain').length < drainCap) {
    const { data: answers } = await admin.from('drain_answers').select('block_id,occurred_on,cat').eq('owner', userId);
    const answered = new Set((answers ?? []).filter(a => a.occurred_on === now.date).map(a => a.block_id));
    const perKind: Record<string, number> = {};
    for (const a of answers ?? []) perKind[a.cat] = (perKind[a.cat] ?? 0) + 1;
    const { data: asked } = await admin.from('prompts').select('block_id').eq('user_id', userId).eq('kind', 'drain').eq('occurred_on', now.date);
    const askedIds = new Set((asked ?? []).map(p => p.block_id));
    // least-known kind first; the chance never drops below 0.15, rest is rarely asked
    const candidates = ended.filter(b => !answered.has(b.id) && !askedIds.has(b.id))
      .map(b => ({ b, chance: Math.min(1, Math.max(.15, 1 / Math.sqrt((perKind[b.cat] ?? 0) + 1))) * (b.cat === 'rest' ? .3 : 1) }))
      .sort((x, y) => y.chance - x.chance);
    const pick = candidates.find(c => Math.random() < c.chance);
    if (pick) {
      const { error } = await admin.from('prompts').insert({ user_id: userId, kind: 'drain', block_id: pick.b.id, occurred_on: now.date });
      if (!error) {
        await send(userId, { title: `How draining was ${pick.b.title}?`, body: `Light, okay or draining. One tap teaches your island what ${KIND_LABEL[pick.b.cat]} costs you.`,
          url: `/?ask=drain&block=${pick.b.id}&date=${now.date}`, tag: `drain-${pick.b.id}` });
        return 'asked drain';
      }
    }
  }

  // "How are you?" -- once, between 20:00 and 22:00, unless already answered today
  if (now.minute >= 20 * 60 && !sentToday.some(p => p.kind === 'mood') && !(backingOff && new Date().getUTCDate() % 2)) {
    const { count } = await admin.from('checkins').select('id', { count: 'exact', head: true }).eq('owner', userId).eq('local_date', now.date);
    if (!count) {
      const { error } = await admin.from('prompts').insert({ user_id: userId, kind: 'mood', occurred_on: now.date });
      if (!error) {
        await send(userId, { title: 'How are you?', body: 'Your answer becomes a lantern in your sky.', url: '/?ask=mood', tag: `mood-${now.date}` });
        return 'asked mood';
      }
    }
  }
  return 'nothing to ask';
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!fromCron(req)) return json({ error: 'forbidden' }, 403);
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
