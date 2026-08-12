import {
  OFFICE_E2E_RUNTIME_SPECS,
  createOfficeE2eHarnessPlan,
  runOfficeE2eDisposableRuntime,
  type OfficeE2eSpawn,
} from './office-e2e-disposable-runtime';

const SAFE_URL = 'postgresql://test-user:test-pass@127.0.0.1:55439/office_e2e_test?schema=public';

describe('OFFICE B05 disposable runtime harness', () => {
  it('pins the dedicated OFFICE and execution-office runtime specs in one Jest process', () => {
    const plan = createOfficeE2eHarnessPlan({ TEST_DATABASE_URL: SAFE_URL });
    expect(plan.command).toBe(process.execPath);
    expect(plan.args).toEqual([
      expect.stringMatching(/jest[\\/]bin[\\/]jest\.js$/),
      '--ci',
      '--forceExit',
      '--runInBand',
      '--runTestsByPath',
      ...OFFICE_E2E_RUNTIME_SPECS,
    ]);
    expect(plan.cwd.replace(/\\/g, '/')).toMatch(/project\/apps\/api$/);
  });

  it('passes only the approved test URL and blanks ambient DATABASE_URL', () => {
    const plan = createOfficeE2eHarnessPlan({
      TEST_DATABASE_URL: SAFE_URL,
      DATABASE_URL: 'postgresql://ambient/authoritative',
    });
    expect(plan.env.TEST_DATABASE_URL).toBe(SAFE_URL);
    expect(plan.env.DATABASE_URL).toBe('');
  });

  it.each([
    [{}, 'OFFICE_E2E_TEST_DATABASE_URL_REQUIRED'],
    [{ TEST_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/hukuk_db' }, 'dev veritabanına'],
    [{ TEST_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/production' }, 'güvenli değil'],
  ])('fails closed before spawning for a missing or unsafe database target', (env, message) => {
    const spawn = jest.fn();
    expect(() => runOfficeE2eDisposableRuntime(env, spawn)).toThrow(message);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('executes the plan and accepts only a zero child exit status', () => {
    const spawn = jest.fn(() => ({ status: 0 })) as unknown as OfficeE2eSpawn;
    expect(() => runOfficeE2eDisposableRuntime({ TEST_DATABASE_URL: SAFE_URL }, spawn)).not.toThrow();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect((spawn as jest.Mock).mock.calls[0][2]).toMatchObject({ stdio: 'inherit' });
  });

  it('propagates child process failure as a terminal harness failure', () => {
    const spawn = jest.fn(() => ({ status: 1 })) as unknown as OfficeE2eSpawn;
    expect(() => runOfficeE2eDisposableRuntime({ TEST_DATABASE_URL: SAFE_URL }, spawn))
      .toThrow('OFFICE_E2E_RUNTIME_FAILED: exit=1');
  });
});
