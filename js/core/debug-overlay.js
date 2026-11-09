import { DEBUG_MODE } from '../config.js';

/** Categorised logging, silent unless DEBUG_MODE. */
export function debugLog(category, ...details) {
  if (!DEBUG_MODE) return;
  console.debug(`[${category}]`, ...details);
}
