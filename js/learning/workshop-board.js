/**
 * The Triangle Workshop's lesson card: a wide, simple panel with thin borders that fills the stage in
 * front of the quiet workshop backdrop. A slim header carries the section and progress; the drawing
 * surface holds the live triangle and the screen's widgets; a navy narration bar runs along the foot,
 * and the beaver stands at its left end when he has something to show (he steps away otherwise).
 * Everything written on it is live text.
 */
import { LEARNING_COPY } from './learning-content.js';
import { revealWords } from '../gameplay/feedback-controller.js';
import { playClassAnimation, wait, prefersReducedMotion } from '../core/motion.js';
import { VO_WORD_TIMES } from '../data/vo-word-times.js';

/** Stage-space geometry of the card and its parts. */
export const BOARD = Object.freeze({
  left: 160, top: 110, width: 1600, height: 820,
  backdrop: 'assets/images/workshop/learning-backdrop.png',
  /** The drawing surface inside the card (below the narration box), in card px. */
  surface: Object.freeze({ left: 20, top: 150, width: 1560, height: 640 }),
  canvas: Object.freeze({ width: 1560, height: 640 }),
  /** Where the beaver stands: his feet, in card px. */
  guide: Object.freeze({ x: 150, groundY: 800 }),
});

const READING_MS_PER_CHARACTER = 58;         // a reading pace for lines without a clip (a clip sets its own)

/** When each word of `text` appears: the clip's measured word times, or the same even pace revealWords uses. */
function wordDelays(text, spoken, typingMs) {
  const words = text.split(' ');
  const times = spoken.clipId ? VO_WORD_TIMES[spoken.clipId] : null;
  const synced = Array.isArray(times) && times.length === words.length;
  const step = words.length > 1 ? Math.max(40, Math.min(220, (typingMs - 300) / (words.length - 1))) : 0;
  return words.map((_, i) => Math.round(synced ? times[i] / (spoken.rate ?? 1) : i * step));
}
/** The index of the word where `phrase` begins in `text` (case and trailing punctuation ignored), or -1. */
function phraseIndex(text, phrase) {
  const clean = (w) => w.toLowerCase().replace(/[.,!?;:]+$/, '');
  const words = text.split(' ').map(clean);
  const wanted = phrase.split(' ').map(clean);
  for (let i = 0; i + wanted.length <= words.length; i += 1) {
    if (wanted.every((w, k) => words[i + k] === w)) return i;
  }
  return -1;
}

