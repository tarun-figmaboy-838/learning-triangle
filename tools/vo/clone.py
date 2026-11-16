"""Records the lesson's missing lines in the beaver's voice with free, open-source voice cloning:
Chatterbox (Resemble AI, MIT licence) runs on this Mac, no API key or account. The voice is cloned from
the beaver's own studio clips in assets/audio/vo, so new lines sound like the recorded ones.

One-time setup (a self-contained Python 3.11 in a tool folder, outside the project):
    python3 -m pip install --user uv
    ~/Library/Python/3.9/bin/uv venv --python 3.11 ~/.cache/learning-triangle-voice/venv
    ~/Library/Python/3.9/bin/uv pip install --python ~/.cache/learning-triangle-voice/venv/bin/python chatterbox-tts "setuptools<81" soundfile
    (+ faster-whisper for tools/vo/verify.py; setuptools<81 keeps the pkg_resources Chatterbox's watermarker needs)

Record:
    ~/.cache/learning-triangle-voice/venv/bin/python tools/vo/clone.py           # every lesson line without a clip
    ~/.cache/learning-triangle-voice/venv/bin/python tools/vo/clone.py vo031     # only these ids (re-records them)
    python3 tools/vo/word_times.py && python3 tools/build.py                       # then: captions follow the voice

Clips: assets/audio/vo/voNNN.m4a (AAC 64 kbps mono) and its Ogg Opus twin; js/data/vo-lines.js is updated.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from record import ROOT, SCRIPT, VO_DIR, lesson_lines, seconds_of, write_map  # noqa: E402
from media import to_ogg  # noqa: E402  (record.py put tools/ on the path)

# Long, clean studio sentences: about 20 s of the beaver's voice for the clone to learn from.
REFERENCE_CLIPS = ["vo021.m4a", "vo023.m4a", "vo027.m4a", "vo029.m4a"]
LEAD_IN_S = 0.3            # the studio clips start speaking about 0.3 s in; new clips match
# The model files, if already fetched into the tool folder; otherwise Chatterbox downloads them itself.
MODEL_DIR = os.path.expanduser("~/.cache/learning-triangle-voice/chatterbox")


def load_model(device):
    from chatterbox.tts import ChatterboxTTS

    if os.path.exists(os.path.join(MODEL_DIR, "t3_cfg.safetensors")):
        return ChatterboxTTS.from_local(MODEL_DIR, device)
    return ChatterboxTTS.from_pretrained(device=device)
TAIL_S = 0.25


# Lines the voice says better with a small change in delivery (the caption keeps the deck's wording):
# a lone "Scalene." before a full stop came out as "scaling"; flowing on with a comma, it is said in full.
SAY_AS = {"Scalene. All sides are different.": "Scalene, all sides are different."}


def speakable(text):
    """The line as it should be said (the screen keeps the deck's wording)."""
    text = SAY_AS.get(text, text)
    return re.sub(r"\s+", " ", text.replace("°", " degrees")).strip()


def decode_wav(path, out, rate=24000):
    subprocess.run(["afconvert", path, out, "-f", "WAVE", "-d", f"LEI16@{rate}", "-c", "1"], check=True, capture_output=True)


def build_reference(work):
    """The reference clips joined with short pauses into one mono WAV."""
    import numpy as np
    import soundfile

    rate, parts = 24000, []
    for name in REFERENCE_CLIPS:
        tmp = os.path.join(work, name + ".wav")
        decode_wav(os.path.join(VO_DIR, name), tmp, rate)
        samples, _ = soundfile.read(tmp, dtype="float32")     # afconvert writes WAVE_FORMAT_EXTENSIBLE, which `wave` cannot read
        parts += [samples, np.zeros(int(rate * 0.4), dtype="float32")]
    reference = os.path.join(work, "reference.wav")
    soundfile.write(reference, np.concatenate(parts), rate, subtype="PCM_16")
    return reference


def trim(samples, rate):
    """Silence trimmed to the studio clips' lead-in and a short tail."""
    import numpy as np

    level = np.abs(samples)
    threshold = max(1e-4, level.max() * 0.02)
    voiced = np.nonzero(level > threshold)[0]
    if not len(voiced):
        return samples
    start = max(0, voiced[0] - int(0.02 * rate))
    end = min(len(samples), voiced[-1] + int(TAIL_S * rate))
    return np.concatenate([np.zeros(int(LEAD_IN_S * rate), dtype=samples.dtype), samples[start:end]])


def main():
    import numpy as np
    import torch

    wanted = [arg for arg in sys.argv[1:] if re.fullmatch(r"vo\d+", arg)]
    script = json.load(open(SCRIPT, encoding="utf-8"))
    by_line = {row["line"]: row for row in script}
    next_id = max(int(row["id"][2:]) for row in script) + 1
    rows = []
    for text in lesson_lines():
        row = by_line.get(text)
        if not row:
            row = {"id": f"vo{next_id:03d}", "speaker": "builder", "line": text, "spoken": text, "where": ["Triangle workshop"], "seconds": 0}
            next_id += 1
            script.append(row)
        rows.append(row)
    has_clip = lambda row: any(os.path.exists(os.path.join(VO_DIR, f"{row['id']}.{ext}")) for ext in ("mp3", "m4a"))
    todo = [row for row in rows if row["id"] in wanted] if wanted else [row for row in rows if not has_clip(row)]
    todo = [row for row in todo if not os.path.exists(os.path.join(VO_DIR, f"{row['id']}.mp3"))]   # never replace studio clips
    if not todo:
        print("every lesson line has a clip")
        return
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"cloning the beaver's voice for {len(todo)} line(s) on {device}")
    model = load_model(device)
    with tempfile.TemporaryDirectory() as work:
        reference = build_reference(work)
        for row in todo:
            spoken = speakable(row["line"])
            audio = model.generate(spoken, audio_prompt_path=reference, exaggeration=0.5, cfg_weight=0.5)
            samples = trim(audio.squeeze(0).detach().cpu().numpy().astype(np.float32), model.sr)
            wav_path = os.path.join(work, f"{row['id']}.wav")
            with wave.open(wav_path, "wb") as handle:
                handle.setnchannels(1)
                handle.setsampwidth(2)
                handle.setframerate(model.sr)
                handle.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
            clip = os.path.join(VO_DIR, f"{row['id']}.m4a")
            subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", wav_path, clip], check=True, capture_output=True)
            to_ogg(clip)
            row["spoken"] = spoken
            row["seconds"] = seconds_of(clip)
            print(f"recorded {row['id']} ({row['seconds']} s): {row['line']}")
            json.dump(script, open(SCRIPT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    write_map(rows)


if __name__ == "__main__":
    main()
