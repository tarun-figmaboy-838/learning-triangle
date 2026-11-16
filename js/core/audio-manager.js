/**
 * Procedural sound on WebAudio: every cue and the background music are synthesised (no sound files).
 * Guards: a per-sound minimum interval, and loud cues are staggered so two never fire at once.
 */
const LOUD_GAP_SECONDS = 0.085;
const STORAGE_KEY = 'bridge-builder.muted';

function createNoiseBuffer(context, seconds) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function shapeGain(gainNode, t0, { attack, peak, hold, release }) {
  const gain = gainNode.gain;
  gain.cancelScheduledValues(t0);
  gain.setValueAtTime(0.0001, t0);
  gain.linearRampToValueAtTime(peak, t0 + attack);
  gain.setValueAtTime(peak, t0 + attack + hold);
  gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

function makeTone(context, out) {
  return ({ type = 'sine', freq = 440, freqEnd, t0, duration = 0.2, gain = 0.2, attack = 0.005, release }) => {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, t0);
    if (freqEnd) oscillator.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
    const gainNode = context.createGain();
    const releaseTime = release ?? duration * 0.6;
    shapeGain(gainNode, t0, { attack, peak: gain, hold: Math.max(0, duration - attack - releaseTime), release: releaseTime });
    oscillator.connect(gainNode).connect(out);
    oscillator.start(t0);
    oscillator.stop(t0 + duration + 0.1);
  };
}

function makeNoise(context, out, buffer) {
  return ({ t0, duration = 0.1, gain = 0.2, filter = 'lowpass', freq = 1200, freqEnd, q = 0.7, attack = 0.004, release }) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const biquad = context.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(freq, t0);
    if (freqEnd) biquad.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
    biquad.Q.value = q;
    const gainNode = context.createGain();
    const releaseTime = release ?? duration * 0.6;
    shapeGain(gainNode, t0, { attack, peak: gain, hold: Math.max(0, duration - attack - releaseTime), release: releaseTime });
    source.connect(biquad).connect(gainNode).connect(out);
    source.start(t0);
    source.stop(t0 + duration + 0.1);
  };
}

