import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { BalanceDisplayShadowDiffController } from '../balance-display-shadow-diff.controller';
import type { BalanceDisplayShadowDiffService } from '../balance-display-shadow-diff.service';

describe('BalanceDisplayShadowDiffController', () => {
  it('actual route is GET /interest-engine/case/:caseId/balance/display/shadow-diff', () => {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, BalanceDisplayShadowDiffController);
    const methodPath = Reflect.getMetadata(
      PATH_METADATA,
      BalanceDisplayShadowDiffController.prototype.getShadowDiff,
    );
    const method = Reflect.getMetadata(
      METHOD_METADATA,
      BalanceDisplayShadowDiffController.prototype.getShadowDiff,
    );

    expect(method).toBe(RequestMethod.GET);
    expect(`${controllerPath}/${methodPath}`).toBe('interest-engine/case/:caseId/balance/display/shadow-diff');
  });

  it('tenantId auth contextten gelir; asOfDate iki hatta taşınacak effective date olur', async () => {
    const service = {
      compare: jest.fn().mockResolvedValue({ mode: 'SHADOW_ONLY' }),
    } as unknown as BalanceDisplayShadowDiffService;
    const controller = new BalanceDisplayShadowDiffController(service);

    await controller.getShadowDiff('tenant-auth', 'case-1', '2026-06-24', '2026-06-23');

    expect(service.compare).toHaveBeenCalledWith(
      'tenant-auth',
      'case-1',
      '2026-06-24',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
  });

  it('asOfDate yoksa date query kullanılır', async () => {
    const service = {
      compare: jest.fn().mockResolvedValue({ mode: 'SHADOW_ONLY' }),
    } as unknown as BalanceDisplayShadowDiffService;
    const controller = new BalanceDisplayShadowDiffController(service);

    await controller.getShadowDiff('tenant-auth', 'case-1', undefined, '2026-06-23');

    expect(service.compare).toHaveBeenCalledWith(
      'tenant-auth',
      'case-1',
      '2026-06-23',
      expect.any(String),
    );
  });
});
