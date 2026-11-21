import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Exercise the actual workflow gate, including missing, skipped and cancelled dependencies.
const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const code = workflow.match(/node --input-type=module - <<'NODE'\r?\n([\s\S]*?)\r?\n\s+NODE/)[1];
const names = ['quality', 'integration', 'browser', 'docker'];
const success = () => Object.fromEntries(names.map(name => [name, { result: 'success' }]));
const run = jobs => spawnSync(process.execPath, ['--input-type=module', '-e', code], {
  env: { ...process.env, JOB_RESULTS: JSON.stringify(jobs) }, encoding: 'utf8',
});

test('allows integration only when all required jobs succeed', () => {
  assert.equal(run(success()).status, 0);
});

for (const name of names) {
  for (const result of ['failure', 'cancelled', 'skipped', 'missing']) {
    test(`blocks integration when ${name} is ${result}`, () => {
      const jobs = success();
      if (result === 'missing') delete jobs[name];
      else jobs[name].result = result;
      const outcome = run(jobs);
      assert.equal(outcome.status, 1, outcome.stderr);
      assert.match(outcome.stdout, new RegExp(`${name}: ${result}`));
    });
  }
}

test('fails closed on malformed dependency data', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, JOB_RESULTS: 'invalid' }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
});