/* ---- One-shot cues ---- */
const SOUNDS = {
  uiTap: { minInterval: 0.04, play: ({ tone, t0 }) => tone({ t0, freq: 720, freqEnd: 960, duration: 0.06, gain: 0.08 }) },
  /** A side or corner is pointed out: a soft rising bloop. */
  bloop: { minInterval: 0.25, play: ({ tone, t0 }) => tone({ t0, type: 'sine', freq: 420, freqEnd: 760, duration: 0.12, gain: 0.07, release: 0.08 }) },
  /** A frame is lifted: a springy boing. */
  boing: {
    minInterval: 0.3,
    play: ({ tone, t0 }) => {
      tone({ t0, type: 'sine', freq: 240, freqEnd: 520, duration: 0.09, gain: 0.08 });
      tone({ t0: t0 + 0.09, type: 'sine', freq: 520, freqEnd: 300, duration: 0.22, gain: 0.06, release: 0.18 });
    },
  },
  /** Wrong frame: a comic sad trombone (wah-wah-waaah), soft. */
  wahwah: {
    minInterval: 1,
    play: ({ tone, t0 }) => {
      [[0, 311, 294], [0.28, 294, 277], [0.56, 277, 220]].forEach(([at, f0, f1], i) => {
        tone({ t0: t0 + at, type: 'sawtooth', freq: f0, freqEnd: f1, duration: i === 2 ? 0.6 : 0.24, gain: 0.03, release: i === 2 ? 0.35 : 0.08 });
        tone({ t0: t0 + at, type: 'triangle', freq: f0 / 2, freqEnd: f1 / 2, duration: i === 2 ? 0.6 : 0.24, gain: 0.04, release: i === 2 ? 0.35 : 0.08 });
      });
    },
  },
  /** A part of the bridge is finished: a tiny ta-da. */
  tada: {
    minInterval: 1,
    play: ({ tone, t0 }) => {
      tone({ t0, type: 'triangle', freq: 784, duration: 0.1, gain: 0.06 });
      tone({ t0: t0 + 0.11, type: 'triangle', freq: 1047, duration: 0.32, gain: 0.07, release: 0.25 });
      tone({ t0: t0 + 0.11, type: 'sine', freq: 1568, duration: 0.3, gain: 0.025, release: 0.25 });
    },
  },
  /** The drafting board rising on its hydraulics: a low hum that settles with a click. */
  panelRise: {
    minInterval: 0.5,
    play: ({ tone, noise, t0 }) => {
      tone({ t0, type: 'sawtooth', freq: 70, freqEnd: 120, duration: 0.8, gain: 0.04, release: 0.3 });
      noise({ t0, duration: 0.8, gain: 0.03, filter: 'lowpass', freq: 500, release: 0.3 });
      noise({ t0: t0 + 0.82, duration: 0.04, gain: 0.16, filter: 'bandpass', freq: 1800, q: 2 });
    },
  },
  /** A side being drawn or traced: a soft pencil sweep. */
  drawLine: { minInterval: 0.2, play: ({ noise, t0 }) => noise({ t0, duration: 0.42, gain: 0.07, filter: 'bandpass', freq: 1800, freqEnd: 2600, q: 1.2, attack: 0.03, release: 0.25 }) },
  /** A measurement lands on its tag: a tape click and a small bright tone. */
  measure: {
    minInterval: 0.15,
    play: ({ tone, noise, t0 }) => {
      noise({ t0, duration: 0.03, gain: 0.14, filter: 'bandpass', freq: 3200, q: 2 });
      tone({ t0: t0 + 0.02, type: 'sine', freq: 880, freqEnd: 1180, duration: 0.14, gain: 0.07, release: 0.1 });
    },
  },
  /** A corner picked up to drag. */
  vertexPick: { minInterval: 0.15, play: ({ tone, t0 }) => tone({ t0, type: 'sine', freq: 520, freqEnd: 700, duration: 0.08, gain: 0.06 }) },
  /** Two sides become equal: a double click that settles. */
  snapEqual: {
    minInterval: 0.2,
    play: ({ tone, noise, t0 }) => {
      noise({ t0, duration: 0.025, gain: 0.14, filter: 'bandpass', freq: 2400, q: 2 });
      tone({ t0, type: 'triangle', freq: 660, duration: 0.07, gain: 0.07 });
      tone({ t0: t0 + 0.08, type: 'triangle', freq: 880, duration: 0.12, gain: 0.07, release: 0.1 });
    },
  },
  /** A right angle locks in: a firmer click with a ping. */
  snapRight: {
    minInterval: 0.2,
    play: ({ tone, noise, t0 }) => {
      noise({ t0, duration: 0.035, gain: 0.2, filter: 'bandpass', freq: 1900, q: 2 });
      tone({ t0, type: 'square', freq: 440, freqEnd: 330, duration: 0.06, gain: 0.05 });
      tone({ t0: t0 + 0.05, type: 'sine', freq: 1320, duration: 0.3, gain: 0.06, release: 0.26 });
    },
  },
  /** A wrong pick: a soft, neutral two-note nudge (no buzzer). */
  softNo: {
    minInterval: 0.4,
    play: ({ tone, t0 }) => {
      tone({ t0, type: 'sine', freq: 392, freqEnd: 370, duration: 0.14, gain: 0.07 });
      tone({ t0: t0 + 0.16, type: 'sine', freq: 330, freqEnd: 311, duration: 0.2, gain: 0.07, release: 0.15 });
    },
  },
  /** A category is named: a two-note chime. */
  badge: {
    minInterval: 0.3,
    play: ({ tone, t0 }) => {
      tone({ t0, type: 'sine', freq: 880, duration: 0.18, gain: 0.07 });
      tone({ t0: t0 + 0.12, type: 'sine', freq: 1319, duration: 0.42, gain: 0.07, release: 0.35 });
      tone({ t0: t0 + 0.12, type: 'triangle', freq: 1760, duration: 0.3, gain: 0.02, release: 0.25 });
    },
  },
  /** The winch taking the cable in (rising) or paying it out (falling), with a ratchet tick. */
  winchUp: {
    minInterval: 0.25,
    play: ({ tone, noise, t0 }) => {
      tone({ t0, type: 'sawtooth', freq: 95, freqEnd: 150, duration: 0.42, gain: 0.035, release: 0.2 });
      for (let i = 0; i < 4; i += 1) noise({ t0: t0 + i * 0.09, duration: 0.02, gain: 0.05, filter: 'highpass', freq: 3800 });
    },
  },
  winchDown: {
    minInterval: 0.25,
    play: ({ tone, noise, t0 }) => {
      tone({ t0, type: 'sawtooth', freq: 150, freqEnd: 92, duration: 0.42, gain: 0.032, release: 0.2 });
      for (let i = 0; i < 4; i += 1) noise({ t0: t0 + i * 0.1, duration: 0.02, gain: 0.045, filter: 'highpass', freq: 3400 });
    },
  },
  clawOpen: {
    minInterval: 0.12,
    play: ({ tone, noise, t0 }) => {
      tone({ t0, type: 'sawtooth', freq: 230, freqEnd: 410, duration: 0.16, gain: 0.05 });
      noise({ t0, duration: 0.12, gain: 0.05, filter: 'highpass', freq: 2600 });
    },
  },
  clawClose: {
    minInterval: 0.12,
    play: ({ tone, noise, t0 }) => {
      tone({ t0, type: 'sawtooth', freq: 410, freqEnd: 210, duration: 0.16, gain: 0.05 });
      noise({ t0: t0 + 0.14, duration: 0.035, gain: 0.16, filter: 'bandpass', freq: 1900, q: 2 });
    },
  },
  pickup: {
    loud: true,
    minInterval: 0.2,
    play: ({ tone, noise, t0 }) => {
      tone({ t0, type: 'sine', freq: 120, freqEnd: 78, duration: 0.2, gain: 0.3 });
      noise({ t0, duration: 0.08, gain: 0.16, freq: 650 });
    },
  },
  placement: {
    loud: true,
    minInterval: 0.2,
    play: ({ tone, noise, t0 }) => {
      noise({ t0, duration: 0.05, gain: 0.2, filter: 'bandpass', freq: 2400, q: 1.5 });
      tone({ t0, type: 'square', freq: 320, freqEnd: 240, duration: 0.12, gain: 0.08 });
      tone({ t0: t0 + 0.03, type: 'sine', freq: 1250, duration: 0.45, gain: 0.06, release: 0.4 });
    },
  },
  bolt: {
    minInterval: 0.06,
    play: ({ tone, noise, t0 }) => {
      tone({ t0, type: 'square', freq: 1700, duration: 0.03, gain: 0.05 });
      noise({ t0, duration: 0.03, gain: 0.1, filter: 'highpass', freq: 4200 });
    },
  },
  /** A cartoon hammer hit on steel: knock, ring and a little thud (each corner of a fitted frame). */
  clank: {
    minInterval: 0.08,
    play: ({ tone, noise, t0, options }) => {
      const pitch = [880, 990, 1110][(options?.variant ?? 0) % 3];
      noise({ t0, duration: 0.04, gain: 0.32, filter: 'bandpass', freq: 2600, q: 1.4 });
      tone({ t0, type: 'square', freq: pitch, freqEnd: pitch * 0.94, duration: 0.18, gain: 0.07, release: 0.16 });
      tone({ t0, type: 'sine', freq: pitch * 2.7, duration: 0.22, gain: 0.04, release: 0.2 });
      tone({ t0, type: 'sine', freq: 140, freqEnd: 80, duration: 0.09, gain: 0.22 });
    },
  },
  ding: {
    minInterval: 0.3,
    play: ({ tone, t0 }) => {
      tone({ t0, type: 'sine', freq: 1760, duration: 0.55, gain: 0.12, release: 0.5 });
      tone({ t0, type: 'sine', freq: 2637, duration: 0.3, gain: 0.04, release: 0.28 });
    },
  },
  correct: {
    loud: true,
    minInterval: 0.5,
    play: ({ tone, t0 }) => {
      [523, 659, 784, 1046].forEach((freq, index) => tone({ t0: t0 + index * 0.09, type: 'sine', freq, duration: 0.34, gain: 0.14, release: 0.28 }));
    },
  },
  incorrect: {
    loud: true,
    minInterval: 0.5,
    play: ({ tone, t0 }) => {
      tone({ t0, type: 'triangle', freq: 330, freqEnd: 300, duration: 0.26, gain: 0.16 });
      tone({ t0: t0 + 0.26, type: 'triangle', freq: 262, freqEnd: 236, duration: 0.36, gain: 0.16 });
    },
  },
  celebration: {
    loud: true,
    minInterval: 1,
    play: ({ tone, t0 }) => {
      const notes = [[523, 0], [659, 0.14], [784, 0.28], [1046, 0.42]];
      notes.forEach(([freq, offset]) => tone({ t0: t0 + offset, type: 'triangle', freq, duration: 0.3, gain: 0.14, release: 0.22 }));
      [523, 659, 784, 1046].forEach((freq) => tone({ t0: t0 + 0.62, type: 'sine', freq, duration: 1.1, gain: 0.06, release: 0.9 }));
    },
  },
  whoosh: {
    minInterval: 0.2,
    play: ({ noise, t0 }) => noise({ t0, duration: 0.38, gain: 0.2, filter: 'bandpass', freq: 500, freqEnd: 2600, q: 0.9, release: 0.2 }),
  },
};

