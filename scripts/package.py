"""Deterministic, dependency-free packaging of the verified dist directory."""
import hashlib
import json
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "dist" / "manifest.json").read_text(encoding="utf-8"))["version"]
out = root / "releases"
out.mkdir(exist_ok=True)
target = out / f"TraceVault-{version}.zip"
with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for source in sorted((root / "dist").rglob("*")):
        if source.is_file():
            info = zipfile.ZipInfo(source.relative_to(root / "dist").as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, source.read_bytes())
digest = hashlib.sha256(target.read_bytes()).hexdigest()
(out / (target.name + ".sha256")).write_text(digest + "  " + target.name + "\n", encoding="ascii")
print(target)
print("SHA-256:", digest)
