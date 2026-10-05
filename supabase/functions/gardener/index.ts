// The gardener's line. The rules in src/climate.js have already chosen what
// to offer; Gemini only words it. The app sends its own sentence as the
// fallback, so a slow or missing model never leaves the gardener silent.
//
//   POST /gardener  { mode: 'schedule'|'rest'|'support', facts: {...}, fallback: string } -> { line }
import { caller, cors, json } from '../_shared/supa.ts';
import { gardenerLine } from '../_shared/gemini.ts';

const MODES = ['schedule', 'rest', 'support'];

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!(await caller(req))) return json({ error: 'sign in first' }, 401);
  const { mode, facts = {}, fallback = '' } = await req.json().catch(() => ({}));
  if (!MODES.includes(mode) || typeof fallback !== 'string' || !fallback) return json({ error: 'bad request' }, 400);
  // support is never reworded: the same careful sentence every time
  if (mode === 'support') return json({ line: fallback });
  // only coarse, non-identifying facts reach the model: kinds and words, no titles or times
  const safe = Object.fromEntries(Object.entries(facts).filter(([k, v]) =>
    ['offer', 'why', 'kind', 'when', 'friend'].includes(k) && typeof v === 'string' && v.length < 80));
  return json({ line: await gardenerLine({ mode, ...safe }, fallback.slice(0, 200)) });
});
