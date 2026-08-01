/**
 * UYAP-OFFICIAL-NAFAKA-LEGAL-BASIS-DISCRIMINATOR-I01 — model-evidence guard'ları
 *
 * ## Hüküm: PARTIAL MODEL / IMPLEMENTATION NOT ELIGIBLE
 *
 * Asıl soru: *"Repository'de ilamsız nafaka alacağını, yalnız kategori adından
 * bağımsız biçimde kanıtlayan canonical ve production-reachable domain discriminator
 * var mı?"* — Cevap: **HAYIR**, üç ölçülmüş yapısal gerçek nedeniyle:
 *
 * 1. **Kanonik alacak modeli nafakayı bilinçli dışlar.** ClaimItem = kanonik alacak
 *    modeli (legal-kernel B, 2026-06-13); tbk100-legal-decisions-ledger R1/R2 gereği
 *    `DueType.NAFAKA → null` ("alacak muhasebesi otoritesi değil, yalnız Due taksit
 *    takvimi") ve `ClaimItemType`'ta NAFAKA değeri YOK. M-01'in bağlanabileceği
 *    claim-level nafaka varlığı yoktur.
 * 2. **`Due.type=NAFAKA` bağımsız kanıt değildir.** Yazarları ya caller-supplied
 *    DTO'dur ya da scheduler'ın `subCategory='NAFAKA'` filtresinden türetilmiştir —
 *    owner'ın tek başına yetersiz saydığı kategori adına DAİRESEL geri dönüş — ve
 *    serbest-metin `description` eşleşmesi kullanır.
 * 3. **`CaseJudgment` ilamlı için deklare edilmiştir** (schema yorumu "İlamlı
 *    takipler için"); ilamsız kolda kullanmak modelin beyan edilmiş kapsamını aşar.
 *
 * Runtime implementasyonu bu yüzden YAPILMADI (owner talimatı: model yetersizse
 * tahmin/schema değişikliği yok). Bu dosya, bu hükmün dayandığı model kanıtlarını
 * DETERMİNİSTİK olarak kilitler: kanıtlardan biri değişirse (ör. ClaimItemType'a
 * NAFAKA eklenirse) ilgili guard kırılır ve M-01 yeniden değerlendirme görevi
 * tetiklenir.
 *
 * Matris: **NB-01 … NB-12**
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  resolveOfficialMahiyetKodu,
  resolveOfficialTakipTuru,
} from '../official-codelist-registry';
import { serializeUyapExchangeCanonical } from '../official-canonical-serializer';
import { prepareUyapDormantDispatch } from '../official-dormant-dispatch';
import { resolveOfficialRole } from '../official-role-translator';
import { DebtorRole } from '@prisma/client';
import type { OfficialExchangeInput } from '../official-exchange.types';

const API_ROOT = path.resolve(__dirname, '../../../../..');
const OFFICIAL_DIR = path.join(API_ROOT, 'src/modules/uyap/official');
const SCHEMA_PATH = path.join(API_ROOT, 'prisma/schema.prisma');
const read = (p: string) => fs.readFileSync(p, 'utf8');

const schema = read(SCHEMA_PATH);
const registrySrc = read(path.join(OFFICIAL_DIR, 'official-codelist-registry.ts'));
const dueMapperSrc = read(
  path.join(API_ROOT, 'src/modules/case/due-to-claim-item.mapper.ts'),
);
const schedulerSrc = read(path.join(API_ROOT, 'src/modules/scheduler/scheduler.service.ts'));

const input = (
  dosya: Partial<OfficialExchangeInput['dosya']> = {},
): OfficialExchangeInput => ({
  dosya: { dosyaTipi: '1', takipTuruResolution: { kind: 'NOT_ASSERTED' }, ...dosya },
  taraflar: [
    {
      id: 'T1',
      roleResolution: resolveOfficialRole(DebtorRole.ASIL_BORCLU),
      kisi: { adi: 'Ahmet', soyadi: 'Yilmaz' },
    },
  ],
});

describe('NB — nafaka legal-basis model-evidence guard ları', () => {
  it('NB-01: CaseSubCategory.NAFAKA tek başına authority DEĞİL — ilamsız kol MODEL_RESIDUAL', () => {
    const r = resolveOfficialMahiyetKodu({
      caseSubCategory: 'NAFAKA',
      takipTuru: { proceedingType: 'GENERAL_EXECUTION' },
      caseJudgmentNafakaType: null,
    });
    expect(r.kind).toBe('MODEL_RESIDUAL');
    if (r.kind === 'MODEL_RESIDUAL') {
      // Residual artık belirsizlik değil, EXACT yapısal blocker taşır.
      expect(r.reason).toContain('tbk100');
      expect(r.reason).toContain('DueType.NAFAKA -> null');
      expect(r.reason.toLowerCase()).toContain('dairesel');
    }
  });

  it('NB-02: Due.type tek başına ilgisiz ClaimItem ları sınıflandıramaz — kanıt: NAFAKA→null mapping', () => {
    // tbk100 ledger R1/R2 kararının kod karşılığı: DueType.NAFAKA hiçbir ClaimItem
    // üretmez. Bu satır değişirse (NAFAKA bir ClaimItemType'a bağlanırsa) M-01
    // yeniden değerlendirme gerektirir — guard bilinçli olarak buna kırılır.
    expect(dueMapperSrc).toMatch(/\[DueType\.NAFAKA\]:\s*null/);
    expect(dueMapperSrc).toContain('tbk100-legal-decisions-ledger');
    // Scheduler'ın otomatik Due.type=NAFAKA yazarı kategori adından türetilir
    // (dairesel) — bağımsız kanıt olamayacağının kod kanıtı.
    expect(schedulerSrc).toMatch(/subCategory:\s*'NAFAKA'/);
  });

  it('NB-03: M-01 canonical claim-level ilişki gerektirir — kanıt: ClaimItemType ta NAFAKA YOK', () => {
    const enumBlock = /enum ClaimItemType \{([\s\S]*?)\}/.exec(schema)?.[1] ?? '';
    expect(enumBlock.length).toBeGreaterThan(0);
    expect(enumBlock).not.toMatch(/\bNAFAKA\b/);
  });

  it('NB-04: M-01 yalnız resmî takipTuru=1 kolunda değerlendirilir', () => {
    // İlamlı kol (takipTuru=0) M-01'e DÜŞMEZ — M-02 veya AUTHORITY_REQUIRED üretir.
    const ilamli = resolveOfficialMahiyetKodu({
      caseSubCategory: 'NAFAKA',
      takipTuru: { proceedingType: 'JUDGMENT_ENFORCEMENT' },
      caseJudgmentNafakaType: null,
    });
    expect(ilamli.kind).toBe('AUTHORITY_REQUIRED');

    // Çözülmemiş takipTuru → mahiyet de çözülmez (MODEL_RESIDUAL bile değil).
    const unresolved = resolveOfficialMahiyetKodu({
      caseSubCategory: 'NAFAKA',
      takipTuru: { proceedingType: null },
      caseJudgmentNafakaType: null,
    });
    expect(unresolved.kind).toBe('AUTHORITY_REQUIRED');
  });

  it('NB-05: caller-supplied 9009 resolver dan ASLA çıkmaz', () => {
    // Registry çözümleyicisi hiçbir dalda 9009 döndürmez (kaynak kanıtı) —
    // 9009 yalnız yorum/residual metninde geçebilir, RESOLVED literal olarak geçemez.
    expect(registrySrc).not.toMatch(/code:\s*'9009'/);
  });

  it('NB-06: legacy kod/etiket kullanılmadı', () => {
    expect(registrySrc).not.toContain('UYAP_MAHIYET_KODLARI');
    expect(registrySrc).not.toContain('UYAP_ROL_TURLERI');
    expect(registrySrc).not.toMatch(/['"]FATURA['"]/);
    // Tenant-mutable lookup tabloları da authority değildir (caller-controlled uyapCode).
    expect(registrySrc).not.toContain('LookupMahiyetTipi');
    expect(registrySrc).not.toContain('LookupTakipTuru');
  });

  it('NB-07: belirsiz hukuki dayanak fail-closed — kısmi XML/byte YOK', () => {
    const residual = resolveOfficialMahiyetKodu({
      caseSubCategory: 'NAFAKA',
      takipTuru: { proceedingType: 'CAMBIO' },
      caseJudgmentNafakaType: null,
    });
    expect(residual.kind).toBe('MODEL_RESIDUAL');

    const r = serializeUyapExchangeCanonical(
      input({
        takipTuruResolution: resolveOfficialTakipTuru({ proceedingType: 'CAMBIO' }),
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

  it('NB-08: schema/migration EKLENMEDİ — nafaka legal-basis modeli hâlâ yok', () => {
    // Bu görev model EKLEMEDİ: schema'da nafaka hukuki-dayanak modeli/ilişkisi yok.
    expect(schema).not.toMatch(/model\s+NafakaLegalBasis/);
    expect(schema).not.toMatch(/nafakaLegalBasis/);
    // ClaimItem'a nafaka alanı da eklenmedi.
    const claimItemBlock = /model ClaimItem \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';
    expect(claimItemBlock.length).toBeGreaterThan(0);
    expect(claimItemBlock).not.toMatch(/nafaka/i);
  });

  it('NB-09: M-02 (1045) davranışı DEĞİŞMEDİ', () => {
    const r = resolveOfficialMahiyetKodu({
      caseSubCategory: 'NAFAKA',
      takipTuru: { proceedingType: 'JUDGMENT_ENFORCEMENT' },
      caseJudgmentNafakaType: 'ISTIRAK',
    });
    expect(r).toEqual({ kind: 'RESOLVED', code: '1045' });

    const emitted = serializeUyapExchangeCanonical(
      input({
        takipTuruResolution: resolveOfficialTakipTuru({
          proceedingType: 'JUDGMENT_ENFORCEMENT',
        }),
        mahiyetResolution: r,
      }),
    );
    expect(emitted.status).toBe('CANONICAL_BYTES');
    if (emitted.status === 'CANONICAL_BYTES') {
      expect(emitted.xml).toContain('mahiyetKodu="1045"');
    }
  });

  it('NB-10: 5045 dışlanmış kalır', () => {
    expect(registrySrc).not.toMatch(/code:\s*'5045'/);
    const r = serializeUyapExchangeCanonical(
      input({ mahiyetResolution: { kind: 'RESOLVED', code: '5045' } }),
    );
    expect(r.status).toBe('CODELIST_REJECTED');
    if (r.status === 'CODELIST_REJECTED') {
      expect(r.failureCode).toBe('OFFICIAL_MAHIYET_MAPPING_AUTHORITY_REQUIRED');
    }
  });

  it('NB-11: runtime transport wiring YOK — dormant dispatch değişmezleri', () => {
    const d = prepareUyapDormantDispatch(input());
    expect(d.status).toBe('DORMANT_PREPARED');
    if (d.status === 'DORMANT_PREPARED') {
      expect(d.evidence.networkCallCount).toBe(0);
      expect(d.evidence.transportPerformed).toBe(false);
      expect(d.evidence.featureFlagEnabled).toBe(false);
    }
  });

  it('NB-12: strict DTD iddiası YOK', () => {
    const r = serializeUyapExchangeCanonical(input());
    if (r.status === 'CANONICAL_BYTES') {
      expect(r.evidence.officialDtdValidated).toBe(false);
    }
    for (const w of ['UYAP_READY', 'SUBMITTABLE', 'OFFICIAL_ACCEPTED', 'VALIDATED_BYTES']) {
      expect(registrySrc).not.toContain(w);
    }
  });
});
