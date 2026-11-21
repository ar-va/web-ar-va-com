// The record's own sounds, made in the browser, no audio files (user, 2026-11-21): the needle going down (a low thump
// with a click and a small bounce, then the lead-in groove's crackle and hiss fading as the album fades in), the
// needle lifted when the music stops (the groove thins out, then the click of the stylus leaving and the arm settling),
// and a very faint surface hiss with the odd crackle under the music while it plays. All at the player's volume.

/** The sound as samples (mono, -1..1): pure, so it can be tested and rendered to a file. */
export function needleDrop(sampleRate: number, seconds = 3.6, random = Math.random): Float32Array {
  const out = new Float32Array(Math.round(sampleRate * seconds));
  const dt = 1 / sampleRate;
  const REV = 1.8; // 33⅓ rpm: the groove's one louder tick per turn
  let hissLp = 0, rumble = 0, pop = 0, popDecay = 0, popTone = 0, nextTick = 0.55;
  for (let i = 0; i < out.length; i++) {
    const t = i * dt;
    const white = random() * 2 - 1;
    let s = 0;
    // Landing: a thump sliding from 90 to 45 Hz, a sharp click as the tip touches, a smaller one as it bounces.
    if (t < 0.3) {
      const f = 45 + 45 * Math.exp(-t / 0.03);
      s += 0.75 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.05);
      s += 0.6 * white * Math.exp(-t / 0.002);
      if (t > 0.085) s += 0.25 * white * Math.exp(-(t - 0.085) / 0.0015);
    }
    // The groove: hiss (noise minus its low part), a little rumble, crackle pops (mostly small, now and then a big one).
    const groove = Math.min(1, Math.max(0, (t - 0.06) / 0.1)) * Math.min(1, Math.max(0, (seconds - t) / (seconds - 1.6)));
    hissLp += 0.25 * (white - hissLp);
    rumble += 0.004 * (white - rumble);
    if (random() < 14 * dt) { pop = (random() < 0.12 ? 0.5 : 0.18) * random() * (random() < 0.5 ? -1 : 1); popDecay = Math.exp(-dt / (0.0004 + 0.0012 * random())); popTone = random(); }
    if (t >= nextTick) { pop = 0.32; popDecay = Math.exp(-dt / 0.0015); nextTick += REV; }
    const crackle = pop * (popTone < 0.5 ? 1 : white);
    pop *= popDecay;
    s += groove * (0.035 * (white - hissLp) + 0.5 * rumble + crackle);
    out[i] = Math.max(-1, Math.min(1, s));
  }
  return out;
}

/** Lifting the needle (mono, -1..1): a little groove noise thinning out, the stylus leaving with a click, and the arm
 *  settling on its rest a moment later with a soft knock. */
export function needleLift(sampleRate: number, seconds = 0.9, random = Math.random): Float32Array {
  const out = new Float32Array(Math.round(sampleRate * seconds));
  const dt = 1 / sampleRate;
  const LEAVE = 0.22, REST = 0.62;
  let hissLp = 0, rumble = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i * dt;
    const white = random() * 2 - 1;
    hissLp += 0.25 * (white - hissLp);
    rumble += 0.004 * (white - rumble);
    let s = 0;
    if (t < LEAVE) s += (1 - t / LEAVE) * (0.03 * (white - hissLp) + 0.4 * rumble + (random() < 18 * dt ? 0.15 * (random() * 2 - 1) : 0));
    if (t >= LEAVE) {
      const u = t - LEAVE;
      s += 0.45 * white * Math.exp(-u / 0.0012) + 0.2 * Math.sin(2 * Math.PI * 1800 * u) * Math.exp(-u / 0.004);
    }
    if (t >= REST) {
      const u = t - REST;
      s += 0.22 * Math.sin(2 * Math.PI * (60 + 40 * Math.exp(-u / 0.02)) * u) * Math.exp(-u / 0.04) + 0.08 * white * Math.exp(-u / 0.0015);
    }
    out[i] = Math.max(-1, Math.min(1, s));
  }
  return out;
}

/** The surface under the music (mono, -1..1), meant to loop: hiss, a little rumble, sparse crackle and one soft tick per
 *  turn (two turns at 33⅓ rpm, so the loop lands on the beat). Quiet on its own; played quieter still. */