export function createWorkshopBoard({ hostEl, voice, audio, talker = null }) {
  const root = document.createElement('div');
  root.className = 'workshop';
  root.dataset.state = 'ENTERING';
  root.setAttribute('aria-label', LEARNING_COPY.workshopTitle);
  root.innerHTML = `
    <div class="workshop__card">
      <div class="ws-narration" role="status" aria-live="polite">
        <p class="ws-narration__text"></p>
        <p class="ws-narration__sub" hidden></p>
      </div>
      <div class="workshop__surface">
        <div class="ws-stage"></div>
        <div class="ws-overlay"></div>
      </div>
      <div class="workshop__guide"></div>
    </div>`;
  hostEl.appendChild(root);

  const cardEl = root.querySelector('.workshop__card');
  const surfaceEl = root.querySelector('.workshop__surface');
  const stageEl = root.querySelector('.ws-stage');
  const overlayEl = root.querySelector('.ws-overlay');
  const guideHostEl = root.querySelector('.workshop__guide');
  const narrationEl = root.querySelector('.ws-narration');
  const textEl = root.querySelector('.ws-narration__text');
  const subEl = root.querySelector('.ws-narration__sub');

  const reduced = () => prefersReducedMotion();
  let cueTimers = [];
  const cancelCues = () => { cueTimers.forEach(clearTimeout); cueTimers = []; };
  /** Runs each cue when its phrase is spoken (the words appear at the same moment). */
  function scheduleCues(text, spoken, typingMs, cues) {
    cancelCues();
    if (!cues?.length) return;
    const delays = wordDelays(text, spoken, typingMs);
    const start = () => {
      for (const cue of cues) {
        const index = phraseIndex(text, cue.phrase);
        const at = reduced() ? 0 : index >= 0 ? delays[index] : 0;
        cueTimers.push(setTimeout(() => { try { cue.run(); } catch (error) { console.error('[learning] cue', error); } }, at));
      }
    };
    (spoken.started ?? Promise.resolve()).then(start);
  }

  return {
    root, cardEl, surfaceEl, stageEl, overlayEl, guideHostEl, narrationEl,
    talker,
    cancelCues,
    /** The card comes up from the workshop floor and settles. */
    async rise({ signal } = {}) {
      root.classList.remove('is-lowered');
      root.classList.add('is-rising');
      audio?.play('panelRise');
      await wait(reduced() ? 0 : 900, signal).catch(() => {});
      root.classList.remove('is-rising');
      root.classList.add('is-up');
    },
    async lower({ signal } = {}) {
      root.classList.remove('is-up');
      root.classList.add('is-lowering');
      audio?.play('panelRise');
      await wait(reduced() ? 0 : 700, signal).catch(() => {});
      root.classList.remove('is-lowering');
      root.classList.add('is-lowered');
    },
    setState(name) {
      root.dataset.state = name;
    },
    /** The beaver at the card: in front of it at the bottom-left, or peeking from behind a summary card. */
    setGuidePresent(present) {
      root.classList.toggle('has-guide', Boolean(present));
    },
    setGuidePeeking(on) {
      root.classList.toggle('is-peeking', Boolean(on));
    },
    /**
     * The teaching line: the words appear at the voice's pace (recorded clip, device voice, or a
     * reading pace); the beaver talks meanwhile when he is there. `focus` words take the key-word style.
     */
    narrate(text, { sub = null, focus = null, speaker = 'builder', mode = 'swap', visible = true, cues = null } = {}) {
      narrationEl.hidden = !visible;
      if (!visible) {
        const spoken = voice.say(text, { speaker });
        scheduleCues(text, spoken, Math.min(4200, text.length * READING_MS_PER_CHARACTER), cues);
        this.talker?.talkUntil?.(spoken.finished);
        return { finished: spoken.finished.then(() => undefined), seconds: spoken.seconds };
      }
      if (mode === 'swap') playClassAnimation(narrationEl, 'is-swapping', 420);
      const spoken = voice.say(text, { speaker });
      const typingMs = spoken.spoke ? Math.max(300, (spoken.seconds - 0.35) * 1000) : Math.min(4200, text.length * READING_MS_PER_CHARACTER);
      const typed = revealWords(textEl, text, typingMs, focus, { times: spoken.clipId ? VO_WORD_TIMES[spoken.clipId] : null, rate: spoken.rate ?? 1, started: spoken.started });
      scheduleCues(text, spoken, typingMs, cues);
      this.setSub(sub);
      this.talker?.talkUntil?.(spoken.finished);
      return { finished: Promise.all([spoken.finished, typed]).then(() => undefined), seconds: spoken.seconds };
    },
    /** The instruction line, spoken after the question: it appears under the line, word by word. */
    narrateSub(text, { speaker = 'builder' } = {}) {
      narrationEl.hidden = false;
      subEl.hidden = false;
      subEl.classList.remove('is-hint');
      const spoken = voice.say(text, { speaker });
      const typingMs = spoken.spoke ? Math.max(300, (spoken.seconds - 0.35) * 1000) : Math.min(4200, text.length * READING_MS_PER_CHARACTER);
      const typed = revealWords(subEl, text, typingMs, null, { times: spoken.clipId ? VO_WORD_TIMES[spoken.clipId] : null, rate: spoken.rate ?? 1, started: spoken.started });
      this.talker?.talkUntil?.(spoken.finished);
      return { finished: Promise.all([spoken.finished, typed]).then(() => undefined), seconds: spoken.seconds };
    },
    /** A quieter second line under the narration (an instruction or, after a wrong try, a hint). */
    setSub(text, { hint = false } = {}) {
      subEl.hidden = !text;
      subEl.textContent = text ?? '';
      subEl.classList.toggle('is-hint', hint);
      if (text) playClassAnimation(subEl, 'is-entering', 420);
    },
    /** The instruction line on screen, as plain text (for the QA hooks). */
    get subText() {
      if (subEl.hidden) return '';
      return subEl.querySelector('.visually-hidden')?.textContent ?? subEl.textContent;
    },
    /** The line on screen, as plain text (for the QA hooks). */
    get narrationText() {
      return textEl.querySelector('.visually-hidden')?.textContent ?? textEl.textContent;
    },
    /** Stops the voice mid-line (a debug jump). */
    stopVoice() {
      voice.stop();
    },
    clearNarration() {
      textEl.textContent = '';
      this.setSub(null);
    },
    hideNarration() {
      narrationEl.hidden = true;
    },
    destroy() {
      root.remove();
    },
  };
}
