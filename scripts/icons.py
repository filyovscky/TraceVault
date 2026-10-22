"""Generate the original TraceVault icon; Pillow is build-time only."""
from pathlib import Path
from PIL import Image, ImageDraw

folder = Path(__file__).resolve().parents[1] / "extension" / "icons"
folder.mkdir(exist_ok=True)
for size in (16, 32, 48, 128):
    scale = size * 4
    image = Image.new("RGBA", (scale, scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    def box(values):
        return tuple(round(v * scale / 32) for v in values)
    draw.rounded_rectangle(box((2, 2, 30, 30)), radius=round(scale / 8), fill="#262626")
    draw.rectangle(box((7, 7, 25, 25)), outline="#a88bfa", width=max(1, round(scale / 16)))
    draw.line(box((12, 11, 20, 11)), fill="#dadada", width=max(1, round(scale / 20)))
    draw.ellipse(box((13, 14, 19, 20)), outline="#a88bfa", width=max(1, round(scale / 24)))
    draw.line(box((16, 20, 16, 23)), fill="#a88bfa", width=max(1, round(scale / 20)))
    image.resize((size, size), Image.Resampling.LANCZOS).save(folder / f"{size}.png")
