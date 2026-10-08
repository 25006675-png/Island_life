// The gardener. The rules in src/climate.js decide when it speaks and which
// kind of help fits; Gemini suggests the idea itself, from the free times and
// "can wait" blocks the app offers, or words one of the app's own ideas.
//
//   POST /gardener  { mode, week, slots, canWait, friends }            -> { idea }  (null: use the app's own ideas)
//   POST /gardener  { mode: 'schedule'|'rest'|'support', facts, fallback } -> { line }
//
// Support is never left to the model: the same careful sentence every time.
import { caller, cors, json } from '../_shared/supa.ts';
import { gardenerIdea, gardenerLine } from '../_shared/gemini.ts';
import { checkIdea } from '../_shared/idea.ts';

const MODES = ['schedule', 'rest', 'support'];
const str = (v: unknown, max = 40) => typeof v === 'string' ? v.slice(0, max) : '';
const list = (v: unknown, max: number) => Array.isArray(v) ? v.slice(0, max) : [];

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!(await caller(req))) return json({ error: 'sign in first' }, 401);
  const body = await req.json().catch(() => ({}));
  const { mode, facts = {}, fallback = '' } = body;
  if (!MODES.includes(mode)) return json({ error: 'bad request' }, 400);

  if (body.week) {
    if (mode === 'support') return json({ idea: null });
    // only coarse facts reach the model: kinds, hours, day names, first names; never titles
    const offered = {
      mode, week: JSON.stringify(body.week).length <= 3000 ? body.week : {},
      slots: list(body.slots, 16).map((s: any) => ({ day: str(s?.day, 20), time: str(s?.time, 5) })),
      canWait: list(body.canWait, 8).map((c: any) => ({ kind: str(c?.kind, 10), day: str(c?.day, 20), hours: Math.round((Number(c?.hours) || 0) * 2) / 2 })),
      friends: list(body.friends, 4).map((f: unknown) => str(f, 30)).filter(Boolean),
    };
    const raw = await gardenerIdea(offered).catch(() => null);
    return json({ idea: checkIdea(raw, { slots: offered.slots.length, canWait: offered.canWait.length, friends: offered.friends }) });
  }

  if (typeof fallback !== 'string' || !fallback) return json({ error: 'bad request' }, 400);
  if (mode === 'support') return json({ line: fallback });
  const safe = Object.fromEntries(Object.entries(facts).filter(([k, v]) =>
    ['offer', 'why', 'kind', 'when', 'friend'].includes(k) && typeof v === 'string' && v.length < 80));
  return json({ line: await gardenerLine({ mode, ...safe }, fallback.slice(0, 200)) });
});
