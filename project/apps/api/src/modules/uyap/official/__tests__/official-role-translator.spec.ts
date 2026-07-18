import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DebtorRole } from '@prisma/client';

import { resolveOfficialRole } from '../official-role-translator';
import type { OfficialRoleResolution } from '../official-role-translation.types';

/**
 * DBP-P2-UYAP-CONTRACT-A-P02A + P03A — Official Role Translation Boundary testleri.
 *
 * Bu suite: (a) 12 domain DebtorRole değerinin deterministik sınıflandırıldığını, (b) P03A owner-safe
 * 4 rolün owner-ratified 22/33'e RESOLVED olduğunu; LDO_OWNER 3 rolün UNRESOLVED, kambiyo 5 sıfatın
 * UNSUPPORTED kaldığını; sessiz BORÇLU fallback / varsayılan rolID olmadığını, (c) legacy/runtime
 * bağımlılığı ve wiring olmadığını kilitler.
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
      expect(['UNSUPPORTED_FOR_ROLTUR', 'UNRESOLVED_AUTHORITY_REQUIRED', 'RESOLVED']).toContain(r.kind);
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

describe('P03A — owner-safe 4 rol → RESOLVED (owner-ratified matris)', () => {
  const EXPECTED: Partial<Record<DebtorRole, { rolID: string; rol: string }>> = {
    [DebtorRole.ASIL_BORCLU]: { rolID: '22', rol: 'BORÇLU/MÜFLİS' },
    [DebtorRole.MUSETEREK_BORCLU]: { rolID: '22', rol: 'BORÇLU/MÜFLİS' },
    [DebtorRole.ADI_KEFIL]: { rolID: '33', rol: 'KEFİL' },
    [DebtorRole.MUTESELSIL_KEFIL]: { rolID: '33', rol: 'KEFİL' },
  };

  it.each(OWNER_ROLES)('%s → RESOLVED (owner-ratified rolID/Rol)', (role) => {
    const r = resolveOfficialRole(role);
    expect(r.kind).toBe('RESOLVED');
    if (r.kind === 'RESOLVED') {
      expect(r.rolID).toBe(EXPECTED[role]!.rolID);
      expect(r.rol).toBe(EXPECTED[role]!.rol);
    } else {
      throw new Error(`beklenen RESOLVED, gelen ${r.kind}`);
    }
  });

  it('exact rolID/Rol pair integrity: 22 yalnız "BORÇLU/MÜFLİS", 33 yalnız "KEFİL"', () => {
    for (const role of OWNER_ROLES) {
      const r = resolveOfficialRole(role);
      if (r.kind !== 'RESOLVED') throw new Error('beklenen RESOLVED');
      if (r.rolID === '22') expect(r.rol).toBe('BORÇLU/MÜFLİS');
      else if (r.rolID === '33') expect(r.rol).toBe('KEFİL');
      else throw new Error(`beklenmeyen rolID ${r.rolID}`);
    }
    // borçlu ailesi → 22, kefil ailesi → 33
    const rolIdOf = (role: DebtorRole): string => {
      const r = resolveOfficialRole(role);
      return r.kind === 'RESOLVED' ? r.rolID : '';
    };
    expect(rolIdOf(DebtorRole.ASIL_BORCLU)).toBe('22');
    expect(rolIdOf(DebtorRole.MUSETEREK_BORCLU)).toBe('22');
    expect(rolIdOf(DebtorRole.ADI_KEFIL)).toBe('33');
    expect(rolIdOf(DebtorRole.MUTESELSIL_KEFIL)).toBe('33');
  });
});

describe('P03B — LDO_OWNER 3 rol → UNRESOLVED (hedef seçilmez)', () => {
  it.each(LDO_OWNER_ROLES)('%s → UNRESOLVED_AUTHORITY_REQUIRED / LDO_OWNER', (role) => {
    const r = resolveOfficialRole(role);
    expect(r.kind).toBe('UNRESOLVED_AUTHORITY_REQUIRED');
    if (r.kind === 'UNRESOLVED_AUTHORITY_REQUIRED') {
      expect(r.requiredAuthority).toBe('LDO_OWNER');
      expect(Object.prototype.hasOwnProperty.call(r, 'rolID')).toBe(false);
    } else {
      throw new Error(`beklenen UNRESOLVED_AUTHORITY_REQUIRED, gelen ${r.kind}`);
    }
  });
});

describe('P03A — değer/fallback disiplini', () => {
  it('yalnız 4 owner-safe rol RESOLVED üretir; diğer 8 rol RESOLVED ÜRETMEZ', () => {
    for (const role of ALL_ROLES) {
      const r = resolveOfficialRole(role);
      if (OWNER_ROLES.includes(role)) {
        expect(r.kind).toBe('RESOLVED');
      } else {
        expect(r.kind).not.toBe('RESOLVED');
      }
    }
  });

  it('rolID/rol YALNIZ owner-safe RESOLVED sonuçlarında bulunur; UNRESOLVED/UNSUPPORTED taşımaz', () => {
    for (const role of ALL_ROLES) {
      const r: OfficialRoleResolution = resolveOfficialRole(role);
      expect(Object.prototype.hasOwnProperty.call(r, 'rolID')).toBe(OWNER_ROLES.includes(role));
      expect(Object.prototype.hasOwnProperty.call(r, 'rol')).toBe(OWNER_ROLES.includes(role));
    }
  });

  it('ASIL_BORCLU AÇIKÇA owner-ratified 22/"BORÇLU/MÜFLİS"e çözülür (sessiz fallback DEĞİL)', () => {
    const r = resolveOfficialRole(DebtorRole.ASIL_BORCLU);
    expect(r.kind).toBe('RESOLVED');
    if (r.kind === 'RESOLVED') {
      expect(r.rolID).toBe('22');
      expect(r.rol).toBe('BORÇLU/MÜFLİS');
    }
    // LDO/kambiyo rolleri sessizce bir hedefe DÜŞMEZ (no silent fallback)
    expect(resolveOfficialRole(DebtorRole.MIRASCI).kind).toBe('UNRESOLVED_AUTHORITY_REQUIRED');
    expect(resolveOfficialRole(DebtorRole.KESIDECI).kind).toBe('UNSUPPORTED_FOR_ROLTUR');
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

  it('translator YALNIZ owner-ratified rolID hedeflerini (22, 33) içerir; başka rolID literal’i yok', () => {
    const translator = readOfficial('official-role-translator.ts');
    const types = readOfficial('official-role-translation.types.ts');
    // types dosyası hâlâ rolID ATAMASI (literal) içermez (yalnız `rolID: string` tip anotasyonu).
    expect(types).not.toMatch(/rolID:\s*['"`]\d/);
    // translator'daki rolID literal atamaları YALNIZ '22' ve '33' (owner-ratified P03A) olmalı.
    const rolIdLiterals = [...translator.matchAll(/rolID:\s*'(\d+)'/g)].map((m) => m[1]);
    expect(rolIdLiterals.length).toBeGreaterThan(0);
    expect([...new Set(rolIdLiterals)].sort()).toEqual(['22', '33']);
    // LDO/kambiyo hedef değeri (ör. 21/23/34/41/43/44/47) SIZMAMALI.
    for (const forbidden of ['21', '23', '34', '41', '43', '44', '47']) {
      expect(rolIdLiterals).not.toContain(forbidden);
    }
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
