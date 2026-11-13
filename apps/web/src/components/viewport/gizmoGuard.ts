/**
 * Some pointer actions end with a browser "click" that must not select or deselect anything:
 *
 * - Clicking a gizmo handle without moving looks to the viewport like a click on empty space.
 *   We remember when the gizmo was last used and ignore clicks for a moment afterwards.
 * - When Shift switches a camera drag between pan and rotate (CameraModifierSwitch), the drag is
 *   restarted, so R3F measures "how far did the mouse move" from the restart. The click that
 *   ends the drag could then look like a plain click. We ignore it, until the next real press.
 */
const IGNORE_CLICK_AFTER_GIZMO_MS = 300;

let lastGizmoUse = 0;
let cameraDragRestarted = false;

export function markGizmoUsed(): void {
  lastGizmoUse = performance.now();
}

export function markCameraDragRestarted(): void {
  cameraDragRestarted = true;
}

/** Call on every real (user) mouse press, so only the drag that was restarted is affected. */
export function clearCameraDragRestarted(): void {
  cameraDragRestarted = false;
}

/** True when a click that just arrived should not change the selection. */
export function shouldIgnoreClick(): boolean {
  return (
    cameraDragRestarted ||
    performance.now() - lastGizmoUse < IGNORE_CLICK_AFTER_GIZMO_MS
  );
}
