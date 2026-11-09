/**
 * Tween a number from `from` to `to`, calling onUpdate(value, progress) each frame.
 * Resolves on completion; rejects with AbortError when the signal fires.
 */
export function tween({ from = 0, to = 1, duration = 300, ease = easings.outCubic, onUpdate, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const start = performance.now();
    let frame = 0;
    const onAbort = () => {
      cancelAnimationFrame(frame);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const step = (now) => {
      const progress = duration <= 0 ? 1 : Math.min(1, (now - start) / duration);
      onUpdate?.(from + (to - from) * ease(progress), progress);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }
    };
    frame = requestAnimationFrame(step);
  });
}

/** A scope whose signal cancels every tween/wait started under it; cancel() also re-arms it. */
export function createSequenceScope() {
  let controller = new AbortController();
  return {
    get signal() {
      return controller.signal;
    },
    cancel() {
      controller.abort();
      controller = new AbortController();
    },
  };
}

/** Add a class, wait for its animation to finish (with a timeout guard), then remove it. */
export function playClassAnimation(element, className, fallbackMs = 1200) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      element.removeEventListener('animationend', onEnd);
      element.classList.remove(className);
      resolve();
    };
    const onEnd = (event) => {
      if (event.target === element) finish();
    };
    element.addEventListener('animationend', onEnd);
    element.classList.remove(className);
    void element.offsetWidth; // restart the animation when the class was already present
    element.classList.add(className);
    setTimeout(finish, fallbackMs);
  });
}
