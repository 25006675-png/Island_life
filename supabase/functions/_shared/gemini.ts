// Gemini, advisory only: it sorts imported event titles into kinds, suggests
// the gardener's idea from the options the app offers (checked by idea.ts),
// and puts an offer into a friendly line. It never decides a number
// (docs/algorithm.md section 6). Every call has a plain fallback.
import { KINDS, keywordKind, type Kind } from './events.ts';

const MODEL = 'gemini-3.5-flash-lite';
const KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

async function generate(prompt: string, schema: unknown, timeoutMs = 8000): Promise<unknown | null> {
  if (!KEY) return null;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
      }),
    });
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
  const line = await generate(prompt, { type: 'STRING' }, 6000);
  return typeof line === 'string' && line.length > 8 && line.length < 200 ? line.trim() : fallback;
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
  return await generate(prompt, {
    type: 'OBJECT',
    properties: {
      type: { type: 'STRING', enum: ['add', 'move'] }, title: { type: 'STRING' },
      cat: { type: 'STRING', enum: ['rest', 'exercise', 'social', 'other'] }, mins: { type: 'INTEGER' },
      slot: { type: 'INTEGER' }, move: { type: 'INTEGER' }, friend: { type: 'STRING' },
      line: { type: 'STRING' }, button: { type: 'STRING' },
    },
    required: ['type', 'line'],
  }, 8000);
}
