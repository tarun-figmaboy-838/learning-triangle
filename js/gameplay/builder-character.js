import { CRANE_RIG } from '../data/layout.js';
import { prefersReducedMotion } from '../core/motion.js';

const ATLAS = 'assets/images/operator/';
/**
 * The seated operator: one 2 × 2 atlas per pose family, framed alike (the beaver at his joystick box).
 * The sheets were generated separately, so each is scaled and nudged (in % of a frame) to match the idle
 * sheet exactly; without it the beaver would shift by a pixel or two whenever he changes pose.
 */
const SHEETS = Object.freeze({
  idle: { src: `${ATLAS}idle.webp`, scale: 1, x: 0, y: 0 },
  talk: { src: `${ATLAS}talk.webp`, scale: 0.9879, x: 0.554, y: 0.996 },
  happy: { src: `${ATLAS}happy.webp`, scale: 1, x: 0, y: 0 },
  sad: { src: `${ATLAS}sad.webp`, scale: 0.9982, x: 0.012, y: 0.166 },
  actions: { src: `${ATLAS}actions.webp`, scale: 1, x: 0.638, y: -0.478 },
});
export const BUILDER_FRAME_SOURCES = Object.values(SHEETS).map((sheet) => sheet.src);
/** Talking: only the mouth moves (closed, open, wide, smile), in an uneven, speech-like rhythm. */
const TALK_FRAMES = [1, 0, 2, 3, 0, 1, 2, 0, 3, 1, 0, 2];
const TALK_MS = [120, 90, 150, 110, 80, 130, 140, 90, 120, 100, 80, 160];
const POSES = {
  idle: { sheet: 'idle', frames: [0, 1, 2, 1, 0], durations: [3200, 70, 90, 70, 1200] },
  talk: { sheet: 'talk', frames: TALK_FRAMES, durations: TALK_MS },
  cheer: { sheet: 'happy', frames: [0, 1, 2, 3, 1, 0], ms: 260, once: true },
  worry: { sheet: 'sad', frames: [0, 1, 2, 1, 3], ms: 300, once: true },
  point: { sheet: 'happy', frames: [0, 1, 3, 0], ms: 300, once: true },
  pick: { sheet: 'actions', frames: [0], ms: 200 },
  carry: { sheet: 'actions', frames: [1], ms: 200 },
  drop: { sheet: 'actions', frames: [2], ms: 200 },
};
const REACTIONS = new Set(['talk', 'cheer', 'worry', 'point']);
/** The operator's working pose for each crane phase: focused while picking, watching the load, easing it down. */
const PHASE_POSES = Object.freeze({
  loweringToPick: 'pick', grabbing: 'pick',
  liftingTriangle: 'carry', carrying: 'carry', transportingDepth: 'carry', aligningWithBridge: 'carry',
  loweringToPlace: 'drop', releasing: 'drop', returning: 'drop',
});

export function createBuilderCharacter({ hostEl }) {
  const { cabWindow } = CRANE_RIG;
  const root = document.createElement('div');
  root.className = 'builder';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  Object.assign(root.style, { left: `${cabWindow.left}px`, top: `${cabWindow.top}px`, width: `${cabWindow.width}px`, height: `${cabWindow.height}px` });
  // One frame layer: frames swap instantly, as in any sprite animation (the sheets are scale-matched).
  root.innerHTML = '<div class="builder__body"><div class="builder__frame is-on"></div></div>';
  hostEl.appendChild(root);
  // The cab's front (body, window frame and a glass sheet) goes over the operator, so he sits inside, behind glass.
  const { cabin } = CRANE_RIG;
  const cabFront = new Image();
  cabFront.className = 'crane-cabin-front';
  cabFront.src = cabin.frontSrc;
  cabFront.alt = '';
  cabFront.draggable = false;
  Object.assign(cabFront.style, { left: `${cabin.left}px`, top: `${cabin.top}px`, width: `${cabin.width}px`, height: `${cabin.height}px` });
  hostEl.appendChild(cabFront);
  const beaconEl = hostEl.querySelector('.cab-beacon');
  if (beaconEl) hostEl.appendChild(beaconEl);   // the beacon's glow stays on top of the cab roof
  const frameEl = root.querySelector('.builder__frame');
  let shownKey = '';
  let pose = 'idle';
  let interval = 0;
  let returnTimer = 0;
  let index = 0;
  let revision = 0;
  let machinePose = 'idle';      // his working pose for the crane's current phase
  function paint(layer, sheet, number) {
    const fit = SHEETS[sheet];
    layer.style.backgroundImage = `url("${fit.src}")`;
    layer.style.backgroundPosition = `${(number % 2) * 100}% ${Math.floor(number / 2) * 100}%`;
    layer.style.transform = `translate(${fit.x}%, ${fit.y}%) scale(${fit.scale})`;
  }
  function show(number) {
    const sheet = POSES[pose].sheet;
    const key = `${sheet}:${number}`;
    if (key !== shownKey) {
      shownKey = key;
      paint(frameEl, sheet, number);
    }
  }
  function advance() {
    const definition = POSES[pose];
    if (root.hidden || document.hidden || prefersReducedMotion() || definition.frames.length < 2) return;
    interval = setTimeout(() => {
      if (definition.once && index === definition.frames.length - 1) return;
      index = (index + 1) % definition.frames.length;
      show(definition.frames[index]);
      advance();
    }, definition.durations?.[index] ?? definition.ms);
  }
  function setPose(name, { thenIdleAfter = 0 } = {}) {
    clearTimeout(interval);
    clearTimeout(returnTimer);
    interval = 0;
    revision += 1;
    pose = POSES[name] ? name : 'idle';
    root.dataset.pose = pose;
    index = 0;
    show(POSES[pose].frames[0]);
    advance();
    if (thenIdleAfter) returnTimer = setTimeout(() => setPose(machinePose), thenIdleAfter);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(interval); interval = 0; }
    else if (!root.hidden) setPose(machinePose);
  });
  return {
    show() { root.hidden = false; setPose(machinePose); },
    hide() { root.hidden = true; setPose('idle'); },
    get cabCenter() { return { x: cabWindow.left + cabWindow.width / 2, y: cabWindow.top + cabWindow.height / 2 }; },
    /** Where the speech-bubble tail points: just right of the cab glass, level with the operator's mouth. */
    get bubbleAnchor() { return { x: CRANE_RIG.cabin.left + CRANE_RIG.cabin.width - 8, y: cabWindow.top + cabWindow.height * 0.34 }; },
    /** The crane's phase decides his working pose (unless he is reacting to something). */
    setGameState(state) {
      machinePose = PHASE_POSES[state.craneState] ?? 'idle';
      if (!REACTIONS.has(pose) && machinePose !== pose) setPose(machinePose);
    },
    async talkUntil(finished) {
      setPose('talk');
      const token = revision;
      try { await finished; } finally { if (token === revision) setPose(machinePose); }
    },
    cheer() { setPose('cheer', { thenIdleAfter: 2300 }); },
    worry() { setPose('worry', { thenIdleAfter: 2100 }); },
    point() { setPose('point', { thenIdleAfter: 1600 }); },
    /** A small satisfied nod in the seat (a good grab): no pose change, just the body. */
    nod() {
      root.classList.remove('is-nodding');
      void root.offsetWidth;
      root.classList.add('is-nodding');
      setTimeout(() => root.classList.remove('is-nodding'), 700);
    },
  };
}
