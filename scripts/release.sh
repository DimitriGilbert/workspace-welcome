#!/usr/bin/env bash
# Release pipeline for workspace-welcome.
#
# Builds the workspaces, assembles a self-contained production deploy
# (static client + SSR server + serve-prod.mjs + a pruned production
# node_modules), boots it once as a hard acceptance test, packs a
# per-platform tarball, and publishes it to GitHub Releases.
#
# Usage: scripts/release.sh <version> [--dry-run]
set -euo pipefail

VERSION=""
DRY_RUN=false

usage() {
  echo "Usage: scripts/release.sh <version> [--dry-run]"
  echo "  <version>  strict semver X.Y.Z (no leading \"v\", no prerelease suffix)"
  echo "  --dry-run  build, package, and boot-test without the clean-tree/tag/auth"
  echo "             guards and without uploading a GitHub release"
}

abort() {
  echo "error: $*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      ;;
    --)
      # Argument separator forwarded verbatim by `pnpm run release -- …`; skip it.
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      usage
      abort "unknown option: $1"
      ;;
    *)
      if [ -n "$VERSION" ]; then
        usage
        abort "unexpected extra argument: $1"
      fi
      VERSION="$1"
      ;;
  esac
  shift
done

if [ -z "$VERSION" ]; then
  usage
  abort "a version argument is required"
fi
if [[ ! "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  usage
  abort "\"$VERSION\" is not a strict X.Y.Z version"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TAG="v$VERSION"
RELEASE_DIR="$REPO_ROOT/release"
STAGING_DIR="$RELEASE_DIR/staging"
BOOT_PORT=39771
BOOT_URL="http://127.0.0.1:${BOOT_PORT}/"

# Platform identity for the release asset name, checked up front: assets are
# per-platform (create-better-t-stack pulls native optional deps like oxfmt's
# linux-x64-gnu binding), so a tarball is only meaningful for the host it was
# built on.
if [ "$(uname -s)" != "Linux" ]; then
  abort "release tarballs are built on Linux only; this host is $(uname -s)"
fi
case "$(uname -m)" in
  x86_64) ARCH="x64" ;;
  aarch64 | arm64) ARCH="arm64" ;;
  *) abort "unsupported build arch: $(uname -m)" ;;
esac
LIBC_SUFFIX=""
if ldd --version 2>&1 | grep -qi musl || [ -f /etc/alpine-release ]; then
  LIBC_SUFFIX="-musl"
fi

mkdir -p "$RELEASE_DIR"

for bin in git pnpm node tar curl sha256sum; do
  command -v "$bin" >/dev/null 2>&1 || abort "required command not found: $bin"
done
if [ "$DRY_RUN" = false ]; then
  command -v gh >/dev/null 2>&1 || abort "required command not found: gh (it publishes the GitHub release)"
fi

# Release-mode guards. Skipped under --dry-run because local packaging tests
# legitimately run on dirty trees.
if [ "$DRY_RUN" = false ]; then
  if [ -n "$(git status --porcelain)" ]; then
    abort "working tree is not clean, commit before releasing"
  fi
  if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null 2>&1; then
    abort "tag $TAG already exists"
  fi
  if ! gh auth status >/dev/null 2>&1; then
    abort "gh is not authenticated; run \"gh auth login\" before releasing"
  fi
fi

echo "→ building workspaces…"
pnpm run build

echo "→ assembling deploy dir…"
rm -rf "$STAGING_DIR"

# pnpm deploy produces a portable package: the project's non-gitignored files
# plus a production-pruned node_modules with workspace dependencies
# (@workspace-welcome/*) materialized as real packages. Preferred mechanism is
# the --legacy implementation (works without inject-workspace-packages);
# plain deploy is retried, and only as a last resort the node_modules are
# produced via a deploy scoped to this single command through an environment
# variable (never by editing pnpm-workspace.yaml).
deploy_dir="" # set to the directory a successful deploy produced
if pnpm --filter web deploy --prod --legacy "$STAGING_DIR"; then
  deploy_dir="$STAGING_DIR"
  echo "  deploy mechanism: pnpm deploy --legacy"
elif pnpm --filter web deploy --prod "$STAGING_DIR"; then
  deploy_dir="$STAGING_DIR"
  echo "  deploy mechanism: pnpm deploy"
else
  echo "  pnpm deploy unavailable; assembling manually…"
  rm -rf "$STAGING_DIR"
  mkdir -p "$STAGING_DIR"
  cp -R "$REPO_ROOT/apps/web/dist" "$STAGING_DIR/dist"
  cp "$REPO_ROOT/apps/web/package.json" "$STAGING_DIR/package.json"
  cp "$REPO_ROOT/apps/web/serve-prod.mjs" "$STAGING_DIR/serve-prod.mjs"
  temp_deploy="$RELEASE_DIR/.deploy-temp"
  rm -rf "$temp_deploy"
  if ! npm_config_inject_workspace_packages=true pnpm --filter web deploy --prod "$temp_deploy"; then
    rm -rf "$temp_deploy"
    abort "could not produce a production node_modules with any pnpm deploy mode"
  fi
  mv "$temp_deploy/node_modules" "$STAGING_DIR/node_modules"
  rm -rf "$temp_deploy"
  deploy_dir="$STAGING_DIR"
  echo "  deploy mechanism: manual assembly + env-scoped pnpm deploy for node_modules"
