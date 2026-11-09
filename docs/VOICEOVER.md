# Voice-over

Every line the game speaks has a recorded clip in `assets/audio/vo/`. The clips were recorded the same way as Fishing Frenzy, with the **Ai Wala Human By Aamir** studio (Batch Generation):

- Language Hindi, so English written in Devanagari is spoken as English with a clear Indian accent.
- Narrator: Female Teacher (Standard). Builder: Male Teacher (Formal).
- Numbers and symbols are written out in the spoken form ("2" → "two", "90°" → "ninety degrees"); the screen keeps the PDF wording.

| File | What it is |
|---|---|
| `tools/vo/vo_script.json` | every line: `id`, `speaker`, `line` (as shown), `spoken` (as said) |
| `tools/vo/vo-record.py` | `batch` records missing lines (respecting the studio's 100 requests / 15 min limit), `build` measures clips and writes the map |
| `js/data/vo-lines.js` | generated map: line as shown → clip, seconds, speaker |
| `js/core/voice-manager.js` | the player |

How the game uses them: one reused `<audio>` element, unlocked by the Start tap; a line is looked up by the exact text on screen; the words type at the voice's pace; sound effects duck under the voice; a new line stops the previous one; every clip is prefetched after Start. Without a clip (or with `?vo=0`) the device's speech voice reads the line, and without that the line simply shows.

## All clips

<!-- table:start -->
| Clip | Speaker | Line as shown | Spoken as | s |
|---|---|---|---|---|
| vo001 | builder | I have all these triangular frames, but I can't remember which ones go where! | I have all these triangular frames, but I can't remember which ones go where! | 5.57 |
<!-- table:end -->
