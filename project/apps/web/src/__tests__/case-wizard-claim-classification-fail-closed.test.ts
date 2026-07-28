import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '..');
const mapperSource = fs.readFileSync(path.join(webRoot, 'lib/case-due-payload.ts'), 'utf8');
const pageSource = fs.readFileSync(path.join(webRoot, 'app/(dashboard)/cases/new/page.tsx'), 'utf8');

describe('case wizard claim classification fail-closed guard', () => {
  it('mapper unknown/blank classification için PRINCIPAL fallback içermez', () => {
    const mapperStart = mapperSource.indexOf('export function mapClaimKalemTuruToDueType');
    const mapperEnd = mapperSource.indexOf('/**', mapperStart);
    const mapperBlock = mapperSource.slice(mapperStart, mapperEnd);

    expect(mapperStart).toBeGreaterThan(-1);
    expect(mapperBlock).not.toMatch(/\|\|\s*['"]PRINCIPAL['"]/);
    expect(mapperBlock).not.toMatch(/\?\?\s*['"]PRINCIPAL['"]/);
    expect(mapperBlock).not.toMatch(/default\s*:\s*(return\s+)?['"]PRINCIPAL['"]/);
    expect(mapperBlock).not.toMatch(/catch[\s\S]*return\s+['"]PRINCIPAL['"]/);
  });

  it('wizard invalid classificationı createCase requestinden önce yakalar ve durdurur', () => {
    const submitStart = pageSource.indexOf('const handleSubmitClick = () =>');
    const createStart = pageSource.indexOf('const doCreateCase = async', submitStart);
    const submitBlock = pageSource.slice(submitStart, createStart);

    expect(submitStart).toBeGreaterThan(-1);
    expect(createStart).toBeGreaterThan(submitStart);
    expect(submitBlock).toContain('claimItemsToDues(');
    expect(submitBlock).toContain('classificationError instanceof ClaimKalemTuruValidationError');
    expect(submitBlock).toContain('setError(classificationError.message);');
    expect(submitBlock).toMatch(/setError\(classificationError\.message\);\s*return;/);
    expect(submitBlock).not.toContain('api.createCase(');
  });

  it('batch preflight legacy passthrough ve instrument routingden önce her kalem türünü doğrular', () => {
    const preflightStart = pageSource.indexOf('function claimItemsToDues(');
    const preflightEnd = pageSource.indexOf('function claimItemsToManualInstruments', preflightStart);
    const preflightBlock = pageSource.slice(preflightStart, preflightEnd);
    const validationIndex = preflightBlock.indexOf('mapClaimKalemTuruToDueType(item.raw?.kalemTuru)');
    const routingIndex = preflightBlock.indexOf('routeClaimRawsForManualInstruments(');

    expect(preflightStart).toBeGreaterThan(-1);
    expect(validationIndex).toBeGreaterThan(-1);
    expect(routingIndex).toBeGreaterThan(validationIndex);
  });

  it('edit/add yolu invalid classificationı state mutationından önce reddeder', () => {
    const handlerStart = pageSource.indexOf('const handleAddOrUpdateClaimItem = () =>');
    const handlerEnd = pageSource.indexOf('const handleEditClaimItem', handlerStart);
    const handlerBlock = pageSource.slice(handlerStart, handlerEnd);
    const validationIndex = handlerBlock.indexOf('mapClaimKalemTuruToDueType(claimFormBuffer.kalemTuru)');
    const stateMutationIndex = handlerBlock.indexOf('applyClaimDraftItems(');

    expect(handlerStart).toBeGreaterThan(-1);
    expect(validationIndex).toBeGreaterThan(-1);
    expect(stateMutationIndex).toBeGreaterThan(validationIndex);
  });
});
