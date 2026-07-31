/**
 * UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01 — ES-01…ES-10
 *
 * Owner-ratified W-01…W-05 sarmalayıcıları altında fail-closed `alacakKalemi`
 * emisyonu. Kapsam sınırları: sarmalayıcı TAHMİN EDİLMEZ; çözümsüz kalem P02B-R2
 * reddine düşer; `faiz` çocuğu bu iterasyonda BİLİNÇLİ kapsam dışı (attribute
 * adları resmî DTD'den ölçülmeden emit edilmez → fail-closed); sarmalayıcı
 * attribute'ları emit edilmez (enstrüman verisi girdide yok — uydurulmaz;
 * resmî ATTLIST'lerin tamamı #IMPLIED ölçüldü, çıplak sarmalayıcı şekil-geçerli).
 * Strict DTD PASS iddiası YOK (D1). kontrat/digerAlacak (W-06/W-07) emit edilemez.
 */
import { DebtorRole } from '@prisma/client';
import { resolveOfficialAlacakKalemiWrapper } from '../official-codelist-registry';
import { serializeUyapExchangeCanonical } from '../official-canonical-serializer';
import { serializeOfficialExchange } from '../official-exchange-builder';
import { resolveOfficialRole } from '../official-role-translator';
import type {
  OfficialAlacakKalemi,
  OfficialExchangeInput,
} from '../official-exchange.types';

const kalem = (over: Partial<OfficialAlacakKalemi> = {}): OfficialAlacakKalemi => ({
  id: 'K1',
  alacakKalemAdi: 'Anapara',
  alacakKalemTutar: '1000',
  wrapperResolution: resolveOfficialAlacakKalemiWrapper({
    instrumentType: 'CEK',
    proceedingType: null,
    sourceDocumentType: null,
    caseHasJudgmentRecord: false,
  }),
  ...over,
});

const input = (kalemler?: OfficialAlacakKalemi[]): OfficialExchangeInput => ({
  dosya: { dosyaTipi: '1', takipTuruResolution: { kind: 'RESOLVED', code: '1' } },
  taraflar: [
    {
      id: 'T1',
      roleResolution: resolveOfficialRole(DebtorRole.ASIL_BORCLU),
      kisi: { adi: 'Ahmet', soyadi: 'Yilmaz' },
    },
  ],
  ...(kalemler ? { alacakKalemleri: kalemler } : {}),
});

