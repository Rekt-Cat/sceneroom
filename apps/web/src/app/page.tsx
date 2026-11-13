import { APP_NAME } from "@sceneroom/shared";
import ViewportLoader from "@/components/viewport/ViewportLoader";

export default function Home() {
  return (
    <main className="relative h-dvh w-full bg-[#14191d]">
      <ViewportLoader />
      <h1 className="pointer-events-none absolute bottom-3 left-4 text-sm font-semibold tracking-wide text-zinc-300">
        {APP_NAME}
      </h1>
    </main>
  );
}