fi

# Deploy respects apps/web/.gitignore, which excludes the build output, so
# dist/ and serve-prod.mjs are copied in explicitly (idempotent if the deploy
# already included them).
rm -rf "$deploy_dir/dist"
cp -R "$REPO_ROOT/apps/web/dist" "$deploy_dir/dist"
cp "$REPO_ROOT/apps/web/serve-prod.mjs" "$deploy_dir/serve-prod.mjs"
printf '%s\n' "$VERSION" >"$deploy_dir/VERSION"

# The deploy copies non-gitignored project sources (src/, configs); a release
# ships only the runtime. Drop every top-level entry outside this keep list.
for entry in "$deploy_dir"/* "$deploy_dir"/.[!.]* "$deploy_dir"/..?*; do
  [ -e "$entry" ] || continue
  name="$(basename "$entry")"
  if [[ ! "$name" =~ ^(dist|node_modules|package\.json|serve-prod\.mjs|VERSION|LICENSE.*|README.*)$ ]]; then
    rm -rf "$entry"
  fi
done

for required in dist/client dist/server/server.js serve-prod.mjs package.json node_modules node_modules/create-better-t-stack VERSION; do
  [ -e "$deploy_dir/$required" ] || abort "staging dir is missing required path: $required"
done
if [ -e "$deploy_dir/.env" ]; then
  rm -f "$deploy_dir/.env"
fi

echo "  staging dir contents:"
find "$deploy_dir" -mindepth 1 -maxdepth 1 -printf "    %f\n" | sort

# Boot test: the packaged tree must serve the dashboard on its own. This is
# the acceptance criterion for the packaging mechanism itself.
echo "→ boot-testing release at $BOOT_URL…"
BOOT_LOG="$RELEASE_DIR/boot-test.log"
SERVER_PID=""
PACK_DIR=""

stop_server() {
  [ -n "$SERVER_PID" ] || return 0
  kill "$SERVER_PID" 2>/dev/null || true
  for _ in $(seq 1 50); do
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 0.1
  done
  kill -0 "$SERVER_PID" 2>/dev/null && kill -9 "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    SERVER_PID=""
    abort "boot-test server process did not terminate"
  fi
  SERVER_PID=""
}

cleanup() {
  stop_server
  if [ -n "$PACK_DIR" ]; then
    rm -rf "$PACK_DIR"
  fi
}
trap cleanup EXIT

(
  cd "$STAGING_DIR"
  export PORT="$BOOT_PORT"
  export HOST=127.0.0.1
  exec node serve-prod.mjs
) >"$BOOT_LOG" 2>&1 &
SERVER_PID=$!

boot_ok=false
for _ in $(seq 1 60); do
  kill -0 "$SERVER_PID" 2>/dev/null || break # process exited during startup
  if curl -fsS "$BOOT_URL" 2>/dev/null | grep -qi '<html'; then
    boot_ok=true
    break
  fi
  sleep 1
done

if [ "$boot_ok" != true ]; then
  echo "error: boot test failed — server output:" >&2
  cat "$BOOT_LOG" >&2
  stop_server
  rm -f "$BOOT_LOG"
  exit 1
fi
echo "  boot test passed: HTTP 200 with HTML"
stop_server
rm -f "$BOOT_LOG"

echo "→ packing tarball…"
TARBALL="workspace-welcome-${VERSION}-linux${LIBC_SUFFIX}-${ARCH}.tar.gz"
TARBALL_PATH="$RELEASE_DIR/$TARBALL"
PACK_DIR="$RELEASE_DIR/.pack"
rm -rf "$PACK_DIR" "$TARBALL_PATH"
mkdir -p "$PACK_DIR/workspace-welcome"
# Hardlink copy (same filesystem, near-instant): tar then records clean
# "workspace-welcome/…" paths directly, with no name transforms and no
# stray "." root entry.
cp -al "$STAGING_DIR/." "$PACK_DIR/workspace-welcome/"
tar -czf "$TARBALL_PATH" \
  --sort=name --owner=0 --group=0 --numeric-owner \
  -C "$PACK_DIR" workspace-welcome
rm -rf "$PACK_DIR"
PACK_DIR=""

echo "→ writing checksums…"
(cd "$RELEASE_DIR" && sha256sum "$TARBALL" >SHA256SUMS.txt)

UPLOAD_CMD=(gh release create "$TAG" "release/$TARBALL" release/SHA256SUMS.txt --title "$TAG" --generate-notes --latest)
RELEASE_URL=""
if [ "$DRY_RUN" = true ]; then
  echo "→ dry run: GitHub upload skipped. Command to execute:"
  printf '  %s\n' "${UPLOAD_CMD[*]}"
else
  echo "→ creating GitHub release $TAG…"
  RELEASE_URL="$("${UPLOAD_CMD[@]}")"
fi

rm -rf "$STAGING_DIR"

echo
echo "Release summary"
echo "---------------"
echo "  version:  $VERSION (tag $TAG)"
echo "  tarball:  $TARBALL_PATH ($(du -h "$TARBALL_PATH" | cut -f1))"
echo "  checksum: $(cat "$RELEASE_DIR/SHA256SUMS.txt")"
if [ "$DRY_RUN" = true ]; then
  echo "  mode:     dry run (guards and upload skipped)"
else
  echo "  release:  $RELEASE_URL"
fi
