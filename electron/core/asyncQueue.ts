export class AsyncQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export class KeyedQueue {
  private readonly queues = new Map<string, AsyncQueue>();

  run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    let queue = this.queues.get(key);
    if (!queue) {
      queue = new AsyncQueue();
      this.queues.set(key, queue);
    }
    return queue.run(operation);
  }

  delete(key: string): void {
    this.queues.delete(key);
  }
}
