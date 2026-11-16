"""Compresses the game's media in place, at visually lossless quality.

  python3 tools/media.py            convert every PNG under assets/images and every narration clip without an Ogg

Images
  - every PNG becomes WebP and the PNG is removed;
  - small, crisp parts (lossless costs at most LOSSLESS_MAX_KB) and repeating tiles stay lossless: every pixel kept;
  - larger paintings are WebP quality 90 with full-quality alpha (they are drawn well below their source size);
  - opaque backdrops in AVIF_TOO also get an AVIF (quality 80, 4:4:4 chroma), served first where supported.
Narration
  - each clip in assets/audio/vo (AAC .m4a or MP3) gets an Ogg Opus twin (40 kbps mono, transparent for
    speech). The original stays as the fallback for browsers without Opus; js/data/vo-lines.js lists both.

New art from Figma: drop the PNG in its folder, run this script, reference the .webp.
Needs Pillow with WebP + AVIF (pip3 install pillow) and macOS afconvert (it encodes the Opus; this script
packs it into Ogg).
"""
import os
import re
import struct
import subprocess
import sys
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
IMAGES = os.path.join(ROOT, "assets", "images")
VO_DIR = os.path.join(ROOT, "assets", "audio", "vo")
VO_LINES = os.path.join(ROOT, "js", "data", "vo-lines.js")

WEBP_QUALITY = 90
AVIF_QUALITY = 80
LOSSLESS_MAX_KB = 64
OPUS_BITRATE = 40000
# Drawn as repeating backgrounds: lossless, so the tiles meet without seams.
LOSSLESS = {"bridge/deck-tile.png", "crane/cable-tile.png", "crane/jib-tile.png", "crane/tower-mast.png"}
# Large opaque paintings: an AVIF is offered first (much smaller), the WebP is the fallback.
AVIF_TOO = {"background/canal.png"}


def kb(path):
    return os.path.getsize(path) / 1024


def to_webp(png):
    """PNG -> WebP next to it (lossless for tiles and small parts); returns the WebP path."""
    from PIL import Image

    rel = os.path.relpath(png, IMAGES)
    target = os.path.splitext(png)[0] + ".webp"
    with Image.open(png) as image:
        image.load()
        # Lossless WebP is rarely under half the PNG, so big PNGs skip straight to the lossy encode.
        lossless = rel in LOSSLESS or kb(png) <= 2 * LOSSLESS_MAX_KB
        if lossless:
            image.save(target, "WEBP", lossless=True, quality=100, method=6, exact=rel in LOSSLESS)
        if not lossless or (rel not in LOSSLESS and kb(target) > LOSSLESS_MAX_KB):
            image.save(target, "WEBP", quality=WEBP_QUALITY, alpha_quality=100, method=6)
        if rel in AVIF_TOO:
            image.save(os.path.splitext(png)[0] + ".avif", "AVIF", quality=AVIF_QUALITY, speed=4, subsampling="4:4:4")
    return target


def convert_images():
    before = after = 0
    for folder, _, files in os.walk(IMAGES):
        for name in sorted(files):
            if not name.endswith(".png"):
                continue
            png = os.path.join(folder, name)
            size = kb(png)
            webp = to_webp(png)
            avif = os.path.splitext(png)[0] + ".avif"
            before += size
            after += kb(webp)
            extra = f", AVIF {kb(avif):.0f} KB" if os.path.exists(avif) else ""
            print(f"  {os.path.relpath(png, ROOT)}: {size:.0f} KB -> WebP {kb(webp):.0f} KB{extra}")
            os.remove(png)
    if before:
        print(f"images: {before / 1024:.1f} MB -> {after / 1024:.1f} MB")


# ---------- Ogg Opus (RFC 7845): afconvert writes Opus into CAF only; the packets are moved into Ogg pages ----------

def _ogg_crc(data):
    crc = 0
    for byte in data:
        crc ^= byte << 24
        for _ in range(8):
            crc = ((crc << 1) ^ 0x04C11DB7) & 0xFFFFFFFF if crc & 0x80000000 else (crc << 1) & 0xFFFFFFFF
    return crc


