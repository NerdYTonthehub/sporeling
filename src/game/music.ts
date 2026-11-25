import { getAudioContext } from "./sfx";

export type Track = "forest" | "dungeon" | "heaven" | null;
type Voice = { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode | null; cleanup?: () => void };
type Part = {
  name: Exclude<Track, null>; bus: GainNode; voices: Set<Voice>;
  step: number; next: number; end: number;
};
let requested: Track = null;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let current: Part | null = null;
let parts: Part[] = [];
let scheduler: number | undefined;
let waiting: number | undefined;
let volume = 0.8;
let muted = false;
const fade = 1.5;
const hz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

function ramp(param: AudioParam, value: number, time: number, duration: number): void {
  // cancelAndHoldAtTime isn't available in every browser; hold the current value manually.
  const now = param.value;
  param.cancelScheduledValues(time);
  param.setValueAtTime(now, time);
  param.linearRampToValueAtTime(value, time + duration);
}

function updateVolume(): void {
  if (ctx && master) ramp(master.gain, muted ? 0 : 0.06 * volume, ctx.currentTime, 0.06);
}

export function setMusicVolume(v: number): void {
  volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  updateVolume();
}

export function setMusicMuted(m: boolean): void {
  muted = m;
  updateVolume();
}

// Every voice owns its nodes, including filtered drones; cleanup also runs on retirement.
function dispose(voice: Voice): void {
  voice.osc.onended = null;
  try { voice.osc.disconnect(); } catch { /* Already disconnected. */ }
  try { voice.gain.disconnect(); } catch { /* Already disconnected. */ }
  try { voice.filter?.disconnect(); } catch { /* Already disconnected. */ }
  voice.cleanup?.();
}

function note(
  part: Part, time: number, midi: number, duration: number,
  type: OscillatorType, level: number, cutoff = 0, slide = 0, drone = false,
): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = cutoff ? ctx.createBiquadFilter() : null;
  const voice: Voice = { osc, gain, filter };
  part.voices.add(voice);
  osc.type = type;
  osc.frequency.setValueAtTime(hz(midi), time);
  if (slide) osc.frequency.exponentialRampToValueAtTime(hz(midi + slide), time + duration * 0.85);
  gain.gain.setValueAtTime(0, time);
  const attack = drone ? 0.5 : Math.min(0.018, duration * 0.1);
  gain.gain.linearRampToValueAtTime(level, time + attack);
  if (drone) {
    gain.gain.setValueAtTime(level, time + duration - 0.55);
    gain.gain.linearRampToValueAtTime(0, time + duration);
  } else {
    gain.gain.exponentialRampToValueAtTime(0.00001, time + duration);
  }
  if (filter) {
    filter.type = "lowpass";
    filter.Q.value = drone ? 0.8 : 0.5;
    filter.frequency.setValueAtTime(cutoff, time);
    if (drone) {
      // Slow filter motion without a second, permanently running oscillator.
      for (let i = 1; i <= 8; i++) {
        filter.frequency.linearRampToValueAtTime(
          cutoff * (1 + 0.35 * Math.sin(i * Math.PI / 4)), time + duration * i / 8,
        );
      }
    }
    osc.connect(filter).connect(gain);
  } else osc.connect(gain);
  gain.connect(part.bus);
  osc.onended = () => { dispose(voice); part.voices.delete(voice); };
  osc.start(time);
  osc.stop(time + duration + 0.02);
}

