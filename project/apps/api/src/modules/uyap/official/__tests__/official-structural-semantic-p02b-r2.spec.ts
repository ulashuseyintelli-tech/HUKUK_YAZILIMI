/**
 * UYAP-P02B-R2-FOLLOWUP-CANONICALIZATION-R01 — yapısal yerleşim + kodlu-alan ANLAM eşlemesi
 *
 * ⚠ **Kapanış kimliği.** `DBP-P2-UYAP-CONTRACT-A-P02B-R2` **CLOSED / CANONICAL / DO NOT
 * REOPEN**'dur (PR #1436, `0b09ebbd` — claim-wrapper authority guard, owner Option 1).
 * Bu dosya o kapanışın **ardıl teknik remediation**'ıdır (PR #1825, `a0b45f0b`);
 * P02B-R2'nin ikinci kapanışı DEĞİLDİR ve onu yeniden açmaz.
 *
 * ## Ölçülen gerçek (uydurulmadı)
 *
 * Resmî `exchange.dtd` (`124a9a96…`, 9273 B):
 * ```text
 * <!ELEMENT dosya (cek | senet | taraf | VekilKisi | police | kontratKefil | digerAlacak | evrak | ref | ilam)*>
 * <!ATTLIST dosya  takipTuru (0 | 1) "1"   mahiyetKodu (1007 | ... | 4045) #IMPLIED >
 * ```
 * → `alacakKalemi` **`dosya`'nın doğrudan çocuğu DEĞİLDİR**; `takipTuru`
 * **varsayılanlıdır**; `mahiyetKodu` enumerasyonu **17** değer taşır.
 *
 * REPOSITORY LOCAL DTD DERIVATIVE bunun TERSİNİ söyler (`… , alacakKalemi+`). Legacy
 * `uyap-xml.service.ts` yerel türeve göre yazılmıştır. Resmî artefakt authority'dir.
 *
 * ## Kritik anlam çakışması
 *
 * Paylaşılan **17 mahiyetKodu'nun 17'si de** legacy sözlükte FARKLI hukuki anlam taşır
 * (resmî `1045` = Nafaka, legacy `1045` = Fatura Alacağı). Bu yüzden "kod allowed set
 * içinde" kontrolü doğru anlam kanıtı DEĞİLDİR ve hiçbir domain → resmî kod eşlemesi
 * repository kanıtıyla türetilemez.
 *
 * Matris: **XS-01..04 · MS-01..05 · TS-01..05 · CE-01..07 · XA-01..08**
 */
import * as fs from 'fs';
import * as path from 'path';
import { DebtorRole } from '@prisma/client';
import {
  OFFICIAL_ALACAK_KALEMI_PARENTS,
  OFFICIAL_CODELIST_MAHIYET_KODU_SET,
  OFFICIAL_DTD_MAHIYET_KODU_SET,
  OFFICIAL_MAHIYET_KODU_SET,
  OFFICIAL_TAKIP_TURU_SET,
  resolveOfficialMahiyetKodu,
  resolveOfficialTakipTuru,
} from '../official-codelist-registry';
import type { OfficialCodeResolution } from '../official-codelist-registry';
import { serializeUyapExchangeCanonical } from '../official-canonical-serializer';
import { serializeOfficialExchange } from '../official-exchange-builder';
import { prepareUyapDormantDispatch } from '../official-dormant-dispatch';
import { resolveOfficialRole } from '../official-role-translator';
import type { OfficialExchangeInput, OfficialTaraf } from '../official-exchange.types';

const API_ROOT = path.resolve(__dirname, '../../../../..');
const OFFICIAL_DIR = path.join(API_ROOT, 'src/modules/uyap/official');
const rel = (p: string) => path.relative(API_ROOT, p).replace(/\\/g, '/');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = (p: string) => stripComments(fs.readFileSync(p, 'utf8'));

const walk = (dir: string, acc: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(p, acc);
    } else if (e.name.endsWith('.ts') && !e.name.includes('.spec.')) acc.push(p);
  }
  return acc;
};
const OFFICIAL_FILES = walk(OFFICIAL_DIR);

