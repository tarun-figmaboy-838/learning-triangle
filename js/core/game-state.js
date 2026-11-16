/** The shared app state: modules read it, patch it and subscribe to changes. */
const INITIAL_STATE = Object.freeze({
  screen: 'boot',
  transition: null,       // the running screen transition, if any
  craneState: 'idle',     // the crane's current phase (the cab operator's pose follows it)
});

export function createGameState() {
  let state = { ...INITIAL_STATE };
  const listeners = new Set();

  return {
    get() {
      return state;
    },
    update(patch) {
      const changed = Object.keys(patch).some((key) => state[key] !== patch[key]);
      if (!changed) return state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state, patch);
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
