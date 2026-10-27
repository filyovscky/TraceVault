"""Independent PNG/PDF QA of real compact.e2e outputs; no runtime dependency."""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
results = []
for browser in ("cft", "installed"):
    data = json.loads((root / f"output/playwright/compact-{browser}.json").read_text())
    directory = Path(data["directory"])
    old, compact = [item["record"] for item in data["captures"]]
    source = compact["artifacts"][0]
    a = Image.open(directory / old["artifacts"][0]["relative_path"]).convert("RGB")
    b = Image.open(directory / source["relative_path"]).convert("RGB")
    assert a.size == b.size and a.tobytes() == b.tobytes()
    for capture in (old, compact):
        for artifact in capture["artifacts"]:
            content = (directory / artifact["relative_path"]).read_bytes()
            assert len(content) == artifact["byte_length"]
            assert hashlib.sha256(content).hexdigest() == artifact["sha256"]
    events = [json.loads(p.read_text()) for p in (directory / "cases" / compact["case_id"] / "events").glob("*.json")]
    saved = next(e["value"] for e in events if e["action"] == "pdf_created" and e["value"]["capture_id"] == compact["capture_id"])
    pdf = next(item for item in saved["artifacts"] if item["kind"] == "derived_pdf")
    pdf_path = directory / pdf["relative_path"]
    assert hashlib.sha256(pdf_path.read_bytes()).hexdigest() == pdf["sha256"]
    reader = PdfReader(pdf_path)
    rgb = b"".join(page["/Resources"]["/XObject"]["/Im0"].get_object().get_data() for page in reader.pages)
    assert rgb == b.tobytes(), "PDF predictor streams changed source pixels"
    assert source["sha256"] in reader.metadata.subject
    assert pdf["derivation"]["source_sha256"] == source["sha256"]
    result = {"browser": browser, "pixel_width": b.width, "pixel_height": b.height, "png_pixels_equal": True, "pdf_rgb_identical": True, "pages": len(reader.pages), "png_sha256": source["sha256"], "pdf_sha256": pdf["sha256"], "pdf_bytes": pdf["byte_length"]}
    results.append(result)
    if "--render" in sys.argv:
        import fitz
        document = fitz.open(pdf_path)
        for index in (0, len(document) - 1):
            document[index].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(root / f"docs/qa/0.5.1-compact-pdf-{browser}-{index + 1}.png")
target = root / "docs/qa/0.5.1-independent-pixels.json"
target.write_text(json.dumps(results, indent=2), encoding="utf-8")
print(json.dumps(results))
