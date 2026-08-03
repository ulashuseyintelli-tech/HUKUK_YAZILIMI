import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PermissionGrantEffect, PermissionGrantScope } from '@prisma/client';
import { CLIENT_MUTATION_REASON } from '../client/client-mutation-policy';
import { ClientIntakePromotionService } from '../client-intake-promotion/client-intake-promotion.service';
import { ClientIntakeReviewController } from './client-intake-review.controller';
import {
  CLIENT_INTAKE_REVIEW_PERMISSION_KEY,
  ClientIntakeReviewAuthorizationService,
} from './client-intake-review-authorization.service';
import { ClientIntakeReviewService } from './client-intake-review.service';

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const USER = 'user-1';
const CLIENT = 'client-1';
const SUBMISSION = 'submission-1';
const FIELD = 'field-1';

const requestOf = (role = 'USER', tenantId = TENANT) =>
  ({ user: { id: USER, tenantId, role } }) as any;

const activeUser = () => ({
  tenantId: TENANT,
  isActive: true,
  lawyer: { tenantId: TENANT, isActive: true },
  staffMember: null,
});

const grant = (overrides: Record<string, unknown> = {}) => ({
  tenantId: TENANT,
  subjectUserId: USER,
  permissionKey: CLIENT_INTAKE_REVIEW_PERMISSION_KEY,
  effect: PermissionGrantEffect.ALLOW,
  scope: PermissionGrantScope.GLOBAL,
  validFrom: new Date('2026-01-01T00:00:00.000Z'),
  validUntil: null,
  ...overrides,
});

describe('ClientIntakeReviewAuthorizationService — X3-B04 PermissionGrant mapping', () => {
  let prisma: {
    user: { findUnique: jest.Mock };
    permissionGrant: { findMany: jest.Mock };
  };
  let authorization: ClientIntakeReviewAuthorizationService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(activeUser()) },
      permissionGrant: { findMany: jest.fn().mockResolvedValue([grant()]) },
    };
    authorization = new ClientIntakeReviewAuthorizationService(prisma as any);
  });

  it('active tenant actor + exact GLOBAL ALLOW için authorized=true döner', async () => {
    await expect(authorization.isAuthorized(USER, TENANT)).resolves.toBe(true);

    expect(prisma.permissionGrant.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        subjectUserId: USER,
        permissionKey: CLIENT_INTAKE_REVIEW_PERMISSION_KEY,
        scope: PermissionGrantScope.GLOBAL,
        validFrom: { lte: expect.any(Date) },
        OR: [{ validUntil: null }, { validUntil: { gt: expect.any(Date) } }],
      },
      select: {
        tenantId: true,
        subjectUserId: true,
        permissionKey: true,
        effect: true,
        scope: true,
        validFrom: true,
        validUntil: true,
      },
    });
  });

  it('explicit DENY, ALLOW ile birlikte olsa bile önceliklidir', async () => {
    prisma.permissionGrant.findMany.mockResolvedValue([
      grant(),
      grant({ effect: PermissionGrantEffect.DENY }),
    ]);

    await expect(authorization.isAuthorized(USER, TENANT)).resolves.toBe(false);
  });

  it.each([
    ['grant yok', []],
    ['yanlış key', [grant({ permissionKey: 'client.intake.other' })]],
    ['TEAM scope', [grant({ scope: PermissionGrantScope.TEAM })]],
    ['süresi geçmiş', [grant({ validUntil: new Date('2020-01-01T00:00:00.000Z') })]],
  ])('%s için fail-closed false döner', async (_label, grants) => {
    prisma.permissionGrant.findMany.mockResolvedValue(grants);
    await expect(authorization.isAuthorized(USER, TENANT)).resolves.toBe(false);
  });

  it('cross-tenant/inactive aktörde grant sorgulamadan fail-closed kalır', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...activeUser(), tenantId: OTHER_TENANT });

    await expect(authorization.isAuthorized(USER, TENANT)).resolves.toBe(false);
    expect(prisma.permissionGrant.findMany).not.toHaveBeenCalled();
  });

  it('review grant promotion eligibility yerine geçmez', async () => {
    await expect(authorization.isAuthorized(USER, TENANT)).resolves.toBe(true);

    const promotionPrisma = {
      clientIntakeSubmission: {
        findFirst: jest.fn().mockResolvedValue({
          id: SUBMISSION,
          status: 'IN_REVIEW',
          caseId: 'case-1',
        }),
      },
      clientIntakeField: { findMany: jest.fn(), update: jest.fn() },
      clientIntelStatement: { create: jest.fn() },
    };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(false) };
    const promotion = new ClientIntakePromotionService(
      promotionPrisma as any,
      { log: jest.fn(), logInTransaction: jest.fn() } as any,
      officeApproval as any,
      { assertActiveByCaseDebtorId: jest.fn() } as any,
    );

    await expect(
      promotion.promote(TENANT, SUBMISSION, USER, 'debtor-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(officeApproval.isApproverEligible).toHaveBeenCalledWith(USER, TENANT);
    expect(promotionPrisma.clientIntelStatement.create).not.toHaveBeenCalled();
    expect(promotionPrisma.clientIntakeField.update).not.toHaveBeenCalled();
  });
});