// ---------------------------------------------------------------- fixtures

const resolved = (c: string): OfficialCodeResolution => ({ kind: 'RESOLVED', code: c });
const NOT_ASSERTED: OfficialCodeResolution = { kind: 'NOT_ASSERTED' };

const taraf = (over: Partial<OfficialTaraf> = {}): OfficialTaraf => ({
  id: 'T1',
  roleResolution: resolveOfficialRole(DebtorRole.ASIL_BORCLU),
  kisi: { adi: 'Ahmet', soyadi: 'Yilmaz' },
  ...over,
});

const input = (dosya: Partial<OfficialExchangeInput['dosya']> = {}): OfficialExchangeInput => ({
  dosya: { dosyaTipi: '1', takipTuruResolution: resolved('1'), ...dosya },
  taraflar: [taraf()],
});

// ============================================================================
// XS — alacakKalemi YAPISAL YERLEŞİMİ
// ============================================================================

describe('XS — alacakKalemi yapısal yerleşimi', () => {
  it('XS-01: resmî yetkili ebeveynler DTD den ölçülmüştür; dosya bunlardan biri DEĞİL', () => {
    expect([...OFFICIAL_ALACAK_KALEMI_PARENTS].sort()).toEqual([
      'cek',
      'digerAlacak',
      'ilam',
      'kontrat',
      'police',
      'senet',
    ]);
    expect(OFFICIAL_ALACAK_KALEMI_PARENTS).not.toContain('dosya');
  });

  it('XS-01b: dosya/alacakKalemi doğrudan emisyonu FAIL-CLOSED, yetkili ebeveynler raporlanır', () => {
    const r = serializeOfficialExchange({
      ...input(),
      alacakKalemleri: [{ id: 'K1', alacakKalemAdi: 'Anapara', alacakKalemTutar: '100' }],
    });

    expect(r.status).toBe('REJECTED');
    if (r.status === 'REJECTED') {
      const v = r.claimShapeViolations?.[0];
      expect(v?.code).toBe('UNAUTHORIZED_ALACAK_KALEMI_PARENT');
      expect(v?.path).toBe('dosya/alacakKalemi');
      // Guard hiçbir sarmalayıcıyı SEÇMEZ — yalnız yetkili adayları bildirir.
      expect(v?.authorizedParents).toEqual(OFFICIAL_ALACAK_KALEMI_PARENTS);
    }
  });

  it('XS-02: deterministik çocuk sırası KORUNUR', () => {
    const a = serializeUyapExchangeCanonical(input());
    const b = serializeUyapExchangeCanonical(input());
    expect(a.status).toBe('CANONICAL_BYTES');
    if (a.status === 'CANONICAL_BYTES' && b.status === 'CANONICAL_BYTES') {
      expect(a.xml).toBe(b.xml);
      expect(a.bytes.equals(b.bytes)).toBe(true);
    }
  });

  it('XS-03: legacy yol DEĞİŞMEDİ — yerel türev tabanlı davranış yerinde', () => {
    const legacy = fs.readFileSync(
      path.join(API_ROOT, 'src/modules/uyap/uyap-xml.service.ts'),
      'utf8',
    );
    expect(legacy).toContain('UYAP_MAHIYET_KODLARI');
    expect(legacy).toContain('UYAP_ROL_TURLERI');
    // Legacy hâlâ kendi kod uzayını kullanıyor (cutover YAPILMADI).
    expect(legacy).toMatch(/takipTuru:\s*'1'\s*\|\s*'2'/);
  });

  it('XS-04: yapısal guard strict DTD PASS İDDİA ETMEZ', () => {
    const r = serializeUyapExchangeCanonical(input());
    if (r.status === 'CANONICAL_BYTES') {
      expect(r.evidence.officialDtdValidated).toBe(false);
    }
  });
});

// ============================================================================
// MS — mahiyetKodu ANLAM EŞLEMESİ
// ============================================================================

