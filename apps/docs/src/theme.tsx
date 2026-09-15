import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useState,
} from "react";
import type { ReactNode } from "react";

/**
 * Site theme — the docs site wears the app's THREE theme identities
 * (bento, meadow, mission-control). One source of truth for the look: the
 * token manifests are the shared `@workspace-welcome/ui/themes/*.css` the
 * app scopes its boards with, and this module owns only the site-side
 * plumbing — the active slug, its persistence, and the switcher state.
 *
 * Persistence mirrors the app's theme-prefs approach: localStorage, written
 * on every pick, read BEFORE first paint by `themeInitScript` (inline in the
 * document shell), so a reload never flashes the wrong identity. The server
 * cannot read storage, so SSR renders the default and the client adopts the
 * stamped attribute after hydration — colors are already correct by CSS
 * (the attribute is pre-paint); only theme-bound imagery resolves one tick
 * later, inside the same frame as hydration (layout effect, pre-paint).
 *
 * The scheme layer (each preset's light/dark color schemes) stays an app
 * surface: the docs site renders each identity at its default scheme — the
 * registers the owner ships (Console dark, Graphite dark, Daylight light).
 */

export const DOCS_THEMES = [
	{ id: "mission-control", label: "Mission Control" },
	{ id: "bento", label: "Bento" },
	{ id: "meadow", label: "Meadow" },
] as const;

export type DocsThemeId = (typeof DOCS_THEMES)[number]["id"];

/** Mirrors the app's `DEFAULT_THEME_ID` — the owner's default board. */
export const DEFAULT_DOCS_THEME: DocsThemeId = "mission-control";

/** localStorage key — namespaced, versioned, separate from the app's prefs. */
const STORAGE_KEY = "ww.docs.theme.v1";

export function isDocsThemeId(value: unknown): value is DocsThemeId {
	return DOCS_THEMES.some((theme) => theme.id === value);
}

/**
 * The real product capture bound to each identity — the same preset's
 * dashboard as this site presents it. mission-control's shot is
 * `/dashboard.png`, which doubles as the fixed OG/Twitter card (seo.ts).
 */
export const THEME_SHOT: Record<DocsThemeId, { src: string; alt: string }> = {
	"mission-control": {
		src: "/dashboard.png",
		alt: "The mission-control board: fleet ledger with forge chips, alerts, and the My issues & pull requests feed",
	},
	bento: {
		src: "/shot-bento.png",
		alt: "The bento board: workspace pulse, needs-attention panel, and the project mosaic",
	},
	meadow: {
		src: "/shot-meadow.png",
		alt: "The meadow board: project bentos and the workspace report on a daylight ground",
	},
};

/**
 * Runs inline in <head> BEFORE first paint: adopts the saved identity (or
 * the default) onto <html data-ww-theme>, so the shared theme CSS applies
 * with no flash of the wrong palette. Kept tiny and dependency-free.
 */
export const themeInitScript = `(function(){try{var v=localStorage.getItem("${STORAGE_KEY}");if(v!=="mission-control"&&v!=="bento"&&v!=="meadow")v="${DEFAULT_DOCS_THEME}";document.documentElement.setAttribute("data-ww-theme",v);}catch(e){}})();`;

interface DocsThemeValue {
	theme: DocsThemeId;
	setTheme: (id: DocsThemeId) => void;
}

const DocsThemeContext = createContext<DocsThemeValue | null>(null);

function applyTheme(id: DocsThemeId): void {
	document.documentElement.setAttribute("data-ww-theme", id);
	try {
		window.localStorage.setItem(STORAGE_KEY, id);
	} catch {
		// Private mode / quota — the session selection stays live; nothing to do.
	}
}

/** `useLayoutEffect` on the client (adopt pre-paint), `useEffect` on the
 * server (where layout effects are a no-op warning). */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function DocsThemeProvider({ children }: { children: ReactNode }) {
	// Start at the default so hydration matches SSR; adopt the stamped
	// attribute in a layout effect (pre-paint on hydration).
	const [theme, setThemeState] = useState<DocsThemeId>(DEFAULT_DOCS_THEME);

	// Run once after hydration; the switcher owns every later change. The
	// stamped attribute is the ground truth the inline script wrote.
	// (Mount-only on purpose: `theme` is intentionally not a dependency.)
	useIsomorphicLayoutEffect(() => {
		const stamped = document.documentElement.getAttribute("data-ww-theme");
		if (isDocsThemeId(stamped)) setThemeState(stamped);
	}, []);

	const setTheme = useCallback((id: DocsThemeId) => {
		setThemeState(id);
		applyTheme(id);
	}, []);

	const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

	return <DocsThemeContext.Provider value={value}>{children}</DocsThemeContext.Provider>;
}

/** Read/write the site theme. Throws outside the provider. */
export function useDocsTheme(): DocsThemeValue {
	const ctx = useContext(DocsThemeContext);
	if (ctx === null) {
		throw new Error("DocsThemeProvider missing — mount it in the root document.");
	}
	return ctx;
}
