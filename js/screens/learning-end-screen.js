import { createSequenceScope, wait, playClassAnimation } from '../core/motion.js';

/** After the workshop: the operator celebrates in his cab and the learner can run the lesson again. */
export function createLearningEndScreen({ els, audio, camera, builder, fx, screenManager }) {
  const scope = createSequenceScope();
  let button = null;

  function createReplayButton() {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'learning-replay';
    element.setAttribute('aria-label', 'Learn again');
    element.innerHTML = '<img src="assets/images/ui/replay-button.webp" alt="" draggable="false">';
    let pressed = false;
    element.addEventListener('click', () => {
      if (pressed) return;
      pressed = true;
      audio.unlock();
      audio.play('uiTap');
      screenManager.go('learning');
    });
    els.overlays.appendChild(element);
    playClassAnimation(element, 'is-entering', 600);
    element.focus({ preventScroll: true });
    return element;
  }

  return {
    async enter() {
      builder.show();
      builder.cheer();
      fx.confetti(90);
      audio.play('celebration');
      camera.reset(900, scope.signal).catch(() => {});
      await wait(600, scope.signal).catch(() => {});
      button = createReplayButton();
    },
    async exit() {
      scope.cancel();
      fx.clear();
      button?.remove();
      button = null;
    },
  };
}
