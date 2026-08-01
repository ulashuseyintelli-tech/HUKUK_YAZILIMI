import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DebtorRole } from '@prisma/client';

import { serializeOfficialExchange } from '../official-exchange-builder';
import { resolveOfficialRole } from '../official-role-translator';
import type { OfficialExchangeInput, OfficialTaraf } from '../official-exchange.types';
import type { OfficialRoleResolution } from '../official-role-translation.types';

/**
 * DBP-P2-UYAP-CONTRACT-A-P02B — Official Contract A serializer (SKELETON) testleri.
 *
 * (a) contract-derived XML şekli (rolTur ELEMENT, attribute-carrier kişi/kurum/adres, exchangeHeader v1.2,
 * DOCTYPE); (b) deterministik serializasyon; (c) unresolved-role rejection (gerçek P02A translator ile);
 * (d) encoding YALNIZ etiket (byteEncodingPerformed=false, EMITTED yok); (e) runtime-wiring / domain→rolID
 * mapping / legacy değişiklik YOK.
 */

const OFFICIAL_DIR = resolve(__dirname, '..');
const UYAP_DIR = resolve(__dirname, '..', '..');
const readOfficial = (f: string): string => readFileSync(resolve(OFFICIAL_DIR, f), 'utf8');
const readUyap = (f: string): string => readFileSync(resolve(UYAP_DIR, f), 'utf8');

/**
 * TEST-ONLY sentetik RESOLVED resolution. Domain `DebtorRole` ile İLİŞKİLENDİRİLMEMİŞTİR ve resmî
 * 21-71 değeri DEĞİLDİR; yalnız serializer şeklini (rolID/Rol pass-through) test eder. P02B hiçbir
 * kanonik eşleme kurmaz.
 */
const SYNTHETIC_RESOLVED: OfficialRoleResolution = {
  kind: 'RESOLVED',
  rolID: 'X-TEST-ROLID',
  rol: 'X-TEST-ROL',
};

function resolvedTaraf(over: Partial<OfficialTaraf> = {}): OfficialTaraf {
  return {
    id: 'T1',
    roleResolution: SYNTHETIC_RESOLVED,
    kisi: { adi: 'AD', soyadi: 'SOYAD' },
    ...over,
  };
}

function baseInput(taraflar: OfficialTaraf[]): OfficialExchangeInput {
  return {
    dosya: {
      dosyaTipi: '1',
      takipTuruResolution: { kind: 'RESOLVED', code: '1' },
      mahiyetResolution: { kind: 'RESOLVED', code: '1007' },
    },
    taraflar,
  };
}

