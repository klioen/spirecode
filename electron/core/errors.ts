export interface ErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class CommandError extends Error {
  readonly code: string;
  readonly details?: Record<string, string>;

  constructor(code: string, message: string, details?: Record<string, string>) {
    super(message);
    this.name = "CommandError";
    this.code = code;
    this.details = details;
  }

  detail(key: string, value: string): CommandError {
    return new CommandError(this.code, this.message, {
      ...this.details,
      [key]: value,
    });
  }
}

export function toCommandError(error: unknown): CommandError {
  if (error instanceof CommandError) return error;
  if (error && typeof error === "object" && "code" in error) {
    const value = error as NodeJS.ErrnoException & {
      details?: Record<string, string>;
    };
    if (value.code === "ENOENT")
      return new CommandError("NOT_FOUND", value.message);
    if (value.code === "EACCES" || value.code === "EPERM")
      return new CommandError("PERMISSION_DENIED", value.message);
    if (typeof value.code === "string" && typeof value.message === "string")
      return new CommandError(value.code, value.message, value.details);
  }
  return new CommandError(
    "INVALID_ARGUMENT",
    error instanceof Error ? error.message : String(error),
  );
}

export function serializeError(error: unknown): ErrorShape {
  const value = toCommandError(error);
  return { code: value.code, message: value.message, details: value.details };
}
