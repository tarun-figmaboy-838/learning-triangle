/**
 * A steel triangle frame as SVG, from exact corners: three painted yellow beams with bolted joint plates.
 * A beam is the painted bar sliced in three (left end with its bolt, a middle that stretches to any length,
 * right end with its bolt) laid along the side, so the ends and bolts never distort whatever the length.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const ART = 'assets/images/frame/';
const PAD = 24;            // room around the corners for the beams, plates and shadow
const BEAM_WIDTH = 16;
const PLATE_RADIUS = 13;

/** Beam art: slice height and cap widths in art px; boltAt is the bolt's centre, measured from the beam's end. */
const BEAM = Object.freeze({ l: `${ART}beam-l.webp`, m: `${ART}beam-m.webp`, r: `${ART}beam-r.webp`, h: 140, capL: 130, capR: 130, boltAt: 72, scale: 1.25 });
/** The plate art is 240 × 220 inside a 14 px clear margin (268 × 248), so its outline is never cut. */
const JOINT = Object.freeze({ src: `${ART}joint.webp`, width: 268, height: 248, plate: 240 });

export const FRAME_IMAGES = [BEAM.l, BEAM.m, BEAM.r, JOINT.src];

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function image(href, attributes = {}) {
  const element = svgElement('image', attributes);
  element.setAttribute('href', href);
  return element;
}

/** One beam from (x1, y1) to (x2, y2): its three slices along the side, the bolts on the corners. */
function createBeam(x1, y1, x2, y2) {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const h = BEAM_WIDTH * BEAM.scale;
  const k = h / BEAM.h;
  const overhang = BEAM.boltAt * k;
  const capL = BEAM.capL * k;
  const capR = BEAM.capR * k;
  const middle = Math.max(0.5, length + overhang * 2 - capL - capR);
  const slice = (href, x, w) => image(href, { preserveAspectRatio: 'none', x: x.toFixed(2), y: (-h / 2).toFixed(2), width: w.toFixed(2), height: h.toFixed(2) });
  const body = svgElement('g', { class: 'tube__body' });
  body.append(
    slice(BEAM.l, -overhang, capL),
    slice(BEAM.m, -overhang + capL - 0.4, middle + 0.8),      // a hair of overlap: no seam between slices
    slice(BEAM.r, -overhang + capL + middle, capR),
  );
  const place = svgElement('g', { class: 'tube__place', transform: `translate(${x1.toFixed(1)} ${y1.toFixed(1)}) rotate(${angle.toFixed(2)})` });
  place.appendChild(body);
  const group = svgElement('g', { class: 'tube tube--yellow frame__beam' });
  group.appendChild(place);
  return group;
}

/** A joint: the painted hexagonal steel plate with bolts, centred on (x, y). */
function createPlate(x, y) {
  const w = (PLATE_RADIUS * 2.3 * JOINT.width) / JOINT.plate;
  const h = (PLATE_RADIUS * 2.3 * JOINT.height) / JOINT.plate;
  const group = svgElement('g', { class: 'frame__plate' });
  group.appendChild(image(JOINT.src, { class: 'frame__plate-art', x: (x - w / 2).toFixed(1), y: (y - h / 2).toFixed(1), width: w.toFixed(1), height: h.toFixed(1) }));
  return group;
}

/**
 * Returns { svg, width, height, localVertices, centroid, grabX, grabY, baseOffset } in element px.
 * `scale` sizes the shape; the beams keep their thickness at every size.
 */
export function buildFrameSvg({ vertices }, { scale = 1 } = {}) {
  const scaled = vertices.map(([x, y]) => [x * scale, y * scale]);
  const minX = Math.min(...scaled.map((p) => p[0]));
  const minY = Math.min(...scaled.map((p) => p[1]));
  const maxX = Math.max(...scaled.map((p) => p[0]));
  const maxY = Math.max(...scaled.map((p) => p[1]));
  const local = scaled.map(([x, y]) => [x - minX + PAD, y - minY + PAD]);
  const width = Math.round(maxX - minX + PAD * 2);
  const height = Math.round(maxY - minY + PAD * 2);

  const svg = svgElement('svg', { class: 'frame', width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });
  for (let i = 0; i < 3; i += 1) {
    const [x1, y1] = local[i];
    const [x2, y2] = local[(i + 1) % 3];
    svg.appendChild(createBeam(x1, y1, x2, y2));
  }
  for (const [x, y] of local) svg.appendChild(createPlate(x, y));

  const top = local.reduce((best, p) => (p[1] < best[1] - 0.5 || (Math.abs(p[1] - best[1]) <= 0.5 && p[0] < best[0]) ? p : best), local[0]);
  return {
    svg,
    width,
    height,
    localVertices: local,
    grabX: top[0] / width,
    grabY: top[1],
    centroid: [(local[0][0] + local[1][0] + local[2][0]) / 3, (local[0][1] + local[1][1] + local[2][1]) / 3],
    baseOffset: maxY - minY + PAD,   // element top → the line the frame stands on
  };
}
