import type { CommandError } from "../bindings";

export function commandError(error: unknown): CommandError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  ) {
    return error as CommandError;
  }
  return {
    code: "INVALID_ARGUMENT",
    message: error instanceof Error ? error.message : String(error),
  };
}
