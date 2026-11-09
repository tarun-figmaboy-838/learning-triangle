/**
 * A static triangle figure (checkpoint cards, sorting cards, the summary, the entry silhouettes):
 * the same geometry as the live canvas, drawn once from a spec and fitted into a box. Side lengths,
 * angles, ticks and the right-angle square are all computed from the shape, never typed in.
 */
import { cmPointsFromSpec, measure, formatCm, formatDeg, PX_PER_CM } from './triangle-model.js';
import { svgEl, fmt, sideLabelPoint, angleLabelPoint, arcPath, squarePoints, tickSegment } from './triangle-draw.js';

/**
 * Options: labels 'sides' | 'angles' | null; ticks (equal-side marks); square (right-angle mark); arcs;
 * tone (side colour); silhouette (filled, no detail).
 */
export function buildTriangleFigure(spec, { width = 260, height = 200, labels = null, ticks = false, square = false, arcs = false, pad = 34, maxScale = PX_PER_CM * 0.78, silhouette = false, strokeScale = 1 } = {}) {
  const pts = cmPointsFromSpec(spec);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const labelPad = labels ? pad + 18 : pad;
  const scale = Math.min(maxScale, (width - labelPad * 2) / spanX, (height - labelPad * 2) / spanY);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const minY = Math.min(...ys);
  const figureHeight = spanY * scale;
  const baseY = height / 2 + figureHeight / 2;
  const vertices = pts.map(([x, y]) => [width / 2 + (x - midX) * scale, baseY - (y - minY) * scale]);
  const m = measure(vertices.map(([x, y]) => [x * (PX_PER_CM / scale), y * (PX_PER_CM / scale)]));   // true cm, whatever the fit
  const svg = svgEl('svg', { class: 'ws-figure', viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true' });
  const points = vertices.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join(' ');
  if (silhouette) {
    svg.appendChild(svgEl('polygon', { points, class: 'ws-figure__silhouette' }));
    return { svg, vertices, measured: m };
  }
  const sides = svgEl('g', { class: 'ws-figure__sides' });
  for (let i = 0; i < 3; i += 1) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % 3];
    const attrs = { x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2) };
    sides.append(svgEl('line', { ...attrs, class: 'ws-figure__edge', style: `stroke-width:${14 * strokeScale}` }), svgEl('line', { ...attrs, class: 'ws-figure__body', style: `stroke-width:${8 * strokeScale}` }));
  }
  svg.appendChild(sides);
  const marks = svgEl('g', { class: 'ws-figure__marks' });
  if (ticks) {
    m.equalSides.forEach((equal, i) => {
      if (equal) marks.appendChild(svgEl('line', { ...tickSegment(vertices, i, 8), class: 'ws-figure__tick' }));
    });
  }
  for (let i = 0; i < 3; i += 1) {
    const isRight = m.rightAt === i;
    if (square && isRight) marks.appendChild(svgEl('polyline', { points: squarePoints(vertices, i, 16), class: 'ws-figure__square' }));
    else if (arcs) marks.appendChild(svgEl('path', { d: arcPath(vertices, i, 24), class: 'ws-figure__arc' }));
  }
  svg.appendChild(marks);
  for (let i = 0; i < 3; i += 1) {
    const [x, y] = vertices[i];
    svg.appendChild(svgEl('circle', { cx: fmt(x), cy: fmt(y), r: 8 * strokeScale, class: 'ws-figure__node' }));
  }
  if (labels === 'sides') {
    for (let i = 0; i < 3; i += 1) {
      const [x, y] = sideLabelPoint(vertices, i, 26);
      svg.appendChild(svgEl('text', { x: fmt(x), y: fmt(y), class: 'ws-figure__label ws-figure__label--side' }, [document.createTextNode(formatCm(m.cm[i]))]));
    }
  }
  if (labels === 'angles') {
    for (let i = 0; i < 3; i += 1) {
      const [x, y] = angleLabelPoint(vertices, i, 0.62);
      svg.appendChild(svgEl('text', { x: fmt(x), y: fmt(y), class: 'ws-figure__label ws-figure__label--angle' }, [document.createTextNode(formatDeg(m.deg[i]))]));
    }
  }
  return { svg, vertices, measured: m };
}
