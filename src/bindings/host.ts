import type { CommandError } from "./generated";

export type HostTopic =
  | "filesystem://changed"
  | "git://changed"
  | "terminal://event"
  | "chat://event";

export type HostResult<T> =
  { ok: true; value: T } | { ok: false; error: CommandError };

export interface SpireHost {
  invoke<T>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<HostResult<T>>;
  subscribe<T>(topic: HostTopic, listener: (payload: T) => void): () => void;
}

declare global {
  interface Window {
    spire: SpireHost;
  }
}
