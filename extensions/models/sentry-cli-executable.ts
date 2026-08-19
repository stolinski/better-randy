const DEFAULT_SENTRY_EXECUTABLE = "sentry";

export type SentryCliExecutableDependencies = {
  readEnvironment: (name: string) => string | undefined;
  isFile: (path: string) => boolean;
};

const DEFAULT_DEPENDENCIES: SentryCliExecutableDependencies = {
  readEnvironment: (name) => Deno.env.get(name),
  isFile: (path) => {
    try {
      return Deno.statSync(path).isFile;
    } catch {
      return false;
    }
  },
};

/**
 * Resolve the Sentry CLI without assuming Swamp inherited an interactive shell PATH.
 */
export function resolveSentryCliExecutable(
  dependencies: SentryCliExecutableDependencies = DEFAULT_DEPENDENCIES,
): string {
  const configured = dependencies.readEnvironment("SENTRY_CLI_PATH")?.trim();
  if (configured) return configured;

  const pathDirectories = (dependencies.readEnvironment("PATH") ?? "")
    .split(":")
    .filter(Boolean);
  const home = dependencies.readEnvironment("HOME")?.trim();
  const candidates = [
    ...pathDirectories.map((directory) => `${directory}/sentry`),
    ...(home ? [`${home}/.local/bin/sentry`] : []),
    "/opt/homebrew/bin/sentry",
    "/usr/local/bin/sentry",
  ];
  return candidates.find(dependencies.isFile) ?? DEFAULT_SENTRY_EXECUTABLE;
}
