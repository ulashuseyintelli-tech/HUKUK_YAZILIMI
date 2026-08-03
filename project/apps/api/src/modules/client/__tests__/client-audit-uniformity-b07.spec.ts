/**
 * C3-B07 — hukuki audit tekleştirme (uniform contract) drift-guard'ı.
 *
 * Kanıtlanan kurallar:
 * 1. KATALOG TAMLIĞI: B01-B06 kaynaklarında geçen HER audit action kanonik katalogda;
 *    katalogdaki her action da kaynakta gerçekten kullanılıyor (iki yönlü drift-guard).
 * 2. KANAL KURALI: IN_TX action'lar kaynakta logInTransaction ile, DIRECT action'lar
 *    audit.log ile yazılıyor.
 * 3. PII KURALI: doğrulayıcı ham kimlik desenini ve yasak anahtarları reddediyor;
 *    kaynak dosyalarda audit metadata'sına yasak anahtar yazılmıyor (statik).
 * 4. XL-2: AuditActor + client-audit.util export'ları DARALTILMADI (derleme + varlık).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CLIENT_LEGAL_AUDIT_ACTIONS,
  resolveClientLegalAuditAction,
  validateClientLegalAuditMetadata,
} from '../client-legal-audit.contract';
// XL-2 kanıtı: bu import'lar DARALTILIRSA derleme burada kırılır.
import { buildClientFieldDiff, PORTAL_ACCESS_FIELDS } from '../client-audit.util';
import type { AuditActor } from '../client.service';

const C3_SOURCE_FILES = [
  'client-consent.service.ts',
  'client-disclosure.service.ts',
  'client-data-subject-request.service.ts',
  'client-legal-hold.service.ts',
  'client-special-category.service.ts',
  'client-poa-capability.service.ts',
  'client-uyap-transfer-gate.service.ts',
];

const readSrc = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const allSources = C3_SOURCE_FILES.map((f) => ({ file: f, src: readSrc(f) }));

const extractActions = (src: string): string[] =>
  Array.from(src.matchAll(/action: '(CLIENT_[A-Z_]+)'/g)).map((m) => m[1]);

describe('1. Katalog tamlığı (iki yönlü drift-guard)', () => {
  it('kaynaklardaki her action katalogda kayıtlı', () => {
    const emitted = new Set(allSources.flatMap(({ src }) => extractActions(src)));
    for (const action of emitted) {
      expect(resolveClientLegalAuditAction(action)).toBeDefined();
    }
  });

  it('katalogdaki her action kaynakta gerçekten kullanılıyor (ölü kayıt yok)', () => {
    const combined = allSources.map(({ src }) => src).join('\n');
    for (const spec of CLIENT_LEGAL_AUDIT_ACTIONS) {
      expect(combined).toContain(`action: '${spec.action}'`);
    }
  });

  it('katalog 16 hukuki action içerir ve blok izlenebilirliği tam', () => {
    expect(CLIENT_LEGAL_AUDIT_ACTIONS).toHaveLength(16);
    const blocks = new Set(CLIENT_LEGAL_AUDIT_ACTIONS.map((s) => s.block));
    expect([...blocks].sort()).toEqual(['B01', 'B02', 'B03', 'B04', 'B05', 'B06']);
  });
});

describe('2. Kanal kuralı (IN_TX vs DIRECT)', () => {
  it.each(CLIENT_LEGAL_AUDIT_ACTIONS.map((s) => [s.action, s.channel] as const))(
    '%s → %s kanalında yazılıyor',
    (action, channel) => {
      const holder = allSources.find(({ src }) => src.includes(`action: '${action}'`))!;
      const idx = holder.src.indexOf(`action: '${action}'`);
      // Action'dan geriye doğru en yakın audit çağrısı hangi kanal?
      const before = holder.src.slice(Math.max(0, idx - 200), idx);
      if (channel === 'IN_TX') {
        expect(before).toContain('logInTransaction');
      } else {
        expect(before).toMatch(/audit\.log\(\{|this\.audit\.log\(\{/);
        expect(before).not.toContain('logInTransaction');
      }
    },
  );
});

describe('3. PII kuralı', () => {
  it('doğrulayıcı ham TCKN/VKN desenini reddeder', () => {
    const v = validateClientLegalAuditMetadata('CLIENT_CONSENT_GRANT', {
      clientNote: 'tckn 12345678901 ile dogrulandi',
    });
    expect(v.safe).toBe(false);
    expect(v.violations[0]).toContain('RAW_IDENTITY_PATTERN');
  });

  it('doğrulayıcı yasak anahtarları (content/tckn/vkn/identityNo) derinlemesine reddeder', () => {
    const v = validateClientLegalAuditMetadata('CLIENT_DSAR_RESPOND', {
      nested: { content: 'belge metni' },
    });
    expect(v.safe).toBe(false);
    expect(v.violations[0]).toContain('FORBIDDEN_KEY content');
  });

  it('deny kayıtları reasonCode olmadan geçemez', () => {
    expect(validateClientLegalAuditMetadata('CLIENT_UYAP_TRANSFER_DENIED', {}).safe).toBe(false);
    expect(
      validateClientLegalAuditMetadata('CLIENT_UYAP_TRANSFER_DENIED', {
        reasonCode: 'NO_VALID_POA',
        operationType: 'UYAP_SEND',
      }).safe,
    ).toBe(true);
  });

  it('temiz metadata geçer (alan adları + reason-code serbest)', () => {
    const v = validateClientLegalAuditMetadata('CLIENT_CONSENT_REVOKE', {
      activity: 'GREETING_AND_OPTIONAL_COMMUNICATION',
      flagsForcedOff: ['sendBirthdayGreeting'],
      registryVersion: 1,
    });
    expect(v.safe).toBe(true);
  });

  it('kaynaklarda audit metadata bloklarına yasak anahtar yazılmıyor (statik)', () => {
    for (const { file, src } of allSources) {
      // metadata: { ... } bloklarını kaba yakala ve yasak anahtar ara
      const blocks = src.match(/metadata: \{[\s\S]{0,400}?\}/g) ?? [];
      for (const b of blocks) {
        expect({ file, block: b }).not.toMatchObject({
          block: expect.stringMatching(/\b(content|plaintext|tckn|vkn|identityNo)\s*:/),
        });
      }
    }
  });
});

describe('4. XL-2 — export daraltma yok', () => {
  it('client-audit.util export ları ve AuditActor tipi yerinde', () => {
    expect(typeof buildClientFieldDiff).toBe('function');
    expect(Array.isArray(PORTAL_ACCESS_FIELDS)).toBe(true);
    // AuditActor type-only: derlemede kullanıldı; çalışma zamanı kanıtı olarak
    // client.service kaynağında export'un varlığı doğrulanır.
    const clientServiceSrc = readSrc('client.service.ts');
    expect(clientServiceSrc).toMatch(/export (interface|type) AuditActor/);
  });
});
