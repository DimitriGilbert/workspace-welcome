/**
 * part-min probe — P5-finalized assertions (master plan §3.8, §5 P5).
 *
 * Runs per `[data-theme-scope]` on the page (the parts-preview page mounts
 * one scope per registered theme; theme boards mount exactly one):
 *
 * 1. **Part boxes** — every element stamping `data-part-min-w` /
 *    `data-part-min-h` must render at least that large (1 px tolerance).
 *    On real boards the stamps ride the part root (definePart); on the
 *    parts-preview they ride the sized preview cell the fill-box part
 *    renders into — the probe measures whichever element carries them, so
 *    "the part box ≥ its declared floor at its rendered rung" holds for
 *    both spellings.
 * 2. **No horizontal overflow** inside the scope (2 px tolerance).
 * 3. **Token resolution non-empty** — every `required-tokens.json` token
 *    must resolve to a non-empty value on the scope element. Values are
 *    intentionally NOT compared: theme waves land concurrently and their
 *    exact values are mid-flight; completeness/declaration semantics stay
 *    with the token-completeness probe on the theme boards.
 * 4. **Dialog fixed-box == viewport inside the scope** — the ThemeScope
 *    contract forbids containing-block properties, so a fixed inset-0
 *    element must stay viewport-anchored: `offsetParent === null` and the
 *    box spans the layout viewport (20 px tolerance for the classic
 *    scrollbar / `scrollbar-gutter: stable` width). Verified on the scope's
 *    `[data-fixed-box-sentinel]` (the preview mounts one per scope) and on
 *    every open dialog overlay (`[data-slot="dialog-overlay"]`).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { measureJs } from "../lib/measure.mjs";

export const name = "part-min";

// Tolerances: part boxes 1 px (inlined in the page function — see the NOTE
// there), overflow 2 px. Viewport equality for the fixed-box check is 1 px
// (also inlined).
const OVERFLOW_TOLERANCE_PX = 2;
const MAX_REPORTED_PER_SCOPE = 8;

let tokensCache = null;

/** Flat required-token list (same manifest the token-completeness probe uses). */
async function loadTokens() {
  if (tokensCache !== null) return tokensCache;
  const manifestPath = fileURLToPath(new URL("../required-tokens.json", import.meta.url));
  const raw = /** @type {{ groups: Record<string, { tokens: string[] }> }} */ (
    JSON.parse(await readFile(manifestPath, "utf8"))
  );
  const tokens = Object.values(raw.groups).flatMap((group) => group.tokens);
  if (tokens.length === 0) {
    throw new Error(`required-tokens.json declares no tokens (${manifestPath})`);
  }
  tokensCache = tokens;
  return tokens;
}

