import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { DebtorRole } from '@prisma/client';
import * as iconv from 'iconv-lite';

import { serializeOfficialExchange } from '../official-exchange-builder';
import { encodeOfficialExchangeToIso88599 } from '../official-iso8859-9-encoder';
import { resolveOfficialRole } from '../official-role-translator';
import type { OfficialExchangeInput, OfficialSerializationResult } from '../official-exchange.types';
import type { OfficialByteEncodingResult } from '../official-iso8859-9-encoder';

/**
 * DBP-P2-UYAP-CONTRACT-A-P04A-ENC — Resmî ISO-8859-9 (Latin-5) gerçek byte encoding foundation testleri.
 *
 * Kapsam: (a) iconv-lite ISO-8859-9 desteği; (b) ASCII + Türkçe exact byte'lar; (c) kritik Latin-5
 * ayrışma byte'ları (Ğ/İ/Ş/ğ/ı/ş); (d) round-trip; (e) temsil-edilemeyen (emoji/CJK/combining) →
 * fail-closed REJECTED; (f) sessiz '?' ikamesi YOK; (g) deklarasyon-uyumsuzluğu → REJECTED; (h)
 * determinizm + SHA-256; (i) end-to-end owner-safe taslak → BYTE_ENCODED; (j) tip yüzeyi (yalnız
 * SERIALIZED_DRAFT); (k) P02B/P03A regresyon; (l) runtime-wiring / schema-migration / raw-log YOK.
 */

type SerializedDraft = Extract<OfficialSerializationResult, { status: 'SERIALIZED_DRAFT' }>;
type ByteEncoded = Extract<OfficialByteEncodingResult, { status: 'BYTE_ENCODED' }>;
type EncodingRejected = Extract<OfficialByteEncodingResult, { status: 'ENCODING_REJECTED' }>;

const DECL = '<?xml version="1.0" encoding="ISO-8859-9"?>';

/** TEST-ONLY sentetik SERIALIZED_DRAFT (serializer'dan bağımsız; encoder'a keyfi XML metni beslemek için). */
function synthDraft(xml: string): SerializedDraft {
  return {
    status: 'SERIALIZED_DRAFT',
    xml,
    xmlDeclarationEncoding: 'ISO-8859-9',
    byteEncodingPerformed: false,
    officialDtdValidated: false,
  };
}

function draftWithBody(body: string): SerializedDraft {
  return synthDraft(`${DECL}<exchangeData>${body}</exchangeData>`);
}

function encodeBody(body: string): OfficialByteEncodingResult {
  return encodeOfficialExchangeToIso88599(draftWithBody(body));
}

const ENCODER_SOURCE = readFileSync(resolve(__dirname, '..', 'official-iso8859-9-encoder.ts'), 'utf8');

/** Türkçe karakter → resmî ISO-8859-9 (Latin-5) byte değeri. */
const TURKISH_BYTES: ReadonlyArray<readonly [string, number]> = [
  ['Ç', 0xc7],
  ['Ğ', 0xd0],
  ['İ', 0xdd],
  ['Ö', 0xd6],
  ['Ş', 0xde],
  ['Ü', 0xdc],
  ['ç', 0xe7],
  ['ğ', 0xf0],
  ['ı', 0xfd],
  ['ö', 0xf6],
  ['ş', 0xfe],
  ['ü', 0xfc],
];

describe('P04A-ENC — iconv-lite ISO-8859-9 desteği', () => {
  it('(1) iconv-lite ISO-8859-9 / iso88599 encoding desteği MEVCUT ve fonksiyoneldir', () => {
    expect(iconv.encodingExists('ISO-8859-9')).toBe(true);
    expect(iconv.encodingExists('iso88599')).toBe(true);
    const s = 'ĞİŞğış';
    expect(iconv.decode(iconv.encode(s, 'iso88599'), 'iso88599')).toBe(s);
  });
});