describe('MS — mahiyetKodu anlam eşlemesi', () => {
  it('MS-01: NAFAKA dışındaki hiçbir CaseSubCategory RESOLVED üretmez', () => {
    // UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-IMPLEMENTATION-I01 ile bu iddia
    // NAFAKA için artık DOĞRU DEĞİL (owner M-01/M-02'yi APPROVE etti — bkz.
    // official-legal-semantic-mapping-implementation.spec.ts IG-*). Bu test
    // konusu (owner-onaysız hiçbir tür RESOLVED üretmez) NAFAKA HARİÇ diğer
    // gerçek `CaseSubCategory` değerleri için geçerliliğini KORUYOR.
    for (const caseSubCategory of ['GENEL', 'DOVIZ', 'KIRA', 'CEZA']) {
      const r = resolveOfficialMahiyetKodu({
        caseSubCategory,
        takipTuru: { proceedingType: null },
        caseJudgmentNafakaType: null,
      });
      expect(r.kind).toBe('AUTHORITY_REQUIRED');
    }
  });

  it('MS-02: legacy kod DEĞERİ hiçbir dalda kanıt olarak okunmaz', () => {
    // Legacy FATURA = '1045'. Resmî 1045 = **Nafaka**. Eski tasarımda risk "legacy
    // domain-type string'ini anahtarlamak"tı; yeni tipli imza bunu DERLEME ZAMANINDA
    // imkânsız kılar (caseSubCategory yalnız gerçek CaseSubCategory değeri alır,
    // 'FATURA' hiç yazılamaz). Kalan risk: resolver kaynağının legacy kod/etiketi
    // OKUMAMASI — kaynak metninde legacy literal aranarak doğrulanır.
    const src = code(path.join(OFFICIAL_DIR, 'official-codelist-registry.ts'));
    expect(src).not.toContain('UYAP_MAHIYET_KODLARI');
    expect(src).not.toContain("'FATURA'");
    expect(src).not.toMatch(/legacyFaturaCode|LEGACY_FATURA/);

    // Owner-onaysız gerçek bir CaseSubCategory (CEZA) hâlâ AUTHORITY_REQUIRED.
    const r = resolveOfficialMahiyetKodu({
      caseSubCategory: 'CEZA',
      takipTuru: { proceedingType: null },
      caseJudgmentNafakaType: null,
    });
    expect(r.kind).toBe('AUTHORITY_REQUIRED');

    const s = serializeUyapExchangeCanonical(input({ mahiyetResolution: r }));
    expect(s.status).toBe('CODELIST_REJECTED');
    if (s.status === 'CODELIST_REJECTED') {
      expect(s.failureCode).toBe('OFFICIAL_MAHIYET_MAPPING_AUTHORITY_REQUIRED');
    }
    // Kod SÖZDİZİMSEL olarak geçerli — tehlike tam da burada.
    expect(OFFICIAL_MAHIYET_KODU_SET.has('1045')).toBe(true);
  });

  it('MS-03: bilinmeyen mahiyetKodu fail-closed', () => {
    const r = serializeUyapExchangeCanonical(input({ mahiyetResolution: resolved('9999') }));
    expect(r.status).toBe('CODELIST_REJECTED');
    if (r.status === 'CODELIST_REJECTED') {
      expect(r.failureCode).toBe('INVALID_OFFICIAL_MAHIYET_KODU');
    }
  });

  it('MS-03b: codelist te olup DTD de OLMAYAN kod (5045) ayrı reason ile reddedilir', () => {
    expect(OFFICIAL_CODELIST_MAHIYET_KODU_SET.has('5045')).toBe(true);
    expect(OFFICIAL_DTD_MAHIYET_KODU_SET.has('5045')).toBe(false);

    const r = serializeUyapExchangeCanonical(input({ mahiyetResolution: resolved('5045') }));
    expect(r.status).toBe('CODELIST_REJECTED');
    if (r.status === 'CODELIST_REJECTED') {
      expect(r.failureCode).toBe('OFFICIAL_MAHIYET_DTD_UNREPRESENTABLE');
    }
  });

  it('MS-04: çağıran resmî kodu ham string olarak GEÇİREMEZ (tip seviyesinde)', () => {
    const types = code(path.join(OFFICIAL_DIR, 'official-exchange.types.ts'));
    // `OfficialDosya` artık ham kod alanı taşımaz.
    expect(types).not.toMatch(/^\s*mahiyetKodu\??:\s*string/m);
    expect(types).not.toMatch(/^\s*takipTuru\??:\s*string/m);
    expect(types).toContain('takipTuruResolution');
    expect(types).toContain('mahiyetResolution');
  });

  it('MS-05: magic default YOK — mahiyet atlanınca attribute HİÇ yazılmaz', () => {
    const r = serializeUyapExchangeCanonical(input());
    expect(r.status).toBe('CANONICAL_BYTES');
    if (r.status === 'CANONICAL_BYTES') {
      expect(r.xml).not.toContain('mahiyetKodu');
    }
  });
});

