/**
 * CLF-O0-01 (owner GO 2026-09-10) — PR-1.3 DOMAIN-OWNED KAPISI GENEL KARAR YOLLARININ DÖRDÜNDE DE (DB YOK).
 *
 * ÖLÇÜLEN (değişmemiş kod, main `42d109fe`): `approve` / `reject` / `approveWithChanges` kapıyı
 *   (`assertGenericDecisionAllowed`) çağırıyordu, `requestRevision` ÇAĞIRMIYORDU. FD talebi
 *   (`CLIENT_FINANCIAL_DISCLOSURE_APPROVE`) genel kutudan REVISION_REQUESTED'a çekilebiliyordu; o sürümü FD'nin kendi
 *   yolları ilerletemez (`completeOfficeApproval` → REQUEST_CONSUMED, `reconcileConsumedOfficeApproval` →
 *   UNSUPPORTED_CONSUMED_DECISION, `requestOfficeApproval` tüketilmiş talebi "replayed" döndürür).
 *   Kayıt: `project/docs/governance/office-x4-r01/clf-o0-01-successor-record-r01.md`.
 * KURAL: domain-owned talepte genel yüzey HİÇBİR karar veremez — 409 `DOMAIN_ACTION_REQUIRED`. Kapı talep okunduktan
 *   hemen sonra; durum denetiminden, öz-onay / rol / yetki okumalarından ve her yazmadan ÖNCE çalışır.
 * DEĞİŞMEYEN: domain-owned OLMAYAN türlerin karar davranışı ve VIEWER onay kararı sınırı (#2606). Geçmiş
 *   REVISION_REQUESTED kayıtlarına dokunulmaz (buradaki testler yalnız yazma YOKLUĞUNU ölçer).
 * FD İPTAL SINIRI (owner GO 2026-09-10, ikinci GO): `cancel()` (talep sahibinin genel kutudan geri çekmesi) da kapıyı
 *   çağırmıyordu → FD talebi CANCELLED'a çekilip sürüm aynı kilide düşüyordu. `cancel`'da kapı talep SAHİBİ
 *   denetiminden SONRA, her yazmadan ÖNCE çalışır: talep sahibi 409, talep sahibi olmayan (başka tenant dahil)
 *   bugünkü gibi 403. FD dışı iptal DEĞİŞMEDİ. Yeni geri çekme akışı / geçmiş kayıt kurtarması YOK.
 *
 * Kanıt sınıfı: TEST (gerçek servis, sahte prisma). PRODUCTION DAVRANIŞ KANITI DEĞİLDİR.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OfficeApprovalService } from '../office-approval.service';
import { DomainActionRequiredError } from '../office-approval-domain-ownership';
import {
  CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE,
  CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE,
} from '../../client-financial-disclosure/client-financial-disclosure-approval.contract';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';

const TENANT = 't1';
const REQUESTER = 'u-req';
const FD = CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE;
const DENIED_VIEWER = 'OFFICE_APPROVAL_DECISION_DENIED_VIEWER';

type Role = 'ADMIN' | 'USER' | 'VIEWER';
type Lawyer = { lawyerRank: string; canApproveOfficeActions: boolean };
type UserRow = { id: string; role: Role; lawyer: Lawyer | null };
type Row = Record<string, any>;

const PARTNER: Lawyer = { lawyerRank: 'PARTNER', canApproveOfficeActions: false };
const MANAGER: Lawyer = { lawyerRank: 'MANAGER', canApproveOfficeActions: false };
const DELEGATE: Lawyer = { lawyerRank: 'AUTHORIZED', canApproveOfficeActions: true };
const LAWYER: Lawyer = { lawyerRank: 'LAWYER', canApproveOfficeActions: false };

/** TEST-ONLY aktörler: `role` = DB rolü, `lawyer` = bağlı avukat. */
const USERS: Record<string, UserRow> = {
  'u-p': { id: 'u-p', role: 'USER', lawyer: PARTNER },
  'u-m': { id: 'u-m', role: 'USER', lawyer: MANAGER },
  'u-d': { id: 'u-d', role: 'USER', lawyer: DELEGATE },
  'u-l': { id: 'u-l', role: 'USER', lawyer: LAWYER },
  'u-vp': { id: 'u-vp', role: 'VIEWER', lawyer: PARTNER },
  'u-vm': { id: 'u-vm', role: 'VIEWER', lawyer: MANAGER },
  'u-vd': { id: 'u-vd', role: 'VIEWER', lawyer: DELEGATE },
  [REQUESTER]: { id: REQUESTER, role: 'USER', lawyer: PARTNER },
};

