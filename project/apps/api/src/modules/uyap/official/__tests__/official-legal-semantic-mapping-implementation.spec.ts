/**
 * UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-IMPLEMENTATION-I01
 *
 * Owner disposition (`UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-OWNER-RATIFICATION-R01`,
 * 2026-07-29): 11 aday satırdan **8 koşulsuz APPROVE**, **3 APPROVE WITH EXACT
 * SEMANTIC CONSTRAINT** (W-02, M-01, M-02). Kısıtlar implementasyonun PARÇASIDIR —
 * karşılanmayan koşul `AUTHORITY_REQUIRED`/`MODEL_RESIDUAL` üretir, hiçbir varsayım
 * uygulanmaz.
 *
 * ## Kapsam sınırı (bağlayıcı)
 *
 * Bu görev YALNIZ 11 owner-approved satırın **anlam çözümleyicilerini** (pure
 * function) implemente eder. `alacakKalemi` ELEMENT EMİSYONU kapsam DIŞINDADIR —
 * `official-exchange-builder.ts` P02B-R2'nin fail-closed reddini AYNEN korur (bkz.
 * XA-EM aşağıda). Real transport / production adapter / Canary execution / strict
 * DTD PASS iddiası YOKTUR.
 *
 * ## M-01 — MODEL_RESIDUAL (implemente EDİLMEDİ)
 *
 * Owner M-01'i (9009, Nafaka - Örnek 7, ilamsız) APPROVE etti ancak owner koşulu 3
 * ("CaseSubCategory adı dışında canonical legal basis") ilamsız kolda karşılanamadı:
 * `CaseJudgment` yok (ilamsız = ilam yok); aday ikinci alan (`Due.type=NAFAKA`)
 * bulundu ama `ClaimItem` karşısında canonical authority statüsü governance
 * kaydıyla belirlenmemiş. Tahmin/schema değişikliği YAPILMADI.
 *
 * Matris: **IG-T-01..04 · IG-W-01..05 · IG-M-01..02 · IG-XA-01..07**
 */
import * as fs from 'fs';
import * as path from 'path';
import type { InstrumentType, ProceedingType } from '@prisma/client';
import {
  resolveOfficialAlacakKalemiWrapper,
  resolveOfficialMahiyetKodu,
  resolveOfficialTakipTuru,
} from '../official-codelist-registry';
import { serializeUyapExchangeCanonical } from '../official-canonical-serializer';
import type { OfficialExchangeInput } from '../official-exchange.types';
import { resolveOfficialRole } from '../official-role-translator';
import { DebtorRole } from '@prisma/client';

const API_ROOT = path.resolve(__dirname, '../../../../..');
const OFFICIAL_DIR = path.join(API_ROOT, 'src/modules/uyap/official');
const SCHEMA_PATH = path.join(API_ROOT, 'prisma/schema.prisma');
const code = (p: string) => fs.readFileSync(p, 'utf8');

const input = (
  dosya: Partial<OfficialExchangeInput['dosya']> = {},
): OfficialExchangeInput => ({
  dosya: {
    dosyaTipi: '1',
    takipTuruResolution: { kind: 'NOT_ASSERTED' },
    ...dosya,
  },
  taraflar: [
    {
      id: 'T1',
      roleResolution: resolveOfficialRole(DebtorRole.ASIL_BORCLU),
      kisi: { adi: 'Ahmet', soyadi: 'Yilmaz' },
    },
  ],
});

// ============================================================================
// IG-T — takipTuru (T-01..T-04 APPROVE; T-05..T-11 owner tablosunda YOK)
// ============================================================================