def _ogg_page(packets, granule, serial, sequence, flags):
    lacing = b""
    for packet in packets:
        lacing += bytes([255] * (len(packet) // 255) + [len(packet) % 255])
    header = struct.pack("<4sBBqIII", b"OggS", 0, flags, granule, serial, sequence, 0) + bytes([len(lacing)]) + lacing
    page = bytearray(header + b"".join(packets))
    struct.pack_into("<I", page, 22, _ogg_crc(page))
    return bytes(page)


def _read_varint(data, offset):
    value = 0
    while True:
        byte = data[offset]
        offset += 1
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            return value, offset


def to_ogg(clip):
    """AAC / MP3 clip -> Ogg Opus next to it; returns the Ogg path."""
    target = os.path.splitext(clip)[0] + ".ogg"
    pcm, caf = target + ".tmp.caf", target + ".opus.caf"
    try:
        subprocess.run(["afconvert", clip, pcm, "-f", "caff", "-d", "LEF32@48000"], check=True, capture_output=True)
        subprocess.run(["afconvert", pcm, caf, "-f", "caff", "-d", "opus", "-b", str(OPUS_BITRATE)], check=True, capture_output=True)
        with open(caf, "rb") as handle:
            data = handle.read()
    finally:
        for temp in (pcm, caf):
            if os.path.exists(temp):
                os.remove(temp)
    chunks, offset = {}, 8
    while offset < len(data):
        kind, length = data[offset:offset + 4], struct.unpack(">q", data[offset + 4:offset + 12])[0]
        body = data[offset + 12: len(data) if length == -1 else offset + 12 + length]
        chunks[kind] = body
        offset += 12 + len(body)
    _, format_id, _, _, frames_per_packet, channels, _ = struct.unpack(">d4sIIIII", chunks[b"desc"])
    if format_id != b"opus":
        raise SystemExit(f"{clip}: expected Opus from afconvert, got {format_id}")
    packet_count, valid_frames, priming, _ = struct.unpack(">qqii", chunks[b"pakt"][:24])
    sizes, cursor = [], 24
    for _ in range(packet_count):
        packet_size, cursor = _read_varint(chunks[b"pakt"], cursor)
        sizes.append(packet_size)
    audio, cursor, packets = chunks[b"data"][4:], 0, []
    for packet_size in sizes:
        packets.append(audio[cursor:cursor + packet_size])
        cursor += packet_size
    pre_skip = priming or 312
    serial = zlib.crc32(os.path.basename(clip).encode())
    head = b"OpusHead" + struct.pack("<BBHIhB", 1, channels, pre_skip, 48000, 0, 0)
    vendor = b"bridge-builder media"
    tags = b"OpusTags" + struct.pack("<I", len(vendor)) + vendor + struct.pack("<I", 0)
    pages = [_ogg_page([head], 0, serial, 0, 0x02), _ogg_page([tags], 0, serial, 1, 0)]
    granule, sequence, final_granule = pre_skip, 2, pre_skip + valid_frames
    for start in range(0, len(packets), 50):  # about a second of audio per page
        group = packets[start:start + 50]
        granule += frames_per_packet * len(group)
        last = start + 50 >= len(packets)
        pages.append(_ogg_page(group, final_granule if last else granule, serial, sequence, 0x04 if last else 0))
        sequence += 1
    with open(target, "wb") as handle:
        handle.write(b"".join(pages))
    return target


def convert_clips():
    made = 0
    for name in sorted(os.listdir(VO_DIR)):
        stem, ext = os.path.splitext(name)
        if ext not in (".m4a", ".mp3") or os.path.exists(os.path.join(VO_DIR, stem + ".ogg")):
            continue
        clip = os.path.join(VO_DIR, name)
        ogg = to_ogg(clip)
        made += 1
        print(f"  {os.path.relpath(clip, ROOT)}: {kb(clip):.0f} KB -> Ogg {kb(ogg):.0f} KB")
    if made:
        print(f"narration: {made} Ogg clip(s)")
    link_oggs()


def link_oggs():
    """Adds `ogg: "voNNN.ogg"` to every entry of js/data/vo-lines.js whose Ogg exists."""
    if not os.path.exists(VO_LINES):
        return
    text = open(VO_LINES, encoding="utf-8").read()

    def add(match):
        entry = match.group(0)
        clip_id = match.group(1)
        if "ogg:" in entry or not os.path.exists(os.path.join(VO_DIR, f"{clip_id}.ogg")):
            return entry
        return entry.replace(", seconds:", f', ogg: "{clip_id}.ogg", seconds:')

    updated = re.sub(r'\{ id: "(vo\d+)", file: "[^"]+", seconds: [^}]*\}', add, text)
    if updated != text:
        open(VO_LINES, "w", encoding="utf-8").write(updated)
        print(f"  {os.path.relpath(VO_LINES, ROOT)}: Ogg twins linked")


if __name__ == "__main__":
    if sys.platform != "darwin":
        print("note: the Ogg step needs macOS afconvert")
    convert_images()
    convert_clips()
