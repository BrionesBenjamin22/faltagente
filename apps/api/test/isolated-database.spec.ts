import { isolatedDatabaseUrl } from './isolated-database.js';

describe('isolated fixture database safety', () => {
  it.each(['localhost', '127.0.0.1'])('accepts the project test database on %s', host => {
    const value = `postgresql://falta_gente_test@${host}:55432/falta_gente_test?schema=public`;
    expect(isolatedDatabaseUrl(value).toString()).toBe(value);
  });

  it.each([
    undefined, '', 'invalid-url',
    'postgresql://production.example/falta_gente_test',
    'postgresql://localhost.example/falta_gente_test',
    'postgresql://192.168.1.2/falta_gente_test',
    'postgresql://localhost/hyt',
    'postgresql://localhost/hyt_slice',
    'postgresql://localhost/hyt_slice_test',
    'postgresql://localhost/falta_gente',
    'postgresql://localhost/falta_gente_production',
    'postgresql://localhost/falta_gente_test_backup',
    'postgresql://localhost/falta_gente_test/extra',
    'https://localhost/falta_gente_test',
  ])('rejects unsafe database configuration without exposing its URL', value => {
    expect(() => isolatedDatabaseUrl(value)).toThrow(
      'Tests require a loopback PostgreSQL database named falta_gente_test.',
    );
  });
});
