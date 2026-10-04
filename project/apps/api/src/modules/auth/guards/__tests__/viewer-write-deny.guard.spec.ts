/**
 * B4/B6 (owner GO 2026-09-27) — ViewerWriteDenyGuard: davranış + bağlama kilidi.
 *
 * (1) Davranış: VIEWER yazma fiilinde 403 VIEWER_WRITE_DENIED; okuma fiilleri ve işaretli okuma-POST'ları geçer;
 *     ADMIN/USER etkilenmez; yöntemi bilinmeyen fiil yazma sayılır (fail-closed).
 * (2) Bağlama: guard, envanterdeki 12 controller'ın SINIF düzeyi guard listesinde JWT guard'ından SONRA durur;
 *     `@AllowViewerReadOnlyPost()` YALNIZ kaynaktan yazma yapmadığı doğrulanmış altı handler'dadır. Yeni bir
 *     okuma-POST işareti eklenirse bu spec kırılır (bilinçli gözden geçirme zorunlu).
 */
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ViewerWriteDenyGuard, VIEWER_WRITE_DENIED } from '../viewer-write-deny.guard';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { CaseController } from '../../../case/case.controller';
import { CaseDebtorController } from '../../../debtor/case-debtor.controller';
import { ClaimItemController } from '../../../claim-item/claim-item.controller';
import { CollectionController } from '../../../collection/collection.controller';
import { ClientPayoutController } from '../../../client-settlement/client-payout.controller';
import { DispositionController } from '../../../client-settlement/disposition.controller';
import { ClientOffsetController } from '../../../client-settlement/client-offset.controller';
import { ClientPayoutManualReversalController } from '../../../client-settlement/client-payout-manual-reversal.controller';
import { CaseFeeAgreementController } from '../../../client-settlement/case-fee-agreement.controller';
import { ClientFinancialDisclosureController } from '../../../client-financial-disclosure/client-financial-disclosure.controller';
import { ClientFinancialDisclosureOfficeCommandController } from '../../../client-settlement/client-financial-disclosure-office-command.controller';
import { ExpenseRequestController } from '../../../expense-request/expense-request.controller';

const guard = new ViewerWriteDenyGuard(new Reflector());
const handlerWithAllow = () => undefined;
Reflect.defineMetadata('allowViewerReadOnlyPost', true, handlerWithAllow);
const plainHandler = () => undefined;

const ctx = (method: string, role: string | undefined, handler: () => void = plainHandler) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ method, user: role === undefined ? undefined : { id: 'u', tenantId: 't', role } }) }),
    getHandler: () => handler,
    getClass: () => Object,
  }) as any;

describe('ViewerWriteDenyGuard — davranış', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'TRACE', ''])('VIEWER + %s → 403 VIEWER_WRITE_DENIED', (method) => {
    try {
      guard.canActivate(ctx(method, 'VIEWER'));
      throw new Error('reddedilmeliydi');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getResponse()).toMatchObject({ code: VIEWER_WRITE_DENIED });
    }
  });

  it.each(['GET', 'HEAD', 'OPTIONS', 'get'])('VIEWER + %s (okuma) → geçer', (method) => {
    expect(guard.canActivate(ctx(method, 'VIEWER'))).toBe(true);
  });

  it.each(['ADMIN', 'USER'])('%s + POST → guard etkilemez (mevcut kapılar geçerli)', (role) => {
    expect(guard.canActivate(ctx('POST', role))).toBe(true);
  });

  it('VIEWER + @AllowViewerReadOnlyPost işaretli POST → geçer', () => {
    expect(guard.canActivate(ctx('POST', 'VIEWER', handlerWithAllow))).toBe(true);
  });
});

const CONTROLLERS: Array<[string, any]> = [
  ['CaseController', CaseController],
  ['CaseDebtorController', CaseDebtorController],
  ['ClaimItemController', ClaimItemController],
  ['CollectionController', CollectionController],
  ['ClientPayoutController', ClientPayoutController],
  ['DispositionController', DispositionController],
  ['ClientOffsetController', ClientOffsetController],
  ['ClientPayoutManualReversalController', ClientPayoutManualReversalController],
  ['CaseFeeAgreementController', CaseFeeAgreementController],
  ['ClientFinancialDisclosureController', ClientFinancialDisclosureController],
  ['ClientFinancialDisclosureOfficeCommandController', ClientFinancialDisclosureOfficeCommandController],
  ['ExpenseRequestController', ExpenseRequestController],
];

/** Kaynaktan yazma YAPMADIĞI doğrulanmış okuma/hesap POST'ları (değişirse bilinçli güncelleme). */
const EXPECTED_READ_ONLY_POSTS = [
  'CaseController.suggestCaseType',
  'ClaimItemController.calculateCheckPenalty',
  'ClaimItemController.calculateInterest',
  'ClaimItemController.validateCase',
  'ClientOffsetController.preview',
  'ExpenseRequestController.calculatePreview',
].sort();

describe('ViewerWriteDenyGuard — bağlama kilidi', () => {
  it.each(CONTROLLERS)('%s: sınıf düzeyinde guard var ve kimlik doğrulamadan SONRA', (_name, ctrl) => {
    const guards: any[] = Reflect.getMetadata(GUARDS_METADATA, ctrl) ?? [];
    const iView = guards.indexOf(ViewerWriteDenyGuard);
    expect(iView).toBeGreaterThan(0);
    // İlk guard kimlik doğrulamasıdır (JwtAuthGuard veya AuthGuard('jwt') — expense-request; passport mixin'i
    // tür başına önbelleğe alır, kimlikle karşılaştırılabilir).
    expect([JwtAuthGuard, AuthGuard('jwt')]).toContain(guards[0]);
  });

  it('okuma-POST işareti YALNIZ doğrulanmış altı handler\'da', () => {
    const marked: string[] = [];
    for (const [name, ctrl] of CONTROLLERS) {
      for (const key of Object.getOwnPropertyNames(ctrl.prototype)) {
        const fn = ctrl.prototype[key];
        if (typeof fn === 'function' && Reflect.getMetadata('allowViewerReadOnlyPost', fn) === true) marked.push(`${name}.${key}`);
      }
    }
    expect(marked.sort()).toEqual(EXPECTED_READ_ONLY_POSTS);
  });
});
