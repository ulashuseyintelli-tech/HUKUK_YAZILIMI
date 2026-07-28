/**
 * UYAP-OFFICIAL-SERIALIZER-ARCHITECTURE-I01A — canonical serializer davranış kilidi
 *
 * ## Kapatılan yapısal boşluk
 *
 * I01A öncesi resmî serileştirme **iki bağlantısız yarım parça** idi:
 *
 * ```text
 * official-exchange-builder     → XML metni; deklarasyon encoding="ISO-8859-9"
 *                                 byteEncodingPerformed: false      ← byte dönüşümü YOK
 * official-iso8859-9-encoder    → gerçek ISO-8859-9 byte, fail-closed round-trip
 *                                 (hiçbir üretim yolundan ÇAĞRILMIYORDU)
 * ```
 *
 * Yani "deklarasyon ISO-8859-9 diyor ama elde JS string var" durumu yapısal olarak
 * mümkündü. `serializeUyapExchangeCanonical` iki yarıyı tek sahiplik altında birleştirir.
 *
 * Test matrisi: **SER-01 … SER-20** (owner §10).
 */
import { DebtorRole } from '@prisma/client';
import {
  UYAP_CANONICAL_SERIALIZER_VERSION,
  serializeUyapExchangeCanonical,
} from '../official-canonical-serializer';
import {
  UYAP_DORMANT_DISPATCH_ENABLED,
  prepareUyapDormantDispatch,
} from '../official-dormant-dispatch';
import { serializeOfficialExchange } from '../official-exchange-builder';
import { resolveOfficialRole } from '../official-role-translator';
import type {
  OfficialExchangeInput,
  OfficialTaraf,
} from '../official-exchange.types';

// ============================================================================
// Fixtures — resmî rol çözümlemesi GERÇEK translator'dan gelir (uydurma rolID YOK)
// ============================================================================

const resolvedRole = () => resolveOfficialRole(DebtorRole.ASIL_BORCLU);

const taraf = (over: Partial<OfficialTaraf> = {}): OfficialTaraf => ({
  id: 'T1',
  roleResolution: resolvedRole(),
  kisi: { adi: 'Ahmet', soyadi: 'Yilmaz' },
  ...over,
});

const input = (taraflar: OfficialTaraf[] = [taraf()]): OfficialExchangeInput => ({
  dosya: { dosyaTipi: '1', takipTuru: '1', takipYolu: '1', takipSekli: '1' },
  taraflar,
});

/** Başarılı serileştirme; değilse testi anlamlı bir mesajla düşürür. */
const canonical = (i: OfficialExchangeInput = input()) => {
  const r = serializeUyapExchangeCanonical(i);
  if (r.status !== 'CANONICAL_BYTES') {
    throw new Error(`CANONICAL_BYTES beklenirken ${r.status} dondu`);
  }
  return r;
};

// ============================================================================
// SER-01 … SER-04 — DETERMİNİZM
// ============================================================================

