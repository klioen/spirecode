export class WindowCloseGuard {
  private count = 0;
  private discardApproved = false;

  get dirtyFileCount(): number {
    return this.count;
  }

  setDirtyFileCount(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0 || count > 10_000)
      throw new TypeError("dirty file count is invalid");
    this.count = count;
    if (count === 0) this.discardApproved = false;
  }

  allowClose(confirmDiscard: (dirtyFileCount: number) => boolean): boolean {
    if (this.count === 0 || this.discardApproved) return true;
    this.discardApproved = confirmDiscard(this.count);
    return this.discardApproved;
  }
}