/* ---- Loops ---- */
const LOOPS = {
  craneMotor: {
    start({ context, out, options }) {
      const heavy = Boolean(options?.heavy);
      const master = context.createGain();
      master.gain.setValueAtTime(0.0001, context.currentTime);
      master.gain.linearRampToValueAtTime(heavy ? 0.055 : 0.045, context.currentTime + 0.12);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = heavy ? 320 : 420;
      filter.connect(master).connect(out);
      const oscillators = [heavy ? 52 : 64, heavy ? 79 : 97].map((freq) => {
        const oscillator = context.createOscillator();
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = freq;
        oscillator.connect(filter);
        oscillator.start();
        return oscillator;
      });
      const wobble = context.createOscillator();
      wobble.frequency.value = heavy ? 6 : 9;
      const wobbleGain = context.createGain();
      wobbleGain.gain.value = 0.012;
      wobble.connect(wobbleGain).connect(master.gain);
      wobble.start();
      return {
        stop() {
          const now = context.currentTime;
          master.gain.cancelScheduledValues(now);
          master.gain.setTargetAtTime(0.0001, now, 0.05);
          setTimeout(() => {
            oscillators.forEach((oscillator) => oscillator.stop());
            wobble.stop();
          }, 300);
        },
      };
    },
  },
  /** The hoist winch while the player raises or lowers the claw: a higher whirr than the trolley motor. */
  winch: {
    start({ context, out }) {
      const master = context.createGain();
      master.gain.setValueAtTime(0.0001, context.currentTime);
      master.gain.linearRampToValueAtTime(0.03, context.currentTime + 0.08);
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 700;
      filter.Q.value = 1.4;
      filter.connect(master).connect(out);
      const oscillator = context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = 118;
      oscillator.connect(filter);
      oscillator.start();
      const flutter = context.createOscillator();
      flutter.frequency.value = 22;
      const flutterGain = context.createGain();
      flutterGain.gain.value = 0.008;
      flutter.connect(flutterGain).connect(master.gain);
      flutter.start();
      return {
        stop() {
          const now = context.currentTime;
          master.gain.cancelScheduledValues(now);
          master.gain.setTargetAtTime(0.0001, now, 0.04);
          setTimeout(() => { oscillator.stop(); flutter.stop(); }, 250);
        },
      };
    },
  },
};

