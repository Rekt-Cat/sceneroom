import type { NodeKind } from "@sceneroom/shared";

/** Small line icons, all drawn on a 16 x 16 grid. */
const PATHS = {
  cube: (
    <>
      <path d="M8 1.5 13.5 4.6v6.8L8 14.5 2.5 11.4V4.6L8 1.5Z" />
      <path d="M2.5 4.6 8 7.7l5.5-3.1M8 7.7v6.8" />
    </>
  ),
  sphere: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" />
    </>
  ),
  cylinder: (
    <>
      <ellipse cx="8" cy="3.8" rx="5" ry="2.1" />
      <path d="M3 3.8v8.4c0 1.2 2.2 2.1 5 2.1s5-.9 5-2.1V3.8" />
    </>
  ),
  plane: <path d="M1.8 11.2 5 4.5h9.2L11 11.2H1.8Z" />,
  cone: <path d="M8 1.8 13 11.6c0 1.3-2.2 2.4-5 2.4s-5-1.1-5-2.4L8 1.8Z" />,
  // an imported model: a box with a handle, like a parcel
  model: (
    <>
      <path d="M2.5 5.2 8 2.5l5.5 2.7v6.1L8 14 2.5 11.3V5.2Z" />
      <path d="M2.5 5.2 8 8l5.5-2.8M8 8v6M5.2 3.9l5.5 2.8" />
    </>
  ),
  import: <path d="M8 2.5v7M5 6.8l3 3 3-3M3 13h10" />,
  eye: (
    <>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  eyeOff: (
    <path d="M2 2l12 12M6.4 4a6.6 6.6 0 0 1 1.6-.5c4 0 6.5 4.5 6.5 4.5a11 11 0 0 1-2.2 2.7M9.6 11.7c-.5.2-1.1.3-1.6.3C4 12 1.5 8 1.5 8a11.5 11.5 0 0 1 2.7-3" />
  ),
  chevronRight: <path d="m6 3.5 4.5 4.5L6 12.5" />,
  chevronDown: <path d="m3.5 6 4.5 4.5L12.5 6" />,
  plus: <path d="M8 3v10M3 8h10" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3.5 3.5" />
    </>
  ),
  move: (
    <path d="M8 1.5v13M1.5 8h13M8 1.5 6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2" />
  ),
  rotate: (
    <>
      <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1" />
      <path d="M13.5 2.5v3h-3" />
    </>
  ),
  scale: <path d="M3 13 13 3M8.5 3H13v4.5M7.5 13H3V8.5" />,
  magnet: <path d="M3 8a5 5 0 0 1 10 0v5h-3V8a2 2 0 0 0-4 0v5H3V8Z" />,
  copy: (
    <>
      <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" />
      <path d="M3 10.5V4a1.5 1.5 0 0 1 1.5-1.5H11" />
    </>
  ),
  undo: (
    <>
      <path d="M5 3.5 2.5 6 5 8.5" />
      <path d="M3 6h6a4 4 0 0 1 0 8H6" />
    </>
  ),
  redo: (
    <>
      <path d="m11 3.5 2.5 2.5L11 8.5" />
      <path d="M13 6H7a4 4 0 0 0 0 8h3" />
    </>
  ),
  reset: <path d="M3 8a5 5 0 1 0 1.7-3.7M3 2.5v3h3" />,
  lock: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </>
  ),
  unlock: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 4.6-1.3" />
    </>
  ),
  link: (
    <path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.7.7M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.7-.7" />
  ),
  unlink: (
    <path d="M7 5.2 8.5 3.8a2.5 2.5 0 0 1 3.5 3.5L10.700 8.600M9 10.800 7.500 12.200a2.500 2.500 0 0 1-3.500-3.500L5.300 7.400M5.500 2.500v1.300M2.500 5.500h1.300M10.500 12.200v1.300M12.200 10.500h1.300" />
  ),
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  className = "size-4",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`${className} shrink-0 fill-none stroke-current stroke-[1.4] [stroke-linecap:round] [stroke-linejoin:round]`}
    >
      {PATHS[name]}
    </svg>
  );
}

/** The icon for a primitive shape (the icon names match the shape names). */
export function KindIcon({
  kind,
  className,
}: {
  kind: NodeKind;
  className?: string;
}) {
  return <Icon name={kind} className={className} />;
}

/** Display names for the shapes. */
export const KIND_LABELS: Record<NodeKind, string> = {
  cube: "Cube",
  sphere: "Sphere",
  cylinder: "Cylinder",
  plane: "Plane",
  cone: "Cone",
  model: "Model",
};
