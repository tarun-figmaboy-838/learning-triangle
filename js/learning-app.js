/**
 * Boot for the standalone Triangle Workshop build: the learning section on its own, running on the
 * Bridge Builder engine (the same canal scene, crane cab and beaver operator, audio, camera and
 * narration), without the crane game. Start → the operator takes the learner into his workshop → the
 * lesson (js/learning/) → he climbs back into the cab, and the learner can run it again.
 */
import { DEBUG_MODE } from './config.js';
import { STAGE, CRANE_RIG, CRANE_LAYOUT, PLATFORM_LAYOUT } from './data/layout.js';
import { createGameState } from './core/game-state.js';
import { createGameLoop } from './core/game-loop.js';
import { preloadImages } from './core/asset-loader.js';
import { createAudioManager } from './core/audio-manager.js';
import { createVoiceManager } from './core/voice-manager.js';
import { createCameraController } from './core/camera-controller.js';
import { createScreenManager } from './core/screen-manager.js';
import { buildCraneDom, createCraneController } from './gameplay/crane-controller.js';
import { createClawController } from './gameplay/claw-controller.js';
import { createFeedbackController } from './gameplay/feedback-controller.js';
import { createConstructionFx } from './gameplay/construction-fx.js';
import { createTriangleController } from './gameplay/triangle-controller.js';
import { createBridgeController } from './gameplay/bridge-controller.js';
import { STEEL_IMAGES } from './gameplay/svg-tubes.js';
import { createHookScreen } from './screens/hook-screen.js';
import { buildEnvironment } from './gameplay/environment.js';
import { createBuilderCharacter, BUILDER_FRAME_SOURCES } from './gameplay/builder-character.js';
import { createTitleScreen } from './screens/title-screen.js';
import { createLearningScreen } from './screens/learning-screen.js';
import { createLearningEndScreen } from './screens/learning-end-screen.js';
import { BOARD } from './learning/workshop-board.js';
import { GUIDE_IMAGES } from './learning/beaver-guide.js';
import { WIDGET_IMAGES } from './learning/workshop-widgets.js';

const CRITICAL_IMAGES = [
  PLATFORM_LAYOUT.src,
  'assets/images/bridge/pier.png',
  'assets/images/bridge/deck-left.png',
  'assets/images/bridge/deck-tile.png',
  'assets/images/bridge/deck-right.png',
  'assets/images/bridge/deck-bracket.png',
  'assets/images/crane/bolt.png',
  'assets/images/fx/sparkle-cluster.png',
  'assets/images/fx/sparkle-big.png',
  ...STEEL_IMAGES,
  CRANE_RIG.cabin.src,
  CRANE_RIG.cabin.frontSrc,
  CRANE_RIG.tower.topSrc,
  CRANE_RIG.tower.mastSrc,
  CRANE_RIG.tower.baseSrc,
  CRANE_RIG.jibTile.src,
  CRANE_RIG.jibTip.src,
  ...BUILDER_FRAME_SOURCES,
  CRANE_RIG.trolley.src,
  'assets/images/crane-kit/jib-underside.png',
  ...CRANE_RIG.claw.states.map((state) => state.src),
  'assets/images/crane-kit/cable-tile.png',
  'assets/images/crane-kit/beacon-orange.png',
  'assets/images/crane-kit/beacon-red.png',
  'assets/images/kit/play-button.png',
  'assets/images/kit/title-logo.png',
  'assets/images/kit/replay-button.png',
  'assets/images/fx/ripple-1.png',
  'assets/images/fx/ripple-2.png',
  BOARD.backdrop,
  ...GUIDE_IMAGES,
  ...WIDGET_IMAGES,
].map((src) => ({ key: src, src }));

function queryElements() {
  const byId = (id) => document.getElementById(id);
  return {
    viewport: byId('viewport'), stage: byId('stage'), world: byId('world'), shake: byId('shake'),
    water: byId('water'), bridge: byId('bridge'), placed: byId('placed'), platform: byId('platform'), crane: byId('crane'), fx: byId('fx'), workshop: byId('workshop'),
    hud: byId('hud'), overlays: byId('overlays'), mute: byId('mute'), loader: byId('loader'),
  };
}

