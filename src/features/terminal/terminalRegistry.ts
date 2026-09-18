import type { ITheme } from "@xterm/xterm";

export interface TerminalWriter {
  options: { theme?: ITheme; fontSize?: number; scrollback?: number };
  write(data: string): void;
  dispose(): void;
}
const instances = new Map<string, TerminalWriter>();
export const terminalRegistry = {
  set: (id: string, terminal: TerminalWriter) => instances.set(id, terminal),
  get: (id: string) => instances.get(id),
  delete: (id: string) => {
    instances.get(id)?.dispose();
    instances.delete(id);
  },
};