// ============================================================================
// TS — takipTuru ANLAM EŞLEMESİ
// ============================================================================

describe('TS — takipTuru anlam eşlemesi', () => {
  it('TS-01/TS-02: resmî kod uzayı 0=İlamlı, 1=İlamsız', () => {
    expect([...OFFICIAL_TAKIP_TURU_SET].sort()).toEqual(['0', '1']);
    for (const c of ['0', '1']) {
      expect(serializeUyapExchangeCanonical(input({ takipTuruResolution: resolved(c) })).status)
        .toBe('CANONICAL_BYTES');
    }
  });

  it('TS-03: sayısal eşitlik anlam eşitliği DEĞİL — legacy 2 (İlamlı) reddedilir', () => {
    // Legacy: 2 = İlamlı. Resmî: İlamlı = 0, ve 2 hiç yok. Numeric passthrough olsaydı
    // "İlamlı" niyeti sessizce geçersiz koda dönerdi.
    const r = serializeUyapExchangeCanonical(input({ takipTuruResolution: resolved('2') }));
    expect(r.status).toBe('CODELIST_REJECTED');
    if (r.status === 'CODELIST_REJECTED') {
      expect(r.failureCode).toBe('INVALID_OFFICIAL_TAKIP_TURU');
    }
  });

  it('TS-04: desteklenmeyen legacy takip türleri fail-closed', () => {
    for (const c of ['3', '4', '5', '6']) {
      expect(
        serializeUyapExchangeCanonical(input({ takipTuruResolution: resolved(c) })).status,
      ).toBe('CODELIST_REJECTED');
    }
  });

  it('TS-04b: owner onayı OLMAYAN ProceedingType → AUTHORITY_REQUIRED ve emisyon durur', () => {
    // T-01..T-04 (GENERAL_EXECUTION/CAMBIO/RENT/JUDGMENT_ENFORCEMENT) owner APPROVE
    // etti (bkz. official-legal-semantic-mapping-implementation.spec.ts IG-*). Bu
    // testin konusu KORUNUYOR: onay tablosuna hiç girmeyen bir tür (PLEDGE, T-07)
    // hâlâ AUTHORITY_REQUIRED.
    const r = resolveOfficialTakipTuru({ proceedingType: 'PLEDGE' });
    expect(r.kind).toBe('AUTHORITY_REQUIRED');

    const s = serializeUyapExchangeCanonical(input({ takipTuruResolution: r }));
    expect(s.status).toBe('CODELIST_REJECTED');
    if (s.status === 'CODELIST_REJECTED') {
      expect(s.failureCode).toBe('OFFICIAL_TAKIP_MAPPING_AUTHORITY_REQUIRED');
    }
  });

  it('TS-05: sessiz fallback YOK — ihmal DTD varsayılanını tetikler ve BU AÇIKÇA taşınır', () => {
    // Resmî DTD: takipTuru (0 | 1) "1" → attribute yoksa ayrıştırıcı İlamsız uygular.
    const r = serializeUyapExchangeCanonical(input({ takipTuruResolution: NOT_ASSERTED }));
    expect(r.status).toBe('CANONICAL_BYTES');
    if (r.status === 'CANONICAL_BYTES') {
      expect(r.xml).not.toContain('takipTuru');
      expect(r.evidence.takipTuruDtdDefaultApplies).toBe(true);
    }

    const explicit = serializeUyapExchangeCanonical(input({ takipTuruResolution: resolved('0') }));
    if (explicit.status === 'CANONICAL_BYTES') {
      expect(explicit.evidence.takipTuruDtdDefaultApplies).toBe(false);
    }
  });
});

