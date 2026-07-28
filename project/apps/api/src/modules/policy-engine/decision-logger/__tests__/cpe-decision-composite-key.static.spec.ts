import * as fs from 'fs';
import * as path from 'path';

/**
 * POLICY-CPE-DECISION-COMPOSITE-KEY-P05C-P01 — static contract.
 *
 * CpeDecisionLog'u gelecekteki tenant-safe UYAP evidence linkage icin composite FK HEDEFI yapar.
 * Kapsam BILINCLI olarak tek additive unique index'tir: tenantId kolonu YOK, backfill YOK,
 * link tablosu YOK, runtime/write-path degisikligi YOK, CpeExecutionRecord DEGISMEZ.
 */
const API_ROOT = path.resolve(__dirname, '../../../../..');
const SCHEMA = fs.readFileSync(path.join(API_ROOT, 'prisma/schema.prisma'), 'utf8');
const MIGRATION_DIR = path.join(
  API_ROOT,
  'prisma/migrations/20260722230000_cpe_decision_composite_reference_key',
);

function modelBlock(name: string): string | null {
  const m = SCHEMA.match(new RegExp(`\\nmodel ${name} \\{[\\s\\S]*?\\n\\}`, 'm'));
  return m ? m[0] : null;
}

describe('P05C-P01 — CpeDecisionLog composite reference key (schema)', () => {
  it('CpeDecisionLog @@unique([id, caseId]) tasir', () => {
    expect(modelBlock('CpeDecisionLog')).toContain('@@unique([id, caseId])');
  });

  it('tenantId kolonu EKLENMEDI (P05C-R0: turetme Case uzerinden, kolon gerekmez)', () => {
    expect(modelBlock('CpeDecisionLog')).not.toMatch(/\n\s+tenantId\s+String/);
  });

  it('mevcut alanlar/iliski KORUNDU: caseId NOT NULL + zorunlu Case relation', () => {
    const block = modelBlock('CpeDecisionLog')!;
    expect(block).toMatch(/\n\s+caseId\s+String\s*$/m); // nullable DEGIL (String? degil)
    expect(block).toContain('case Case @relation("CpeDecisionLogs"');
    expect(block).toContain('onDelete: Cascade');
    // mevcut index'ler duruyor
    for (const idx of ['@@index([caseId])', '@@index([actionCode])', '@@index([traceId])']) {
      expect(block).toContain(idx);
    }
  });

  // DEBTOR-CPE-TENANT-HARDENING-P1-I01 UYARLAMASI: `tenantId yok` assertion'i P05C-P01'in
  // kapsam guard'iydi ("bu fazda CpeExecutionRecord'a DOKUNULMADI"). Owner, DEBTOR-IDOR-02
  // remediation'i kapsaminda CpeExecutionRecord tenant binding'ini acikca yetkilendirdi;
  // guard amacina ulastigi icin emekliye ayrilir. P05C-P01'in KENDI katkisi degismeden
  // korunur: CpeExecutionRecord'a @@unique EKLENMEMISTIR.
  it('CpeExecutionRecord: P05C-P01 kapsami degismedi (@@unique EKLENMEDI)', () => {
    const block = modelBlock('CpeExecutionRecord')!;
    expect(block).not.toBeNull();
    expect(block).not.toContain('@@unique');
    // Tenant binding artik BEKLENEN durumdur (DEBTOR-CPE-TENANT-HARDENING-P1-I01).
    expect(block).toMatch(/\n\s+tenantId\s+String/);
  });

  // P05C-P02 UYARLAMASI: bu assertion P05C-P01'in kapsam guard'iydi ("link tablosu bu fazda
  // URETILMEDI, ayri owner GO bekler"). O GO verildi ve link tablosu P05C-P02 ile geldi;
  // guard amacina ulastigi icin emekliye ayrilir. P05C-P01'in KENDI kapsami degismeden
  // korunur: composite key hala tek additive index, CpeDecisionLog'a kolon EKLENMEMISTIR.
  it('link tablosu artik P05C-P02 tarafindan saglanir; P05C-P01 kapsami degismedi', () => {
    expect(modelBlock('UyapAttemptCpeDecisionLink')).not.toBeNull();
    // P05C-P01'in kendi katkisi: yalnizca composite unique — kolon YOK
    expect(modelBlock('CpeDecisionLog')).toContain('@@unique([id, caseId])');
    expect(modelBlock('CpeDecisionLog')).not.toMatch(/\n\s+tenantId\s+String/);
  });
});

describe('P05C-P01 — migration additive-only', () => {
  const sql = fs.readFileSync(path.join(MIGRATION_DIR, 'migration.sql'), 'utf8');

  it('TEK statement uretir ve yalnizca CREATE UNIQUE INDEX icerir', () => {
    expect((sql.match(/;/g) || []).length).toBe(1);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "CpeDecisionLog_id_caseId_key" ON "CpeDecisionLog"\("id", "caseId"\);/);
  });

  it('hicbir DML / yikici DDL icermez', () => {
    expect(sql).not.toMatch(/^\s*(UPDATE|INSERT|DELETE|TRUNCATE|DROP)\s/im);
    expect(sql).not.toMatch(/^\s*ALTER\s/im);
    expect(sql).not.toMatch(/CREATE TABLE/i);
  });

  it('tenantId veya backfill izi tasimaz', () => {
    expect(sql).not.toMatch(/tenantId/i);
    expect(sql).not.toMatch(/backfill/i);
  });
});

describe('P05C-P01 — write-path DOKUNULMADI', () => {
  const loggerSrc = fs.readFileSync(
    path.join(API_ROOT, 'src/modules/policy-engine/decision-logger/decision-logger.service.ts'),
    'utf8',
  );
  const cpeSrc = fs.readFileSync(
    path.join(API_ROOT, 'src/modules/policy-engine/case-policy-engine.service.ts'),
    'utf8',
  );

  it('DecisionLoggerService tenant-blind KALDI (tenantId yok)', () => {
    expect(loggerSrc).not.toContain('tenantId');
  });

  // DEBTOR-CPE-TENANT-HARDENING-P1-I01 UYARLAMASI: bu assertion P05C-P01'in kapsam guard'iydi
  // ("write-path'e DOKUNULMADI"). DEBTOR-IDOR-02 remediation'i ile CasePolicyEngine artik
  // tenant-aware'dir; guard emekliye ayrilir ve yerine kalici sozlesme konur.
  it('CasePolicyEngine artik tenant-aware (DEBTOR-IDOR-02 kapatildi)', () => {
    expect(cpeSrc).toContain('assertCaseBelongsToTenant');
    expect(cpeSrc).toMatch(/async canPerformAction\(\s*\n\s*tenantId: string,/);
  });

  it('tek create yolu korundu: cpeDecisionLog.create', () => {
    expect((loggerSrc.match(/cpeDecisionLog\.create/g) || []).length).toBe(1);
  });
});
