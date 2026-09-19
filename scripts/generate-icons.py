#!/usr/bin/env python3
"""Generate SpireCode platform icons from the simplified single-S geometry."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
LINUX_ICONS = ASSETS / "icons"
SCALE = 4
CANVAS = 1024

BACKGROUND_TOP = (18, 37, 42, 255)
BACKGROUND_BOTTOM = (8, 18, 23, 255)
CYAN = (53, 226, 242, 255)
CYAN_MID = (32, 191, 210, 255)
GOLD = (255, 209, 102, 255)


def scaled(value: float) -> int:
    return round(value * SCALE)


def vertical_gradient(stops: list[tuple[float, tuple[int, ...]]]) -> Image.Image:
    height = scaled(CANVAS)
    strip = Image.new("RGBA", (1, height))
    pixels = strip.load()
    for y in range(height):
        position = y / max(height - 1, 1)
        left_offset, left_color = stops[0]
        right_offset, right_color = stops[-1]
        for index in range(len(stops) - 1):
            if stops[index][0] <= position <= stops[index + 1][0]:
                left_offset, left_color = stops[index]
                right_offset, right_color = stops[index + 1]
                break
        ratio = (position - left_offset) / max(right_offset - left_offset, 1e-9)
        pixels[0, y] = tuple(
            round(left_color[channel] * (1 - ratio) + right_color[channel] * ratio)
            for channel in range(4)
        )
    return strip.resize((height, height))


def cubic_bezier(
    start: tuple[float, float],
    control_one: tuple[float, float],
    control_two: tuple[float, float],
    end: tuple[float, float],
    steps: int = 120,
) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    for index in range(steps + 1):
        t = index / steps
        inverse = 1 - t
        x = inverse**3 * start[0] + 3 * inverse**2 * t * control_one[0] + 3 * inverse * t**2 * control_two[0] + t**3 * end[0]
        y = inverse**3 * start[1] + 3 * inverse**2 * t * control_one[1] + 3 * inverse * t**2 * control_two[1] + t**3 * end[1]
        points.append((scaled(x), scaled(y)))
    return points


def render_master() -> Image.Image:
    size = scaled(CANVAS)
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (scaled(76), scaled(75), scaled(948), scaled(957)),
        radius=scaled(218),
        fill=(0, 0, 0, 120),
    )
    image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(scaled(28))))

    tile_mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(tile_mask).rounded_rectangle(
        (scaled(70), scaled(58), scaled(954), scaled(942)),
        radius=scaled(218),
        fill=255,
    )
    background = vertical_gradient([(0, BACKGROUND_TOP), (1, BACKGROUND_BOTTOM)])
    tile = Image.new("RGBA", image.size)
    tile.paste(background, mask=tile_mask)
    image.alpha_composite(tile)

    curve = cubic_bezier((673, 267), (591, 202), (363, 225), (351, 402))
    curve += cubic_bezier((351, 402), (340, 559), (675, 496), (665, 657))[1:]
    curve += cubic_bezier((665, 657), (655, 817), (423, 837), (320, 731))[1:]
    mark_mask = Image.new("L", image.size, 0)
    mark_draw = ImageDraw.Draw(mark_mask)
    mark_draw.line(curve, fill=255, width=scaled(126), joint="curve")
    radius = scaled(63)
    for point in (curve[0], curve[-1]):
        mark_draw.ellipse(
            (point[0] - radius, point[1] - radius, point[0] + radius, point[1] + radius),
            fill=255,
        )
    mark_gradient = vertical_gradient([(0, CYAN), (0.48, CYAN_MID), (1, GOLD)])
    mark = Image.new("RGBA", image.size)
    mark.paste(mark_gradient, mask=mark_mask)
    image.alpha_composite(mark)

    ImageDraw.Draw(image).rounded_rectangle(
        (scaled(72), scaled(60), scaled(952), scaled(940)),
        radius=scaled(216),
        outline=(255, 255, 255, 32),
        width=scaled(4),
    )
    return image.resize((CANVAS, CANVAS), Image.Resampling.LANCZOS)


def save_png(master: Image.Image, size: int, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    master.resize((size, size), Image.Resampling.LANCZOS).save(path, optimize=True)


def generate_icns(master: Image.Image) -> None:
    iconutil = shutil.which("iconutil")
    if not iconutil:
        raise RuntimeError("iconutil is required to generate assets/icon.icns")
    with tempfile.TemporaryDirectory(prefix="spirecode-icon-") as directory:
        iconset = Path(directory) / "SpireCode.iconset"
        iconset.mkdir()
        contracts = {
            "icon_16x16.png": 16,
            "icon_16x16@2x.png": 32,
            "icon_32x32.png": 32,
            "icon_32x32@2x.png": 64,
            "icon_128x128.png": 128,
            "icon_128x128@2x.png": 256,
            "icon_256x256.png": 256,
            "icon_256x256@2x.png": 512,
            "icon_512x512.png": 512,
            "icon_512x512@2x.png": 1024,
        }
        for name, size in contracts.items():
            save_png(master, size, iconset / name)
        subprocess.run(
            [iconutil, "-c", "icns", str(iconset), "-o", str(ASSETS / "icon.icns")],
            check=True,
        )


def main() -> None:
    master = render_master()
    for size in (16, 32, 48, 64, 128, 256, 512):
        save_png(master, size, LINUX_ICONS / f"{size}x{size}.png")
    master.save(
        ASSETS / "icon.ico",
        format="ICO",
        sizes=[(size, size) for size in (16, 24, 32, 48, 64, 128, 256)],
    )
    generate_icns(master)
    print("Generated simplified SpireCode single-S icons")


if __name__ == "__main__":
    main()
