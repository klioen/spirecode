export class ResourceCache<T> {
  private readonly values = new Map<string, T>();

  get(key: string): T | undefined {
    return this.values.get(key);
  }

  set(key: string, value: T): void {
    this.values.set(key, value);
  }

  move(from: string, to: string): void {
    const value = this.values.get(from);
    if (value !== undefined) this.values.set(to, value);
    this.values.delete(from);
  }

  delete(key: string): void {
    this.values.delete(key);
  }

  deletePrefix(prefix: string): void {
    for (const key of this.values.keys())
      if (key.startsWith(prefix)) this.values.delete(key);
  }
}