describe('P04A-ENC — exact byte üretimi (BYTE_ENCODED)', () => {
  it('(2) ASCII gövde → byte dizisi ASCII kod noktalarıyla birebir eşittir', () => {
    const xml = `${DECL}<t>ABC-123_xyz</t>`;
    const r = encodeOfficialExchangeToIso88599(synthDraft(xml)) as ByteEncoded;
    expect(r.status).toBe('BYTE_ENCODED');
    expect(r.bytes.length).toBe(xml.length);
    // Pure-ASCII: ISO-8859-9 byte'ları latin1/ascii ile aynıdır.
    expect(r.bytes.equals(Buffer.from(xml, 'latin1'))).toBe(true);
    expect(r.bytes[xml.indexOf('A')]).toBe(0x41);
    expect(r.bytes[xml.indexOf('1')]).toBe(0x31);
  });

  it('(3) Türkçe gövde → 12 karakterin tamamı doğru Latin-5 byte değerine kodlanır', () => {
    const body = TURKISH_BYTES.map(([ch]) => ch).join('');
    const xml = `${DECL}<t>${body}</t>`;
    const r = encodeOfficialExchangeToIso88599(synthDraft(xml)) as ByteEncoded;
    expect(r.status).toBe('BYTE_ENCODED');
    // Tümü BMP + temsil-edilebilir → 1 byte / karakter (byte index == UTF-16 index).
    expect(r.bytes.length).toBe(xml.length);
    for (const [ch, byte] of TURKISH_BYTES) {
      expect(r.bytes[xml.indexOf(ch)]).toBe(byte);
    }
  });

  it('(4) kritik Latin-5 ayrışma byte\'ları: Ğ=0xD0 İ=0xDD Ş=0xDE ğ=0xF0 ı=0xFD ş=0xFE', () => {
    const critical: ReadonlyArray<readonly [string, number]> = [
      ['Ğ', 0xd0],
      ['İ', 0xdd],
      ['Ş', 0xde],
      ['ğ', 0xf0],
      ['ı', 0xfd],
      ['ş', 0xfe],
    ];
    const body = critical.map(([ch]) => ch).join('');
    const xml = `${DECL}<t>${body}</t>`;
    const r = encodeOfficialExchangeToIso88599(synthDraft(xml)) as ByteEncoded;
    expect(r.status).toBe('BYTE_ENCODED');
    for (const [ch, byte] of critical) {
      expect(r.bytes[xml.indexOf(ch)]).toBe(byte);
    }
    // Node yerleşik latin1 Türkçe için YANLIŞtır (D1: Node latin1 YASAK) — Ğ latin1'de 0xD0 DEĞİLDİR.
    expect(Buffer.from('Ğ', 'latin1')[0]).not.toBe(0xd0);
  });

  it('(5) temsil-edilebilir gövde → roundTripVerified=true ve byte→metin geri-dönüşü kaynağa eşittir', () => {
    const xml = `${DECL}<t>ŞÜKRÜ ÇAĞDAŞ - Ğı</t>`;
    const r = encodeOfficialExchangeToIso88599(synthDraft(xml)) as ByteEncoded;
    expect(r.status).toBe('BYTE_ENCODED');
    expect(r.evidence.roundTripVerified).toBe(true);
    expect(r.evidence.declarationConsistent).toBe(true);
    expect(r.evidence.byteEncodingPerformed).toBe(true);
    expect(iconv.decode(r.bytes, 'iso88599')).toBe(xml);
  });
});