/** Synthesizes a multi-voice angelic choir tone using vocal vowel formants ("ah"/"oh") + vibrato. */
function choirNote(
  part: Part, time: number, midi: number, duration: number,
  level: number, vowel: "ah" | "oh" = "ah",
): void {
  if (!ctx) return;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const f1 = ctx.createBiquadFilter();
  const f2 = ctx.createBiquadFilter();
  const lp = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc1.type = "sawtooth";
  osc2.type = "sawtooth";
  osc1.frequency.setValueAtTime(hz(midi - 0.06), time);
  osc2.frequency.setValueAtTime(hz(midi + 0.06), time);

  // Vocal vibrato (~5.2 Hz subtle pitch shimmer)
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(5.2, time);
  lfoGain.gain.setValueAtTime(6, time);
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.detune);
  lfoGain.connect(osc2.detune);

  // Dual vowel formant filters + warm lowpass rolloff
  f1.type = "bandpass";
  f1.frequency.setValueAtTime(vowel === "ah" ? 730 : 520, time);
  f1.Q.value = 3.2;

  f2.type = "bandpass";
  f2.frequency.setValueAtTime(vowel === "ah" ? 1120 : 880, time);
  f2.Q.value = 4.0;

  lp.type = "lowpass";
  lp.frequency.setValueAtTime(2400, time);
  lp.Q.value = 0.6;

  // Expressive choral swell envelope
  const att = Math.min(0.24, duration * 0.28);
  const rel = Math.min(0.35, duration * 0.35);
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(level, time + att);
  gain.gain.setValueAtTime(level * 0.92, Math.max(time + att, time + duration - rel));
  gain.gain.linearRampToValueAtTime(0, time + duration);

  osc1.connect(f1);
  osc1.connect(f2);
  osc2.connect(f1);
  osc2.connect(f2);
  f1.connect(lp);
  f2.connect(lp);
  lp.connect(gain);
  gain.connect(part.bus);

  const voice: Voice = {
    osc: osc1,
    gain,
    filter: lp,
    cleanup: () => {
      for (const node of [osc2, lfo, lfoGain, f1, f2]) {
        try { node.disconnect(); } catch { /* Already disconnected. */ }
      }
      try { osc2.stop(); } catch { /* Already stopped. */ }
      try { lfo.stop(); } catch { /* Already stopped. */ }
    },
  };
  part.voices.add(voice);
  osc1.onended = () => { dispose(voice); part.voices.delete(voice); };
  osc1.start(time);
  osc2.start(time);
  lfo.start(time);
  const stopAt = time + duration + 0.04;
  osc1.stop(stopAt);
  osc2.stop(stopAt);
  lfo.stop(stopAt);
}

// Sixteen bars in F major: F, C, Dm, Bb, F, Am, Bb, C (two bars each).
const chords: readonly (readonly number[])[] = [
  [53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53],
  [53, 57, 60], [45, 48, 52], [46, 50, 53], [48, 52, 55],
];
const melodies: readonly (readonly number[])[] = [
  [69, 0, 72, 74, 72, 0, 69, 67],
  [67, 0, 64, 67, 72, 0, 67, 64],
  [69, 0, 65, 69, 74, 72, 69, 0],
  [70, 0, 69, 65, 62, 0, 65, 67],
  [72, 0, 69, 67, 65, 0, 69, 72],
  [69, 0, 72, 76, 72, 0, 69, 67],
  [65, 0, 70, 69, 65, 62, 65, 0],
  [67, 0, 64, 67, 72, 70, 67, 0],
];

function forest(part: Part, time: number): void {
  const eighth = 60 / 84 / 2;
  const step = part.step % 128;
  const bar = Math.floor(step / 8);
  const beat = step % 8;
  const harmony = Math.floor(bar / 2);
  const chord = chords[harmony] ?? chords[0] ?? [53, 57, 60];
  const root = chord[0] ?? 53;
  if (beat % 4 === 0) note(part, time, root - 12, eighth * 3.4, "triangle", 0.11);
  const arp = chord[(beat + (bar % 2)) % 3] ?? root;
  note(part, time, arp + 12, eighth * 0.75, "square", 0.026, 1300);
  const melody = melodies[harmony]?.[(beat + (bar % 2) * 4) % 8] ?? 0;
  if (melody) note(part, time, melody, eighth * 1.4, "triangle", 0.105);
  if (beat === 6 && bar % 4 === 3) note(part, time, root + 24, 0.55, "sine", 0.035);
}

function dungeon(part: Part, time: number): void {
  const beat = 60 / 64;
  const step = part.step % 128;
  const bar = Math.floor(step / 8);
  const pulse = step % 8;
  // D phrygian: the flattened second and occasional Ab produce restrained tension.
  if (pulse === 0) {
    const root = [38, 38, 39, 38, 38, 34, 39, 38][bar % 8] ?? 38;
    note(part, time, root - 12, beat * 4 + 0.6, "sawtooth", 0.075, 240, 0, true);
  }
  if (pulse === 0 || pulse === 4) {
    note(part, time, 43, 0.22, "sine", 0.15, 0, -19);
    note(part, time + 0.19, 40, 0.18, "sine", 0.085, 0, -16);
  }
  if (pulse === 3 && bar % 2 === 0) {
    const pitch = [74, 75, 80, 77][Math.floor(bar / 2) % 4] ?? 74;
    note(part, time, pitch, beat * 3.2, "sine", 0.065);
    note(part, time, pitch + 12.06, beat * 2, "triangle", 0.012, 2200);
  }
  if (pulse === 6 && bar % 4 === 3) note(part, time, 63, beat * 2.5, "triangle", 0.04, 950, -6);
}

const HEAVEN_CHORDS: readonly (readonly number[])[] = [
  [60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60],
  [60, 64, 67], [58, 62, 65], [55, 59, 62], [55, 60, 62],
];

