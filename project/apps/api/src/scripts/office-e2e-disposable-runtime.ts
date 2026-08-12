import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import * as path from 'node:path';

import { resolveTestDatabaseUrl } from '../../test/test-db-env';

export const OFFICE_E2E_RUNTIME_SPECS = Object.freeze([
  'src/modules/office/__tests__/office-e2e.db-gated.integration.spec.ts',
  'src/modules/execution-office/__tests__/execution-office.module.spec.ts',
  'src/modules/execution-office/__tests__/execution-office-update-security.db-gated.integration.spec.ts',
]);

export interface OfficeE2eHarnessPlan {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface OfficeE2eSpawnResult {
  status: number | null;
  error?: Error;
}

export type OfficeE2eSpawn = (
  command: string,
  args: string[],
  options: SpawnSyncOptions,
) => OfficeE2eSpawnResult;

/**
 * B05 disposable runtime plan. Yalniz TEST_DATABASE_URL kabul edilir; test-db-env
 * hukuk_db veya test isareti tasimayan hedefleri fail-closed reddeder. DATABASE_URL
 * boslanir, boylece repository .env/development DB fallback'i child process'e sizmaz.
 */
export function createOfficeE2eHarnessPlan(
  env: NodeJS.ProcessEnv = process.env,
): OfficeE2eHarnessPlan {
  const testDatabaseUrl = resolveTestDatabaseUrl(env);
  if (!testDatabaseUrl) {
    throw new Error('OFFICE_E2E_TEST_DATABASE_URL_REQUIRED');
  }
  return {
    command: process.execPath,
    args: [
      require.resolve('jest/bin/jest'),
      '--ci',
      '--forceExit',
      '--runInBand',
      '--runTestsByPath',
      ...OFFICE_E2E_RUNTIME_SPECS,
    ],
    cwd: path.resolve(__dirname, '..', '..'),
    env: {
      ...env,
      DATABASE_URL: '',
      TEST_DATABASE_URL: testDatabaseUrl,
    },
  };
}

export function runOfficeE2eDisposableRuntime(
  env: NodeJS.ProcessEnv = process.env,
  spawn: OfficeE2eSpawn = spawnSync as OfficeE2eSpawn,
): void {
  const plan = createOfficeE2eHarnessPlan(env);
  const result = spawn(plan.command, plan.args, {
    cwd: plan.cwd,
    env: plan.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`OFFICE_E2E_RUNTIME_FAILED: exit=${String(result.status)}`);
  }
}

if (require.main === module) {
  try {
    runOfficeE2eDisposableRuntime();
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
