# Direct highlight actions — 0.4.1

- Highlight selection saves immediately with an empty optional note. The context-menu, shortcut, source toolbar and panel action share this behavior. Notes/quotes/entities retain their editors.
- Right-click hit testing uses current CSS Highlight ranges and pointer coordinates, not inserted spans or source text changes. Pin annotation ID, case ID and source URL into the durable command. Delete/edit only that record, with fresh disk-state validation.
- Add English context actions “Delete highlight here” and “Edit highlight note”. If no visible TraceVault highlight is under the pointer, show an actual error rather than claiming deletion. Do not depend on asynchronous dynamic native-menu visibility.
- Deletion is a reversible journal update, followed by annotation broadcast. Keep panel Undo available. Report on-page success only after verified disk writes. Optional note editing uses the existing immutable-reference editor.
- Record successful command completion so duplicate deliveries of an automatic action do not create another highlight or report a completed action as interrupted.
- Test the same exported context-command handler used by Chrome, real right-click hit testing, actual files, empty notes, optional edit, deletion/undo, no-hit refusal, source text/original-file invariance and duplicate command delivery. Native menu popup selection remains a manual UI boundary.
