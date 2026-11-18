import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function methodSlice(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('RCV-P2-WS01-P03 static ClaimItem direct-write absence', () => {
  const claimItemService = readFileSync(join(__dirname, '..', 'claim-item.service.ts'), 'utf8');
  const caseService = readFileSync(join(__dirname, '..', '..', 'case', 'case.service.ts'), 'utf8');
  const precautionaryService = readFileSync(
    join(__dirname, '..', '..', 'precautionary-order', 'precautionary-order.service.ts'),
    'utf8',
  );
  const backfillCore = readFileSync(
    join(__dirname, '..', '..', 'case', 'backfill', 'due-to-claimitem-backfill.core.ts'),
    'utf8',
  );
  const claimItemController = readFileSync(join(__dirname, '..', 'claim-item.controller.ts'), 'utf8');
  const officeApprovalDomainSync = readFileSync(
    join(__dirname, '..', '..', 'office-approval', 'office-approval-domain-sync.service.ts'),
    'utf8',
  );

  it('CaseService Due and instrument production paths contain no direct ClaimItem mutation', () => {
    expect(caseService).not.toMatch(/claimItem\.(create|update|delete)\s*\(/);
    expect(caseService).toContain("route: \"DUE_BRIDGE\"");
    expect(caseService).toContain("route: \"CASE_INSTRUMENT_GENERATOR\"");
  });

  /**
   * Owner kararı 18.11.2026 (K1 / K2 / K3): Due yazım yolu kullanıcı isteğiyle tetiklenir; bağlı kanonik kalemi iptal
   * edemez, kaleme yalnız düşük etkili yama gönderir ve her yazımdan önce kilit altındaki yetki denetiminden geçer.
   * Davranış kanıtı: case/__tests__/due-canonical-item-guard.http.db-gated.integration.spec.ts.
   */
  it('CaseService Due write path never cancels the bound ClaimItem and only forwards the low-impact patch', () => {
    expect(caseService).not.toContain('cancelSystemClaimItem');
    const sync = methodSlice(
      caseService,
      'private async syncLowImpactClaimItemFieldsFromDue(',
      'private async hasPendingClaimItemApproval(',
    );
    expect(sync).toContain('route: "DUE_BRIDGE"');
    expect(sync).toContain('data: { ...patch }');
    expect(sync).not.toMatch(/interest|amount|itemType|dueDate|status/i);
    // Köprü güncellemesinin tek çağıranı bu yöntemdir.
    expect(caseService.match(/updateSystemClaimItem\(/g)).toHaveLength(1);
  });

  it.each([
    ['createDue', '  async createDue(', '  async updateDue('],
    ['updateDue', '  async updateDue(', '  private normalizeDueInterestForWrite('],
    ['deleteDue', '  async deleteDue(', '  // ==================== TAHSİLATLAR (COLLECTIONS)'],
  ])('CaseService.%s authorizes inside the write transaction before its first Due / ClaimItem write', (_name, start, end) => {
    const source = methodSlice(caseService, start, end);
    const authority = source.indexOf('this.assertDueWriteAuthorityInTx(tx, tenantId, caseId, actorUserId)');
    expect(authority).toBeGreaterThan(source.indexOf('this.prisma.$transaction('));
    for (const write of ['tx.due.create(', 'tx.due.update(', 'tx.due.delete(', 'createSystemClaimItem(', 'syncLowImpactClaimItemFieldsFromDue(']) {
      const at = source.indexOf(write);
      if (at >= 0) expect(authority).toBeLessThan(at);
    }
  });

  /**
   * Kilit sırası (COL-LOCK-001): yetki denetimi dosya kilidini satır kilitlerinden ÖNCE alır; bağlı kalem satırı
   * sıradan güncelleme gücünde ve beklemesiz kilitlenir. Tahsilat / mahsup akışları dosya kilidini tutarken kaleme
   * yabancı anahtar kilidi koyar; `FOR UPDATE` ya da bekleyen kilit bu akışlarla kilitlenmeye yol açardı.
   */
  it('CaseService Due write path takes the case lock before row locks and locks the bound ClaimItem without waiting', () => {
    const authority = methodSlice(
      caseService,
      'private async assertDueWriteAuthorityInTx(',
      'private async assertCanGrantCasePermissions(',
    );
    const evaluated = authority.indexOf('evaluateHumanCaseFinanceWrite(');
    const caseLock = authority.indexOf('pg_advisory_xact_lock(hashtextextended(${caseId}, 0))');
    expect(evaluated).toBeGreaterThan(0);
    expect(caseLock).toBeGreaterThan(evaluated);
    expect(authority).toContain('COL-LOCK-001');

    const rowLock = methodSlice(
      caseService,
      'private async findLockedDueSyncClaimItem(',
      'private async syncLowImpactClaimItemFieldsFromDue(',
    );
    expect(rowLock).toContain('FOR NO KEY UPDATE NOWAIT');
    expect(rowLock).not.toContain('FOR UPDATE');
    expect(rowLock).toContain('DueClaimItemBusyException');
    // Due yazım yolunda kalem satırına bekleyen ya da anahtar gücünde kilit yoktur.
    expect(caseService).not.toMatch(/FROM "ClaimItem"[^`]*FOR UPDATE/);
  });

  it.each([
    ['autoGenerateFromDocument', 'async autoGenerateFromDocument(', 'async calculateInterest('],
    ['generateFromRuleEngine', 'async generateFromRuleEngine(', 'async validateWithRuleEngine('],
  ])('%s contains routed writes and no direct create', (_name, start, end) => {
    const source = methodSlice(claimItemService, start, end);
    expect(source).toContain('createSystemClaimItem');
    expect(source).not.toMatch(/claimItem\.create\s*\(/);
  });

  it('precautionary cost create and P04 retained-tombstone cancel are routed', () => {
    const source = methodSlice(
      precautionaryService,
      'private async createClaimItemFromCost(',
      'private mapCostTypeToClaimItemType(',
    );
    expect(source).toContain("route: 'PRECAUTIONARY_COST_WRITER'");
    expect(source).not.toMatch(/claimItem\.create\s*\(/);
    expect(precautionaryService).toContain('cancelSystemClaimItem');
    expect(precautionaryService).not.toMatch(/claimItem\.delete\s*\(/);
  });

  it('authorized backfill prepares every create through the shared source-integrity guard', () => {
    const source = methodSlice(backfillCore, 'export async function runBackfill(', 'export interface RollbackReport');
    expect(source).toContain('sourceIntegrity.prepareBackfillCreate');
    expect(source.indexOf('sourceIntegrity.prepareBackfillCreate'))
      .toBeLessThan(source.indexOf('tx.claimItem.create'));
    expect(backfillCore).not.toContain("route: 'DUE_BACKFILL'");
  });

  it('P04 generic hard delete is fail-closed and physical delete stays inside verified backfill rollback', () => {
    expect(claimItemService).toContain('assertClaimItemHardDeleteForbidden()');
    expect(claimItemService).not.toMatch(/claimItem\.delete\s*\(/);
    expect(precautionaryService).not.toMatch(/claimItem\.delete\s*\(/);

    const rollbackStart = backfillCore.indexOf('export async function runRollback(');
    expect(rollbackStart).toBeGreaterThanOrEqual(0);
    const rollback = backfillCore.slice(rollbackStart);
    expect(rollback).toContain('assertBackfillRollbackCandidate');
    expect(rollback).toContain('tx.claimItem.delete');
  });

  it('S08 human create routes converge on the guarded service boundary', () => {
    expect(claimItemController.match(/this\.service\.createFromUser\s*\(/g)).toHaveLength(4);
    expect(claimItemController).not.toMatch(/this\.service\.(create|addExpenseItem|addFeeItem|addAttorneyFeeItem)\s*\(/);

    const createFromUser = methodSlice(
      claimItemService,
      'async createFromUser(',
      'async findByCaseId(',
    );
    expect(createFromUser).toContain('this.assertApprovalRequired(gateResult)');
    expect(createFromUser).toContain('throwClaimItemFormationContextRequired()');
    expect(createFromUser).not.toContain('createHighImpactApprovalRequest');
    expect(createFromUser.indexOf('this.assertApprovalRequired(gateResult)'))
      .toBeLessThan(createFromUser.indexOf('throwClaimItemFormationContextRequired()'));
  });

  it('S08 legacy CREATE approval is rejected before the execution lock', () => {
    const readIntent = methodSlice(
      officeApprovalDomainSync,
      'private readClaimItemIntent(',
      'private async applyClaimItemCreate(',
    );
    const approve = methodSlice(
      officeApprovalDomainSync,
      'private async approveClaimItemHighImpact(',
      'private readClaimItemIntent(',
    );

    expect(readIntent).toContain("if (value.operation === 'CREATE')");
    expect(readIntent).toContain('throwClaimItemFormationContextRequired()');
    expect(approve.indexOf('this.readClaimItemIntent(req)'))
      .toBeLessThan(approve.indexOf('tx.officeApprovalRequest.updateMany'));
  });
});
