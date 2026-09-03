#!/usr/bin/env bash
# End-to-end install test for workspace-welcome (scripts/install.sh).
#
# Proves that the published release installs and runs as a systemd USER
# service inside a fresh container: boots fedora:latest with systemd as
# PID 1 (privileged, NO published ports — every HTTP assertion runs inside
# the container), creates a normal user with a real systemd user session
# (linger), copies scripts/install.sh in, and walks the full lifecycle:
# dry-run -> install (+ service + HTTP 200) -> upgrade (rollback dir,
# .env preserved) -> uninstall (app gone, user config kept) -> purge
# (user config gone too).
#
# Modes:
#   default (release) — tests the real published release: resolves the
#     latest tag via GitHub's releases/latest redirect and downloads the
#     tarball + SHA256SUMS.txt from GitHub Releases inside the container.
#   --local — builds a tarball with `pnpm run release <ver> --dry-run`,
#     serves release/ over a throwaway HTTP mirror, and installs from it
#     via the installer's --mirror path.
#
# The installer under test is never modified; this script only reads it.
# Teardown (EXIT trap) removes the container and the mirror unconditionally
# unless --keep was given.
#
# Usage: bash scripts/test-install.sh [--local] [--version vX.Y.Z]
#                                     [--runtime docker|podman] [--keep]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALLER_PATH="$REPO_ROOT/scripts/install.sh"
RELEASE_DIR="$REPO_ROOT/release"
LATEST_URL="https://github.com/DimitriGilbert/workspace-welcome/releases/latest"
IMAGE="fedora:latest"
TEST_USER="wwtest"
USER_HOME="/home/$TEST_USER"
DATA_DIR="$USER_HOME/.local/share/workspace-welcome"
CONFIG_DIR="$USER_HOME/.config/workspace-welcome"
INSTALL_DIR="$DATA_DIR/app"
UNIT_FILE="$USER_HOME/.config/systemd/user/workspace-welcome.service"
DASHBOARD_URL="http://127.0.0.1:37420/"

LOCAL_MODE=false
KEEP=false
RUNTIME_REQUESTED=""
RUNTIME=""
VERSION="" # as passed/resolved; may carry a leading "v"
VERSION_PLAIN=""
MODE="release"
CONTAINER=""
TEST_UID=""
RUNTIME_DIR=""
MIRROR_PID=""
MIRROR_PORT=""
MIRROR_URL=""
WORK_DIR=""

STEP_ORDER=()
declare -A STEP_STATUS=()

usage() {
  cat <<EOF
Usage: bash scripts/test-install.sh [options]

End-to-end test: installs workspace-welcome from a release into a fresh
fedora container and verifies the systemd user service serves the dashboard.

Options:
  --local          Test a locally built tarball (pnpm run release <ver>
                   --dry-run) via a throwaway HTTP mirror instead of the
                   published GitHub release.
  --version vX.Y.Z Pin the version to test. Default: latest published
                   release (release mode) or 0.1.0 (--local).
  --runtime R      docker or podman. Default: docker if its daemon answers,
                   else podman.
  --keep           Keep the container after the run (for debugging); its
                   name is printed in the summary.
  -h, --help       Show this help.
EOF
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found on the host: $1"
}

record() {
  # $1: step name, $2: PASS|FAIL
  STEP_ORDER+=("$1")
  STEP_STATUS["$1"]="$2"
  printf '  [%s] %s\n' "$2" "$1"
}

fail() {
  # $1: assertion message, $2: optional log file whose tail is printed.
  local message="$1"
  local log_file="${2:-}"
  printf '\nFAIL: %s\n' "$message" >&2
  if [ -n "$log_file" ] && [ -f "$log_file" ]; then
    printf -- '--- tail of %s ---\n' "$log_file" >&2
    tail -n 40 "$log_file" >&2
  fi
  dump_diagnostics
  record "$CURRENT_STEP" FAIL
  exit 1
}

CURRENT_STEP=""

begin_step() {
  CURRENT_STEP="$1"
  printf '\n--> %s\n' "$1"
}

# Container exec helpers. Every user-level call exports HOME and
# XDG_RUNTIME_DIR explicitly: docker/podman exec starts no login session,
# and `systemctl --user` depends on XDG_RUNTIME_DIR pointing at the user
# manager's runtime dir.
cexec() {
  "$RUNTIME" exec "$CONTAINER" "$@"
}