// Soaring soprano choir lead over the 8-bar Goldfish of Destruction battle theme.
const CHOIR_LEAD: readonly (readonly number[])[] = [
  [72, 0, 0, 0, 76, 0, 79, 0],
  [79, 0, 0, 0, 76, 0, 74, 0],
  [76, 0, 0, 0, 72, 0, 76, 0],
  [77, 0, 0, 0, 74, 0, 72, 0],
  [79, 0, 0, 0, 81, 0, 84, 0],
  [82, 0, 0, 0, 81, 0, 77, 0],
  [79, 0, 0, 0, 74, 0, 76, 0],
  [79, 0, 0, 0, 74, 0, 79, 0],
];

function heaven(part: Part, time: number): void {
  const eighth = 60 / 112 / 2;
  const step = part.step % 64;
  const bar = Math.floor(step / 8);
  const beat = step % 8;
  const chord = HEAVEN_CHORDS[bar] ?? HEAVEN_CHORDS[0]!;
  const root = chord[0]!;
  // Sacred bass organ pedal
  if (beat === 0) {
    note(part, time, root - 24, eighth * 7.8, "sawtooth", 0.06, 380, 0, true);
    // Angelic lower choir (Tenor & Alto harmony singing "oh" and "ah")
    choirNote(part, time, chord[0]!, eighth * 8.1, 0.14, "oh");
    choirNote(part, time, chord[1]!, eighth * 8.1, 0.12, "ah");
    choirNote(part, time, chord[2]!, eighth * 8.1, 0.13, "ah");
  }
  // Soaring Soprano choir lead melody
  const soprano = CHOIR_LEAD[bar]?.[beat] ?? 0;
  if (soprano) {
    const dur = beat === 0 ? eighth * 3.9 : eighth * 2.1;
    choirNote(part, time, soprano, dur, 0.17, beat === 0 ? "ah" : "oh");
  }
  // Rhythmic drive & celestial harp chimes underneath the singing choir
  if (beat % 2 === 0) note(part, time, root - 12, eighth * 1.4, "triangle", 0.075);
  const chime = chord[beat % 3]! + (beat >= 4 ? 24 : 12);
  note(part, time, chime, eighth * 0.85, "sine", 0.045);
}

function retire(part: Part): void {
  for (const voice of part.voices) {
    try { voice.osc.stop(); } catch { /* Already stopped. */ }
    dispose(voice);
  }
  part.voices.clear();
  part.bus.disconnect();
}

function tick(): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  parts = parts.filter(part => {
    if (now >= part.end) { retire(part); return false; }
    if (part === current) {
      const bpm = part.name === "forest" ? 84 : part.name === "heaven" ? 112 : 64;
      const interval = 60 / bpm / 2;
      // Skip missed steps after a background-tab stall rather than bursting notes.
      if (part.next < now) {
        const skipped = Math.ceil((now - part.next) / interval);
        part.step += skipped;
        part.next += skipped * interval;
      }
      while (part.next < now + 0.2) {
        if (part.name === "forest") forest(part, part.next);
        else if (part.name === "heaven") heaven(part, part.next);
        else dungeon(part, part.next);
        part.next += interval;
        part.step++;
      }
    }
    return true;
  });
  if (!parts.length && scheduler !== undefined) {
    window.clearInterval(scheduler);
    scheduler = undefined;
  }
}

function reconcile(): void {
  if (typeof window === "undefined") return;
  const shared = getAudioContext();
  if (!shared) return;
  ctx = shared;
  if (waiting !== undefined) { window.clearInterval(waiting); waiting = undefined; }
  if (current?.name === requested || (!current && requested === null)) return;
  if (!master) {
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.06 * volume;
    master.connect(ctx.destination);
  }
  const now = ctx.currentTime;
  if (current) {
    ramp(current.bus.gain, 0, now, fade);
    current.end = now + fade;
    current = null;
  }
  if (requested) {
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(1, now + fade);
    bus.connect(master);
    current = { name: requested, bus, voices: new Set(), step: 0, next: now + 0.025, end: Infinity };
    parts.push(current);
  }
  if (parts.length && scheduler === undefined) scheduler = window.setInterval(tick, 25);
  tick();
}

export function playMusic(track: Track): void {
  requested = track;
  if (typeof window === "undefined") return;
  if (track === null && waiting !== undefined) {
    window.clearInterval(waiting);
    waiting = undefined;
  }
  reconcile();
  if (track !== null && !getAudioContext() && waiting === undefined) {
    waiting = window.setInterval(reconcile, 500);
  }
}
