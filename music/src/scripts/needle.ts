// The needle going down on the record (user, 2026-11-21: "a sound as if a needle were put to play the record"), made
// in the browser, no audio file: the stylus lands (a low thump with a click and a small bounce), then the lead-in
// groove crackles and hisses for a few seconds, fading out as the album fades in. Each drop is a little different.

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

let ctx: AudioContext | null = null;

/** Plays it after `delayMs` (the platter spins up first). Call it in a click when there is one: browsers allow sound
 *  then. Without one it plays only if the browser already allows sound here, never later on some unrelated click. */
export function dropNeedle(delayMs: number, volume = 0.6) {
  try {
    ctx ??= new AudioContext();
  } catch { return; }
  const asked = performance.now();
  const go = () => {
    if (!ctx || ctx.state !== 'running' || performance.now() - asked > 500) return;
    const source = ctx.createBufferSource();
    const samples = needleDrop(ctx.sampleRate);
    source.buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    source.buffer.copyToChannel(samples, 0);
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime + delayMs / 1000);
  };
  if (ctx.state === 'running') go(); else ctx.resume().then(go, () => {});
}