cuser() {
  "$RUNTIME" exec -u "$TEST_USER" \
    -e "HOME=$USER_HOME" \
    -e "XDG_RUNTIME_DIR=$RUNTIME_DIR" \
    -w "$USER_HOME" \
    "$CONTAINER" "$@"
}

dump_diagnostics() {
  printf -- '--- journalctl --user -u workspace-welcome (container) ---\n' >&2
  cuser sh -c "journalctl --user -u workspace-welcome -n 50 --no-pager 2>&1 || true" 1>&2 || true
  printf -- '--- %s logs (tail) ---\n' "$RUNTIME" >&2
  "$RUNTIME" logs --tail 30 "$CONTAINER" 1>&2 || true
}

wait_http_200() {
  # Polled from INSIDE the container only; the host never reaches the app.
  local attempt
  for attempt in $(seq 1 30); do
    if cuser curl -fsS -o /dev/null "$DASHBOARD_URL" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

assert_service_active() {
  local state
  state="$(cuser sh -c "systemctl --user is-active workspace-welcome.service 2>&1" || true)"
  [ "$state" = "active" ]
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --local)
        LOCAL_MODE=true
        ;;
      --keep)
        KEEP=true
        ;;
      --version)
        [ $# -ge 2 ] || { usage >&2; die "--version requires a value"; }
        VERSION="$2"
        shift
        ;;
      --runtime)
        [ $# -ge 2 ] || { usage >&2; die "--runtime requires a value (docker or podman)"; }
        RUNTIME_REQUESTED="$2"
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        usage >&2
        die "unknown option: $1"
        ;;
    esac
    shift
  done
}

detect_runtime() {
  begin_step "setup: detect container runtime"
  case "$RUNTIME_REQUESTED" in
    "") ;;
    docker | podman) RUNTIME="$RUNTIME_REQUESTED" ;;
    *) die "unknown --runtime '$RUNTIME_REQUESTED' — use docker or podman" ;;
  esac
  if [ -z "$RUNTIME" ]; then
    if docker info >/dev/null 2>&1; then
      RUNTIME=docker
    elif command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1; then
      RUNTIME=podman
    else
      die "no usable container runtime — start the docker daemon or install podman"
    fi
  fi
  need "$RUNTIME"
  "$RUNTIME" info >/dev/null 2>&1 || die "$RUNTIME is installed but its engine is not reachable"
  record "setup: detect container runtime ($RUNTIME)" PASS
}

validate_version() {
  printf '%s' "$VERSION" | grep -Eq '^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' ||
    die "'$VERSION' is not a valid version — expected vX.Y.Z or X.Y.Z"
  VERSION_PLAIN="${VERSION#v}"
}

resolve_version() {
  if [ "$LOCAL_MODE" = true ]; then
    MODE="local"
    if [ -z "$VERSION" ]; then
      VERSION="0.1.0"
    fi
    validate_version
    return 0
  fi
  if [ -z "$VERSION" ]; then
    begin_step "setup: resolve latest published release"
    local effective
    effective="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$LATEST_URL")" ||
      die "could not resolve the latest published release from $LATEST_URL"
    VERSION="${effective##*/}"
    record "setup: resolve latest published release ($VERSION)" PASS
  fi
  validate_version
}

build_local_release() {
  # Packs the same artifact release.sh ships, without uploading anything.
  begin_step "setup: build local release tarball (pnpm run release $VERSION_PLAIN --dry-run)"
  need pnpm
  need python3
  local log="$WORK_DIR/release-build.log"
  if ! (cd "$REPO_ROOT" && pnpm run release "$VERSION_PLAIN" --dry-run) >"$log" 2>&1; then
    fail "pnpm run release $VERSION_PLAIN --dry-run failed" "$log"
  fi
  local tarball="$RELEASE_DIR/workspace-welcome-$VERSION_PLAIN-linux-x64.tar.gz"
  if [ ! -f "$tarball" ] || [ ! -f "$RELEASE_DIR/SHA256SUMS.txt" ]; then
    fail "release build did not produce $tarball and SHA256SUMS.txt" "$log"
  fi
  record "setup: build local release tarball" PASS
}