const pending = (id: string, actionCode: string, over: Row = {}): Row => {
  const savedIntent = { kind: actionCode, ref: id };
  return {
    id,
    tenantId: TENANT,
    actionCode,
    targetType: 'LegalCase',
    targetRef: `case-${id}`,
    requesterUserId: REQUESTER,
    approverUserId: null,
    status: 'PENDING_APPROVAL',
    executionStatus: 'NOT_RUN',
    savedIntent,
    payloadHash: stableJsonHash(savedIntent),
    replacementSavedIntent: null,
    replacementPayloadHash: null,
    reason: null,
    decisionNote: null,
    idempotencyKey: null,
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
    decidedAt: null,
    executedAt: null,
    expiresAt: null,
    ...over,
  };
};

const fdPending = (id: string, over: Row = {}): Row =>
  pending(id, FD, { targetType: CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE, targetRef: `fdv-${id}`, ...over });

/** Gerçek OfficeApprovalService + sahte prisma; yazmalar bellek içi kayda uygulanır. */
function harness(requests: Row[]) {
  const store = new Map<string, Row>(requests.map((r) => [r.id, { ...r }]));
  const prisma: any = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const u = USERS[where.id];
        if (!u) return null;
        return {
          id: u.id,
          role: u.role,
          isActive: true,
          tenantId: TENANT,
          staffMember: null,
          lawyer: u.lawyer ? { ...u.lawyer, tenantId: TENANT, tckn: null } : null,
        };
      }),
    },
    officeApprovalRequest: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        store.has(where.id) ? { ...store.get(where.id) } : null,
      ),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string; status: string }; data: Row }) => {
        const row = store.get(where.id);
        if (!row || row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  const audit = { log: jest.fn(async (_entry: Record<string, unknown>) => undefined) };
  const domainSync = { syncAfterDecision: jest.fn(async (_tx: unknown, _updated: unknown) => undefined) };
  const svc = new OfficeApprovalService(prisma, audit as never, domainSync as never);
  /** Ret halinde karar transaction'ı AÇILMAZ; talep satırı, domain senkronu ve audit dokunulmaz. */
  const expectNoWrites = (requestId: string, before: Row) => {
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
    expect(domainSync.syncAfterDecision).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(store.get(requestId)).toEqual(before);
  };
  return { svc, prisma, store, audit, domainSync, expectNoWrites };
}

const expectDomainActionRequired = (err: unknown) => {
  expect(err).toBeInstanceOf(DomainActionRequiredError);
  expect((err as DomainActionRequiredError).getStatus()).toBe(409);
  expect((err as DomainActionRequiredError).getResponse()).toMatchObject({
    code: 'DOMAIN_ACTION_REQUIRED',
    actionCode: FD,
    domainSurface: 'CLIENT_FINANCIAL_DISCLOSURE_WORKSPACE',
  });
};

type DecisionCall = (s: OfficeApprovalService, id: string, actor: string) => Promise<unknown>;
const DECISIONS: Array<[string, DecisionCall]> = [
  ['approve', (s, id, actor) => s.approve(id, actor, 'uygun')],
  ['reject', (s, id, actor) => s.reject(id, actor, 'gerekce')],
  ['requestRevision', (s, id, actor) => s.requestRevision(id, actor, 'duzeltme')],
  ['approveWithChanges', (s, id, actor) => s.approveWithChanges(id, actor, { kind: 'degisik' }, 'not')],
];

describe('1) domain-owned (FD) talep — genel kutunun DÖRT karar yolu da 409 DOMAIN_ACTION_REQUIRED', () => {
  it.each(DECISIONS)(
    '%s: FD politikasınca uygun aktör (MANAGER) → 409; kullanıcı/yetki OKUNMAZ, karar kaydı / domain senkronu / audit YOK',
    async (_name, call) => {
      const h = harness([fdPending('oar-fd')]);
      const before = { ...h.store.get('oar-fd') };
      const err = await call(h.svc, 'oar-fd', 'u-m').catch((e: unknown) => e);
      expectDomainActionRequired(err);
      expect(h.prisma.user.findUnique).not.toHaveBeenCalled();
      h.expectNoWrites('oar-fd', before);
    },
  );
});

describe('2) sıra — kapı talep okunduktan hemen sonra: durum, öz-onay, rol ve yetki denetiminden ÖNCE', () => {
  it.each([
    ['PARTNER (USER)', 'u-p'],
    ['delege (USER)', 'u-d'],
    ['yetkisiz avukat (USER)', 'u-l'],
    ['bağlı VIEWER-PARTNER', 'u-vp'],
    ['bağlı VIEWER-MANAGER', 'u-vm'],
    ['bağlı VIEWER-delege', 'u-vd'],
    ['talep sahibi (öz-onay denemesi)', REQUESTER],
  ])('requestRevision — %s → 409 DOMAIN_ACTION_REQUIRED; kullanıcı/rol/yetki OKUNMAZ, yazma YOK', async (_label, actor) => {
    const h = harness([fdPending('oar-fd')]);
    const before = { ...h.store.get('oar-fd') };
    const err = await h.svc.requestRevision('oar-fd', actor, 'duzeltme').catch((e: unknown) => e);
    expectDomainActionRequired(err);
    expect(h.prisma.user.findUnique).not.toHaveBeenCalled();
    h.expectNoWrites('oar-fd', before);
  });

  it.each(['REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'])(
    'requestRevision — FD talebi zaten %s (geçmiş kayıt): durum çatışması DEĞİL 409 DOMAIN_ACTION_REQUIRED; kayıt DEĞİŞMEZ',
    async (status) => {
      const decided = status !== 'CANCELLED';
      const h = harness([
        fdPending('oar-fd-old', {
          status,
          approverUserId: decided ? 'u-m' : null,
          decidedAt: new Date('2026-09-01T10:00:00.000Z'),
          decisionNote: decided ? 'onceki karar' : null,
        }),
      ]);
      const before = { ...h.store.get('oar-fd-old') };
      const err = await h.svc.requestRevision('oar-fd-old', 'u-m', 'duzeltme').catch((e: unknown) => e);
      expectDomainActionRequired(err);
      h.expectNoWrites('oar-fd-old', before);
    },
  );

  it('not denetimi DEĞİŞMEDİ: boş revizyon notu talep OKUNMADAN 400 (reject ile aynı sıra)', async () => {
    const h = harness([fdPending('oar-fd')]);
    const before = { ...h.store.get('oar-fd') };
    const err = await h.svc.requestRevision('oar-fd', 'u-m', '   ').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(h.prisma.officeApprovalRequest.findUnique).not.toHaveBeenCalled();
    h.expectNoWrites('oar-fd', before);
  });
});

describe('3) domain-owned OLMAYAN türler DEĞİŞMEDİ (regresyon kontrolü)', () => {
  it.each([
    ['CHANGE_STATUS', 'u-p'],
    ['CLIENT_PAYOUT_POST', 'u-m'],
    ['COLLECTION_DISPOSITION_POST', 'u-d'],
  ])('%s: uygun aktör requestRevision → REVISION_REQUESTED; karar kaydı + domain senkronu + audit birer kez', async (code, actor) => {
    const h = harness([pending('oar-x', code)]);
    const res = await h.svc.requestRevision('oar-x', actor, 'duzeltme');
    expect(res).toMatchObject({ id: 'oar-x', status: 'REVISION_REQUESTED', approverUserId: actor, decisionNote: 'duzeltme' });
    expect(h.prisma.officeApprovalRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(h.domainSync.syncAfterDecision).toHaveBeenCalledTimes(1);
    expect(h.audit.log).toHaveBeenCalledTimes(1);
    expect(h.audit.log.mock.calls[0][0]).toMatchObject({ action: 'OFFICE_APPROVAL_REVISION_REQUESTED', userId: actor });
  });

  it.each([
    ['CHANGE_STATUS', 'u-vd'],
    ['CLIENT_PAYOUT_POST', 'u-vm'],
  ])(`VIEWER ONAY KARARI SINIRI (#2606) DEĞİŞMEDİ — %s: bağlı VIEWER requestRevision → 403 ${DENIED_VIEWER}; yazma YOK`, async (code, actor) => {
    const h = harness([pending('oar-x', code)]);
    const before = { ...h.store.get('oar-x') };
    const err = await h.svc.requestRevision('oar-x', actor, 'duzeltme').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ code: DENIED_VIEWER });
    h.expectNoWrites('oar-x', before);
  });

  it('CHANGE_STATUS: yetkisiz avukat requestRevision → 403 (rütbe kuralı DEĞİŞMEDİ); yazma YOK', async () => {
    const h = harness([pending('oar-x', 'CHANGE_STATUS')]);
    const before = { ...h.store.get('oar-x') };
    const err = await h.svc.requestRevision('oar-x', 'u-l', 'duzeltme').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    h.expectNoWrites('oar-x', before);
  });
});

