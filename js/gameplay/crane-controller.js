import { CRANE_LAYOUT, CRANE_RIG, PLATFORM_LAYOUT } from '../data/layout.js';
import { tween, wait, easings } from '../core/motion.js';
import { buildClawFrames } from './claw-controller.js';
import { DEPTH, depthScale, groundY, frontToScreen, screenToFront } from './depth-projection.js';

/** The crane's phases, published on the game state so the cab operator's pose can follow them. */
const PHASE = Object.freeze({
  IDLE: 'idle',
  LOWERING_TO_PICK: 'loweringToPick',
  GRABBING: 'grabbing',
  LIFTING: 'liftingTriangle',
  CARRYING: 'carrying',
  TRANSPORTING: 'transportingDepth',
  ALIGNING: 'aligningWithBridge',
  LOWERING_TO_PLACE: 'loweringToPlace',
  RELEASING: 'releasing',
  RETURNING: 'returning',
});

const MAX_SWAY_DEG = 7;
const LIFT_CLEARANCE = 70;      // after a pick the frame hangs this far above the yard plate
const DEPTH_TRAVEL_MS = 1900;   // the move from the yard (z 0) to the bridge (z 1)
/** The jib slews about the top of the tower (the mast's centre line, the jib's centre line). */
const SLEW_PIVOT = Object.freeze({ x: 29.4, y: 56.5 });
const RETURN_MS = 1250;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sprite(className, src, style = {}) {
  const image = new Image();
  image.className = className;
  image.src = src;
  image.alt = '';
  image.draggable = false;
  Object.assign(image.style, style);
  return image;
}

/** Raster crane kit, recomposed around a larger three-quarter operator cabin. */
function buildStructure() {
  const { tower, jibTile, jibTip, cabin, cabinMount } = CRANE_RIG;
  const mount = document.createElement('span');
  mount.className = 'crane-cabin-mount';
  Object.assign(mount.style, { left: `${cabinMount.left}px`, top: `${cabinMount.top}px`, width: `${cabinMount.width}px`, height: `${cabinMount.height}px` });
  const structure = document.createElement('div');
  structure.className = 'crane-structure';
  const mast = document.createElement('div');
  mast.className = 'crane-tower__mast';
  Object.assign(mast.style, {
    position: 'absolute', left: '-127px', top: '70px', width: '312.8px', height: '530px',
    backgroundImage: `url("${tower.mastSrc}")`, backgroundSize: '312.8px 42.84px',
  });
  /** One lattice side of the jib (the kit's tiled girder and its tip). */
  const jibSide = (className) => {
    const face = document.createElement('div');
    face.className = `crane-arm__face ${className}`;
    const girder = document.createElement('div');
    girder.className = 'crane-jib';
    Object.assign(girder.style, {
      left: '0px', top: '15.5px', width: '1806px', height: '82px',
      backgroundImage: `url("${jibTile.src}")`, backgroundSize: '129px 82px',
    });
    face.append(girder, sprite('crane-jib-tip', jibTip.src, { left: '1806px', top: '15.5px', width: '119px', height: '82px' }));
    return face;
  };
  // The jib is a box truss (a lattice side in front, one behind, the underside between them), so it has
  // real volume when it slews: the back lattice shows through the front one and the underside opens up.
  // Jib, tip and trolley form one arm that turns about the tower top into the scene.
  const arm = document.createElement('div');
  arm.className = 'crane-arm';
  arm.style.transformOrigin = `${SLEW_PIVOT.x}px ${SLEW_PIVOT.y}px`;
  const underside = document.createElement('div');
  underside.className = 'crane-arm__face crane-arm__face--under';
  const { trolley } = CRANE_RIG;
  const trolleyImage = sprite('trolley', trolley.src, { position: 'absolute', left: `${-trolley.width / 2}px`, top: `${trolley.top}px`, width: `${trolley.width}px`, height: `${trolley.height}px` });
  arm.append(jibSide('crane-arm__face--back'), underside, jibSide('crane-arm__face--front'), trolleyImage);
  structure.append(mast,
    // The base holds the foot of the mast, so it shares the mast's scale and left edge exactly; the tower stands
    // just off-screen left and the base's plinth ends before the bridge's left end cap (x 168).
    sprite('crane-base', tower.baseSrc, { position: 'absolute', left: '-127px', top: '562.7px', width: '312.8px', height: '118.3px' }),
    arm,
    mount,
    sprite('crane-cabin', cabin.src, { position: 'absolute', left: `${cabin.left}px`, top: `${cabin.top}px`, width: `${cabin.width}px`, height: `${cabin.height}px` }),
  );
  return { structure, arm, trolley: trolleyImage };
}

