// Tiny chiptune sound effects with WebAudio. Created lazily after a user gesture.
let ac: AudioContext | null = null;
let muted = false;

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

function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.05, slide = 0, delay = 0) {
  if (!ac || muted) return;
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
  die: () => {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, "square", 0.04, -20, i * 0.18));
  },
};
