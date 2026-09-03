#!/bin/sh
# Installer for workspace-welcome — a local projects dashboard.
#
# Downloads a release tarball (+ SHA256SUMS.txt) from GitHub Releases (or a
# --mirror), verifies it, installs it into
# ${XDG_DATA_HOME:-$HOME/.local/share}/workspace-welcome/app, and (on Linux
# with a usable systemd user session) installs a systemd user unit that runs
# `node serve-prod.mjs` on http://127.0.0.1:37420.
#
# User state lives in app-owned directories that install/upgrade NEVER touch:
#   config: ${XDG_CONFIG_HOME:-$HOME/.config}/workspace-welcome   (store.json)
#   cache:  ${XDG_CACHE_HOME:-$HOME/.cache}/workspace-welcome
#   data:   ${XDG_DATA_HOME:-$HOME/.local/share}/workspace-welcome/ide/
# Only --purge (with --yes) removes them.
#
# Usage: sh scripts/install.sh --help
set -eu

REPO="DimitriGilbert/workspace-welcome"
BASE_URL="https://github.com/$REPO/releases/download"
LATEST_URL="https://github.com/$REPO/releases/latest"
DEFAULT_PORT=37420
DEFAULT_HOST=127.0.0.1
ONE_LINER="curl -fsSL https://welcome-workspace.dbuild.dev/install.sh | sh"

usage() {
  cat <<EOF
workspace-welcome installer — local projects dashboard

Usage:
  sh install.sh [options]

Options (a flag wins over its environment variable):
  --version V    Install a pinned release, e.g. --version v0.1.0   [env: WW_VERSION]
  --dir P        Installation directory
                 (default: \${XDG_DATA_HOME:-\$HOME/.local/share}/workspace-welcome/app)   [env: WW_INSTALL_DIR]
  --mirror U     Download base URL serving release files at <U>/<filename>;
                 requires an explicit --version   [env: WW_MIRROR]
  --port N       Port the dashboard binds to (default: 37420)   [env: WW_PORT]
  --host H       Address the dashboard binds to (default: 127.0.0.1)   [env: WW_HOST]
  --no-service   Skip the systemd user service (implicit on macOS)
  --uninstall    Remove the app; your config and cache are kept
  --purge        Uninstall AND remove config, cache, and data (requires --yes)
  --yes          Assume yes where a confirmation would be asked
  --dry-run      Print everything that would happen; change nothing
  -h, --help     Show this help

Examples:
  # one-liner: install or upgrade the latest release (+ systemd user service)
  $ONE_LINER

  # pinned version without a service
  sh install.sh --version v0.1.0 --no-service

  # preview every step without touching anything
  sh install.sh --dry-run

  # remove the app; then remove everything including config/cache/data
  sh install.sh --uninstall
  sh install.sh --purge --yes
EOF
}

abort() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '==> %s\n' "$*"
}

detail() {
  printf '    %s\n' "$*"
}

cleanup() {
  # Removes the download temp dir; no-op when it was never created (dry-run).
  if [ -n "$tmp_dir" ]; then
    rm -rf "$tmp_dir"
  fi
}

parse_args() {
  while [ $# -gt 0 ]; do
    case $1 in
      -h|--help)
        usage
        exit 0
        ;;
      --version)
        [ $# -ge 2 ] || { usage >&2; abort "option $1 requires a value"; }
        version=$2
        shift
        ;;
      --dir)
        [ $# -ge 2 ] || { usage >&2; abort "option $1 requires a value"; }
        install_dir=$2
        shift
        ;;
      --mirror)
        [ $# -ge 2 ] || { usage >&2; abort "option $1 requires a value"; }
        mirror=$2
        shift
        ;;
      --port)
        [ $# -ge 2 ] || { usage >&2; abort "option $1 requires a value"; }
        port=$2
        shift
        ;;
      --host)
        [ $# -ge 2 ] || { usage >&2; abort "option $1 requires a value"; }
        host=$2
        shift
        ;;
      --no-service)
        no_service=true
        ;;
      --uninstall)
        uninstall=true
        ;;
      --purge)
        purge=true
        uninstall=true
        ;;
      --yes)
        yes=true
        ;;
      --dry-run)
        dry_run=true
        ;;
      *)
        usage >&2
        abort "unknown option: $1"
        ;;
    esac
    shift
  done
}

