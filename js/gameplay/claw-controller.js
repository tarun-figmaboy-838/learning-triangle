import { wait, playClassAnimation, prefersReducedMotion } from '../core/motion.js';
import { CRANE_RIG } from '../data/layout.js';

const STATES = CRANE_RIG.claw.states; // open → half → closed
const LAST = STATES.length - 1;

/** Stacks the claw sprites, top-aligned and centred under the cable. */
export function buildClawFrames(clawEl) {
  STATES.forEach((state, index) => {
    const frame = new Image();
    frame.className = 'claw-frame';
    frame.src = state.src;
    frame.alt = '';
    frame.draggable = false;
    frame.style.width = `${state.width}px`;
    frame.style.height = `${state.height}px`;
    if (index === 0) frame.classList.add('is-active');
    clawEl.appendChild(frame);
  });
}

/** Opens and closes the claw by stepping through its sprites. */
export function createClawController({ clawEl }) {
  const frames = Array.from(clawEl.querySelectorAll('.claw-frame'));
  let frameIndex = 0;

  function show(index) {
    frames.forEach((frame, k) => frame.classList.toggle('is-active', k === index));
    frameIndex = index;
  }

  async function stepTo(target, frameMs) {
    const ms = prefersReducedMotion() ? 0 : frameMs;
    const direction = target > frameIndex ? 1 : -1;
    while (frameIndex !== target) {
      show(frameIndex + direction);
      if (ms) await wait(ms);
    }
  }

  show(0);

  return {
    open: () => stepTo(0, 70),
    close: () => stepTo(LAST, 80),
    squeeze: () => playClassAnimation(clawEl, 'is-squeezing', 260),
    react: () => playClassAnimation(clawEl, 'is-reacting', 820),
    setClosed(closed) {
      show(closed ? LAST : 0);
    },
  };
}