describe('ClientIntakeReviewController — X3-B04 frozen primitive wiring', () => {
  let service: {
    listQueue: jest.Mock;
    getOne: jest.Mock;
    getCommandTargetBySubmission: jest.Mock;
    getCommandTargetByField: jest.Mock;
    claim: jest.Mock;
    rejectSubmission: jest.Mock;
    bulkReviewFields: jest.Mock;
    reviewField: jest.Mock;
  };
  let reviewAuthorization: { isAuthorized: jest.Mock };
  let audit: { log: jest.Mock };
  let controller: ClientIntakeReviewController;

  beforeEach(() => {
    service = {
      listQueue: jest.fn(),
      getOne: jest.fn(),
      getCommandTargetBySubmission: jest
        .fn()
        .mockResolvedValue({ submissionId: SUBMISSION, clientId: CLIENT }),
      getCommandTargetByField: jest
        .fn()
        .mockResolvedValue({ submissionId: SUBMISSION, clientId: CLIENT }),
      claim: jest.fn().mockResolvedValue({ id: SUBMISSION, status: 'IN_REVIEW' }),
      rejectSubmission: jest.fn().mockResolvedValue({ id: SUBMISSION, status: 'REJECTED' }),
      bulkReviewFields: jest.fn().mockResolvedValue({ id: SUBMISSION, status: 'IN_REVIEW' }),
      reviewField: jest.fn().mockResolvedValue({ id: SUBMISSION, status: 'IN_REVIEW' }),
    };
    reviewAuthorization = { isAuthorized: jest.fn().mockResolvedValue(true) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    controller = new ClientIntakeReviewController(
      service as any,
      reviewAuthorization as any,
      audit as any,
    );
  });

  it('ADMIN dahil review grant taşımayan tenant user claim mutation üretemez', async () => {
    reviewAuthorization.isAuthorized.mockResolvedValue(false);

    await expect(controller.claim(requestOf('ADMIN'), SUBMISSION)).rejects.toMatchObject({
      response: { reasonCode: CLIENT_MUTATION_REASON.INTAKE_REVIEW_DENIED },
    });
    expect(service.getCommandTargetBySubmission).toHaveBeenCalledWith(TENANT, SUBMISSION);
    expect(service.claim).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('authorized reviewer claim çalıştırır ve ayrı review audit üretir', async () => {
    await controller.claim(requestOf(), SUBMISSION);

    expect(reviewAuthorization.isAuthorized).toHaveBeenCalledWith(USER, TENANT);
    expect(service.claim).toHaveBeenCalledWith(TENANT, SUBMISSION, USER);
    expect(audit.log).toHaveBeenCalledWith({
      tenantId: TENANT,
      userId: USER,
      action: 'CLIENT_INTAKE_REVIEW_COMMAND',
      entityType: 'Client',
      entityId: CLIENT,
      metadata: {
        commandType: 'INTAKE_REVIEW_CLAIM',
        actorRole: 'USER',
        status: 'IN_REVIEW',
      },
    });
  });

  it('reject mutation frozen SUBMISSION_REJECT komutuna bağlanır', async () => {
    await controller.reject(requestOf(), SUBMISSION, { note: 'eksik' });

    expect(service.rejectSubmission).toHaveBeenCalledWith(
      TENANT,
      SUBMISSION,
      USER,
      'eksik',
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLIENT_INTAKE_REVIEW_COMMAND',
        metadata: expect.objectContaining({
          commandType: 'INTAKE_REVIEW_SUBMISSION_REJECT',
        }),
      }),
    );
  });

  it('bulk review mutation frozen FIELD_DECIDE komutuna bağlanır', async () => {
    const dto = { fieldIds: ['field-1', 'field-2'], decision: 'APPROVE', note: 'uygun' } as any;
    await controller.bulkReview(requestOf(), SUBMISSION, dto);

    expect(service.bulkReviewFields).toHaveBeenCalledWith(
      TENANT,
      SUBMISSION,
      USER,
      dto.fieldIds,
      dto.decision,
      dto.note,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ commandType: 'INTAKE_REVIEW_FIELD_DECIDE' }),
      }),
    );
  });

  it('single field review trusted field target + FIELD_DECIDE komutunu kullanır', async () => {
    const dto = { decision: 'REJECT', note: 'uyuşmuyor' } as any;
    await controller.reviewField(requestOf(), FIELD, dto);

    expect(service.getCommandTargetByField).toHaveBeenCalledWith(TENANT, FIELD);
    expect(service.reviewField).toHaveBeenCalledWith(
      TENANT,
      FIELD,
      USER,
      dto.decision,
      dto.note,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ commandType: 'INTAKE_REVIEW_FIELD_DECIDE' }),
      }),
    );
  });

  it('cross-tenant hedef tenant-bound read aşamasında durur; authority/mutation/audit yoktur', async () => {
    service.getCommandTargetBySubmission.mockRejectedValue(
      new NotFoundException('Gönderim bulunamadı'),
    );

    await expect(
      controller.claim(requestOf('USER', OTHER_TENANT), SUBMISSION),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(service.getCommandTargetBySubmission).toHaveBeenCalledWith(
      OTHER_TENANT,
      SUBMISSION,
    );
    expect(reviewAuthorization.isAuthorized).not.toHaveBeenCalled();
    expect(service.claim).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('ClientIntakeReviewService — trusted command target projection', () => {
  it('submission hedefini yalnız trusted tenant ile ve PII olmadan çözer', async () => {
    const prisma = {
      clientIntakeSubmission: {
        findFirst: jest.fn().mockResolvedValue({ id: SUBMISSION, clientId: CLIENT }),
      },
    };
    const service = new ClientIntakeReviewService(prisma as any);

    await expect(
      service.getCommandTargetBySubmission(TENANT, SUBMISSION),
    ).resolves.toEqual({ submissionId: SUBMISSION, clientId: CLIENT });
    expect(prisma.clientIntakeSubmission.findFirst).toHaveBeenCalledWith({
      where: { id: SUBMISSION, tenantId: TENANT },
      select: { id: true, clientId: true },
    });
  });

  it('field hedefini submission tenant zincirinden çözer; mismatch NotFound olur', async () => {
    const prisma = { clientIntakeField: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new ClientIntakeReviewService(prisma as any);

    await expect(service.getCommandTargetByField(TENANT, FIELD)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.clientIntakeField.findFirst).toHaveBeenCalledWith({
      where: { id: FIELD, submission: { tenantId: TENANT } },
      select: { submission: { select: { id: true, clientId: true } } },
    });
  });
});
