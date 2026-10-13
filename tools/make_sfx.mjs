// Renders the sound effects in public/assets/sfx (src/sound.js plays them). Every sound is synthesised here from
// noise, filters, resonators and a small reverb, seeded so a re-run gives the same files. No dependencies:
// node tools/make_sfx.mjs [out-dir]. Mono 16-bit WAV at 22.05 kHz, which keeps the whole set small.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'public/assets/sfx', SR = 22050, TAU = Math.PI * 2;
mkdirSync(OUT, { recursive: true });

// ---- building blocks --------------------------------------------------------
let seed = 1;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const range = (a, b) => a + (b - a) * rnd();
const buf = s => new Float32Array(Math.round(s * SR));
const noise = s => buf(s).map(() => rnd() * 2 - 1);
const mix = (into, src, at = 0, gain = 1) => { const o = Math.round(at * SR); for (let i = 0; i < src.length && o + i < into.length; i++) if (o + i >= 0) into[o + i] += src[i] * gain; return into; };
const env = (x, f) => { for (let i = 0; i < x.length; i++) x[i] *= f(i / SR); return x; };
const decay = (tau, attack = .001) => t => Math.min(1, t / attack) * Math.exp(-t / tau);

// RBJ biquads; `f` may be a function of time for a sweep (coefficients refreshed every 16 samples)
function biquad(x, type, f, Q = .707, db = 0) {
  let b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = fc => {
    const w = TAU * Math.min(fc, SR * .45) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * Q), A = 10 ** (db / 40);
    let a0;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  };
  for (let i = 0; i < x.length; i++) {
    if (typeof f === 'function' ? i % 16 === 0 : i === 0) set(typeof f === 'function' ? f(i / SR) : f);
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
// a damped sine: one mode of a struck object
const mode = (s, f, tau, amp = 1, glide = 0) => { const x = buf(s); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; ph += TAU * f * (1 + glide * t) / SR; x[i] = Math.sin(ph) * Math.exp(-t / tau) * amp; } return x; };
// a burst of noise through a band: grains of grit, drops, crackle
const grain = (dur, fc, Q = 1.2) => env(biquad(noise(dur), 'bp', fc, Q), decay(dur / 3, .0004));
// a small Schroeder reverb: parallel damped combs into allpasses. `size` stretches the room, `wet` mixes it in
function reverb(x, { size = 1, fb = .8, damp = .3, wet = .3, tail = 1 } = {}) {
  const out = new Float32Array(x.length + Math.round(tail * SR)); out.set(x);
  const wetBuf = new Float32Array(out.length);
  for (const ms of [29.7, 37.1, 41.1, 43.7, 47.3, 53.9]) {
    const d = Math.round(ms * size * SR / 1000), line = new Float32Array(d); let p = 0, lp = 0;
    for (let i = 0; i < out.length; i++) { const y = line[p]; lp = y * (1 - damp) + lp * damp; line[p] = out[i] + lp * fb; p = (p + 1) % d; wetBuf[i] += y / 6; }
  }
  for (const [ms, g] of [[5, .7], [1.7, .7]]) {
    const d = Math.round(ms * size * SR / 1000), line = new Float32Array(d); let p = 0;
    for (let i = 0; i < out.length; i++) { const b = line[p], v = wetBuf[i] + b * g; line[p] = v; wetBuf[i] = b - v * g; p = (p + 1) % d; }
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i] * (1 - wet * .5) + wetBuf[i] * wet;
  return out;
}
function save(name, x, peak = .9, fade = .004) {
  let m = 0; for (const v of x) m = Math.max(m, Math.abs(v));
  const k = m ? peak / m : 1, n = x.length, f = Math.round(fade * SR);
  const data = Buffer.alloc(44 + n * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVE', 8); data.write('fmt ', 12);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const edge = Math.min(1, i / Math.max(1, f), (n - 1 - i) / Math.max(1, f));
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i] * k * edge)) * 32767), 44 + i * 2);
  }
  writeFileSync(join(OUT, `${name}.wav`), data);
  console.log(`${name}.wav`.padEnd(20), `${(n / SR).toFixed(2)} s`.padStart(7), `${(data.length / 1024).toFixed(0)} KB`.padStart(7));
}

