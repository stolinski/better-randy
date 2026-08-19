import assert from "node:assert/strict";

import {
  resolveSentryCliExecutable,
  type SentryCliExecutableDependencies,
} from "./sentry-cli-executable.ts";

function dependencies(
  environment: Record<string, string | undefined>,
  files: string[],
): SentryCliExecutableDependencies {
  return {
    readEnvironment: (name) => environment[name],
    isFile: (path) => files.includes(path),
  };
}

Deno.test("Sentry CLI resolution honors an explicit executable", () => {
  assert.equal(
    resolveSentryCliExecutable(
      dependencies({ SENTRY_CLI_PATH: "/custom/bin/sentry" }, []),
    ),
    "/custom/bin/sentry",
  );
});

Deno.test("Sentry CLI resolution finds the user-local installation outside PATH", () => {
  assert.equal(
    resolveSentryCliExecutable(
      dependencies(
        { HOME: "/Users/creator", PATH: "/usr/bin:/bin" },
        ["/Users/creator/.local/bin/sentry"],
      ),
    ),
    "/Users/creator/.local/bin/sentry",
  );
});

Deno.test("Sentry CLI resolution preserves command lookup as the final fallback", () => {
  assert.equal(
    resolveSentryCliExecutable(dependencies({}, [])),
    "sentry",
  );
});
