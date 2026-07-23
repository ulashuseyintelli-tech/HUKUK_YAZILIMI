import * as fs from 'fs';
import * as path from 'path';

/**
 * UYAP-OPERATION-ATTEMPT-SCHEMA-FOUNDATION-P05A-R1 — static contract.
 *
 * schema.prisma metnini okuyarak P-E5A-R1 kapsamını doğrular: yalnız 3 enum + 2 model;
 * CPE-link/CPE-enum YOK; canonical id == operationId/attemptId (ayrı kolon YOK); yeni modellerde
 * traceId YOK; legacy UyapRequestLog/CpeDecisionLog/CpeExecutionRecord alanları DEĞİŞMEDİ.
 */
const SCHEMA = fs.readFileSync(path.resolve(__dirname, '../../../../prisma/schema.prisma'), 'utf8');

function modelBlock(name: string): string | null {
  const m = SCHEMA.match(new RegExp(`\\nmodel ${name} \\{[\\s\\S]*?\\n\\}`, 'm'));
  return m ? m[0] : null;
}
function enumBlock(name: string): string | null {
  const m = SCHEMA.match(new RegExp(`\\nenum ${name} \\{[\\s\\S]*?\\n\\}`, 'm'));
  return m ? m[0] : null;
}

describe('UYAP-OPERATION-ATTEMPT-SCHEMA-P05A-R1 — static contract', () => {
  it('exact 3 target enums exist with exact values', () => {
    const int = enumBlock('UyapInternalOperationState');
    const prov = enumBlock('UyapProviderState');
    const legal = enumBlock('UyapLegalEffectState');
    expect(int).not.toBeNull();
    expect(prov).not.toBeNull();
    expect(legal).not.toBeNull();
    for (const v of ['DRAFT', 'VALIDATED', 'AWAITING_APPROVAL', 'APPROVED', 'AWAITING_SIGNATURE', 'SIGNED', 'ATTEMPT_IN_PROGRESS', 'MANUAL_REVIEW_REQUIRED', 'CANCELLED'])
      expect(int).toContain(v);
    for (const v of ['NOT_DISPATCHED', 'DISPATCH_IN_PROGRESS', 'RECEIVED', 'ACCEPTED', 'REJECTED', 'OUTCOME_UNKNOWN'])
      expect(prov).toContain(v);
    for (const v of ['NONE', 'PENDING_CONFIRMATION', 'CONFIRMED']) expect(legal).toContain(v);
  });

  it('NO CPE-specific enum in P-E5A-R1 (deferred to P-E5C)', () => {
    expect(enumBlock('UyapCpeEvaluationRole')).toBeNull();
    expect(enumBlock('UyapCpeEvaluationDisposition')).toBeNull();
  });

  // P05C-P02 UYARLAMASI: bu assertion P-E5A-R1'in kapsam guard'iydi ve "CPE-link P-E5C'ye
  // ERTELENDI" demek icin link modelinin YOKLUGUNU dogruluyordu. Erteleme, bu modeli kendi
  // sozlesmesiyle (kardinalite + uc composite FK + RESTRICT) getiren P05C-P02 ile YERINE
  // GETIRILMISTIR; guard amacina ulastigi icin emekliye ayrilir. P-E5A-R1'in KENDI kapsami
  // degismeden korunur: hedef 2 model hala mevcut ve CPE-evaluation ENUM'lari hala YOK
  // (bkz. bir ustteki test) — yani P-E5A-R1 link'i getirmemistir, P05C-P02 getirmistir.
  it('exact 2 target models exist; CPE-link artik P05C-P02 tarafindan saglanir', () => {
    expect(modelBlock('UyapOperation')).not.toBeNull();
    expect(modelBlock('UyapAttempt')).not.toBeNull();
    expect(modelBlock('UyapAttemptCpeDecisionLink')).not.toBeNull();
  });

  it('canonical id is the PK; no duplicate operationId/attemptId columns', () => {
    const op = modelBlock('UyapOperation')!;
    const at = modelBlock('UyapAttempt')!;
    expect(op).toMatch(/\n\s+id\s+String\s+@id\s+@default\(cuid\(\)\)/);
    expect(at).toMatch(/\n\s+id\s+String\s+@id\s+@default\(cuid\(\)\)/);
    // ayrı scalar operationId/attemptId kolonu YOK (UyapAttempt.operationId FK alanı hariç)
    expect(op).not.toMatch(/\n\s+operationId\s+String/);
    expect(op).not.toMatch(/\n\s+attemptId\s+String/);
    expect(at).not.toMatch(/\n\s+attemptId\s+String/);
  });

  it('new models carry NO traceId column (D7: CpeDecisionLog.id is canonical, deferred)', () => {
    expect(modelBlock('UyapOperation')).not.toContain('traceId');
    expect(modelBlock('UyapAttempt')).not.toContain('traceId');
  });

  it('UyapOperation carries tenant-safe composite constraints and correlation-only fields', () => {
    const op = modelBlock('UyapOperation')!;
    expect(op).toContain('@@unique([id, tenantId])');
    expect(op).toContain('@@unique([tenantId, idempotencyKey])');
    expect(op).toMatch(/clientRequestId\s+String\?/); // nullable, correlation-only
    expect(op).toMatch(/httpCorrelationId\s+String\?/);
    expect(op).toMatch(/idempotencyKey\s+String\s+@db\.VarChar\(256\)/); // required
    // composite tenant-safe FK'lar
    expect(op).toContain('references: [id, tenantId]');
  });

  it('UyapAttempt carries attempt-chain + three-state + attempt uniqueness', () => {
    const at = modelBlock('UyapAttempt')!;
    expect(at).toContain('@@unique([operationId, attemptNumber])');
    expect(at).toContain('@@unique([id, tenantId])');
    expect(at).toContain('@@unique([id, operationId, tenantId])');
    expect(at).toMatch(/providerState\s+UyapProviderState/);
    expect(at).toMatch(/legalEffectState\s+UyapLegalEffectState/);
    expect(at).toContain('references: [id, operationId, tenantId]'); // previous-attempt same op+tenant
  });

  it('legacy UyapRequestLog is UNCHANGED (no operation/attempt/correlation/CPE columns added)', () => {
    const log = modelBlock('UyapRequestLog')!;
    expect(log).not.toBeNull();
    for (const forbidden of ['operationId', 'attemptId', 'correlationId', 'cpeTraceId', 'httpCorrelationId', 'idempotencyKey'])
      expect(log).not.toContain(forbidden);
    // mevcut karakteristik alanlar korunuyor
    expect(log).toContain('requestType');
    expect(log).toContain('responseData');
    expect(log).toContain('retryCount');
  });

  it('legacy CpeDecisionLog / CpeExecutionRecord UNCHANGED (no tenantId added to CpeDecisionLog)', () => {
    const dec = modelBlock('CpeDecisionLog')!;
    const exec = modelBlock('CpeExecutionRecord')!;
    expect(dec).not.toBeNull();
    expect(exec).not.toBeNull();
    // CpeDecisionLog tenant-plane'e taşınmadı (P-E5C prereq): tenantId kolonu EKLENMEDİ
    expect(dec).not.toMatch(/\n\s+tenantId\s+String/);
    expect(dec).toContain('traceId'); // mevcut traceId korunuyor
    expect(exec).toContain('executionId'); // mevcut korunuyor
  });
});
