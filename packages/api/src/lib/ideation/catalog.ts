import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { cacheDir } from "../xdg";
import type {
  IdeationCatalogProvider,
  IdeationModelsList,
} from "./shared";

/**
 * The models.dev catalog (PRD §4.1): fetch api.json, validate only the
 * fields we consume, cache it under the XDG cache dir with a 24 h TTL and
 * atomic tmp+rename writes (the persistRaw discipline from store.ts), and
 * degrade gracefully — stale cache with a warning on a failed refresh
 * (repeat calls inside a short backoff window skip the fetch entirely), the
 * baked-in z.ai-only set when there is no cache to fall back on (PRD §7).
 * Providers the dump leaves without an `api` still resolve via the
 * code-owned well-known-URL table (WELL_KNOWN_BASE_URLS below) — but only
 * the genuinely OpenAI-compatible ones, and a dump-provided `api` always
 * wins over the well-known URL when it is a valid https URL (an invalid
 * one drops the provider; adoptBaseUrl below). Server-only on purpose
 * (Node throughout); the client-safe response types live in shared.ts.
 */

const MODELS_DEV_URL = "https://models.dev/api.json";
/** Copied from ideadump's models.json TTL: refresh at most once a day. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_FILENAME = "models-dev.json";
/**
 * How long a failed refresh suppresses further fetch attempts: repeated
 * stale-serving calls inside the window skip models.dev entirely, so a
 * fan-out of callers costs one failed fetch, not one per caller. In-process
 * only — the persisted fetchedAt keeps dating the last successful fetch, so
 * the 24 h TTL is unaffected.
 */
const REFRESH_BACKOFF_MS = 60_000;

/**
 * The provider→env-var table is ours, never the dump's (PRD §4.1): the dump
 * names provider-blessed vars (e.g. ZHIPU_API_KEY for zai) that this app
 * deliberately does not read. Providers without an entry are ignored — the
 * curated launch set, mirroring packages/env/src/server.ts.
 */
const PROVIDER_ENV_VARS: Readonly<Record<string, string>> = Object.freeze({
  zai: "ZAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  groq: "GROQ_API_KEY",
  xai: "XAI_API_KEY",
});

/**
 * Code-owned well-known OpenAI-compatible base URLs, beside the env-var
 * table above: today's dump only carries `api` for zai among the curated
 * providers, so without this table models.list degrades to z.ai-only.
 * When the dump lacks `api` for one of these providers, we fall back to
 * its well-known URL; a dump-provided `api` ALWAYS wins over the
 * well-known one. Only providers whose APIs are genuinely
 * OpenAI-compatible get an entry — anthropic and google are deliberately
 * absent (no OpenAI-compatible base URL), so they stay dump-gated and are
 * dropped until the dump carries a usable `api`. zai needs no entry: the
 * dump and the FALLBACK_DUMP both carry it.
 */
const WELL_KNOWN_BASE_URLS: Readonly<Record<string, string>> = Object.freeze({
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  xai: "https://api.x.ai/v1",
});

/**
 * Passthrough validation typing only the consumed fields (PRD §10: shape
 * drift in fields we don't consume must not break parsing): provider slugs
 * as record keys, display names, the OpenAI-compatible base URL when
 * present, and model names keyed by model id. Everything else rides
 * through untouched.
 */
const modelsDevModelSchema = z.looseObject({
  name: z.string().optional(),
});

const modelsDevProviderSchema = z.looseObject({
  name: z.string().optional(),
  /** OpenAI-compatible base URL; absent on providers without one. Parsed
   * permissively — https-only validation happens at adoption
   * (adoptBaseUrl), so one poisoned provider can't fail the whole dump. */
  api: z.string().optional(),
  models: z.record(z.string(), modelsDevModelSchema).optional(),
});

const modelsDevDumpSchema = z.record(z.string(), modelsDevProviderSchema);

type ModelsDevDump = z.infer<typeof modelsDevDumpSchema>;

/** Envelope persisted to disk, so TTL checks don't depend on file mtime. */
const catalogCacheSchema = z.object({
  /** ISO timestamp of the fetch that produced the dump. */
  fetchedAt: z.string(),
  dump: modelsDevDumpSchema,
});