describe('I01A — determinizm', () => {
  it('SER-01: tekrarlanan serileştirme BYTE-ÖZDEŞ', () => {
    const a = canonical();
    const b = canonical();

    expect(a.bytes.equals(b.bytes)).toBe(true);
    expect(a.evidence.encodedBytesSha256).toBe(b.evidence.encodedBytesSha256);
    expect(a.xml).toBe(b.xml);
  });

  it('SER-02: object insertion order çıktıyı DEĞİŞTİRMEZ', () => {
    // Aynı semantik girdi, alanlar TERS sırada kurulmuş.
    const straight = input([
      { id: 'T1', roleResolution: resolvedRole(), kisi: { adi: 'Ahmet', soyadi: 'Yilmaz' } },
    ]);
    const reordered = input([
      { kisi: { soyadi: 'Yilmaz', adi: 'Ahmet' }, roleResolution: resolvedRole(), id: 'T1' } as OfficialTaraf,
    ]);

    expect(canonical(straight).bytes.equals(canonical(reordered).bytes)).toBe(true);
  });

  it('SER-03: element sırası canonical (taraf sırası girdiden gelir, kararlıdır)', () => {
    const { xml } = canonical(input([taraf({ id: 'T1' }), taraf({ id: 'T2' })]));

    expect(xml.indexOf('id="T1"')).toBeLessThan(xml.indexOf('id="T2"'));
    // İkinci koşu aynı sırayı üretir.
    const again = canonical(input([taraf({ id: 'T1' }), taraf({ id: 'T2' })]));
    expect(again.xml).toBe(xml);
  });

  it('SER-04: attribute sırası kararlıdır (aynı girdi → aynı attribute dizilimi)', () => {
    const first = canonical().xml;
    const second = canonical().xml;
    const attrs = (s: string) => (s.match(/\w+="[^"]*"/g) ?? []).join('|');

    expect(attrs(second)).toBe(attrs(first));
  });
});

// ============================================================================
// SER-05 … SER-09 — ESCAPING / NULLABILITY / FORMAT
// ============================================================================

describe('I01A — escaping ve biçimleme', () => {
  it('SER-05: XML özel karakterleri escape edilir', () => {
    const { xml } = canonical(
      input([taraf({ kisi: { adi: 'A&B<C>', soyadi: 'D"E' } })]),
    );

    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
    // Ham karakterler metinde kalmaz.
    expect(xml).not.toMatch(/adi="[^"]*&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it('SER-06: double escaping YOK', () => {
    const { xml } = canonical(input([taraf({ kisi: { adi: 'A&B', soyadi: 'X' } })]));

    expect(xml).toContain('&amp;');
    expect(xml).not.toContain('&amp;amp;');
  });

  it('SER-07: undefined alan EMIT EDİLMEZ; boş string ondan AYRIDIR', () => {
    const absent = canonical(input([taraf({ kisi: { adi: 'A', soyadi: 'B' } })])).xml;
    const empty = canonical(
      input([taraf({ kisi: { adi: 'A', soyadi: 'B', tcKimlikNo: '' } })]),
    ).xml;

    // İki çıktı AYNI OLAMAZ — "yok" ile "boş" birbirine dönüşmemelidir.
    expect(absent).not.toBe(empty);
  });

  it('SER-08/SER-09: çıktı locale/zaman bağımlı DEĞİL (Date/Math kullanılmaz)', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../official-canonical-serializer.ts'),
      'utf8',
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).not.toMatch(/Date\.now\(|new Date\(|Math\.random\(/);
    expect(code).not.toMatch(/toLocaleString|toLocaleDate|Intl\./);
  });
});

// ============================================================================
// SER-10 … SER-13 — ENCODING SINIRI
// ============================================================================

describe('I01A — ISO-8859-9 byte sınırı', () => {
  it('SER-10: Türkçe karakterler kayıpsız byte üretir', () => {
    const r = canonical(
      input([taraf({ kisi: { adi: 'çğıöşü', soyadi: 'ÇĞİÖŞÜ' } })]),
    );

    expect(r.evidence.roundTripVerified).toBe(true);
    expect(r.evidence.byteEncodingPerformed).toBe(true);
    expect(r.bytes.length).toBe(r.evidence.byteLength);
    // ISO-8859-9 tek-byte'tır: Türkçe karakterler UTF-8'deki gibi 2 byte YER KAPLAMAZ.
    expect(Buffer.byteLength(r.xml, 'utf8')).toBeGreaterThan(r.bytes.length);
  });

  it('SER-11: temsil edilemeyen karakter FAIL-CLOSED (sessiz ? veya kayıp YOK)', () => {
    // '€' ve CJK ISO-8859-9'da temsil edilemez.
    const r = serializeUyapExchangeCanonical(
      input([taraf({ kisi: { adi: '€uro', soyadi: '漢字' } })]),
    );

    expect(r.status).toBe('ENCODING_REJECTED');
    if (r.status === 'ENCODING_REJECTED') {
      expect(r.encoding.reason).toBe('UNREPRESENTABLE_CHARACTER');
      expect(r.encoding.unrepresentable.length).toBeGreaterThan(0);
      // Byte ÜRETİLMEZ.
      expect(r as any).not.toHaveProperty('bytes');
    }
  });

  it('SER-12: XML deklarasyonu ile gerçek byte encoding EŞLEŞİR', () => {
    const r = canonical();

    expect(r.xml).toMatch(/^\s*<\?xml[^>]*encoding=["']ISO-8859-9["']/i);
    expect(r.evidence.encoding).toBe('ISO-8859-9');
    expect(r.evidence.declarationMatchesBytes).toBe(true);
    // Byte'lar ISO-8859-9 olarak decode edildiğinde kaynak XML'e birebir döner.
    const iconv = require('iconv-lite');
    expect(iconv.decode(r.bytes, 'iso88599')).toBe(r.xml);
  });

  it('SER-13: satır sonları platformdan BAĞIMSIZ (CRLF yok)', () => {
    expect(canonical().xml).not.toContain('\r\n');
  });
});

// ============================================================================
// SER-14 / SER-15 / SER-19 — YÜZEY SAHİPLİĞİ
// ============================================================================

describe('I01A — serializer sahipliği', () => {
  it('SER-14: canonical entrypoint şekil üretimini builder a DELEGE EDER', () => {
    const i = input();
    const viaCanonical = canonical(i).xml;
    const viaBuilder = serializeOfficialExchange(i);

    expect(viaBuilder.status).toBe('SERIALIZED_DRAFT');
    if (viaBuilder.status === 'SERIALIZED_DRAFT') {
      // Aynı şekil — canonical entrypoint kendi XML'ini İCAT ETMEZ.
      expect(viaCanonical).toBe(viaBuilder.xml);
    }
  });

  it('SER-15: şekil reddi byte üretimini DURDURUR (yetkisiz yol yok)', () => {
    // Çözülemeyen rol → builder REJECTED → canonical SHAPE_REJECTED, byte YOK.
    const unresolved = taraf({ roleResolution: resolveOfficialRole(DebtorRole.MIRASCI) });
    const r = serializeUyapExchangeCanonical(input([unresolved]));

    expect(r.status).toBe('SHAPE_REJECTED');
    expect(r as any).not.toHaveProperty('bytes');
  });

  it('SER-19: aynı semantik girdi FARKLI çağrı yollarında AYNI byte üretir', () => {
    const i = input();
    const direct = canonical(i);
    const viaDispatch = prepareUyapDormantDispatch(i);

    expect(viaDispatch.status).toBe('DORMANT_PREPARED');
    if (viaDispatch.status === 'DORMANT_PREPARED') {
      expect(viaDispatch.bytes.equals(direct.bytes)).toBe(true);
      expect(viaDispatch.evidence.encodedBytesSha256).toBe(
        direct.evidence.encodedBytesSha256,
      );
    }
  });
});

// ============================================================================
// SER-16 … SER-18 — DORMANT DISPATCH
// ============================================================================

describe('I01A — dormant dispatch', () => {
  it('SER-16: dispatch canonical byte ları KULLANIR', () => {
    const r = prepareUyapDormantDispatch(input());

    expect(r.status).toBe('DORMANT_PREPARED');
    if (r.status === 'DORMANT_PREPARED') {
      expect(Buffer.isBuffer(r.bytes)).toBe(true);
      expect(r.evidence.byteLength).toBe(r.bytes.length);
    }
  });

  it('SER-17: ağ çağrısı sayısı SIFIR', () => {
    // Global fetch/http casusları — çağrılırsa test kırılır.
    const fetchSpy = jest.fn();
    const originalFetch = (global as any).fetch;
    (global as any).fetch = fetchSpy;
    const http = require('http');
    const https = require('https');
    const httpSpy = jest.spyOn(http, 'request').mockImplementation(() => {
      throw new Error('NETWORK_CALL_FORBIDDEN');
    });
    const httpsSpy = jest.spyOn(https, 'request').mockImplementation(() => {
      throw new Error('NETWORK_CALL_FORBIDDEN');
    });

    try {
      const r = prepareUyapDormantDispatch(input());
      expect(r.status).toBe('DORMANT_PREPARED');
      if (r.status === 'DORMANT_PREPARED') {
        expect(r.evidence.networkCallCount).toBe(0);
        expect(r.evidence.transportPerformed).toBe(false);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(httpSpy).not.toHaveBeenCalled();
      expect(httpsSpy).not.toHaveBeenCalled();
    } finally {
      (global as any).fetch = originalFetch;
      httpSpy.mockRestore();
      httpsSpy.mockRestore();
    }
  });

  it('SER-18: feature flag FINAL OFF (env ile açılamaz)', () => {
    expect(UYAP_DORMANT_DISPATCH_ENABLED).toBe(false);

    process.env.UYAP_DORMANT_DISPATCH_ENABLED = 'true';
    try {
      const r = prepareUyapDormantDispatch(input());
      expect(r.status).toBe('DORMANT_PREPARED');
      if (r.status === 'DORMANT_PREPARED') {
        expect(r.evidence.featureFlagEnabled).toBe(false);
        expect(r.evidence.transportPerformed).toBe(false);
      }
    } finally {
      delete process.env.UYAP_DORMANT_DISPATCH_ENABLED;
    }
  });
});

// ============================================================================
// SER-20 — UYUM HÜKMÜ ÜRETİLMEZ
// ============================================================================

describe('I01A — hüküm sınırı', () => {
  it('SER-20: strict DTD conformance İDDİA EDİLMEZ', () => {
    const r = canonical();

    expect(r.evidence.officialDtdValidated).toBe(false);
    expect(r.evidence.officialCodelistConformance).toBe('NOT_CLOSED');
    expect(r.serializerVersion).toBe(UYAP_CANONICAL_SERIALIZER_VERSION);

    // Yasaklı statü adları HİÇBİR yerde geçmez.
    const serialized = JSON.stringify({ ...r, bytes: undefined });
    for (const forbidden of [
      'UYAP_READY',
      'SUBMITTABLE',
      'OFFICIAL_ACCEPTED',
      'COMPLIANT',
      'VALIDATED_BYTES',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