// ---- the sounds ---------------------------------------------------------------
// UI click: a small plastic tick with a little body under it
seed = 11;
{ const x = buf(.07);
  mix(x, env(biquad(noise(.01), 'hp', 2500), decay(.0012)), 0, .9);
  mix(x, mode(.07, 3100, .006, .35));
  mix(x, mode(.07, 950, .011, .3));
  save('click', biquad(x, 'lp', 8000), .55); }

// The star whale, after a haunting whale-song recording (traced: it swoops up from ~545 to ~655 Hz, swells on a
// held ~665 Hz note, then bends down to ~570 Hz and wavers away in a long echo). One voice, nearly a pure tone with
// a soft overtone and a breath of air in it. A single moving voice in an echo sings; the old version held two
// steady voices 8% apart an octave down, which beat against each other and droned. Timed to the welcome page's
// intro (welcome/index.html): the call starts as the whale breaks the clouds, the hum as it nods goodbye and sinks back.
const smooth = k => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };
const swell = (t, a, b, c, d) => smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)));   // in over a..b, out over c..d
// a pitch path through [time, Hz] points, easing from each to the next
const glide = pts => t => { let i = 1; while (i < pts.length - 1 && t > pts[i][0]) i++; const [t0, f0] = pts[i - 1], [t1, f1] = pts[i]; return f0 + (f1 - f0) * smooth((t - t0) / (t1 - t0)); };
// one sung phrase: follows path(t) with a slow vibrato of depth vib(t) (a fraction of the pitch), loudness amp(t)
function sing(len, path, amp, vib = () => .005) {
  const x = buf(len), air = biquad(noise(len), 'bp', path, 6), drift = rnd() * TAU;
  let ph = 0, vp = rnd() * TAU;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, v = Math.sin(vp);
    vp += TAU * (4.3 + .5 * Math.sin(.7 * t + drift)) / SR;   // ~4.5 Hz, never quite regular
    ph += TAU * path(t) * (1 + vib(t) * v) / SR;
    x[i] = ((Math.sin(ph) + .1 * Math.sin(2 * ph + .4) + .025 * Math.sin(3 * ph + 1.1)) * (1 + .06 * v) + air[i] * .35) * amp(t);
  }
  return x;
}
const rumble = (len, amp) => env(biquad(biquad(biquad(noise(len), 'lp', 90), 'lp', 90), 'hp', 25), amp);
// the open sky: a long soft echo (a gliding voice keeps the combs from ringing)
const sky = (x, tail) => reverb(biquad(x, 'lp', 3000), { size: 1.8, fb: .86, damp: .5, wet: .55, tail });
seed = 21;
{ const len = 5.4, x = buf(len);
  mix(x, sing(2.7, glide([[0, 545], [.5, 655], [1.35, 668], [1.9, 572], [2.7, 588]]),                                       // the recording's phrase
    t => smooth(t / .85) ** 2 * (1 - .25 * swell(t, 1.35, 1.45, 1.5, 1.65)) * (1 - smooth((t - 1.6) / 1.1)),
    t => .002 + .006 * swell(t, .6, 1, 1.3, 1.5) + .012 * swell(t, 1.5, 1.9, 2.2, 2.7)));
  mix(x, sing(2.5, glide([[0, 498], [.45, 588], [1, 600], [1.75, 472], [2.5, 458]]),                                       // and a softer, lower answer
    t => smooth(t / .55) ** 2 * (1 - smooth((t - 1) / 1.5)),
    t => .003 + .01 * smooth((t - 1) / .8)), 2.85, .5);
  mix(x, rumble(len, t => swell(t, 0, .35, .5, 1.8)), 0, 1.2);                                                                     // the cloud sea parting
  save('whale_call', sky(x, 3.2), .45, .02); }   // a 600 Hz voice is far louder to the ear than the old 170 Hz one at the same peak
seed = 22;
{ const len = 3, x = buf(len);
  mix(x, sing(2.8, glide([[0, 600], [.35, 640], [.9, 628], [1.8, 505], [2.8, 482]]),                                       // it bows and sinks: the note sinks with it
    t => smooth(t / .4) ** 1.5 * (1 - smooth((t - .9) / 1.7)),
    t => .003 + .011 * smooth((t - .8) / 1)));
  mix(x, rumble(len, t => swell(t, .9, 2, 2.1, 3)), 0, 1.1);                                                                       // back into the clouds
  save('whale_hum', sky(x, 2.8), .32, .02); }

