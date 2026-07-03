/**
 * CS5 — FactStoreService.addCaseLevelFacts() 'case.is_archived' fact'i.
 *
 * Kök neden: CASE_ARCHIVED gate'i (gates.compiled.ts:44) `facts.get('case.is_archived') === true`
 * okuyordu ama addCaseLevelFacts()'in Prisma `select` bloğu isArchived'ı hiç seçmiyordu ve hiçbir
 * `factMap.set('case.is_archived', ...)` çağrısı yoktu — fact HİÇBİR ZAMAN populate edilmiyordu,
 * gate pratikte ölüydü. Fix: case.is_closed ile AYNI desende select+set eklendi.
 */
import { FactStoreService } from '../fact-store.service';

function setup(caseRow: any) {
  const findUnique = jest.fn().mockResolvedValue(caseRow);
  const prisma: any = {
    case: { findUnique },
    icrabotCaseFact: { findMany: jest.fn().mockResolvedValue([]) },
    icrabotCaseFlag: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new FactStoreService(prisma);
  return { service, findUnique };
}

const baseCaseRow = {
  caseStatus: 'DERDEST',
  workflowStage: null,
  isAutoMode: false,
  isAutomationEnabled: true,
  allowUyapActions: true,
  hasArticle4Request: false,
  isMtsCase: false,
  type: 'ILAMLI',
  subType: null,
  subCategory: null,
  currency: 'TRY',
  principalAmount: 1000,
  createdAt: new Date('2026-01-01'),
  nextActionAt: null,
};

describe('CS5 FactStoreService — case.is_archived fact', () => {
  it('isArchived=false → case.is_archived fact = false (CASE_ARCHIVED tetiklenmez)', async () => {
    const { service, findUnique } = setup({ ...baseCaseRow, isArchived: false });

    const facts = await service.getFacts('case-1');

    expect(facts.get('case.is_archived')).toBe(false);
    // Prisma select'inde isArchived alanı GERÇEKTEN istendi (kök nedenin fix'i).
    expect(findUnique.mock.calls[0][0].select.isArchived).toBe(true);
  });

  it('isArchived=true → case.is_archived fact = true (CASE_ARCHIVED HARD gate tetiklenir)', async () => {
    const { service } = setup({ ...baseCaseRow, isArchived: true });

    const facts = await service.getFacts('case-1');

    expect(facts.get('case.is_archived')).toBe(true);
  });

  it('mevcut case.is_closed davranışı ETKİLENMEDİ (regresyon kontrolü)', async () => {
    const { service } = setup({ ...baseCaseRow, isArchived: false, caseStatus: 'HITAM' });

    const facts = await service.getFacts('case-1');

    expect(facts.get('case.is_closed')).toBe(true);
    expect(facts.get('case.is_archived')).toBe(false);
  });

  it('dosya bulunamazsa (findUnique null) → erken dönüş, hiçbir fact set edilmez, hata fırlamaz', async () => {
    const { service } = setup(null);

    const facts = await service.getFacts('missing-case');

    expect(facts.get('case.is_archived')).toBeUndefined();
  });
});
