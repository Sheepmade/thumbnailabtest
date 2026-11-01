#!/usr/bin/env python3
"""Generate 20 placeholder 1280x720 thumbnails (10 pairs x AI/human variants).

Replace files in thumbnails/ with your real AI-generated and hand-photoshopped
images, keeping the same filenames referenced in data/pairs.js.
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "thumbnails")
W, H = 1280, 720

PAIRS = [
    ("p01", "I Tried It For 30 Days", "bg1"),
    ("p02", "The $5 vs $5000 Setup", "bg2"),
    ("p03", "Why Nobody Talks About This", "bg3"),
    ("p04", "I Cooked Like a Pro Chef", "bg4"),
    ("p05", "The Truth About Sleep", "bg5"),
    ("p06", "I Built a PC in 2025", "bg6"),
    ("p07", "Ranking Every Energy Drink", "bg7"),
    ("p08", "How I Saved $10,000", "bg8"),
    ("p09", "This Changed Everything", "bg9"),
    ("p10", "Reacting to Your Comments", "bg10"),
]

PALETTES = {
    "bg1": ((200, 30, 40), (30, 30, 60)),
    "bg2": ((20, 120, 200), (10, 40, 80)),
    "bg3": ((180, 120, 20), (60, 40, 10)),
    "bg4": ((30, 160, 90), (10, 50, 30)),
    "bg5": ((120, 60, 180), (40, 20, 70)),
    "bg6": ((220, 80, 160), (70, 20, 50)),
    "bg7": ((0, 150, 170), (0, 50, 60)),
    "bg8": ((90, 160, 40), (30, 50, 10)),
    "bg9": ((230, 120, 0), (80, 40, 0)),
    "bg10": ((60, 90, 220), (20, 30, 80)),
}


def font(size):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def make(path, title, c1, c2, tag):
    img = Image.new("RGB", (W, H), c2)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(c1[i] * t + c2[i] * (1 - t)) for i in range(3)))
    d.rectangle([0, 0, W, 14], fill=(255, 210, 0))
    d.rectangle([0, H - 14, W, H], fill=(255, 210, 0))
    f_big = font(84)
    words = title.split()
    lines, cur = [], ""
    for w in words:
        if d.textlength(cur + " " + w, font=f_big) < W - 160:
            cur = (cur + " " + w).strip()
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    total_h = len(lines) * 100
    y = (H - total_h) // 2
    for line in lines:
        lw = d.textlength(line, font=f_big)
        d.text(((W - lw) / 2 + 4, y + 4), line, font=f_big, fill=(0, 0, 0))
        d.text(((W - lw) / 2, y), line, font=f_big, fill=(255, 255, 255))
        y += 100
    f_small = font(44)
    d.text((40, H - 80), tag, font=f_small, fill=(255, 255, 0))
    img.save(path, quality=88)


def main():
    os.makedirs(OUT, exist_ok=True)
    for pid, title, bg in PAIRS:
        c1, c2 = PALETTES[bg]
        make(os.path.join(OUT, f"{pid}_ai.jpg"), title, c1, c2, f"{pid} AI (placeholder)")
        make(os.path.join(OUT, f"{pid}_human.jpg"), title, c2, c1, f"{pid} HUMAN (placeholder)")
    print("wrote 20 thumbnails to", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
