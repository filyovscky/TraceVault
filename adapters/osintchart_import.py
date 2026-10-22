"""In-process adapter for the inspected OSINTchart CaseService (schema 2).

Does not open/write case files, launch a server, or import without caller approval.
Install alongside OSINTchart; call preview(), show its rows, then apply_plan().
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
from uuid import UUID

from osint_notebook.models.types import EntityType, EvidenceMeta, VerificationStatus


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def _uuid(value):
    if str(UUID(value)) != value:
        raise ValueError("Invalid UUID")


def validate_package(package):
    if package.get("schema_version") != 1 or package.get("format") != "tracevault-osintchart":
        raise ValueError("Unsupported TraceVault exchange schema")
    _uuid(package["case"]["case_id"])
    indexes = {}
    for name, key in [("entities", "entity_id"), ("evidence", "capture_id"), ("artifacts", "artifact_id"), ("evidence_refs", "reference_id")]:
        items = package[name]
        if not isinstance(items, list):
            raise ValueError("Expected array: " + name)
        indexes[name] = {}
        for item in items:
            _uuid(item[key])
            if item[key] in indexes[name]:
                raise ValueError("Duplicate ID in " + name)
            indexes[name][item[key]] = item
    for artifact in package["artifacts"]:
        if not re.fullmatch(r"[0-9a-f]{64}", artifact["sha256"]):
            raise ValueError("Invalid SHA-256")
        path = artifact["relative_path"]
        if not isinstance(path, str) or path.startswith("/") or "\\" in path or ":" in path or any(p in ("", ".", "..") for p in path.split("/")):
            raise ValueError("Unsafe artifact path")
    for ref in package["evidence_refs"]:
        if ref["capture_id"] is not None and ref["capture_id"] not in indexes["evidence"]:
            raise ValueError("Unknown Capture")
        if ref["artifact_id"] is not None:
            artifact = indexes["artifacts"].get(ref["artifact_id"])
            if artifact is None or artifact["capture_id"] != ref["capture_id"]:
                raise ValueError("Artifact/Capture mismatch")
        if ref["status"] == "archived" and (ref["capture_id"] is None or ref["artifact_id"] is None):
            raise ValueError("Archived reference lacks an artifact")
    for entity in package["entities"]:
        EntityType(entity["entity_type"])
        if not entity["label"].strip():
            raise ValueError("Empty Entity label")
        if any(ref not in indexes["evidence_refs"] for ref in entity["evidence_refs"]):
            raise ValueError("Unknown EvidenceReference")
    if package.get("relations"):
        raise ValueError("Relations require a reviewed semantic mapping")
    return indexes


def preview(service, package):
    validate_package(package)
    source_case = package["case"]["case_id"]
    registry = service.case.attributes.get("tracevault", {})
    rows = []
    lookup = {}
    for entity in service.case.entities.values():
        source = entity.attributes.get("tracevault", {})
        if source.get("case_id") == source_case:
            key = source.get("entity_id")
            if key in lookup:
                raise ValueError("Multiple target entities share a TraceVault identity")
            lookup[key] = entity
    for entity in package["entities"]:
        target = lookup.get(entity["entity_id"])
        old = target.attributes.get("tracevault", {}) if target else {}
        if target is None:
            action = "create"
        elif target.label != old.get("imported_label") or str(target.entity_type) != entity["entity_type"] or old.get("payload_digest") != _digest(entity):
            # New references alone may be appended; changed labels/types need resolution.
            old_payload = old.get("payload", {})
            baseline = {k: v for k, v in old_payload.items() if k not in ("evidence_refs", "updated_at")}
            incoming = {k: v for k, v in entity.items() if k not in ("evidence_refs", "updated_at")}
            action = "update" if target.label == old.get("imported_label") and str(target.entity_type) == entity["entity_type"] and baseline == incoming else "conflict"
        elif any(ref not in target.meta.evidence_refs for ref in entity["evidence_refs"]):
            action = "update"
        else:
            action = "skip"
        rows.append({"source_id": entity["entity_id"], "target_id": target.id if target else None, "label": entity["label"], "action": action})
    # An old Capture/Artifact/Reference may not be silently rewritten by a new package.
    for name, key in [("evidence", "capture_id"), ("artifacts", "artifact_id"), ("evidence_refs", "reference_id")]:
        for item in package[name]:
            old = registry.get(source_case, {}).get(name, {}).get(item[key])
            if old is not None and old != item:
                rows.append({"source_id": item[key], "target_id": None, "label": name, "action": "conflict"})
    return {"package_digest": _digest(package), "target_digest": _digest(service.case.model_dump(mode="json")), "rows": rows, "counts": {action: sum(row["action"] == action for row in rows) for action in ("create", "update", "conflict", "skip")}}


def apply_plan(service, package, plan, *, confirmed=False):
    if not confirmed:
        raise ValueError("Caller must show and explicitly confirm the import preview")
    if preview(service, package) != plan:
        raise ValueError("Preview is stale; regenerate and confirm")
    if plan["counts"]["conflict"]:
        raise ValueError("Resolve conflicts before importing")
    indexes = validate_package(package)
    snapshot = copy.deepcopy(service.case)
    source_case = package["case"]["case_id"]
    try:
        for row in plan["rows"]:
            if row["action"] == "skip":
                continue
            data = indexes["entities"][row["source_id"]]
            refs = [indexes["evidence_refs"][ref] for ref in data["evidence_refs"]]
            target = service.case.entities.get(row["target_id"]) if row["target_id"] else None
            attributes = copy.deepcopy(target.attributes) if target else {}
            attributes["tracevault"] = {"case_id": source_case, "entity_id": data["entity_id"], "imported_label": data["label"], "payload_digest": _digest(data), "payload": copy.deepcopy(data), "confidence_unassessed": data["confidence"] is None}
            hashes = {ref["artifact_id"]: indexes["artifacts"][ref["artifact_id"]]["sha256"] for ref in refs if ref["artifact_id"]}
            attributes["tracevault_integrity"] = {**attributes.get("tracevault_integrity", {}), **hashes}
            if target is None:
                target = service.add_entity(data["label"], EntityType(data["entity_type"]), attributes=attributes)
                # Keep the service-generated UUID; external identity lives in attributes.
                attributes["tracevault"]["imported_label"] = target.label
                first = refs[0] if refs else {}
                meta = EvidenceMeta(source="TraceVault", source_type="webpage", source_url=first.get("source_url") or "", acquired_at=first.get("observed_at") or data["created_at"], collector="TraceVault", evidence_refs=list(data["evidence_refs"]), verification=VerificationStatus.UNCONFIRMED, confidence=0.5, integrity_hashes={"sha256": next(iter(hashes.values()))} if len(set(hashes.values())) == 1 else {})
            else:
                meta = target.meta.model_copy(deep=True)
                meta.evidence_refs = list(dict.fromkeys(meta.evidence_refs + data["evidence_refs"]))
            service.update_entity(target.id, attributes=attributes, meta=meta)
        registry = copy.deepcopy(service.case.attributes.get("tracevault", {}))
        record = registry.setdefault(source_case, {})
        for name, key in [("evidence", "capture_id"), ("artifacts", "artifact_id"), ("evidence_refs", "reference_id")]:
            record.setdefault(name, {}).update({item[key]: copy.deepcopy(item) for item in package[name]})
        service.case.attributes["tracevault"] = registry
        if plan["counts"]["create"] or plan["counts"]["update"]:
            service.case.add_audit_event("tracevault_imported", source_case_id=source_case, package_digest=plan["package_digest"], counts=plan["counts"])
    except Exception:
        service.set_case(snapshot)
        raise
    return plan["counts"]
