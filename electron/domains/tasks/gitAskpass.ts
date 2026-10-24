import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function withGitAskpass<T>(
  credentials: { username: string; token: string },
  operation: (environment: Readonly<Record<string, string>>) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(path.join(tmpdir(), "spirecode-askpass-"));
  const windows = process.platform === "win32";
  const askpass = path.join(directory, windows ? "askpass.cmd" : "askpass");
  const script = windows
    ? "@echo off\r\nif not defined SPIRECODE_GIT_TOKEN exit /b 1\r\necho %SPIRECODE_GIT_TOKEN%\r\n"
    : [
        "#!/bin/sh",
        '[ -n "${SPIRECODE_GIT_TOKEN-}" ] || exit 1',
        'case "${1-}" in',
        "  *[Uu][Ss][Ee][Rr][Nn][Aa][Mm][Ee]*) printf '%s\\n' \"${SPIRECODE_GIT_USERNAME:-oauth2}\" ;;",
        "  *) printf '%s\\n' \"$SPIRECODE_GIT_TOKEN\" ;;",
        "esac",
        "",
      ].join("\n");
  try {
    await writeFile(askpass, script, { mode: 0o700 });
    return await operation({
      GIT_ASKPASS: askpass,
      GIT_ASKPASS_REQUIRE: "force",
      SPIRECODE_GIT_USERNAME: credentials.username,
      SPIRECODE_GIT_TOKEN: credentials.token,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
