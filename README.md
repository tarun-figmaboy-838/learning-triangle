# Bridge Builder: Triangle Workshop

The learning section of Bridge Builder on its own: the beaver operator tries a frame on the bridge, it
does not fit, and he takes the learner into his workshop to learn to classify triangles by sides and by
angles before choosing frames. It runs on the game's own engine (the canal scene, the crane cab and the
operator, camera, audio and narration), without the crane game. The same section is wired into the full
game in the `BEAVAR BUILDER` repository (between "Your help is needed" and "How to play").

See `docs/LEARNING.md` for the screen map, the geometry engine, the generated art and QA.

## Play

Double-click `index.html` (it runs from disk: `index.html` loads one bundled script, `js/learning.bundle.js`),
or run `Play Game.command` to serve the folder on http://localhost:8787.

Start → the hook → the workshop (29 steps, moves on by itself; the deck's CHECK / CONTINUE are the only
buttons) → "You're ready!" → replay.

## Develop

Edit the ES modules in `js/`, then rebuild the bundle:

```sh
python3 tools/build.py                     # js/learning-app.js -> js/learning.bundle.js
```

Tests and QA (no Node needed):

```sh
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/learning-model.test.js   # maths QA
python3 tools/qa/learning.py                                                                                       # the whole lesson in headless Chrome, screenshots in test-results/learning/
```

URL options: `?lesson=L07` starts at that screen; `?qa=1` exposes `window.__learning` for the play-through;
`?vo=0` turns narration off; `?vorate=2` plays it faster.

## Structure

```
index.html            stage markup
styles/               the game's stylesheets + learning.css
js/learning-app.js    boot: preload, scene, screens (title, hook, learning, end)
js/learning/          content map, geometry engine, canvas, card, widgets, beaver guide, flow
js/screens/           title, hook, learning, end (+ the story helpers the hook reuses)
js/core/, js/gameplay/, js/data/   the engine modules the section uses (from the game)
assets/images/workshop/            art generated with Figma for this section (see docs/LEARNING.md)
tools/                build.py (bundle), qa/ (play-through), vo/ (narration script), vo_word_times.py
tests/                learning-model.test.js
```