/**
 * Builds the crane, the hoist rig (pendulum, cable, claw, cargo) and the load's ground shadow.
 * The crane is drawn in real 3D (CSS perspective calibrated to the painted horizon, js/gameplay/
 * depth-projection.js): the jib arm slews into the scene and the hoist hangs from the trolley at its true
 * 3D position, always facing the camera, so the load shrinks and recedes with the whole machine.
 */
export function buildCraneDom(craneEl, platformEl) {
  const { structure, arm, trolley: trolleyImage } = buildStructure();
  craneEl.appendChild(structure);
  // The shadow lies on the ground under the load (yard plate, water, then the bridge deck), below the rig.
  const shadow = document.createElement('div');
  shadow.className = 'claw-shadow';
  craneEl.appendChild(shadow);
  const rig = document.createElement('div');
  rig.className = 'trolley-rig';
  rig.innerHTML = `
    <div class="pendulum">
      <div class="hoist">
        <span class="cable"></span>
        <div class="hoist__load">
          <div class="claw"></div>
          <div class="claw-cargo"></div>
        </div>
      </div>
    </div>`;
  // The warning light lives on the cab roof (painted in the tower sprite); a lit copy flashes over it.
  const { cabBeacon } = CRANE_RIG;
  const beacon = document.createElement('span');
  beacon.className = 'cab-beacon';
  Object.assign(beacon.style, { left: `${cabBeacon.left}px`, top: `${cabBeacon.top}px`, width: `${cabBeacon.size}px`, height: `${cabBeacon.size}px` });
  beacon.innerHTML = '<span class="cab-beacon__light cab-beacon__light--orange"></span><span class="cab-beacon__light cab-beacon__light--red"></span>';
  craneEl.append(rig, beacon);
  buildClawFrames(rig.querySelector('.claw'));
  return { rig, arm, trolley: trolleyImage, beacon, shadow, platformEl };
}

/**
 * The crane in three axes, in world coordinates: x and the claw's y as seen on the front plane, and depth
 * (0 = over the yard, 1 = over the bridge deck). The jib slews into the scene for depth; the hoist hangs
 * from the trolley and swings like a pendulum. Every move is an awaited, scripted sequence.
 */
