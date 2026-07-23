import * as fs from 'fs';
import * as path from 'path';

/**
 * UYAP-ATTEMPT-CPE-DECISION-LINK-P05C-P02 — static contract.
 *
 * Dormant schema foundation + Policy Engine referential legal-hold filtresi.
 * Runtime writer/module/controller linkage YOKTUR (ayri owner GO).
 */
const API_ROOT = path.resolve(__dirname, '../../../../..');
const SCHEMA = fs.readFileSync(path.join(API_ROOT, 'prisma/schema.prisma'), 'utf8');
const MIGRATION = fs.readFileSync(
  path.join(API_ROOT, 'prisma/migrations/20260723010000_uyap_attempt_cpe_decision_link/migration.sql'),
  'utf8',
);
const RETENTION_SRC = fs.readFileSync(
  path.join(API_ROOT, 'src/modules/policy-engine/decision-logger/decision-log-retention.service.ts'),
  'utf8',
);

function modelBlock(name: string): string | null {
  const m = SCHEMA.match(new RegExp(`\\nmodel ${name} \\{[\\s\\S]*?\\n\\}`, 'm'));
  return m ? m[0] : null;
}

describe('P05C-P02 — link modeli sema kontrati', () => {
  const link = () => modelBlock('UyapAttemptCpeDecisionLink')!;

  it('model mevcut ve tam olarak ratifiye edilen alanlari tasir', () => {
    expect(link()).not.toBeNull();
    for (const f of ['id', 'tenantId', 'caseId', 'operationId', 'attemptId', 'cpeDecisionLogId', 'linkedAt']) {
      expect(link()).toMatch(new RegExp(`\\n\\s+${f}\\s`));
    }
  });

  it('role / disposition kolonu veya enum YOKTUR', () => {
    expect(link()).not.toMatch(/\brole\b/i);
    expect(link()).not.toMatch(/disposition/i);
    expect(SCHEMA).not.toContain('UyapCpeEvaluationRole');
    expect(SCHEMA).not.toContain('UyapCpeEvaluationDisposition');
  });

  it('kanonik duplicate key @@unique([cpeDecisionLogId]) — ayni karar TEK attempt (UYAP-CONST-002)', () => {
    expect(link()).toContain('@@unique([cpeDecisionLogId])');
    // attempt+decision ikilisi TEK BASINA yeterli DEGILDIR: cross-attempt tasimaya izin verirdi
    expect(link()).not.toContain('@@unique([attemptId, cpeDecisionLogId])');
  });

  it('uc composite FK case-attribution zincirini kapatir', () => {
    expect(link()).toContain('fields: [attemptId, operationId, tenantId], references: [id, operationId, tenantId]');
    expect(link()).toContain('fields: [operationId, caseId, tenantId], references: [id, caseId, tenantId]');
    expect(link()).toContain('fields: [cpeDecisionLogId, caseId], references: [id, caseId]');
  });

  it('uc FK de ON DELETE RESTRICT (fail-closed); Cascade/SetNull YASAK', () => {
    const restricts = (link().match(/onDelete: Restrict/g) || []).length;
    expect(restricts).toBe(3);
    expect(link()).not.toContain('onDelete: Cascade');
    expect(link()).not.toContain('onDelete: SetNull');
  });

  it('append-only: mutable durum/guncelleme alani YOK (updatedAt / @updatedAt yok)', () => {
    expect(link()).not.toContain('@updatedAt');
    expect(link()).not.toMatch(/\n\s+updatedAt\s/);
  });
});

describe('P05C-P02 — parent semalar', () => {
  it('UyapOperation composite unique hedefi kazandi', () => {
    expect(modelBlock('UyapOperation')).toContain('@@unique([id, caseId, tenantId])');
  });

  it('CpeDecisionLog yalnizca VIRTUAL back-relation aldi — tenantId kolonu YOK', () => {
    const cpe = modelBlock('CpeDecisionLog')!;
    expect(cpe).toContain('uyapAttemptLinks UyapAttemptCpeDecisionLink[]');
    expect(cpe).not.toMatch(/\n\s+tenantId\s+String/);
  });

  it('CpeExecutionRecord DEGISMEDI (kapsam disi)', () => {
    const rec = modelBlock('CpeExecutionRecord')!;
    expect(rec).not.toContain('@@unique');
    expect(rec).not.toContain('UyapAttemptCpeDecisionLink');
  });
});