describe('5) FD İPTAL SINIRI — domain-owned talep genel kutudan geri ÇEKİLEMEZ; kimlik/tenant denetimi korunur', () => {
  it('talep sahibi FD talebini geri çekmek ister → 409 DOMAIN_ACTION_REQUIRED; transaction / updateMany / domain senkronu / audit YOK', async () => {
    const h = harness([fdPending('oar-fd')]);
    const before = { ...h.store.get('oar-fd') };
    const err = await h.svc.cancel('oar-fd', REQUESTER).catch((e: unknown) => e);
    expectDomainActionRequired(err);
    h.expectNoWrites('oar-fd', before);
  });

  it.each([
    ['FD politikasınca uygun MANAGER', 'u-m'],
    ['PARTNER', 'u-p'],
    ['bağlı VIEWER-PARTNER', 'u-vp'],
    ['başka tenant kullanıcısı', 'u-baska-tenant'],
  ])('talep sahibi OLMAYAN (%s) → bugünkü gibi 403; 409 DEĞİL (kimlik denetimi kapıdan ÖNCE); yazma YOK', async (_label, actor) => {
    const h = harness([fdPending('oar-fd')]);
    const before = { ...h.store.get('oar-fd') };
    const err = await h.svc.cancel('oar-fd', actor).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err).not.toBeInstanceOf(DomainActionRequiredError);
    h.expectNoWrites('oar-fd', before);
  });

  it.each(['REVISION_REQUESTED', 'CANCELLED', 'APPROVED'])(
    'FD talebi zaten %s (geçmiş kayıt): talep sahibi → 409 durum çatışması (DEĞİŞMEDİ); kayıt DEĞİŞMEZ',
    async (status) => {
      const h = harness([fdPending('oar-fd-old', { status, decidedAt: new Date('2026-09-01T10:00:00.000Z') })]);
      const before = { ...h.store.get('oar-fd-old') };
      const err = await h.svc.cancel('oar-fd-old', REQUESTER).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err).not.toBeInstanceOf(DomainActionRequiredError);
      h.expectNoWrites('oar-fd-old', before);
    },
  );

  it('bilinmeyen talep → 404 (DEĞİŞMEDİ); yazma YOK', async () => {
    const h = harness([]);
    const err = await h.svc.cancel('oar-yok', REQUESTER).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.prisma.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
    expect(h.audit.log).not.toHaveBeenCalled();
  });

  it.each(['CHANGE_STATUS', 'CLIENT_PAYOUT_POST', 'COLLECTION_DISPOSITION_POST'])(
    'FD DIŞI %s: talep sahibi geri çeker → CANCELLED; iptal + domain senkronu + audit birer kez (DEĞİŞMEDİ)',
    async (code) => {
      const h = harness([pending('oar-x', code)]);
      const res = await h.svc.cancel('oar-x', REQUESTER);
      expect(res).toMatchObject({ id: 'oar-x', status: 'CANCELLED' });
      expect(h.prisma.officeApprovalRequest.updateMany).toHaveBeenCalledTimes(1);
      expect(h.domainSync.syncAfterDecision).toHaveBeenCalledTimes(1);
      expect(h.audit.log).toHaveBeenCalledTimes(1);
      expect(h.audit.log.mock.calls[0][0]).toMatchObject({ action: 'OFFICE_APPROVAL_CANCELLED', userId: REQUESTER });
    },
  );

  it.each(['CHANGE_STATUS', 'CLIENT_PAYOUT_POST'])('FD DIŞI %s: talep sahibi olmayan → 403 (DEĞİŞMEDİ); yazma YOK', async (code) => {
    const h = harness([pending('oar-x', code)]);
    const before = { ...h.store.get('oar-x') };
    const err = await h.svc.cancel('oar-x', 'u-p').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    h.expectNoWrites('oar-x', before);
  });
});