resolve_settings() {
  mirror=${mirror%/}
  if [ -z "$install_dir" ]; then
    install_dir="$data_dir/app"
  fi
  case $install_dir in
    /*) : ;;
    *) install_dir="$PWD/$install_dir" ;;
  esac
  case $port in
    ''|*[!0-9]*) abort "invalid port '$port' — pass a number via --port (or WW_PORT)" ;;
  esac
  if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    abort "invalid port '$port' — it must be between 1 and 65535"
  fi
  if [ -z "$host" ]; then
    abort "invalid host '' — pass a hostname or IP via --host (or WW_HOST)"
  fi
  # For wildcard/loopback binds the port probe targets the loopback address
  # and the dashboard is advertised as http://localhost:$port; any other
  # --host is probed and advertised verbatim.
  case $host in
    127.0.0.1|0.0.0.0|::|::1)
      probe_host=127.0.0.1
      dashboard_url="http://localhost:$port"
      ;;
    *)
      probe_host=$host
      dashboard_url="http://$host:$port"
      ;;
  esac
}

check_requirements() {
  log "Checking requirements"
  if command -v curl >/dev/null 2>&1; then
    downloader=curl
  elif command -v wget >/dev/null 2>&1; then
    downloader=wget
  else
    abort "neither curl nor wget is installed — install one (e.g. 'apt install curl', 'dnf install curl', or 'brew install curl') and re-run"
  fi
  command -v tar >/dev/null 2>&1 ||
    abort "tar is not installed — install it via your package manager and re-run"
  if command -v sha256sum >/dev/null 2>&1; then
    sha_cmd=sha256sum
    sha_args=""
  elif command -v shasum >/dev/null 2>&1; then
    sha_cmd=shasum
    sha_args="-a 256"
  else
    abort "neither sha256sum nor shasum is installed — one of them is needed to verify the download; install it and re-run"
  fi
  if command -v node >/dev/null 2>&1; then
    node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null) || node_major=""
    if [ -z "$node_major" ]; then
      abort "node is present but its version could not be read — fix your Node install and re-run"
    fi
    if [ "$node_major" -lt 22 ]; then
      node_full=$(node -p 'process.versions.node')
      abort "workspace-welcome needs Node 22+, found $node_full. Install it from https://nodejs.org (or via your package manager / nvm) and re-run."
    fi
  else
    abort "node is not installed — workspace-welcome needs Node 22+. Install it from https://nodejs.org (or via your package manager / nvm) and re-run."
  fi
  log "Requirements ok (downloader: $downloader, checksum: $sha_cmd, node: $(node -p 'process.versions.node'))"
}

detect_platform() {
  case $(uname -s) in
    Linux) os_name=linux ;;
    Darwin) os_name=darwin ;;
    *) abort "unsupported operating system '$(uname -s)' — workspace-welcome installs on Linux and Darwin only" ;;
  esac
  case $(uname -m) in
    x86_64) arch_name=x64 ;;
    aarch64|arm64) arch_name=arm64 ;;
    *) abort "unsupported CPU architecture '$(uname -m)' — supported: x86_64, aarch64, arm64" ;;
  esac
  musl_suffix=""
  if [ "$os_name" = linux ]; then
    if { command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl; } || [ -f /etc/alpine-release ]; then
      musl_suffix="-musl"
    fi
  fi
}

# Tolerant probe: a user session is "usable" when systemd reports running (0)
# or degraded-but-functional (1); anything else (offline, not-running, no
# session, systemctl missing) means we skip service management.
systemd_usable() {
  command -v systemctl >/dev/null 2>&1 || return 1
  probe_rc=0
  systemctl --user is-system-running >/dev/null 2>&1 || probe_rc=$?
  [ "$probe_rc" -eq 0 ] || [ "$probe_rc" -eq 1 ]
}

# True only when we may manage the service: Linux, --no-service not given
# (checked first so --no-service never even probes systemd), and a usable
# systemd user session.
compute_service_active() {
  service_active=false
  if [ "$no_service" = true ]; then
    return 0
  fi
  if [ "$(uname -s)" != Linux ]; then
    return 0
  fi
  if systemd_usable; then
    service_active=true
  fi
  return 0
}

# Prints the release tag (e.g. v0.1.0) of the last github.com …/releases/tag/…
# URL found in the server-response output of the releases/latest probe. Handles
# both downloader flavors: classic wget 1.x reports redirects as "Location:"
# header lines (possibly followed by a "[following]" annotation), while GNU
# Wget2 emits no Location headers at all and instead prints the redirect trail
# as "HTTP response 302 … [<url>]" and "Enqueue <url>" lines.
latest_tag_from_server_output() {
  # $1: combined stdout+stderr captured from the spider probe
  printf '%s\n' "$1" |
    tr -d '\r' |
    grep -Eo 'https://github\.com/[^[:space:]]*/releases/tag/[^[:space:]]*' |
    tail -n 1 |
    sed -E 's|^https://github\.com/.*/releases/tag/||; s/[])",]+$//'
}

