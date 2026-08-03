/**
 * C3-B06 — §13/10 K10.1-K10.4 UYAP aktarım gate'i (CLIENT tarafı).
 *
 * Kanıtlanan ratifiye kurallar (acceptance: "UYAP aktarım gate'i vekaletnamesiz fail-closed"):
 * - K10.4: representedPartyId servis seviyesinde ZORUNLU — yoksa RED.
 * - K10.2: kayıtlı dayanak (§13/5 registry UYAP_TRANSFER) VE geçerli POA — ikisi birden.
 * - Vekaletnamesiz → RED; geçersiz (süresi geçmiş/belgesiz/azledilmiş) POA → RED.
 * - OZEL vekâlette UYAP kapsam eşlemesi yapılandırılmamış → belirsizlik fail-closed RED.
 * - K10.3: RED audit'e güvenli reason-code ile yazılır (PII yok); break-glass/kuyruk YOK.
 * - K10.1: kanonik operasyonlar (UYAP_SEND/TRIGGER_HACIZ) kapıya tabi; bilinmeyen
 *   operasyon FAIL-CLOSED kapıya tabi; kapsam-dışı liste bugün BOŞ (envanter kanıtı).
 * - UYAP domain-law'ına dokunulmadı (statik kanıt: modules/uyap import edilmez).
 */
import { ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CLIENT_UYAP_OUT_OF_SCOPE_OPERATIONS,
  CLIENT_UYAP_TRANSFER_OPERATIONS,
  ClientUyapTransferGateService,
  classifyUyapOperationForClientGate,
  decideClientUyapTransfer,
} from '../client-uyap-transfer-gate.service';
import { resolveClientProcessingBasis } from '../client-processing-basis.registry';
import type { PoaLike } from '../client-poa-capability';

const NOW = new Date('2026-08-03T12:00:00.000Z');

const validGenelPoa = (over: Partial<PoaLike> = {}): PoaLike => ({
  id: 'poa-1',
  isActive: true,
  status: 'ACTIVE',
  isLimited: false,
  validUntil: null,
  dateIssued: new Date('2026-01-01'),
  filePath: '/poa/poa-1.pdf',
  scopeType: 'GENEL',
  canCollect: true,
  ...over,
});

describe('K10.1 — operasyon sınıflandırması (envanter kanıtı)', () => {
  it('kanonik dış aktarım operasyonları kapıya tabidir', () => {
    expect(CLIENT_UYAP_TRANSFER_OPERATIONS).toEqual(['UYAP_SEND', 'TRIGGER_HACIZ']);
    expect(classifyUyapOperationForClientGate('UYAP_SEND')).toBe('TRANSFER_GATED');
    expect(classifyUyapOperationForClientGate('TRIGGER_HACIZ')).toBe('TRANSFER_GATED');
  });

  it('kapsam-dışı liste bugün BOŞTUR ve bilinmeyen operasyon FAIL-CLOSED kapıya tabidir', () => {
    expect(CLIENT_UYAP_OUT_OF_SCOPE_OPERATIONS).toHaveLength(0);
    expect(classifyUyapOperationForClientGate('BILINMEYEN_YENI_TIP')).toBe('TRANSFER_GATED');
    expect(classifyUyapOperationForClientGate(null)).toBe('TRANSFER_GATED');
  });
});

describe('K10.2 — kayıtlı dayanak registry kanıtı (§13/5 bağlantısı)', () => {
  it('UYAP_TRANSFER registry de kayıtlı, md.5/2-e, açık rıza faaliyeti değil', () => {
    const entry = resolveClientProcessingBasis('UYAP_TRANSFER')!;
    expect(entry.primaryBasis).toBe('MD_5_2_E');
    expect(entry.requiresExplicitConsent).toBe(false);
  });
});

