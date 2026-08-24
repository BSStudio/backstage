export class UnionFind {
  private readonly parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    let root = key;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root) as string;
    }
    // Path compression, so a long chain of merges stays cheap to query.
    let cursor = key;
    while (cursor !== root) {
      const next = this.parent.get(cursor) as string;
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  union(a: string, b: string): boolean {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return false;
    this.parent.set(rootB, rootA);
    return true;
  }

  connected(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }

  groups(): Map<string, string[]> {
    const grouped = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      grouped.set(root, [...(grouped.get(root) ?? []), key]);
    }
    return grouped;
  }
}
