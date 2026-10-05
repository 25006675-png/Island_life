// Gemini, advisory only: it sorts imported event titles into kinds and puts
// the gardener's chosen offer into a friendly line. It never decides a number
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