describe('P04A-ENC — fail-closed: temsil-edilemeyen karakter → ENCODING_REJECTED', () => {
  it('(6) emoji (astral) → REJECTED / UNREPRESENTABLE_CHARACTER, code point U+1F600 raporlanır', () => {
    const r = encodeBody('A😀B') as EncodingRejected;
    expect(r.status).toBe('ENCODING_REJECTED');
    expect(r.reason).toBe('UNREPRESENTABLE_CHARACTER');
    const hit = r.unrepresentable.find((u) => u.codePoint === 'U+1F600');
    expect(hit).toBeDefined();
    expect(hit?.character).toBe('😀');
  });

  it('(7) CJK karakter → REJECTED / UNREPRESENTABLE_CHARACTER', () => {
    const r = encodeBody('漢字') as EncodingRejected;
    expect(r.status).toBe('ENCODING_REJECTED');
    expect(r.reason).toBe('UNREPRESENTABLE_CHARACTER');
    expect(r.unrepresentable.length).toBeGreaterThan(0);
  });

  it('(8) decomposed dizi (S + U+0327) → REJECTED; NORMALİZASYON YOK (Ş\'ye birleştirilmez)', () => {
    const r = encodeBody('Ş') as EncodingRejected;
    expect(r.status).toBe('ENCODING_REJECTED');
    expect(r.reason).toBe('UNREPRESENTABLE_CHARACTER');
    // Combining cedilla temsil-edilemez olarak raporlanır (NFC ile Ş'ye dönüştürülmez).
    expect(r.unrepresentable.some((u) => u.codePoint === 'U+0327')).toBe(true);
    // Kontrast: precomposed Ş (U+015E) TEK BAŞINA temsil-edilebilir → normalizasyon gerekmeden geçer.
    const ok = encodeBody('Ş') as ByteEncoded;
    expect(ok.status).toBe('BYTE_ENCODED');
  });

  it('(9a) temsil-edilemeyen (€ U+20AC) → REJECTED; sessiz \'?\' (0x3F) ikameli byte ÜRETİLMEZ', () => {
    const r = encodeBody('10€') as EncodingRejected;
    expect(r.status).toBe('ENCODING_REJECTED');
    expect(r.reason).toBe('UNREPRESENTABLE_CHARACTER');
    // Sonuç BYTE_ENCODED değildir; dolayısıyla '?' ile ikame edilmiş byte de dönmez.
    expect('bytes' in r).toBe(false);
  });

  it('(9b) gerçek \'?\' (U+003F) temsil-edilebilir → BYTE_ENCODED, 0x3F byte korunur', () => {
    const xml = `${DECL}<t>a?b</t>`;
    const r = encodeOfficialExchangeToIso88599(synthDraft(xml)) as ByteEncoded;
    expect(r.status).toBe('BYTE_ENCODED');
    expect(r.bytes[xml.indexOf('?')]).toBe(0x3f);
    expect(iconv.decode(r.bytes, 'iso88599')).toBe(xml);
  });
});

describe('P04A-ENC — deklarasyon tutarlılığı', () => {
  it('(10a) XML deklarasyonu UTF-8 → REJECTED / DECLARATION_MISMATCH', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><x/>';
    const r = encodeOfficialExchangeToIso88599(synthDraft(xml)) as EncodingRejected;
    expect(r.status).toBe('ENCODING_REJECTED');
    expect(r.reason).toBe('DECLARATION_MISMATCH');
    expect(r.unrepresentable).toEqual([]);
  });

  it('(10b) deklarasyon YOK → REJECTED / DECLARATION_MISMATCH', () => {
    const r = encodeOfficialExchangeToIso88599(synthDraft('<x/>')) as EncodingRejected;
    expect(r.status).toBe('ENCODING_REJECTED');
    expect(r.reason).toBe('DECLARATION_MISMATCH');
  });
});

