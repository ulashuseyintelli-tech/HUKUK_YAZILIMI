import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DebtorRole } from '@prisma/client';

import { resolveOfficialRole } from '../official-role-translator';
import type { OfficialRoleResolution } from '../official-role-translation.types';

/**
 * DBP-P2-UYAP-CONTRACT-A-P02A — Official Role Translation Boundary (SKELETON) testleri.
 *
 * Bu suite: (a) 12 domain DebtorRole değerinin deterministik ve değer-içermeyen biçimde
 * sınıflandırıldığını, (b) hiçbir RESOLVED/rolID/BORÇLU-fallback üretilmediğini, (c) legacy/runtime
 * bağımlılığı ve wiring olmadığını, (d) resmî DTD dosyasının repo'ya kopyalanmadığını kilitler.
 */

const OFFICIAL_DIR = resolve(__dirname, '..');
const UYAP_DIR = resolve(__dirname, '..', '..');

function readOfficial(file: string): string {
  return readFileSync(resolve(OFFICIAL_DIR, file), 'utf8');
}
function readUyap(file: string): string {
  return readFileSync(resolve(UYAP_DIR, file), 'utf8');
}

const ALL_ROLES = Object.values(DebtorRole) as DebtorRole[];

const INSTRUMENT_ROLES: DebtorRole[] = [
  DebtorRole.KESIDECI,
  DebtorRole.CIRANTA,
  DebtorRole.AVAL,
  DebtorRole.LEHDAR,
  DebtorRole.MUHATAP,
];

const OWNER_ROLES: DebtorRole[] = [
  DebtorRole.ASIL_BORCLU,
  DebtorRole.MUSETEREK_BORCLU,
  DebtorRole.ADI_KEFIL,
  DebtorRole.MUTESELSIL_KEFIL,
];

const LDO_OWNER_ROLES: DebtorRole[] = [
  DebtorRole.MIRASCI,
  DebtorRole.TASFIYE_MEMURU,
  DebtorRole.IFLAS_MASASI,
];

describe('P02A-1 — deterministik ve tam sınıflandırma (12 DebtorRole)', () => {
  it('enum tam 12 değer içerir (test kapsam bütünlüğü)', () => {
    expect(ALL_ROLES).toHaveLength(12);
    expect(INSTRUMENT_ROLES.length + OWNER_ROLES.length + LDO_OWNER_ROLES.length).toBe(12);
  });

  it('her DebtorRole değeri deterministik bir result kind üretir (INVALID_INPUT değil)', () => {
    for (const role of ALL_ROLES) {
      const r = resolveOfficialRole(role);
      expect(['UNSUPPORTED_FOR_ROLTUR', 'UNRESOLVED_AUTHORITY_REQUIRED']).toContain(r.kind);
      // determinizm: aynı girdi aynı sonuç
      expect(resolveOfficialRole(role)).toEqual(r);
    }
  });
});

describe('P02A-2 — kambiyo enstrüman sıfatları → UNSUPPORTED_FOR_ROLTUR', () => {
  it.each(INSTRUMENT_ROLES)('%s → UNSUPPORTED_FOR_ROLTUR', (role) => {
    const r = resolveOfficialRole(role);
    expect(r.kind).toBe('UNSUPPORTED_FOR_ROLTUR');
    if (r.kind === 'UNSUPPORTED_FOR_ROLTUR') {
      expect(r.debtorRole).toBe(role);
      expect(r.reason).toContain('rolTur');
    }
  });
});

describe('P02A-3 — kalan roller → UNRESOLVED_AUTHORITY_REQUIRED + doğru authority', () => {
  it.each([...OWNER_ROLES, ...LDO_OWNER_ROLES])('%s → UNRESOLVED_AUTHORITY_REQUIRED', (role) => {
    const r = resolveOfficialRole(role);
    expect(r.kind).toBe('UNRESOLVED_AUTHORITY_REQUIRED');
  });

  it.each(OWNER_ROLES)('%s → requiredAuthority=OWNER', (role) => {
    const r = resolveOfficialRole(role);
    if (r.kind === 'UNRESOLVED_AUTHORITY_REQUIRED') {
      expect(r.requiredAuthority).toBe('OWNER');
    } else {
      throw new Error(`beklenen UNRESOLVED_AUTHORITY_REQUIRED, gelen ${r.kind}`);
    }
  });

  it.each(LDO_OWNER_ROLES)('%s → requiredAuthority=LDO_OWNER', (role) => {
    const r = resolveOfficialRole(role);
    if (r.kind === 'UNRESOLVED_AUTHORITY_REQUIRED') {
      expect(r.requiredAuthority).toBe('LDO_OWNER');
    } else {
      throw new Error(`beklenen UNRESOLVED_AUTHORITY_REQUIRED, gelen ${r.kind}`);
    }
  });
});