describe('P02B — SERIALIZED_DRAFT + contract-derived official XML şekli', () => {
  it('RESOLVED taraf → SERIALIZED_DRAFT; official şekil öğeleri mevcut', () => {
    const r = serializeOfficialExchange(baseInput([resolvedTaraf()]));
    expect(r.status).toBe('SERIALIZED_DRAFT');
    if (r.status !== 'SERIALIZED_DRAFT') throw new Error('beklenen SERIALIZED_DRAFT');

    // DOCTYPE + encoding etiketi
    expect(r.xml).toContain('<!DOCTYPE exchangeData SYSTEM "exchange.dtd">');
    expect(r.xml).toContain('encoding="ISO-8859-9"');
    // exchangeHeader versiyon 1.2
    expect(r.xml).toMatch(/<exchangeHeader\s+versiyon="1\.2"\s*\/>/);
    // rolTur ELEMENT (taraf attribute'u DEĞİL) + rolID/Rol
    expect(r.xml).toMatch(/<rolTur\s+rolID="X-TEST-ROLID"\s+Rol="X-TEST-ROL"\s*\/>/);
    expect(r.xml).not.toMatch(/<taraf[^>]*rolTur=/); // legacy attribute biçimi OLMAMALI
    // taraf id ID
    expect(r.xml).toMatch(/<taraf\s+id="T1"/);
    // kisiTumBilgileri EMPTY attribute-carrier (child text element DEĞİL)
    expect(r.xml).toMatch(/<kisiTumBilgileri\s+adi="AD"\s+soyadi="SOYAD"\s*\/>/);
    expect(r.xml).not.toContain('<adi>'); // legacy child-text biçimi OLMAMALI
  });

  it('sonuç bayrakları: xmlDeclarationEncoding=ISO-8859-9, byteEncodingPerformed=false, officialDtdValidated=false', () => {
    const r = serializeOfficialExchange(baseInput([resolvedTaraf()]));
    if (r.status !== 'SERIALIZED_DRAFT') throw new Error('beklenen SERIALIZED_DRAFT');
    expect(r.xmlDeclarationEncoding).toBe('ISO-8859-9');
    expect(r.byteEncodingPerformed).toBe(false);
    expect(r.officialDtdValidated).toBe(false);
  });

  it('kurum varyantı → <kurum kurumAdi=...> attribute-carrier', () => {
    const r = serializeOfficialExchange(
      baseInput([resolvedTaraf({ kisi: undefined, kurum: { kurumAdi: 'ACME A.S.', vergiNo: '123' } })]),
    );
    if (r.status !== 'SERIALIZED_DRAFT') throw new Error('beklenen SERIALIZED_DRAFT');
    expect(r.xml).toMatch(/<kurum\s+kurumAdi="ACME A\.S\."\s+vergiNo="123"\s*\/>/);
  });

  // NOT (P02B-R2, owner-ratified fail-closed karar): eski "alacakKalemi + faiz → attribute modeli"
  // testi BURADAN KALDIRILMIŞTIR. Eski test yazıldığı an DÜRÜSTTÜ (yalnız string-shape kanıtlıyordu,
  // hiçbir DTD-conformance iddiası taşımıyordu — bkz. GO-ANALYZE raporu §8). Kaldırma nedeni test'in
  // yanlış olması DEĞİL, owner'ın YENİ fail-closed davranışı ratifiye etmesidir: `alacakKalemleri`
  // artık dogrudan emisyon yerine REJECTED üretir (bkz. aşağıdaki 'P02B-R2' describe blokları).
});

describe('P02B — UNRESOLVED-ROLE REJECTION (gerçek P02A translator çıktısıyla)', () => {
  it('UNRESOLVED_AUTHORITY_REQUIRED taraf (MIRASCI, LDO_OWNER) → REJECTED, XML yok', () => {
    // P03A sonrası ASIL_BORCLU RESOLVED oldu; hâlâ unresolved olan LDO_OWNER rolü MIRASCI kullanılır.
    const taraf = resolvedTaraf({ roleResolution: resolveOfficialRole(DebtorRole.MIRASCI) });
    const r = serializeOfficialExchange(baseInput([taraf]));
    expect(r.status).toBe('REJECTED');
    if (r.status !== 'REJECTED') throw new Error('beklenen REJECTED');
    expect(r.unresolved).toEqual([{ tarafId: 'T1', kind: 'UNRESOLVED_AUTHORITY_REQUIRED' }]);
    expect((r as { xml?: string }).xml).toBeUndefined();
  });

  it('UNSUPPORTED_FOR_ROLTUR taraf (KESIDECI) → REJECTED', () => {
    const taraf = resolvedTaraf({ id: 'T9', roleResolution: resolveOfficialRole(DebtorRole.KESIDECI) });
    const r = serializeOfficialExchange(baseInput([taraf]));
    expect(r.status).toBe('REJECTED');
    if (r.status !== 'REJECTED') throw new Error('beklenen REJECTED');
    expect(r.unresolved).toEqual([{ tarafId: 'T9', kind: 'UNSUPPORTED_FOR_ROLTUR' }]);
  });

  it('karışık (bir RESOLVED + bir UNRESOLVED) → tümü REJECTED (all-or-nothing)', () => {
    const r = serializeOfficialExchange(
      baseInput([
        resolvedTaraf({ id: 'T1' }),
        resolvedTaraf({ id: 'T2', roleResolution: resolveOfficialRole(DebtorRole.MIRASCI) }),
      ]),
    );
    expect(r.status).toBe('REJECTED');
    if (r.status !== 'REJECTED') throw new Error('beklenen REJECTED');
    expect(r.unresolved).toEqual([{ tarafId: 'T2', kind: 'UNRESOLVED_AUTHORITY_REQUIRED' }]);
  });

  it('boş taraf listesi → REJECTED', () => {
    const r = serializeOfficialExchange(baseInput([]));
    expect(r.status).toBe('REJECTED');
  });
});