resolve_version() {
  if [ -n "$version" ]; then
    log "Using requested version $version"
    return 0
  fi
  log "Resolving the latest release from $LATEST_URL"
  resolved=""
  if [ "$downloader" = curl ]; then
    effective_url=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$LATEST_URL") ||
      abort "could not resolve the latest release — check your network, or pass --version (or WW_VERSION) explicitly"
    resolved=${effective_url##*/}
  else
    # No -q here: Wget2 prints its redirect trail on stdout and -q silences
    # it, leaving the parser with nothing to read. Classic wget writes its
    # headers to stderr; both streams are captured for the parser.
    server_output=$(wget --spider --server-response "$LATEST_URL" 2>&1) || true
    resolved=$(latest_tag_from_server_output "$server_output")
  fi
  cr=$(printf '\r')
  resolved=${resolved%"$cr"}
  if [ -z "$resolved" ]; then
    abort "could not resolve the latest release — check your network, or pass --version (or WW_VERSION) explicitly"
  fi
  version=$resolved
}

validate_version() {
  if ! printf '%s\n' "$version" | grep -Eq '^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'; then
    abort "'$version' is not a valid version — expected vX.Y.Z or X.Y.Z (e.g. v0.1.0, no leading zeros)"
  fi
  version_plain=${version#v}
}

asset_url_for() {
  # $1: file name; release files live flat inside the tag directory on
  # GitHub, and flat at the mirror root.
  if [ -n "$mirror" ]; then
    printf '%s/%s\n' "$mirror" "$1"
  else
    printf '%s/v%s/%s\n' "$BASE_URL" "$version_plain" "$1"
  fi
}

download_to() {
  # $1: URL, $2: destination file
  if [ "$downloader" = curl ]; then
    curl -fSL --retry 3 -o "$2" "$1" || abort "download failed: $1"
  else
    wget -q --tries=3 -O "$2" "$1" || abort "download failed: $1"
  fi
}

http_ok() {
  # $1: URL — succeeds when it answers (any HTTP response via -f's success
  # range for curl / wget's spider-less fetch).
  if [ "$downloader" = curl ]; then
    curl -fsS --max-time 3 -o /dev/null "$1" 2>/dev/null
  else
    wget -q -T 3 -O /dev/null "$1" 2>/dev/null
  fi
}

sha256_of() {
  # $1: file — prints its sha256 digest
  digest=$("$sha_cmd" $sha_args "$1") || abort "failed to compute the sha256 of $1"
  printf '%s\n' "${digest%% *}"
}

verify_checksum() {
  # $1: SHA256SUMS.txt path, $2: asset file name, $3: downloaded file path
  sums_file=$1
  sums_asset=$2
  sums_downloaded=$3
  expected=""
  # "|| [ -n ... ]" keeps the final entry when the file lacks a trailing
  # newline; empty lines are skipped explicitly.
  while IFS= read -r sums_line || [ -n "$sums_line" ]; do
    if [ -z "$sums_line" ]; then
      continue
    fi
    set -f
    set -- $sums_line
    set +f
    if [ "${2-}" = "$sums_asset" ]; then
      expected=$1
    fi
  done < "$sums_file"
  if [ -z "$expected" ]; then
    abort "SHA256SUMS.txt has no entry for '$sums_asset' — refusing to install an unverified download"
  fi
  actual=$(sha256_of "$sums_downloaded")
  if [ "$actual" != "$expected" ]; then
    rm -rf "$tmp_dir"
    abort "SHA256 checksum mismatch for $sums_asset (expected $expected, got $actual) — the download is corrupted or was tampered with; aborting"
  fi
  log "Checksum ok ($actual)"
}

ensure_env_template() {
  # $1: install dir — writes a .env template only when none exists yet
  if [ -f "$1/.env" ]; then
    log "Keeping your existing $1/.env"
    return 0
  fi
  log "Writing .env template at $1/.env"
  {
    printf 'PORT=%s\n' "$port"
    printf 'HOST=%s\n' "$host"
    printf '\n'
    printf '# optional — ideation providers; see docs\n'
    printf '# OPENROUTER_API_KEY=\n'
    printf '# ANTHROPIC_API_KEY=\n'
    printf '# OPENAI_API_KEY=\n'
    printf '# GOOGLE_API_KEY=\n'
    printf '# GROQ_API_KEY=\n'
    printf '# XAI_API_KEY=\n'
    printf '# ZAI_API_KEY=\n'
  } > "$1/.env"
}

remove_path() {
  # $1: path — refuses to rm anything empty or the filesystem root
  case $1 in
    ''|/) abort "refusing to remove '$1' — invalid path" ;;
  esac
  rm -rf "$1"
}

install_app() {
  tarball_path="$tmp_dir/$asset"
  sums_path="$tmp_dir/SHA256SUMS.txt"
  asset_url=$(asset_url_for "$asset")
  sums_url=$(asset_url_for "SHA256SUMS.txt")
  log "Downloading $asset_url"
  download_to "$asset_url" "$tarball_path"
  log "Downloading $sums_url"
  download_to "$sums_url" "$sums_path"
  log "Verifying SHA256 checksum"
  verify_checksum "$sums_path" "$asset" "$tarball_path"
  log "Inspecting the archive"
  if ! tar -tzf "$tarball_path" | grep -Fxq 'workspace-welcome/serve-prod.mjs'; then
    abort "the downloaded archive does not contain workspace-welcome/serve-prod.mjs — refusing to install"
  fi
  mkdir -p "$tmp_dir/staging"
  tar -xzf "$tarball_path" -C "$tmp_dir/staging"
  staged_dir="$tmp_dir/staging/workspace-welcome"
  if [ ! -f "$staged_dir/serve-prod.mjs" ]; then
    abort "extraction failed — the staged install is incomplete"
  fi

  if [ -e "$install_dir" ] && [ ! -d "$install_dir" ]; then
    abort "$install_dir exists and is not a directory — remove it or choose another with --dir"
  fi
  mkdir -p "$(dirname -- "$install_dir")"
  if [ -d "$install_dir" ]; then
    log "Upgrading the existing install at $install_dir"
    backup_dir="$install_dir.bak"
    if [ "$service_active" = true ] && [ -f "$unit_file" ]; then
      log "Stopping workspace-welcome.service before swapping in the new version"
      systemctl --user stop workspace-welcome.service || true
    fi
    remove_path "$backup_dir"
    mv "$install_dir" "$backup_dir"
    mv "$staged_dir" "$install_dir"
    if [ -f "$backup_dir/.env" ]; then
      cp "$backup_dir/.env" "$install_dir/.env"
      log "Restored your previous .env (user config is never overwritten)"
    fi
    log "Kept the previous install at $backup_dir — it is your one-generation rollback; remove it once happy"
  else
    log "Installing into $install_dir"
    mv "$staged_dir" "$install_dir"
  fi
  ensure_env_template "$install_dir"

  log "Verifying the installed version"
  installed_version=$(cat "$install_dir/VERSION") ||
    abort "$install_dir/VERSION is missing or unreadable — the install is broken"
  if [ "$installed_version" != "$version_plain" ]; then
    abort "installed VERSION ('$installed_version') does not match the downloaded version ('$version_plain') — aborting"
  fi
  log "Installed workspace-welcome $installed_version"
}

print_unit() {
  # $1: install dir, $2: absolute node path, $3: port, $4: host
  cat <<EOF
[Unit]
Description=workspace-welcome — local projects dashboard
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
WorkingDirectory=$1
ExecStart=$2 serve-prod.mjs
Environment=PORT=$3
Environment=HOST=$4
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
StandardOutput=journal
StandardError=journal
SyslogIdentifier=workspace-welcome

[Install]
WantedBy=default.target
EOF
}

setup_service() {
  if [ "$service_active" != true ]; then
    if [ "$no_service" = true ]; then
      log "Skipping service setup (--no-service)"
    elif [ "$os_name" != linux ]; then
      log "Skipping service setup — the systemd user service is only set up on Linux (this is $os_name)"
    else
      log "Skipping service setup — no usable systemd user session was found"
    fi
    detail "run the dashboard manually with: cd \"$install_dir\" && node serve-prod.mjs"
    return 0
  fi

  unit_existed=false
  if [ -f "$unit_file" ]; then
    unit_existed=true
  fi
  if [ "$unit_existed" != true ]; then
    if http_ok "http://$probe_host:$port/"; then
      printf 'warning: something is already listening on %s/ — it would be shadowed by the new service\n' "$dashboard_url" >&2
      if [ "$yes" != true ]; then
        abort "port $port is already in use by another process — re-run with --yes to install anyway, or pick another port with --port"
      fi
      log "Port $port already answers, but --yes was given — continuing"
    fi
  fi

  node_bin=$(command -v node)
  unit_tmp="$tmp_dir/unit"
  print_unit "$install_dir" "$node_bin" "$port" "$host" > "$unit_tmp"
  if [ -f "$unit_file" ] && cmp -s "$unit_file" "$unit_tmp"; then
    log "systemd unit unchanged: $unit_file"
  else
    mkdir -p "$(dirname -- "$unit_file")"
    cp "$unit_tmp" "$unit_file"
    log "Unit updated: $unit_file"
  fi

  systemctl --user daemon-reload || abort "systemctl --user daemon-reload failed"
  log "Enabling and starting workspace-welcome.service"
  if ! systemctl --user enable --now workspace-welcome.service; then
    abort "could not enable/start workspace-welcome.service — inspect with: journalctl --user -u workspace-welcome -n 50 --no-pager"
  fi

  log "Waiting for the dashboard to answer on $dashboard_url/"
  waited=0
  ready=false
  while [ "$waited" -lt 15 ]; do
    if http_ok "http://$probe_host:$port/"; then
      ready=true
      break
    fi
    waited=$((waited + 1))
    sleep 1
  done
  if [ "$ready" != true ]; then
    service_state=$(systemctl --user is-active workspace-welcome.service 2>&1) || true
    printf 'error: the service did not become ready within 15s (last state: %s)\n' "$service_state" >&2
    abort "check the logs with: journalctl --user -u workspace-welcome -n 50 --no-pager"
  fi

  if command -v loginctl >/dev/null 2>&1; then
    linger_line=$(loginctl show-user "$(id -un)" -p Linger 2>/dev/null) || linger_line=""
    case $linger_line in
      Linger=no)
        log "Note: on headless machines run 'sudo loginctl enable-linger $(id -un)' so the service survives logout"
        ;;
    esac
  fi
}

