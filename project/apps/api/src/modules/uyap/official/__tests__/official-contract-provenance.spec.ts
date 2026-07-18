import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  OFFICIAL_CONTRACT_NAME,
  OFFICIAL_CONTRACT_VERSION,
  OFFICIAL_CONTRACT_PROVENANCE,
  OFFICIAL_DTD_DATE,
  OFFICIAL_DTD_SHA256,
  OFFICIAL_PACKAGE_DATE,
  SOURCE_AUTHORITY,
} from '../official-contract-provenance';

/**
 * DBP-P2-UYAP-CONTRACT-A-P02A — Official Contract A provenance testleri.
 *
 * (a) Köken sabitleri tam ve değişmezdir; (b) resmî exchange.dtd DOSYASI repository'de bulunmaz
 * (mevcut legacy DTD'nin SHA-256'sı resmî SHA'dan FARKLIDIR → resmî dosya sızdırılmamıştır); (c) açık
 * sınır bayrakları (DTD-validated değil, cutover authority yok) doğrudur.
 */

const OFFICIAL_DIR = resolve(__dirname, '..');
const UYAP_DIR = resolve(__dirname, '..', '..');
const LEGACY_DTD = resolve(UYAP_DIR, 'schemas', 'exchange.dtd');

describe('P02A provenance — köken sabitleri tam ve değişmez', () => {
  it('resmî DTD SHA-256 tam ve beklenen değerdedir', () => {
    expect(OFFICIAL_DTD_SHA256).toBe(
      '124a9a96848299d8abf216111572d7c8286777819422a5e29089b956f56a8fe6',
    );
    expect(OFFICIAL_DTD_SHA256).toHaveLength(64);
  });

  it('sözleşme adı/versiyon/tarih/kaynak sabitleri beklenen değerdedir', () => {
    expect(OFFICIAL_CONTRACT_NAME).toBe('UYAP exchangeData Contract A');
    expect(OFFICIAL_CONTRACT_VERSION).toBe('1.2');
    expect(OFFICIAL_DTD_DATE).toBe('2015-12-17');
    expect(OFFICIAL_PACKAGE_DATE).toBe('2024-03-20');
    expect(SOURCE_AUTHORITY).toBe('uyap.gov.tr / rayp.adalet.gov.tr');
  });

  it('provenance nesnesi runtime-immutable (Object.freeze) ve alanları tutarlıdır', () => {
    expect(Object.isFrozen(OFFICIAL_CONTRACT_PROVENANCE)).toBe(true);
    expect(OFFICIAL_CONTRACT_PROVENANCE.dtdSha256).toBe(OFFICIAL_DTD_SHA256);
    expect(OFFICIAL_CONTRACT_PROVENANCE.contractVersion).toBe(OFFICIAL_CONTRACT_VERSION);
  });
});

describe('P02A provenance — açık sınır bayrakları', () => {
  it('köken doğrulanmış ama DTD dosyası repo’da yok, tip modeli DTD-doğrulanmamış, cutover yetkisi yok', () => {
    expect(OFFICIAL_CONTRACT_PROVENANCE.provenanceVerified).toBe(true);
    expect(OFFICIAL_CONTRACT_PROVENANCE.dtdFilePresentInRepository).toBe(false);
    expect(OFFICIAL_CONTRACT_PROVENANCE.typeModelOfficiallyDtdValidated).toBe(false);
    expect(OFFICIAL_CONTRACT_PROVENANCE.runtimeCutoverAuthority).toBe('NONE');
  });
});

describe('P02A provenance — resmî exchange.dtd repository’ye KOPYALANMAMIŞTIR', () => {
  it('official/ altında hiçbir .dtd dosyası yoktur', () => {
    const entries = readdirSync(OFFICIAL_DIR, { recursive: true, withFileTypes: true });
    const dtdFiles = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.dtd'))
      .map((e) => e.name);
    expect(dtdFiles).toEqual([]);
  });

  it('official/ altında exchange.dtd kopyası yoktur (bilinen konumlar)', () => {
    expect(existsSync(resolve(OFFICIAL_DIR, 'exchange.dtd'))).toBe(false);
    expect(existsSync(resolve(OFFICIAL_DIR, 'schemas', 'exchange.dtd'))).toBe(false);
  });

  it('mevcut legacy schemas/exchange.dtd SHA-256’sı resmî SHA’dan FARKLIDIR (resmî dosya sızdırılmamış)', () => {
    // Legacy/local DTD var olmalı (P01 ile LOCAL/LEGACY olarak nitelendi) ama resmî dosya OLMAMALI.
    expect(existsSync(LEGACY_DTD)).toBe(true);
    const legacySha = createHash('sha256').update(readFileSync(LEGACY_DTD)).digest('hex');
    expect(legacySha).not.toBe(OFFICIAL_DTD_SHA256);
  });
});