function whenImageReady(image) {
  if (!image || (image.complete && image.naturalWidth)) return Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', () => { console.error('[assets] required asset failed to load:', image.currentSrc || image.src); resolve(); }, { once: true });
  });
}

function fitStage(stageEl) {
  const scale = Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
  stageEl.style.setProperty('--stage-scale', scale.toFixed(4));
}

function wireMuteButton(button, audio, voice) {
  const render = () => {
    button.classList.toggle('is-muted', audio.muted);
    button.setAttribute('aria-pressed', String(audio.muted));
    button.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
  };
  button.addEventListener('click', (event) => {
    if (event.detail > 0) button.blur();
    audio.unlock();
    const muted = audio.toggleMuted();
    voice.setMuted(muted);
    if (!muted) audio.play('uiTap');
    render();
  });
  voice.setMuted(audio.muted);
  render();
}

async function boot() {
  const els = queryElements();
  fitStage(els.stage);
  window.addEventListener('resize', () => fitStage(els.stage));
  window.addEventListener('orientationchange', () => setTimeout(() => fitStage(els.stage), 300));

  const loaderFill = els.loader.querySelector('.loader__fill');
  const [{ missing }] = await Promise.all([
    preloadImages(CRITICAL_IMAGES, (progress) => { loaderFill.style.width = `${Math.round(progress * 100)}%`; }),
    whenImageReady(els.stage.querySelector('.backdrop img')),
  ]);
  if (missing.size) console.error('[assets] required assets failed to load:', [...missing]);

  const craneDom = buildCraneDom(els.crane, els.platform);
  buildEnvironment({ waterLayer: els.water });

  const gameState = createGameState();
  const audio = createAudioManager();
  const voice = createVoiceManager({ audio });
  const loop = createGameLoop();
  const camera = createCameraController({ worldEl: els.world, shakeEl: els.shake });
  const fx = createConstructionFx({ fxLayer: els.fx });
  const claw = createClawController({ clawEl: els.crane.querySelector('.claw') });
  const crane = createCraneController({ craneEl: els.crane, dom: craneDom, claw, gameState, audio });
  const triangles = createTriangleController({ platformEl: els.platform, placedLayerEl: els.placed });
  const bridge = createBridgeController({ bridgeEl: els.bridge, fxEl: els.fx, fx, audio });
  const builder = createBuilderCharacter({ hostEl: els.crane });
  gameState.subscribe((state) => builder.setGameState(state));
  const feedback = createFeedbackController({ hudEl: els.hud, overlaysEl: els.overlays, voice, builder });
  const screenManager = createScreenManager({ gameState, onError: (error) => console.error('[screen]', error) });
  crane.teleport(CRANE_LAYOUT.homeX);

  const context = { els, gameState, audio, voice, camera, fx, claw, crane, triangles, bridge, feedback, builder, screenManager, startScreen: 'hook', learningNext: 'end' };
  screenManager.register('title', createTitleScreen(context));
  screenManager.register('hook', createHookScreen({ ...context, nextScreen: 'learning', sayFramesLine: true }));
  screenManager.register('learning', createLearningScreen(context));
  screenManager.register('end', createLearningEndScreen(context));

  loop.add(crane.update);
  loop.add(camera.update);
  loop.start();
  document.addEventListener('visibilitychange', () => {
    audio.setMusicPaused(document.hidden);
    if (document.hidden) { audio.stopAllLoops(); voice.stop(); }
  });
  wireMuteButton(els.mute, audio, voice);
  els.stage.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
  if (DEBUG_MODE) window.__bridgeGame = context;

  els.loader.classList.add('is-done');
  setTimeout(() => els.loader.remove(), 500);
  await screenManager.go('title');
}

boot().catch((error) => {
  console.error('[boot]', error);
  const text = document.querySelector('.loader__text');
  if (text) text.textContent = 'Something went wrong while loading the workshop. Please reload the page.';
});