print_success() {
  cat <<EOF

==> workspace-welcome $version_plain is installed and ready

  Install path:   $install_dir
  Version:        $version_plain
  Dashboard URL:  $dashboard_url

  Manage the service:
    systemctl --user status workspace-welcome
    systemctl --user stop workspace-welcome
    systemctl --user start workspace-welcome
    systemctl --user restart workspace-welcome

  Logs:
    journalctl --user -u workspace-welcome -f

  Upgrade:
    re-run this installer to upgrade; pin with --version vX.Y.Z

  Uninstall:
    re-run this installer with --uninstall (add --purge to also remove config/cache/data)
EOF
  if [ "$service_active" != true ]; then
    printf '\n  Service:       not installed — start manually with: cd "%s" && node serve-prod.mjs\n' "$install_dir"
  fi
  printf '\n'
}

print_uninstall_plan() {
  log "DRY RUN — no changes were made"
  log "Planned uninstall:"
  if [ "$service_active" = true ]; then
    detail "would stop and disable workspace-welcome.service, remove $unit_file, and run systemctl --user daemon-reload"
  else
    detail "service management is not active (--no-service, non-Linux, or no usable systemd user session) — the unit file would be left untouched"
  fi
  detail "would remove $install_dir"
  detail "would remove $install_dir.bak"
  if [ "$purge" = true ]; then
    detail "would remove $config_dir (config)"
    detail "would remove $cache_dir (cache)"
    detail "would remove $data_dir (data, incl. the IDE server install)"
  else
    detail "would keep $config_dir and $cache_dir (pass --purge to remove them)"
  fi
  log "DRY RUN — no changes were made"
}