describe('P05C-P02 — migration additive-only', () => {
  it('yalnizca 1 CREATE TABLE + index + 3 FK uretir', () => {
    expect((MIGRATION.match(/CREATE TABLE/g) || []).length).toBe(1);
    expect(MIGRATION).toContain('CREATE TABLE "UyapAttemptCpeDecisionLink"');
    expect((MIGRATION.match(/ADD CONSTRAINT .* FOREIGN KEY/g) || []).length).toBe(3);
    expect(MIGRATION).toContain('CREATE UNIQUE INDEX "UyapAttemptCpeDecisionLink_cpeDecisionLogId_key"');
    expect(MIGRATION).toContain('CREATE UNIQUE INDEX "UyapOperation_id_caseId_tenantId_key"');
  });

  it('uc FK de ON DELETE RESTRICT', () => {
    expect((MIGRATION.match(/ON DELETE RESTRICT/g) || []).length).toBe(3);
    expect(MIGRATION).not.toContain('ON DELETE CASCADE');
    expect(MIGRATION).not.toContain('ON DELETE SET NULL');
  });

  it('yikici DDL veya DML icermez (backfill YOK)', () => {
    expect(MIGRATION).not.toMatch(/^\s*(UPDATE|INSERT|DELETE|TRUNCATE|DROP)\s/im);
    expect(MIGRATION).not.toMatch(/ALTER TABLE "CpeDecisionLog"/);
    expect(MIGRATION).not.toMatch(/ADD COLUMN/i);
  });
});

describe('P05C-P02 — retention referential legal hold', () => {
  it('secim VE silme ayni legal-hold filtresini kullanir (atomik guvence)', () => {
    expect(RETENTION_SRC).toContain('uyapAttemptLinks: { none: {} }');
    expect(RETENTION_SRC).toContain('const retentionEligibleWhere');
    // deleteMany filtreyi TEKRARLAR — yalniz id listesi ile silmez
    expect(RETENTION_SRC).toMatch(/deleteMany\(\{\s*\n?\s*where: \{ id: \{ in: ids \}, \.\.\.retentionEligibleWhere \}/);
  });

  it('genel retention suresi DEGISMEDI (90 gun)', () => {
    expect(RETENTION_SRC).toContain('RETENTION_DAYS: 90');
  });

  it('gercek archive tablosu URETILMEDI (kapsam disi)', () => {
    expect(SCHEMA).not.toContain('model CpeDecisionLogArchive');
  });
});

describe('P05C-P02 — DORMANCY: runtime linkage YOK', () => {
  const dir = path.join(API_ROOT, 'src');
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  function walk(d: string, acc: string[] = []): string[] {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (e.name.endsWith('.ts') && !e.name.includes('.spec.')) acc.push(p);
    }
    return acc;
  }

  // P05C-P03 UYARLAMASI: bu guard P05C-P02'de "link tablosuna YAZAN uretim kodu YOK, writer
  // ayri owner GO bekler" demek icindi. O GO verildi (Karar C) ve tek YETKILI writer
  // `uyap-cpe-decision-link-writer.service.ts` ile geldi (kendi dormancy guard'lari var).
  // Guard emekliye ayrilmaz, DARALTILIR: yetkili writer disinda link tablosuna yazan BASKA
  // hicbir uretim kodu olmamali (yetkisiz ikinci writer / sizinti hala RED).
  it('link tablosuna yalnizca YETKILI P05C-P03 writer yazar; baska uretim yazici YOK', () => {
    const AUTHORIZED = path.join(
      API_ROOT,
      'src/modules/uyap/operation-writer/uyap-cpe-decision-link-writer.service.ts',
    );
    const writers = walk(dir).filter(
      (f) =>
        path.resolve(f) !== path.resolve(AUTHORIZED) &&
        /uyapAttemptCpeDecisionLink\s*\.\s*(create|createMany|upsert)/.test(stripComments(fs.readFileSync(f, 'utf8'))),
    );
    expect(writers).toEqual([]);
  });

  it('dormant UyapOperationWriterService link tablosuna DOKUNMAZ', () => {
    const w = fs.readFileSync(
      path.join(API_ROOT, 'src/modules/uyap/operation-writer/uyap-operation-writer.service.ts'),
      'utf8',
    );
    expect(stripComments(w)).not.toContain('UyapAttemptCpeDecisionLink');
  });

  it('link icin controller/route/DTO uretilmedi', () => {
    const referencing = walk(dir).filter(
      (f) =>
        /UyapAttemptCpeDecisionLink/.test(stripComments(fs.readFileSync(f, 'utf8'))) &&
        /\.(controller|dto)\.ts$/.test(f),
    );
    expect(referencing).toEqual([]);
  });
});
