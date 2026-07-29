import { decideTelemetryActivation } from '../office-cap02-telemetry-canary-scope.core';

/**
 * OFFICE-P2-CAP02-TELEMETRY-CANARY-SCOPE-I01 doğrulama matrisi.
 * Owner'ın PHASE H1 test listesinin tamamı + malformed/prefix/slug reddi.
 */

const TENANT = 'cmrgs24hq0001uanatffks93h'; // local-development-office (25 char cuid)
const OTHER_TENANT = 'cmm61v99600007a6smfkarha9'; // telli-hukuk
const ACTOR = 'cms56jx4u000213j4dnswyapy';
const OTHER_ACTOR = 'cms56jx55000413j4lgt8kmfp';

const input = (o: Partial<Parameters<typeof decideTelemetryActivation>[0]> = {}) => ({
  masterFlagRaw: 'observe',
  tenantAllowlistRaw: TENANT,
  actorAllowlistRaw: undefined,
  tenantId: TENANT,
  actorUserId: ACTOR,
  ...o,
});

describe('master flag off — allowlist DEVREYE GIRMEZ', () => {
  it.each([undefined, '', 'off', 'on', 'true', '1', 'ENFORCE', 'gibberish'])(
    'masterFlagRaw=%p -> MASTER_DISABLED (allowlisted tenant olsa bile)',
    (masterFlagRaw) => {
      const d = decideTelemetryActivation(input({ masterFlagRaw }));
      expect(d).toEqual({ active: false, reason: 'MASTER_DISABLED' });
    },
  );
});

describe('bos allowlist ASLA "tum tenantlar" demek DEGILDIR', () => {
  it('master observe + allowlist unset -> TENANT_ALLOWLIST_EMPTY', () => {
    const d = decideTelemetryActivation(input({ tenantAllowlistRaw: undefined }));
    expect(d).toEqual({ active: false, reason: 'TENANT_ALLOWLIST_EMPTY' });
  });

  it('master observe + allowlist bos string -> TENANT_ALLOWLIST_EMPTY', () => {
    const d = decideTelemetryActivation(input({ tenantAllowlistRaw: '   ' }));
    expect(d).toEqual({ active: false, reason: 'TENANT_ALLOWLIST_EMPTY' });
  });

  it('yalniz virgul/bosluk iceren allowlist -> EMPTY (malformed DEGIL)', () => {
    const d = decideTelemetryActivation(input({ tenantAllowlistRaw: ' , ,  ,' }));
    expect(d).toEqual({ active: false, reason: 'TENANT_ALLOWLIST_EMPTY' });
  });
});

describe('tam kimlik esleme — substring/prefix/slug YASAK', () => {
  it('dogru tenant -> active true', () => {
    expect(decideTelemetryActivation(input())).toEqual({ active: true });
  });

  it('yanlis tenant -> TENANT_NOT_ALLOWLISTED', () => {
    const d = decideTelemetryActivation(input({ tenantId: OTHER_TENANT }));
    expect(d).toEqual({ active: false, reason: 'TENANT_NOT_ALLOWLISTED' });
  });

  it('tenantId PREFIX olarak eslesiyor ama TAM DEGIL -> reddedilir', () => {
    const d = decideTelemetryActivation(
      input({ tenantAllowlistRaw: TENANT.slice(0, 10), tenantId: TENANT }),
    );
    expect(d.active).toBe(false);
  });

  it('slug allowlist icine yazilirsa (ID sekli degil) -> MALFORMED, tenantId eslesse bile guvenilmez', () => {
    const d = decideTelemetryActivation(input({ tenantAllowlistRaw: 'local-development-office' }));
    expect(d).toEqual({ active: false, reason: 'TENANT_ALLOWLIST_MALFORMED' });
  });

  it('coklu tenant allowlistinde dogru olan bulunur', () => {
    const d = decideTelemetryActivation(
      input({ tenantAllowlistRaw: `${OTHER_TENANT},${TENANT}` }),
    );
    expect(d).toEqual({ active: true });
  });

  it('tek bir malformed eleman TUM listeyi gecersiz kilar', () => {
    const d = decideTelemetryActivation(
      input({ tenantAllowlistRaw: `${TENANT},not-an-id` }),
    );
    expect(d).toEqual({ active: false, reason: 'TENANT_ALLOWLIST_MALFORMED' });
  });
});

describe('actor allowlist — opsiyonel ikinci daraltma', () => {
  it('actor allowlist yoksa yalniz tenant eslesmesi yeterli', () => {
    expect(decideTelemetryActivation(input({ actorAllowlistRaw: undefined }))).toEqual({ active: true });
  });

  it('actor allowlist bos string ise yalniz tenant eslesmesi yeterli', () => {
    expect(decideTelemetryActivation(input({ actorAllowlistRaw: '  ' }))).toEqual({ active: true });
  });

  it('actor allowlist DOLU ve eslesiyorsa -> active', () => {
    const d = decideTelemetryActivation(input({ actorAllowlistRaw: ACTOR }));
    expect(d).toEqual({ active: true });
  });

  it('actor allowlist DOLU ve eslesmiyorsa -> ACTOR_NOT_ALLOWLISTED', () => {
    const d = decideTelemetryActivation(input({ actorAllowlistRaw: OTHER_ACTOR }));
    expect(d).toEqual({ active: false, reason: 'ACTOR_NOT_ALLOWLISTED' });
  });

  it('actor allowlist malformed ise tenant eslesse bile reddedilir', () => {
    const d = decideTelemetryActivation(input({ actorAllowlistRaw: 'not-an-id' }));
    expect(d).toEqual({ active: false, reason: 'ACTOR_ALLOWLIST_MALFORMED' });
  });

  it('tenant yanlisken actor kontrolune HIC GECILMEZ (tenant onceliklidir)', () => {
    const d = decideTelemetryActivation(
      input({ tenantId: OTHER_TENANT, actorAllowlistRaw: 'not-an-id' }),
    );
    expect(d).toEqual({ active: false, reason: 'TENANT_NOT_ALLOWLISTED' });
  });
});

describe('cekirdek safligi', () => {
  it('modul yalniz karar fonksiyonunu export eder (Prisma/NestJS bagimliligi yok)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../office-cap02-telemetry-canary-scope.core');
    expect(Object.keys(mod)).toEqual(['decideTelemetryActivation']);
  });
});
