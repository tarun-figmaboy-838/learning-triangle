/**
 * Runs the Triangle Workshop from its content map, one screen at a time, on one cancellable timeline.
 *
 * Every screen moves through the same states (ENTERING → NARRATING / DEMONSTRATING → WAITING_FOR_INPUT /
 * INTERACTING → CHECKING → FEEDBACK → REINFORCING → TRANSITIONING); the card's data-state gates pointer
 * input, so only one state ever accepts it and animations never fight a tap. There are no NEXT buttons:
 * a teaching screen moves on by itself once its line has been read, an interaction moves on at success,
 * and the deck's own CHECK / CONTINUE buttons are the only ones the learner presses.
 */
import { LEARNING_SCREENS, LEARNING_COPY } from './learning-content.js';
import { layoutFromSpec, goalMet } from './triangle-model.js';
import { BOARD } from './workshop-board.js';
import {
  createPillButton, createBadge, createLens, createGreatJob,
  createOptionCard, createMultiGrid, createSortBoard, createSortResult, createDualCard, createSummaryView,
} from './workshop-widgets.js';
import { createSequenceScope, wait, isAbortError, prefersReducedMotion } from '../core/motion.js';

const FRAME = Object.freeze({ center: { cx: 780, cy: 300 }, stack: { cx: 780, cy: 250 }, dual: { cx: 780, cy: 215 } });
const DRAG_BOUNDS = Object.freeze({ left: 80, top: 40, right: BOARD.canvas.width - 80, bottom: BOARD.canvas.height - 40 });
const COLUMN_GAP = 60;                     // badges and lenses sit this far right of the triangle
const SIDE_ORDER = [0, 2, 1];              // left, right, bottom: the deck's reading order (5 cm, 4 cm, 6 cm) and a clockwise walk
const CORNER_ORDER = [0, 2, 1];            // top, right, left: clockwise
/** The beaver appears only where he does something: measuring the shape, and explaining the summary cards. */
const GUIDE_SCREENS = new Set(['measureSides', 'measureAngles', 'summary']);
/** The summary's big card (surface px) and how far his head rises above it. */
const SUMMARY_BIG = Object.freeze({ left: 545, top: 24, width: 470 });
const SUMMARY_BOTH = Object.freeze({ left: 380, top: 70, width: 800 });
const PEEK_HEAD = 140;

function abortError() {
  const error = new Error('Sequence cancelled');
  error.name = 'AbortError';
  return error;
}
function withSignal(promise, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then((value) => { signal.removeEventListener('abort', onAbort); resolve(value); }, reject);
  });
}

