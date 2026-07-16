import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ActionCode } from '../../policy-engine/types/action-code.enum';
import { GuidedOpenDecision } from '../../policy-engine/types/effective-permission.types';
import {
  RECEIPT_AUTHORIZATION_SURFACES,
  ReceiptObjectScopeAuthorizationService,
} from '../receipt-object-scope-authorization.service';

const issuedToken = {
  token: 'go.confirm.v1.payload.signature',
  expiresAt: '2030-01-01T00:00:00.000Z',
  bindingHash: 'binding-hash',
  nonce: 'nonce-1',
  auditRef: 'nonce-1',
};

function make(options: {
  member?: boolean;
  actorTenantId?: string;
  actorActive?: boolean;
  profile?: 'LAWYER' | 'STAFF' | 'INVALID';
  secret?: boolean;
  consume?: { ok: boolean; result: string };
  caseFound?: boolean;
} = {}) {
  const profile = options.profile ?? 'LAWYER';
  const prisma = {
    case: {
      findFirst: jest.fn().mockResolvedValue(options.caseFound === false ? null : { id: 'case-1' }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        tenantId: options.actorTenantId ?? 'tenant-1',
        isActive: options.actorActive ?? true,
        lawyer:
          profile === 'LAWYER' || profile === 'INVALID'
            ? { id: 'lawyer-1', tenantId: 'tenant-1', isActive: true }
            : null,
        staffMember:
          profile === 'STAFF' || profile === 'INVALID'
            ? { id: 'staff-1', tenantId: 'tenant-1', isActive: true }
            : null,
      }),
    },
    caseLawyer: {
      findFirst: jest.fn().mockResolvedValue(options.member === false ? null : { id: 'cl-1' }),
    },
    caseStaff: {
      findFirst: jest.fn().mockResolvedValue(options.member === false ? null : { id: 'cs-1' }),
    },
    bankTransaction: {
      findFirst: jest.fn().mockResolvedValue({ matchedCaseId: null }),
    },
    externalCase: {
      findFirst: jest.fn().mockResolvedValue({
        caseDebtor: { case: { id: 'case-1', tenantId: 'tenant-1' } },
      }),
    },
  };
  const tokens = {
    isSecretConfigured: jest.fn().mockReturnValue(options.secret ?? true),
    issue: jest.fn().mockResolvedValue(issuedToken),
    consume: jest.fn().mockResolvedValue(
      options.consume ?? { ok: true, result: 'CONSUMED' },
    ),
  };
  return {
    service: new ReceiptObjectScopeAuthorizationService(prisma as any, tokens as any),
    prisma,
    tokens,
  };
}

const baseInput = {
  tenantId: 'tenant-1',
  actorUserId: 'user-1',
  caseId: 'case-1',
  surface: RECEIPT_AUTHORIZATION_SURFACES.COLLECTIONS,
  payload: { caseId: 'case-1', amount: 100, idempotencyKey: 'idem-1' },
} as const;

describe('RCV-P2-WS03-P03 ReceiptObjectScopeAuthorizationService', () => {
  it('allows an active tenant-scoped HUMAN who is a case member', async () => {
    const { service, tokens } = make();

    await expect(service.authorize(baseInput)).resolves.toEqual({ kind: 'ALLOW' });
    expect(tokens.issue).not.toHaveBeenCalled();
    expect(tokens.consume).not.toHaveBeenCalled();
  });

  it('uses current L2 semantics: a non-member receives CONFIRM_REQUIRED without a manager/global shortcut', async () => {
    const { service, tokens } = make({ member: false });

    const result = await service.authorize(baseInput);

    expect(result.kind).toBe('ENVELOPE');
    if (result.kind !== 'ENVELOPE') throw new Error('envelope expected');
    expect(result.envelope).toMatchObject({
      axis: 'GUIDED_OPEN_PERMISSION',
      outcome: GuidedOpenDecision.CONFIRM_REQUIRED,
      actionCode: ActionCode.RECORD_COLLECTION,
      target: { resourceType: 'CASE', caseId: 'case-1' },
      reasonCode: 'L2_SENSITIVE_NON_MEMBER',
    });
    expect(tokens.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        actionCode: ActionCode.RECORD_COLLECTION,
        surface: RECEIPT_AUTHORIZATION_SURFACES.COLLECTIONS,
        targetRef: 'case-1',
        payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
      expect.any(Object),
    );
  });

  it('accepts a consumed confirmation token bound to actor/tenant/action/surface/case/payload', async () => {
    const { service, tokens } = make({ member: false });

    await expect(
      service.authorize({ ...baseInput, confirmationToken: 'token-1' }),
    ).resolves.toEqual({ kind: 'ALLOW' });
    expect(tokens.consume).toHaveBeenCalledWith(
      'token-1',
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        actionCode: ActionCode.RECORD_COLLECTION,
        surface: RECEIPT_AUTHORIZATION_SURFACES.COLLECTIONS,
        targetRef: 'case-1',
        payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it.each(['FORGED', 'EXPIRED', 'MISMATCH', 'REPLAY'])(
    'fails closed for a %s confirmation token',
    async (result) => {
      const { service, tokens } = make({
        member: false,
        consume: { ok: false, result },
      });

      await expect(
        service.authorize({ ...baseInput, confirmationToken: 'bad-token' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tokens.issue).not.toHaveBeenCalled();
    },
  );

  it('fails closed when confirmation infrastructure is unavailable', async () => {
    const { service } = make({ member: false, secret: false });
    await expect(service.authorize(baseInput)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it.each([
    [{ actorTenantId: 'tenant-2' }, ForbiddenException],
    [{ actorActive: false }, ForbiddenException],
    [{ profile: 'INVALID' as const }, ForbiddenException],
    [{ caseFound: false }, NotFoundException],
  ])('fails closed for invalid actor/case resolution', async (options, exception) => {
    const { service, tokens } = make(options);
    await expect(service.authorize(baseInput)).rejects.toBeInstanceOf(exception);
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('resolves a bank transaction and requested case within the same tenant', async () => {
    const { service, prisma } = make();
    await expect(
      service.resolveBankCaseId({
        tenantId: 'tenant-1',
        transactionId: 'bank-1',
        requestedCaseId: 'case-1',
      }),
    ).resolves.toBe('case-1');
    expect(prisma.bankTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'bank-1', tenantId: 'tenant-1' } }),
    );
  });

  it('rejects a bank transaction already bound to another case', async () => {
    const { service, prisma } = make();
    prisma.bankTransaction.findFirst.mockResolvedValue({ matchedCaseId: 'case-2' });
    await expect(
      service.resolveBankCaseId({
        tenantId: 'tenant-1',
        transactionId: 'bank-1',
        requestedCaseId: 'case-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('resolves external-case receipt target through tenant-scoped case ownership', async () => {
    const { service, prisma } = make();
    await expect(
      service.resolveExternalCaseId({ tenantId: 'tenant-1', externalCaseId: 'external-1' }),
    ).resolves.toBe('case-1');
    expect(prisma.externalCase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'external-1', tenantId: 'tenant-1' } }),
    );
  });
});
