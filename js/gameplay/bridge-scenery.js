import { BRIDGE_LAYOUT, DECK_LAYOUT, PIER_LAYOUT } from '../data/layout.js';

/**
 * The bridge as scenery for the hook: brick piers in the canal, the low road deck on them, and the three
 * glowing spots where a frame could go (drawn in CSS so they are crisp at any size).
 */
const SPOT_MARKUP = '<span class="hotspot__pulse"></span><span class="hotspot__pool"></span>'
  + '<span class="hotspot__column"><span class="hotspot__flow"></span></span>'
  + '<span class="hotspot__chevrons"><i></i><i></i></span>'
  + '<span class="hotspot__motes"><i></i><i></i><i></i><i></i><i></i><i></i></span>';

/** A short brick pier standing in the canal, with its rippling reflection. */
function buildPillar(x) {
  const { src, artWidth, artHeight, width, topY, waterY } = PIER_LAYOUT;
  const height = (width * artHeight) / artWidth;
  const unit = document.createElement('div');
  unit.className = 'pillar-unit';
  Object.assign(unit.style, { left: `${x - width / 2}px`, top: `${topY}px`, width: `${width}px`, height: `${height.toFixed(1)}px` });
  unit.style.setProperty('--wet', `${waterY - topY}px`);
  unit.innerHTML = `
    <img class="pillar__reflection motion-ambient" src="${src}" alt="" draggable="false">
    <img class="pillar__body" src="${src}" alt="" draggable="false">`;
  return unit;
}

/**
 * The low road deck at walkway level (sliced art): grey arches under the yellow beam springing from the
 * piers, a yellow bracket over each pier, and end caps resting on the quay walkways.
 */
function buildDeck(bridgeEl) {
  const { x1, x2, scale: k, art, left, tile, right, bracket } = DECK_LAYOUT;
  const top = BRIDGE_LAYOUT.deckY - (art.stand - art.top) * k;            // road plates' top edge
  const beamBottom = top + (art.beamBottom - art.top) * k;
  const capBottom = top + (art.capBottom - art.top) * k;
  const leftW = left.width * k;
  const rightW = right.width * k;
  const middle = x2 - x1 - leftW - rightW;
  const tiles = Math.max(1, Math.round(middle / (tile.width * k)));
  const tileW = middle / tiles;
  const spring = PIER_LAYOUT.topY + 3;
  const stops = [[x1 + 30, capBottom - 3], ...PIER_LAYOUT.xs.map((x) => [x, spring]), [x2 - 30, capBottom - 3]];
  const crown = beamBottom + 3;
  const arches = stops.slice(1).map(([bx, by], i) => {
    const [ax, ay] = stops[i];
    const cy = 2 * crown - (ay + by) / 2;
    return `M ${ax} ${ay} Q ${(ax + bx) / 2} ${cy.toFixed(1)} ${bx} ${by}`;
  });
  const bw = bracket.width * bracket.scale;
  const bh = bracket.height * bracket.scale;
  const deck = document.createElement('div');
  deck.className = 'deck';
  deck.innerHTML = `
    <svg class="deck__arches" viewBox="0 0 1920 1080" aria-hidden="true">
      ${arches.map((d) => `<path d="${d}" class="deck__arch-rim"/><path d="${d}" class="deck__arch"/><path d="${d}" class="deck__arch-light" transform="translate(0 -2.5)"/>`).join('')}
    </svg>
    ${PIER_LAYOUT.xs.map((x) => `<img class="deck__bracket" src="${bracket.src}" alt="" draggable="false" style="left:${(x - bw / 2).toFixed(1)}px;top:${(beamBottom - 3).toFixed(1)}px;width:${bw.toFixed(1)}px;height:${bh.toFixed(1)}px">`).join('')}
    <img class="deck__piece" src="${left.src}" alt="" draggable="false" style="left:${x1}px;top:${top.toFixed(1)}px;width:${leftW.toFixed(1)}px;height:${(left.height * k).toFixed(1)}px">
    <span class="deck__plates" style="left:${(x1 + leftW).toFixed(1)}px;top:${top.toFixed(1)}px;width:${middle.toFixed(1)}px;height:${(tile.height * k).toFixed(1)}px;background-image:url('${tile.src}');background-size:${tileW.toFixed(2)}px 100%"></span>
    <img class="deck__piece" src="${right.src}" alt="" draggable="false" style="left:${(x2 - rightW).toFixed(1)}px;top:${top.toFixed(1)}px;width:${rightW.toFixed(1)}px;height:${(right.height * k).toFixed(1)}px">`;
  bridgeEl.appendChild(deck);
  return deck;
}

export function createBridgeScenery({ bridgeEl }) {
  PIER_LAYOUT.xs.forEach((x) => bridgeEl.appendChild(buildPillar(x)));
  buildDeck(bridgeEl);
  const spots = BRIDGE_LAYOUT.spotXs.map((x) => {
    const spot = document.createElement('span');
    spot.className = 'hotspot hotspot--demo';
    spot.innerHTML = SPOT_MARKUP;
    spot.style.left = `${x}px`;
    spot.style.top = `${BRIDGE_LAYOUT.deckY}px`;
    bridgeEl.appendChild(spot);
    return spot;
  });
  return {
    showDemoSpots() {
      spots.forEach((spot) => spot.classList.add('is-visible'));
    },
    hideDemoSpots() {
      spots.forEach((spot) => spot.classList.remove('is-visible'));
    },
  };
}
