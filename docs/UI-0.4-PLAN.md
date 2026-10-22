# TraceVault 0.4 UI plan

User request: English throughout, recognizable icon actions with English hover descriptions, consistent alignment and settings that are easy to locate.

- Preserve the neutral/violet palette, flat surfaces and compact Chrome Side Panel. No external fonts or icon dependencies.
- Header: brand and three fixed actions (commands, workspace, settings). Workspace/case, current page, capture and annotation tools, collection follow one vertical alignment.
- Use one original SVG stroke icon set, 36 px controls and an 8 px spacing scale. Capture and annotation tools each occupy four equal columns. Collection tabs use icons and the active section's readable heading. Content titles and command-search results remain readable text.
- Every icon button has an English accessible name and description, shown on hover and keyboard focus. Tooltips are clamped to the panel viewport; icons are hidden from assistive technology. Preserve keyboard activation and visible focus.
- Settings become a dedicated dialog with clearly labelled Appearance, Capture, Annotations, Keyboard shortcuts and Storage groups. Keep the original preference IDs and saved values. Do not change evidence, annotation or storage schemas.
- Translate visible strings, errors/progress, context menus, command descriptions and newly generated citation labels. Preserve source titles, quotes, notes, saved originals and historical journal data in their original language.
- Verify real saves, annotation/edit/undo, exports, settings persistence, navigation and permissions. Audit light/dark at 320/360/420/520 px and DPR 1/1.25/1.5/2, real Side Panel and hover/focus tooltips. Record actual results and remaining limits, package, commit and push.
