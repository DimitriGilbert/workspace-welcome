/**
 * token-completeness probe (master plan §3.8).
 *
 * Every token in `required-tokens.json` must resolve non-empty on the
 * `[data-theme-scope]` element — and the semantic group (severity, charts,
 * recency, pinned, eyebrow, chrome) must additionally be DECLARED on the
 * scope itself (`[data-ww-theme="<slug>"]` rules in the CSSOM or inline
 * style), because the base :root cascade already declares near-identical
 * fallbacks: a theme shipping no tokens.css would otherwise "resolve" by
 * inheritance and the probe would be blind. Inherited values still satisfy
 * the plain-resolution check for base/font tokens.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { measureJs } from "../lib/measure.mjs";

export const name = "token-completeness";

const MAX_LISTED = 10;

let manifestCache = null;

async function loadManifest() {
  if (manifestCache !== null) return manifestCache;
  const manifestPath = fileURLToPath(new URL("../required-tokens.json", import.meta.url));
  const raw = /** @type {{ groups: Record<string, { themeScoped?: boolean, tokens: string[] }> }} */ (
    JSON.parse(await readFile(manifestPath, "utf8"))
  );
  const tokens = [];
  const themeScoped = [];
  for (const group of Object.values(raw.groups)) {
    for (const token of group.tokens) {
      tokens.push(token);
      if (group.themeScoped === true) themeScoped.push(token);
    }
  }
  if (tokens.length === 0) {
    throw new Error(`required-tokens.json declares no tokens (${manifestPath})`);
  }
  manifestCache = { tokens, themeScoped };
  return manifestCache;
}

export async function run(page, report) {
  const manifest = await loadManifest();
  const result = await page.evalMeasured(measureJs(), (M, manifestArg) => {
    const scope = M.scopeElement();
    if (scope === null) {
      return { fatal: "no [data-theme-scope] element on page" };
    }
    const slug = scope.getAttribute("data-ww-theme") ?? "(none)";
    const declaredOnScope = new Set(M.cssDeclarations(`[data-ww-theme="${slug}"]`));
    for (let i = 0; i < scope.style.length; i++) {
      const prop = scope.style[i];
      if (prop.startsWith("--")) declaredOnScope.add(prop);
    }
    const missingThemeScoped = [];
    const missingResolved = [];
    for (const token of manifestArg.tokens) {
      const computed = M.customProp(scope, token);
      if (manifestArg.themeScoped.includes(token)) {
        if (!declaredOnScope.has(token)) {
          missingThemeScoped.push(token);
          continue;
        }
        if (computed === "") missingResolved.push(token);
      } else if (computed === "") {
        missingResolved.push(token);
      }
    }
    return {
      fatal: null,
      slug,
      total: manifestArg.tokens.length,
      themeScopedTotal: manifestArg.themeScoped.length,
      declaredOnScopeCount: declaredOnScope.size,
      missingThemeScoped,
      missingResolved,
    };
  }, manifest);

  if (result === null || result === undefined) {
    report.fail(name, "page evaluation returned nothing");
    return { ok: false };
  }
  if (result.fatal !== null) {
    report.fail(name, result.fatal);
    return { ok: false };
  }
  const missingCount = result.missingThemeScoped.length + result.missingResolved.length;
  if (missingCount > 0) {
    const themeScopedList = result.missingThemeScoped.slice(0, MAX_LISTED).join(" ");
    const resolvedList = result.missingResolved.slice(0, MAX_LISTED).join(" ");
    report.fail(
      name,
      `${missingCount}/${result.total} manifest tokens missing on [data-ww-theme="${result.slug}"] — not theme-declared: ${themeScopedList || "none"}; declared but empty: ${resolvedList || "none"}${
        missingCount > MAX_LISTED * 2 ? " …" : ""
      }`,
    );
    return { ok: false };
  }
  report.pass(
    name,
    `all ${result.total} manifest tokens present (${result.declaredOnScopeCount} declared on the scope)`,
  );
  return { ok: true };
}