export function createCraneController({ dom, claw, gameState, audio }) {
  const { rig, arm, trolley, beacon, shadow, platformEl } = dom;
  const pendulumEl = rig.querySelector('.pendulum');
  const hoistEl = rig.querySelector('.hoist');
  const cargoEl = rig.querySelector('.claw-cargo');
  const trolleyHalf = CRANE_RIG.trolley.width / 2;

  const motion = { x: CRANE_LAYOUT.homeX, y: CRANE_LAYOUT.restY, depth: 0, sway: 0, swayVelocity: 0 };
  const rendered = { x: NaN, y: NaN, sway: NaN, depth: NaN };
  let lastX = motion.x;
  let lastY = motion.y;
  let lastMeasuredVx = 0;
  let carried = null;
  let carryMaxY = CRANE_LAYOUT.maxY;   // while carrying, the frame hangs clear of the yard
  let motorRunning = false;
  let winchRunning = false;
  let sequenceRunning = false;

  function setPhase(phase) {
    gameState.update({ craneState: phase });
  }

  function ropeLength() {
    return motion.y - CRANE_LAYOUT.pivotY;
  }

  /**
   * The load's shadow on the ground below it (yard plate, water, bridge deck): under the frame's centre
   * when carrying, as wide as the frame; darker and tighter as the load comes down, smaller with depth.
   */
  function renderShadow(scale) {
    const ground = groundY(motion.depth);
    const heightAbove = PLATFORM_LAYOUT.baseY - motion.y;            // claw-top height above the ground (world px)
    const closeness = clamp(1 - (heightAbove - 260) / 560, 0, 1);
    const swayOffset = Math.sin((motion.sway * Math.PI) / 180) * (ropeLength() + 80) * scale;
    const overYard = motion.depth < 0.06 && !platformEl.classList.contains('is-away')
      && motion.x > PLATFORM_LAYOUT.deckLeft - 40 && motion.x < PLATFORM_LAYOUT.deckRight + 40;
    const overScene = motion.depth >= 0.06;                            // the empty hook's shadow crosses the water too
    const worldX = carried ? motion.x + (carried.centroid[0] - carried.grabX * carried.width) : motion.x;
    const centreX = frontToScreen({ x: worldX, y: 0, z: motion.depth }).x;
    const width = carried ? (carried.width / 170) * 0.9 : 1;          // the shadow art is 170 px wide
    const opacity = carried ? 0.5 + closeness * 0.4 : 0.45 + closeness * 0.55;
    shadow.style.opacity = carried || overYard || overScene ? opacity.toFixed(2) : '0';
    const spread = (1.15 - closeness * 0.35) * scale;
    shadow.style.transform = `translate(${(centreX + swayOffset).toFixed(1)}px, ${(ground + 4 * scale).toFixed(1)}px) scale(${(spread * width).toFixed(3)}, ${spread.toFixed(3)})`;
  }

  /**
   * The jib slews about the tower top so that the trolley, `reach` out along it, sits over (x, depth): the
   * whole arm turns into the scene in perspective and the trolley rides it. The hoist rig hangs from that
   * same 3D point, facing the camera.
   */
  function render() {
    const scale = depthScale(motion.depth);
    if (motion.x !== rendered.x || motion.depth !== rendered.depth) {
      const back = motion.depth * DEPTH.distancePx;
      const across = motion.x - SLEW_PIVOT.x;
      const slew = (Math.atan2(back, across) * 180) / Math.PI;
      const reach = Math.hypot(across, back);
      arm.style.transform = back > 0.01 ? `rotateY(${slew.toFixed(3)}deg)` : '';
      trolley.style.left = `${(SLEW_PIVOT.x + reach - trolleyHalf).toFixed(2)}px`;
      rig.style.transform = back > 0.01 ? `translate3d(${motion.x.toFixed(2)}px, 0, ${(-back).toFixed(2)}px)` : `translateX(${motion.x.toFixed(2)}px)`;
      rendered.x = motion.x;
      rendered.depth = motion.depth;
    }
    if (motion.y !== rendered.y) {
      hoistEl.style.transform = `translateY(${ropeLength().toFixed(2)}px)`;
      rendered.y = motion.y;
    }
    if (Math.abs(motion.sway - rendered.sway) > 0.01) {
      pendulumEl.style.transform = `rotate(${motion.sway.toFixed(2)}deg)`;
      rendered.sway = motion.sway;
    }
    renderShadow(scale);
  }

  /** Authored pendulum: the load lags when the trolley starts and settles with a small swing when it stops. */
  function updateSway(dt, measuredVx) {
    const acceleration = (measuredVx - lastMeasuredVx) / dt;
    lastMeasuredVx = measuredVx;
    const length = Math.max(140, ropeLength() + 90);
    const stiffness = 2600 / length;
    const damping = carried ? 2.2 : 1.8;
    const drive = (-acceleration * (carried ? 0.1 : 0.08) * 57.3) / length;
    motion.swayVelocity += (drive - motion.sway * stiffness - motion.swayVelocity * damping) * dt;
    motion.sway = clamp(motion.sway + motion.swayVelocity * dt, -MAX_SWAY_DEG, MAX_SWAY_DEG);
  }

  function setLoop(name, on, options) {
    if (on) audio.startLoop(name, options);
    else audio.stopLoop(name);
  }

  function update(dt) {
    if (dt <= 0) return;
    const measuredVx = (motion.x - lastX) / dt;
    const measuredVy = (motion.y - lastY) / dt;
    lastX = motion.x;
    lastY = motion.y;
    updateSway(dt, measuredVx);

    // A glide or hoist outside a full sequence runs the trolley motor / winch; sequences play their own cues.
    const travelling = Math.abs(measuredVx) > 6;
    const winching = Math.abs(measuredVy) > 6;
    trolley.classList.toggle('is-running', travelling);
    if (!sequenceRunning) {
      if (travelling !== motorRunning) {
        motorRunning = travelling;
        setLoop('craneMotor', travelling, { heavy: Boolean(carried) });
      }
      if (winching !== winchRunning) {
        winchRunning = winching;
        setLoop('winch', winching);
      }
    }
    beacon.classList.toggle('is-flashing', travelling || winching || sequenceRunning);
    render();
  }

  /** One scripted motion: the crane follows `apply` (0 → 1) along a tween. */
  function runScripted({ duration, ease = easings.mechanical, signal, apply }) {
    return tween({ from: 0, to: 1, duration, ease, signal, onUpdate: apply });
  }

  function glideTo(x, { duration, ease, signal } = {}) {
    const from = motion.x;
    const to = clamp(x, CRANE_LAYOUT.minX, CRANE_LAYOUT.maxX);
    if (Math.abs(to - from) < 0.5) return Promise.resolve();
    const ms = duration ?? clamp((Math.abs(to - from) / CRANE_LAYOUT.maxSpeed) * 1000 * 1.15, 160, 1100);
    return runScripted({ duration: ms, ease, signal, apply: (t) => { motion.x = from + (to - from) * t; } });
  }

  function hoistTo(y, { duration, ease, signal } = {}) {
    const from = motion.y;
    const to = clamp(y, CRANE_LAYOUT.restY, CRANE_LAYOUT.maxY);
    if (Math.abs(to - from) < 0.5) return Promise.resolve();
    const ms = duration ?? clamp((Math.abs(to - from) / (CRANE_LAYOUT.hoistSpeed * 1.25)) * 1000 * 1.15, 160, 1100);
    return runScripted({ duration: ms, ease, signal, apply: (t) => { motion.y = from + (to - from) * t; } });
  }

  /** Damp the pendulum to rest before the claw touches anything, so frames never jump. */
  async function settleSway(signal, duration = 220) {
    if (Math.abs(motion.sway) < 0.05 && Math.abs(motion.swayVelocity) < 0.5) return;
    await tween({ from: motion.sway, to: 0, duration, ease: easings.outCubic, signal, onUpdate: (value) => { motion.sway = value; motion.swayVelocity = 0; } });
  }

  /** Claw-top y at which a frame held by the claw hangs `clearance` px above the yard plate. */
  function clawTopAboveYard(option, clearance) {
    const hang = CRANE_LAYOUT.gripOffsetY - option.grabY + 2 + option.baseOffset;
    return clamp(PLATFORM_LAYOUT.baseY - clearance - hang, CRANE_LAYOUT.restY, CRANE_LAYOUT.maxY);
  }

  function attach(option) {
    carried = option;
    carryMaxY = clawTopAboveYard(option, LIFT_CLEARANCE);
    option.element.classList.add('is-carried');
    option.element.style.left = `${-option.grabX * option.width}px`;
    option.element.style.top = `${-option.grabY + 2}px`;
    cargoEl.appendChild(option.element);
  }

  /** Detaches the carried frame: where its top-left corner sits on the stage, and at what scale. */
  function release() {
    if (!carried) return null;
    const option = carried;
    const claw = frontToScreen({ x: motion.x, y: motion.y, z: motion.depth });
    const scale = claw.scale;
    carried = null;
    carryMaxY = CRANE_LAYOUT.maxY;
    const left = claw.x - option.grabX * option.width * scale;
    const top = claw.y + (CRANE_LAYOUT.gripOffsetY - option.grabY + 2) * scale;
    option.element.classList.remove('is-carried');
    return { option, left, top, scale };
  }

  async function withSequence(run) {
    if (sequenceRunning) return null;
    sequenceRunning = true;
    if (winchRunning) {
      winchRunning = false;
      audio.stopLoop('winch');
    }
    if (motorRunning) {
      motorRunning = false;
      audio.stopLoop('craneMotor');
    }
    try {
      return await run();
    } finally {
      sequenceRunning = false;
    }
  }

  /** Kicks the hook so it swings and settles. */
  function swingImpulse(amount) {
    motion.swayVelocity += amount;
  }

  return {
    update,
    glideTo,
    teleport(x, y = CRANE_LAYOUT.restY) {
      motion.x = clamp(x, CRANE_LAYOUT.minX - 700, CRANE_LAYOUT.maxX + 700);
      motion.y = y;
      motion.depth = 0;
      lastX = motion.x;
      lastY = motion.y;
      lastMeasuredVx = 0;
      motion.sway = 0;
      motion.swayVelocity = 0;
      render();
    },

    /** Pick: open, line up, lower, close, squeeze, and lift the frame clear of the yard. */
    pickUp(option, { signal } = {}) {
      return withSequence(async () => {
        if (carried) return false;
        setPhase(PHASE.LOWERING_TO_PICK);
        audio.play('clawOpen');
        await claw.open();
        if (motion.depth > 0) {                                           // slew back over the yard first
          const from = motion.depth;
          await runScripted({ duration: 220, ease: easings.outCubic, signal, apply: (t) => { motion.depth = from * (1 - t); } });
          motion.depth = 0;
        }
        await glideTo(option.grabStageX, { signal, duration: 220 });
        await settleSway(signal);
        audio.play('winchDown');
        await hoistTo(option.grabStageY - CRANE_LAYOUT.gripOffsetY + 6, { signal, ease: easings.outCubic });
        setPhase(PHASE.GRABBING);
        await wait(90, signal);
        audio.play('clawClose');
        await claw.close();
        attach(option);
        audio.play('pickup');
        audio.play('boing');
        option.element.classList.add('is-lifted');                      // a quick squash-and-stretch as it leaves the yard
        setTimeout(() => option.element.classList.remove('is-lifted'), 520);
        await claw.squeeze();
        await wait(60, signal);
        setPhase(PHASE.LIFTING);
        audio.play('winchUp');
        await hoistTo(carryMaxY, { signal, duration: 520, ease: easings.outCubic });
        swingImpulse(5);                                                  // the weight settles on the cable
        setPhase(PHASE.CARRYING);
        return true;
      });
    },

    /**
     * Carry the frame to the bridge as one sequence: lift off the yard, travel into depth (the load
     * shrinking in perspective, its shadow crossing the water), align over the spot, lower until its
     * base stands on the road, and release. `target(scale)` returns the trolley x and claw-top y that
     * seat the frame at that scale. Resolves with { option, left, top, scale } or null.
     */
    transportToBridge(target, { signal } = {}) {
      return withSequence(async () => {
        if (!carried) return null;
        setPhase(PHASE.TRANSPORTING);
        const seat = target(depthScale(1));                               // stage coordinates on the bridge
        const spot = screenToFront({ x: seat.x, y: seat.y, z: 1 });       // the same point for the crane

        audio.play('winchUp');
        swingImpulse(-6);
        await hoistTo(CRANE_LAYOUT.restY, { signal, duration: 560, ease: easings.outCubic });
        await wait(80, signal);

        // The jib slews into the scene and the trolley runs out along it; the load keeps its height.
        audio.startLoop('craneMotor', { heavy: true });
        audio.play('whoosh');
        swingImpulse(12);                                                 // the load lags as the jib starts to turn
        const start = { x: motion.x, depth: motion.depth };
        try {
          await runScripted({
            duration: Math.max(420, DEPTH_TRAVEL_MS * (1 - start.depth)),
            ease: easings.linear,
            signal,
            apply: (t) => {
              motion.depth = start.depth + (1 - start.depth) * easings.travel(t);
              motion.x = start.x + (spot.x - start.x) * easings.inOutCubic(Math.min(1, t * 1.08));
            },
          });
        } finally {
          audio.stopLoop('craneMotor');
        }
        swingImpulse(-9);                                                 // ...and swings on when it stops

        setPhase(PHASE.ALIGNING);
        await glideTo(spot.x, { signal, duration: 200, ease: easings.outCubic });
        await settleSway(signal, 300);
        await wait(90, signal);

        setPhase(PHASE.LOWERING_TO_PLACE);
        audio.play('winchDown');
        await hoistTo(spot.y, { signal, duration: 760, ease: easings.outCubic });
        audio.play('placement');
        audio.play('ding');
        await wait(110, signal);

        setPhase(PHASE.RELEASING);
        audio.play('clawOpen');
        await claw.open();
        return release();
      });
    },

    /** Removes whatever hangs in the claw (a screen left mid-sequence). */
    discardCargo() {
      const released = release();
      released?.option.element.remove();
      claw.setClosed(false);
    },
    /** The red warning beacon (a frame that does not fit). */
    alarm(on) {
      beacon.classList.toggle('is-alarm', Boolean(on));
    },
    /** Raise the empty claw from the bridge. */
    liftAway({ signal } = {}) {
      audio.play('winchUp');
      return hoistTo(CRANE_LAYOUT.restY, { signal, duration: 520, ease: easings.outCubic });
    },
    /** The empty hook travels back out of depth to its place over the yard. */
    returnHome({ signal, x = CRANE_LAYOUT.homeX } = {}) {
      return withSequence(async () => {
        setPhase(PHASE.RETURNING);
        const from = { x: motion.x, y: motion.y, depth: motion.depth };
        const to = { x: clamp(x, CRANE_LAYOUT.minX, CRANE_LAYOUT.maxX), y: CRANE_LAYOUT.restY };
        audio.startLoop('craneMotor');
        try {
          await runScripted({
            duration: from.depth > 0.01 ? RETURN_MS : clamp((Math.abs(to.x - from.x) / CRANE_LAYOUT.maxSpeed) * 1150, 160, 1100),
            ease: easings.inOutCubic,
            signal,
            apply: (t) => {
              motion.depth = from.depth * (1 - t);
              motion.x = from.x + (to.x - from.x) * t;
              motion.y = from.y + (to.y - from.y) * t;
            },
          });
        } finally {
          audio.stopLoop('craneMotor');
          motion.depth = Math.max(0, motion.depth);
          swingImpulse(8);                                                // the empty hook bobs as it arrives home
          setPhase(PHASE.IDLE);
        }
      });
    },
  };
}
