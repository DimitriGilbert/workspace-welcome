import { chmod, copyFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultDeployOutputDirectory = "apps/docs/dist/client";

/** Shared with deploy-docs-gh-pages.js — the published GitHub Pages domain. */
export const customDomain = "welcome-workspace.dbuild.dev";

/**
 * The repo-root installer, served from the deploy output as /install.sh. The
 * repo copy is the single source of truth; the served copy is a fresh mirror
 * of it on every prepare run.
 */
const installerSourcePath = "scripts/install.sh";
const installerDestinationName = "install.sh";

function currentRootDirectory() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

function parseDeployOutputDirectory(argv) {
  if (argv.length === 0) {
    return defaultDeployOutputDirectory;
  }

  const [firstArgument, secondArgument, ...extraArguments] = argv;

  if (extraArguments.length > 0) {
    throw new Error(
      "prepare-docs-deploy accepts at most one output directory, or --dir <output-directory>.",
    );
  }

  if (firstArgument === "--dir") {
    if (secondArgument === undefined || secondArgument.trim() === "") {
      throw new Error("Missing required output directory after --dir.");
    }

    return secondArgument;
  }

  if (secondArgument !== undefined) {
    throw new Error(
      "Unexpected extra argument. Use --dir <output-directory> or pass a single output directory.",
    );
  }

  if (firstArgument === undefined || firstArgument.trim() === "") {
    throw new Error("Output directory argument must not be empty.");
  }

  return firstArgument;
}

/** Shared with deploy-docs-gh-pages.js — validates the build output exists. */
export async function assertDirectoryExists(directoryPath) {
  try {
    const directoryStats = await stat(directoryPath);
    if (!directoryStats.isDirectory()) {
      throw new Error(`Docs deploy output path exists but is not a directory: ${directoryPath}`);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Docs deploy output directory does not exist: ${directoryPath}. Run pnpm run build:docs before preparing deploy output.`,
      );
    }

    throw error;
  }
}

/**
 * Copies the repo-root installer into the deploy output so the /install.sh the
 * site serves can never drift from scripts/install.sh.
 */
async function copyInstallerIntoDeployOutput(rootDirectory, outputDirectory) {
  const sourcePath = resolve(rootDirectory, installerSourcePath);
  try {
    const sourceStats = await stat(sourcePath);
    if (!sourceStats.isFile()) {
      throw new Error(`Installer source path exists but is not a regular file: ${sourcePath}`);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Installer script does not exist: ${sourcePath}. The docs deploy serves it as /${installerDestinationName}, so the repo copy must exist before preparing deploy output.`,
      );
    }

    throw error;
  }

  const destinationPath = resolve(outputDirectory, installerDestinationName);
  // copyFile replaces the destination outright, so each prepare run mirrors the
  // current installer instead of merging with a previously served one.
  await copyFile(sourcePath, destinationPath);
  // The installer is a runnable script, not just a page asset — keep the mode executable.
  await chmod(destinationPath, 0o755);

  return destinationPath;
}

export async function prepareDocsDeploy(options = {}) {
  const rootDirectory = resolve(options.rootDirectory ?? currentRootDirectory());
  const outputDirectory = resolve(
    rootDirectory,
    options.outputDirectory ?? defaultDeployOutputDirectory,
  );

  await assertDirectoryExists(outputDirectory);
  await writeFile(resolve(outputDirectory, ".nojekyll"), "", "utf8");
  await writeFile(resolve(outputDirectory, "CNAME"), `${customDomain}\n`, "utf8");
  await copyInstallerIntoDeployOutput(rootDirectory, outputDirectory);

  return outputDirectory;
}

async function main() {
  const outputDirectory = parseDeployOutputDirectory(process.argv.slice(2));
  const preparedDirectory = await prepareDocsDeploy({ outputDirectory });
  console.info(`Prepared docs deploy output: ${preparedDirectory}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