describe('IG-T — takipTuru owner-ratified satırlar', () => {
  it.each([
    ['IG-T-01', 'GENERAL_EXECUTION', '1'],
    ['IG-T-02', 'CAMBIO', '1'],
    ['IG-T-03', 'RENT', '1'],
    ['IG-T-04', 'JUDGMENT_ENFORCEMENT', '0'],
  ] as const)('%s: %s → resmî %s (owner APPROVE, koşulsuz)', (_id, proceedingType, code) => {
    const r = resolveOfficialTakipTuru({ proceedingType });
    expect(r.kind).toBe('RESOLVED');
    if (r.kind === 'RESOLVED') expect(r.code).toBe(code);
  });

  it('IG-T-03/04 yapısal ayrıklık: ProceedingType TEKİL alan, RENT ve JUDGMENT_ENFORCEMENT aynı anda olamaz', () => {
    // T-03 owner koşulu ("yalnız ilamsız RENT; ilama dayalı tahliye JUDGMENT_ENFORCEMENT
    // sınıfına girmeli") schema seviyesinde garanti edilir: Case.proceedingType tekil
    // nullable enum alanıdır (dizi değil), bu yüzden bir Case aynı anda iki değer
    // TAŞIYAMAZ. Bu, tahmin değil ölçümdür.
    const schema = code(SCHEMA_PATH);
    expect(schema).toMatch(/proceedingType\s+ProceedingType\?/);
    expect(schema).not.toMatch(/proceedingType\s+ProceedingType\[\]/);
  });

  it('IG-T-05..10: owner tablosuna hiç girmeyen türler AUTHORITY_REQUIRED', () => {
    for (const pt of [
      'PLEDGE',
      'MORTGAGE',
      'EVICTION',
      'BANKRUPTCY',
      'PUBLIC_RECEIVABLE',
    ] as const) {
      const r = resolveOfficialTakipTuru({ proceedingType: pt });
      expect(r.kind).toBe('AUTHORITY_REQUIRED');
    }
  });

  it('IG-T-11: sınıflandırılmamış (null) fail-closed, tahmin ETMEZ', () => {
    const r = resolveOfficialTakipTuru({ proceedingType: null });
    expect(r.kind).toBe('AUTHORITY_REQUIRED');
  });

  it('IG-T-EMIT: owner-ratified satırlar canonical serializer üzerinden gerçekten emit edilir', () => {
    const r = serializeUyapExchangeCanonical(
      input({ takipTuruResolution: resolveOfficialTakipTuru({ proceedingType: 'GENERAL_EXECUTION' }) }),
    );
    expect(r.status).toBe('CANONICAL_BYTES');
    if (r.status === 'CANONICAL_BYTES') {
      expect(r.xml).toContain('takipTuru="1"');
      expect(r.evidence.officialCodeSemanticMapping).toBe('PARTIALLY_RATIFIED');
    }
  });
});

// ============================================================================
// IG-W — alacakKalemi wrapper (W-01,03,04,05 koşulsuz; W-02 kısıtlı; W-06/07 YOK)
// ============================================================================

