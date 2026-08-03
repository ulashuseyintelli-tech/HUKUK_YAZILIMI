/**
 * C3-B05 — §13/9 K9.1-K9.6 vekâletname ↔ capability binding.
 *
 * Kanıtlanan ratifiye kurallar (acceptance: "geçerli POA olmadan dört yetki de ETKİSİZ"):
 * - K9.1 geçerlilik matrisi: her koşulun tek başına ihlali POA'yı geçersiz kılar.
 * - K9.2: GENEL yalnız canCollect'i kapsar (açık sınırlama hariç); özel yetkiler her
 *   durumda açık bayrak ister; OZEL'de dördü de açık bayrak; scopeDescription yetki üretmez.
 * - K9.3: flat bayrak yalnız EK KISIT (flat=false → RED); geçerli POA'lardan biri
 *   canCollect'i açıkça sınırlandırmışsa çoklu-POA'da bile fail-closed RED.
 * - K9.4: geçerli POA yokken DÖRT efektif capability de ETKİSİZ; create default FALSE.
 * - Servis kapısı: RED kararı audit'e yazılır; hata gövdesi PII taşımaz.
 */
import { ForbiddenException } from '@nestjs/common';
import {
  decideEffectiveClientCapability,
  deriveEffectiveClientCapabilities,
  findPoaInvalidReason,
  poaCoversCapability,
  CLIENT_POA_CAPABILITIES,
  type PoaLike,
} from '../client-poa-capability';
import { ClientPoaCapabilityService } from '../client-poa-capability.service';

const NOW = new Date('2026-08-03T12:00:00.000Z');

const validPoa = (over: Partial<PoaLike> = {}): PoaLike => ({
  id: 'poa-1',
  isActive: true,
  status: 'ACTIVE',
  isLimited: false,
  validUntil: null,
  dateIssued: new Date('2026-01-01'),
  filePath: '/poa/poa-1.pdf',
  notaryName: null,
  journalNo: null,
  scopeType: 'GENEL',
  canCollect: true,
  canWaive: false,
  canSettle: false,
  canRelease: false,
  ...over,
});

const clientAllFlagsOn = { canCollect: true, canWaive: true, canSettle: true, canRelease: true };

// =========================================================================================
// 1. K9.1 — geçerlilik matrisi
// =========================================================================================
describe('K9.1 — geçerli POA tanımı (her koşul tek başına düşürür)', () => {
  it.each([
    [{ isActive: false }, 'POA_INACTIVE'],
    [{ status: 'REVOKED' }, 'POA_STATUS_NOT_ACTIVE'], // azil
    [{ status: 'PENDING' }, 'POA_STATUS_NOT_ACTIVE'], // askı/onay bekleme
    [{ status: 'EXPIRED' }, 'POA_STATUS_NOT_ACTIVE'],
    [{ isLimited: true, validUntil: null }, 'POA_VALIDITY_UNDEFINED'], // belirsizlik fail-closed
    [{ isLimited: true, validUntil: new Date('2026-01-01') }, 'POA_VALIDITY_EXPIRED'],
    [{ validUntil: new Date('2026-07-01') }, 'POA_VALIDITY_EXPIRED'],
    [{ dateIssued: new Date('2027-01-01') }, 'POA_DATE_ISSUED_IN_FUTURE'],
    [{ filePath: null }, 'POA_EVIDENCE_MISSING'], // belge yok + noter/yevmiye yok
  ] as const)('ihlal %j → %s', (override, expected) => {
    expect(findPoaInvalidReason(validPoa(override as any), NOW)).toBe(expected);
  });

  it('belge YOK ama noter adı + yevmiye no VAR → doğrulanabilir immutable referans yeterli', () => {
    const poa = validPoa({ filePath: null, notaryName: 'Ankara 1. Noter', journalNo: '2026/123' });
    expect(findPoaInvalidReason(poa, NOW)).toBeNull();
  });

  it('süresiz (isLimited=false, validUntil=null) POA geçerli', () => {
    expect(findPoaInvalidReason(validPoa(), NOW)).toBeNull();
  });
});

// =========================================================================================
// 2. K9.2 — kapsam kuralları
// =========================================================================================
describe('K9.2 — kapsam uyumu', () => {
  it('GENEL vekâlet canCollect kapsar; açık sınırlama (false) kapsamı düşürür', () => {
    expect(poaCoversCapability(validPoa(), 'canCollect')).toBe(true);
    expect(poaCoversCapability(validPoa({ canCollect: false }), 'canCollect')).toBe(false);
  });

  it('canWaive/canSettle/canRelease GENEL vekâlette bile AÇIK bayrak ister', () => {
    const genel = validPoa(); // özel bayraklar false
    expect(poaCoversCapability(genel, 'canWaive')).toBe(false);
    expect(poaCoversCapability(genel, 'canSettle')).toBe(false);
    expect(poaCoversCapability(genel, 'canRelease')).toBe(false);
    expect(poaCoversCapability(validPoa({ canWaive: true }), 'canWaive')).toBe(true);
  });

  it('OZEL vekâlette canCollect dahil dördü de açık bayrak ister; scopeDescription yetki üretmez', () => {
    const ozel = validPoa({ scopeType: 'OZEL', canCollect: false, scopeDescription: 'ahzu kabza dahil her sey' } as any);
    expect(poaCoversCapability(ozel, 'canCollect')).toBe(false);
    expect(poaCoversCapability(validPoa({ scopeType: 'OZEL', canCollect: true }), 'canCollect')).toBe(true);
  });
});

