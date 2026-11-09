import { COPY } from '../data/copy.js';
import { LEARNING_SECTION } from '../config.js';
import { createSequenceScope, wait } from '../core/motion.js';

const CAB_ZOOM = 2.1;

/** Zoom into the crane cab, where the beaver operator sits, and return where his bubble should go. */
export async function zoomToCab({ camera, builder, signal, duration = 1300 }) {
  const { x, y } = builder.cabCenter;
  await camera.focus({ x, y, scale: CAB_ZOOM, duration, signal });
  const anchor = camera.project(builder.bubbleAnchor.x, builder.bubbleAnchor.y);
  // Where the bubble's tail tip goes: just outside the cab glass, level with the operator's mouth.
  return { x: anchor.x + 16, y: anchor.y };
}
