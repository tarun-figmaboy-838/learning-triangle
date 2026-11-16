"""Checks narration clips without listening: does each say its line, and in the beaver's voice?

  ~/.cache/learning-triangle-voice/venv/bin/python tools/vo/verify.py            # every clip
  ~/.cache/learning-triangle-voice/venv/bin/python tools/vo/verify.py vo031      # only these ids

words  Whisper (open source, base.en) transcribes the clip; the score is how closely it matches the line (1 = exact).
voice  the clip's voice fingerprint (Chatterbox's speaker encoder) against the studio clips', as cosine
       similarity; the studio clips against each other set the baseline a cloned clip should reach.
Needs the tool folder from tools/vo/clone.py plus `faster-whisper`.
"""
import difflib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from record import VO_DIR, ROOT, SCRIPT  # noqa: E402
from clone import MODEL_DIR  # noqa: E402

NUMBERS = {"3": "three", "90": "ninety", "2": "two", "1": "one"}
VOCABULARY = "Triangles by sides: scalene, isosceles, equilateral. By angles: acute-angled, right-angled, obtuse-angled."


def words(text):
    text = text.lower().replace("°", " degrees").replace("-", " ")
    tokens = re.findall(r"[a-z0-9']+", text)
    return [NUMBERS.get(t, t) for t in tokens]


def main():
    import librosa
    import numpy as np
    from faster_whisper import WhisperModel

    # Every line with a clip on disk (the script names them; the map may not be rebuilt yet).
    rows = json.load(open(SCRIPT, encoding="utf-8"))
    clips = []
    for row in rows:
        for ext in ("mp3", "m4a"):
            if os.path.exists(os.path.join(VO_DIR, f"{row['id']}.{ext}")):
                clips.append((row["line"], row["id"], f"{row['id']}.{ext}"))
                break
    wanted = set(sys.argv[1:])
    # Studio clips: the studio's MP3, or Gemini's (their spoken form is the Devanagari rewrite of the line).
    spoken = {row["id"]: row.get("spoken", "") for row in rows}
    studio = [c for c in clips if c[2].endswith(".mp3") or re.search(r"[\u0900-\u097F]", spoken.get(c[1], ""))]
    # The speaker encoder the cloning itself uses (6 MB): loaded alone, not the whole 3 GB model.
    from chatterbox.models.voice_encoder import VoiceEncoder
    from safetensors.torch import load_file
    encoder = VoiceEncoder()
    encoder.load_state_dict(load_file(os.path.join(MODEL_DIR, "ve.safetensors")))
    encoder.eval()
    embed = lambda path: encoder.embeds_from_wavs([librosa.load(path, sr=16000)[0]], sample_rate=16000)[0]
    studio_emb = np.stack([embed(os.path.join(VO_DIR, f)) for _, _, f in studio])
    studio_emb /= np.linalg.norm(studio_emb, axis=1, keepdims=True)
    pair = studio_emb @ studio_emb.T
    baseline = pair[np.triu_indices(len(studio_emb), 1)]
    print(f"studio voice baseline: similarity {baseline.mean():.3f} (min {baseline.min():.3f}) across {len(studio_emb)} clips")
    whisper = WhisperModel("base.en", device="cpu", compute_type="int8")
    for text, clip_id, file in clips:
        if wanted and clip_id not in wanted:
            continue
        path = os.path.join(VO_DIR, file)
        # The lesson's vocabulary as context: a lone "Scalene." is otherwise heard as the everyday "scaling".
        heard = " ".join(seg.text for seg in whisper.transcribe(path, language="en", beam_size=5, initial_prompt=VOCABULARY)[0]).strip()
        score = difflib.SequenceMatcher(None, words(text), words(heard)).ratio()
        e = embed(path)
        voice = float((studio_emb @ (e / np.linalg.norm(e))).mean())
        flag = "" if score >= 0.9 and voice >= baseline.min() - 0.02 else "  <-- check"
        print(f"{clip_id}  words {score:.2f}  voice {voice:.3f}  heard: {heard}{flag}", flush=True)


if __name__ == "__main__":
    main()