run_uninstall() {
  compute_service_active
  if [ "$dry_run" = true ]; then
    print_uninstall_plan
    return 0
  fi
  log "Uninstalling workspace-welcome"
  if [ "$service_active" = true ]; then
    log "Stopping and disabling workspace-welcome.service"
    systemctl --user stop workspace-welcome.service || true
    systemctl --user disable workspace-welcome.service || true
    rm -f "$unit_file"
    systemctl --user daemon-reload || true
    detail "removed unit file $unit_file"
  fi
  remove_path "$install_dir"
  remove_path "$install_dir.bak"
  detail "removed $install_dir (if present)"
  detail "removed $install_dir.bak (if present)"
  if [ "$purge" = true ]; then
    remove_path "$config_dir"
    remove_path "$cache_dir"
    remove_path "$data_dir"
    detail "removed $config_dir (config)"
    detail "removed $cache_dir (cache)"
    detail "removed $data_dir (data, incl. the IDE server install)"
    log "Purge complete — config, cache, and data are gone"
  else
    log "Kept your config ($config_dir) and cache ($cache_dir) — pass --purge (with --yes) to remove them too"
  fi
  log "workspace-welcome uninstalled"
}

print_install_plan() {
  log "DRY RUN — no changes were made"
  log "Planned install of workspace-welcome $version_plain ($asset)"
  log "Would download: $(asset_url_for "$asset")"
  log "Would download: $(asset_url_for "SHA256SUMS.txt")"
  log "Would verify the tarball sha256 against SHA256SUMS.txt (abort on mismatch)"
  if [ -d "$install_dir" ]; then
    log "Would upgrade $install_dir (previous generation kept at $install_dir.bak for rollback)"
  else
    log "Would install into $install_dir"
  fi
  if [ -f "$install_dir/.env" ]; then
    log "Would keep the existing $install_dir/.env"
  else
    log "Would write a .env template at $install_dir/.env (PORT=$port, HOST=$host, commented API-key placeholders)"
  fi
  log "Would verify the installed VERSION file matches $version_plain"
  log "The systemd unit below is written only when service setup runs — its content would be:"
  print_unit "$install_dir" "$(command -v node)" "$port" "$host" | while IFS= read -r unit_line; do
    detail "$unit_line"
  done
  if [ "$service_active" = true ]; then
    log "Would run: systemctl --user daemon-reload"
    log "Would run: systemctl --user enable --now workspace-welcome.service"
    log "Would wait up to ~15s for $dashboard_url/ to answer"
  else
    log "Would skip service setup (--no-service, non-Linux, or no usable systemd user session); you would run the app manually with: cd \"$install_dir\" && node serve-prod.mjs"
  fi
  log "DRY RUN — no changes were made"
}

