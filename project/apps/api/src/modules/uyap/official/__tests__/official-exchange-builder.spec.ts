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
    dosya: { dosyaTipi: '1', takipTuru: '1', mahiyetKodu: '1007' },
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

  it('alacakKalemi + faiz → attribute modeli (faizTipKod değeri test-provided, kanonik değil)', () => {
    const input: OfficialExchangeInput = {
      ...baseInput([resolvedTaraf()]),
      alacakKalemleri: [
        {
          id: 'AK1',
          alacakKalemAdi: 'Asil Alacak',
          alacakKalemTutar: '1000.00',
          faiz: { baslangicTarihi: '2026-01-01', faizTipKod: 'FAIZT-TEST', faizOran: '10' },
        },
      ],
    };
    const r = serializeOfficialExchange(input);
    if (r.status !== 'SERIALIZED_DRAFT') throw new Error('beklenen SERIALIZED_DRAFT');
    expect(r.xml).toMatch(/<alacakKalemi[^>]*alacakKalemTutar="1000\.00"/);
    expect(r.xml).toMatch(/<faiz[^>]*faizTipKod="FAIZT-TEST"/);
  });
});

describe('P02B — UNRESOLVED-ROLE REJECTION (gerçek P02A translator çıktısıyla)', () => {
  it('UNRESOLVED_AUTHORITY_REQUIRED taraf (ASIL_BORCLU) → REJECTED, XML yok', () => {
    const taraf = resolvedTaraf({ roleResolution: resolveOfficialRole(DebtorRole.ASIL_BORCLU) });
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
