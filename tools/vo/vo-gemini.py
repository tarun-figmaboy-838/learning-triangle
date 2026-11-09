"""Records the lesson's lines in the beaver's studio voice WITHOUT the studio: the same two Gemini calls
Aamir's "AI Wala Human" studio makes (read from its app), with your own Gemini API key.

  1. gemini-3-flash-preview rewrites the English line in Devanagari ("Let's measure" -> "लेट्स मेज़र"),
     which is what makes the speech model use a clear Indian accent (the studio's "Hindi" setting);
  2. gemini-3.1-flash-tts-preview speaks it with the prebuilt voice "Charon" = the studio's
     "Male Teacher (Formal)", the builder's voice in assets/audio/vo/vo001.mp3.

    export GEMINI_API_KEY=...            # a key from https://aistudio.google.com/apikey (with TTS access)
    python3 tools/vo/vo-gemini.py         # records every lesson line that has no clip yet
    python3 tools/vo/vo-gemini.py --all   # re-records them all (never touches the studio's .mp3 clips)
    python3 tools/vo/vo-gemini.py --list  # shows the lines and ids, records nothing
    python3 tools/vo_word_times.py        # then: per-word times (captions and animations follow the voice)
    python3 tools/build.py

Clips: assets/audio/vo/voNNN.m4a (AAC 64 kbps mono). Ids come from tools/vo/vo_script.json (new lines are
appended there). The map js/data/vo-lines.js keeps every existing entry and adds the new clips.
"""
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import wave

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
VO_DIR = os.path.join(ROOT, "assets/audio/vo")
SCRIPT = os.path.join(ROOT, "tools/vo/vo_script.json")
LINES_JS = os.path.join(ROOT, "js/data/vo-lines.js")
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"
API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
# The studio's models first; a free-tier key may only have the 2.5 ones (same "Charon" voice).
TEXT_MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash"]
TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]
VOICE = "Charon"                     # the studio's "Male Teacher (Formal)"
TARGET = "Hindi"                     # the studio's language setting for the game's clips

# The studio's own preparation prompt, verbatim in substance (src: its app bundle).
PREPARE = """You are an expert linguistic processor for a Text-to-Speech engine.
Task: Prepare the input text for high-quality TTS synthesis in {target}.
CRITICAL: YOU MUST PRESERVE THE ORIGINAL TEXT VERBATIM. DO NOT SIMPLIFY, REWRITE, OR ADD ANY NEW INFORMATION.
Phonetic/Stylistic Requirements:
1. Math/LaTeX: Expand symbols into clear names.
2. Translation: none, keep the English words.
3. TO FORCE AN INDIAN ACCENT: You MUST transliterate ALL text into the native script of {target}, EVEN IF the input text is English.
   - Example English input -> Hindi output: "How is FLN different?" -> "हाउ इज एफ एल एन डिफरेंट?"
4. Acronyms & Numbers: Write acronyms with spaces and numbers as spoken naturally in India.
5. The final output MUST be entirely in the native script of {target} so the TTS engine natively applies a regional accent.
Target Audience: Government school students in India.
Output ONLY the final processed text in {target}'s native script. No markdown, no explanations.
Input Text: {text}
Source Language: English
Target Language: {target}"""

EXTRACT = r"""
import { LEARNING_SCREENS, LEARNING_COPY } from '%(root)s/js/learning/learning-content.js';
const out = [];
const add = (t) => { if (typeof t === 'string' && t.trim()) out.push(t.replace(/\s+/g, ' ').trim()); };
for (const s of LEARNING_SCREENS) {
  add(s.narration); add(s.instruction); add(s.question?.prompt);
  if (typeof s.success === 'string') add(s.success); else add(s.success?.narration);
  for (const item of [...(s.bySides ?? []), ...(s.byAngles ?? [])]) add(`${item.name}. ${item.text}`);
}
add(LEARNING_COPY.summary?.heading); add(LEARNING_COPY.summary?.both);
add(LEARNING_COPY.beaver?.enter); add(LEARNING_COPY.beaver?.leave);
print(JSON.stringify([...new Set(out)]));
"""


