/** Small card in the corner of the 3D view that lists the mouse controls. */
const CONTROLS: [string, string][] = [
  ["Left-drag", "Pan"],
  ["Right-drag", "Orbit"],
  ["Scroll", "Zoom"],
  ["Ctrl/Cmd-drag", "Select box"],
];

export default function ControlsLegend() {
  return (
    <dl className="pointer-events-none absolute bottom-5 left-4 grid grid-cols-[auto_auto] gap-x-3.5 gap-y-0.5 rounded-[10px] border border-ed-line bg-ed-panel/85 px-3 py-2.5 text-xs text-ed-text-2 backdrop-blur">
      {CONTROLS.map(([action, effect]) => (
        <div key={action} className="contents">
          <dt className="font-medium text-ed-text">{action}</dt>
          <dd>{effect}</dd>
        </div>
      ))}
    </dl>
  );
}
