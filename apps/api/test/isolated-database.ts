/** Allow only disposable local PostgreSQL databases before any fixture writes. */
export function isolatedDatabaseUrl(value: string | undefined): URL {
  const error = () => new Error('Tests require a loopback PostgreSQL database named falta_gente_test.');
  if (!value) throw error();
  let url: URL;
  try { url = new URL(value); } catch { throw error(); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || !['localhost', '127.0.0.1'].includes(url.hostname)
    || url.pathname !== '/falta_gente_test') throw error();
  return url;
}