/**
 * The baked-in fallback (PRD §7): z.ai only, on the one OpenAI-compatible
 * base URL all default model ids resolve against — so a first run with no
 * cache and a failed fetch still lists the settings-default GLM lineup.
 */
const FALLBACK_DUMP: ModelsDevDump = {
  zai: {
    name: "Z.AI",
    api: "https://api.z.ai/api/paas/v4",
    models: {
      "glm-5.3": { name: "GLM-5.3" },
      "glm-5.3-flash": { name: "GLM-5.3-Flash" },
      "glm-4.7-flash": { name: "GLM-4.7-Flash" },
      "glm-4.5-flash": { name: "GLM-4.5-Flash" },
    },
  },
};

function cachePath(): string {
  return join(cacheDir(), CACHE_FILENAME);
}

/** Last validated dump, so repeat calls skip re-parsing the multi-MB cache. */
let memoryCache: { fetchedAt: number; dump: ModelsDevDump } | null = null;

/**
 * When the last refresh attempt failed (ms epoch), driving the
 * REFRESH_BACKOFF_MS negative cache: inside the window, listModels serves
 * the stale dump without re-attempting the fetch. Cleared by a successful
 * fetch; never persisted.
 */
let lastFetchFailedAt: number | null = null;

/**
 * Read the cached dump (memoized). A missing, corrupt, or no-longer-valid
 * cache counts as absent so the caller fetches a fresh dump; other IO
 * errors surface.
 */
