/**
 * Stage-space layout (1920 × 1080 master composition). styles/tokens.css mirrors the structural values.
 */
export const STAGE = Object.freeze({ width: 1920, height: 1080, centerX: 960, centerY: 540 });

const CRANE = 'assets/images/crane/';

/** The tower crane on the left quay: mast, base, a jib tiled across the canal, the trolley and the operator's cab. */
export const CRANE_RIG = Object.freeze({
  tower: Object.freeze({ mastSrc: `${CRANE}tower-mast.webp`, baseSrc: `${CRANE}tower-base.webp` }),
  jibTile: Object.freeze({ src: `${CRANE}jib-tile.webp` }),
  jibTip: Object.freeze({ src: `${CRANE}jib-tip.webp` }),
  trolley: Object.freeze({ src: `${CRANE}trolley.webp`, width: 233, height: 67, top: 8.5 }),
  /** The cab (art 1312 × 1199, shown at 300 × 274) hangs under the jib; its front is drawn over the operator. */
  cabin: Object.freeze({ src: `${CRANE}cabin.webp`, frontSrc: `${CRANE}cabin-front.webp`, left: -12.1, top: 94, width: 300, height: 274 }),
  /** Steel mount from the jib down to the cab's back plate. */
  cabinMount: Object.freeze({ left: 21.9, top: 90, width: 34, height: 44 }),
  /** The seated operator (2 × 2 atlas cells): back against the seat, feet and joystick box on the cab floor. */
  cabWindow: Object.freeze({ left: 63.4, top: 181.6, width: 144, height: 144 }),
  /** A glow centred on the beacon painted on the cab roof; it pulses while the crane moves. */
  cabBeacon: Object.freeze({ left: 75.5, top: 74.7, size: 90 }),
  claw: Object.freeze({
    states: Object.freeze([
      Object.freeze({ id: 'open', src: `${CRANE}claw-open.webp`, width: 124, height: 191 }),
      Object.freeze({ id: 'half', src: `${CRANE}claw-half.webp`, width: 94, height: 196 }),
      Object.freeze({ id: 'closed', src: `${CRANE}claw-closed.webp`, width: 87, height: 198 }),
    ]),
  }),
});

export const CRANE_LAYOUT = Object.freeze({
  pivotY: 71.5,        // where the cable leaves the trolley: the pendulum pivot
  minX: 330,
  maxX: 1690,
  homeX: 1660,         // where the trolley waits, and where it parks after a trip
  restY: 236,          // claw top when fully raised
  maxY: 760,           // claw top when fully lowered
  maxSpeed: 500,       // px per second along the jib
  hoistSpeed: 460,     // px per second up / down
  gripOffsetY: 176,    // distance from the claw top to the point held between the jaws
});

/** The hazard-stripe yard platform in front of the canal, and the frames lying on it. */
export const PLATFORM_LAYOUT = Object.freeze({
  src: 'assets/images/bridge/yard-platform.webp',   // 2139 × 422 art, 1160 px wide on stage
  deckLeft: 483,       // usable plate surface (inside the yellow end caps)
  deckRight: 1437,
  baseY: 950,          // where frames stand: centred on the grey plate
  pileXs: Object.freeze([561, 780, 951, 1149, 1355]),
  pileScale: 0.72,
});

/** The bridge deck the frames are carried to, and the three glowing spots on it. */
export const BRIDGE_LAYOUT = Object.freeze({
  deckY: 672,          // where frames stand on the deck's road plates
  spotXs: Object.freeze([690, 960, 1230]),
});

/**
 * The low road deck at walkway level (sliced art): left end cap, repeated road plates, right end cap, all
 * at `scale`. Its end caps rest on the quay walkways; grey arches under its beam spring from three piers.
 * Art rows: road top 316, frame-standing line 370, beam bottom 431, cap bottom 470.
 */
export const DECK_LAYOUT = Object.freeze({
  x1: 168, x2: 1752,
  scale: 0.37,
  art: Object.freeze({ top: 316, stand: 370, beamBottom: 431, capBottom: 470 }),
  left: Object.freeze({ src: 'assets/images/bridge/deck-left.webp', width: 351, height: 154 }),
  tile: Object.freeze({ src: 'assets/images/bridge/deck-tile.webp', width: 224, height: 115 }),
  right: Object.freeze({ src: 'assets/images/bridge/deck-right.webp', width: 347, height: 154 }),
  bracket: Object.freeze({ src: 'assets/images/bridge/deck-bracket.webp', width: 180, height: 108, scale: 0.36 }),
});

/** The three short brick piers in the canal. */
export const PIER_LAYOUT = Object.freeze({
  src: 'assets/images/bridge/pier.webp', artWidth: 292, artHeight: 154,
  xs: Object.freeze([345, 960, 1575]), width: 118, topY: 724,
  waterY: 758,         // the waterline on the piers: below it the bricks fade into the canal
});