// ============================================================================
// CE — CANARY-REQUIRED SUBSET
// ============================================================================

describe('CE — Canary-required subset', () => {
  // NOT: aşağıdaki sabit `subset` bu görevin (P02B-R2 follow-up) KAPANIŞ ANINDAKİ
  // durumunu belgeler (tarihsel snapshot). Güncel Canary-required subset ve
  // readiness dağılımı `UYAP-OPERATION-EVIDENCE-CANARY-R02-SCENARIO-CONTRACT-v1.0.md`
  // ve owner-ratified 11 satırın implementasyon durumu
  // `official-legal-semantic-mapping-implementation.spec.ts`'tedir.
  it('CE-01: gerekli alanlar sayılıdır ve her biri disposition taşır', () => {
    const subset = {
      rolTur: 'READY',
      mahiyetKodu: 'AUTHORITY_REQUIRED',
      takipTuru: 'AUTHORITY_REQUIRED',
      alacakKalemi: 'STRUCTURALLY BLOCKED',
      strictDtd: 'D1-ONLY BLOCKED',
    } as const;
    expect(Object.keys(subset).sort()).toEqual([
      'alacakKalemi',
      'mahiyetKodu',
      'rolTur',
      'strictDtd',
      'takipTuru',
    ]);
    // En az bir alan çözülmemiş olduğu sürece Canary ELIGIBLE olamaz.
    expect(Object.values(subset).some((v) => v !== 'READY')).toBe(true);
  });

  it('CE-02: çözülmemiş zorunlu alan byte emisyonunu ENGELLER', () => {
    // KIRA gerçek bir CaseSubCategory'dir ama owner onay tablosuna hiç girmedi.
    const r = serializeUyapExchangeCanonical(
      input({
        mahiyetResolution: resolveOfficialMahiyetKodu({
          caseSubCategory: 'KIRA',
          takipTuru: { proceedingType: null },
          caseJudgmentNafakaType: null,
        }),
      }),
    );
    expect(r.status).toBe('CODELIST_REJECTED');
    expect(r as any).not.toHaveProperty('bytes');
  });

  it('CE-03: kısmi XML veya byte YOK', () => {
    const r = serializeUyapExchangeCanonical(input({ takipTuruResolution: resolved('7') }));
    expect(r.status).toBe('CODELIST_REJECTED');
    expect(r as any).not.toHaveProperty('xml');
    expect(r as any).not.toHaveProperty('bytes');
  });

  it('CE-04/CE-05: ağ sayacı 0, feature flag OFF', () => {
    const d = prepareUyapDormantDispatch(input());
    expect(d.status).toBe('DORMANT_PREPARED');
    if (d.status === 'DORMANT_PREPARED') {
      expect(d.evidence.networkCallCount).toBe(0);
      expect(d.evidence.transportPerformed).toBe(false);
      expect(d.evidence.featureFlagEnabled).toBe(false);
    }
  });

  it('CE-06: mapping hatasında hazırlanmış gönderim kanıtı ÜRETİLMEZ', () => {
    const d = prepareUyapDormantDispatch(
      input({
        mahiyetResolution: resolveOfficialMahiyetKodu({
          caseSubCategory: 'CEZA',
          takipTuru: { proceedingType: null },
          caseJudgmentNafakaType: null,
        }),
      }),
    );
    expect(d.status).toBe('NOT_PREPARED');
    expect(d as any).not.toHaveProperty('bytes');
    expect(d as any).not.toHaveProperty('evidence');
  });

  it('CE-07: strict DTD durumu D1 ile bloklu kalır ve anlam eşlemesi durumu açık raporlanır', () => {
    // NOT_ASSERTED girdi → hiçbir alan owner-ratified değil.
    const authorityRequired = serializeUyapExchangeCanonical(
      input({ takipTuruResolution: NOT_ASSERTED }),
    );
    if (authorityRequired.status === 'CANONICAL_BYTES') {
      expect(authorityRequired.evidence.officialCodeSemanticMapping).toBe('AUTHORITY_REQUIRED');
    }

    // RESOLVED girdi (owner-ratified T-01 üzerinden) → PARTIALLY_RATIFIED
    // (UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-IMPLEMENTATION-I01). Strict DTD hükmü
    // hâlâ ÜRETİLMEZ — bu iki alan BAĞIMSIZDIR.
    const r = serializeUyapExchangeCanonical(input());
    if (r.status === 'CANONICAL_BYTES') {
      expect(r.evidence.officialDtdValidated).toBe(false);
      expect(r.evidence.officialCodelistConformance).toBe('REGISTRY_VALIDATED');
      expect(r.evidence.officialCodeSemanticMapping).toBe('PARTIALLY_RATIFIED');
    }
  });
});

