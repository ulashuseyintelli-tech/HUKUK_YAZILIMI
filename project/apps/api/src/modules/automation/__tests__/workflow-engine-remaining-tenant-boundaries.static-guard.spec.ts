/**
 * WorkflowEngine remaining tenant boundaries — statik kaynak taraması.
 *
 * calculateNextActionTime/updateCaseStage gövdelerinin tenant-siz `case.findUnique({id})`
 * deseninine geri dönmediğini kanıtlar (bkz. workflow-engine-build-context-tenant-guard.
 * static-guard.spec.ts — o dosya yalnız buildContext/processCase'i izole eder).
 */

import * as fs from 'fs';
import * as path from 'path';

describe('WorkflowEngine remaining tenant boundaries — statik kaynak taraması', () => {
  const sourcePath = path.join(__dirname, '..', 'workflow-engine.service.ts');
  const source = fs.readFileSync(sourcePath, 'utf-8');

  const updateCaseStageStart = source.indexOf('async updateCaseStage(');
  const createEnforcementActionStart = source.indexOf('async createEnforcementAction(');
  const calculateNextActionTimeStart = source.indexOf('async calculateNextActionTime(');
  const mapActionToDecisionTypeStart = source.indexOf('private mapActionToDecisionType(');

  it('metot sınırları kaynakta bulunabiliyor (guard\'ın kendisi kırılmamış)', () => {
    expect(updateCaseStageStart).toBeGreaterThan(-1);
    expect(createEnforcementActionStart).toBeGreaterThan(updateCaseStageStart);
    expect(calculateNextActionTimeStart).toBeGreaterThan(createEnforcementActionStart);
    expect(mapActionToDecisionTypeStart).toBeGreaterThan(calculateNextActionTimeStart);
  });

  const updateCaseStageBody = source.slice(updateCaseStageStart, createEnforcementActionStart);
  const calculateNextActionTimeBody = source.slice(
    calculateNextActionTimeStart,
    mapActionToDecisionTypeStart,
  );

  it('updateCaseStage gövdesinde case.findUnique kalmadı; case.findFirst + tenantId var', () => {
    expect(updateCaseStageBody).not.toContain('case.findUnique');
    expect(updateCaseStageBody).toContain('case.findFirst');
    expect(updateCaseStageBody).toContain('tenantId');
  });

  it('updateCaseStage bulunamama durumunda generic NotFoundException fırlatıyor (caseId echo etmiyor)', () => {
    expect(updateCaseStageBody).toContain('NotFoundException');
    expect(updateCaseStageBody).not.toMatch(/throw new Error\(`Case not found/);
  });

  it('updateCaseStage imzası tenantId parametresi alır (bare caseId-only imza geri gelmedi)', () => {
    expect(source).toMatch(/async updateCaseStage\(\s*caseId:\s*string,\s*tenantId:\s*string/);
  });

  it('calculateNextActionTime gövdesinde case.findUnique kalmadı; case.findFirst + tenantId var', () => {
    expect(calculateNextActionTimeBody).not.toContain('case.findUnique');
    expect(calculateNextActionTimeBody).toContain('case.findFirst');
    expect(calculateNextActionTimeBody).toContain('tenantId');
  });

  it('calculateNextActionTime bulunamama durumunda generic NotFoundException fırlatıyor (caseId echo etmiyor)', () => {
    expect(calculateNextActionTimeBody).toContain('NotFoundException');
    expect(calculateNextActionTimeBody).not.toMatch(/throw new Error\(`Case not found/);
  });

  it('calculateNextActionTime imzası tenantId parametresi alır (bare caseId-only imza geri gelmedi)', () => {
    expect(source).toMatch(
      /async calculateNextActionTime\(caseId:\s*string,\s*tenantId:\s*string\)/,
    );
  });

  it('AutomationController.getNextAction artık @CurrentUser() ile tenantId taşır', () => {
    const controllerPath = path.join(__dirname, '..', 'automation.controller.ts');
    const controllerSource = fs.readFileSync(controllerPath, 'utf-8');
    const getNextActionStart = controllerSource.indexOf('getNextAction(');
    expect(getNextActionStart).toBeGreaterThan(-1);
    const getNextActionBody = controllerSource.slice(getNextActionStart, getNextActionStart + 300);
    expect(getNextActionBody).toContain('@CurrentUser()');
    expect(getNextActionBody).toContain('user.tenantId');
  });
});