describe('P04A-ENC — determinizm + kanıt', () => {
  it('(11) aynı girdi iki kez → byte\'lar özdeş, SHA-256 ve byteLength özdeş', () => {
    const draft = draftWithBody('ÇÖĞÜŞİ-determinizm');
    const a = encodeOfficialExchangeToIso88599(draft) as ByteEncoded;
    const b = encodeOfficialExchangeToIso88599(draft) as ByteEncoded;
    expect(a.status).toBe('BYTE_ENCODED');
    expect(a.bytes.equals(b.bytes)).toBe(true);
    expect(a.evidence.encodedBytesSha256).toBe(b.evidence.encodedBytesSha256);
    expect(a.evidence.byteLength).toBe(b.evidence.byteLength);
    // SHA-256 bağımsız hesap ile doğrulanır.
    expect(a.evidence.encodedBytesSha256).toBe(createHash('sha256').update(a.bytes).digest('hex'));
    expect(a.evidence.byteLength).toBe(a.bytes.length);
  });

  it('(ek) evidence.officialDtdValidated DAİMA false, encoding etiketi ISO-8859-9', () => {
    const r = encodeBody('kanıt') as ByteEncoded;
    expect(r.status).toBe('BYTE_ENCODED');
    expect(r.evidence.officialDtdValidated).toBe(false);
    expect(r.evidence.encoding).toBe('ISO-8859-9');
  });

  it('(ek) sonuç statüsü YALNIZ BYTE_ENCODED | ENCODING_REJECTED (yasak adlar üretilmez)', () => {
    const statuses = new Set<string>([
      encodeBody('temsil-edilebilir').status,
      encodeBody('A😀B').status,
      encodeOfficialExchangeToIso88599(synthDraft('<x/>')).status,
    ]);
    for (const s of statuses) {
      expect(['BYTE_ENCODED', 'ENCODING_REJECTED']).toContain(s);
    }
    for (const forbidden of ['UYAP_READY', 'SUBMITTABLE', 'OFFICIAL_ACCEPTED', 'COMPLIANT', 'VALIDATED_BYTES']) {
      expect(statuses.has(forbidden)).toBe(false);
    }
  });
});

describe('P04A-ENC — end-to-end (gerçek serializer + P03A translator)', () => {
  it('(12) owner-safe RESOLVED taraf → SERIALIZED_DRAFT → BYTE_ENCODED', () => {
    const input: OfficialExchangeInput = {
      dosya: { dosyaTipi: '1', takipTuru: '1', mahiyetKodu: '1007' },
      taraflar: [
        {
          id: 'T1',
          roleResolution: resolveOfficialRole(DebtorRole.ASIL_BORCLU),
          kisi: { adi: 'ŞÜKRÜ', soyadi: 'ÇAĞDAŞ' },
        },
      ],
    };
    const draft = serializeOfficialExchange(input);
    expect(draft.status).toBe('SERIALIZED_DRAFT');
    if (draft.status !== 'SERIALIZED_DRAFT') {
      throw new Error('beklenmeyen: serializer SERIALIZED_DRAFT üretmedi');
    }
    // Serializer çıktısı RESOLVED rol etiketi "BORÇLU/MÜFLİS" (Türkçe) içerir → temsil-edilebilir.
    expect(draft.xml).toContain('BORÇLU/MÜFLİS');
    const r = encodeOfficialExchangeToIso88599(draft) as ByteEncoded;
    expect(r.status).toBe('BYTE_ENCODED');
    expect(r.evidence.byteEncodingPerformed).toBe(true);
    expect(r.evidence.officialDtdValidated).toBe(false);
    expect(iconv.decode(r.bytes, 'iso88599')).toBe(draft.xml);
  });
});

describe('P04A-ENC — tip yüzeyi + runtime savunması', () => {
  it('(13a) encoder girdisi TİP OLARAK yalnız SERIALIZED_DRAFT extract\'idir (rastgele string/REJECTED değil)', () => {
    expect(ENCODER_SOURCE).toMatch(
      /Extract<\s*OfficialSerializationResult\s*,\s*\{\s*status:\s*'SERIALIZED_DRAFT'\s*\}\s*>/,
    );
  });

  it('(13b) force-cast REJECTED serializer sonucu → encoder fail-closed ENCODING_REJECTED (crash yok)', () => {
    const rejected: OfficialSerializationResult = {
      status: 'REJECTED',
      reason: 'test',
      unresolved: [{ tarafId: 'T1', kind: 'UNRESOLVED_AUTHORITY_REQUIRED' }],
    };
    // Tip ihlalini KASITLI simüle et (normalde tip yüzeyi bunu engeller).
    const r = encodeOfficialExchangeToIso88599(rejected as unknown as SerializedDraft);
    expect(r.status).toBe('ENCODING_REJECTED');
  });
});

