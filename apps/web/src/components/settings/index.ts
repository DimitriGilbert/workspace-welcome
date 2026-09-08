/**
 * The settings widgets — the /settings page's theme-agnostic composition
 * set (master-plan widget system, common-widget layer). Each widget is a
 * WidgetShell over the settings context (or the legacy general surfaces)
 * and renders its own quiet token box (`border bg-card`) because /settings
 * mounts no ThemeScope — nothing restyles the bare shell there.
 */

export { SettingsCommands } from "./commands";
export { SettingsExcludeGlobs } from "./exclude-globs";
export { SettingsGeneral } from "./general";
export { SettingsIdeation } from "./ideation";
export { SettingsSnitch } from "./snitch";
