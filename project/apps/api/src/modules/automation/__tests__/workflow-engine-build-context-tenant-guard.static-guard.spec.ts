/**
 * OD-3 tenant guard — statik kaynak taraması.
 *
 * buildContext/processCase gövdelerinin tenant-siz `case.findUnique({id})` deseninine geri
 * dönmediğini kanıtlar (bu dosyada `updateCaseStage`/`calculateNextActionTime` KASITLI olarak
 * bu turun kapsamı dışında bırakıldı ve hâlâ `findUnique` kullanıyor — bu guard yalnız
 * buildContext/processCase gövdelerini izole eder, dosyanın tamamını değil).
 */

import * as fs from 'fs';
import * as path from 'path';

describe('WorkflowEngine tenant guard — statik kaynak taraması (OD-3)', () => {
  const sourcePath = path.join(
    __dirname,
    '..',
    'workflow-engine.service.ts',
  );
  const source = fs.readFileSync(sourcePath, 'utf-8');

  const buildContextStart = source.indexOf('async buildContext(');
  const processCaseStart = source.indexOf('async processCase(');
  const executeRuleStart = source.indexOf('private async executeRule(');

  it('metot sınırları kaynakta bulunabiliyor (guard\'ın kendisi kırılmamış)', () => {
    expect(buildContextStart).toBeGreaterThan(-1);
    expect(processCaseStart).toBeGreaterThan(buildContextStart);
    expect(executeRuleStart).toBeGreaterThan(processCaseStart);
  });

  const buildContextBody = source.slice(buildContextStart, processCaseStart);
  const processCaseBody = source.slice(processCaseStart, executeRuleStart);

  it('buildContext gövdesinde case.findUnique kalmadı; case.findFirst + tenantId var', () => {
    expect(buildContextBody).not.toContain('case.findUnique');
    expect(buildContextBody).toContain('case.findFirst');
    expect(buildContextBody).toContain('tenantId');
  });

  it('processCase gövdesinde case.findUnique kalmadı (ikinci Case sorgusu da tenant-scoped)', () => {
    expect(processCaseBody).not.toContain('case.findUnique');
    expect(processCaseBody).toContain('case.findFirst');
  });

  it('buildContext bulunamama durumunda generic NotFoundException fırlatıyor (Error değil, caseId echo etmiyor)', () => {
    expect(buildContextBody).toContain('NotFoundException');
    expect(buildContextBody).not.toMatch(/throw new Error\(`Case not found/);
  });
});
