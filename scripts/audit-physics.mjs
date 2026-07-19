/**
 * Jedno polecenie: float po snap + hang-only + szybkie podsumowanie run schedule.
 * Usage: node scripts/audit-physics.mjs
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(script) {
  console.log(`\n=== ${script} ===`);
  const r = spawnSync(process.execPath, [join(root, 'scripts', script)], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.error(`FAIL ${script} exit=${r.status}`);
    process.exit(r.status ?? 1);
  }
}

run('audit-all-siege-float.mjs');
run('audit-hang-only.mjs');

console.log('\n=== audit-physics OK ===');