describe('P02A-4 — değer/RESOLVED/fallback YASAĞI', () => {
  it('hiçbir production çağrısı RESOLVED üretmez', () => {
    for (const role of ALL_ROLES) {
      expect(resolveOfficialRole(role).kind).not.toBe('RESOLVED');
    }
  });

  it('hiçbir sonuç rolID taşımaz (varsayılan rolID / 21-71 hedefi yok)', () => {
    for (const role of ALL_ROLES) {
      const r: OfficialRoleResolution = resolveOfficialRole(role);
      expect(Object.prototype.hasOwnProperty.call(r, 'rolID')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(r, 'rol')).toBe(false);
    }
  });

  it('ASIL_BORCLU sessizce BORÇLU/rolID=22 gibi bir hedefe düşmez', () => {
    const r = resolveOfficialRole(DebtorRole.ASIL_BORCLU);
    expect(r.kind).toBe('UNRESOLVED_AUTHORITY_REQUIRED');
    expect(Object.prototype.hasOwnProperty.call(r, 'rolID')).toBe(false);
  });

  it('enum dışı girdi → INVALID_INPUT (runtime savunması)', () => {
    const r = resolveOfficialRole('GARBAGE_ROLE' as unknown as DebtorRole);
    expect(r.kind).toBe('INVALID_INPUT');
  });
});

describe('P02A-5 — bağımlılık ve runtime izolasyonu (kaynak-grep)', () => {
  it('translator yalnız en dar bağımlılıkları IMPORT eder (legacy/PrismaService/NestJS YOK)', () => {
    const src = readOfficial('official-role-translator.ts');
    // Yorumlar yasaklı isimleri açıklama amaçlı anabilir; asıl kısıt IMPORT satırlarındadır.
    const importBlob = src
      .split('\n')
      .filter((l) => /^\s*import\b/.test(l))
      .join('\n');
    expect(importBlob).not.toContain('UYAP_ROL_TURLERI');
    expect(importBlob).not.toContain('uyap-xml.service');
    expect(importBlob).not.toContain('PrismaService');
    expect(importBlob).not.toContain('prisma.service');
    expect(importBlob).not.toContain('@nestjs');
    // Kod gövdesinde NestJS provider decorator bulunmaz.
    expect(src).not.toContain('@Injectable');
    // İzin verilen tek runtime bağımlılığı: @prisma/client (DebtorRole enum).
    expect(importBlob).toContain("from '@prisma/client'");
  });

  it('official/ kaynakları resmî rolID (21-71) hedef değerini kod olarak içermez', () => {
    // rolID kelimesi açıklama olarak geçebilir; ama "rolID: '22'" gibi bir ATAMA olmamalı.
    const translator = readOfficial('official-role-translator.ts');
    const types = readOfficial('official-role-translation.types.ts');
    expect(translator).not.toMatch(/rolID:\s*['"`]\d/);
    expect(types).not.toMatch(/rolID:\s*['"`]\d/);
  });

  it('UyapController / UyapModule / UyapXmlService P02A official boundary’ye referans vermez', () => {
    const controller = readUyap('uyap.controller.ts');
    const uyapModule = readUyap('uyap.module.ts');
    const xmlService = readUyap('uyap-xml.service.ts');
    for (const src of [controller, uyapModule, xmlService]) {
      expect(src).not.toContain('official/');
      expect(src).not.toContain('official-role-translator');
      expect(src).not.toContain('resolveOfficialRole');
      expect(src).not.toContain('official-contract-provenance');
    }
  });

  it('official/ kaynakları schema/migration/XML-encoding yüzeyine dokunmaz', () => {
    for (const f of [
      'official-role-translator.ts',
      'official-role-translation.types.ts',
      'official-contract-provenance.ts',
    ]) {
      const src = readOfficial(f);
      expect(src).not.toContain('schema.prisma');
      expect(src).not.toContain('migration');
      expect(src).not.toContain('xmlbuilder2');
      expect(src).not.toContain('ISO-8859-9'); // encoding iddiası P02B/P04
    }
  });
});