start_mirror() {
  begin_step "setup: local mirror serving release/"
  local mirror_py="$WORK_DIR/mirror.py"
  cat >"$mirror_py" <<'PY'
import functools
import http.server
import sys

def main() -> int:
    directory, port_file = sys.argv[1], sys.argv[2]
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)
    server = http.server.ThreadingHTTPServer(("0.0.0.0", 0), handler)
    with open(port_file, "w", encoding="utf-8") as fh:
        fh.write(str(server.server_address[1]))
    server.serve_forever()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
PY
  local port_file="$WORK_DIR/mirror.port"
  python3 "$mirror_py" "$RELEASE_DIR" "$port_file" >"$WORK_DIR/mirror.log" 2>&1 &
  MIRROR_PID=$!
  local attempt
  for attempt in $(seq 1 50); do
    if [ -s "$port_file" ]; then
      break
    fi
    if ! kill -0 "$MIRROR_PID" 2>/dev/null; then
      fail "mirror process exited before binding a port" "$WORK_DIR/mirror.log"
    fi
    sleep 0.1
  done
  if [ ! -s "$port_file" ]; then
    fail "mirror did not report its port in time" "$WORK_DIR/mirror.log"
  fi
  MIRROR_PORT="$(cat "$port_file")"
  if ! curl -fsS -o /dev/null "http://127.0.0.1:$MIRROR_PORT/SHA256SUMS.txt"; then
    fail "mirror is not answering on the host at 127.0.0.1:$MIRROR_PORT" "$WORK_DIR/mirror.log"
  fi
  record "setup: local mirror serving release/ (host 127.0.0.1:$MIRROR_PORT)" PASS
}

connect_mirror() {
  # The container must be able to fetch the mirror. Docker gets a
  # host.docker.internal -> host-gateway mapping; podman provides
  # host.containers.internal natively. If the host firewall blocks the
  # bridge, fall back to serving the release dir from inside the container
  # (the installer still downloads over HTTP and verifies the checksum).
  begin_step "setup: mirror reachable from the container"
  local alias="host.containers.internal"
  if [ "$RUNTIME" = docker ]; then
    alias="host.docker.internal"
  fi
  MIRROR_URL="http://$alias:$MIRROR_PORT"
  if cexec curl -fsS -o /dev/null --max-time 5 "$MIRROR_URL/SHA256SUMS.txt" 2>/dev/null; then
    record "setup: mirror reachable from the container ($MIRROR_URL)" PASS
    return 0
  fi
  printf '    host-gateway route to the mirror is blocked; serving from inside the container instead\n'
  cexec dnf -y install python3 >"$WORK_DIR/mirror-fallback-dnf.log" 2>&1 ||
    fail "could not install python3 in the container for the in-container mirror" "$WORK_DIR/mirror-fallback-dnf.log"
  cexec mkdir -p /opt/ww-mirror || fail "could not create /opt/ww-mirror in the container"
  "$RUNTIME" cp "$RELEASE_DIR/." "$CONTAINER:/opt/ww-mirror/" ||
    fail "could not copy the release dir into the container"
  cexec sh -c "cd /opt/ww-mirror && nohup python3 -m http.server 8765 --bind 127.0.0.1 >/var/log/ww-mirror.log 2>&1 &" ||
    fail "could not start the in-container mirror"
  MIRROR_URL="http://127.0.0.1:8765"
  local attempt
  for attempt in $(seq 1 20); do
    if cexec curl -fsS -o /dev/null --max-time 3 "$MIRROR_URL/SHA256SUMS.txt" 2>/dev/null; then
      record "setup: mirror reachable from the container (in-container $MIRROR_URL)" PASS
      return 0
    fi
    sleep 1
  done
  fail "in-container mirror did not come up"
}