// ============================================================================
// XA — ARCHITECTURE GUARDS
// ============================================================================

describe('XA — architecture guards', () => {
  it('XA-01/XA-02: mahiyet ve takip anlam eşlemesinin TEK sahibi var', () => {
    const mahiyetOwners = OFFICIAL_FILES.filter((f) =>
      /export function resolveOfficialMahiyetKodu/.test(code(f)),
    ).map(rel);
    const takipOwners = OFFICIAL_FILES.filter((f) =>
      /export function resolveOfficialTakipTuru/.test(code(f)),
    ).map(rel);

    const registry = 'src/modules/uyap/official/official-codelist-registry.ts';
    expect(mahiyetOwners).toEqual([registry]);
    expect(takipOwners).toEqual([registry]);
  });

  it('XA-03: legacy sayısal kod resmî serializer a DOĞRUDAN giremez', () => {
    for (const f of OFFICIAL_FILES) {
      const c = code(f);
      expect(c).not.toContain('UYAP_MAHIYET_KODLARI');
      expect(c).not.toContain('UYAP_ROL_TURLERI');
      expect(c).not.toContain('uyap-xml.service');
    }
  });

  it('XA-04: çağıran-kontrollü resmî kod alanı YOK', () => {
    const types = code(path.join(OFFICIAL_DIR, 'official-exchange.types.ts'));
    expect(types).not.toMatch(/^\s*mahiyetKodu\??:\s*string/m);
    expect(types).not.toMatch(/^\s*takipTuru\??:\s*string/m);
  });

  it('XA-05: alacakKalemi ebeveyn listesinin TEK sahibi registry', () => {
    const owners = OFFICIAL_FILES.filter((f) =>
      /export const OFFICIAL_ALACAK_KALEMI_PARENTS/.test(code(f)),
    ).map(rel);
    expect(owners).toEqual(['src/modules/uyap/official/official-codelist-registry.ts']);
  });

  it('XA-06: canlı legacy serializer lar DEĞİŞMEDİ', () => {
    const legacy = fs.readFileSync(
      path.join(API_ROOT, 'src/modules/uyap/uyap-xml.service.ts'),
      'utf8',
    );
    expect(legacy).not.toContain('official/');
    expect(legacy).not.toContain('serializeUyapExchangeCanonical');
    expect(legacy).not.toContain('OFFICIAL_ALACAK_KALEMI_PARENTS');
  });

  it('XA-07: strict DTD uyum iddiası ÜRETİLMEZ', () => {
    for (const f of OFFICIAL_FILES) {
      const c = code(f);
      for (const w of ['UYAP_READY', 'SUBMITTABLE', 'OFFICIAL_ACCEPTED', 'VALIDATED_BYTES']) {
        expect(c).not.toContain(w);
      }
    }
  });

  it('XA-08: ağ çağrısı veya production adapter YOK', () => {
    for (const f of OFFICIAL_FILES) {
      const c = code(f);
      expect(c).not.toMatch(/axios|node-fetch|https?\.request|fetch\(/);
      expect(c).not.toMatch(/@nestjs\/common|Injectable\(/);
    }
  });
});
