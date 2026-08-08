/**
 * CAD C3-B01 (ikinci yarı) — X2-B03 client-safe dosya referansı primitifinin TÜKETİMİ.
 *
 * XL-B: primitifin TEK YAZARI X2'dir. Bu spec, C3'ün onu READ-ONLY tükettiğini ve
 * owner amendment'ının (ratifiye) dört kuralına uyduğunu kilitler:
 *   1. Kaynak yalnız `Case.fileNumber` (primitifin kendi sabiti ile doğrulanır).
 *   2. Aynı tenant + aynı müvekkil kapsamı doğrulanmadan projekte edilmez.
 *   3. Raw caseId/caseClientId/refId ve diğer iç ID'ler render'a girmez.
 *   4. `fileNumber` yoksa fallback YOK — referans üretilmez.
 */
import {
  CLIENT_SAFE_FILE_REFERENCE_CONTRACT_VERSION,
  CLIENT_SAFE_FILE_REFERENCE_LABEL,
  CLIENT_SAFE_FILE_REFERENCE_SOURCE,
} from '../../client-financial-disclosure/client-safe-file-reference.contract';
import { resolveClientSafeFileReferences } from '../client-statement-file-reference';
import {
  CLIENT_STATEMENT_RENDER_CONTRACT_VERSION,
  CLIENT_STATEMENT_RENDER_FORBIDDEN_FIELDS,
  createClientStatementRender,
  toClientSafeFileReference,
} from '../client-statement-render.contract';

const TENANT = 'tenant-1';
const CLIENT = 'client-1';

const buildPrisma = (links: any[]) => ({
  caseClient: { findMany: jest.fn().mockResolvedValue(links) },
}) as any;