start_container() {
  begin_step "setup: boot $IMAGE with systemd as PID 1"
  if ! "$RUNTIME" image inspect "$IMAGE" >/dev/null 2>&1; then
    "$RUNTIME" pull "$IMAGE" >/dev/null || fail "could not pull $IMAGE"
  fi
  CONTAINER="ww-install-e2e-$(date +%s)-$$"
  # fedora:latest ships without systemd, so the container's first PID 1 is a
  # shell that installs systemd and then execs /sbin/init in place. The
  # container is privileged from the start so systemd gets a usable cgroup
  # view. NO ports are published — every HTTP assertion runs in-container.
  # dnf output goes to the container console so `docker logs` shows it.
  local bootstrap='dnf -y install systemd && exec /sbin/init'
  case "$RUNTIME" in
    docker)
      docker run -d --privileged --name "$CONTAINER" \
        --add-host host.docker.internal:host-gateway \
        "$IMAGE" /bin/bash -c "$bootstrap" >/dev/null ||
        fail "docker run failed for $IMAGE"
      ;;
    podman)
      podman run -d --privileged --name "$CONTAINER" \
        "$IMAGE" /bin/bash -c "$bootstrap" >/dev/null ||
        fail "podman run failed for $IMAGE"
      ;;
  esac

  # The first ~2 minutes can be the dnf bootstrap; systemd then needs a few
  # more seconds to reach running/degraded (both are usable by the installer).
  local state=""
  local attempt
  for attempt in $(seq 1 360); do
    if [ "$("$RUNTIME" inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" != "true" ]; then
      fail "container exited during systemd bootstrap"
    fi
    state="$(cexec sh -c "systemctl is-system-running 2>&1" || true)"
    if [ "$state" = "running" ] || [ "$state" = "degraded" ]; then
      break
    fi
    sleep 1
  done
  if [ "$state" != "running" ] && [ "$state" != "degraded" ]; then
    fail "systemd inside the container did not become ready (last state: ${state:-none})"
  fi
  record "setup: boot $IMAGE with systemd as PID 1" PASS
}

install_container_packages() {
  begin_step "setup: dnf install nodejs curl tar"
  cexec dnf -y install nodejs curl tar >"$WORK_DIR/dnf.log" 2>&1 ||
    fail "dnf install nodejs curl tar failed inside the container" "$WORK_DIR/dnf.log"
  record "setup: dnf install nodejs curl tar" PASS

  begin_step "setup: container node is >= 22"
  local node_version
  node_version="$(cexec sh -c 'node -p "process.versions.node"')" ||
    fail "node is not usable inside the container"
  local major="${node_version%%.*}"
  if [ "$major" -lt 22 ]; then
    fail "container node is $node_version but workspace-welcome needs >= 22"
  fi
  record "setup: container node is >= 22 ($node_version)" PASS
}

create_user_session() {
  begin_step "setup: user $TEST_USER + systemd user session (linger)"
  cexec useradd -m -s /bin/bash "$TEST_USER" ||
    fail "could not create user $TEST_USER inside the container"
  TEST_UID="$(cexec id -u "$TEST_USER")"
  RUNTIME_DIR="/run/user/$TEST_UID"
  # loginctl needs logind; in containers it may be absent. The linger marker
  # plus an explicit user@.service start work without it.
  cexec loginctl enable-linger "$TEST_USER" >/dev/null 2>&1 || true
  cexec sh -c "mkdir -p /var/lib/systemd/linger && touch /var/lib/systemd/linger/$TEST_USER" ||
    fail "could not write the linger marker for $TEST_USER"
  cexec systemctl start "user@$TEST_UID.service" ||
    fail "could not start user@$TEST_UID.service inside the container"

  local state=""
  local attempt
  for attempt in $(seq 1 60); do
    state="$(cuser sh -c "systemctl --user is-system-running 2>&1" || true)"
    if [ "$state" = "running" ] || [ "$state" = "degraded" ]; then
      break
    fi
    sleep 1
  done
  if [ "$state" != "running" ] && [ "$state" != "degraded" ]; then
    fail "systemd user session for $TEST_USER did not become ready (last state: ${state:-none})"
  fi
  record "setup: user $TEST_USER + systemd user session (uid $TEST_UID, state $state)" PASS
}

copy_installer() {
  begin_step "setup: copy scripts/install.sh into the container"
  [ -f "$INSTALLER_PATH" ] || die "installer not found at $INSTALLER_PATH"
  "$RUNTIME" cp "$INSTALLER_PATH" "$CONTAINER:$USER_HOME/install.sh" ||
    fail "could not copy the installer into the container"
  cexec chown "$TEST_USER:$TEST_USER" "$USER_HOME/install.sh" &&
    cexec chmod 755 "$USER_HOME/install.sh" ||
    fail "could not make the installer executable for $TEST_USER"
  record "setup: copy scripts/install.sh into the container" PASS
}