describe('P02B — determinizm ve encoding etiketi', () => {
  it('aynı girdi → bit-aynı XML (deterministik; Date/rastgelelik yok)', () => {
    const input = baseInput([resolvedTaraf(), resolvedTaraf({ id: 'T2' })]);
    const a = serializeOfficialExchange(input);
    const b = serializeOfficialExchange(input);
    if (a.status !== 'SERIALIZED_DRAFT' || b.status !== 'SERIALIZED_DRAFT') {
      throw new Error('beklenen SERIALIZED_DRAFT');
    }
    expect(a.xml).toBe(b.xml);
  });

  it('sonuç EMITTED statüsü ÜRETMEZ (owner düzeltmesi)', () => {
    const r = serializeOfficialExchange(baseInput([resolvedTaraf()]));
    expect(r.status === 'SERIALIZED_DRAFT' || r.status === 'REJECTED').toBe(true);
    expect(JSON.stringify(r)).not.toContain('EMITTED');
    // gerçek byte encoding iddiası taşınmaz
    expect(JSON.stringify(r)).not.toContain('"byteEncodingPerformed":true');
  });
});

describe('P03A — owner-safe roller serializer entegrasyonu (gerçek translator)', () => {
  it('pure owner-safe resolved (ASIL_BORCLU + ADI_KEFIL) → SERIALIZED_DRAFT + owner-ratified rolTur emisyonu', () => {
    const r = serializeOfficialExchange(
      baseInput([
        resolvedTaraf({ id: 'B1', roleResolution: resolveOfficialRole(DebtorRole.ASIL_BORCLU) }),
        resolvedTaraf({ id: 'K1', roleResolution: resolveOfficialRole(DebtorRole.ADI_KEFIL) }),
      ]),
    );
    expect(r.status).toBe('SERIALIZED_DRAFT');
    if (r.status !== 'SERIALIZED_DRAFT') throw new Error('beklenen SERIALIZED_DRAFT');
    expect(r.xml).toMatch(/<rolTur\s+rolID="22"\s+Rol="BORÇLU\/MÜFLİS"\s*\/>/);
    expect(r.xml).toMatch(/<rolTur\s+rolID="33"\s+Rol="KEFİL"\s*\/>/);
  });

  it('mixed gerçek-resolved (ASIL_BORCLU) + gerçek-unresolved (MIRASCI) → REJECTED (all-or-nothing)', () => {
    const r = serializeOfficialExchange(
      baseInput([
        resolvedTaraf({ id: 'B1', roleResolution: resolveOfficialRole(DebtorRole.ASIL_BORCLU) }),
        resolvedTaraf({ id: 'M1', roleResolution: resolveOfficialRole(DebtorRole.MIRASCI) }),
      ]),
    );
    expect(r.status).toBe('REJECTED');
    if (r.status !== 'REJECTED') throw new Error('beklenen REJECTED');
    expect(r.unresolved).toEqual([{ tarafId: 'M1', kind: 'UNRESOLVED_AUTHORITY_REQUIRED' }]);
  });
});

