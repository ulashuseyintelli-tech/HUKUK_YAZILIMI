import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { UyapController } from '../uyap.controller';
import { UyapXmlService, UYAP_ROL_TURLERI } from '../uyap-xml.service';
import type { PrismaService } from '../../../prisma/prisma.service';

/**
 * DBP-P2-UYAP-CONTRACT-A-P01 — LEGACY SURFACE TRUTHFULNESS CONTAINMENT (F1–F5).
 *
 * Bu suite, legacy Contract A yüzeyinin (üretilen XML DEĞİŞMEDEN) resmî UYAP uyumluluğu ve
 * gerçek iletim konusunda yanlış güvence ÜRETMEDİĞİNİ kilitler. Kapsam: yalnız response
 * metadata / validation semantics / STUB response / label / yorum / dead-code temizliği.
 */

const SVC_DIR = resolve(__dirname, '..');
const WEB_CASE_DIR = resolve(__dirname, '..', '..', '..', '..', '..', 'web', 'src', 'components', 'case');

function readSvc(file: string): string {
  return readFileSync(resolve(SVC_DIR, file), 'utf8');
}
function readWeb(file: string): string {
  return readFileSync(resolve(WEB_CASE_DIR, file), 'utf8');
}

function controllerHarness(overrides: {
  submitResult?: { success: boolean; evkNo?: string; errorMessage?: string };
  validation?: { isValid: boolean; errors: string[] };
} = {}) {
  const generatedXml = '<exchangeData><dosyalar><dosya /></dosyalar></exchangeData>';
  const uyapService = {
    queryCaseStatus: jest.fn().mockResolvedValue({ data: { localStatus: 'TEST' } }),
    validateCasePoaForUyap: jest.fn().mockResolvedValue({ isValid: true, errors: [] }),
    submitDocument: jest
      .fn()
      .mockResolvedValue(overrides.submitResult ?? { success: true, evkNo: 'DOC-123456' }),
  };
  const xmlService = {
    generateFromCase: jest.fn().mockResolvedValue(generatedXml),
    validateXml: jest
      .fn()
      .mockReturnValue(
        overrides.validation ?? {
          isValid: true,
          errors: [],
          validationMode: 'LOCAL_STRUCTURAL_PRECHECK',
          officialDtdValidated: false,
        },
      ),
  };
  const guidedObserve = { observe: jest.fn().mockResolvedValue(undefined) };
  const controller = new UyapController(
    uyapService as never,
    xmlService as never,
    guidedObserve as never,
  );
  return { controller, uyapService, xmlService, guidedObserve, generatedXml };
}

describe('P01 F1 — preview legacy/noncompliant envelope', () => {
  it('preview response resmî sözleşme uyumluluğu iddia etmez, official version 2024.03 döndürmez', async () => {
    const { controller } = controllerHarness();
    const res: any = await controller.generateXmlFromCase('case-1', 'tenant-1');

    expect(res.contractMode).toBe('LEGACY_LOCAL');
    expect(res.officialContractCompliant).toBe(false);
    expect(res.officialContractVersion).toBeNull();
    expect(res.cutoverStatus).toBe('HOLD');

    // (2) official version 2024.03 hiçbir alanda dönmemeli
    expect(res.version).toBeUndefined();
    expect(JSON.stringify(res)).not.toContain('2024.03');
  });
});

describe('P01 F2 — validation semantics (local precheck, resmî DTD DEĞİL)', () => {
  const service = new UyapXmlService({} as unknown as PrismaService);
  const validXml =
    '<exchangeData><dosyalar><dosya dosyaTipi="1" takipTuru="1" mahiyetKodu="1007">' +
    '<taraf sira="1" rolTur="2"></taraf><alacakKalemi></alacakKalemi></dosya></dosyalar></exchangeData>';

  it('validateXml LOCAL_STRUCTURAL_PRECHECK + officialDtdValidated=false döner', () => {
    const r = service.validateXml(validXml);
    expect(r.validationMode).toBe('LOCAL_STRUCTURAL_PRECHECK');
    expect(r.officialDtdValidated).toBe(false);
  });

  it('yapısal ön-kontrolü geçen XML dahi resmî geçerli olarak raporlanmaz (isValid=true ama officialDtdValidated=false)', () => {
    const r = service.validateXml(validXml);
    expect(r.isValid).toBe(true);
    expect(r.officialDtdValidated).toBe(false);
  });

  it('yapısal eksik XML için isValid=false; yine officialDtdValidated=false', () => {
    const r = service.validateXml('<not-exchange/>');
    expect(r.isValid).toBe(false);
    expect(r.officialDtdValidated).toBe(false);
    expect(r.validationMode).toBe('LOCAL_STRUCTURAL_PRECHECK');
  });
});

