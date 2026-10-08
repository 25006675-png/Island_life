// The gardener's idea from Gemini, checked before the app may show it. Pure
// (no Deno, no network), so Node can test it: node --test tests/idea.test.js
//
// Gemini only picks from what the app offered: a free time by its number, or
// a "can wait" block by its number. Anything else is dropped, and the app
// falls back to its own ideas.

export const IDEA_KINDS = ['rest', 'exercise', 'social', 'other'];   // never study, work or errands

export type Idea =
  | { type: 'move'; move: number; line: string }
  | { type: 'add'; title: string; cat: string; mins: number; slot: number; friend: string; line: string; button: string };

const text = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max + 1) : '';
const index = (v: unknown, n: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;

export function checkIdea(raw: unknown, offered: { slots: number; canWait: number; friends: string[] }): Idea | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const line = text(r.line, 200);
  if (line.length < 8 || line.length > 200) return null;
  if (r.type === 'move') return index(r.move, offered.canWait) ? { type: 'move', move: r.move as number, line } : null;
  if (r.type !== 'add') return null;
  const title = text(r.title, 40), cat = String(r.cat ?? '');
  if (title.length < 2 || title.length > 40 || !IDEA_KINDS.includes(cat) || !index(r.slot, offered.slots)) return null;
  const mins = Math.min(90, Math.max(15, Math.round((Number(r.mins) || 30) / 15) * 15));
  const friend = offered.friends.includes(String(r.friend ?? '')) ? String(r.friend) : '';
  const button = text(r.button, 28);
  return { type: 'add', title, cat, mins, slot: r.slot as number, friend, line,
           button: button.length >= 2 && button.length <= 28 ? button : 'Add it to my plan' };
}