// Footsteps: a heel strike then a softer roll onto the toe, four takes of each surface
function grassStep(s) {   // dry blades crushed underfoot: dense crackle over a soft thud
  const x = buf(.3);
  for (const [at, n, g] of [[0, 46, 1], [range(.06, .09), 26, .55]])
    for (let k = 0; k < n; k++) mix(x, grain(range(.002, .006), range(1800, 6500), range(.8, 2)), at + range(0, .11) ** 1.4, g * range(.15, 1));
  mix(x, mode(.08, range(80, 110), .02, .9 * s, -2));
  return biquad(biquad(x, 'hp', 140), 'lp', 7500);
}
function stoneStep(s) {   // a hard sole on stone: a sharp tick, then grit scuffing under the roll
  const x = buf(.28);
  for (const [at, g] of [[0, 1], [range(.05, .08), .6]]) {
    mix(x, env(biquad(noise(.003), 'hp', 1200), decay(.0007)), at, g);
    mix(x, mode(.1, range(95, 130), .018, .6 * g * s), at);
    const scuff = env(biquad(noise(.09), 'bp', t => 2600 + 1500 * Math.sin(t * 40), .9), t => Math.min(1, t / .01) * Math.exp(-t / .03));
    mix(x, scuff, at + .004, .35 * g);
    for (let k = 0; k < 10; k++) mix(x, grain(range(.001, .003), range(3000, 7000), 2), at + range(0, .06), g * range(.1, .45));
  }
  return biquad(x, 'lp', 8500);
}
function waterStep() {    // a foot in shallow water: a slap and spray, a few bubbles, drips after
  const x = buf(.45);
  mix(x, env(biquad(noise(.25), 'bp', t => 1800 - 2400 * t, .7), t => Math.min(1, t / .006) * Math.exp(-t / .055)), 0, 1);
  mix(x, env(biquad(noise(.3), 'hp', 3000), t => Math.min(1, t / .02) * Math.exp(-t / .07)), .01, .35);
  for (let k = 0; k < 7; k++) {   // bubbles rise in pitch as they shrink
    const f = range(450, 1600), at = range(.01, .2);
    mix(x, mode(.06, f, range(.012, .03), range(.2, .5), range(8, 25)), at);
  }
  for (let k = 0; k < 4; k++) mix(x, mode(.05, range(1200, 2600), .01, range(.1, .25), 30), range(.18, .4));
  return biquad(biquad(x, 'hp', 180), 'lp', 8000);
}
// wood is not rendered here: step_wood_1..7 are cut from a recording of footsteps on wood (dragon-studio, "footsteps on wood")
for (const [name, make, s0] of [['grass', grassStep, 31], ['stone', stoneStep, 51], ['water', waterStep, 61]])
  for (let v = 1; v <= 4; v++) { seed = s0 * 10 + v; save(`step_${name}_${v}`, make(1), .85); }

// Jump: trousers and sleeves whip through the air, with a scuff as the foot leaves the ground
seed = 71;
{ const x = buf(.42);
  mix(x, env(biquad(noise(.42), 'bp', t => 500 + 2200 * Math.min(1, t / .16), 1.1), t => Math.min(1, t / .07) ** 2 * Math.exp(-Math.max(0, t - .07) / .09)), 0, 1);
  mix(x, env(biquad(noise(.4), 'bp', 1400, .6), t => (.5 + .5 * Math.sin(TAU * 24 * t)) * Math.min(1, t / .05) * Math.exp(-t / .12)), 0, .35);
  for (let k = 0; k < 12; k++) mix(x, grain(range(.002, .005), range(2000, 5500)), range(0, .035), range(.1, .4));
  save('jump', biquad(x, 'hp', 200), .7); }
// Landing: the body's weight arriving, a deep thump and a flap of clothes
seed = 72;
{ const x = buf(.4);
  mix(x, mode(.4, 72, .07, 1, -1.2));
  mix(x, mode(.4, 140, .03, .4));
  mix(x, env(biquad(noise(.3), 'lp', 1100), t => Math.min(1, t / .004) * Math.exp(-t / .06)), 0, .5);
  mix(x, env(biquad(noise(.25), 'bp', 1600, .7), t => Math.min(1, t / .02) * Math.exp(-t / .07)), .015, .25);
  save('land', x, .85); }