async function readCachedDump(): Promise<{
  fetchedAt: number;
  dump: ModelsDevDump;
} | null> {
  if (memoryCache) return memoryCache;
  let raw: string;
  try {
    raw = await readFile(cachePath(), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return null;
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = catalogCacheSchema.safeParse(envelope);
  if (!parsed.success) return null;
  const fetchedAt = Date.parse(parsed.data.fetchedAt);
  if (Number.isNaN(fetchedAt)) return null;
  const cached = { fetchedAt, dump: parsed.data.dump };
  memoryCache = cached;
  return cached;
}

/** Atomic cache write: temp file + rename, mirroring store.ts persistRaw. */
async function writeCache(dump: ModelsDevDump): Promise<void> {
  const dir = cacheDir();
  await mkdir(dir, { recursive: true });
  const target = join(dir, CACHE_FILENAME);
  const tmp = join(dir, `.models-dev.${process.pid}.${Date.now()}.tmp`);
  const payload = JSON.stringify({
    fetchedAt: new Date().toISOString(),
    dump,
  });
  await writeFile(tmp, payload, "utf8");
  try {
    await rename(tmp, target);
  } catch (err) {
    // rename can fail across devices in some setups; fall back to copy+unlink.
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") {
      await unlink(tmp).catch(() => undefined);
      throw err;
    }
    const contents = await readFile(tmp, "utf8");
    await writeFile(target, contents, "utf8");
    await unlink(tmp).catch(() => undefined);
  }
}

/** Fetch and validate the dump; throws a short reason on any failure. */
async function fetchDump(): Promise<ModelsDevDump> {
  const response = await fetch(MODELS_DEV_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`models.dev responded with HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  const parsed = modelsDevDumpSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("models.dev dump failed validation");
  }
  return parsed.data;
}

function isKeyPresent(envVar: string): boolean {
  const value = process.env[envVar];
  return typeof value === "string" && value.length > 0;
}

/**
 * https-only gate for a dump-provided `api`, applied at adoption: a valid
 * https URL wins over the well-known one (the documented precedence), an
 * absent `api` falls back to the well-known URL, and an invalid one —
 * http, relative, garbage — drops the provider rather than downgrading to
 * the well-known URL. Enforced here instead of in modelsDevProviderSchema
 * on purpose: a schema-level failure would reject the whole dump (fresh
 * fetches and the cached envelope alike) over one poisoned provider, while
 * this drops just that provider via mapDump's drop-gate — and cached dumps
 * flow through mapDump too, so a poisoned cache entry is dropped without
 * needing a successful refetch.
 */
const httpsApiUrlSchema = z.url({ protocol: /^https$/ });

/** The provider's base URL, per the adoption rules above. */
function adoptBaseUrl(
  slug: string,
  api: string | undefined,
): string | undefined {
  if (api === undefined) return WELL_KNOWN_BASE_URLS[slug];
  return httpsApiUrlSchema.safeParse(api).success ? api : undefined;
}

/**
 * Project a validated dump onto the models.list shape: only providers in
 * the env-var table that carry an OpenAI-compatible base URL and at least
 * one model — the adapter-reachability filter. The base URL follows
 * adoptBaseUrl: the dump's `api` when it is a valid https URL, the
 * well-known URL when the dump leaves `api` off; providers with neither —
 * including a dump `api` that fails the https check — are dropped. Sorted
 * by id for stable output; the dump's key order is not meaningful.
 */
function mapDump(dump: ModelsDevDump): IdeationCatalogProvider[] {
  const providers: IdeationCatalogProvider[] = [];
  for (const [slug, entry] of Object.entries(dump)) {
    const envVar = PROVIDER_ENV_VARS[slug];
    if (envVar === undefined) continue;
    const baseUrl = adoptBaseUrl(slug, entry.api);
    if (baseUrl === undefined) continue;
    const models = Object.entries(entry.models ?? {})
      .map(([id, model]) => ({
        id: `${slug}/${id}`,
        label: model.name ?? id,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (models.length === 0) continue;
    providers.push({
      id: slug,
      label: entry.name ?? slug,
      envVar,
      keyPresent: isKeyPresent(envVar),
      baseUrl,
      models,
    });
  }
  return providers.sort((a, b) => a.id.localeCompare(b.id));
}

let inFlight: Promise<unknown> = Promise.resolve();

/**
 * Serialize catalog work (store.ts's queueWrite discipline) so concurrent
 * callers can't race the read → fetch → write sequence or collide on the
 * temp file.
 */
function queueCatalog<T>(next: () => Promise<T>): Promise<T> {
  const run = inFlight.then(next, next);
  inFlight = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * The models.list data source (PRD §4.4). Fresh cache within the TTL,
 * otherwise a refetch; on a failed fetch or validation the stale cache,
 * else the baked-in fallback — degraded results carry `warning`. A failed
 * refresh also starts the REFRESH_BACKOFF_MS negative cache: inside the
 * window, repeat calls serve the stale cache without attempting the fetch,
 * so a down models.dev costs one failed fetch per window no matter how many
 * callers fan in, while the first failure still degrades exactly as
 * documented. Key presence is re-read from the environment on every call.
 */
export async function listModels(): Promise<IdeationModelsList> {
  return queueCatalog(async () => {
    const cached = await readCachedDump();
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { providers: mapDump(cached.dump) };
    }
    if (
      cached &&
      lastFetchFailedAt !== null &&
      Date.now() - lastFetchFailedAt < REFRESH_BACKOFF_MS
    ) {
      return {
        providers: mapDump(cached.dump),
        warning:
          "models.dev refresh recently failed; serving the stale cached catalog until the retry backoff elapses",
      };
    }
    let dump: ModelsDevDump;
    try {
      dump = await fetchDump();
    } catch (err) {
      lastFetchFailedAt = Date.now();
      const reason = err instanceof Error ? err.message : String(err);
      if (cached) {
        return {
          providers: mapDump(cached.dump),
          warning: `models.dev refresh failed (${reason}); serving the stale cached catalog`,
        };
      }
      return {
        providers: mapDump(FALLBACK_DUMP),
        warning: `models.dev fetch failed (${reason}) with no cache; serving the built-in z.ai fallback catalog`,
      };
    }
    memoryCache = { fetchedAt: Date.now(), dump };
    lastFetchFailedAt = null;
    const result: IdeationModelsList = { providers: mapDump(dump) };
    // The dump is fresh and served either way; only its persistence is
    // best-effort — surface a failed cache write as a warning, not an error.
    try {
      await writeCache(dump);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      result.warning = `serving a fresh models.dev catalog, but caching it failed (${reason})`;
    }
    return result;
  });
}
