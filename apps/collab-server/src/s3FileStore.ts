import { AwsClient } from "aws4fetch";
import { FILE_ID_PATTERN, type FileStore } from "./fileStore";

export type S3Options = {
  /** The service's address, for example `https://<account>.r2.cloudflarestorage.com` (R2) or `https://s3.<region>.amazonaws.com` (AWS). */
  endpoint: string;
  bucket: string;
  /** "auto" for Cloudflare R2, the region name for AWS and Backblaze B2. */
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** For tests. */
  fetchImpl?: typeof fetch;
  /** How long a project's total size is remembered, in ms (a listing costs a request). */
  totalsCacheMs?: number;
};

/**
 * Keeps files in an S3-compatible bucket: `<bucket>/<projectId>/<id>`. One class for Cloudflare R2, Backblaze B2, AWS S3 and
 * anything else that speaks the S3 API (the requests are signed with `aws4fetch`, a small library with no dependencies).
 *
 * It is needed when the host has no disk that survives a restart (a free web service). The collab server stays in the middle:
 * every upload and download still goes through its token, role, hash, size and quota checks (fileRoutes.ts); the bucket is only
 * where the bytes rest. Path-style addresses are used (`endpoint/bucket/key`), which all of these services accept.
 */
export class S3FileStore implements FileStore {
  private readonly client: AwsClient;
  private readonly base: string;
  private readonly call: typeof fetch;
  private readonly totals = new Map<string, { bytes: number; at: number }>();
  private readonly cacheMs: number;

  constructor(private readonly options: S3Options) {
    this.client = new AwsClient({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      service: "s3",
      region: options.region,
    });
    this.base = `${options.endpoint.replace(/\/+$/, "")}/${options.bucket}`;
    this.call = options.fetchImpl ?? ((...args) => fetch(...args));
    this.cacheMs = options.totalsCacheMs ?? 60_000;
  }

  /** Ids are checked before they become part of an address, so a request can never name another object. */
  private key(projectId: string, id: string): string {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId) || !FILE_ID_PATTERN.test(id)) {
      throw new Error("Not a valid project or file id");
    }
    return `${projectId}/${id}`;
  }

  /** Signs the request and sends it with the fetch this store was given (the real one, or a fake in tests). */
  private async send(url: string, init: RequestInit): Promise<Response> {
    return this.call(await this.client.sign(url, init));
  }

  async has(projectId: string, id: string): Promise<boolean> {
    const response = await this.send(
      `${this.base}/${this.key(projectId, id)}`,
      { method: "HEAD" },
    );
    if (response.status === 404) return false;
    if (!response.ok)
      throw new Error(
        `The file store answered ${response.status} when asked about a file`,
      );
    return true;
  }

  async get(projectId: string, id: string): Promise<Uint8Array | null> {
    const response = await this.send(
      `${this.base}/${this.key(projectId, id)}`,
      { method: "GET" },
    );
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(
        `The file store answered ${response.status} when sent for a file`,
      );
    return new Uint8Array(await response.arrayBuffer());
  }

  async put(projectId: string, id: string, bytes: Uint8Array): Promise<void> {
    const response = await this.send(
      `${this.base}/${this.key(projectId, id)}`,
      {
        method: "PUT",
        body: Buffer.from(bytes),
        headers: { "Content-Type": "application/octet-stream" },
      },
    );
    if (!response.ok)
      throw new Error(`The file store refused a file: ${response.status}`);
    // Keep the remembered total roughly right until it is read again (the route only puts files it does not have yet)
    const known = this.totals.get(projectId);
    if (known) known.bytes += bytes.byteLength;
  }

  /** The total of the project's files, from a listing of its prefix (remembered for a minute). */
  async projectBytes(projectId: string): Promise<number> {
    const known = this.totals.get(projectId);
    if (known && Date.now() - known.at < this.cacheMs) return known.bytes;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId))
      throw new Error("Not a valid project id");
    let total = 0;
    let token: string | null = null;
    do {
      const query = new URLSearchParams({
        "list-type": "2",
        prefix: `${projectId}/`,
      });
      if (token) query.set("continuation-token", token);
      const response = await this.send(`${this.base}?${query.toString()}`, {
        method: "GET",
      });
      if (!response.ok)
        throw new Error(
          `The file store answered ${response.status} when listing files`,
        );
      const xml = await response.text();
      for (const match of xml.matchAll(
        /<Contents>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g,
      )) {
        total += Number(match[1]);
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
        ? (/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(
            xml,
          )?.[1] ?? null)
        : null;
    } while (token);
    this.totals.set(projectId, { bytes: total, at: Date.now() });
    return total;
  }
}
