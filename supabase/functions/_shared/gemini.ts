// Gemini, advisory only: it sorts imported event titles into kinds, suggests
// the gardener's idea from the options the app offers (checked by idea.ts),
// and puts an offer into a friendly line. It never decides a number
// (docs/algorithm.md section 6). Every call has a plain fallback.
import { KINDS, keywordKind, type Kind } from './events.ts';

const MODEL = 'gemini-3.1-flash-lite';
const KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

// Flash-Lite on the free tier takes 10-20 s and sometimes answers 503 ("high demand"): one more try after a pause
async function generate(prompt: string, schema: unknown, timeoutMs = 20000, temperature = 0.2): Promise<unknown | null> {
  if (!KEY) return null;
  try {
    const ask = () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature },
      }),
    });
    let res = await ask();
    if (res.status === 503) { await new Promise(r => setTimeout(r, 1500)); res = await ask(); }
    if (!res.ok) { console.warn('gemini', res.status, await res.text()); return null; }
    const json = await res.json();
    return JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? 'null');
  } catch (e) {
    console.warn('gemini failed', e);
    return null;
  }
}

// Kinds for a batch of titles, in order. Keywords fill any gap.
export async function classify(titles: string[]): Promise<Kind[]> {
  const out: Kind[] = titles.map(keywordKind);
  for (let i = 0; i < titles.length; i += 80) {
    const batch = titles.slice(i, i + 80);
    const prompt = `You sort a university student's calendar entries into the kind of time they are.
Kinds: study (classes, lectures, labs, tutorials, exams, coursework, revision), work (paid jobs, shifts,
internships, work meetings), errands (chores, appointments, shopping, admin), social (friends, family,
dates, clubs, parties), exercise (sport, gym, walks for fitness), rest (sleep, naps, breaks, relaxing),
other (anything else, including hobbies and travel).
Answer with one kind per entry, in the same order.
Entries:
${batch.map((t, k) => `${k + 1}. ${t.replace(/\s+/g, ' ').slice(0, 100)}`).join('\n')}`;
    const kinds = await generate(prompt, { type: 'ARRAY', items: { type: 'STRING', enum: KINDS } });
    if (Array.isArray(kinds) && kinds.length === batch.length) {
      kinds.forEach((k, j) => { if (KINDS.includes(k as Kind)) out[i + j] = k as Kind; });
    }
  }
  return out;
}

// The gardener's line for an offer the rules already chose.
export async function gardenerLine(facts: Record<string, unknown>, fallback: string): Promise<string> {
  const prompt = `You are the gardener on a student's floating island in a calm wellbeing app. Write ONE short,
warm sentence (max 24 words) that offers the suggestion below. Never diagnose, never guess why they feel
the way they do, never mention numbers, percentages or the app. No emoji. Plain, kind English.
Situation: ${JSON.stringify(facts)}
A line the app would otherwise use: "${fallback}"`;
  const line = await generate(prompt, { type: 'STRING' }, 15000);
  return typeof line === 'string' && line.length > 8 && line.length < 200 ? line.trim() : fallback;
}

const IDEA_SCHEMA = {
  type: 'OBJECT',
  properties: {
    type: { type: 'STRING', enum: ['add', 'move'] }, title: { type: 'STRING' },
    cat: { type: 'STRING', enum: ['rest', 'exercise', 'social', 'other'] }, mins: { type: 'INTEGER' },
    slot: { type: 'INTEGER' }, move: { type: 'INTEGER' }, friend: { type: 'STRING' },
    line: { type: 'STRING' }, button: { type: 'STRING' },
  },
  required: ['type', 'line'],
};