// ── 4) Yapısal kilit: kaynak AST'si (satır numarası / düz metin eşleşmesi KULLANILMAZ) ─────────────────────────
const SERVICE_FILE = path.resolve(__dirname, '..', 'office-approval.service.ts');

type DecisionShape = { name: string; guardArg: string | null; guard: number; status: number; identity: number; commit: number };

/** `OfficeApprovalService` içinde `this.commitDecision(...)` çağıran her metodun ilk denetim çağrılarının konumu. */
function decisionMethodShapes(): DecisionShape[] {
  const src = fs.readFileSync(SERVICE_FILE, 'utf8');
  const sf = ts.createSourceFile(SERVICE_FILE, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const shapes: DecisionShape[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name?.text === 'OfficeApprovalService') {
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.body) continue;
        const calls: { callee: string; pos: number; firstArg: string | null }[] = [];
        const walk = (n: ts.Node): void => {
          if (ts.isCallExpression(n)) {
            calls.push({ callee: n.expression.getText(sf), pos: n.getStart(sf), firstArg: n.arguments[0]?.getText(sf) ?? null });
          }
          ts.forEachChild(n, walk);
        };
        walk(member.body);
        const first = (match: (callee: string) => boolean) =>
          calls.filter((c) => match(c.callee)).sort((a, b) => a.pos - b.pos)[0];
        const commit = first((c) => c === 'this.commitDecision');
        if (!commit) continue;
        const guard = first((c) => c === 'assertGenericDecisionAllowed');
        const status = first((c) => c === 'this.assertStatus');
        const identity = first((c) =>
          /^this\.(assertNotSelfApproval|assertApproveSelfApprovalPolicy|assertApproverEligibleForRequest)$/.test(c),
        );
        shapes.push({
          name: member.name.getText(sf),
          guardArg: guard?.firstArg ?? null,
          guard: guard?.pos ?? -1,
          status: status?.pos ?? -1,
          identity: identity?.pos ?? -1,
          commit: commit.pos,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return shapes;
}

describe('4) yapısal kilit — commitDecision çağıran HER genel karar metodu kapıyı İLK denetim olarak çağırır', () => {
  const shapes = decisionMethodShapes();

  it('genel karar metodu kümesi tam olarak dört metottur (yeni karar yolu = kapıyı ekle ve bu testi bilinçli güncelle)', () => {
    expect(shapes.map((s) => s.name).sort()).toEqual(['approve', 'approveWithChanges', 'reject', 'requestRevision']);
  });

  it.each(['approve', 'reject', 'requestRevision', 'approveWithChanges'])(
    "%s: assertGenericDecisionAllowed(req.actionCode) durum / öz-onay / yetki denetiminden ve commitDecision'dan ÖNCE",
    (name) => {
      const shape = shapes.find((s) => s.name === name);
      expect(shape).toBeDefined();
      const s = shape as DecisionShape;
      expect({ name, guardArg: s.guardArg, guardFound: s.guard >= 0 }).toEqual({ name, guardArg: 'req.actionCode', guardFound: true });
      expect(s.status).toBeGreaterThan(s.guard);
      expect(s.identity).toBeGreaterThan(s.guard);
      expect(s.commit).toBeGreaterThan(s.guard);
    },
  );
});

type StatusWriter = { name: string; guardArg: string | null; guard: number; firstWrite: number; requesterCheck: number };

/**
 * PUBLIC olup talep DURUMU yazan metotlar: `this.commitDecision(...)` çağıranlar + `officeApprovalRequest.updateMany`
 * `data`sında `status` yazanlar. İlk yazma = ilk `this.commitDecision` / `this.prisma.$transaction` /
 * `officeApprovalRequest.updateMany` çağrısı. `private` yardımcılar ve durum yazmayan public metotlar
 * (createPendingRequest yalnız idempotencyKey; markExecution* yalnız executionStatus) bu kümeye GİRMEZ.
 */
function statusWritingPublicMethods(): StatusWriter[] {
  const src = fs.readFileSync(SERVICE_FILE, 'utf8');
  const sf = ts.createSourceFile(SERVICE_FILE, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: StatusWriter[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name?.text === 'OfficeApprovalService') {
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.body) continue;
        if (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Private) continue;
        const seen = { writesStatus: false, writes: [] as number[], guard: -1, guardArg: null as string | null, requesterCheck: -1 };
        const walk = (n: ts.Node): void => {
          if (ts.isCallExpression(n)) {
            const callee = n.expression.getText(sf);
            const pos = n.getStart(sf);
            if (callee === 'this.commitDecision') {
              seen.writesStatus = true;
              seen.writes.push(pos);
            }
            if (callee === 'this.prisma.$transaction') seen.writes.push(pos);
            if (/officeApprovalRequest\.updateMany$/.test(callee)) {
              seen.writes.push(pos);
              const arg = n.arguments[0];
              const data =
                arg && ts.isObjectLiteralExpression(arg)
                  ? arg.properties.find(
                      (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'data',
                    )
                  : undefined;
              if (
                data &&
                ts.isObjectLiteralExpression(data.initializer) &&
                data.initializer.properties.some((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'status')
              ) {
                seen.writesStatus = true;
              }
            }
            if (callee === 'assertGenericDecisionAllowed' && seen.guard < 0) {
              seen.guard = pos;
              seen.guardArg = n.arguments[0]?.getText(sf) ?? null;
            }
          }
          if (ts.isIfStatement(n) && seen.requesterCheck < 0 && /\brequesterUserId\b/.test(n.expression.getText(sf))) {
            seen.requesterCheck = n.getStart(sf);
          }
          ts.forEachChild(n, walk);
        };
        walk(member.body);
        if (!seen.writesStatus) continue;
        out.push({
          name: member.name.getText(sf),
          guardArg: seen.guardArg,
          guard: seen.guard,
          firstWrite: Math.min(...seen.writes),
          requesterCheck: seen.requesterCheck,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe('4b) yapısal kilit — talep DURUMU yazan HER public metot kapıyı ilk yazmadan ÖNCE çağırır (FD iptal sınırı dahil)', () => {
  const writers = statusWritingPublicMethods();

  it('durum yazan public metot kümesi tam olarak beş metottur (yeni yazma yolu = kapıyı ekle ve bu testi bilinçli güncelle)', () => {
    expect(writers.map((w) => w.name).sort()).toEqual(['approve', 'approveWithChanges', 'cancel', 'reject', 'requestRevision']);
  });

  it.each(['approve', 'reject', 'requestRevision', 'approveWithChanges', 'cancel'])(
    '%s: assertGenericDecisionAllowed(req.actionCode) ilk yazmadan (commitDecision / $transaction / updateMany) ÖNCE',
    (name) => {
      const w = writers.find((x) => x.name === name);
      expect(w).toBeDefined();
      const s = w as StatusWriter;
      expect({ name, guardArg: s.guardArg, guardFound: s.guard >= 0 }).toEqual({ name, guardArg: 'req.actionCode', guardFound: true });
      expect(s.firstWrite).toBeGreaterThan(s.guard);
    },
  );

  it('cancel: talep SAHİBİ denetimi kapıdan ÖNCE (kimlik/tenant sonucu korunur: talep sahibi olmayan 403, 409 değil)', () => {
    const w = writers.find((x) => x.name === 'cancel') as StatusWriter;
    expect(w.requesterCheck).toBeGreaterThanOrEqual(0);
    expect(w.guard).toBeGreaterThan(w.requesterCheck);
  });
});
