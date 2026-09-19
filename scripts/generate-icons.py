#!/usr/bin/env python3
"""Generate SpireCode platform icons from the Code Spire geometry."""

from __future__ import annotations

import math
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
CYAN_TOP = (53, 226, 242, 255)
CYAN_BOTTOM = (22, 166, 193, 255)
GOLD_TOP = (255, 216, 102, 255)
GOLD_BOTTOM = (243, 154, 30, 255)
INK = (11, 23, 28, 255)


def scaled(value: float) -> int:
    return round(value * SCALE)


def vertical_gradient(top: tuple[int, ...], bottom: tuple[int, ...]) -> Image.Image:
    height = scaled(CANVAS)
    strip = Image.new("RGBA", (1, height))
    pixels = strip.load()
    for y in range(height):
        ratio = y / max(height - 1, 1)
        pixels[0, y] = tuple(
            round(top[channel] * (1 - ratio) + bottom[channel] * ratio)
            for channel in range(4)
        )
    return strip.resize((height, height))


def polygon_layer(points: list[tuple[int, int]], gradient: Image.Image) -> Image.Image:
    mask = Image.new("L", gradient.size, 0)
    ImageDraw.Draw(mask).polygon(
        [(scaled(x), scaled(y)) for x, y in points], fill=255
    )
    layer = Image.new("RGBA", gradient.size)
    layer.paste(gradient, mask=mask)
    return layer


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
        x = (
            inverse**3 * start[0]
            + 3 * inverse**2 * t * control_one[0]
            + 3 * inverse * t**2 * control_two[0]
            + t**3 * end[0]
        )
        y = (
            inverse**3 * start[1]
            + 3 * inverse**2 * t * control_one[1]
            + 3 * inverse * t**2 * control_two[1]
            + t**3 * end[1]
        )
        points.append((scaled(x), scaled(y)))
    return points


def render_master() -> Image.Image:
    size = scaled(CANVAS)
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (scaled(76), scaled(75), scaled(948), scaled(957)),
        radius=scaled(218),
        fill=(0, 0, 0, 120),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(scaled(28)))
    image.alpha_composite(shadow)

    tile_mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(tile_mask).rounded_rectangle(
        (scaled(70), scaled(58), scaled(954), scaled(942)),
        radius=scaled(218),
        fill=255,
    )
    background = vertical_gradient(BACKGROUND_TOP, BACKGROUND_BOTTOM)
    tile = Image.new("RGBA", image.size)
    tile.paste(background, mask=tile_mask)
    image.alpha_composite(tile)

    cyan_points = [(492, 168), (218, 378), (218, 670), (492, 860), (492, 704), (354, 610), (354, 448), (492, 344)]
    gold_points = [(532, 168), (806, 378), (806, 670), (532, 860), (532, 704), (670, 610), (670, 448), (532, 344)]
    image.alpha_composite(polygon_layer(cyan_points, vertical_gradient(CYAN_TOP, CYAN_BOTTOM)))
    image.alpha_composite(polygon_layer(gold_points, vertical_gradient(GOLD_TOP, GOLD_BOTTOM)))

    draw = ImageDraw.Draw(image)
    s_curve = cubic_bezier((669, 331), (590, 276), (390, 291), (382, 421))
    s_curve += cubic_bezier((382, 421), (374, 547), (658, 498), (651, 637))[1:]
    s_curve += cubic_bezier((651, 637), (645, 753), (477, 776), (350, 701))[1:]
    draw.line(
        s_curve,
        fill=INK,
        width=scaled(92),
        joint="curve",
    )
    radius = scaled(46)
    for point in (s_curve[0], s_curve[-1]):
        draw.ellipse(
            (point[0] - radius, point[1] - radius, point[0] + radius, point[1] + radius),
            fill=INK,
        )

    draw.rounded_rectangle(
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
    png_sizes = (16, 32, 48, 64, 128, 256, 512)
    for size in png_sizes:
        save_png(master, size, LINUX_ICONS / f"{size}x{size}.png")
    master.save(
        ASSETS / "icon.ico",
        format="ICO",
        sizes=[(size, size) for size in (16, 24, 32, 48, 64, 128, 256)],
    )
    generate_icns(master)
    print("Generated SpireCode icons from Code Spire geometry")


if __name__ == "__main__":
    main()
