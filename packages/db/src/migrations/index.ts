import { migration0001 } from "./0001_app_tables";

/**
 * One embedded migration. `id` is zero-padded so plain lexicographic order
 * equals apply order; it is also the value recorded in
 * `app_meta.schema_version`.
 */
export type AppMigration = {
  id: string;
  statements: readonly string[];
};

/** Every migration to date, in apply order — append only. */
export const migrations: readonly AppMigration[] = [migration0001];
