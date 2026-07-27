import * as fs from 'fs';
import * as path from 'path';
import {
  COLLECTED_AMOUNT_REFERENCE_MANIFEST_V1,
} from '../allocation-evidence-qualification';
import { SummaryEngineService } from '../summary-engine.service';

const apiRoot = process.cwd();

describe('WS04-P02 allocation evidence inventory guards', () => {
  it('collectedAmount production reference manifesti eksiksiz ve stale kayıtsızdır', () => {
    const actual = sourceFiles(path.join(apiRoot, 'src'))
      .filter((file) => fs.readFileSync(file, 'utf8').includes('collectedAmount'))
      .map(normalizeRelative)
      .sort();
    const manifested = COLLECTED_AMOUNT_REFERENCE_MANIFEST_V1
      .map((entry) => entry.path)
      .sort();

    expect(actual).toEqual(manifested);
    expect(new Set(manifested).size).toBe(manifested.length);
    expect(
      COLLECTED_AMOUNT_REFERENCE_MANIFEST_V1
        .filter((entry) => entry.classification === 'RECONCILED_CACHE')
        .map((entry) => entry.path),
    ).toEqual(expect.arrayContaining([
      'src/modules/claim-item/claim-item.service.ts',
      'src/modules/collection/collection-cancel-executor.ts',
      'src/modules/summary-engine/summary-engine.service.ts',
    ]));
    expect(
      COLLECTED_AMOUNT_REFERENCE_MANIFEST_V1
        .some((entry) => (entry.classification as string) === 'LEGAL_AUTHORITY'),
    ).toBe(false);
    expect(
      COLLECTED_AMOUNT_REFERENCE_MANIFEST_V1
        .filter((entry) => entry.access === 'WRITE' || entry.access === 'READ_WRITE')
        .map((entry) => entry.path)
        .sort(),
    ).toEqual([
      'src/modules/collection/collection-cancel-executor.ts',
      'src/modules/precautionary-order/precautionary-order.service.ts',
      'src/modules/summary-engine/summary-engine.service.ts',
    ]);
  });

  /**
   * DORMANT_WRITE, "kodda yazma ifadesi var ama bilesen production'da erisilemez"
   * durumunu isaretler. Bu iddia bir yorum olarak kalirsa degersizdir: birisi
   * bileseni module kaydedip `enabled: true` verdiginde yetki manifesti hicbir
   * uyari uretmez. Asagidaki guard iddiayi MEKANIK bir degismeze cevirir.
   *
   * Kayitlar manifestten TURETILIR ve sinif adlari dosyadan okunur; ileride
   * eklenecek dormant kayitlar da otomatik olarak bu dogrulamaya girer.
   */
  it('DORMANT_WRITE kayitlari gercekten dormant kalir (call-site yok / default kapali / fail-closed)', () => {
    const dormant = COLLECTED_AMOUNT_REFERENCE_MANIFEST_V1.filter(
      (entry) => (entry.access as string) === 'DORMANT_WRITE',
    );

    // Vacuous pass koruması: sinif kullanimdan kalkarsa bu test bilincli olarak
    // guncellenmelidir, sessizce yesil kalmamalidir.
    expect(dormant.length).toBeGreaterThan(0);

    const productionFiles = sourceFiles(path.join(apiRoot, 'src')).map((file) => ({
      rel: normalizeRelative(file),
      text: fs.readFileSync(file, 'utf8'),
    }));

    const violations: string[] = [];

    for (const entry of dormant) {
      const source = read(entry.path);

      // Sinif adlari kaydin KENDI dosyasindan turetilir (sabit isim gomulmez).
      const exportedClasses = [...source.matchAll(/export class (\w+)/g)].map((m) => m[1]);
      if (exportedClasses.length === 0) {
        violations.push(`${entry.path}: export edilen sinif bulunamadi; dormancy dogrulanamaz`);
        continue;
      }

      // (a) production call-site YOK
      for (const file of productionFiles) {
        if (file.rel === entry.path) continue; // kendi tanim dosyasi
        for (const cls of exportedClasses) {
          if (new RegExp(`\\b${cls}\\b`).test(file.text)) {
            violations.push(
              `${entry.path}: '${cls}' artik ${file.rel} icinde referanslaniyor (production call-site)`,
            );
          }
        }
      }

      // (b) varsayilan kapali
      if (!/enabled\s*=\s*[^;]*\?\?\s*false/.test(source)) {
        violations.push(`${entry.path}: 'enabled' varsayilani '?? false' degil`);
      }

      // (c) fail-closed
      if (!/if\s*\(\s*!\s*this\.enabled\s*\)/.test(source)) {
        violations.push(`${entry.path}: enabled degilken fail-closed guard bulunamadi`);
      }
    }

    // Ihlal varsa: bilesen artik dormant degildir. Dogru cozum bu guard'i
    // gevsetmek DEGIL, access degerini owner karariyla 'WRITE' yapmak ve yolu
    // yukaridaki WRITE/READ_WRITE assertion listesine eklemektir.
    expect(
      violations.length === 0
        ? []
        : violations.concat(
            "DORMANT_WRITE kaydi artik dormant degil. Bileşen etkinlestiriliyorsa "
              + "access 'WRITE' olmali ve yolu WRITE/READ_WRITE assertion listesine "
              + 'owner karariyla eklenmelidir. Bu guard gevsetilmemelidir.',
          ),
    ).toEqual([]);
  });

  it('canonical module graph TBK100 allocator sağlar; legacy activation yüzeyi tek ve explicit kalır', () => {
    const summaryModule = read('src/modules/summary-engine/summary-engine.module.ts');
    const interestModule = read('src/modules/interest-engine/interest-engine.module.ts');
    const summaryService = read('src/modules/summary-engine/summary-engine.service.ts');
    const productionLegacyReferences = sourceFiles(path.join(apiRoot, 'src'))
      .filter((file) => fs.readFileSync(file, 'utf8').includes('this.allocateLegacy('))
      .map(normalizeRelative);

    expect(summaryModule).toContain('InterestEngineModule');
    expect(interestModule).toMatch(
      /exports:\s*\[[\s\S]*TBK100AllocatorService/,
    );
    expect(productionLegacyReferences).toEqual([
      'src/modules/summary-engine/summary-engine.service.ts',
    ]);
    expect(summaryService).toContain("code: 'LEGACY_ALLOCATOR_ACTIVE'");
    expect(summaryService).toContain('LEGACY_ALLOCATOR_FALLBACK');
  });

  it('negative harness legacy fallback aktivasyonunu diagnostic olmadan geçirmez', async () => {
    const service = new SummaryEngineService({} as never, undefined);
    (service as unknown as { rules: unknown }).rules = {
      version: 1,
      engine: 'evidence',
      policies: {
        allocation_order: ['PRINCIPAL'],
      },
      ledger_allocation: {
        enabled: true,
      },
    };
    const tx = {
      case: {
        findFirst: jest.fn().mockResolvedValue({
          currency: 'TRY',
          claimItems: [{
            id: 'claim-1',
            itemType: 'PRINCIPAL',
            demandedAmount: 10,
            amount: 10,
            collectedAmount: 0,
          }],
        }),
      },
      ledgerEntry: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          id: 'ledger-1',
          currency: 'TRY',
          allocations: data.allocations.create,
        })),
      },
      claimItem: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([
          { id: 'claim-1', collectedAmount: 10 },
        ]),
      },
      ledgerAllocation: {
        findMany: jest.fn().mockResolvedValue([
          { claimItemId: 'claim-1', amount: 10 },
        ]),
      },
    };

    const result = await service.allocatePaymentToLedgerInTx(
      tx as never,
      'tenant-1',
      'case-1',
      10,
      { commandId: 'evidence-command' },
    );

    expect(result.authorityEvidence.allocatorMode).toBe('LEGACY');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'LEGACY_ALLOCATOR_ACTIVE',
        reason: 'LEGACY_ALLOCATOR_FALLBACK',
      }),
    ]);
  });
});

function read(relativePath: string): string {
  return fs.readFileSync(path.join(apiRoot, relativePath), 'utf8');
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test') continue;
      files.push(...sourceFiles(fullPath));
      continue;
    }
    if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.yaml')) &&
      !entry.name.endsWith('.spec.ts')
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalizeRelative(file: string): string {
  return path.relative(apiRoot, file).replaceAll('\\', '/');
}
