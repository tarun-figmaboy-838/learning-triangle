import { YARD_FRAMES } from '../data/yard-frames.js';
import { buildFrameSvg } from './frame-shapes.js';
import { PLATFORM_LAYOUT } from '../data/layout.js';
import { wait, playClassAnimation, prefersReducedMotion } from '../core/motion.js';

/** The yard platform in front of the canal and the steel frames lying on it (the hook lifts one of them). */
export function createYardController({ platformEl, placedLayerEl }) {
  const deck = new Image();
  deck.className = 'platform__deck';
  deck.src = PLATFORM_LAYOUT.src;
  deck.alt = '';
  deck.draggable = false;
  const framesLayer = document.createElement('div');
  framesLayer.className = 'platform__options';
  platformEl.append(deck, framesLayer);
  const pile = [];

  /** A frame element plus its geometry: size, corner positions, and the top corner the claw grabs. */
  function buildFrame(frame, index) {
    const { svg, ...geometry } = buildFrameSvg(frame, { scale: PLATFORM_LAYOUT.pileScale });
    const element = document.createElement('div');
    element.className = 'triangle triangle--pile';
    element.style.width = `${geometry.width}px`;
    element.style.height = `${geometry.height}px`;
    element.appendChild(svg);
    const item = { id: `pile-${index}`, element, ...geometry, homeCenterX: PLATFORM_LAYOUT.pileXs[index], baseY: PLATFORM_LAYOUT.baseY };
    element.style.left = `${item.homeCenterX - item.width / 2}px`;
    element.style.top = `${item.baseY - item.baseOffset}px`;
    return item;
  }

  function enter(element, delayMs) {
    if (prefersReducedMotion()) return;
    element.style.animationDelay = `${delayMs}ms`;
    element.classList.add('is-entering');
    element.addEventListener('animationend', () => {
      element.classList.remove('is-entering');
      element.style.animationDelay = '';
    }, { once: true });
  }

  async function leave(elements) {
    if (!elements.length) return;
    if (!prefersReducedMotion()) {
      elements.forEach((element, index) => {
        element.style.animationDelay = `${index * 60}ms`;
        element.classList.add('is-leaving');
      });
      await wait(400 + elements.length * 60);
    }
    elements.forEach((element) => element.remove());
  }

  return {
    enterPlatform: () => playClassAnimation(platformEl, 'is-entering', 800),
    showIntroPile() {
      if (pile.length) return;
      YARD_FRAMES.forEach((frame, index) => {
        const item = buildFrame(frame, index);
        framesLayer.appendChild(item.element);
        pile.push(item);
        enter(item.element, index * 90);
      });
    },
    pileItems() {
      return [...pile];
    },
    async clearIntroPile() {
      const elements = pile.map((item) => item.element);
      pile.length = 0;
      await leave(elements);
    },
    /** One frame after another gives a small focus bob (never all at once). */
    async focusPulseSequence(signal) {
      for (const item of pile) {
        playClassAnimation(item.element, 'is-focus-pulse', 800);
        await wait(prefersReducedMotion() ? 0 : 170, signal);
      }
    },
    /** The frame now stands in the world at the scale its depth gave it (0.6 on the bridge). */
    placeInWorld(item, left, top, scale = 1) {
      item.element.style.left = `${left}px`;
      item.element.style.top = `${top}px`;
      item.element.style.width = `${item.width * scale}px`;
      item.element.style.height = `${item.height * scale}px`;
      item.element.classList.toggle('is-scaled', scale !== 1);
      placedLayerEl.appendChild(item.element);
    },
    seat: (item) => playClassAnimation(item.element, 'is-seated', 600),
    rejectShake: (item) => playClassAnimation(item.element, 'is-rejected', 720),
    async dropIntoWater(item) {
      await playClassAnimation(item.element, 'is-falling', 980);
      item.element.remove();
    },
  };
}