describe('P04A-ENC — P02B / P03A regresyon (davranış değişmedi)', () => {
  it('(14) P02B serializer: RESOLVED → SERIALIZED_DRAFT, unresolved → REJECTED (değişmedi)', () => {
    const resolvedInput: OfficialExchangeInput = {
      dosya: { dosyaTipi: '1' },
      taraflar: [{ id: 'T1', roleResolution: resolveOfficialRole(DebtorRole.ADI_KEFIL), kisi: { adi: 'A', soyadi: 'B' } }],
    };
    expect(serializeOfficialExchange(resolvedInput).status).toBe('SERIALIZED_DRAFT');

    const unresolvedInput: OfficialExchangeInput = {
      dosya: { dosyaTipi: '1' },
      taraflar: [{ id: 'T1', roleResolution: resolveOfficialRole(DebtorRole.MIRASCI), kisi: { adi: 'A', soyadi: 'B' } }],
    };
    expect(serializeOfficialExchange(unresolvedInput).status).toBe('REJECTED');
  });

  it('(15) P03A translator: owner-safe roller RESOLVED (22/33), LDO/kambiyo fail-closed (değişmedi)', () => {
    expect(resolveOfficialRole(DebtorRole.ASIL_BORCLU)).toEqual({ kind: 'RESOLVED', rolID: '22', rol: 'BORÇLU/MÜFLİS' });
    expect(resolveOfficialRole(DebtorRole.MUTESELSIL_KEFIL)).toEqual({ kind: 'RESOLVED', rolID: '33', rol: 'KEFİL' });
    expect(resolveOfficialRole(DebtorRole.MIRASCI).kind).toBe('UNRESOLVED_AUTHORITY_REQUIRED');
    expect(resolveOfficialRole(DebtorRole.KESIDECI).kind).toBe('UNSUPPORTED_FOR_ROLTUR');
  });
});

describe('P04A-ENC — izolasyon: runtime-wiring / schema-migration / raw-log YOK', () => {
  /** uyap modül alt-ağacındaki (test-dışı) .ts dosyalarını toplar. */
  function collectRuntimeTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        out.push(...collectRuntimeTsFiles(full));
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        out.push(full);
      }
    }
    return out;
  }

  it('(16) encoder HİÇBİR runtime dosyası tarafından import EDİLMEZ (yalnız test-reachable)', () => {
    const uyapDir = resolve(__dirname, '..', '..');
    const runtimeFiles = collectRuntimeTsFiles(uyapDir).filter((f) => !f.endsWith('official-iso8859-9-encoder.ts'));
    for (const f of runtimeFiles) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toContain('official-iso8859-9-encoder');
      expect(src).not.toContain('encodeOfficialExchangeToIso88599');
    }
    // app.module.ts (varsa) da encoder'ı referanslamaz.
    const appModule = resolve(__dirname, '..', '..', '..', '..', 'app.module.ts');
    if (existsSync(appModule)) {
      const src = readFileSync(appModule, 'utf8');
      expect(src).not.toContain('official-iso8859-9-encoder');
    }
  });

  it('(17) encoder Prisma/DB bağımlılığı içermez (schema/migration etkisi YOK)', () => {
    const importLines = ENCODER_SOURCE.split('\n').filter((l) => /^\s*import\b/.test(l));
    for (const l of importLines) {
      expect(l).not.toContain('@prisma/client');
      expect(l).not.toContain('PrismaService');
      expect(l).not.toContain('prisma');
    }
  });

  it('(18) encoder ham XML/byte loglamaz (console/Logger çağrısı YOK)', () => {
    expect(/\bconsole\s*\./.test(ENCODER_SOURCE)).toBe(false);
    expect(/\bnew\s+Logger\b/.test(ENCODER_SOURCE)).toBe(false);
    expect(/\.(log|debug|warn|error|verbose)\s*\(/.test(ENCODER_SOURCE)).toBe(false);
  });
});