seed_config_sentinel() {
  # The app creates ~/.config/workspace-welcome lazily; seeding a sentinel
  # makes the "uninstall keeps user config" / "purge removes it" assertions
  # deterministic. The app only ever reads store.json here, so a stray file
  # is inert. Runs as wwtest: ~/.config must be user-owned or the installer
  # could not create ~/.config/systemd/user later.
  cuser sh -c "mkdir -p '$CONFIG_DIR' && printf 'sentinel\n' > '$CONFIG_DIR/ww-e2e-sentinel'" ||
    fail "could not seed the config sentinel"
}

run_installer() {
  # All installer invocations go through here; extra mode args first.
  local log_name="$1"
  shift
  local -a args=("sh" "$USER_HOME/install.sh")
  if [ "$MODE" = "local" ]; then
    args+=("--mirror" "$MIRROR_URL" "--version" "v$VERSION_PLAIN")
  else
    args+=("--version" "$VERSION")
  fi
  args+=("$@")
  printf '    $ install.sh %s\n' "${args[*]:2}"
  cuser "${args[@]}" >"$WORK_DIR/$log_name.log" 2>&1
}

phase_dry_run() {
  begin_step "a: dry-run installs nothing"
  if ! run_installer "dry-run" --dry-run; then
    fail "installer --dry-run exited non-zero" "$WORK_DIR/dry-run.log"
  fi
  record "a: dry-run exits 0" PASS
  if ! cuser test -e "$INSTALL_DIR"; then
    record "a: dry-run leaves no install dir" PASS
  else
    fail "--dry-run created the install dir $INSTALL_DIR" "$WORK_DIR/dry-run.log"
  fi
}

phase_install() {
  begin_step "b: real install (service + dashboard up)"
  if ! run_installer "install"; then
    fail "installer exited non-zero" "$WORK_DIR/install.log"
  fi
  record "b: install exits 0" PASS

  if assert_service_active; then
    record "b: workspace-welcome.service is active" PASS
  else
    fail "workspace-welcome.service is not active after install" "$WORK_DIR/install.log"
  fi

  if wait_http_200; then
    record "b: dashboard answers HTTP 200 inside the container" PASS
  else
    fail "dashboard did not answer 200 on $DASHBOARD_URL within 30s (checked inside the container)" "$WORK_DIR/install.log"
  fi

  local installed_version
  installed_version="$(cuser cat "$INSTALL_DIR/VERSION")" ||
    fail "could not read $INSTALL_DIR/VERSION"
  if [ "$installed_version" = "$VERSION_PLAIN" ]; then
    record "b: VERSION file matches $VERSION_PLAIN" PASS
  else
    fail "VERSION file says '$installed_version', expected '$VERSION_PLAIN'"
  fi

  if cuser sh -c "grep -q '^PORT=' '$INSTALL_DIR/.env' && grep -q '^HOST=' '$INSTALL_DIR/.env'"; then
    record "b: .env exists with PORT and HOST lines" PASS
  else
    fail "$INSTALL_DIR/.env is missing or lacks PORT=/HOST= lines"
  fi

  if ! cuser test -e "$INSTALL_DIR.bak"; then
    record "b: no app.bak after first install" PASS
  else
    fail "$INSTALL_DIR.bak exists after the first install"
  fi
}

phase_upgrade() {
  begin_step "c: upgrade keeps .env and gains app.bak"
  cuser sh -c "printf 'WW_E2E_MARKER=1\n' >> '$INSTALL_DIR/.env'" ||
    fail "could not append the marker to .env"

  if ! run_installer "upgrade"; then
    fail "installer (upgrade re-run) exited non-zero" "$WORK_DIR/upgrade.log"
  fi
  record "c: upgrade exits 0" PASS

  if cuser test -e "$INSTALL_DIR.bak"; then
    record "c: app.bak exists after upgrade" PASS
  else
    fail "$INSTALL_DIR.bak missing after upgrade re-run"
  fi

  if cuser sh -c "grep -q '^WW_E2E_MARKER=1$' '$INSTALL_DIR/.env'"; then
    record "c: .env marker survived the upgrade" PASS
  else
    fail "the .env marker line was lost during upgrade"
  fi

  if assert_service_active; then
    record "c: service still active after upgrade" PASS
  else
    fail "workspace-welcome.service is not active after upgrade" "$WORK_DIR/upgrade.log"
  fi

  if wait_http_200; then
    record "c: dashboard still answers HTTP 200 after upgrade" PASS
  else
    fail "dashboard did not answer 200 after upgrade" "$WORK_DIR/upgrade.log"
  fi
}

