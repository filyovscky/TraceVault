"""TraceVault original flat T/V archive mark. Pillow is build-time only."""
from pathlib import Path
from PIL import Image, ImageDraw
folder = Path(__file__).resolve().parents[1] / 'extension' / 'icons'
folder.mkdir(exist_ok=True)
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<title>TraceVault — T/V archive mark</title>
<path fill="#7054c8" d="M2 2H24L30 8V30H2Z"/>
<path fill="none" stroke="#fff" stroke-width="3" stroke-linecap="butt" stroke-linejoin="round" d="M9 10H23M16 10V17M9 17L16 25L23 17"/>
</svg>
'''
(folder / 'mark.svg').write_text(svg, encoding='utf-8')
for size in (16, 32, 48, 128):
    scale = size * 4
    image = Image.new('RGBA', (scale, scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    def pts(values):
        return [(round(x * scale / 32), round(y * scale / 32)) for x, y in values]
    draw.polygon(pts([(2, 2), (24, 2), (30, 8), (30, 30), (2, 30)]), fill='#7054c8')
    for line in [[(9, 10), (23, 10)], [(16, 10), (16, 17)], [(9, 17), (16, 25), (23, 17)]]:
        draw.line(pts(line), fill='#ffffff', width=round(3 * scale / 32), joint='curve')
    image.resize((size, size), Image.Resampling.LANCZOS).save(folder / f'{size}.png')
