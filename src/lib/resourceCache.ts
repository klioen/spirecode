export class ResourceCache<T> {
  private readonly values = new Map<string, T>();

  get(key: string): T | undefined {
    return this.values.get(key);
  }

  set(key: string, value: T): void {
    this.values.set(key, value);
  }

  deletePrefix(prefix: string): void {
    for (const key of this.values.keys())
      if (key.startsWith(prefix)) this.values.delete(key);
  }
}