/** @returns {Promise<{ok: boolean}>} */
export async function run(page, report) {
  const tokens = await loadTokens();
  const result = await page.evalMeasured(
    measureJs(),
    (M, tokensArg) => {
      const scopes = [...document.querySelectorAll("[data-theme-scope]")];
      if (scopes.length === 0) {
        return { fatal: "no [data-theme-scope] element on page" };
      }
      // Layout viewport: a fixed inset-0 element spans the client box
      // (excludes a classic scrollbar); innerWidth would over-report by the
      // scrollbar width and false-FAIL every honest fixed box.
      const view = {
        w: document.documentElement.clientWidth,
        h: document.documentElement.clientHeight,
      };
      const scopesOut = [];
      for (const scope of scopes) {
        const slug = scope.getAttribute("data-ww-theme") ?? "(none)";

        // 1) part boxes ≥ declared floors
        const partEls = [...scope.querySelectorAll("[data-part-min-w], [data-part-min-h]")];
        const undersized = [];
        for (const el of partEls) {
          const rect = M.rect(el);
          const label =
            el.getAttribute("data-part") ??
            el.getAttribute("data-part-below-min") ??
            el.tagName.toLowerCase();
          const minW = M.px(el.getAttribute("data-part-min-w") ?? "0");
          const minH = M.px(el.getAttribute("data-part-min-h") ?? "0");
          const rung = el.getAttribute("data-preview-rung");
          const at = rung !== null ? ` at ${rung}` : "";
          // NOTE: the page function below is serialized standalone — only
          // `M`, its arguments and literals are available in the page
          // context; module constants must be inlined here.
          if (minW > 0 && rect.width < minW - 1) {
            undersized.push(
              `part ${label}${at} renders ${M.round(rect.width)}px wide < data-part-min-w ${minW}px`,
            );
          }
          if (minH > 0 && rect.height < minH - 1) {
            undersized.push(
              `part ${label}${at} renders ${M.round(rect.height)}px tall < data-part-min-h ${minH}px`,
            );
          }
        }

        // 2) horizontal overflow inside the scope
        const overflowX = M.round(scope.scrollWidth - scope.clientWidth);

        // 3) token resolution non-empty
        const emptyTokens = tokensArg.filter((token) => M.customProp(scope, token) === "");

        // 4) fixed-box == viewport inside the scope. Precise containing-block
        // test: a position:fixed element anchored to the viewport has
        // offsetParent === null; any ancestor with transform/filter/contain/
        // will-change becomes its offsetParent instead. Size is then checked
        // against the layout viewport with a 20 px tolerance (the classic
        // scrollbar / scrollbar-gutter: stable width is not a containment
        // symptom). The sentinel is a parts-preview mount (P5): it is
        // REQUIRED there and optional elsewhere (board scopes get the check
        // for free whenever a dialog is actually open).
        const previewPage = document.querySelector("[data-parts-preview-root]") !== null;
        const fixedIssues = [];
        const sentinels = [...scope.querySelectorAll("[data-fixed-box-sentinel]")];
        if (sentinels.length === 0 && previewPage) {
          fixedIssues.push(
            "no [data-fixed-box-sentinel] in scope — the fixed-box (no containing block) contract cannot be verified",
          );
        }
        const fixedEls = [
          ...sentinels,
          ...scope.querySelectorAll('[data-slot="dialog-overlay"]'),
        ];
        for (const el of fixedEls) {
          const desc = el.hasAttribute("data-fixed-box-sentinel")
            ? "fixed-box sentinel"
            : "dialog overlay";
          const offsetParent = el.offsetParent;
          if (offsetParent !== null) {
            const owner =
              offsetParent.getAttribute("data-part") ??
              offsetParent.getAttribute("data-slot") ??
              offsetParent.tagName.toLowerCase();
            fixedIssues.push(
              `${desc} has offsetParent <${owner}> — an ancestor creates a containing block for position:fixed`,
            );
            continue;
          }
          const rect = M.rect(el);
          const off =
            Math.abs(rect.width - view.w) > 20 ||
            Math.abs(rect.height - view.h) > 20 ||
            Math.abs(rect.left) > 1 ||
            Math.abs(rect.top) > 1;
          if (off) {
            fixedIssues.push(
              `${desc} box ${M.round(rect.width)}x${M.round(rect.height)}@${M.round(rect.left)},${M.round(rect.top)} ` +
                `≠ layout viewport ${view.w}x${view.h}`,
            );
          }
        }

        scopesOut.push({
          slug,
          partCount: partEls.length,
          undersized: undersized.slice(0, 24),
          overflowX,
          emptyTokens,
          fixedIssues,
        });
      }
      return { fatal: null, view, scopes: scopesOut };
    },
    tokens,
  );

  if (result === null || result === undefined) {
    report.fail(name, "page evaluation returned nothing");
    return { ok: false };
  }
  if (result.fatal !== null) {
    report.fail(name, result.fatal);
    return { ok: false };
  }

  let ok = true;
  let totalParts = 0;
  for (const scope of result.scopes) {
    totalParts += scope.partCount;
    const slugTag = `[${scope.slug}]`;
    let scopeOk = true;

    const undersized = scope.undersized.slice(0, MAX_REPORTED_PER_SCOPE);
    for (const detail of undersized) {
      report.fail(name, `${slugTag} ${detail}`);
      scopeOk = false;
    }
    if (scope.undersized.length > undersized.length) {
      report.fail(name, `${slugTag} …and ${scope.undersized.length - undersized.length} more undersized parts`);
      scopeOk = false;
    }
    if (scope.overflowX > OVERFLOW_TOLERANCE_PX) {
      report.fail(
        name,
        `${slugTag} horizontal overflow: content is ${scope.overflowX}px wider than the scope`,
      );
      scopeOk = false;
    }
    if (scope.emptyTokens.length > 0) {
      report.fail(
        name,
        `${slugTag} ${scope.emptyTokens.length}/${tokens.length} required tokens resolve EMPTY: ${scope.emptyTokens.slice(0, MAX_REPORTED_PER_SCOPE).join(" ")}`,
      );
      scopeOk = false;
    }
    for (const detail of scope.fixedIssues) {
      report.fail(name, `${slugTag} ${detail}`);
      scopeOk = false;
    }

    if (scopeOk) {
      report.pass(
        name,
        `${slugTag} ${scope.partCount} part box(es) ≥ floors, no horizontal overflow, all ${tokens.length} tokens resolve non-empty, fixed-box == viewport`,
      );
    } else {
      ok = false;
    }
  }

  if (ok && result.scopes.length > 1) {
    report.pass(
      name,
      `${result.scopes.length} scope(s) clean (${totalParts} floored part boxes total; viewport ${result.view.w}x${result.view.h})`,
    );
  }
  return { ok };
}