def lesson_lines():
    """Every line the lesson and its intro speak, in order."""
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False) as handle:
        handle.write(EXTRACT % {"root": ROOT})
        path = handle.name
    try:
        lines = json.loads(subprocess.run([JSC, "-m", path], capture_output=True, text=True, check=True).stdout)
    finally:
        os.remove(path)
    hook = open(os.path.join(ROOT, "js/screens/hook-screen.js"), encoding="utf-8").read()
    copy = open(os.path.join(ROOT, "js/data/copy.js"), encoding="utf-8").read()
    intro = re.findall(r"learnFirst: '([^']+)'", hook) + re.findall(r'meetBuilder: \{[^}]*?line: "([^"]+)"', copy, re.S)
    return intro + [line for line in lines if line not in intro]


class Unavailable(Exception):
    """This model is not open to this key (try the next one)."""


class NoAudio(Exception):
    """The model answered without audio (it happens now and then): try the line again."""


SKIP_MODELS = set()          # models found unavailable today: not asked again


def call_first(models, body, key):
    """The first model in `models` that this key may use."""
    last = None
    for model in models:
        if model in SKIP_MODELS:
            continue
        try:
            return call(model, body, key)
        except Unavailable as error:
            last = error
            SKIP_MODELS.add(model)
            print(f"   {model} not available with this key ({error}); trying the next model")
    raise SystemExit(f"no model available with this key: {last}")


def call(model, body, key):
    """One generateContent call, with patient retries on rate limits."""
    data = json.dumps(body).encode()
    for attempt in range(6):
        request = urllib.request.Request(API.format(model=model) + "?key=" + key, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            detail_full = error.read().decode(errors="replace")
            detail = detail_full[:300]
            if error.code in (400, 403, 404) or (error.code == 429 and "limit: 0" in detail):
                raise Unavailable(f"HTTP {error.code}")          # not on this key's plan: the caller tries the next model
            if error.code in (429, 500, 503) and attempt < 5:
                # Wait exactly as long as the API asks (retryDelay), not a growing guess.
                asked = re.search(r'"retryDelay":\s*"([\d.]+)s"', detail_full)
                wait = float(asked.group(1)) + 1 if asked else 8 * (attempt + 1)
                if "PerDay" in detail_full or "per_day" in detail_full.lower():
                    raise Unavailable("daily limit used up")
                print(f"   {model}: HTTP {error.code}, retrying in {wait:.0f}s")
                time.sleep(wait)
                continue
            raise SystemExit(f"{model}: HTTP {error.code}: {detail}")
    raise SystemExit(f"{model}: gave up after retries")


def prepare(text, key):
    reply = call_first(TEXT_MODELS, {"contents": [{"parts": [{"text": PREPARE.format(target=TARGET, text=text)}]}]}, key)
    parts = reply.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts).strip() or text


def speak(text, key):
    body = {"contents": [{"parts": [{"text": text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE}}}}}
    reply = call_first(TTS_MODELS, body, key)
    candidate = (reply.get("candidates") or [{}])[0]
    parts = candidate.get("content", {}).get("parts", [])
    if not parts or "inlineData" not in parts[0]:
        raise NoAudio(candidate.get("finishReason", "no audio"))
    part = parts[0]["inlineData"]
    rate = int(re.search(r"rate=(\d+)", part.get("mimeType", "")).group(1)) if "rate=" in part.get("mimeType", "") else 24000
    return base64.b64decode(part["data"]), rate


def write_clip(pcm, rate, out_path):
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = os.path.join(tmp, "line.wav")
        with wave.open(wav_path, "wb") as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate); wav.writeframes(pcm)
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", wav_path, out_path], check=True)


