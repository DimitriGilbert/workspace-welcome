import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertDirectoryExists, customDomain } from "./prepare-docs-deploy.js";

const defaultDeployOutputDirectory = "apps/docs/dist/client";

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
      "deploy-docs-gh-pages accepts at most one output directory, or --dir <output-directory>.",
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

/**
 * The deploy's remove pattern wipes CNAME and .nojekyll off the gh-pages
 * branch, so publishing an un-prepared directory silently takes the custom
 * domain down. Refuse to spawn unless the prepared marker files are present;
 * the --cname/--nojekyll flags below are the second layer.
 */
async function assertDeployOutputPrepared(outputDirectory) {
  await assertDirectoryExists(outputDirectory);
  for (const fileName of [".nojekyll", "CNAME"]) {
    try {
      await stat(resolve(outputDirectory, fileName));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new Error(
          `Docs deploy output is missing ${fileName}: ${outputDirectory}. Run pnpm run prepare:docs-pages — or the full pnpm run deploy:docs chain — before deploying.`,
        );
      }

      throw error;
    }
  }
}

export async function deployDocsGhPages(options = {}) {
  const rootDirectory = resolve(options.rootDirectory ?? currentRootDirectory());
  const outputDirectory = options.outputDirectory ?? defaultDeployOutputDirectory;

  await assertDeployOutputPrepared(resolve(rootDirectory, outputDirectory));

  return new Promise((resolveDeploy, rejectDeploy) => {
    const childProcess = spawn(
      "pnpm",
      [
        "exec",
        "gh-pages",
        "--dotfiles",
        // gh-pages' default remove pattern skips dotfiles, which kept stray
        // source .gitignore/.gitkeep files on the gh-pages branch forever.
        "--remove",
        "**/{*,.*}",
        // Belt and suspenders: the published branch always carries the
        // domain file and the no-Jekyll marker, even if a future prepare
        // variant forgets to write them into the output directory.
        "--cname",
        customDomain,
        "--nojekyll",
        // --no-history: force-push a single fresh commit so the branch is
        // always exactly the built output.
        "-f",
        "-d",
        outputDirectory,
        "-m",
        "deploy: welcome-workspace docs",
      ],
      {
        cwd: rootDirectory,
        stdio: "inherit",
        shell: false,
      },
    );

    childProcess.on("error", (error) => {
      rejectDeploy(new Error(`Failed to start gh-pages deploy: ${error.message}`));
    });

    childProcess.on("close", (exitCode, signal) => {
      if (exitCode === 0) {
        resolveDeploy();
        return;
      }

      const reason = signal === null ? `exit code ${String(exitCode)}` : `signal ${signal}`;
      rejectDeploy(new Error(`gh-pages deploy failed with ${reason}.`));
    });
  });
}

async function main() {
  const outputDirectory = parseDeployOutputDirectory(process.argv.slice(2));
  await deployDocsGhPages({ outputDirectory });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