describe('P02B-R1 — ID ANCHOR INTEGRITY + REF BOUNDARY', () => {
  it('DUPLICATE ID (iki taraf aynı id) → REJECTED (idViolations DUPLICATE_ID)', () => {
    const r = serializeOfficialExchange(
      baseInput([resolvedTaraf({ id: 'DUP' }), resolvedTaraf({ id: 'DUP' })]),
    );
    expect(r.status).toBe('REJECTED');
    if (r.status !== 'REJECTED') throw new Error('beklenen REJECTED');
    expect(r.idViolations).toEqual([{ id: 'DUP', issue: 'DUPLICATE_ID', source: 'taraf' }]);
    expect((r as { xml?: string }).xml).toBeUndefined();
  });

  it('EMPTY ID (taraf id boş) → REJECTED (idViolations EMPTY_ID)', () => {
    const r = serializeOfficialExchange(baseInput([resolvedTaraf({ id: '' })]));
    expect(r.status).toBe('REJECTED');
    if (r.status !== 'REJECTED') throw new Error('beklenen REJECTED');
    expect(r.idViolations).toEqual([{ id: '', issue: 'EMPTY_ID', source: 'taraf' }]);
  });

  it('alacakKalemi id, taraf id ile çakışırsa → REJECTED (belge-genelinde benzersizlik)', () => {
    const input: OfficialExchangeInput = {
      ...baseInput([resolvedTaraf({ id: 'X1' })]),
      alacakKalemleri: [{ id: 'X1', alacakKalemTutar: '10' }],
    };
    const r = serializeOfficialExchange(input);
    expect(r.status).toBe('REJECTED');
    if (r.status !== 'REJECTED') throw new Error('beklenen REJECTED');
    expect(r.idViolations).toEqual([{ id: 'X1', issue: 'DUPLICATE_ID', source: 'alacakKalemi' }]);
  });

  it('geçerli benzersiz + boş-olmayan id → SERIALIZED_DRAFT (kabul)', () => {
    const r = serializeOfficialExchange(
      baseInput([resolvedTaraf({ id: 'A' }), resolvedTaraf({ id: 'B' })]),
    );
    expect(r.status).toBe('SERIALIZED_DRAFT');
  });

  it('REF BOUNDARY: input tipi `ref`/`to` alanı taşımaz (ref-bearing input ifade edilemez)', () => {
    const types = readOfficial('official-exchange.types.ts');
    expect(types).not.toMatch(/\bOfficialRef\b/); // OfficialRef tipi yok
    expect(types).not.toMatch(/^\s*ref\??\s*:/m); // `ref:` alanı yok
    expect(types).not.toMatch(/^\s*to\??\s*:/m); // `to:` (IDREF) alanı yok
  });

  it('REF BOUNDARY: builder `<ref>` üretmez; SERIALIZED_DRAFT çıktısı `<ref` içermez', () => {
    const builder = readOfficial('official-exchange-builder.ts');
    expect(builder).not.toMatch(/\.ele\(\s*['"`]ref['"`]/); // ele('ref') yok
    const r = serializeOfficialExchange(baseInput([resolvedTaraf()]));
    if (r.status !== 'SERIALIZED_DRAFT') throw new Error('beklenen SERIALIZED_DRAFT');
    expect(r.xml).not.toContain('<ref');
  });
});

describe('P02B — izolasyon / no-wiring / no domain→rolID mapping (kaynak-grep)', () => {
  it('builder yalnız en dar bağımlılıkları IMPORT eder (Prisma/NestJS/legacy YOK)', () => {
    const importBlob = readOfficial('official-exchange-builder.ts')
      .split('\n')
      .filter((l) => /^\s*import\b/.test(l))
      .join('\n');
    expect(importBlob).not.toContain('@prisma/client');
    expect(importBlob).not.toContain('PrismaService');
    expect(importBlob).not.toContain('@nestjs');
    expect(importBlob).not.toContain('uyap-xml.service');
    expect(importBlob).not.toContain('UYAP_ROL_TURLERI');
    // İzin verilen tek runtime bağımlılığı: xmlbuilder2.
    expect(importBlob).toContain('xmlbuilder2');
  });

  it('builder kaynağı kanonik rolID (21-71) hedef değeri veya domain→rolID eşlemesi içermez', () => {
    const src = readOfficial('official-exchange-builder.ts');
    expect(src).not.toContain('@Injectable');
    // rolID/Rol yalnız girdideki resolution'dan gelir; kod içinde 'rolID: "2..."' ATAMASI olmamalı.
    expect(src).not.toMatch(/rolID:\s*['"`]\d/);
    // Domain DebtorRole runtime KULLANIMI yok: enum erişimi (DebtorRole.XXX) ve import edilmemeli.
    // (Açıklama yorumunda "domain DebtorRole → rolID YAPILMAZ" biçiminde geçebilir; asıl kısıt kullanım/import.)
    expect(src).not.toMatch(/\bDebtorRole\s*\./);
    expect(src).not.toMatch(/import\b[^\n]*DebtorRole/);
  });

  it('UyapController / UyapModule / UyapXmlService P02B serializer’a referans vermez', () => {
    for (const src of [readUyap('uyap.controller.ts'), readUyap('uyap.module.ts'), readUyap('uyap-xml.service.ts')]) {
      expect(src).not.toContain('official-exchange-builder');
      expect(src).not.toContain('serializeOfficialExchange');
      expect(src).not.toContain('official-exchange.types');
    }
  });

  it('legacy uyap-xml.service.ts hâlâ değişmemiş (P01 F10 sınırı: OfficialExchangeBuilder/rolID yok)', () => {
    const s = readUyap('uyap-xml.service.ts');
    expect(s).not.toContain('OfficialExchangeBuilder');
    expect(s).not.toContain('rolID');
  });

  it('official/ yeni P02B dosyaları schema/migration yüzeyine dokunmaz', () => {
    for (const f of ['official-exchange-builder.ts', 'official-exchange.types.ts']) {
      const src = readOfficial(f);
      expect(src).not.toContain('schema.prisma');
      expect(src).not.toContain('migration');
    }
  });
});

describe('P02B-R2 — CLAIM-WRAPPER AUTHORITY GUARD (fail-closed, owner-ratified)', () => {
  function inputWithClaim(count: 1 | 2 = 1): OfficialExchangeInput {
    const alacakKalemleri =
      count === 1
        ? [{ id: 'AK1', alacakKalemTutar: '1000.00' }]
        : [
            { id: 'AK1', alacakKalemTutar: '10' },
            { id: 'AK2', alacakKalemTutar: '20' },
          ];
    return { ...baseInput([resolvedTaraf()]), alacakKalemleri };
  }

  it('non-empty alacakKalemleri → REJECTED', () => {
    const r = serializeOfficialExchange(inputWithClaim());
    expect(r.status).toBe('REJECTED');
  });

  it('claimShapeViolations tam eşleşme: code/path/count', () => {
    const r = serializeOfficialExchange(inputWithClaim());
    expect(r.status).toBe('REJECTED');
    if (r.status !== 'REJECTED') throw new Error('beklenen REJECTED');
    expect(r.claimShapeViolations).toEqual([
      {
        code: 'UNAUTHORIZED_ALACAK_KALEMI_PARENT',
        path: 'dosya/alacakKalemi',
        count: 1,
        // P02B-R2 (yapısal tur): yetkili ebeveynler artık resmî DTD'den ölçülmüş
        // sabit olarak raporlanır. Guard hiçbirini SEÇMEZ — yalnız bildirir.
        authorizedParents: ['cek', 'digerAlacak', 'ilam', 'kontrat', 'police', 'senet'],
      },
    ]);
  });

  it('rejection sonucunda xml property yok', () => {
    const r = serializeOfficialExchange(inputWithClaim());
    expect((r as { xml?: string }).xml).toBeUndefined();
  });

  it('rejection sonucunda <alacakKalemi> hiçbir yerde yok', () => {
    const r = serializeOfficialExchange(inputWithClaim());
    expect(JSON.stringify(r)).not.toContain('<alacakKalemi');
  });

  it('otomatik <digerAlacak> üretilmez', () => {
    const r = serializeOfficialExchange(inputWithClaim());
    // `<digerAlacak` ELEMENT'i aranır (kardeş `<ilam` testiyle aynı biçim). Çıplak
    // kelime aranamaz: `authorizedParents` raporu yetkili ADAY adlarını taşır —
    // bunlar bildirimdir, emisyon DEĞİL.
    expect(JSON.stringify(r)).not.toContain('<digerAlacak');
  });

  it('otomatik <ilam> üretilmez', () => {
    const r = serializeOfficialExchange(inputWithClaim());
    expect(JSON.stringify(r)).not.toContain('<ilam');
  });

  it('otomatik instrument sarmalayıcı (cek/senet/police/kontrat) üretilmez', () => {
    const r = serializeOfficialExchange(inputWithClaim());
    const json = JSON.stringify(r);
    expect(json).not.toContain('<cek');
    expect(json).not.toContain('<senet');
    expect(json).not.toContain('<police');
    expect(json).not.toContain('<kontrat');
  });

  it('alacakKalemleri undefined → SERIALIZED_DRAFT (taraf-only davranış değişmedi)', () => {
    const r = serializeOfficialExchange(baseInput([resolvedTaraf()]));
    expect(r.status).toBe('SERIALIZED_DRAFT');
  });

  it('alacakKalemleri [] → SERIALIZED_DRAFT (taraf-only davranış değişmedi)', () => {
    const input: OfficialExchangeInput = { ...baseInput([resolvedTaraf()]), alacakKalemleri: [] };
    const r = serializeOfficialExchange(input);
    expect(r.status).toBe('SERIALIZED_DRAFT');
  });

  it('taraf-only owner-safe ASIL_BORCLU + ADI_KEFIL → SERIALIZED_DRAFT, rolID 22/33 korunur', () => {
    const r = serializeOfficialExchange(
      baseInput([
        resolvedTaraf({ id: 'B1', roleResolution: resolveOfficialRole(DebtorRole.ASIL_BORCLU) }),
        resolvedTaraf({ id: 'K1', roleResolution: resolveOfficialRole(DebtorRole.ADI_KEFIL) }),
      ]),
    );
    expect(r.status).toBe('SERIALIZED_DRAFT');
    if (r.status !== 'SERIALIZED_DRAFT') throw new Error('beklenen SERIALIZED_DRAFT');
    expect(r.xml).toMatch(/<rolTur\s+rolID="22"\s+Rol="BORÇLU\/MÜFLİS"\s*\/>/);
    expect(r.xml).toMatch(/<rolTur\s+rolID="33"\s+Rol="KEFİL"\s*\/>/);
  });

  it('unresolved role + claim item → mevcut unresolved-role rejection önceliği korunur', () => {
    const taraf = resolvedTaraf({ roleResolution: resolveOfficialRole(DebtorRole.MIRASCI) });
    const input: OfficialExchangeInput = { ...baseInput([taraf]), alacakKalemleri: [{ id: 'AK1', alacakKalemTutar: '10' }] };
    const r = serializeOfficialExchange(input);
    expect(r.status).toBe('REJECTED');
    if (r.status !== 'REJECTED') throw new Error('beklenen REJECTED');
    expect(r.unresolved).toEqual([{ tarafId: 'T1', kind: 'UNRESOLVED_AUTHORITY_REQUIRED' }]);
    expect(r.claimShapeViolations).toBeUndefined();
  });

  it('boş taraf listesi + claim item → mevcut empty-taraf rejection önceliği korunur', () => {
    const input: OfficialExchangeInput = {
      ...baseInput([]),
      alacakKalemleri: [{ id: 'AK1', alacakKalemTutar: '10' }],
    };
    const r = serializeOfficialExchange(input);
    expect(r.status).toBe('REJECTED');
    if (r.status !== 'REJECTED') throw new Error('beklenen REJECTED');
    expect(r.reason).toBe('En az bir taraf zorunludur.');
    expect(r.claimShapeViolations).toBeUndefined();
  });

  it('geçersiz/çift alacakKalemi ID → mevcut ID-integrity önceliği korunur (claim-wrapper değil)', () => {
    const input: OfficialExchangeInput = {
      ...baseInput([resolvedTaraf({ id: 'X1' })]),
      alacakKalemleri: [{ id: 'X1', alacakKalemTutar: '10' }],
    };
    const r = serializeOfficialExchange(input);
    expect(r.status).toBe('REJECTED');
    if (r.status !== 'REJECTED') throw new Error('beklenen REJECTED');
    expect(r.idViolations).toEqual([{ id: 'X1', issue: 'DUPLICATE_ID', source: 'alacakKalemi' }]);
    expect(r.claimShapeViolations).toBeUndefined();
  });

  it('iki alacak kalemi → violation count = 2', () => {
    const r = serializeOfficialExchange(inputWithClaim(2));
    expect(r.status).toBe('REJECTED');
    if (r.status !== 'REJECTED') throw new Error('beklenen REJECTED');
    expect(r.claimShapeViolations).toEqual([
      {
        code: 'UNAUTHORIZED_ALACAK_KALEMI_PARENT',
        path: 'dosya/alacakKalemi',
        count: 2,
        authorizedParents: ['cek', 'digerAlacak', 'ilam', 'kontrat', 'police', 'senet'],
      },
    ]);
  });

  it('aynı girdi → aynı rejection sonucu (determinizm REJECTED yolunda da geçerli)', () => {
    const input = inputWithClaim();
    const a = serializeOfficialExchange(input);
    const b = serializeOfficialExchange(input);
    expect(a).toEqual(b);
  });

  it('sonuç union yalnız SERIALIZED_DRAFT / REJECTED (yeni statü yok)', () => {
    const withClaim = serializeOfficialExchange(inputWithClaim());
    const withoutClaim = serializeOfficialExchange(baseInput([resolvedTaraf()]));
    expect(['SERIALIZED_DRAFT', 'REJECTED']).toContain(withClaim.status);
    expect(['SERIALIZED_DRAFT', 'REJECTED']).toContain(withoutClaim.status);
  });

  it('officialDtdValidated=true hiçbir yerde üretilmez', () => {
    expect(JSON.stringify(serializeOfficialExchange(inputWithClaim()))).not.toContain('"officialDtdValidated":true');
    expect(JSON.stringify(serializeOfficialExchange(baseInput([resolvedTaraf()])))).not.toContain(
      '"officialDtdValidated":true',
    );
  });
});

describe('P02B-R2 — static containment (kaynak-grep; runtime wiring / schema / migration YOK)', () => {
  it('addOfficialAlacakKalemi(dosya çağrısı kaynakta yok (fonksiyon tamamen kaldırıldı)', () => {
    const src = readOfficial('official-exchange-builder.ts');
    expect(src).not.toContain('addOfficialAlacakKalemi');
  });

  it('doğrudan dosya/alacakKalemi emisyonu yok; yalnız opaque-qualified wrapper child yolu var', () => {
    const src = readOfficial('official-exchange-builder.ts');
    expect(src).not.toMatch(/\bdosya\.ele\(\s*['"`]alacakKalemi['"`]/);
    expect(src).toContain('issuedM01Claims.has(qualified)');
    expect(src).toMatch(/wrapper\s*\.ele\(\s*['"`]alacakKalemi['"`]/);
  });

  it('kontrat/digerAlacak fallback yok; izinli wrapper kümesi yalnız W-01…W-05', () => {
    const src = readOfficial('official-exchange-builder.ts');
    expect(src).not.toMatch(/\.ele\(\s*['"`](digerAlacak|kontrat|kontratKefil)['"`]/);
    expect(src).toContain("['cek', 'senet', 'police', 'ilam']");
  });

  it('runtime wiring / schema / migration bu değişiklikte de YOK (P02B izolasyon sınırı korunur)', () => {
    for (const f of ['official-exchange-builder.ts', 'official-exchange.types.ts']) {
      const src = readOfficial(f);
      expect(src).not.toContain('@Injectable');
      expect(src).not.toContain('@prisma/client');
      expect(src).not.toContain('schema.prisma');
      expect(src).not.toContain('migration');
    }
  });
});