export function surfaceLoop(sampleRate: number, seconds = 3.6, random = Math.random): Float32Array {
  const out = new Float32Array(Math.round(sampleRate * seconds));
  const dt = 1 / sampleRate;
  let hissLp = 0, rumble = 0, pop = 0, popDecay = 0, nextTick = 0.9;
  for (let i = 0; i < out.length; i++) {
    const t = i * dt;
    const white = random() * 2 - 1;
    hissLp += 0.25 * (white - hissLp);
    rumble += 0.004 * (white - rumble);
    if (random() < 6 * dt) { pop = 0.12 * random() * (random() < 0.5 ? -1 : 1); popDecay = Math.exp(-dt / (0.0004 + 0.001 * random())); }
    if (t >= nextTick) { pop = 0.1; popDecay = Math.exp(-dt / 0.0012); nextTick += 1.8; }
    const s = 0.035 * (white - hissLp) + 0.4 * rumble + pop;
    pop *= popDecay;
    out[i] = Math.max(-1, Math.min(1, s));
  }
  // smooth the seam: a short crossfade of the end into the start
  const fade = Math.round(sampleRate * 0.05);
  for (let i = 0; i < fade; i++) { const k = i / fade; out[i] = out[i] * k + out[out.length - fade + i] * (1 - k); }
  return out.subarray(0, out.length - fade);
}

// The surface plays at this share of the player's volume: very faint, there rather than heard.
const SURFACE = 0.3;
let ctx: AudioContext | null = null;
let surface: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
let loopBuffer: AudioBuffer | null = null;

/** Runs `play` with a running audio context: at once, or as soon as the browser allows sound within half a second (so a
 *  sound asked for without a click never turns up later, on some unrelated click). */
function withSound(play: (c: AudioContext) => void) {
  try {
    ctx ??= new AudioContext();
  } catch { return; }
  const asked = performance.now();
  const go = () => { if (ctx && ctx.state === 'running' && performance.now() - asked <= 500) play(ctx); };
  if (ctx.state === 'running') go(); else ctx.resume().then(go, () => {});
}
const buffer = (c: AudioContext, samples: Float32Array) => {
  const b = c.createBuffer(1, samples.length, c.sampleRate);
  b.copyToChannel(samples, 0);
  return b;
};
const once = (c: AudioContext, samples: Float32Array, volume: number, delayMs = 0) => {
  const source = c.createBufferSource();
  source.buffer = buffer(c, samples);
  const gain = c.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(c.destination);
  source.start(c.currentTime + delayMs / 1000);
};

/** `volume` is the player's (0–1, as YouTube's volume / 100), so the record sounds as loud as the music. The needle
 *  drops after `delayMs` (the platter spins up first) and the surface hiss fades in under it. */
export function dropNeedle(delayMs: number, volume: number) {
  withSound((c) => {
    once(c, needleDrop(c.sampleRate), volume, delayMs);
    stopSurface(0);
    loopBuffer ??= buffer(c, surfaceLoop(c.sampleRate));
    const source = c.createBufferSource();
    source.buffer = loopBuffer;
    source.loop = true;
    const gain = c.createGain();
    const start = c.currentTime + delayMs / 1000;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume * SURFACE, start + 2.5);
    source.connect(gain).connect(c.destination);
    source.start(start);
    surface = { source, gain };
  });
}

/** The music stopped: the needle comes off (unless `quiet`, e.g. the browser refused sound) and the hiss stops. */
export function liftNeedle(volume: number, quiet = false) {
  stopSurface(quiet ? 0 : 0.25);
  if (!quiet && volume > 0) withSound((c) => once(c, needleLift(c.sampleRate), volume));
}

/** The player's volume changed (slider, mute): the hiss follows. */
export function surfaceVolume(volume: number) {
  if (surface && ctx) surface.gain.gain.setTargetAtTime(volume * SURFACE, ctx.currentTime, 0.08);
}

function stopSurface(fadeS: number) {
  if (!surface || !ctx) return;
  const { source, gain } = surface;
  surface = null;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.01, fadeS / 3));
  source.stop(ctx.currentTime + fadeS + 0.05);
}
