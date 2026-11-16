/**
 * The five steel frames lying in the yard during the hook, left to right. Each is a small copy of a
 * bridge panel of that type (corners in px at option size; the first corner is the top one the claw grabs).
 */
export const YARD_FRAMES = Object.freeze([
  { id: 'scalene', vertices: [[300, 0], [282.59, 137.84], [0, 137.84]] },
  { id: 'acute', vertices: [[121.21, 0], [0, 210], [242.43, 210]] },
  { id: 'right', vertices: [[0, 0], [0, 210], [167.5, 210]] },
  { id: 'isosceles', vertices: [[150, 0], [300, 68.92], [0, 68.92]] },
  { id: 'equilateral', vertices: [[121.24, 0], [0, 210], [242.49, 210]] },
].map(Object.freeze));
