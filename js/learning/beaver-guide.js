/**
 * The beaver in the workshop. For the lesson the operator climbs down from the cab and stands at the
 * foot of the card when he has something to show: eleven painted frames (assets/images/workshop/
 * beaver-*.png, generated with Figma to match the cab operator) stepped as short sprite cycles (an idle
 * blink, a talking mouth, a two-frame cheer, a wind-up before he points, a tape-measure cycle while a
 * side is measured, a protractor while an angle is), registered on his boots so he never jumps, with a
 * quick cross-fade between frames and gentle body motion layered on top.
 */
import { prefersReducedMotion } from '../core/motion.js';

const DIR = 'assets/images/workshop/';
/** Per frame: the art, its size, the x of the boots' centre, the y of the ground line, the body height (for a common scale). */
export const GUIDE_FRAMES = Object.freeze({
  idle: { src: `${DIR}beaver-measure.png`, width: 356, height: 619, centre: 147, ground: 612, body: 606 , hat: [167, 6] },
  blink: { src: `${DIR}beaver-idle-blink.png`, width: 324, height: 607, centre: 198, ground: 600, body: 593 , hat: [186, 7] },
  talk: { src: `${DIR}beaver-idle-talk.png`, width: 321, height: 607, centre: 191, ground: 600, body: 594 , hat: [184, 6] },
  point: { src: `${DIR}beaver-point.png`, width: 402, height: 615, centre: 204, ground: 608, body: 602 , hat: [177, 6] },
  pointMid: { src: `${DIR}beaver-point-mid.png`, width: 371, height: 609, centre: 176, ground: 602, body: 596 , hat: [176, 6] },
  think: { src: `${DIR}beaver-think.png`, width: 311, height: 616, centre: 175, ground: 609, body: 603 , hat: [166, 6] },
  cheer: { src: `${DIR}beaver-cheer.png`, width: 392, height: 617, centre: 185, ground: 610, body: 604 , hat: [188, 6] },
  cheerMid: { src: `${DIR}beaver-cheer-mid.png`, width: 368, height: 610, centre: 184, ground: 603, body: 596 , hat: [180, 7] },
  tape1: { src: `${DIR}beaver-tape-1.png`, width: 333, height: 597, centre: 191, ground: 590, body: 584 , hat: [176, 6], hand: [335, 272] },
  tape2: { src: `${DIR}beaver-tape-2.png`, width: 375, height: 591, centre: 187, ground: 584, body: 578 , hat: [163, 6], hand: [330, 270] },
  tape3: { src: `${DIR}beaver-tape-3.png`, width: 409, height: 591, centre: 180, ground: 584, body: 578 , hat: [157, 6], hand: [345, 268] },
  // Holding the protractor: `tool` is the centre of its flat edge (set on the corner), `disc` the way its
  // round side faces, `bodyDir` where his body is relative to the tool (so he can be kept outside the shape).
  protLow: { src: `${DIR}beaver-protractor-low.png`, width: 943, height: 978, centre: 300, ground: 970, body: 963, hat: [400, 7], tool: [678, 890], disc: [0, -1], bodyDir: [-1, 0] },
  protSide: { src: `${DIR}beaver-protractor-side.png`, width: 787, height: 990, centre: 300, ground: 982, body: 976, hat: [240, 6], tool: [560, 340], disc: [1, 0], bodyDir: [-1, 0] },
  protHigh: { src: `${DIR}beaver-protractor-high.png`, width: 631, height: 995, centre: 300, ground: 988, body: 763, hat: [160, 225], tool: [330, 32], disc: [0, 1], bodyDir: [0, 1] },
  walk1: { src: `${DIR}beaver-walk-1.png`, width: 374, height: 521, centre: 203, ground: 514, body: 508 , hat: [200, 6], hand: [318, 300] },
  walk2: { src: `${DIR}beaver-walk-2.png`, width: 332, height: 534, centre: 167, ground: 527, body: 521 , hat: [164, 6], hand: [282, 312] },
  walk3: { src: `${DIR}beaver-walk-3.png`, width: 360, height: 520, centre: 188, ground: 513, body: 507 , hat: [186, 6], hand: [303, 298] },
  walk4: { src: `${DIR}beaver-walk-4.png`, width: 335, height: 533, centre: 169, ground: 526, body: 520 , hat: [166, 6], hand: [284, 311] },
});
/** Each pose is a short cycle of frames. `once` holds the last frame. */
const POSES = Object.freeze({
  idle: { frames: ['idle', 'blink', 'idle', 'blink', 'idle'], durations: [3400, 110, 160, 90, 2200] },
  talk: { frames: ['talk', 'idle', 'talk', 'blink', 'talk', 'idle'], durations: [150, 110, 170, 90, 140, 120] },
  cheer: { frames: ['cheer', 'cheerMid'], durations: [240, 240] },
  point: { frames: ['pointMid', 'point'], durations: [160, 100000], once: true },
  think: { frames: ['think', 'think', 'blink'], durations: [3000, 2000, 110] },
  measuring: { frames: ['tape1', 'tape2', 'tape3', 'tape3', 'tape2'], durations: [320, 300, 420, 400, 260] },
  protLow: { frames: ['protLow'], durations: [1000] },
  protSide: { frames: ['protSide'], durations: [1000] },
  protHigh: { frames: ['protHigh'], durations: [1000] },
  walk: { frames: ['walk1', 'walk2', 'walk3', 'walk4'], durations: [115, 115, 115, 115] },
  walkStop: { frames: ['walk1'], durations: [1000] },
});
const HEIGHT = 372;                      // on stage
const SCALE = HEIGHT / 606;
export const GUIDE_IMAGES = Object.values(GUIDE_FRAMES).map((frame) => frame.src);

