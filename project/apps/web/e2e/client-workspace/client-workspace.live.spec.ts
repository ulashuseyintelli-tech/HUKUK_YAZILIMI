import { expect, test } from '@playwright/test';
import {
  missingClientWorkspaceSmokeConfig,
  readClientWorkspaceSmokeConfig,
  resolveClientWorkspaceSmokeToken,
} from './smoke-config';

const config = readClientWorkspaceSmokeConfig();
const missingConfig = missingClientWorkspaceSmokeConfig(config);

const clientsLinkName = /M\u00fcvekkiller|Muvekkiller/i;
const actionsTabName = /\u0130\u015flemler|Islemler/i;
const activityTabName = /Aktivite|Activity/i;
const poaTabName = /Vekalet|POA/i;
const poaUploadName = /Vekalet dosyas\u0131 y\u00fckle|Vekalet dosyasi yukle/i;

test.describe('Client Workspace live smoke', () => {
  test.skip(!config.enabled, 'Set CLIENT_WORKSPACE_LIVE_SMOKE=1 to run the live browser smoke.');
  test.skip(missingConfig.length > 0, `Missing Client Workspace smoke config: ${missingConfig.join(', ')}`);

  test('opens workspace shell with auth bootstrap and checks core read/action surfaces', async ({ page, request }) => {
    const runtimeErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });
    page.on('pageerror', (error) => runtimeErrors.push(error.message));

    const token = await resolveClientWorkspaceSmokeToken(request, config);
    await page.addInitScript((authToken) => {
      window.localStorage.setItem('token', authToken as string);
    }, token);

    await page.goto(`/clients/${config.clientId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('main').getByRole('link', { name: clientsLinkName }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: actionsTabName })).toBeVisible();
    await expect(page.getByRole('tab', { name: activityTabName })).toBeVisible();
    await expect(page.getByRole('tab', { name: poaTabName })).toBeVisible();

    await page.getByRole('tab', { name: actionsTabName }).click();
    await expect(page.getByText(/Action Center|İşlemler|Islemler/i).first()).toBeVisible();
    await expect(page.getByText(/intake\.link\.send/i)).toHaveCount(0);

    await page.getByRole('tab', { name: activityTabName }).click();
    await expect(page.getByText(activityTabName).first()).toBeVisible();

    await page.getByRole('tab', { name: poaTabName }).click();
    await expect(page.getByLabel(poaUploadName).first()).toBeAttached();
    await expect(page.getByText(/filePath|storage path|provider raw|dedupeKey|raw error/i)).toHaveCount(0);

    expect(runtimeErrors).toEqual([]);
  });
});