describe('decideClientUyapTransfer (saf, K10.2-K10.4)', () => {
  const base = {
    representedPartyId: 'c1',
    basisRegistered: true,
    poas: [validGenelPoa()],
    now: NOW,
  };

  it('temsil kimliği yoksa RED (K10.4 servis seviyesi zorunluluk)', () => {
    const d = decideClientUyapTransfer({ ...base, representedPartyId: null });
    expect(d.allowed).toBe(false);
    expect(d.reasonCode).toBe('REPRESENTED_PARTY_REQUIRED');
  });

  it('kayıtlı dayanak yoksa RED (registry fail-closed)', () => {
    const d = decideClientUyapTransfer({ ...base, basisRegistered: false });
    expect(d.reasonCode).toBe('NO_LEGAL_BASIS_REGISTERED');
  });

  it('VEKALETNAMESİZ → RED (acceptance)', () => {
    const d = decideClientUyapTransfer({ ...base, poas: [] });
    expect(d.allowed).toBe(false);
    expect(d.reasonCode).toBe('NO_VALID_POA');
  });

  it('geçersiz POA (belgesiz / azledilmiş / süresi geçmiş) geçerli sayılmaz', () => {
    for (const bad of [
      validGenelPoa({ filePath: null }),
      validGenelPoa({ status: 'REVOKED' }),
      validGenelPoa({ isLimited: true, validUntil: new Date('2026-01-01') }),
    ]) {
      expect(decideClientUyapTransfer({ ...base, poas: [bad] }).reasonCode).toBe('NO_VALID_POA');
    }
  });

  it('yalnız OZEL vekâlet varsa belirsizlik fail-closed RED (serbest metin yetki üretmez)', () => {
    const d = decideClientUyapTransfer({ ...base, poas: [validGenelPoa({ scopeType: 'OZEL' })] });
    expect(d.reasonCode).toBe('POA_SCOPE_UNDETERMINED_FOR_UYAP');
  });

  it('geçerli GENEL POA + dayanak + temsil → ALLOWED, kanıt POA id taşır', () => {
    const d = decideClientUyapTransfer(base);
    expect(d.allowed).toBe(true);
    expect(d.basisPoaIds).toEqual(['poa-1']);
  });
});

describe('ClientUyapTransferGateService — fail-closed + deny audit (K10.3)', () => {
  const buildSvc = (poas: PoaLike[] | null) => {
    const prisma: any = {
      client: {
        findFirst: jest.fn().mockResolvedValue(
          poas === null ? null : { id: 'c1', tenantId: 't1', powerOfAttorneys: poas },
        ),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    return { svc: new ClientUyapTransferGateService(prisma, audit as any), audit, prisma };
  };

  it('vekaletnamesiz aktarım RED + CLIENT_UYAP_TRANSFER_DENIED reason-code audit + PII yok', async () => {
    const { svc, audit } = buildSvc([]);
    await expect(
      svc.assertClientUyapTransferAllowed({
        tenantId: 't1',
        representedPartyId: 'c1',
        operationType: 'UYAP_SEND',
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const call = (audit.log as jest.Mock).mock.calls[0][0];
    expect(call.action).toBe('CLIENT_UYAP_TRANSFER_DENIED');
    expect(call.metadata.reasonCode).toBe('NO_VALID_POA');
    expect(call.metadata.operationType).toBe('UYAP_SEND');
    expect(JSON.stringify(call.metadata)).not.toMatch(/\d{11}/);
  });

  it('temsil kimliği olmadan RED — müvekkil sorgusu bile yapılmaz (fail-closed sıra)', async () => {
    const { svc, audit, prisma } = buildSvc([]);
    await expect(
      svc.assertClientUyapTransferAllowed({
        tenantId: 't1',
        representedPartyId: null,
        operationType: 'TRIGGER_HACIZ',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
    expect((audit.log as jest.Mock).mock.calls[0][0].metadata.reasonCode).toBe(
      'REPRESENTED_PARTY_REQUIRED',
    );
  });

  it('geçerli GENEL POA ile aktarım GEÇER; deny audit yazılmaz', async () => {
    const { svc, audit } = buildSvc([validGenelPoa()]);
    const res = await svc.assertClientUyapTransferAllowed({
      tenantId: 't1',
      representedPartyId: 'c1',
      operationType: 'UYAP_SEND',
    });
    expect(res.basisPoaIds).toEqual(['poa-1']);
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('Sınır — UYAP domain-law dokunulmazlığı ve break-glass yokluğu (statik)', () => {
  it('gate kaynağı modules/uyap import etmez, break-glass/kuyruk içermez', () => {
    const src = readFileSync(join(__dirname, '..', 'client-uyap-transfer-gate.service.ts'), 'utf8');
    expect(src).not.toMatch(/from '\.\.\/uyap|modules\/uyap\//);
    expect(src).not.toMatch(/breakGlass|BREAK_GLASS_ALLOWED|queueForRetry|pendingQueue/);
  });
});
