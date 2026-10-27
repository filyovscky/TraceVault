# OSINTchart integration — development prototype

This integration is outside the released feature set. The extension does not send data to OSINTchart or install an importer in it. This directory is excluded from the extension ZIP.

- [Adapter prototype](osintchart_import.py): in-process preview, confirmation, repeat-import and conflict handling against the previously inspected CaseService.
- [Contract research](COMPATIBILITY.md): reference source revision, model mapping and implementation boundaries.
- [Historical test results](HISTORICAL-TESTS.md): prior service-level checks, separate from release acceptance.
- [Prototype tests](test_adapter.py): require a real compatible source checkout; no GUI or native bridge coverage.

To run the prototype tests from the repository root:

```powershell
python development/osintchart/test_adapter.py PATH_TO_OSINTCHART_CHECKOUT
```

Before resuming work, inspect the target application's current source and licenses, revalidate mappings, and test preview, explicit confirmation, idempotency and conflicts against its actual service. An installed integration and end-to-end user workflow remain unimplemented.

## Existing export compatibility

Released case exports remain available as TraceVault JSON. Their existing schema filename/ID (`schemas/OSINTchartExport.schema.json`) and `format: tracevault-osintchart` value are retained as legacy machine identifiers so older consumers and files continue to validate. They do not mean that an integration is installed or supported. New export filenames use `__tracevault-export.json`; existing files are not renamed or rewritten.