main() {
  # Flags (parse_args) win over env equivalents; both fall back to defaults.
  version=${WW_VERSION:-}
  install_dir=${WW_INSTALL_DIR:-}
  mirror=${WW_MIRROR:-}
  port=${WW_PORT:-$DEFAULT_PORT}
  host=${WW_HOST:-$DEFAULT_HOST}
  no_service=false
  uninstall=false
  purge=false
  yes=false
  dry_run=false

  downloader=""
  sha_cmd=""
  sha_args=""
  os_name=""
  arch_name=""
  musl_suffix=""
  version_plain=""
  asset=""
  tmp_dir=""
  service_active=false
  unit_existed=false

  data_dir="${XDG_DATA_HOME:-$HOME/.local/share}/workspace-welcome"
  config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/workspace-welcome"
  cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/workspace-welcome"
  # systemd honors XDG_CONFIG_HOME for user units too.
  unit_file="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/workspace-welcome.service"

  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  parse_args "$@"
  resolve_settings

  if [ "$purge" = true ] && [ "$yes" != true ]; then
    printf 'error: --purge deletes everything, including data no installer ever touches:\n' >&2
    printf '  - %s (stored app state)\n' "$config_dir" >&2
    printf '  - %s\n' "$cache_dir" >&2
    printf '  - %s (app data, incl. the IDE server install)\n' "$data_dir" >&2
    printf 'A piped invocation (curl | sh) cannot confirm interactively, so --purge requires --yes.\nRe-run with: --purge --yes\n' >&2
    exit 1
  fi
  if [ -n "$mirror" ] && [ -z "$version" ]; then
    usage >&2
    abort "--mirror requires an explicit --version (or WW_VERSION) — mirrors do not serve GitHub's latest-release redirect"
  fi

  if [ "$uninstall" = true ]; then
    run_uninstall
    return 0
  fi

  check_requirements
  detect_platform
  compute_service_active
  resolve_version
  validate_version
  asset="workspace-welcome-${version_plain}-${os_name}${musl_suffix}-${arch_name}.tar.gz"
  log "Installing workspace-welcome $version_plain ($asset)..."

  if [ "$dry_run" = true ]; then
    print_install_plan
    return 0
  fi

  tmp_dir=$(mktemp -d) || abort "failed to create a temporary download directory"
  install_app
  setup_service
  print_success
}

main "$@"