export function createBeaverGuide({ hostEl, x, groundY }) {
  const root = document.createElement('div');
  root.className = 'guide';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  root.style.left = `${x}px`;
  root.style.top = `${groundY}px`;
  const pivot = document.createElement('div');
  pivot.className = 'guide__pivot';
  const body = document.createElement('div');
  body.className = 'guide__body';
  pivot.appendChild(body);
  root.appendChild(pivot);
  const home = { x, groundY };
  const layers = {};
  for (const [name, frame] of Object.entries(GUIDE_FRAMES)) {
    const image = new Image();
    image.className = 'guide__frame';
    image.dataset.frame = name;
    image.alt = '';
    image.draggable = false;
    image.src = frame.src;
    body.appendChild(image);
    layers[name] = image;
  }
  let registration = 'feet';
  let placed = { x: 0, y: 0, scale: 1, flip: false, rotate: 0 };
  let shownFrame = 'idle';
  /**
   * Frames from different sheets differ by a few px, so each is scaled to a common body height and
   * registered on the boots' centre (walking, measuring: his feet on the line) or on the hat's
   * top-centre (peeking over a card: his head stays put while the mouth moves).
   */
  function fitFrames() {
    for (const [name, frame] of Object.entries(GUIDE_FRAMES)) {
      const image = layers[name];
      const k = SCALE * (606 / (frame.body || 600));
      const [ax, ay] = registration === 'head' ? frame.hat : registration === 'tool' ? (frame.tool ?? [frame.centre, frame.ground]) : [frame.centre, frame.ground];
      image.style.width = `${(frame.width * k).toFixed(1)}px`;
      image.style.height = `${(frame.height * k).toFixed(1)}px`;
      image.style.left = `${(-ax * k).toFixed(1)}px`;
      image.style.top = `${(-ay * k).toFixed(1)}px`;
    }
  }
  fitFrames();
  hostEl.appendChild(root);
  let pose = 'idle';
  let index = 0;
  let timer = 0;
  let returnTimer = 0;
  let talking = false;
  let present = false;

  function show(frameName) {
    shownFrame = frameName;
    for (const [key, layer] of Object.entries(layers)) layer.classList.toggle('is-on', key === frameName);
  }
  function advance() {
    clearTimeout(timer);
    const definition = POSES[pose];
    if (root.hidden || document.hidden || prefersReducedMotion() || definition.frames.length < 2) return;
    timer = setTimeout(() => {
      if (definition.once && index === definition.frames.length - 1) return;
      index = (index + 1) % definition.frames.length;
      show(definition.frames[index]);
      advance();
    }, definition.durations[index]);
  }
  function setPose(name, { thenIdleAfter = 0 } = {}) {
    clearTimeout(returnTimer);
    pose = POSES[name] ? name : 'idle';
    root.dataset.pose = pose;
    index = 0;
    show(POSES[pose].frames[0]);
    advance();
    if (thenIdleAfter) returnTimer = setTimeout(() => setPose(talking ? 'talk' : 'idle'), thenIdleAfter);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !root.hidden) setPose(pose); });
  setPose('idle');

  return {
    element: root,
    get pose() { return pose; },
    get isPresent() { return present; },
    /** Steps in at the foot of the card (a short walk-in), then settles. */
    async enter() {
      if (present) return;
      present = true;
      root.hidden = false;
      setPose('idle');
      root.classList.remove('is-leaving');
      root.classList.add('is-entering');
      await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 0 : 700));
      root.classList.remove('is-entering');
    },
    /** Steps away (precise work, questions and checkpoints are the learner's alone). */
    async leave() {
      if (!present) return;
      present = false;
      root.classList.add('is-leaving');
      await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 0 : 500));
      root.classList.remove('is-leaving');
      root.hidden = true;
      clearTimeout(timer);
    },
    setPose,
    point: (holdMs = 2600) => setPose('point', { thenIdleAfter: holdMs }),
    think: (holdMs = 0) => setPose('think', { thenIdleAfter: holdMs }),
    cheer: (holdMs = 2400) => setPose('cheer', { thenIdleAfter: holdMs }),
    measuring: () => setPose('measuring'),
    /**
     * Walks to a spot on the card (card px, his feet), smaller and facing the way the work goes, with a
     * slight lean into it: measuring a side from its lower end, reading a corner with the protractor.
     */
    moveTo({ x: toX, y: toY, scale = 0.5, flip = false, rotate = 0 }) {
      root.classList.remove('is-instant');
      root.classList.add('is-walking');
      this.placeAt({ x: toX, y: toY, scale, flip, rotate });
      return new Promise((resolve) => setTimeout(() => { root.classList.remove('is-walking'); resolve(); }, prefersReducedMotion() ? 0 : 520));
    },
    /** Sets his place at once (every frame while he walks along a side). `rotate` turns him onto the side. */
    placeAt({ x: toX, y: toY, scale = 0.5, flip = false, rotate = 0 }) {
      placed = { x: toX, y: toY, scale, flip, rotate };
      root.style.left = `${toX.toFixed(1)}px`;
      root.style.top = `${toY.toFixed(1)}px`;
      pivot.style.transform = `scale(${(flip ? -scale : scale).toFixed(3)}, ${scale.toFixed(3)}) rotate(${rotate.toFixed(1)}deg)`;
    },
    /** Instant placement without the walking transition (used while he walks along a side with the tape). */
    setInstant(on) {
      root.classList.toggle('is-instant', Boolean(on));
    },
    /** Where the hand that holds the tape is right now (stage px), for the tape to run up to it. */
    handPoint() {
      const frame = GUIDE_FRAMES[shownFrame] ?? GUIDE_FRAMES.idle;
      const hand = frame.hand ?? [frame.centre, frame.ground - 240];
      const k = SCALE * (606 / (frame.body || 600));
      const [ax, ay] = registration === 'head' ? frame.hat : registration === 'tool' ? (frame.tool ?? [frame.centre, frame.ground]) : [frame.centre, frame.ground];
      let lx = (hand[0] - ax) * k;
      const ly = (hand[1] - ay) * k;
      const r = (placed.rotate * Math.PI) / 180;
      const rx = lx * Math.cos(r) - ly * Math.sin(r);
      const ry = lx * Math.sin(r) + ly * Math.cos(r);
      return { x: placed.x + (placed.flip ? -rx : rx) * placed.scale, y: placed.y + ry * placed.scale };
    },
    /**
     * Which held-protractor frame to use at a corner, flipped or not, and how far to turn it, so that the
     * protractor's flat edge lies along one side and its round side faces into the corner while he
     * stays upright-ish and outside the shape. `sides` are the two unit directions from the corner.
     */
    pickToolPose(sides) {
      const deg = (v) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;
      const wrap = (a) => ((a + 540) % 360) - 180;
      const inward = [sides[0][0] + sides[1][0], sides[0][1] + sides[1][1]];
      let best = null;
      for (const [k, d] of sides.entries()) {
        const other = sides[1 - k];
        let n = [-d[1], d[0]];
        if (n[0] * other[0] + n[1] * other[1] < 0) n = [-n[0], -n[1]];         // the perpendicular that points into the corner
        for (const frameName of ['protLow', 'protSide', 'protHigh']) {
          const frame = GUIDE_FRAMES[frameName];
          for (const flip of [false, true]) {
            const disc = [flip ? -frame.disc[0] : frame.disc[0], frame.disc[1]];
            const body = [flip ? -frame.bodyDir[0] : frame.bodyDir[0], frame.bodyDir[1]];
            const rotate = wrap(deg(n) - deg(disc));
            const r = (rotate * Math.PI) / 180;
            const bodyNow = [body[0] * Math.cos(r) - body[1] * Math.sin(r), body[0] * Math.sin(r) + body[1] * Math.cos(r)];
            const inside = bodyNow[0] * inward[0] + bodyNow[1] * inward[1] > 0.15;
            const cost = Math.abs(rotate) + (inside ? 1000 : 0) + (frameName === 'protLow' ? 0 : 4);
            if (!best || cost < best.cost) best = { frameName, flip, rotate, cost };
          }
        }
      }
      return best;
    },
    /** 'feet' (the origin is his boots on the ground), 'head' (the top of his hat) or 'tool' (the protractor's centre). */
    setRegistration(mode) {
      registration = mode === 'head' || mode === 'tool' ? mode : 'feet';
      fitFrames();
    },
    /** Back to his place at the foot of the card. */
    home() {
      return this.moveTo({ x: home.x, y: home.groundY, scale: 1, flip: true, rotate: 0 });   // at home he faces the shape
    },
    idle: () => setPose('idle'),
    /** While a line is spoken: the talking cycle, then back to idle (unless a reaction took over). */
    async talkUntil(finished) {
      talking = true;
      if (pose === 'idle' || pose === 'talk') setPose('talk');
      root.classList.add('is-talking');
      try { await finished; } finally {
        talking = false;
        root.classList.remove('is-talking');
        if (pose === 'talk') setPose('idle');
      }
    },
    /** A quick satisfied nod (a right answer, a good drag). */
    nod() {
      root.classList.remove('is-nodding');
      void root.offsetWidth;
      root.classList.add('is-nodding');
      setTimeout(() => root.classList.remove('is-nodding'), 700);
    },
    destroy() {
      clearTimeout(timer);
      clearTimeout(returnTimer);
      root.remove();
    },
  };
}