export function createLearningFlow({ board, canvas, guide, audio, fx, gameState, qa = false, manual: manualAtStart = false }) {
  let manual = manualAtStart;                // review aid: no auto-advance, every screen waits for Next (toggled live by the debug panel)
  const scope = createSequenceScope();
  let index = 0;
  let stopped = false;
  let pending = null;                        // a debug jump: the screen to run next, set while the current one is cancelled
  let resolveNext = null;                    // manual mode: the Next tap the current screen is waiting for
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) fn(); };
  let current = null;
  let state = 'ENTERING';
  let live = {};                             // widgets of the running screen, for the QA hooks
  const reduced = () => prefersReducedMotion();
  const signal = () => scope.signal;
  const pause = (ms) => wait(reduced() ? 0 : ms, scope.signal);

  function setState(name) {
    state = name;
    board.setState(name);
    gameState.update({ learningState: name });
  }

  async function clearOverlay() {
    const children = [...board.overlayEl.children];
    if (!children.length) return;
    if (!reduced()) {
      children.forEach((child) => child.classList.add('is-leaving'));
      await pause(420).catch(() => {});
    }
    children.forEach((child) => child.remove());
    live = {};
  }

  /** The beaver steps in for the screens that are his to present, and away for the learner's own work. */
  async function placeGuide(screen, { present = GUIDE_SCREENS.has(screen.kind) } = {}) {
    board.setGuidePresent(present);
    board.setGuidePeeking(false);
    guide.setInstant(false);
    guide.setRegistration('feet');
    if (present) { await guide.home(); await guide.enter(); } else await guide.leave();
  }

  /* ---------- The triangle between screens: morph, keep, or place ---------- */
  function frameFor(screen) {
    return FRAME[screen.layout] ?? FRAME.center;
  }
  function classificationOf(requires) {
    const m = canvas.measured;
    return ['scalene', 'isosceles', 'equilateral'].includes(requires) ? m.bySides : m.byAngles;
  }
  async function prepareTriangle(screen) {
    canvas.clearTones();
    canvas.clearEmphasis();
    canvas.clearChips();
    canvas.clearHint();
    canvas.setDrag({ enabled: false, goal: null });
    if (!screen.triangle) {
      canvas.setVisible({ sides: false, vertices: false }, { merge: false });
      return;
    }
    const frame = frameFor(screen);
    const target = layoutFromSpec(screen.triangle, frame);
    const shown = canvas.visible.sides;
    const keepable = screen.keep && shown && (!screen.requires || classificationOf(screen.requires) === screen.requires);
    if (keepable) {
      // The learner's own shape stays; it only slides over if this screen frames it differently.
      const points = canvas.points;
      const xs = points.map((p) => p[0]);
      const shift = frame.cx - (Math.min(...xs) + Math.max(...xs)) / 2;
      if (Math.abs(shift) > 1) await canvas.morphTo(points.map(([x, y]) => [x + shift, y]), { duration: 600, signal: signal() });
    } else if (shown) {
      await canvas.morphTo(target, { duration: 1000, signal: signal() });
    } else {
      canvas.setPoints(target);
    }
    canvas.setVisible({ sides: true, vertices: true, ...(screen.show ?? {}) }, { merge: false });
  }

  /* ---------- Shared beats ---------- */
  /** Speaks a line; `cues` ([{ phrase, run }]) fire the geometry's moves on the spoken word. */
  async function narrate(text, options = {}) {
    setState('NARRATING');
    const line = board.narrate(text, options);
    await withSignal(line.finished, signal());
  }
  const fire = (fn) => () => { fn().catch(() => {}); };
  /** Reading time after a line, then the screen moves on by itself (no button). In manual (debug) mode the
   *  screen waits for the Next tap instead, at the end of every screen. */
  async function settle(text = '') {
    setState('REINFORCING');
    if (manual) return;
    await pause(1900 + Math.min(3400, String(text).length * 40));
    setState('TRANSITIONING');
  }
  async function manualGate() {
    if (!manual) return;
    setState('WAITING_FOR_INPUT');
    notify();
    await withSignal(new Promise((resolve) => { resolveNext = resolve; }), signal());
    resolveNext = null;
    setState('TRANSITIONING');
  }
  function triangleBox() {
    const points = canvas.points;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), cx: (Math.min(...xs) + Math.max(...xs)) / 2 };
  }
  function badgeUnderTriangle(text, tone) {
    const box = triangleBox();
    audio.play('badge');
    return createBadge({ overlayEl: board.overlayEl, text, tone, at: { left: Math.round(box.cx - 200), top: Math.round(Math.min(box.bottom + 66, BOARD.canvas.height - 62)), width: 400 } });
  }
  function columnX() {
    return Math.round(triangleBox().right + COLUMN_GAP);
  }
  function badgeInColumn(text, tone, row) {
    audio.play('badge');
    return createBadge({ overlayEl: board.overlayEl, text, tone, at: { left: columnX(), top: 170 + row * 86, width: 330 } });
  }
  async function pulseLabelsInOrder(indices, gapMs = 640) {
    for (const i of indices) {
      canvas.pulseSide(i);
      canvas.pulseSideLabel(i);
      audio.play('bloop');
      await pause(gapMs);
    }
  }
  async function pulseAnglesInOrder(indices, gapMs = 640) {
    for (const i of indices) {
      canvas.pulseAngle(i);
      audio.play('bloop');
      await pause(gapMs);
    }
  }
  function equalSideIndices() {
    return canvas.measured.equalSides.map((equal, i) => (equal ? i : -1)).filter((i) => i >= 0);
  }
  /** Points the learner back at the measurements the answer rests on (also the only hint after a wrong try). */
  async function reinforce(kind) {
    setState('REINFORCING');
    const m = canvas.measured;
    if (kind === 'sides') await pulseLabelsInOrder(SIDE_ORDER);
    else if (kind === 'angles') await pulseAnglesInOrder([0, 1, 2]);
    else if (kind === 'equalSides') { canvas.emphasiseSides(equalSideIndices()); await pulseLabelsInOrder(equalSideIndices()); }
    else if (kind === 'rightAngle') { canvas.emphasiseAngles([m.rightAt]); await pulseAnglesInOrder([m.rightAt]); }
    else if (kind === 'obtuseAngle') { canvas.emphasiseAngles([m.obtuseAt]); await pulseAnglesInOrder([m.obtuseAt]); }
    await pause(200);
    canvas.clearEmphasis();
  }
  async function continueButton(top = 440) {
    await pause(300);
    setState('WAITING_FOR_INPUT');
    let resolvePressed;
    const pressed = new Promise((resolve) => { resolvePressed = resolve; });
    const button = createPillButton({ overlayEl: board.overlayEl, text: LEARNING_COPY.continue, tone: 'green', at: { center: true, top }, onPress: () => { audio.play('uiTap'); resolvePressed(); } });
    live.continue = button;
    await withSignal(pressed, signal());
    button.pressOnce();
    setState('TRANSITIONING');
    await button.remove();
    live.continue = null;
  }
  /** Walks the beaver along a side as it is measured, clockwise round the shape, the tape running with him. */
  async function measureSideWithGuide(i) {
    const a = canvas.points[i];
    const b = canvas.points[(i + 1) % 3];
    // Corners run A (top), B (left), C (right): side i joins i and i + 1, so walking it backwards goes clockwise.
    const fromEnd = 1;
    const start = fromEnd ? b : a;
    const end = fromEnd ? a : b;
    const d = [end[0] - start[0], end[1] - start[1]];
    const l = Math.hypot(d[0], d[1]) || 1;
    const dir = [d[0] / l, d[1] / l];
    const flip = dir[0] < 0;
    const rotate = (flip ? Math.atan2(dir[1], -dir[0]) : Math.atan2(dir[1], dir[0])) * (180 / Math.PI);
    const n = canvas.outwardNormal(i);
    const onSide = (p) => ({ x: BOARD.surface.left + p[0] + n[0] * 4, y: BOARD.surface.top + p[1] + n[1] * 4, scale: 0.42, flip, rotate });
    guide.setInstant(false);
    guide.setPose('walk');
    await guide.moveTo(onSide(start));
    guide.setInstant(true);
    const hand = () => { const h = guide.handPoint(); return [h.x - BOARD.surface.left, h.y - BOARD.surface.top]; };
    await canvas.measureSide(i, { signal: signal(), fromEnd, tool: false, hand, onProgress: (t, at) => guide.placeAt(onSide(at)) });
    guide.setPose('walkStop');
    await pause(600);
  }

  /* ---------- Screen kinds ---------- */
  const runners = {
    async draw(screen) {
      setState('DEMONSTRATING');
      await canvas.drawIn({ signal: signal() });
      await narrate(screen.narration, { focus: screen.focus, cues: [{ phrase: 'triangle', run: () => { canvas.pulseAll(); canvas.sparkleVertices(); } }] });
      await settle(screen.narration);
    },

    async count(screen) {
      setState('DEMONSTRATING');
      let counting = Promise.resolve();
      const countSides = async () => {
        for (const i of SIDE_ORDER) {
          canvas.emphasiseSides([i]);
          canvas.pulseSide(i);
          audio.play('bloop');
          await canvas.showCountChip(i, String(SIDE_ORDER.indexOf(i) + 1));
          await pause(620);
        }
      };
      const spoken = board.narrate(screen.narration, { focus: screen.focus, cues: [
        { phrase: 'closed', run: () => { canvas.emphasiseSides([0, 1, 2]); canvas.pulseAll(); audio.play('clank', { variant: 2 }); setTimeout(() => canvas.clearEmphasis(), 500); } },
        { phrase: '3', run: () => { counting = countSides(); } },
        { phrase: 'triangle', run: () => { canvas.pulseAll(); canvas.sparkleVertices(); } },
      ] });
      await withSignal(spoken.finished, signal());
      await withSignal(counting, signal());
      await pause(400);
      canvas.clearEmphasis();
      await settle(screen.narration);
      canvas.clearChips();
    },

    async morph(screen) {
      setState('DEMONSTRATING');
      const frame = frameFor(screen);
      let morphing = Promise.resolve();
      const morphAll = async () => {
        for (const shape of screen.shapes) {
          await canvas.morphTo(layoutFromSpec(shape, frame), { duration: 1300, signal: signal() });
          await pause(700);
        }
      };
      const spoken = board.narrate(screen.narration, { cues: [{ phrase: 'different', run: () => { morphing = morphAll(); } }] });
      await withSignal(spoken.finished, signal());
      await withSignal(morphing, signal());
      await settle(screen.narration);
    },

    async measureSides(screen) {
      setState('DEMONSTRATING');
      await narrate(screen.narration, { focus: screen.focus });     // he says it first, then gets to work
      for (const i of SIDE_ORDER) await measureSideWithGuide(i);
      guide.setInstant(false);
      guide.setPose('walk');
      await guide.home();
      guide.idle();
      await settle(screen.narration);
    },

    async measureAngles(screen) {
      setState('DEMONSTRATING');
      // He says it first; then, corner by corner (clockwise), he walks up, sets the protractor he holds onto
      // the corner (its flat edge along a side, its round side into the angle), the arc sweeps while the
      // value counts up, and he lifts it off again.
      await narrate(screen.narration, { focus: screen.focus });
      const centre = canvas.centroid();
      const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
      for (const i of CORNER_ORDER) {
        const v = canvas.points[i];
        const sides = [canvas.points[(i + 1) % 3], canvas.points[(i + 2) % 3]].map((q) => unit([q[0] - v[0], q[1] - v[1]]));
        const inward = unit([centre[0] - v[0], centre[1] - v[1]]);
        const pose = guide.pickToolPose(sides);
        const at = (back, rotate) => ({ x: BOARD.surface.left + v[0] - inward[0] * back, y: BOARD.surface.top + v[1] - inward[1] * back, scale: 0.5, flip: pose.flip, rotate: pose.flip ? -rotate : rotate });
        guide.setInstant(false);
        guide.setRegistration('feet');
        guide.setPose('walk');
        await guide.moveTo({ x: BOARD.surface.left + v[0] - inward[0] * 70, y: BOARD.surface.top + v[1] - inward[1] * 70 + 40, scale: 0.5, flip: pose.flip, rotate: 0 });
        guide.setInstant(true);
        guide.setRegistration('tool');
        guide.setPose(pose.frameName);
        guide.placeAt(at(34, 0));                    // the protractor just off the corner...
        guide.setInstant(false);
        await pause(40);
        guide.placeAt(at(0, pose.rotate));           // ...then set onto it, turned to lie along the side
        await pause(560);
        await canvas.measureAngle(i, { signal: signal() });
        await pause(500);
        guide.placeAt(at(34, 0));                    // and lifted off
        await pause(460);
        guide.setInstant(true);
        guide.setRegistration('feet');
        guide.setPose('walkStop');
        guide.placeAt({ x: BOARD.surface.left + v[0] - inward[0] * 70, y: BOARD.surface.top + v[1] - inward[1] * 70 + 40, scale: 0.5, flip: pose.flip, rotate: 0 });
        guide.setInstant(false);
      }
      guide.setPose('walk');
      await guide.home();
      guide.idle();
      await settle(screen.narration);
    },

    async compare90(screen) {
      setState('DEMONSTRATING');
      const eachAngle = async () => { for (const i of CORNER_ORDER) { canvas.emphasiseAngles([i]); canvas.pulseAngle(i); audio.play('bloop'); await pause(760); } };
      const spoken = board.narrate(screen.narration, { focus: screen.focus, cues: [
        { phrase: 'All three angles', run: fire(eachAngle) },
        { phrase: 'acute', run: () => { canvas.emphasiseAngles([0, 1, 2]); canvas.pulseAngle(0); canvas.pulseAngle(1); canvas.pulseAngle(2); audio.play('badge'); } },
      ] });
      await withSignal(spoken.finished, signal());
      await pause(300);
      canvas.clearEmphasis();
      await settle(screen.narration);
    },

    async question(screen) {
      const { question } = screen;
      let resolveAnswer = null;
      const card = createOptionCard({
        overlayEl: board.overlayEl, prompt: question.prompt, options: question.options, audio,
        onSelect: (option) => resolveAnswer?.(option),
      });
      live.card = card;
      await narrate(question.prompt);
      for (;;) {
        setState('WAITING_FOR_INPUT');
        card.setEnabled(true);
        const option = await withSignal(new Promise((resolve) => { resolveAnswer = resolve; }), signal());
        resolveAnswer = null;
        setState('CHECKING');
        card.setEnabled(false);
        if (option === question.correct) {
          audio.play('correct');
          card.markCorrect(option);
          await reinforce(question.reinforce);
          await pause(500);
          break;
        }
        audio.play('softNo');
        await card.markIncorrect(option);
        await reinforce(question.reinforce);        // the hint after a wrong try: the measurements, again
      }
      setState('TRANSITIONING');
      await card.remove();
    },

    async discover(screen) {
      setState('DEMONSTRATING');
      const m = canvas.measured;
      const highlight = async () => {
        if (screen.tones) {
          for (const i of SIDE_ORDER) {
            canvas.setTone(i, screen.tones[SIDE_ORDER.indexOf(i)]);
            canvas.pulseSide(i);
            canvas.pulseSideLabel(i);
            audio.play('bloop');
            await pause(520);
          }
        }
        if (screen.highlightEqual) {
          const equal = equalSideIndices();
          canvas.emphasiseSides(equal);
          await pulseLabelsInOrder(equal, 480);
        }
        if (screen.highlightAngles) {
          const which = screen.highlightAngles === 'right' ? [m.rightAt] : screen.highlightAngles === 'obtuse' ? [m.obtuseAt] : screen.highlightAngles;
          canvas.emphasiseAngles(which);
          await pulseAnglesInOrder(which, 480);
        }
      };
      const cues = [
        { phrase: screen.cues?.highlight ?? screen.narration.split(' ')[0], run: fire(highlight) },
        { phrase: screen.cues?.name ?? screen.badge.toLowerCase(), run: () => { live.badge = badgeUnderTriangle(screen.badge, screen.tone); canvas.sparkleVertices(); } },
      ];
      await narrate(screen.narration, { focus: screen.focus, cues });
      if (!live.badge) live.badge = badgeUnderTriangle(screen.badge, screen.tone);
      await settle(screen.narration);
      canvas.clearEmphasis();
    },

    async drag(screen) {
      await narrate(screen.narration);
      if (screen.instruction) {                  // the question is read first; then the box swaps to the instruction
        await pause(700);
        await narrate(screen.instruction);
      }
      setState('INTERACTING');
      let resolveDone;
      const done = new Promise((resolve) => { resolveDone = resolve; });
      let hintTimer = 0;
      const showHint = () => { if (!canvas.isDragging) canvas.showHint(screen.hintVertex ?? 0); };
      canvas.setDrag({
        enabled: true, goal: screen.goal, bounds: DRAG_BOUNDS, silentSnaps: Boolean(screen.silentSnaps),
        onChange: () => {},
        onRelease: (m, { goalMet: met }) => { if (met) resolveDone(m); },
      });
      // Teaching screens show the ghost corner at once; checkpoints only after a while without success.
      if (screen.hintAfterMs) hintTimer = setTimeout(showHint, screen.hintAfterMs);
      else showHint();
      try {
        await withSignal(done, signal());
      } finally {
        clearTimeout(hintTimer);
        canvas.setDrag({ enabled: false, goal: null });
        canvas.clearHint();
      }
      setState('FEEDBACK');
      canvas.sparkleVertices();
      const m = canvas.measured;
      if (screen.success?.final) {
        await this.finalSuccess(screen);
        return;
      }
      audio.play('correct');
      if (screen.goal === 'isosceles' || screen.goal === 'equilateral') {
        canvas.emphasiseSides(equalSideIndices());
        await pulseLabelsInOrder(equalSideIndices(), 300);
      } else if (screen.goal === 'right') {
        canvas.emphasiseAngles([m.rightAt]);
        await pulseAnglesInOrder([m.rightAt], 300);
      } else if (screen.goal === 'obtuse') {
        canvas.emphasiseAngles([m.obtuseAt]);
        await pulseAnglesInOrder([m.obtuseAt], 300);
      }
      if (screen.success) {
        await narrate(screen.success.narration, { cues: [{ phrase: screen.success.name ?? screen.success.badge.toLowerCase(), run: () => { live.badge = badgeUnderTriangle(screen.success.badge, screen.success.tone); canvas.sparkleVertices(); } }] });
        if (!live.badge) live.badge = badgeUnderTriangle(screen.success.badge, screen.success.tone);
        await settle(screen.success.narration);
      } else {
        await pause(1100);          // the next screen names what the learner just made
      }
      canvas.clearEmphasis();
    },

    /** The right-angled isosceles triangle: each condition is shown and named in turn, then the celebration. */
    async finalSuccess(screen) {
      const m = canvas.measured;
      audio.play('snapRight');
      canvas.emphasiseSides(equalSideIndices());
      await pulseLabelsInOrder(equalSideIndices(), 320);
      live.badgeA = badgeInColumn(screen.success.badges[0].text, screen.success.badges[0].tone, 0);
      await pause(760);
      canvas.emphasiseAngles([m.rightAt]);
      await pulseAnglesInOrder([m.rightAt], 320);
      live.badgeB = badgeInColumn(screen.success.badges[1].text, screen.success.badges[1].tone, 1);
      await pause(700);
      audio.play('celebration');
      fx.confetti(70);
      await narrate(screen.success.narration, { focus: 'sides and angles', cues: [
        { phrase: 'sides', run: () => { canvas.emphasiseSides(equalSideIndices()); equalSideIndices().forEach((i) => canvas.pulseSideLabel(i)); } },
        { phrase: 'angles', run: () => { canvas.emphasiseAngles([m.rightAt]); canvas.pulseAngle(m.rightAt); live.greatJob = createGreatJob({ overlayEl: board.overlayEl, at: { left: columnX(), top: 360 } }); canvas.sparkleVertices(); } },
      ] });
      await settle(screen.success.narration);
      canvas.clearEmphasis();
    },

    async sort(screen) {
      await narrate(screen.narration);
      setState('INTERACTING');
      let resolveDone;
      const done = new Promise((resolve) => { resolveDone = resolve; });
      let placed = 0;
      const sorter = createSortBoard({
        overlayEl: board.overlayEl, cards: screen.cards, bins: screen.bins, audio,
        onDrop: (cardId, binId) => {
          const ok = screen.cards.find((c) => c.id === cardId)?.answer === binId;
          if (ok) {
            placed += 1;
            if (placed === screen.cards.length) setTimeout(() => resolveDone(), 420);
          }
          return ok;
        },
      });
      live.sorter = sorter;
      await withSignal(done, signal());
      setState('FEEDBACK');
      sorter.setEnabled(false);
      audio.play('tada');
      await pause(500);
      await sorter.remove();
      live.sorter = null;
      live.result = createSortResult({ overlayEl: board.overlayEl, cards: screen.cards, bins: screen.bins });
      await narrate(screen.success);
      await continueButton(440);
    },

    async multi(screen) {
      await narrate(screen.narration);
      setState('INTERACTING');
      let resolveChecked;
      let checked = new Promise((resolve) => { resolveChecked = resolve; });
      const grid = createMultiGrid({ overlayEl: board.overlayEl, cards: screen.cards, audio, onChange: (selection) => check.setEnabled(selection.size > 0) });
      const check = createPillButton({ overlayEl: board.overlayEl, text: LEARNING_COPY.check, tone: 'yellow', at: { center: true, top: 400 }, enabled: false, onPress: () => { audio.play('uiTap'); resolveChecked(); } });
      live.grid = grid;
      live.check = check;
      for (;;) {
        await withSignal(checked, signal());
        setState('CHECKING');
        grid.setEnabled(false);
        check.setEnabled(false);
        const picked = [...grid.selection].sort();
        const correct = [...screen.correct].sort();
        if (picked.join() === correct.join()) break;
        audio.play('softNo');
        await grid.shakeWrong(screen.correct);
        checked = new Promise((resolve) => { resolveChecked = resolve; });
        setState('INTERACTING');
        grid.setEnabled(true);
        check.setEnabled(grid.selection.size > 0);
      }
      setState('FEEDBACK');
      audio.play('correct');
      grid.markResult(screen.correct);
      await check.remove();
      live.check = null;
      await narrate(screen.success);
      await continueButton(400);
    },

    async dual(screen) {
      await narrate(screen.narration);
      setState('INTERACTING');
      let resolveChecked;
      let checked = new Promise((resolve) => { resolveChecked = resolve; });
      const bothChosen = (s) => screen.groups.every((g) => s[g.id]);
      const card = createDualCard({ overlayEl: board.overlayEl, prompt: screen.prompt, groups: screen.groups, audio, onChange: (s) => check.setEnabled(bothChosen(s)) });
      const check = createPillButton({ overlayEl: board.overlayEl, text: LEARNING_COPY.check, tone: 'yellow', at: { center: true, top: 566 }, enabled: false, onPress: () => { audio.play('uiTap'); resolveChecked(); } });
      live.card = card;
      live.check = check;
      for (;;) {
        await withSignal(checked, signal());
        setState('CHECKING');
        card.setEnabled(false);
        check.setEnabled(false);
        const picks = card.selections;
        const wrong = screen.groups.filter((g) => picks[g.id] !== g.correct).map((g) => g.id);
        if (!wrong.length) break;
        audio.play('softNo');
        await card.markWrong(wrong);
        checked = new Promise((resolve) => { resolveChecked = resolve; });
        setState('INTERACTING');
        card.setEnabled(true);
        check.setEnabled(bothChosen(card.selections));
      }
      setState('FEEDBACK');
      audio.play('correct');
      card.markCorrect();
      await pause(600);
      await Promise.all([card.remove(), check.remove()]);
      live.card = null;
      live.check = null;
      // Sides first, then the angle: both classification systems, each on its word.
      const m = canvas.measured;
      await narrate(screen.success.narration, { cues: [
        { phrase: 'scalene', run: () => { fire(() => pulseLabelsInOrder(SIDE_ORDER, 240))(); live.badgeA = badgeInColumn(screen.success.badges[0].text, screen.success.badges[0].tone, 0); } },
        { phrase: 'obtuse-angled', run: () => { canvas.emphasiseAngles([m.obtuseAt]); canvas.pulseAngle(m.obtuseAt); live.badgeB = badgeInColumn(screen.success.badges[1].text, screen.success.badges[1].tone, 1); canvas.sparkleVertices(); } },
      ] });
      await settle(screen.success.narration);
      canvas.clearEmphasis();
    },

    async dualReveal(screen) {
      setState('DEMONSTRATING');
      const m = canvas.measured;
      await narrate(screen.narration, { focus: screen.focus, cues: [
        { phrase: 'isosceles', run: () => { canvas.emphasiseSides(equalSideIndices()); equalSideIndices().forEach((i) => canvas.pulseSideLabel(i)); live.badgeA = badgeInColumn(screen.badges[0].text, screen.badges[0].tone, 0); } },
        { phrase: 'right angled', run: () => { canvas.clearEmphasis(); canvas.emphasiseAngles([m.rightAt]); canvas.pulseAngle(m.rightAt); live.badgeB = badgeInColumn(screen.badges[1].text, screen.badges[1].tone, 1); canvas.sparkleVertices(); } },
      ] });
      await settle(screen.narration);
      canvas.clearEmphasis();
    },

    async lenses(screen) {
      setState('DEMONSTRATING');
      const m = canvas.measured;
      let lensA = null;
      let lensB = null;
      const spoken = board.narrate(screen.narration, { focus: screen.focus, cues: [
        { phrase: 'sides', run: () => { lensA = createLens({ overlayEl: board.overlayEl, title: screen.lenses[0].title, result: screen.lenses[0].result, tone: screen.lenses[0].tone, at: { left: columnX(), top: 160 } }); canvas.emphasiseSides(equalSideIndices()); equalSideIndices().forEach((i) => canvas.pulseSideLabel(i)); } },
        { phrase: 'angles', run: () => { canvas.clearEmphasis(); lensB = createLens({ overlayEl: board.overlayEl, title: screen.lenses[1].title, result: screen.lenses[1].result, tone: screen.lenses[1].tone, at: { left: columnX(), top: 270 } }); canvas.emphasiseAngles([m.rightAt]); canvas.pulseAngle(m.rightAt); } },
      ] });
      await withSignal(spoken.finished, signal());
      lensA ??= createLens({ overlayEl: board.overlayEl, title: screen.lenses[0].title, result: screen.lenses[0].result, tone: screen.lenses[0].tone, at: { left: columnX(), top: 160 } });
      lensB ??= createLens({ overlayEl: board.overlayEl, title: screen.lenses[1].title, result: screen.lenses[1].result, tone: screen.lenses[1].tone, at: { left: columnX(), top: 270 } });
      await pause(700);
      canvas.clearEmphasis();
      // The two lenses merge into one label stack beside the triangle.
      await Promise.all([lensA.merge(), lensB.merge()]);
      await Promise.all([lensA.remove(), lensB.remove()]);
      live.badgeA = badgeInColumn('ISOSCELES', 'isosceles', 0);
      await pause(200);
      live.badgeB = badgeInColumn('RIGHT-ANGLED', 'right', 1);
      await settle(screen.narration);
    },

    /**
     * The recap (PDF p48): each category pops up as one big card, the beaver pops up behind it with
     * only his head showing and explains it, then the card shrinks into the row; last, the "both" card.
     */
    async summary(screen) {
      setState('DEMONSTRATING');
      await guide.leave();
      await narrate(LEARNING_COPY.summary.heading);
      await settle(LEARNING_COPY.summary.heading);
      board.hideNarration();                 // from here the cards carry the words; the beaver peeks where the box was
      const view = createSummaryView({ overlayEl: board.overlayEl, screen });
      live.summary = view;
      const items = [...screen.bySides, ...screen.byAngles];
      // Registered on his hat: `peek` puts the top of his head PEEK_HEAD px above the card's top edge, `duck` hides it behind the card.
      const peek = (card) => ({ x: BOARD.surface.left + card.left + Math.round(card.width * 0.22), y: BOARD.surface.top + card.top - PEEK_HEAD, scale: 0.9, flip: false, rotate: 0 });
      const duck = (card) => ({ x: BOARD.surface.left + card.left + Math.round(card.width * 0.22), y: BOARD.surface.top + card.top + 40, scale: 0.9, flip: false, rotate: 0 });
      board.setGuidePeeking(true);
      board.setGuidePresent(true);
      guide.setRegistration('head');
      guide.setInstant(true);
      guide.placeAt(duck(SUMMARY_BIG));
      guide.setInstant(false);
      guide.element.hidden = false;
      for (let i = 0; i < items.length; i += 1) {
        view.popCard(i);
        audio.play('badge');
        await pause(260);
        guide.setPose('idle');
        await guide.moveTo(peek(SUMMARY_BIG));
        await narrate(`${items[i].name}. ${items[i].text}`, { visible: false, cues: [   // the card carries the words
          { phrase: items[i].name.split(' ')[0], run: () => view.pulseName() },
          { phrase: items[i].text.split(' ')[0], run: () => view.pulseFigure() },
        ] });
        await pause(1100);
        await guide.moveTo(duck(SUMMARY_BIG));
        audio.play('snapEqual');
        await view.collectCard(i);
        await pause(220);
      }
      await view.gather();
      audio.play('correct');
      view.popBothCard();
      audio.play('badge');
      await pause(260);
      await guide.moveTo(peek(SUMMARY_BOTH));
      await narrate(LEARNING_COPY.summary.both, { visible: false });
      guide.cheer(2600);
      await pause(900);
      setState('WAITING_FOR_INPUT');
      let resolvePressed;
      const pressed = new Promise((resolve) => { resolvePressed = resolve; });
      const button = createPillButton({ overlayEl: board.overlayEl, text: LEARNING_COPY.summary.cta, tone: 'green', at: { center: true, top: 426 }, onPress: () => { audio.play('uiTap'); resolvePressed(); } });
      live.cta = button;
      await withSignal(pressed, signal());
      button.pressOnce();
      setState('TRANSITIONING');
      await guide.moveTo(duck(SUMMARY_BOTH));
      await Promise.all([button.remove(), view.remove()]);
      board.setGuidePeeking(false);
      await guide.leave();
    },
  };

  async function runScreen(screen) {
    current = screen;
    gameState.update({ learningScreen: screen.id });
    board.cancelCues();
    await clearOverlay();
    board.narrationEl.hidden = false;
    await Promise.all([prepareTriangle(screen), screen.kind === 'summary' ? Promise.resolve() : placeGuide(screen)]);
    const runner = runners[screen.kind];
    if (!runner) throw new Error(`Unknown learning screen kind: ${screen.kind}`);
    notify();
    await runner.call(runners, screen);
    await manualGate();
  }

  /* ---------- QA hooks (?qa=1 or DEBUG_MODE): read-only state and client-space targets ---------- */
  function installHooks() {
    const client = (point) => canvas.toClient(point[0], point[1]);
    window.__learning = {
      state: () => ({
        id: current?.id ?? null,
        kind: current?.kind ?? null,
        state,
        index,
        total: LEARNING_SCREENS.length,
        narration: board.narrationText,
        badges: [...board.overlayEl.querySelectorAll('.ws-badge')].map((b) => b.textContent),
        guide: guide.isPresent ? guide.pose : null,
        measured: canvas.measured,
        points: canvas.points,
      }),
      dragTarget(vertexIndex) {
        const goal = current?.goal;
        if (!goal) return null;
        const i = vertexIndex ?? current.hintVertex ?? 0;
        const from = canvas.points[i];
        return { index: i, from: client(from), to: client(canvas.solutionFor(goal, i, DRAG_BOUNDS)) };
      },
      vertexClient: (i) => client(canvas.points[i]),
      sortTargets: () => live.sorter?.targets() ?? null,
      buttons: () => [...board.overlayEl.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { text: b.textContent.trim() || b.getAttribute('aria-label'), option: b.dataset.option ?? b.dataset.card ?? null, x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: b.disabled, cls: b.className }; }),
    };
  }

  return {
    get state() { return state; },
    get current() { return current; },
    async run(startId) {
      if (qa) installHooks();
      index = startId ? Math.max(0, LEARNING_SCREENS.findIndex((s) => s.id === startId)) : 0;
      while (index < LEARNING_SCREENS.length && !stopped) {
        const screen = LEARNING_SCREENS[index];
        setState('ENTERING');
        try {
          await runScreen(screen);
        } catch (error) {
          if (stopped) return false;
          if (pending === null && isAbortError(error)) return false;
          if (pending === null) console.error(`[learning] screen ${screen.id} failed; moving on:`, error);
        }
        if (pending !== null) {                 // a debug jump: cancel left the current screen, go where it points
          index = pending;
          pending = null;
          continue;
        }
        index += 1;
      }
      notify();
      return !stopped;
    },
    /* ---- Debug navigation (?debug=1): jump anywhere; Next and Back replay a screen from its start ---- */
    get index() { return index; },
    get screens() { return LEARNING_SCREENS; },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    /** Turns the review mode on or off while running; turning it off releases a screen waiting for Next. */
    setManual(on) {
      manual = Boolean(on);
      if (!manual) resolveNext?.();
    },
    get manual() { return manual; },
    jumpTo(target) {
      const i = typeof target === 'string' ? LEARNING_SCREENS.findIndex((s) => s.id === target) : target;
      if (i < 0 || i >= LEARNING_SCREENS.length || stopped) return;
      pending = i;
      board.cancelCues();
      board.stopVoice();
      canvas.setDrag({ enabled: false, goal: null });
      scope.cancel();                         // the running screen stops; run() picks up `pending`
    },
    next() {
      if (resolveNext) { resolveNext(); return; }   // waiting at the end of a screen: move on normally
      this.jumpTo(index + 1);
    },
    back() {
      this.jumpTo(Math.max(0, index - 1));
    },
    stop() {
      stopped = true;
      scope.cancel();
      board.cancelCues();
      canvas.setDrag({ enabled: false, goal: null });
      if (window.__learning) delete window.__learning;
    },
  };
}
