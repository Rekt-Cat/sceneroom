import { APP_NAME } from "@sceneroom/shared";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-50 p-8 text-center dark:bg-black">
      <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
        {APP_NAME}
      </h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Real-time collaborative 3D scene editor. Work in progress.
      </p>
    </main>
  );
}
