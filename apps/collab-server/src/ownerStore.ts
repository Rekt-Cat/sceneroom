/**
 * Who owns a project's sharing, and which generation of links is valid (docs/backend/COLLABORATION.md, section 9, stage A).
 *
 * There are no accounts yet. The first person to ask to share a project (by its random id) becomes its owner: the server
 * keeps a fingerprint of the secret key they sent. Only that key can make links for the project or cancel them.
 * The owner key never leaves the owner's browser; links are signed with the server's own secret.
 *
 * Cancelling all links moves the project to the next generation: every link made before is refused from then on.
 */
export interface OwnerStore {
  /** The fingerprint (SHA-256 hex) of the owner's key, or null if nobody has claimed the project. */
  ownerHash(projectId: string): string | null;
  /** Makes this fingerprint the owner of the project. false if the project already has an owner. */
  claim(projectId: string, keyHash: string): boolean;
  /** The generation of links that is valid now (0 until the owner cancels links). */
  generation(projectId: string): number;
  /** Cancels all links: returns the new valid generation. */
  nextGeneration(projectId: string): number;
}

/** Keeps owners in memory only. For tests. */
export class MemoryOwners implements OwnerStore {
  private readonly owners = new Map<
    string,
    { hash: string; generation: number }
  >();
  ownerHash(projectId: string) {
    return this.owners.get(projectId)?.hash ?? null;
  }
  claim(projectId: string, keyHash: string) {
    if (this.owners.has(projectId)) return false;
    this.owners.set(projectId, { hash: keyHash, generation: 0 });
    return true;
  }
  generation(projectId: string) {
    return this.owners.get(projectId)?.generation ?? 0;
  }
  nextGeneration(projectId: string) {
    const owner = this.owners.get(projectId);
    if (!owner) return 0;
    owner.generation += 1;
    return owner.generation;
  }
}
