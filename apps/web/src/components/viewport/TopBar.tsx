import { APP_NAME } from "@sceneroom/shared";
import { Icon } from "./icons";

/** Thin bar across the top of the editor. More (project name, undo, sharing) comes with later phases. */
export default function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ed-line bg-ed-panel px-3.5">
      <span className="grid size-[26px] place-items-center rounded-[7px] bg-linear-to-br from-[#6f80ff] to-[#4152d4] text-white">
        <Icon name="cube" />
      </span>
      <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
      <span className="h-5 w-px bg-ed-line-strong" aria-hidden="true" />
      <span className="text-sm text-ed-text-3">Untitled scene</span>
    </header>
  );
}
