/**
 * Clicking a gizmo handle without moving the mouse looks to the viewport like a click on empty
 * space, which would clear the selection. We remember when the gizmo was last used and ignore
 * "clicked empty space" for a moment afterwards.
 */
const IGNORE_EMPTY_CLICK_MS = 300;

let lastUsed = 0;

export function markGizmoUsed(): void {
  lastUsed = performance.now();
}

export function gizmoUsedRecently(): boolean {
  return performance.now() - lastUsed < IGNORE_EMPTY_CLICK_MS;
}
