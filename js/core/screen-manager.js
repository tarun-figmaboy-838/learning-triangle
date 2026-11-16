/** Owns the screen flow: one transition at a time, each screen with its own enter / exit. */
export function createScreenManager({ gameState, onError }) {
  const screens = new Map();
  let current = null;
  let transitioning = false;

  return {
    register(name, screen) {
      screens.set(name, screen);
    },
    get currentName() {
      return current?.name ?? null;
    },
    async go(name, payload) {
      if (transitioning) return false;
      const next = screens.get(name);
      if (!next) throw new Error(`Unknown screen: ${name}`);
      transitioning = true;
      gameState.update({ transition: `screen:${name}` });
      try {
        await current?.screen.exit?.(name);
        current = { name, screen: next };
        gameState.update({ screen: name });
        await next.enter(payload);
        return true;
      } catch (error) {
        onError?.(error);
        return false;
      } finally {
        transitioning = false;
        gameState.update({ transition: null });
      }
    },
  };
}