// Sprint: pushing off hard, a fast rush of air and a flutter of cloth
seed = 73;
{ const x = buf(.6);
  const push = env(biquad(noise(.12), 'bp', t => 3200 - 9000 * t, .8), t => Math.min(1, t / .005) * Math.exp(-t / .03));
  mix(x, push, 0, .7); mix(x, push, .11, .5);
  mix(x, env(biquad(noise(.6), 'bp', t => 400 + 2600 * Math.min(1, t / .22) ** .7, .9), t => Math.min(1, t / .12) ** 1.5 * Math.exp(-Math.max(0, t - .12) / .16)), 0, 1);
  mix(x, env(biquad(noise(.6), 'bp', 1100, .7), t => (.5 + .5 * Math.sin(TAU * 31 * t)) * Math.min(1, t / .08) * Math.exp(-t / .2)), 0, .3);
  save('sprint', biquad(x, 'hp', 180), .75); }

// Watering: the rose's shower pattering on leaves and soil, over the hiss of the spray
seed = 81;
{ const len = 1.6, x = buf(len);
  mix(x, env(biquad(biquad(noise(len), 'bp', 4200, .5), 'lp', 7000), () => 1), 0, .12);
  for (let k = 0; k < 520; k++) mix(x, grain(range(.0008, .0035), range(1400, 6500), range(1, 3)), range(0, len - .01), range(.08, 1) ** 2);
  for (let k = 0; k < 30; k++) mix(x, mode(.05, range(700, 1700), range(.01, .02), range(.08, .2), range(10, 30)), range(0, len - .05));
  env(x, t => Math.min(1, t / .15) * Math.min(1, (len - t) / .35));
  save('water_pour', biquad(x, 'hp', 300), .8, .01); }

// Task done: a small brass bell struck twice, the second a fifth above (bell partials, not a pure tone)
seed = 91;
{ const x = buf(3);
  const bell = (f, at, g) => {
    mix(x, env(biquad(noise(.004), 'hp', 3000), decay(.0006)), at, .25 * g);
    for (const [r, tau, a] of [[.5, 1.4, .25], [1, 1.1, 1], [1.183, .8, .35], [1.506, .6, .3], [2, .45, .25], [2.514, .3, .15], [3.01, .2, .1]])
      mix(x, mode(3 - at, f * r, tau, a * g), at);
  };
  bell(1046.5, 0, .9); bell(1568, .13, 1); env(x, t => Math.min(1, (3 - t) / 1.2));
  save('task_done', reverb(x, { size: 1.3, fb: .7, damp: .4, wet: .25, tail: .4 }), .7, .01); }

// Rain: a steady shower on grass and leaves, eight seconds that loop without a seam
seed = 101;
{ const len = 8, xf = 1, x = buf(len + xf);
  { let b0 = 0, b1 = 0, b2 = 0; const w = noise(len + xf);   // pink-ish bed (Kellet)
    for (let i = 0; i < x.length; i++) { b0 = .99765 * b0 + w[i] * .099046; b1 = .963 * b1 + w[i] * .2965164; b2 = .57 * b2 + w[i] * 1.0526913; x[i] = (b0 + b1 + b2 + w[i] * .1848) * .05; } }
  biquad(biquad(x, 'hp', 350), 'lp', 5500);
  for (let k = 0; k < 9000; k++) mix(x, grain(range(.0006, .002), range(2000, 8000), range(1, 2.5)), range(0, len + xf - .01), .5 * range(.05, 1) ** 3);
  for (let k = 0; k < 160; k++) mix(x, grain(range(.004, .009), range(700, 1800), 1.4), range(0, len + xf - .02), range(.15, .5));
  mix(x, biquad(noise(len + xf), 'lp', 180), 0, .08);
  const n = Math.round(len * SR), m = Math.round(xf * SR), out = x.slice(0, n);
  for (let i = 0; i < m; i++) { const a = i / m; out[i] = x[n + i] * Math.cos(a * Math.PI / 2) + x[i] * Math.sin(a * Math.PI / 2); }
  save('rain_loop', out, .8, 0); }