/* ---- Background music: a light, looping construction-site tune, synthesised (no file ships) ----
   104 BPM, eight bars in C major (C G Am F C G F G): marimba melody, plucked off-beat chords, soft
   bass and kick, a shaker on every eighth. Notes are scheduled slightly ahead on the audio clock, so
   timing stays tight whatever the frame rate. */
const BPM = 104;
const EIGHTH = 60 / BPM / 2;
const CHORDS = [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65], [60, 64, 67], [59, 62, 67], [57, 60, 65], [59, 62, 67]];
const BASS = [36, 43, 45, 41, 36, 43, 41, 43];
/** [beat, midi note, length in beats] over the 32-beat loop. */
const MELODY = [
  [0, 76, 1], [1, 79, 1], [2, 81, 1], [3, 79, 1],
  [4, 74, 2], [6, 79, 1], [7, 76, 1],
  [8, 76, 1], [9, 81, 1], [10, 79, 1], [11, 76, 1],
  [12, 74, 1], [13, 72, 2],
  [16, 79, 1], [17, 81, 1], [18, 84, 1], [19, 81, 1],
  [20, 79, 1], [21, 76, 1], [22, 74, 2],
  [24, 72, 1], [25, 74, 1], [26, 76, 1], [27, 79, 1],
  [28, 74, 2], [30, 79, 0.5], [30.5, 76, 0.5], [31, 74, 1],
];
const MELODY_BY_STEP = new Map(MELODY.map(([beat, note, length]) => [Math.round(beat * 2), [note, length]]));
const midiHz = (note) => 440 * Math.pow(2, (note - 69) / 12);