describe('CAD C3-B01 — client-safe dosya referansı tüketimi (XL-B)', () => {
  // -------------------------------------------------------------------------------------
  // 1. Kaynak yalnız Case.fileNumber — primitif X2'den gelir, kopyalanmaz
  // -------------------------------------------------------------------------------------
  it('[B01b-1] üretilen referans X2 primitifinin sabitlerini taşır (yerel kopya YOK)', () => {
    const ref = toClientSafeFileReference('2026/9501');
    expect(ref).not.toBeNull();
    expect(ref!.source).toBe(CLIENT_SAFE_FILE_REFERENCE_SOURCE);
    expect(ref!.source).toBe('Case.fileNumber');
    expect(ref!.label).toBe(CLIENT_SAFE_FILE_REFERENCE_LABEL);
    expect(ref!.contractVersion).toBe(CLIENT_SAFE_FILE_REFERENCE_CONTRACT_VERSION);
    expect(ref!.value).toBe('2026/9501');
    expect(Object.isFrozen(ref)).toBe(true);
  });

  // -------------------------------------------------------------------------------------
  // 4. Fallback YOK
  // -------------------------------------------------------------------------------------
  it.each([[null], [undefined], [''], ['   ']])('[B01b-2] fileNumber yok/boş (%p) → referans ÜRETİLMEZ', (v) => {
    expect(toClientSafeFileReference(v as any)).toBeNull();
  });

  it('[B01b-3] primitifin kendi doğrulaması reddederse fail-closed null (kontrol karakteri)', () => {
    expect(toClientSafeFileReference('2026/9501')).toBeNull();
  });

  // -------------------------------------------------------------------------------------
  // 2. Tenant + müvekkil kapsamı
  // -------------------------------------------------------------------------------------
  it('[B01b-4] çözümleme sorgusu tenant VE müvekkil bağıyla sınırlıdır', async () => {
    const prisma = buildPrisma([{ caseId: 'case-a', case: { fileNumber: '2026/9501' } }]);
    await resolveClientSafeFileReferences(prisma, TENANT, CLIENT, ['case-a']);

    const where = prisma.caseClient.findMany.mock.calls[0][0].where;
    expect(where.clientId).toBe(CLIENT);
    expect(where.caseId).toEqual({ in: ['case-a'] });
    expect(where.client).toEqual({ tenantId: TENANT });
    expect(where.case).toEqual({ tenantId: TENANT });
  });

  it('[B01b-5] müvekkille bağı OLMAYAN dosya referans döndürmez (kapsam dışı sessizce düşer)', async () => {
    // Sorgu yalnız bağlı dosyayı döndürür; bağsız 'case-x' sonuçta YOKTUR.
    const prisma = buildPrisma([{ caseId: 'case-a', case: { fileNumber: '2026/9501' } }]);
    const map = await resolveClientSafeFileReferences(prisma, TENANT, CLIENT, ['case-a', 'case-x']);
    expect(map.has('case-a')).toBe(true);
    expect(map.has('case-x')).toBe(false);
    expect(map.size).toBe(1);
  });

  it('[B01b-6] bağlı dosyanın fileNumber\'ı boşsa referans üretilmez (fallback YOK)', async () => {
    const prisma = buildPrisma([
      { caseId: 'case-a', case: { fileNumber: '' } },
      { caseId: 'case-b', case: { fileNumber: '2026/9502' } },
    ]);
    const map = await resolveClientSafeFileReferences(prisma, TENANT, CLIENT, ['case-a', 'case-b']);
    expect(map.has('case-a')).toBe(false);
    expect(map.get('case-b')!.value).toBe('2026/9502');
  });

  it('[B01b-7] boş caseId listesinde DB\'ye hiç gidilmez', async () => {
    const prisma = buildPrisma([]);
    const map = await resolveClientSafeFileReferences(prisma, TENANT, CLIENT, []);
    expect(map.size).toBe(0);
    expect(prisma.caseClient.findMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------------------
  // 3. Render allowlist — iç ID sızıntısı yok
  // -------------------------------------------------------------------------------------
  it('[B01b-8] render nesnesi yalnız allowlist alanlarını taşır; iç ID YOK', () => {
    const ref = toClientSafeFileReference('2026/9501')!;
    const render = createClientStatementRender({
      scope: 'CLIENT_LEVEL',
      officeName: 'Test Büro',
      clientName: 'Müvekkil A',
      currency: 'TRY',
      periodStart: new Date('2026-06-01'),
      periodEnd: new Date('2026-06-30'),
      openingBalance: '100.00',
      closingBalance: '120.00',
      fileReference: null,
      lines: [
        {
          lineDate: new Date('2026-06-05'),
          label: 'Tahsilattan müvekkile aktarılacak',
          note: null,
          debit: '0.00',
          credit: '20.00',
          runningBalance: '120.00',
          isInformational: false,
          fileReference: ref,
        },
      ],
    });

    expect(render.contractVersion).toBe(CLIENT_STATEMENT_RENDER_CONTRACT_VERSION);
    const serialized = JSON.stringify(render);
    for (const forbidden of CLIENT_STATEMENT_RENDER_FORBIDDEN_FIELDS) {
      expect(Object.keys(render)).not.toContain(forbidden);
      expect(Object.keys(render.lines[0])).not.toContain(forbidden);
    }
    // İç ID desenleri (cuid benzeri) serileştirilmiş çıktıda bulunmamalı
    expect(serialized).not.toMatch(/"(statementId|caseClientId|refId|caseId|tenantId)"/);
    expect(Object.isFrozen(render)).toBe(true);
    expect(Object.isFrozen(render.lines[0])).toBe(true);
  });

  it('[B01b-9] client-level render başlıkta dosya referansı taşımaz; satır seviyesinde taşır', () => {
    const ref = toClientSafeFileReference('2026/9501')!;
    const render = createClientStatementRender({
      scope: 'CLIENT_LEVEL',
      officeName: 'Büro',
      clientName: 'Müvekkil',
      currency: 'TRY',
      periodStart: new Date('2026-06-01'),
      periodEnd: new Date('2026-06-30'),
      openingBalance: '0.00',
      closingBalance: '0.00',
      fileReference: null, // client-level: başlıkta dosya YOK (çok dosyalı)
      lines: [
        { lineDate: new Date('2026-06-05'), label: 'Masraf talebi', note: null, debit: '0.00', credit: '0.00', runningBalance: '0.00', isInformational: true, fileReference: ref },
      ],
    });
    expect(render.fileReference).toBeNull();
    expect(render.lines[0].fileReference!.value).toBe('2026/9501');
    expect(render.lines[0].isInformational).toBe(true); // POL-2 görsel karşılığı
  });
});
