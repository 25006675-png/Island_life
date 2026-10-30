// How well do imported calendar titles get sorted into kinds? Runs a hand-labelled set of
// student calendar titles through the server's own classify() (Gemini) and through the
// keyword fallback, and prints the hit rate of each plus every miss.
//   node tools/classify-eval.mjs          (reads gemini_api_key from .env)
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([\w]+)\s*=\s*"?(.*?)"?\s*$/)).filter(Boolean).map(m => [m[1], m[2]]));
const KEY = process.env.GEMINI_API_KEY ?? env.GEMINI_API_KEY ?? env.gemini_api_key;
if (!KEY) { console.error('No Gemini key: set GEMINI_API_KEY or gemini_api_key in .env'); process.exit(1); }
globalThis.Deno = { env: { get: k => (k === 'GEMINI_API_KEY' ? KEY : process.env[k]) } };   /* gemini.ts reads Deno.env */

const { classify } = await import('../supabase/functions/_shared/gemini.ts');
const { keywordKind } = await import('../supabase/functions/_shared/events.ts');

// [title, the kind a student would expect]
const SET = [
  // study
  ['MA1521 Lecture', 'study'], ['CS2040S Tutorial', 'study'], ['BIO lab session', 'study'], ['Physics midterm', 'study'],
  ['Revise for finals', 'study'], ['Group project meeting', 'study'], ['FYP consultation with Dr Tan', 'study'],
  ['Submit essay draft', 'study'], ['Library study session', 'study'], ['Econ problem set due', 'study'],
  ['Read chapter 5', 'study'], ['UTAR Accounting class', 'study'], ['Thesis writing', 'study'],
  ['Office hours - Prof Lim', 'study'], ['Quiz 3', 'study'],
  // work
  ['Shift @ Starbucks', 'work'], ['Tuition - teach Sec 3 maths', 'work'], ['Internship standup', 'work'],
  ['Part-time at Uniqlo', 'work'], ['Grab delivery shift', 'work'], ['TA marking', 'work'],
  ['Interview with Shopee', 'work'], ['Freelance design work', 'work'],
  // errands
  ['Dentist', 'errands'], ['Laundry', 'errands'], ['Groceries at Jaya Grocer', 'errands'], ['Pay rent', 'errands'],
  ['Renew passport', 'errands'], ['Clinic appointment', 'errands'], ['Clean room', 'errands'],
  ['Pick up parcel', 'errands'], ['Bank - open account', 'errands'], ['Haircut', 'errands'],
  // social
  ['Dinner w/ Mei', 'social'], ['Movie night with roommates', 'social'], ['Call mum', 'social'],
  ['Birthday party - Aisha', 'social'], ['Mamak supper with the gang', 'social'], ['Date night', 'social'],
  ['Hall CCA meeting', 'social'], ['Family lunch', 'social'], ['Karaoke', 'social'],
  // exercise
  ['Gym - legs', 'exercise'], ['Morning run', 'exercise'], ['Badminton', 'exercise'], ['Yoga class', 'exercise'],
  ['Swim', 'exercise'], ['Futsal with hallmates', 'exercise'], ['Hike Bukit Tabur', 'exercise'],
  // rest
  ['Nap', 'rest'], ['Sleep in', 'rest'], ['Me time', 'rest'], ['Rest day', 'rest'], ['Meditation', 'rest'],
  ['Chill evening, no screens', 'rest'],
  // other
  ['Flight to Penang', 'other'], ['Pottery', 'other'], ['Guitar practice', 'other'], ['Bus to KL', 'other'],
  ['Church', 'other'], ['Volunteer at animal shelter', 'other'],
];
// vague titles, where even a person would have to guess: reported on their own
const HARD = [
  ['Meeting', 'study'], ['Coffee chat with recruiter', 'work'], ['Workshop', 'study'], ['Physio', 'errands'],
  ['Lunch', 'rest'], ['Hall dinner', 'social'], ['Walk', 'exercise'], ['Prep', 'study'], ['Practice', 'other'],
  ['Debate club', 'social'], ['Orientation camp', 'social'], ['Career fair', 'work'], ['Driving lesson', 'errands'],
  ['MUN conference', 'other'], ['Netflix', 'rest'],
];
const hardFrom = SET.length;
SET.push(...HARD);

const titles = SET.map(([t]) => t), want = SET.map(([, k]) => k);
const t0 = Date.now();
const gemini = await classify(titles);
const secs = ((Date.now() - t0) / 1000).toFixed(1);
const keywords = titles.map(keywordKind);
// classify() starts from the keyword guess and only overwrites it when Gemini answers, so if every Gemini
// guess equals the keyword guess, Gemini most likely didn't answer at all
const sameAsKeywords = gemini.every((k, i) => k === keywords[i]);

const pct = (r, n) => `${r}/${n} (${Math.round(r / n * 100)}%)`;
const report = (name, got, from, to) => {
  const misses = [];
  for (let i = from; i < to; i++) if (got[i] !== want[i]) misses.push([titles[i], want[i], got[i]]);
  const right = to - from - misses.length;
  console.log(`\n${name}: ${pct(right, to - from)} right`);
  for (const [t, w, g] of misses) console.log(`  ✗ ${t.padEnd(34)} expected ${w.padEnd(9)} got ${g}`);
  return right;
};
console.log(`${SET.length} titles, Gemini took ${secs}s`);
if (sameAsKeywords) console.log('Warning: every Gemini answer matches the keywords. Gemini probably failed (see warnings above).');
const g = report('Clear titles, Gemini', gemini, 0, hardFrom);
const k = report('Clear titles, keywords only', keywords, 0, hardFrom);
const gh = report('Vague titles, Gemini', gemini, hardFrom, SET.length);
const kh = report('Vague titles, keywords only', keywords, hardFrom, SET.length);
console.log(`\nClear: Gemini ${pct(g, hardFrom)} vs keywords ${pct(k, hardFrom)}`);
console.log(`Vague: Gemini ${pct(gh, HARD.length)} vs keywords ${pct(kh, HARD.length)}`);
