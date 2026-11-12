// Tiny chiptune sound effects with WebAudio. Created lazily after a user gesture.
let ac: AudioContext | null = null;
let muted = false;
let volume = 0.8;

export function initAudio() {
  if (typeof window === "undefined") return;
  if (!ac) {
    try {
      ac = new AudioContext();
    } catch {
      ac = null;
    }
  } else if (ac.state === "suspended") {
    void ac.resume();
  }
}

export function setMuted(m: boolean) {
  muted = m;
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
}

function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.05, slide = 0, delay = 0) {
  if (!ac || muted || volume <= 0) return;
  vol *= volume * 1.25;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  jump: () => tone(330, 0.12, "square", 0.035, 260),
  eat: () => {
    tone(260, 0.06, "square", 0.05, -80);
    tone(200, 0.07, "square", 0.05, -60, 0.08);
    tone(523, 0.1, "triangle", 0.05, 0, 0.17);
  },
  hurt: () => tone(180, 0.25, "sawtooth", 0.05, -110),
  stomp: () => tone(620, 0.12, "square", 0.045, -420),
  talk: () => tone(620 + Math.random() * 240, 0.05, "triangle", 0.05),
  discover: () => {
    [392, 494, 587, 784].forEach((f, i) => tone(f, 0.18, "triangle", 0.05, 0, i * 0.11));
  },
  bite: () => {
    tone(880, 0.06, "square", 0.05);
    tone(1175, 0.08, "square", 0.05, 0, 0.08);
  },
  cast: () => tone(500, 0.18, "triangle", 0.04, -300),
  splash: () => tone(140, 0.2, "triangle", 0.05, -60),
  caught: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, "square", 0.04, 0, i * 0.07));
  },
  release: () => {
    [523, 659, 784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.35, "triangle", 0.035, 0, i * 0.18));
  },
  coin: () => {
    tone(988, 0.07, "square", 0.04);
    tone(1319, 0.12, "square", 0.04, 0, 0.07);
  },
  door: () => tone(220, 0.15, "triangle", 0.05, 80),
  menu: () => tone(660, 0.05, "square", 0.03),
  puff: () => tone(240, 0.12, "triangle", 0.05, -140),
  djump: () => {
    tone(520, 0.08, "square", 0.03, 300);
    tone(880, 0.1, "triangle", 0.03, 200, 0.05);
  },
  bossHit: () => tone(140, 0.18, "sawtooth", 0.06, -60),
  gate: () => {
    tone(110, 0.45, "sawtooth", 0.05, 60);
    tone(165, 0.4, "triangle", 0.04, 40, 0.12);
  },
  nap: () => {
    [392, 330, 262].forEach((f, i) => tone(f, 0.3, "triangle", 0.035, 0, i * 0.25));
  },
  die: () => {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, "square", 0.04, -20, i * 0.18));
  },
};
