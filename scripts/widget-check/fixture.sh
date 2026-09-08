#!/usr/bin/env bash
# fixture.sh — deterministic git fixture for the widget-check harness
# (master plan §3.8 / M2.6).
#
#   fixture.sh create          build $TMPDIR/ww-check-fixture/ and print its path
#   fixture.sh destroy [path]  remove the fixture (refuses while the app's roots
#                              list still references it; --force overrides)
#   fixture.sh guard <path>    ROOTS-HYGIENE GUARD — reads the app's persisted
#                              roots list and aborts unless it is fixture-only
#
# The fixture is a git repo with 3 commits at pinned GIT_AUTHOR_DATE /
# GIT_COMMITTER_DATE (deterministic history for commit-log assertions), a
# byte-identical package.json every run, and one tracked-but-modified file
# (the dirty state). Git mutations during harness runs happen ONLY inside
# this directory: the guard is what makes that claim checkable — it fails
# closed (non-zero) unless every root in the store lives under the fixture.
set -euo pipefail

FIXTURE_NAME="ww-check-fixture"
FIXTURE_DIR="${TMPDIR:-/tmp}/${FIXTURE_NAME}"
STORE_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/workspace-welcome/store.json"

PINNED_DATES=(
  "2025-01-15T09:00:00+00:00"
  "2025-01-15T10:30:00+00:00"
  "2025-01-15T14:45:00+00:00"
)

die() { printf 'fixture.sh: %s\n' "$1" >&2; exit "${2:-1}"; }

commit_at() {
  # commit_at <date> <message>
  GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" \
  GIT_AUTHOR_NAME="ww-check-fixture" GIT_AUTHOR_EMAIL="fixture@ww-check.invalid" \
  GIT_COMMITTER_NAME="ww-check-fixture" GIT_COMMITTER_EMAIL="fixture@ww-check.invalid" \
    git commit -q -m "$2"
}

store_root_paths() {
  # Print every root path from the app's persisted store, one per line.
  [ -f "$STORE_PATH" ] || return 0
  node -e '
    const store = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    for (const root of Array.isArray(store.roots) ? store.roots : []) {
      if (root !== null && typeof root === "object" && typeof root.path === "string") {
        console.log(root.path);
      }
    }
  ' "$STORE_PATH"
}

cmd_create() {
  rm -rf "$FIXTURE_DIR"
  mkdir -p "$FIXTURE_DIR"
  cd "$FIXTURE_DIR"
  git init -q -b main

  printf '%s\n' '{"name":"ww-check-fixture","version":"1.0.0","private":true,"scripts":{"build":"true"}}' > package.json
  printf '%s\n' "# ww-check-fixture" "" "Deterministic fixture repo — created by scripts/widget-check/fixture.sh." > README.md
  printf '%s\n' "const greeting = \"hello from the fixture\";" "" "export default greeting;" > main.js
  git add package.json README.md main.js
  commit_at "${PINNED_DATES[0]}" "feat: deterministic initial commit"

  printf '%s\n' "const greeting = \"hello from the fixture\";" "" "export default greeting;" "" "export const version = 2;" > main.js
  git add main.js
  commit_at "${PINNED_DATES[1]}" "feat: export version"

  printf '%s\n' "# ww-check-fixture" "" "Deterministic fixture repo — created by scripts/widget-check/fixture.sh." "" "- three pinned commits" > README.md
  printf '%s\n' "notes" > notes.txt
  git add README.md notes.txt
  commit_at "${PINNED_DATES[2]}" "docs: note-taking"

  # The dirty file: tracked, then modified without a commit.
  printf '%s\n' "notes" "modified but uncommitted — the fixture's dirty state" > notes.txt

  printf '%s\n' "$FIXTURE_DIR"
}

cmd_destroy() {
  local force="${1:-}"
  local path="${1:-$FIXTURE_DIR}"
  if [ "$force" = "--force" ]; then
    path="${2:-$FIXTURE_DIR}"
  fi
  local canonical
  canonical="$(cd "$(dirname "$path")" && pwd)/$(basename "$path")"
  case "$canonical" in
    */"$FIXTURE_NAME") ;; # only ever remove a fixture-named directory
    *) die "refusing to remove non-fixture path: $canonical" 2 ;;
  esac

  if [ "$force" != "--force" ]; then
    while IFS= read -r rootPath; do
      [ -n "$rootPath" ] || continue
      case "$rootPath" in
        "$canonical"/*) die "roots list still references the fixture ($rootPath) — remove it through the add-root dialog first, or use --force" 4 ;;
      esac
    done < <(store_root_paths)
  fi
  rm -rf "$canonical"
  printf '%s\n' "removed $canonical"
}

cmd_guard() {
  local fixture="${1:-}"
  [ -n "$fixture" ] || die "guard needs the fixture path (output of: fixture.sh create)" 2
  [ -d "$fixture" ] || die "fixture directory does not exist: $fixture" 2

  local fixtureCanon
  fixtureCanon="$(cd "$fixture" && pwd)"
  local count=0
  while IFS= read -r rootPath; do
    [ -n "$rootPath" ] || continue
    count=$((count + 1))
    local resolved="$rootPath"
    if [ -d "$rootPath" ]; then
      resolved="$(cd "$rootPath" && pwd)"
    fi
    case "$resolved" in
      "$fixtureCanon"/*|"$fixtureCanon") ;;
      *) die "ROOTS-HYGIENE: roots list contains a non-fixture root ($rootPath) — git mutations would touch real projects; aborting" 3 ;;
    esac
  done < <(store_root_paths)
  printf 'guard: roots list is fixture-only (%d root(s) checked)\n' "$count"
}

case "${1:-}" in
  create) shift; cmd_create "$@" ;;
  destroy) shift; cmd_destroy "$@" ;;
  guard) shift; cmd_guard "$@" ;;
  *)
    printf 'usage: fixture.sh create | destroy [--force] [path] | guard <fixture-path>\n' >&2
    exit 2
    ;;
esac