describe('ES — alacakKalemi structured emission', () => {
  it.each([
    ['ES-01 cek', 'CEK', 'cek'],
    ['ES-02 senet (SENET)', 'SENET', 'senet'],
    ['ES-02b senet (BONO)', 'BONO', 'senet'],
    ['ES-03 police', 'POLICE', 'police'],
  ] as const)('%s: RESOLVED enstrüman sarmalayıcısı altında emit edilir', (_l, inst, wrapper) => {
    const r = serializeUyapExchangeCanonical(
      input([
        kalem({
          wrapperResolution: resolveOfficialAlacakKalemiWrapper({
            instrumentType: inst,
            proceedingType: null,
            sourceDocumentType: null,
            caseHasJudgmentRecord: false,
          }),
        }),
      ]),
    );
    expect(r.status).toBe('CANONICAL_BYTES');
    if (r.status === 'CANONICAL_BYTES') {
      expect(r.xml).toContain(`<${wrapper}>`);
      expect(r.xml).toMatch(new RegExp(`<${wrapper}>\\s*<alacakKalemi`));
      expect(r.xml).toContain('alacakKalemTutar="1000"');
    }
  });

  it('ES-04: W-05 ilam sarmalayıcısı — üç sinyal birlikte', () => {
    const r = serializeUyapExchangeCanonical(
      input([
        kalem({
          wrapperResolution: resolveOfficialAlacakKalemiWrapper({
            instrumentType: null,
            proceedingType: 'JUDGMENT_ENFORCEMENT',
            sourceDocumentType: 'ILAM',
            caseHasJudgmentRecord: true,
          }),
        }),
      ]),
    );
    expect(r.status).toBe('CANONICAL_BYTES');
    if (r.status === 'CANONICAL_BYTES') {
      expect(r.xml).toMatch(/<ilam>\s*<alacakKalemi/);
    }
  });

  it('ES-05: çözümsüz kalem P02B-R2 fail-closed reddine düşer (sarmalayıcı TAHMİN EDİLMEZ)', () => {
    const r = serializeOfficialExchange(input([kalem({ wrapperResolution: undefined })]));
    expect(r.status).toBe('REJECTED');
    if (r.status === 'REJECTED') {
      expect(r.claimShapeViolations?.[0]?.code).toBe('UNAUTHORIZED_ALACAK_KALEMI_PARENT');
      expect(r.claimShapeViolations?.[0]?.count).toBe(1);
    }
  });

  it('ES-06: AMBIGUOUS/AUTHORITY_REQUIRED çözüm emit edilmez', () => {
    const ambiguous = resolveOfficialAlacakKalemiWrapper({
      instrumentType: 'CEK',
      proceedingType: 'JUDGMENT_ENFORCEMENT',
      sourceDocumentType: 'ILAM',
      caseHasJudgmentRecord: true,
    });
    expect(ambiguous.kind).toBe('AMBIGUOUS');
    const r = serializeOfficialExchange(input([kalem({ wrapperResolution: ambiguous })]));
    expect(r.status).toBe('REJECTED');
  });

  it('ES-07: faiz taşıyan kalem fail-closed (kapsam dışı — attribute adları ölçülmeden emit YOK)', () => {
    const r = serializeOfficialExchange(
      input([kalem({ faiz: { faizTipKod: '1', faizTutar: '10' } })]),
    );
    expect(r.status).toBe('REJECTED');
  });

  it('ES-08: karışık girdi — tek çözümsüz kalem TÜM emisyonu reddeder, kısmi XML YOK', () => {
    const r = serializeUyapExchangeCanonical(
      input([kalem(), kalem({ id: 'K2', wrapperResolution: undefined })]),
    );
    expect(r.status).toBe('SHAPE_REJECTED');
    expect(r as any).not.toHaveProperty('bytes');
  });

  it('ES-09: determinizm + ISO-8859-9 sınırı + çift kalem sırası korunur', () => {
    const two = [kalem(), kalem({ id: 'K2', alacakKalemAdi: 'İkinci', alacakKalemTutar: '250' })];
    const a = serializeUyapExchangeCanonical(input(two));
    const b = serializeUyapExchangeCanonical(input(two));
    expect(a.status).toBe('CANONICAL_BYTES');
    if (a.status === 'CANONICAL_BYTES' && b.status === 'CANONICAL_BYTES') {
      expect(a.bytes.equals(b.bytes)).toBe(true);
      expect(a.xml.indexOf('K1')).toBeLessThan(a.xml.indexOf('K2'));
      expect(a.evidence.roundTripVerified).toBe(true);
      expect(a.evidence.encoding).toBe('ISO-8859-9');
    }
  });

  it('ES-10: strict DTD PASS iddia edilmez; ID integrity korunur; kontrat/digerAlacak emit edilemez', () => {
    const ok = serializeUyapExchangeCanonical(input([kalem()]));
    if (ok.status === 'CANONICAL_BYTES') {
      expect(ok.evidence.officialDtdValidated).toBe(false);
      expect(ok.xml).not.toContain('<kontrat');
      expect(ok.xml).not.toContain('<digerAlacak');
    }
    // Çift id hâlâ P02B-R1 id-integrity reddine düşer (öncelik sırası korunur).
    const dup = serializeOfficialExchange(input([kalem(), kalem()]));
    expect(dup.status).toBe('REJECTED');
    if (dup.status === 'REJECTED') {
      expect(dup.idViolations?.[0]?.issue).toBe('DUPLICATE_ID');
    }
  });
});