def seconds_of(path):
    info = subprocess.run(["afinfo", path], capture_output=True, text=True).stdout
    match = re.search(r"estimated duration: ([\d.]+)", info)
    return round(float(match.group(1)), 2) if match else 0.0


def main():
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
            by_line[text] = row
        rows.append(row)
    if "--list" in sys.argv:
        for row in rows:
            have = [ext for ext in ("mp3", "m4a") if os.path.exists(os.path.join(VO_DIR, f"{row['id']}.{ext}"))]
            print(f"{row['id']}  {'/'.join(have) or '-':7s} {row['line']}")
        return
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise SystemExit("Set GEMINI_API_KEY (a key from https://aistudio.google.com/apikey), then run again.")
    redo = "--all" in sys.argv
    try:
        record_all(rows, script, key, redo)
    finally:
        write_map(rows)


def record_all(rows, script, key, redo):
    for row in rows:
        studio = os.path.join(VO_DIR, f"{row['id']}.mp3")
        clip = os.path.join(VO_DIR, f"{row['id']}.m4a")
        if os.path.exists(studio) or (os.path.exists(clip) and not redo):
            continue
        spoken = prepare(row["line"], key)
        audio = None
        # A bare line now and then comes back without audio ("OTHER"); a short speaking instruction in front
        # (not read aloud by the speech model) fixes it.
        for attempt, text in enumerate([spoken, spoken, f"Say clearly: {spoken}", f"Read this aloud for students: {spoken}"]):
            try:
                audio = speak(text, key)
                break
            except NoAudio as error:
                print(f"   {row['id']}: no audio ({error}), trying again")
        if not audio:
            print(f"   {row['id']}: skipped for now (run again to retry): {row['line']}")
            continue
        pcm, rate = audio
        write_clip(pcm, rate, clip)
        row["spoken"] = spoken
        row["seconds"] = seconds_of(clip)
        print(f"recorded {row['id']} ({row['seconds']} s): {row['line']}")
        json.dump(script, open(SCRIPT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)   # progress survives a stop


def write_map(rows):
    """The clip map: every existing entry stays, each lesson line points at its clip (studio .mp3 first)."""
    entries = {}
    if os.path.exists(LINES_JS):
        for m in re.finditer(r'^  ("(?:[^"\\]|\\.)*"): \{ id: "([^"]+)", file: "([^"]+)", seconds: ([\d.]+), speaker: "([^"]+)" \},$', open(LINES_JS, encoding="utf-8").read(), re.M):
            entries[json.loads(m.group(1))] = (m.group(2), m.group(3), float(m.group(4)), m.group(5))
    for row in rows:
        for ext in ("mp3", "m4a"):
            path = os.path.join(VO_DIR, f"{row['id']}.{ext}")
            if os.path.exists(path):
                entries[row["line"]] = (row["id"], f"{row['id']}.{ext}", seconds_of(path), row.get("speaker", "builder"))
                break
    with open(LINES_JS, "w", encoding="utf-8") as handle:
        handle.write("// GENERATED by tools/vo/vo-gemini.py (studio voice: Gemini TTS \"Charon\", Hindi transliteration). Do not edit by hand.\n")
        handle.write("// line as shown (plain text) -> { id, file in assets/audio/vo/, seconds, speaker }\n")
        handle.write("export const VO_LINES = {\n")
        for text, (clip_id, file, secs, speaker) in entries.items():
            handle.write(f"  {json.dumps(text, ensure_ascii=False)}: {{ id: \"{clip_id}\", file: \"{file}\", seconds: {secs}, speaker: \"{speaker}\" }},\n")
        handle.write("};\n")
    print(f"{len(entries)} lines in {os.path.relpath(LINES_JS, ROOT)}; next: python3 tools/vo_word_times.py && python3 tools/build.py")


if __name__ == "__main__":
    main()
