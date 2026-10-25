/**
 * Disposable local PostgreSQL (PGlite) with pgcrypto loaded, because hosted
 * Supabase installs pgcrypto in the `extensions` schema and migrations use it.
 * BUFFER_PGLITE_MODULE may point at PGlite's dist/index.js, as CI does.
 */
const MODULE = process.env.BUFFER_PGLITE_MODULE || '@electric-sql/pglite';
const PGCRYPTO = MODULE.endsWith('/index.js') ? MODULE.replace(/index\.js$/, 'contrib/pgcrypto.js') : `${MODULE}/contrib/pgcrypto`;
const [{ PGlite }, { pgcrypto }] = await Promise.all([import(MODULE), import(PGCRYPTO)]);

export function createDatabase() {
  return new PGlite({ extensions: { pgcrypto } });
}
