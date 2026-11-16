import { playClassAnimation } from '../core/motion.js';

const TITLE = 'BRIDGE BUILDER';

/**
 * The start screen: the title over the live site and one play button. The tap unlocks sound (browsers
 * need a gesture before audio), starts the music, prefetches the narration and opens `startScreen`.
 */
export function createTitleScreen({ els, audio, voice, camera, builder, screenManager, startScreen }) {
  let button = null;
  let card = null;

  function buildTitleCard() {
    const element = document.createElement('div');
    element.className = 'title-card';
    element.innerHTML = `<h1 class="title-card__headline" aria-label="${TITLE}"><img class="title-card__logo" src="assets/images/ui/title-logo.webp" alt="" draggable="false"></h1>`;
    return element;
  }

  return {
    async enter() {
      builder.show();                              // the operator is already waiting in the cab
      await camera.focus({ duration: 0 });
      card = buildTitleCard();
      card.classList.add('is-entering');
      els.overlays.appendChild(card);
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'start-button';
      button.setAttribute('aria-label', 'Start');
      // The painted play button, with a soft pulse rippling out behind it.
      button.innerHTML = `
        <span class="start-button__glow"></span>
        <img class="start-button__face" src="assets/images/ui/play-button.webp" alt="" draggable="false">`;
      let pressed = false;
      button.addEventListener('click', async () => {
        if (pressed) return;
        pressed = true;
        audio.unlock();
        audio.play('uiTap');
        audio.startMusic();
        voice.unlock();
        voice.prefetch();
        await Promise.all([playClassAnimation(button, 'is-leaving', 420), playClassAnimation(card, 'is-leaving', 460)]);
        button?.remove();
        card?.remove();
        button = null;
        card = null;
        screenManager.go(startScreen);
      });
      button.classList.add('is-entering');
      button.addEventListener('animationend', () => button?.classList.remove('is-entering'), { once: true });
      els.overlays.appendChild(button);
      button.focus({ preventScroll: true });
    },
    async exit() {
      card?.remove();
      card = null;
      if (!button) return;
      await playClassAnimation(button, 'is-leaving', 420);
      button.remove();
      button = null;
    },
  };
}
