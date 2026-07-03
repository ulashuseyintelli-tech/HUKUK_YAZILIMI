import { expect, test } from '@playwright/test';
import { missingClientWorkspaceSmokeConfig, readClientWorkspaceSmokeConfig } from './smoke-config';

test('client workspace live smoke bootstrap contract is explicit', () => {
  const config = readClientWorkspaceSmokeConfig();

  expect(config.webBaseUrl).toMatch(/^https?:\/\//);
  expect(config.apiBaseUrl).toMatch(/^https?:\/\//);

  const missing = missingClientWorkspaceSmokeConfig(config);
  if (config.enabled) {
    expect(missing).toEqual([]);
  } else {
    expect(missing).toContain('CLIENT_WORKSPACE_LIVE_SMOKE=1');
  }
});