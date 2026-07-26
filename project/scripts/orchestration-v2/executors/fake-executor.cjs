'use strict';
/**
 * Controllable stand-in executor for the T3 process-contract gate.
 *
 * The real Claude and Codex CLIs are model-backed: invoking them in a unit
 * suite would be slow, costly and non-deterministic. The process contract in
 * spawn.cjs (§7.2-§7.6) is about argv safety, environment construction, stream
 * limits, cancellation and process-tree termination — none of which depend on
 * the child being a real model. This fake exercises every one of those paths
 * deterministically.
 *
 * Real-executor resolution, version and headless smoke are verified separately
 * by verify-executors.cjs, which is run against the live CLIs for evidence.
 */

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? fallback : process.argv[i + 1];
}

const mode = arg('mode', 'ok');

switch (mode) {
  case 'version':
    process.stdout.write('fake-executor 9.9.9\n');
    process.exit(0);
    break;

  case 'smoke':
    process.stdout.write(arg('sentinel', 'GOV_COORD_V2_SMOKE_OK') + '\n');
    process.exit(0);
    break;

  case 'ok':
    process.stdout.write('done\n');
    process.exit(0);
    break;

  case 'fail':
    process.stderr.write('deliberate failure\n');
    process.exit(7);
    break;

  case 'hang':
    process.stdout.write('started\n');
    setInterval(() => {}, 1000);
    break;

  case 'spawn-child-hang': {
    // A grandchild that outlives a naive single-pid kill.
    const { spawn } = require('child_process');
    const child = spawn(
      process.execPath,
      ['-e', 'setInterval(function(){}, 1000)'],
      { stdio: 'ignore', detached: process.platform !== 'win32' },
    );
    process.stdout.write('grandchild=' + child.pid + '\n');
    setInterval(() => {}, 1000);
    break;
  }

  case 'json':
    process.stdout.write('some prose the executor happens to print\n');
    process.stdout.write(
      'GOV_COORD_RESULT ' + JSON.stringify({ ok: true, changed: ['a.ts'] }) + '\n',
    );
    process.exit(0);
    break;

  case 'json-invalid':
    process.stdout.write('GOV_COORD_RESULT ' + JSON.stringify({ ok: false }) + '\n');
    process.exit(0);
    break;

  case 'json-unparseable':
    process.stdout.write('GOV_COORD_RESULT {not json at all\n');
    process.exit(0);
    break;

  case 'stderr':
    process.stdout.write('on-stdout\n');
    process.stderr.write('on-stderr\n');
    process.exit(0);
    break;

  case 'flood': {
    const bytes = Number(arg('bytes', '200000'));
    const chunk = 'x'.repeat(1000);
    for (let written = 0; written < bytes; written += chunk.length) {
      process.stdout.write(chunk);
    }
    process.stdout.write('\n');
    process.exit(0);
    break;
  }

  case 'dump-env':
    process.stdout.write(JSON.stringify(process.env) + '\n');
    process.exit(0);
    break;

  case 'dump-argv':
    process.stdout.write(JSON.stringify(process.argv.slice(2)) + '\n');
    process.exit(0);
    break;

  case 'dump-cwd':
    process.stdout.write(process.cwd().replace(/\\/g, '/') + '\n');
    process.exit(0);
    break;

  case 'read-stdin': {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { buf += d; });
    process.stdin.on('end', () => {
      process.stdout.write('stdin=' + buf + '\n');
      process.exit(0);
    });
    break;
  }

  default:
    process.stderr.write('unknown mode ' + mode + '\n');
    process.exit(2);
}