describe('IG-W — alacakKalemi wrapper owner-ratified satırlar', () => {
  const baseInput = (over: Partial<Parameters<typeof resolveOfficialAlacakKalemiWrapper>[0]> = {}) => ({
    instrumentType: null,
    proceedingType: null,
    sourceDocumentType: null,
    caseHasJudgmentRecord: false,
    ...over,
  });

  it('IG-W-01: CEK → cek (koşulsuz)', () => {
    const r = resolveOfficialAlacakKalemiWrapper(baseInput({ instrumentType: 'CEK' }));
    expect(r).toEqual({ kind: 'RESOLVED', wrapper: 'cek' });
  });

  it('IG-W-04: POLICE → police (koşulsuz)', () => {
    const r = resolveOfficialAlacakKalemiWrapper(baseInput({ instrumentType: 'POLICE' }));
    expect(r).toEqual({ kind: 'RESOLVED', wrapper: 'police' });
  });

  it('IG-W-02/03: SENET ve BONO → senet (SENET kısıtlı, BONO koşulsuz; ikisi de aynı sarmalayıcı)', () => {
    const viaSenet = resolveOfficialAlacakKalemiWrapper(baseInput({ instrumentType: 'SENET' }));
    const viaBono = resolveOfficialAlacakKalemiWrapper(baseInput({ instrumentType: 'BONO' }));
    expect(viaSenet).toEqual({ kind: 'RESOLVED', wrapper: 'senet' });
    expect(viaBono).toEqual({ kind: 'RESOLVED', wrapper: 'senet' });
  });

  it('IG-W-02 semantic invariant KİLİTLENİR: InstrumentType.SENET şema tanımı yalnız bono/senet anlamı taşır', () => {
    // Owner koşulu: "SENET yalnız bono/emre muharrer senet anlamında kullanılıyorsa
    // mapping uygulanır." Bu invariant runtime'da DOĞRULANAMAZ (enum'da tek değer);
    // guard, şemanın bu değeri GENİŞLETMEDİĞİNİ (genel "yazılı borç ikrarı" gibi bir
    // üçüncü anlam eklenmediğini) kilitler — semantik kayma olursa bu test kırılır.
    const schema = code(SCHEMA_PATH);
    expect(schema).toMatch(/SENET\s*\/\/\s*Senet\/Bono/);
    const enumBlock = /enum InstrumentType \{([\s\S]*?)\}/.exec(schema)?.[1] ?? '';
    const values = enumBlock
      .split('\n')
      .map((l) => l.trim().split(/\s|\/\//)[0])
      .filter((v) => v.length > 0);
    // Enum'da genel "yazılı borç ikrarı" gibi üçüncü/dördüncü bir değer YOK —
    // yalnız kambiyo senedine özgü dört değer.
    expect(values.sort()).toEqual(['BONO', 'CEK', 'POLICE', 'SENET']);
  });

  it('IG-W-05: JUDGMENT_ENFORCEMENT + açık ilam ilişkilendirmesi + CaseJudgment kaydı → ilam', () => {
    const r = resolveOfficialAlacakKalemiWrapper(
      baseInput({
        proceedingType: 'JUDGMENT_ENFORCEMENT',
        sourceDocumentType: 'ILAM',
        caseHasJudgmentRecord: true,
      }),
    );
    expect(r).toEqual({ kind: 'RESOLVED', wrapper: 'ilam' });
  });

  it('IG-W-05 koşulu: yalnız proceedingType ten sentetik ilam ÜRETİLMEZ', () => {
    // proceedingType=JUDGMENT_ENFORCEMENT ama CaseJudgment yok VE/VEYA sourceDocumentType
    // ILAM değil → AUTHORITY_REQUIRED, wrapper SEÇİLMEZ.
    const missingJudgment = resolveOfficialAlacakKalemiWrapper(
      baseInput({
        proceedingType: 'JUDGMENT_ENFORCEMENT',
        sourceDocumentType: 'ILAM',
        caseHasJudgmentRecord: false,
      }),
    );
    expect(missingJudgment.kind).toBe('AUTHORITY_REQUIRED');

    const missingLinkage = resolveOfficialAlacakKalemiWrapper(
      baseInput({
        proceedingType: 'JUDGMENT_ENFORCEMENT',
        sourceDocumentType: null,
        caseHasJudgmentRecord: true,
      }),
    );
    expect(missingLinkage.kind).toBe('AUTHORITY_REQUIRED');
  });

  it('IG-W-AMBIGUOUS (§3.1): hem enstrüman hem ilam sinyali → AMBIGUOUS, sarmalayıcı SEÇİLMEZ', () => {
    const r = resolveOfficialAlacakKalemiWrapper(
      baseInput({
        instrumentType: 'CEK',
        sourceDocumentType: 'ILAM',
        proceedingType: 'JUDGMENT_ENFORCEMENT',
        caseHasJudgmentRecord: true,
      }),
    );
    expect(r.kind).toBe('AMBIGUOUS');
    expect((r as any).wrapper).toBeUndefined();
  });

  it('IG-W-06/07: kontrat ve digerAlacak owner tablosuna hiç girmedi → AUTHORITY_REQUIRED', () => {
    const noSignal = resolveOfficialAlacakKalemiWrapper(baseInput());
    expect(noSignal.kind).toBe('AUTHORITY_REQUIRED');

    const nonJudgmentProceeding = resolveOfficialAlacakKalemiWrapper(
      baseInput({ proceedingType: 'GENERAL_EXECUTION' }),
    );
    expect(nonJudgmentProceeding.kind).toBe('AUTHORITY_REQUIRED');
  });

  it('IG-W-EMISSION-BOUNDARY: alacakKalemi ELEMENT emisyonu bu görevde YOK — P02B-R2 reddi korunur', () => {
    const r = serializeUyapExchangeCanonical({
      ...input(),
      alacakKalemleri: [{ id: 'K1', alacakKalemAdi: 'Anapara', alacakKalemTutar: '100' }],
    } as any);
    expect(r.status).toBe('SHAPE_REJECTED');
  });
});

// ============================================================================
// IG-M — mahiyetKodu (M-02 IMPLEMENTED; M-01 MODEL_RESIDUAL)
// ============================================================================

describe('IG-M — mahiyetKodu owner-ratified satırlar', () => {
  it('IG-M-02: NAFAKA + ilamlı + geçerli CaseJudgment.nafakaType → 1045 (RESOLVED)', () => {
    const r = resolveOfficialMahiyetKodu({
      caseSubCategory: 'NAFAKA',
      takipTuru: { proceedingType: 'JUDGMENT_ENFORCEMENT' },
      caseJudgmentNafakaType: 'ISTIRAK',
    });
    expect(r).toEqual({ kind: 'RESOLVED', code: '1045' });
  });

  it('IG-M-02 kosul 3/4: ilamlı ama CaseJudgment.nafakaType YOK → AUTHORITY_REQUIRED, 1045 emit EDİLMEZ', () => {
    const r = resolveOfficialMahiyetKodu({
      caseSubCategory: 'NAFAKA',
      takipTuru: { proceedingType: 'JUDGMENT_ENFORCEMENT' },
      caseJudgmentNafakaType: null,
    });
    expect(r.kind).toBe('AUTHORITY_REQUIRED');
  });

  it('IG-M-02 kosul 2: canonical procedure ilamsız iken 1045 emit EDİLMEZ (M-01 koluna düşer)', () => {
    const r = resolveOfficialMahiyetKodu({
      caseSubCategory: 'NAFAKA',
      takipTuru: { proceedingType: 'GENERAL_EXECUTION' },
      caseJudgmentNafakaType: 'YOKSULLUK',
    });
    expect(r.kind).not.toBe('RESOLVED');
  });

  it('IG-M-02 kosul 5: legacy FATURA=1045 fonksiyonel DEĞER olarak hiçbir dalda okunmaz', () => {
    // "FATURA" kelimesi owner koşulunu AÇIKLAYAN bir yorum cümlesinde geçebilir
    // (ör. "legacy FATURA=1045 authority DEĞİL"); yasak olan onu bir STRING LITERAL
    // (karşılaştırma/anahtar) olarak kullanmaktır.
    const src = code(path.join(OFFICIAL_DIR, 'official-codelist-registry.ts'));
    expect(src).not.toMatch(/['"]FATURA['"]/);
    expect(src).not.toContain('UYAP_MAHIYET_KODLARI');
  });

  it('IG-M-01: owner APPROVE etti (9009) ama discriminator YOK → MODEL_RESIDUAL, emit EDİLMEZ', () => {
    const r = resolveOfficialMahiyetKodu({
      caseSubCategory: 'NAFAKA',
      takipTuru: { proceedingType: 'GENERAL_EXECUTION' },
      caseJudgmentNafakaType: null,
    });
    expect(r.kind).toBe('MODEL_RESIDUAL');
    if (r.kind === 'MODEL_RESIDUAL') {
      expect(r.reason).toContain('9009');
      expect(r.reason.toLowerCase()).toContain('tahmin');
    }
  });

  it('IG-M-01 MODEL_RESIDUAL serializer üzerinden de fail-closed: kısmi XML/byte YOK', () => {
    const residual = resolveOfficialMahiyetKodu({
      caseSubCategory: 'NAFAKA',
      takipTuru: { proceedingType: 'CAMBIO' },
      caseJudgmentNafakaType: null,
    });
    expect(residual.kind).toBe('MODEL_RESIDUAL');

    const r = serializeUyapExchangeCanonical(
      input({
        takipTuruResolution: { kind: 'RESOLVED', code: '1' },
        mahiyetResolution: residual,
      }),
    );
    expect(r.status).toBe('CODELIST_REJECTED');
    if (r.status === 'CODELIST_REJECTED') {
      expect(r.failureCode).toBe('OFFICIAL_MAHIYET_MODEL_RESIDUAL');
    }
    expect(r as any).not.toHaveProperty('xml');
    expect(r as any).not.toHaveProperty('bytes');
  });

  it('IG-M-EMIT: M-02 canonical serializer üzerinden gerçekten emit edilir', () => {
    const r = serializeUyapExchangeCanonical(
      input({
        takipTuruResolution: { kind: 'RESOLVED', code: '0' },
        mahiyetResolution: resolveOfficialMahiyetKodu({
          caseSubCategory: 'NAFAKA',
          takipTuru: { proceedingType: 'JUDGMENT_ENFORCEMENT' },
          caseJudgmentNafakaType: 'TEDBIR',
        }),
      }),
    );
    expect(r.status).toBe('CANONICAL_BYTES');
    if (r.status === 'CANONICAL_BYTES') {
      expect(r.xml).toContain('mahiyetKodu="1045"');
      expect(r.xml).toContain('takipTuru="0"');
    }
  });
});

// ============================================================================
// IG-XA — ARCHITECTURE GUARDS
// ============================================================================

describe('IG-XA — mimari guard lar', () => {
  it('IG-XA-01: takipTuru/mahiyetKodu/wrapper çözümleyicilerinin TEK sahibi var', () => {
    const registryPath = path.join(OFFICIAL_DIR, 'official-codelist-registry.ts');
    for (const fnName of [
      'export function resolveOfficialTakipTuru',
      'export function resolveOfficialMahiyetKodu',
      'export function resolveOfficialAlacakKalemiWrapper',
    ]) {
      expect(code(registryPath)).toContain(fnName);
    }
  });

  it('IG-XA-02: legacy sayısal kod tablosu hiçbir çözümleyiciye DOĞRUDAN import EDİLMEZ', () => {
    const src = code(path.join(OFFICIAL_DIR, 'official-codelist-registry.ts'));
    expect(src).not.toContain('UYAP_ROL_TURLERI');
    expect(src).not.toContain('UYAP_MAHIYET_KODLARI');
    // Dosya adı bir YORUMDA (tarihsel bağlam) geçebilir; yasak olan bir IMPORT
    // ifadesidir.
    expect(src).not.toMatch(/from\s+['"][^'"]*uyap-xml\.service['"]/);
  });

  it('IG-XA-03: çağıran-kontrollü resmî kod/wrapper hâlâ mümkün DEĞİL (tip seviyesi)', () => {
    const types = code(path.join(OFFICIAL_DIR, 'official-exchange.types.ts'));
    expect(types).not.toMatch(/^\s*mahiyetKodu\??:\s*string/m);
    expect(types).not.toMatch(/^\s*takipTuru\??:\s*string/m);
  });

  it('IG-XA-04: 5045 bu implementasyonda KULLANILMADI', () => {
    const src = code(path.join(OFFICIAL_DIR, 'official-codelist-registry.ts'));
    // 5045 yalnız provenance/DTD-karşılaştırma yorumlarında geçebilir; RESOLVED
    // dönen hiçbir dalda literal olarak YOKTUR (M-02 yalnız 1045 döner).
    expect(src).not.toMatch(/code:\s*'5045'/);
  });

  it('IG-XA-05: hiçbir çözümleyici NestJS/Prisma runtime çağrısı yapmaz (saf fonksiyon)', () => {
    const src = code(path.join(OFFICIAL_DIR, 'official-codelist-registry.ts'));
    expect(src).not.toMatch(/@Injectable\(|PrismaService|prisma\./);
    expect(src).not.toMatch(/fetch\(|axios|node-fetch/);
  });

  it('IG-XA-06: strict DTD uyum iddiası hâlâ ÜRETİLMEZ', () => {
    const r = serializeUyapExchangeCanonical(
      input({
        takipTuruResolution: resolveOfficialTakipTuru({ proceedingType: 'GENERAL_EXECUTION' }),
      }),
    );
    if (r.status === 'CANONICAL_BYTES') {
      expect(r.evidence.officialDtdValidated).toBe(false);
    }
    for (const f of [path.join(OFFICIAL_DIR, 'official-codelist-registry.ts')]) {
      const src = code(f);
      for (const w of ['UYAP_READY', 'SUBMITTABLE', 'OFFICIAL_ACCEPTED', 'VALIDATED_BYTES']) {
        expect(src).not.toContain(w);
      }
    }
  });

  it('IG-XA-07: legacy canlı serializer DEĞİŞMEDİ, resmî hatta hiç referans vermiyor', () => {
    const legacy = code(path.join(API_ROOT, 'src/modules/uyap/uyap-xml.service.ts'));
    expect(legacy).not.toContain('official/');
    expect(legacy).not.toContain('resolveOfficialAlacakKalemiWrapper');
    expect(legacy).not.toContain('resolveOfficialTakipTuru');
    expect(legacy).not.toContain('resolveOfficialMahiyetKodu');
  });
});
