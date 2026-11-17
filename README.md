# Bridge Builder: Triangle Workshop

The learning section of Bridge Builder on its own. The beaver operator tries a frame on the bridge, it does
not fit, and he takes the learner into his workshop to classify triangles by their sides and their angles.
It runs on the game's engine (canal scene, crane and operator, camera, audio, narration) without the crane game.
The same lesson is wired into the full game (`BEAVAR BUILDER` repository) between "Your help is needed" and
"How to play".

Lesson design, geometry and art: [docs/LEARNING.md](docs/LEARNING.md).

## Play

Double-click `index.html` (it loads one built script, so it runs from disk), or run `Play Game.command` to
serve the folder on http://localhost:8787.

Start → the hook → the lesson (29 screens; it moves on by itself, CHECK / CONTINUE are the only buttons) →
"You're ready!" → replay.

URL options: `?lesson=L07` starts at that screen · `?debug=1` (or the D key) shows the screen list with
Back / Next · `?qa=1` exposes `window.__learning` · `?vo=0` silences narration · `?vorate=2` speeds it up ·
`?speech=1` lets the device voice read lines that have no clip.

## Develop

Python 3 only (no Node). Edit `js/` or `styles/`, then rebuild:

```sh
python3 tools/build.py      # js/ -> dist/app.js, styles/ -> dist/app.css (minified), stamps index.html
```

Tests and QA:

```sh
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/learning-model.test.js
python3 tools/qa/learning.py   # the whole lesson in headless Chrome; screenshots in test-results/learning/
```

Run one play-through at a time (they share a debugging port).

## Structure

```
index.html                 the stage markup; loads dist/app.css and dist/app.js
dist/                      BUILT by tools/build.py (committed, so the page runs from disk and deploys as is)
js/
  main.js                  boot: preload, scene, screens (title → hook → learning → end)
  config.js                DEBUG_MODE
  core/                    loop, state, screens, camera, motion, audio (synthesised), voice (narration clips)
  data/                    layout, yard frames, narration map and word times, water texture
  gameplay/                crane, claw, cab operator, yard, bridge scenery, water, effects, speech bubble
  screens/                 title, hook, learning, end
  learning/                the lesson: content, triangle maths, canvas, figures, card, widgets, beaver, flow
styles/                    tokens, base, layout, components, gameplay, animations, learning, responsive
assets/
  images/                  background, bridge, crane, frame, fx, operator, ui, workshop (WebP; canal also AVIF)
  audio/vo/                narration: Ogg Opus + AAC / MP3 twin per clip
tests/                     learning-model.test.js (maths QA under JavaScriptCore)
tools/
  build.py                 bundle + minify
  media.py                 PNG → WebP / AVIF, clips → Ogg Opus
  qa/                      headless-Chrome play-through (cdp.py is a tiny DevTools client)
  vo/                      record.py (Gemini TTS) or clone.py (free, local voice cloning) for the beaver's voice,
                           verify.py (words + voice check), word_times.py, vo_script.json
```

## Media

Quality first: optimisation never lowers what the player sees or hears. All art is lossless WebP (every
pixel of the PNG kept, still about 40% smaller than the PNGs); the full-screen canal backdrop is also offered
as an AVIF, served first, that measures visually identical to the PNG (PSNR at least 45 dB) at a tenth of the
size. Narration plays Ogg Opus at 64 kbps (transparent for speech) where the browser supports it and the AAC /
MP3 twin elsewhere (older iPhones and iPads).

New art from Figma: put the PNG in its folder and run `python3 tools/media.py` (it writes the WebP and removes
the PNG), then reference the `.webp`. New narration: see "Voice-over" in docs/LEARNING.md.

## Deploy (Vercel)

A static site with no build step on Vercel: `dist/` is committed. `vercel.json` never caches the page,
caches `dist/` for good (every build stamps its links with `?v=`), and the assets for a week.
`.vercelignore` deploys only `index.html`, `dist/` and `assets/`.

```sh
python3 tools/build.py      # always build before deploying
npx vercel --prod
```

## Sync with the full game

The game imports the lesson from here. These paths are shared and must keep their names and exports:
`js/learning/`, `js/screens/hook-screen.js`, `js/screens/learning-screen.js`, `styles/learning.css`,
`assets/images/workshop/`, `tests/learning-model.test.js`, `tools/qa/learning.py`, `docs/LEARNING.md`,
`tools/vo/vo_script.json`. They import only these engine modules, which the game also has:
`core/motion.js`, `gameplay/feedback-controller.js`, `gameplay/bubble-shape.js`,
`gameplay/placement-controller.js`, `screens/story-screens.js`, `data/vo-word-times.js`, `config.js`.
After copying them into the game, rebuild there (`python3 tools/build.py js/app.js js/game.bundle.js`).
