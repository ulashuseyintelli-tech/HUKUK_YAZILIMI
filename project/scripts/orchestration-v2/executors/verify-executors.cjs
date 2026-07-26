'use strict';
/**
 * Live executor verification for the T3 gate.
 *
 * Runs the real resolution order (§7.1) against the actual CLIs on this
 * machine: explicit config -> PATH -> known installation fallback -> version
 * verification -> headless smoke. Emits an attempt-manifest-shaped record per
 * lane.
 *
 * Deliberately NOT part of executors.test.cjs: the smoke step invokes a
 * model-backed CLI, so it is slow, costs tokens and is not deterministic. The
 * process contract itself is proven against a controllable stand-in there.
 *
 * Usage:
 *   node verify-executors.cjs                 both lanes
 *   node verify-executors.cjs --lane CODEX_LOCAL
 *   node verify-executors.cjs --skip-smoke    resolution + version only
 */

const resolve = require('./resolve.cjs');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? fallback : process.argv[i + 1];
}
const has = (name) => process.argv.indexOf('--' + name) !== -1;

const SENTINEL = 'GOV_COORD_V2_SMOKE_OK';
const lanes = arg('lane', null) ? [arg('lane', null)] : resolve.LANES;
const skipSmoke = has('skip-smoke');

const results = [];
for (const lane of lanes) {
  const manifest = resolve.resolveExecutor({
    lane,
    sentinel: SENTINEL,
    skipSmoke,
    smokeTimeoutMs: Number(arg('smoke-timeout', '240000')),
  });
  results.push(manifest);

  process.stdout.write('\n' + lane + '\n');
  process.stdout.write('  state              : ' + manifest.state + '\n');
  process.stdout.write('  resolutionSource   : ' + (manifest.resolutionSource || '-') + '\n');
  process.stdout.write('  resolvedAbsolutePath: ' + (manifest.resolvedAbsolutePath || '-') + '\n');
  process.stdout.write('  version            : ' + (manifest.version || '-') + '\n');
  process.stdout.write('  smokeExitCode      : ' + String(manifest.smokeExitCode) + '\n');
  process.stdout.write('  smokeResult        : ' + manifest.smokeResult + '\n');
  if (manifest.unavailableReason) {
    process.stdout.write('  unavailableReason  : ' + manifest.unavailableReason + '\n');
  }
  if (manifest.detail) {
    process.stdout.write('  detail             : ' + manifest.detail + '\n');
  }
}

const available = results.filter((r) => r.state === 'AVAILABLE');
process.stdout.write(
  '\nAVAILABLE ' + available.length + '/' + results.length +
    (skipSmoke ? ' (smoke skipped — state stays UNAVAILABLE by contract §7.1)' : '') + '\n',
);
process.stdout.write('GOV_COORD_V2_EXECUTOR_VERIFY ' + JSON.stringify(results) + '\n');

// Exit non-zero when a lane could not be resolved or verified, so this can be
// used as a gate step rather than an advisory print.
process.exit(skipSmoke ? 0 : available.length === results.length ? 0 : 1);