function createMusic(context, out, noiseBuffer) {
  const bus = context.createGain();
  bus.gain.value = 0;
  bus.connect(out);
  let timer = 0;
  let nextTime = 0;
  let step = 0;

  function envelope(t0, peak, decay) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    gain.connect(bus);
    return gain;
  }
  function osc(type, freq, t0, length, destination) {
    const node = context.createOscillator();
    node.type = type;
    node.frequency.setValueAtTime(freq, t0);
    node.connect(destination);
    node.start(t0);
    node.stop(t0 + length + 0.05);
    return node;
  }
  /** Marimba-like mallet: a sine fundamental and a short bright fourth partial. */
  function mallet(note, t0, length, peak) {
    const decay = Math.min(1.1, 0.35 + length * EIGHTH);
    osc('sine', midiHz(note), t0, decay, envelope(t0, peak, decay));
    osc('sine', midiHz(note) * 4, t0, 0.09, envelope(t0, peak * 0.22, 0.09));
  }
  function pluck(note, t0, peak) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    filter.connect(envelope(t0, peak, 0.22));
    osc('triangle', midiHz(note), t0, 0.22, filter);
  }
  function bass(note, t0, peak) {
    const decay = EIGHTH * 1.8;
    osc('triangle', midiHz(note), t0, decay, envelope(t0, peak, decay));
    osc('sine', midiHz(note), t0, decay, envelope(t0, peak * 0.8, decay));
    osc('triangle', midiHz(note) * 2, t0, decay, envelope(t0, peak * 0.5, decay));   // an octave up: heard on small speakers
  }
  function kick(t0, peak) {
    const node = osc('sine', 120, t0, 0.16, envelope(t0, peak, 0.16));
    node.frequency.exponentialRampToValueAtTime(48, t0 + 0.14);
  }
  function shaker(t0, peak) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6500;
    source.connect(filter).connect(envelope(t0, peak, 0.05));
    source.start(t0, Math.random() * 1.2);
    source.stop(t0 + 0.07);
  }

  function scheduleStep(index, t0) {
    const inBar = index % 8;
    const bar = Math.floor(index / 8);
    if (inBar === 0 || inBar === 4) {
      kick(t0, 0.12);
      bass(BASS[bar] + (inBar === 4 ? 7 : 0), t0, 0.1);
    }
    if (index % 2 === 1) CHORDS[bar].forEach((note) => pluck(note, t0, 0.04));
    shaker(t0, index % 2 ? 0.035 : 0.022);
    const melody = MELODY_BY_STEP.get(index);
    if (melody) mallet(melody[0], t0, melody[1] * 2, 0.12);
  }

  function tick() {
    const now = context.currentTime;
    if (nextTime < now - 0.1) nextTime = now + 0.05;      // after a stall, rejoin the beat instead of bursting
    while (nextTime < now + 0.2) {
      scheduleStep(step, nextTime);
      nextTime += EIGHTH;
      step = (step + 1) % 64;
    }
  }

  return {
    start() {
      if (timer) return;
      const now = context.currentTime;
      nextTime = now + 0.08;
      step = 0;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(0.0001, now);
      bus.gain.exponentialRampToValueAtTime(1, now + 1.6);
      tick();
      timer = setInterval(tick, 50);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = 0;
      const now = context.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0.0001, now, 0.25);
    },
    /** Music sits further under the narration than the effects do. */
    duck(on) {
      if (!timer) return;
      bus.gain.setTargetAtTime(on ? 0.55 : 1, context.currentTime, 0.12);
    },
    get playing() {
      return Boolean(timer);
    },
  };
}

