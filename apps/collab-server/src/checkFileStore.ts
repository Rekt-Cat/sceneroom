import { createHash } from "node:crypto";
import { loadConfig } from "./config";
import { FolderFileStore, type FileStore } from "./fileStore";
import { S3FileStore } from "./s3FileStore";

/**
 * Tries the file store the settings point at, with one tiny file: put, has, get, the project total, and that a different
 * file id is not found. For the day a bucket is set up (or any time its keys change):
 * `pnpm --filter @sceneroom/collab-server check-files`. It writes one file named by its hash under the project
 * "check-files" and leaves it there (a few bytes). Exit code 0 = all fine.
 */
async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const store: FileStore = config.s3
    ? new S3FileStore(config.s3)
    : new FolderFileStore(config.filesDir);
  console.log(
    config.s3
      ? `Checking the bucket "${config.s3.bucket}" at ${config.s3.endpoint}`
      : `Checking the folder ${config.filesDir}`,
  );
  const project = "check-files";
  const bytes = new TextEncoder().encode("SceneRoom file store check");
  const id = createHash("sha256").update(bytes).digest("hex");
  const absent = createHash("sha256").update("no such file").digest("hex");

  const steps: [string, () => Promise<boolean>][] = [
    [
      "put a small file",
      async () => (await store.put(project, id, bytes), true),
    ],
    ["it is there", () => store.has(project, id)],
    [
      "read it back, the same bytes",
      async () => {
        const back = await store.get(project, id);
        return (
          back !== null &&
          Buffer.compare(Buffer.from(back), Buffer.from(bytes)) === 0
        );
      },
    ],
    [
      "the project total counts it",
      async () => (await store.projectBytes(project)) >= bytes.byteLength,
    ],
    [
      "a file that was never stored is not found",
      async () =>
        !(await store.has(project, absent)) &&
        (await store.get(project, absent)) === null,
    ],
  ];
  let failed = false;
  for (const [name, run] of steps) {
    try {
      const ok = await run();
      console.log(`${ok ? "ok    " : "WRONG "} ${name}`);
      if (!ok) failed = true;
    } catch (error) {
      console.log(
        `FAILED ${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
      failed = true;
    }
  }
  console.log(
    failed ? "\nThe file store is NOT working." : "\nThe file store works.",
  );
  process.exitCode = failed ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(
    "Could not run the check:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
