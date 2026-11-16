import { CRANE_LAYOUT, BRIDGE_LAYOUT } from '../data/layout.js';

/**
 * Where the crane must be to seat `carried` with its centroid over stage x `spotX`, when the load is
 * drawn at `scale`: the trolley x, and the claw-top y that stands the frame's base on the road.
 */
export function bridgeSeatTarget(carried, spotX, scale) {
  const centroidFromGrab = (carried.centroid[0] - carried.grabX * carried.width) * scale;
  const baseBelowClawTop = (CRANE_LAYOUT.gripOffsetY - carried.grabY + 2 + carried.baseOffset) * scale;
  return { x: spotX - centroidFromGrab, y: BRIDGE_LAYOUT.deckY - baseBelowClawTop };
}