describe('P01 F3 — submit STUB doğruluğu (gerçek iletim / sahte EVK yok)', () => {
  it('submit response mode=STUB, transmitted=false, evkNo=null; sahte EVK ve "kuyruğa alındı" yok', async () => {
    const { controller } = controllerHarness();
    const res: any = await controller.submitXmlToUyap('case-1', 'tenant-1', {
      user: { id: 'user-1', tenantId: 'tenant-1' },
    });

    expect(res.mode).toBe('STUB');
    expect(res.transmitted).toBe(false);
    expect(res.evkNo).toBeNull();
    // stub referansı taşınabilir ama resmî EVK olarak sunulamaz
    expect(res.stubReference).toBe('DOC-123456');
    expect(res.message).toContain('Yerel simülasyon');
    const blob = JSON.stringify(res);
    expect(blob).not.toContain('UYAP kuyruğuna alındı');
    expect(blob).not.toContain('kuyruğa alındı');
  });
});

describe('P01 F4 — yanlış-authority yorum/iddiaları kaldırıldı', () => {
  it('uyap-xml.service.ts "Resmi UYAP exchange.dtd formatına uygun" iddiası taşımaz', () => {
    const s = readSvc('uyap-xml.service.ts');
    expect(s).not.toContain('Resmi UYAP exchange.dtd formatına uygun');
    expect(s).toContain('NOT PROVEN CONTRACT-COMPLIANT');
  });

  it('schemas/exchange.dtd LOCAL/LEGACY olarak nitelenir; "Versiyon: 2024.03" authority iması taşımaz', () => {
    const d = readSvc('schemas/exchange.dtd');
    expect(d).toContain('NOT THE OFFICIAL UYAP exchange.dtd');
    expect(d).not.toContain('Versiyon: 2024.03');
  });
});

describe('P01 F5 — duplicate role-table export guard', () => {
  it('uyap-codes.ts artık UYAP_ROL_TURLERI export ETMEZ (tek runtime tablo: uyap-xml.service.ts)', () => {
    const c = readSvc('uyap-codes.ts');
    expect(c).not.toContain('export const UYAP_ROL_TURLERI');
  });
});

describe('P01 F7 — frontend truthful-label regression', () => {
  it('UyapXmlPanel.tsx yanıltıcı etiketler taşımaz, doğru etiketleri taşır', () => {
    const p = readWeb('UyapXmlPanel.tsx');
    expect(p).not.toContain('exchange.dtd v2024.03');
    expect(p).not.toContain('XML doğrulama başarılı');
    expect(p).not.toContain('Gönderim Başarılı');
    expect(p).toContain('resmî UYAP ile doğrulanmamış');
    expect(p).toContain('Gerçek UYAP iletimi yapılmadı');
  });

  it('XmlImport.tsx etiketi resmî uyumluluk iması taşımaz', () => {
    const x = readWeb('XmlImport.tsx');
    expect(x).not.toContain('exchange.dtd formatında UYAP XML dosyası');
    expect(x).toContain('doğrulanmamış');
  });
});

describe('P01 F9 — generated legacy XML shape/role-code regression equality', () => {
  const service = new UyapXmlService({} as unknown as PrismaService);

  it('aktif rol tablosu 10-kod (1..10) DEĞİŞMEDİ; resmî 21-71 kodları eklenmedi', () => {
    expect(UYAP_ROL_TURLERI.ALACAKLI.kod).toBe('1');
    expect(UYAP_ROL_TURLERI.BORCLU.kod).toBe('2');
    expect(UYAP_ROL_TURLERI.MIRASCI.kod).toBe('5');
    expect(UYAP_ROL_TURLERI.LEHTAR.kod).toBe('9');
    expect(UYAP_ROL_TURLERI.MUHATAP.kod).toBe('10');
    const kodlar = Object.values(UYAP_ROL_TURLERI).map((r) => r.kod);
    expect(kodlar).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('generateExchangeXml çıktısının şekli DEĞİŞMEDİ (DOCTYPE + rolTur attribute + kod korunur)', () => {
    const xml = service.generateExchangeXml({
      dosyaTipi: '1',
      takipTuru: '1',
      takipYolu: '1',
      takipSekli: '1',
      mahiyetKodu: '1007',
      birimKodu: '1',
      takipTarihi: '2026-01-01',
      paraBirimi: 'TL',
      taraflar: [
        {
          rolTur: UYAP_ROL_TURLERI.BORCLU.kod,
          kisiKurumTipi: '1',
          kisi: { ad: 'AD', soyad: 'SOYAD' },
        },
      ],
      alacakKalemleri: [
        { siraNo: 1, aciklama: 'Asıl Alacak', tutar: 1000, paraBirimi: 'TL' },
      ],
    });

    // Shape invariants (builder'a dokunulmadı):
    expect(xml).toContain('<!DOCTYPE exchangeData SYSTEM "exchange.dtd">');
    expect(xml).toContain('<exchangeData>');
    // rolTur hâlâ taraf ATTRIBUTE'u ve kod hâlâ 10-kodlu ('2' = BORCLU)
    expect(xml).toContain('rolTur="2"');
    expect(xml).toContain('<alacakKalemi');
  });
});

describe('P01 F10 — no schema/migration/official-builder assertion', () => {
  it('uyap-xml.service.ts hâlâ legacy builder (official builder / resmî rolID 21-71 eklenmedi)', () => {
    const s = readSvc('uyap-xml.service.ts');
    expect(s).not.toContain('OfficialExchangeBuilder');
    expect(s).not.toContain("rolID");
  });
});
