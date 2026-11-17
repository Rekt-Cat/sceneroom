/**
 * How far a camera must be from the middle of something so that all of it is in view.
 *
 * `radius` is the radius of a ball that holds the thing; `fovDegrees` is the camera's vertical field of
 * view; `aspect` is the view's width divided by its height. A tall, narrow view is limited by its width,
 * so the smaller of the two fields of view is used. `padding` leaves room round it (1 = the ball just
 * touches the edge of the view). A very small radius is raised to `minRadius`, so a tiny object does not
 * make the camera press up against it.
 */
export function framingDistance(
  radius: number,
  fovDegrees: number,
  aspect: number,
  padding = 1.3,
  minRadius = 0.25,
): number {
  const r = Math.max(radius, minRadius);
  const vertical = (fovDegrees * Math.PI) / 180;
  // The horizontal field of view that goes with that vertical one and the shape of the view
  const horizontal =
    2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, 0.01));
  const fov = Math.min(vertical, horizontal);
  return (r / Math.sin(fov / 2)) * padding;
}