function readStoredMute() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function createAudioManager() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let muted = readStoredMute();
  let ducked = false;
  let lastLoudAt = 0;
  const lastPlayed = new Map();
  const activeLoops = new Map();
  let music = null;
  let musicWanted = false;
  let musicPaused = false;

  function syncMusic() {
    if (!context) return;
    music ??= createMusic(context, master, noiseBuffer);
    const shouldPlay = musicWanted && !musicPaused && context.state === 'running';
    if (shouldPlay && !music.playing) music.start();
    else if (!shouldPlay && music.playing) music.stop();
  }

  function ensureContext() {
    if (context) return context;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(context.destination);
    noiseBuffer = createNoiseBuffer(context, 1.5);
    return context;
  }

  function isReady() {
    const ctx = ensureContext();
    return Boolean(ctx && ctx.state === 'running');
  }

  function applyMasterGain() {
    if (!master) return;
    const target = muted ? 0 : ducked ? 0.42 : 1;
    master.gain.setTargetAtTime(target, context.currentTime, 0.06);
  }

  return {
    /** Call from a user gesture so the browser allows audio. */
    unlock() {
      // iPhone: play through the silent switch like a video does (Safari 17+), not as a muted ringer sound.
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
      const ctx = ensureContext();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    play(name, options) {
      const definition = SOUNDS[name];
      if (!definition) {
        console.warn(`[audio] unknown sound: ${name}`);
        return;
      }
      if (!isReady()) return;
      const now = context.currentTime;
      if (now - (lastPlayed.get(name) ?? -1) < (definition.minInterval ?? 0.05)) return;
      let t0 = now + 0.005;
      if (definition.loud) {
        if (t0 - lastLoudAt < LOUD_GAP_SECONDS) t0 = lastLoudAt + LOUD_GAP_SECONDS;
        lastLoudAt = t0;
      }
      lastPlayed.set(name, now);
      definition.play({ t0, options, tone: makeTone(context, master), noise: makeNoise(context, master, noiseBuffer) });
    },
    startLoop(name, options) {
      if (activeLoops.has(name) || !LOOPS[name] || !isReady()) return;
      activeLoops.set(name, LOOPS[name].start({ context, out: master, buffer: noiseBuffer, options }));
    },
    stopLoop(name) {
      const handle = activeLoops.get(name);
      if (!handle) return;
      activeLoops.delete(name);
      handle.stop();
    },
    stopAllLoops() {
      for (const name of [...activeLoops.keys()]) this.stopLoop(name);
    },
    get muted() {
      return muted;
    },
    setMuted(value) {
      muted = Boolean(value);
      applyMasterGain();
      try {
        localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
      } catch {
        /* storage unavailable: mute still applies for this session */
      }
    },
    /** Effects sit under the narration while a voice line plays. */
    duck(on) {
      ducked = Boolean(on);
      applyMasterGain();
      music?.duck(ducked);
    },
    /** Background music: starts once audio is unlocked (the Start tap), loops until stopped. */
    startMusic() {
      musicWanted = true;
      const ctx = ensureContext();
      if (!ctx) return;
      if (ctx.state === 'running') syncMusic();
      else ctx.resume().then(syncMusic).catch(() => {});
    },
    stopMusic() {
      musicWanted = false;
      syncMusic();
    },
    /** Hidden tab: the music pauses, and picks up again when the game is back in view. */
    setMusicPaused(paused) {
      musicPaused = Boolean(paused);
      syncMusic();
    },
    toggleMuted() {
      this.setMuted(!muted);
      return muted;
    },
  };
}
