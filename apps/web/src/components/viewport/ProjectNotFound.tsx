import Link from "next/link";

/** Shown when the address names a project that is not in this browser. */
export default function ProjectNotFound() {
  return (
    <main className="grid h-dvh place-items-center bg-ed-bg p-6 text-ed-text">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="text-lg font-semibold">This project was not found</h1>
        <p className="text-sm text-ed-text-2">
          It may have been deleted, or the link may belong to another browser.
          Projects are kept in the browser they were made in until sharing comes
          with accounts.
        </p>
        <Link
          href="/"
          className="rounded-md bg-ed-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-accent"
        >
          Back to your projects
        </Link>
      </div>
    </main>
  );
}
