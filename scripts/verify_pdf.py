"""Independent QA for tests/rendering.e2e.mjs outputs, not a runtime dependency.
Requires Pillow/pypdf; --render additionally uses PyMuPDF for local visual QA.
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
latest = json.loads((root / "output/rendering-latest.json").read_text(encoding="utf-8"))
record, folder = latest["record"], Path(latest["directory"])
png = next(a for a in record["artifacts"] if a["kind"] == "full_page_png")
pdf = next(a for a in record["artifacts"] if a["kind"] == "derived_pdf")
# The browser test deliberately tampers with the workspace PNG at its end.
# Its pre-tamper QA copy must independently match the ORIGINAL artifact hash.
reference = folder / "reference-full.png"
assert hashlib.sha256(reference.read_bytes()).hexdigest() == png["sha256"]
pdf_path = folder / "workspace" / pdf["relative_path"]
assert hashlib.sha256(pdf_path.read_bytes()).hexdigest() == pdf["sha256"]
image = Image.open(reference).convert("RGB")
reader = PdfReader(pdf_path)
assert len(reader.pages) == pdf["derivation"]["page_count"]
assert png["sha256"] in reader.metadata.subject
assert record["times"]["capture_started_at"] in reader.metadata.subject
assert record["source"]["final_url"] in reader.metadata.title
rgb = b"".join(page["/Resources"]["/XObject"]["/Im0"].get_object().get_data() for page in reader.pages)
assert rgb == image.tobytes(), "PDF RGB streams differ from source PNG"
assert all(record["capture_id"] in page.extract_text() for page in reader.pages)

boundaries = json.loads((root / "output/rendering-boundaries.json").read_text(encoding="utf-8"))
zoom_artifact = next(a for a in boundaries["zoom"]["artifacts"] if a["kind"] == "full_page_png")
zoom_path = Path(boundaries["directory"]) / "workspace" / zoom_artifact["relative_path"]
assert hashlib.sha256(zoom_path.read_bytes()).hexdigest() == zoom_artifact["sha256"]
zoom_image = Image.open(zoom_path).convert("RGB")
assert zoom_image.height == 3000
for y in range(3000):
    assert zoom_image.getpixel((10, y)) == [(191, 52, 42), (35, 113, 79)][(y // 500) % 2], y

out = root / "output/pdf-0.3"
out.mkdir(exist_ok=True)
(out / "sample.pdf").write_bytes(pdf_path.read_bytes())
image.save(out / "full.png")
result = {"pages": len(reader.pages), "pdf_sha256": pdf["sha256"], "png_sha256": png["sha256"], "rgb_identical": True, "zoom_rows_verified": 3000}
(out / "verification.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
if "--render" in sys.argv:
    import fitz
    doc = fitz.open(pdf_path)
    for index in [0, len(doc) - 1]:
        doc[index].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(out / f"page-{index + 1}.png")
print(json.dumps(result))
