import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { S3FileStore } from "./s3FileStore";

const ID_A = "a".repeat(64);
const ID_B = "b".repeat(64);
const ID_C = "c".repeat(64);
const PROJECT = "proj1";

/** A tiny S3: path-style objects in memory, ListObjectsV2 in pages of two, and a check that every request is signed. */
function fakeS3() {
  const objects = new Map<string, Buffer>();
  const seen: {
    method: string;
    url: string;
    signed: boolean;
    keyId: string | null;
  }[] = [];
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const auth = request.headers.authorization ?? "";
    seen.push({
      method: request.method ?? "",
      url: request.url ?? "",
      signed:
        auth.startsWith("AWS4-HMAC-SHA256") &&
        Boolean(request.headers["x-amz-content-sha256"]) &&
        Boolean(request.headers["x-amz-date"]),
      keyId: /Credential=([^/]+)\//.exec(auth)?.[1] ?? null,
    });
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const path = decodeURIComponent(
        url.pathname.replace(/^\/test-bucket\/?/, ""),
      );
      if (request.method === "PUT") {
        objects.set(path, Buffer.concat(chunks));
        response.writeHead(200).end();
      } else if (
        request.method === "GET" &&
        url.searchParams.get("list-type") === "2"
      ) {
        const prefix = url.searchParams.get("prefix") ?? "";
        const keys = [...objects.keys()]
          .filter((k) => k.startsWith(prefix))
          .sort();
        const start = Number(url.searchParams.get("continuation-token") ?? 0);
        const page = keys.slice(start, start + 2);
        const more = start + 2 < keys.length;
        response.writeHead(200, { "Content-Type": "application/xml" });
        response.end(
          `<ListBucketResult><IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${start + 2}</NextContinuationToken>` : ""}` +
            page
              .map(
                (k) =>
                  `<Contents><Key>${k}</Key><Size>${objects.get(k)!.length}</Size></Contents>`,
              )
              .join("") +
            "</ListBucketResult>",
        );
      } else if (request.method === "GET" || request.method === "HEAD") {
        const found = objects.get(path);
        if (!found) return void response.writeHead(404).end();
        response.writeHead(200, { "Content-Length": found.length });
        response.end(request.method === "HEAD" ? undefined : found);
      } else {
        response.writeHead(405).end();
      }
    });
  });
  return { server, objects, seen };
}

describe("S3FileStore", () => {
  const running: Server[] = [];
  afterEach(async () => {
    await Promise.all(
      running.splice(0).map((s) => new Promise((resolve) => s.close(resolve))),
    );
  });

  async function setup(extra: { totalsCacheMs?: number } = {}) {
    const s3 = fakeS3();
    await new Promise<void>((resolve) =>
      s3.server.listen(0, "127.0.0.1", resolve),
    );
    running.push(s3.server);
    const { port } = s3.server.address() as AddressInfo;
    const store = new S3FileStore({
      endpoint: `http://127.0.0.1:${port}`,
      bucket: "test-bucket",
      region: "auto",
      accessKeyId: "AKIATESTKEY",
      secretAccessKey: "test-secret",
      ...extra,
    });
    return { store, ...s3 };
  }

  it("puts, finds, reads and misses files, under project/id in the bucket", async () => {
    const { store, objects } = await setup();
    expect(await store.has(PROJECT, ID_A)).toBe(false);
    expect(await store.get(PROJECT, ID_A)).toBeNull();
    await store.put(PROJECT, ID_A, new Uint8Array([1, 2, 3]));
    expect(await store.has(PROJECT, ID_A)).toBe(true);
    expect(Array.from((await store.get(PROJECT, ID_A))!)).toEqual([1, 2, 3]);
    expect([...objects.keys()]).toEqual([`${PROJECT}/${ID_A}`]);
  });

  it("every request is signed with the key it was given", async () => {
    const { store, seen } = await setup();
    await store.put(PROJECT, ID_A, new Uint8Array([9]));
    await store.has(PROJECT, ID_A);
    await store.get(PROJECT, ID_A);
    await store.projectBytes(PROJECT);
    expect(seen.length).toBe(4);
    expect(seen.every((r) => r.signed && r.keyId === "AKIATESTKEY")).toBe(true);
  });

  it("keeps every byte value and a big file", async () => {
    const { store } = await setup();
    const bytes = Uint8Array.from(
      { length: 2_000_000 },
      (_, i) => (i * 7) % 256,
    );
    await store.put(PROJECT, ID_B, bytes);
    const back = (await store.get(PROJECT, ID_B))!;
    expect(back.byteLength).toBe(bytes.byteLength);
    expect(back.every((v, i) => v === bytes[i])).toBe(true);
  });

  it("adds up a project's files over several pages of the listing, and not another project's", async () => {
    const { store } = await setup({ totalsCacheMs: 0 });
    await store.put(PROJECT, ID_A, new Uint8Array(10));
    await store.put(PROJECT, ID_B, new Uint8Array(20));
    await store.put(PROJECT, ID_C, new Uint8Array(30));
    await store.put("other", ID_A, new Uint8Array(1000));
    expect(await store.projectBytes(PROJECT)).toBe(60);
    expect(await store.projectBytes("other")).toBe(1000);
    expect(await store.projectBytes("nobody")).toBe(0);
  });

  it("remembers the total for a while instead of listing again, and counts new files in it", async () => {
    const { store, seen } = await setup();
    await store.put(PROJECT, ID_A, new Uint8Array(10));
    expect(await store.projectBytes(PROJECT)).toBe(10);
    const listings = () =>
      seen.filter((r) => r.url.includes("list-type")).length;
    expect(listings()).toBe(1);
    await store.put(PROJECT, ID_B, new Uint8Array(5));
    expect(await store.projectBytes(PROJECT)).toBe(15);
    expect(listings()).toBe(1);
  });

  it("refuses ids that are not ids, before any request is made", async () => {
    const { store, seen } = await setup();
    await expect(store.has("../x", ID_A)).rejects.toThrow(/Not a valid/);
    await expect(store.get(PROJECT, "../../etc/passwd")).rejects.toThrow(
      /Not a valid/,
    );
    await expect(store.put(PROJECT, "short", new Uint8Array())).rejects.toThrow(
      /Not a valid/,
    );
    await expect(store.projectBytes("a/b")).rejects.toThrow(/Not a valid/);
    expect(seen).toEqual([]);
  });

  it("says plainly when the service refuses or is not there", async () => {
    const down = new S3FileStore({
      endpoint: "http://127.0.0.1:1",
      bucket: "b",
      region: "auto",
      accessKeyId: "k",
      secretAccessKey: "s",
    });
    await expect(down.has(PROJECT, ID_A)).rejects.toThrow();
    const refusing = new S3FileStore({
      endpoint: "http://x",
      bucket: "b",
      region: "auto",
      accessKeyId: "k",
      secretAccessKey: "s",
      fetchImpl: async () => new Response("denied", { status: 403 }),
    });
    await expect(refusing.has(PROJECT, ID_A)).rejects.toThrow(/403/);
    await expect(
      refusing.put(PROJECT, ID_A, new Uint8Array([1])),
    ).rejects.toThrow(/403/);
    await expect(refusing.projectBytes(PROJECT)).rejects.toThrow(/403/);
  });
});
