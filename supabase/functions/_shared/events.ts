// Calendar events <-> island blocks. Pure functions (no Deno, no network), so
// Node can test them: node --test tests/events.test.ts

export type Kind = 'study' | 'work' | 'errands' | 'social' | 'exercise' | 'rest' | 'other';
export const KINDS: Kind[] = ['study', 'work', 'errands', 'social', 'exercise', 'rest', 'other'];

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
  eventType?: string;
}
export interface ImportedBlock { external_id: string; date: string; start_min: number; mins: number; title: string }

// a moment as the student's own wall clock shows it
export function localParts(instant: string | Date, tz: string): { date: string; minute: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant)).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: +parts.hour * 60 + +parts.minute };
}

// One timed event becomes one block on the day it starts, cut at midnight.
// All-day entries, declined invitations, cancelled events, out-of-office and
// focus-time markers, and anything over 12 hours carry no load, so they stay out.
export function eventToBlock(ev: GoogleEvent, tz: string): ImportedBlock | null {
  if (ev.status === 'cancelled' || !ev.start?.dateTime || !ev.end?.dateTime) return null;
  if (ev.eventType && !['default', 'fromGmail'].includes(ev.eventType)) return null;
  if (ev.attendees?.some(a => a.self && a.responseStatus === 'declined')) return null;
  const startMs = Date.parse(ev.start.dateTime), endMs = Date.parse(ev.end.dateTime);
  const total = Math.round((endMs - startMs) / 60000);
  if (!(total >= 5) || total > 12 * 60) return null;
  const { date, minute } = localParts(ev.start.dateTime, tz);
  const mins = Math.min(total, 1440 - minute);
  if (mins < 5) return null;
  const title = (ev.summary ?? '').trim().slice(0, 120) || 'Busy';
  return { external_id: ev.id, date, start_min: minute, mins, title };
}

// Titles that differ only in course codes or numbers share one answer:
// "MA1521 Lecture" and "MA1101 Lecture" are both "ma#### lecture".
export const titleKey = (t: string) => t.toLowerCase().replace(/\d/g, '#').replace(/\s+/g, ' ').trim().slice(0, 120);

// The fallback when Gemini is unavailable: plain keywords, first match wins.
const RULES: [Kind, RegExp][] = [
  ['exercise', /\b(gym|run|running|jog|swim|yoga|pilates|workout|training|football|futsal|badminton|basketball|tennis|hike|cycling|bike|climb|sport)/],
  ['study', /\b(lecture|lect|tutorial|tut|lab|seminar|class|exam|quiz|midterm|final|revision|revise|study|assignment|homework|project|thesis|reading|course|module|[a-z]{2,4}#{3,4})/],
  ['work', /\b(shift|work|intern|internship|meeting|standup|stand-up|client|job|office|interview|call with)/],
  ['social', /\b(dinner|lunch|brunch|coffee|drinks|party|birthday|date|hangout|hang out|catch up|catch-up|movie|friends?|family|band|club)/],
  ['rest', /\b(nap|rest|sleep|relax|break|spa|massage|meditat|lie-in|chill)/],
  ['errands', /\b(groceries|grocery|shopping|laundry|clean|cleaning|bank|post office|dentist|doctor|clinic|appointment|haircut|errand|pick ?up|deliver)/],
];
export function keywordKind(title: string): Kind {
  const t = titleKey(title);
  for (const [kind, re] of RULES) if (re.test(t)) return kind;
  return 'other';
}

// ---- two-way: island blocks -> events in the "Island Life" calendar -------------
export interface IslandBlock {
  id: string; date: string; start_min: number; mins: number; title: string; cat: Kind;
  repeat: boolean; skipped: boolean; skipped_on: string[]; except_on: string[];
}
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
// every dated appearance of a block between from and to (inclusive), let-go ones left out
export function occurrencesBetween(b: IslandBlock, from: string, to: string): string[] {
  if (!b.repeat) return !b.skipped && b.date >= from && b.date <= to ? [b.date] : [];
  const out: string[] = [];
  let d = b.date;
  while (d < from) d = addDays(d, 7);
  for (; d <= to; d = addDays(d, 7)) if (!b.except_on.includes(d) && !b.skipped_on.includes(d)) out.push(d);
  return out;
}
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
export function eventFor(b: IslandBlock, date: string, tz: string) {
  const end = Math.min(b.start_min + b.mins, 1439);
  const body = {
    summary: b.title,
    description: 'Planned on Island Life',
    start: { dateTime: `${date}T${clock(b.start_min)}`, timeZone: tz },
    end: { dateTime: `${date}T${clock(end)}`, timeZone: tz },
    extendedProperties: { private: { islandBlock: b.id } },
  };
  return { key: `${b.id}|${date}`, body, hash: `${b.title}|${date}|${b.start_min}|${end}|${tz}` };
}
