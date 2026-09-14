import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRemote } from "./detect";
import type { GitHost } from "./types";

/**
 * Remote-parser tests for parseRemote (`pnpm --filter
 * @workspace-welcome/api test:forge`). Pure and offline: no fs, no network,
 * no child_process — every input is a literal remote string.
 *
 * The ssh:// and port rows pin the verified-report-3 F2 mis-parses: the
 * explicit ssh:// branch must be tried before the scp-like pattern (which
 * would otherwise capture the scheme itself as the host), and a :port must
 * never leak into the host capture. The `git@github.com:22/...` row pins
 * the deliberate non-fix: scp-like syntax has no port semantics, so git
 * itself reads that remote as host "github.com", path "22/owner/repo" — the
 * parser stays faithful to the string.
 */

interface RemoteCase {
  remote: string;
  host: GitHost;
  slug: string;
  web: string;
}

const CASES: RemoteCase[] = [
  // ssh:// — a documented GitHub clone-URL shape, including the :443
  // firewall workaround; previously "ssh" (the scheme!) classified as host.
  {
    remote: "ssh://git@github.com/owner/repo.git",
    host: "github",
    slug: "owner/repo",
    web: "https://github.com/owner/repo",
  },
  {
    remote: "ssh://git@github.com:443/owner/repo.git",
    host: "github",
    slug: "owner/repo",
    web: "https://github.com/owner/repo",
  },
  // gitlab.example.com is NOT gitlab.com — it classifies as "other"; the row
  // pins the dropped port plus the host-kept generic web link.
  {
    remote: "ssh://git@gitlab.example.com:2222/team/repo.git",
    host: "other",
    slug: "team/repo",
    web: "https://gitlab.example.com/team/repo",
  },
  // Known host over ssh:// with port: canonical links, port dropped.
  {
    remote: "ssh://git@gitlab.com:2222/team/repo.git",
    host: "gitlab",
    slug: "team/repo",
    web: "https://gitlab.com/team/repo",
  },
  // No user@ prefix.
  {
    remote: "ssh://github.com/owner/repo.git",
    host: "github",
    slug: "owner/repo",
    web: "https://github.com/owner/repo",
  },
  // Port-bearing https: the host capture excludes a trailing :port.
  {
    remote: "https://github.com:8443/owner/repo.git",
    host: "github",
    slug: "owner/repo",
    web: "https://github.com/owner/repo",
  },
  // Unknown scp-like host: the generic web link keeps the captured host
  // (it used to drop it, yielding the broken https://team/repo).
  {
    remote: "git@gitlab.mycompany.com:team/repo.git",
    host: "other",
    slug: "team/repo",
    web: "https://gitlab.mycompany.com/team/repo",
  },
  // Sanity pins — the common shapes behave exactly as before.
  {
    remote: "git@github.com:owner/repo.git",
    host: "github",
    slug: "owner/repo",
    web: "https://github.com/owner/repo",
  },
  {
    remote: "https://github.com/owner/repo.git",
    host: "github",
    slug: "owner/repo",
    web: "https://github.com/owner/repo",
  },
  // FAITHFUL pin (do not fix): scp-like has no port semantics.
  {
    remote: "git@github.com:22/owner/repo.git",
    host: "github",
    slug: "22/owner/repo",
    web: "https://github.com/22/owner/repo",
  },
];

for (const { remote, host, slug, web } of CASES) {
  test(`parseRemote classifies ${remote}`, () => {
    const parsed = parseRemote(remote);
    assert.ok(parsed !== null, remote);
    assert.equal(parsed.host, host, remote);
    assert.equal(parsed.slug, slug, remote);
    assert.equal(parsed.links.web, web, remote);
    assert.equal(parsed.url, remote, remote);
  });
}

test("known hosts keep deep links; unknown hosts alias issues/pulls to web", () => {
  const github = parseRemote("ssh://git@github.com/owner/repo.git");
  assert.ok(github !== null);
  assert.equal(github.links.issues, "https://github.com/owner/repo/issues");
  assert.equal(github.links.pulls, "https://github.com/owner/repo/pulls");

  const other = parseRemote("git@gitlab.mycompany.com:team/repo.git");
  assert.ok(other !== null);
  assert.equal(other.links.issues, other.links.web);
  assert.equal(other.links.pulls, other.links.web);
});

test("unclassifiable remotes return null", () => {
  assert.equal(parseRemote(""), null);
  // Whitespace-only trims to empty.
  assert.equal(parseRemote("   "), null);
  // Colon-less, scheme-less strings — no host boundary to split on.
  assert.equal(parseRemote("github.com/owner/repo"), null);
  assert.equal(parseRemote("owner/repo"), null);
});