// Three different small ideas for Your balance's "Other ideas", from the same offer as gardenerIdea below, none
// repeating what the student has already been shown (avoid: their titles). checkIdea (idea.ts) checks each one.
export async function gardenerIdeas(facts: {
  mode: string; week: unknown; slots: { day: string; time: string; part?: string }[];
  canWait: { kind: string; day: string; hours: number }[]; friends: string[];
}, avoid: string[]): Promise<unknown[] | null> {
  const prompt = `You are the gardener on a student's floating island in a calm wellbeing app. Suggest THREE different,
small, kind things they could do this week, each written as one warm sentence. Make them truly different from each
other: for example one for rest, one for moving or time outdoors, one with a friend, or moving something that can wait.
${facts.mode === 'schedule'
    ? `Their week, or a day ahead, is heavier than usual for them. Moving an activity they marked "can wait" (type "move",
give its number) helps most; prefer moving errands, study or other things, never exercise, time with friends or rest.`
    : facts.mode === 'rest'
    ? `Their sky has been heavy lately, but their schedule is not unusually full. Do not move anything (type "add" only):
offer rest, time outdoors, or time with a friend.`
    : `Their week looks ordinary. Do not move anything (type "add" only): offer small things that keep it balanced,
like rest, moving their body, time outdoors, or time with a friend.`}
Their week (kinds of activity in hours, and how each coming day looks for them): ${JSON.stringify(facts.week)}
Free times (for type "add", give the number): ${facts.slots.map((s, i) => `${i}. ${s.day} ${s.time}${s.part ? ` (${s.part})` : ''}`).join('; ') || 'none'}
Activities marked "can wait" (for type "move", give the number): ${facts.canWait.map((c, i) => `${i}. ${c.kind}, ${c.day}, ${c.hours} h`).join('; ') || 'none'}
Friends in their sky, least recently in touch first: ${facts.friends.join(', ') || 'none'}
Already suggested, so do not repeat these or anything much like them: ${avoid.join('; ') || 'nothing yet'}
These are things to do in their real life: never mention the island, the sky, clouds drifting past or anything floating.
A title fits the time it goes at (no "afternoon nap" in the evening) and is in sentence case, like "Walk by the river".
Rules: for "add", the kind is rest, exercise, social or other, never study or work; 15 to 90 minutes; a title of 2 to 5
words such as "Walk by the river"; a button of 2 to 4 words such as "Add the walk"; pick free times that fit, preferring
the heaviest days or the evening before them, and use a different free time for each idea. Name a friend only for time
together, exactly as given. Each sentence: at most 24 words, never diagnose, never guess why they feel the way they do,
never mention numbers, hours, times, percentages or the app, no emoji, plain kind English.`;
  const out = await generate(prompt, { type: 'ARRAY', items: IDEA_SCHEMA }, 25000, 0.8);   // warmer: three different ideas
  return Array.isArray(out) ? out : null;
}

// The gardener's own idea: one small thing for this week, picked from the free
// times and "can wait" blocks the app offers. Facts are kinds, hours, day names
// and friends' first names; never titles. checkIdea (idea.ts) has the last word.
export async function gardenerIdea(facts: {
  mode: string; week: unknown; slots: { day: string; time: string }[];
  canWait: { kind: string; day: string; hours: number }[]; friends: string[];
}): Promise<unknown | null> {
  const prompt = `You are the gardener on a student's floating island in a calm wellbeing app. Suggest ONE small,
kind thing they could do this week, and write it as one warm sentence.
${facts.mode === 'schedule'
    ? `Their week, or a day ahead, is heavier than usual for them. The best help is moving one activity they marked
"can wait" (type "move", give its number). If nothing can wait, protect some recovery instead: an early night,
a slow evening, a short walk (type "add").`
    : `Their sky has been heavy lately, but their schedule is not unusually full, so it may not be the schedule.
Do not move anything. Offer rest, time outdoors, or time with a friend (type "add").`}
Their week (kinds of activity in hours, and how each coming day looks for them): ${JSON.stringify(facts.week)}
Free times (for type "add", give the number): ${facts.slots.map((s, i) => `${i}. ${s.day} ${s.time}`).join('; ') || 'none'}
Activities marked "can wait" (for type "move", give the number): ${facts.canWait.map((c, i) => `${i}. ${c.kind}, ${c.day}, ${c.hours} h`).join('; ') || 'none'}
Friends in their sky, least recently in touch first: ${facts.friends.join(', ') || 'none'}
Rules: for "add", the kind is rest, exercise, social or other, never study or work; 15 to 90 minutes; a title of
2 to 5 words such as "Walk by the river"; a button of 2 to 4 words such as "Add the walk"; pick the free time that
fits best, preferring the heaviest days or the evening before them. If you suggest seeing a friend, use their name
exactly as given. The sentence: at most 24 words, never diagnose, never guess why they feel the way they do, never
mention numbers, hours, times, percentages or the app, no emoji, plain kind English.`;
  return await generate(prompt, IDEA_SCHEMA, 20000);
}
