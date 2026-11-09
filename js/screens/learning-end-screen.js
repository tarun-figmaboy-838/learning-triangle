import { createSequenceScope, wait } from '../core/motion.js';
import { createCtaButton } from './screen-helpers.js';

/** Standalone build only: after the workshop, the operator celebrates in his cab and the learner can run it again. */
export function createLearningEndScreen({ els, audio, camera, builder, fx, screenManager }) {
  const scope = createSequenceScope();
  let button = null;
  return {
    async enter() {
      builder.show();
      builder.cheer();
      fx.confetti(90);
      audio.play('celebration');
      camera.reset(900, scope.signal).catch(() => {});
      await wait(600, scope.signal).catch(() => {});
      button = createCtaButton({
        overlaysEl: els.overlays, audio, icon: 'replay-art', label: 'Learn again',
        onPress: () => screenManager.go('learning'),
      });
      button.classList.add('learning-replay');
    },
    async exit() {
      scope.cancel();
      fx.clear();
      button?.remove();
      button = null;
    },
  };
}