// =========================================================================================
// 3. K9.3/K9.4 — efektif karar
// =========================================================================================
describe('K9.3/K9.4 — efektif yetki kararı', () => {
  it('K9.4: geçerli POA yokken DÖRT capability de ETKİSİZ (flat bayraklar true olsa bile)', () => {
    const all = deriveEffectiveClientCapabilities(clientAllFlagsOn, [], NOW);
    for (const cap of CLIENT_POA_CAPABILITIES) {
      expect(all[cap].allowed).toBe(false);
      expect(all[cap].reasonCode).toBe('NO_VALID_POA');
    }
  });

  it('geçersiz POA (süresi geçmiş) geçerli POA yerine SAYILMAZ', () => {
    const d = decideEffectiveClientCapability(
      clientAllFlagsOn,
      [validPoa({ isLimited: true, validUntil: new Date('2026-01-01') })],
      'canCollect',
      NOW,
    );
    expect(d.allowed).toBe(false);
    expect(d.reasonCode).toBe('NO_VALID_POA');
  });

  it('geçerli GENEL POA + flat izin → canCollect ALLOWED, kanıt POA id taşır', () => {
    const d = decideEffectiveClientCapability(clientAllFlagsOn, [validPoa()], 'canCollect', NOW);
    expect(d.allowed).toBe(true);
    expect(d.basisPoaIds).toEqual(['poa-1']);
  });

  it('flat bayrak yalnız EK KISIT: flat=false ise POA kapsasa da RED (tek başına yetki veremez)', () => {
    const d = decideEffectiveClientCapability(
      { ...clientAllFlagsOn, canCollect: false },
      [validPoa()],
      'canCollect',
      NOW,
    );
    expect(d.allowed).toBe(false);
    expect(d.reasonCode).toBe('FLAT_FLAG_RESTRICTION');
  });

  it('çoklu POA: biri işlemi bağımsız kapsıyorsa yeter', () => {
    const d = decideEffectiveClientCapability(
      clientAllFlagsOn,
      [validPoa({ id: 'poa-1', canWaive: false }), validPoa({ id: 'poa-2', canWaive: true })],
      'canWaive',
      NOW,
    );
    expect(d.allowed).toBe(true);
    expect(d.basisPoaIds).toEqual(['poa-2']);
  });

  it('geçerli POA lardan biri canCollect i AÇIKÇA sınırlandırmışsa çoklu-POA da bile fail-closed RED', () => {
    const d = decideEffectiveClientCapability(
      clientAllFlagsOn,
      [validPoa({ id: 'poa-1' }), validPoa({ id: 'poa-2', canCollect: false })],
      'canCollect',
      NOW,
    );
    expect(d.allowed).toBe(false);
    expect(d.reasonCode).toBe('POA_EXPLICIT_COLLECT_RESTRICTION');
  });

  it('kapsam dışı: geçerli POA var ama yetkiyi kapsamıyor → POA_SCOPE_NOT_COVERED', () => {
    const d = decideEffectiveClientCapability(clientAllFlagsOn, [validPoa()], 'canRelease', NOW);
    expect(d.allowed).toBe(false);
    expect(d.reasonCode).toBe('POA_SCOPE_NOT_COVERED');
  });
});

// =========================================================================================
// 4. Servis kapısı — fail-closed + audit
// =========================================================================================
describe('ClientPoaCapabilityService.assertEffectiveCapability', () => {
  const buildSvc = (poas: PoaLike[], clientFlags: any = clientAllFlagsOn) => {
    const prisma: any = {
      client: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'c1',
          tenantId: 't1',
          ...clientFlags,
          powerOfAttorneys: poas,
        }),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    return { svc: new ClientPoaCapabilityService(prisma, audit as any), audit };
  };

  it('vekaletnamesiz iddia RED + CLIENT_EFFECTIVE_CAPABILITY_DENIED audit + PII yok', async () => {
    const { svc, audit } = buildSvc([]);
    await expect(
      svc.assertEffectiveCapability({ tenantId: 't1', clientId: 'c1', capability: 'canCollect', actorUserId: 'u1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const call = (audit.log as jest.Mock).mock.calls[0][0];
    expect(call.action).toBe('CLIENT_EFFECTIVE_CAPABILITY_DENIED');
    expect(call.metadata.reasonCode).toBe('NO_VALID_POA');
    expect(JSON.stringify(call.metadata)).not.toMatch(/\d{11}/); // TCKN benzeri sızıntı yok
  });

  it('geçerli POA ile iddia geçer ve kanıt POA id döner', async () => {
    const { svc, audit } = buildSvc([validPoa()]);
    const res = await svc.assertEffectiveCapability({
      tenantId: 't1',
      clientId: 'c1',
      capability: 'canCollect',
    });
    expect(res.basisPoaIds).toEqual(['poa-1']);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