phase_uninstall() {
  begin_step "d: uninstall removes the app, keeps user config"
  if ! run_installer "uninstall" --uninstall; then
    fail "installer --uninstall exited non-zero" "$WORK_DIR/uninstall.log"
  fi
  record "d: uninstall exits 0" PASS

  local state
  state="$(cuser sh -c "systemctl --user is-active workspace-welcome.service 2>&1" || true)"
  if [ "$state" = "inactive" ]; then
    record "d: unit is no longer active" PASS
  else
    fail "unit state after uninstall is '$state', expected 'inactive'"
  fi

  if ! cuser test -e "$UNIT_FILE"; then
    record "d: unit file removed" PASS
  else
    fail "unit file $UNIT_FILE still exists after uninstall"
  fi

  if ! cuser test -e "$INSTALL_DIR" && ! cuser test -e "$INSTALL_DIR.bak"; then
    record "d: install dir and app.bak removed" PASS
  else
    fail "install dir or app.bak still present after uninstall"
  fi

  if cuser sh -c "test -f '$CONFIG_DIR/ww-e2e-sentinel'"; then
    record "d: user config dir kept" PASS
  else
    fail "$CONFIG_DIR (user config) was removed by --uninstall"
  fi
}

phase_purge() {
  begin_step "e: purge removes user config too"
  if ! run_installer "purge" --purge --yes; then
    fail "installer --purge --yes exited non-zero" "$WORK_DIR/purge.log"
  fi
  record "e: purge exits 0" PASS

  if ! cuser test -e "$CONFIG_DIR"; then
    record "e: user config dir removed" PASS
  else
    fail "$CONFIG_DIR still exists after --purge --yes"
  fi

  if ! cuser test -e "$UNIT_FILE" && ! cuser test -e "$INSTALL_DIR"; then
    record "e: app and unit still gone" PASS
  else
    fail "unit or install dir reappeared after purge"
  fi
}

print_summary() {
  local name overall="PASS"
  echo
  echo "=============================================================="
  printf 'E2E install test — mode: %s | version: %s | runtime: %s\n' "$MODE" "${VERSION:-?}" "${RUNTIME:-?}"
  echo "--------------------------------------------------------------"
  for name in "${STEP_ORDER[@]}"; do
    printf '  [%s] %s\n' "${STEP_STATUS[$name]}" "$name"
    if [ "${STEP_STATUS[$name]}" != "PASS" ]; then
      overall="FAIL"
    fi
  done
  echo "=============================================================="
  if [ "$overall" = "PASS" ]; then
    echo "RESULT: PASS"
  else
    echo "RESULT: FAIL"
  fi
  if [ "$KEEP" = true ] && [ -n "$CONTAINER" ]; then
    echo "container kept for debugging: $CONTAINER"
  fi
}

cleanup() {
  local rc=$?
  if [ -n "$MIRROR_PID" ]; then
    kill "$MIRROR_PID" 2>/dev/null || true
    wait "$MIRROR_PID" 2>/dev/null || true
    MIRROR_PID=""
  fi
  if [ -n "$CONTAINER" ] && [ "$KEEP" != true ] && [ -n "$RUNTIME" ]; then
    "$RUNTIME" rm -f "$CONTAINER" >/dev/null 2>&1 || true
    CONTAINER=""
  fi
  if [ -n "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
  if [ "${#STEP_ORDER[@]}" -gt 0 ]; then
    print_summary
  fi
  return "$rc"
}

main() {
  parse_args "$@"
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  WORK_DIR="$(mktemp -d /tmp/ww-install-e2e.XXXXXX)"
  need curl
  detect_runtime
  resolve_version

  if [ "$LOCAL_MODE" = true ]; then
    build_local_release
    start_mirror
  fi

  start_container
  install_container_packages
  create_user_session
  copy_installer
  seed_config_sentinel
  if [ "$LOCAL_MODE" = true ]; then
    connect_mirror
  fi

  phase_dry_run
  phase_install
  phase_upgrade
  phase_uninstall
  phase_purge
}

main "$@"
