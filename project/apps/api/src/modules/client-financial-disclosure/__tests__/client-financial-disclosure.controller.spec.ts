/** @jest-environment node */
import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { validate } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG,
  CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG,
} from '../client-financial-disclosure-activation';
import { ClientFinancialDisclosureController } from '../client-financial-disclosure.controller';
import { RequestDisclosureContentApprovalDto } from '../dto/client-financial-disclosure.dto';

const TENANT_ID = 'tenant-1';
const ACTOR_ID = 'user-1';
const VERSION_ID = 'version-1';

function buildController() {
  const approval = {
    requestOfficeApproval: jest.fn().mockResolvedValue({ status: 'OFFICE_APPROVAL_PENDING' }),
    completeOfficeApproval: jest.fn().mockResolvedValue({ status: 'OFFICE_APPROVED' }),
    requestContentApproval: jest.fn().mockResolvedValue({ status: 'CONTENT_APPROVAL_PENDING' }),
    completeContentApproval: jest.fn().mockResolvedValue({ status: 'CONTENT_APPROVED' }),
  };
  const publication = {
    beginSend: jest.fn().mockResolvedValue({ status: 'SEND_PENDING' }),
    dispatchAndPublish: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
    retrySend: jest.fn().mockResolvedValue({ status: 'SEND_PENDING' }),
    reversePublishedVersion: jest.fn().mockResolvedValue({ status: 'REVERSED' }),
    supersedePublishedVersion: jest.fn().mockResolvedValue({ status: 'SUPERSEDED' }),
  };
  const office = {
    getList: jest.fn().mockResolvedValue({ surface: 'OFFICE_LIST', items: [] }),
    getPreparationSources: jest
      .fn()
      .mockResolvedValue({ surface: 'OFFICE_PREPARATION_SOURCES', items: [] }),
    getDetail: jest.fn().mockResolvedValue({ versionId: VERSION_ID }),
    getHistory: jest.fn().mockResolvedValue({ surface: 'OFFICE_HISTORY', items: [] }),
    getTimeline: jest.fn().mockResolvedValue({ surface: 'OFFICE_TIMELINE', events: [] }),
  };
  return {
    controller: new ClientFinancialDisclosureController(
      approval as any,
      publication as any,
      office as any,
    ),
    approval,
    publication,
    office,
  };
}

const originalWrite = process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
const originalPublication = process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG];

describe('CODEX-CLIENT-X2-B05 — Financial Disclosure HTTP adapter', () => {
  beforeEach(() => {
    process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = 'true';
    process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG] = 'true';
  });

  afterAll(() => {
    if (originalWrite === undefined) delete process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];
    else process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG] = originalWrite;
    if (originalPublication === undefined) {
      delete process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG];
    } else {
      process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG] = originalPublication;
    }
  });

  it('dedicated route class-level JwtAuthGuard ile korunur', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ClientFinancialDisclosureController)).toBe(
      'client-financial-disclosures',
    );
    const guards = Reflect.getMetadata('__guards__', ClientFinancialDisclosureController) || [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('office GET adapterleri JWT tenant/actor ve object selector bağlamını curated servise taşır', async () => {
    const { controller, office } = buildController();

    await controller.getOfficeList(TENANT_ID, ACTOR_ID, 'client-1', { caseId: 'case-1' });
    await controller.getOfficePreparationSources(TENANT_ID, ACTOR_ID, 'client-1', {
      caseId: 'case-1',
    });
    await controller.getOfficeDetail(TENANT_ID, ACTOR_ID, 'client-1', VERSION_ID);
    await controller.getOfficeHistory(TENANT_ID, ACTOR_ID, 'client-1', 'disclosure-1', {
      caseId: 'case-1',
    });
    await controller.getOfficeTimeline(TENANT_ID, ACTOR_ID, 'client-1', VERSION_ID);

    const scope = {
      tenantId: TENANT_ID,
      actorUserId: ACTOR_ID,
      clientId: 'client-1',
    };
    expect(office.getList).toHaveBeenCalledWith({ ...scope, caseId: 'case-1' });
    expect(office.getPreparationSources).toHaveBeenCalledWith({ ...scope, caseId: 'case-1' });
    expect(office.getDetail).toHaveBeenCalledWith(scope, VERSION_ID);
    expect(office.getHistory).toHaveBeenCalledWith(
      { ...scope, caseId: 'case-1' },
      'disclosure-1',
    );
    expect(office.getTimeline).toHaveBeenCalledWith(scope, VERSION_ID);
  });

  it('approval actionları JWT tenant/actor bağlamını mevcut servise aynen taşır', async () => {
    const { controller, approval } = buildController();

    await controller.requestOfficeApproval(TENANT_ID, ACTOR_ID, VERSION_ID);
    await controller.completeOfficeApproval(TENANT_ID, ACTOR_ID, VERSION_ID, {
      approvalRequestId: 'approval-1',
    });
    await controller.requestContentApproval(TENANT_ID, ACTOR_ID, VERSION_ID, {
      approvedRecipientEmail: 'client@example.test',
      approvedRecipientPortalUserId: 'portal-1',
    });
    await controller.completeContentApproval(TENANT_ID, ACTOR_ID, VERSION_ID);

    expect(approval.requestOfficeApproval).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      disclosureVersionId: VERSION_ID,
      requesterUserId: ACTOR_ID,
    });
    expect(approval.completeOfficeApproval).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      disclosureVersionId: VERSION_ID,
      approvalRequestId: 'approval-1',
      approverUserId: ACTOR_ID,
    });
    expect(approval.requestContentApproval).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      disclosureVersionId: VERSION_ID,
      requesterUserId: ACTOR_ID,
      approvedRecipientEmail: 'client@example.test',
      approvedRecipientPortalUserId: 'portal-1',
    });
    expect(approval.completeContentApproval).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      disclosureVersionId: VERSION_ID,
      contentApproverUserId: ACTOR_ID,
    });
  });

  it('publish kalıcı beginSend tamamlanmadan dispatchAndPublish çağırmaz', async () => {
    const { controller, publication } = buildController();
    publication.beginSend.mockRejectedValueOnce(new Error('stale snapshot'));

    await expect(
      controller.publish(TENANT_ID, ACTOR_ID, VERSION_ID),
    ).rejects.toThrow('stale snapshot');
    expect(publication.dispatchAndPublish).not.toHaveBeenCalled();
  });

  it('publish mevcut beginSend -> dispatchAndPublish sırasını ve aynı scope bağını korur', async () => {
    const { controller, publication } = buildController();
    const result = await controller.publish(TENANT_ID, ACTOR_ID, VERSION_ID);

    const scope = {
      tenantId: TENANT_ID,
      disclosureVersionId: VERSION_ID,
      actorUserId: ACTOR_ID,
    };
    expect(publication.beginSend).toHaveBeenCalledWith(scope);
    expect(publication.dispatchAndPublish).toHaveBeenCalledWith(scope);
    expect(publication.beginSend.mock.invocationCallOrder[0]).toBeLessThan(
      publication.dispatchAndPublish.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({ status: 'PUBLISHED' });
  });

  it('retry-publication yalnız retrySend sonrası aynı guarded dispatch yoluna gider', async () => {
    const { controller, publication } = buildController();
    await controller.retryPublication(TENANT_ID, ACTOR_ID, VERSION_ID);

    const scope = {
      tenantId: TENANT_ID,
      disclosureVersionId: VERSION_ID,
      actorUserId: ACTOR_ID,
    };
    expect(publication.retrySend).toHaveBeenCalledWith(scope);
    expect(publication.dispatchAndPublish).toHaveBeenCalledWith(scope);
    expect(publication.retrySend.mock.invocationCallOrder[0]).toBeLessThan(
      publication.dispatchAndPublish.mock.invocationCallOrder[0],
    );
  });

  it('reverse ve supersede mevcut publication servislerine ince adapter olarak bağlanır', async () => {
    const { controller, publication } = buildController();
    await controller.reverse(TENANT_ID, ACTOR_ID, VERSION_ID, {
      correctionReason: 'Corrected statement',
    });
    await controller.supersede(TENANT_ID, ACTOR_ID, VERSION_ID, {
      supersedingVersionId: 'version-2',
      correctionReason: 'Replacement statement',
    });

    expect(publication.reversePublishedVersion).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      disclosureVersionId: VERSION_ID,
      actorUserId: ACTOR_ID,
      correctionReason: 'Corrected statement',
    });
    expect(publication.supersedePublishedVersion).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      supersededVersionId: VERSION_ID,
      supersedingVersionId: 'version-2',
      actorUserId: ACTOR_ID,
      correctionReason: 'Replacement statement',
    });
  });

  it('WRITE kapalıyken varlık/tenant lookup öncesi approval fail-closed olur', () => {
    const { controller, approval, publication } = buildController();
    delete process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];

    let caught: unknown;
    try {
      controller.requestOfficeApproval('secret-tenant', ACTOR_ID, 'secret-version');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    const response = (caught as ForbiddenException).getResponse();
    expect(response).toMatchObject({ code: 'DISCLOSURE_WRITE_NOT_ENABLED' });
    expect(JSON.stringify(response)).not.toContain('secret-tenant');
    expect(JSON.stringify(response)).not.toContain('secret-version');
    expect(approval.requestOfficeApproval).not.toHaveBeenCalled();
    expect(publication.beginSend).not.toHaveBeenCalled();
  });

  it('PUBLICATION kapalıyken begin/dispatch/retry/reverse/supersede servisleri erişilemez', async () => {
    const { controller, publication } = buildController();
    delete process.env[CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_FLAG];

    const publicationDisabled = { response: { code: 'DISCLOSURE_PUBLICATION_NOT_ENABLED' } };
    await expect(controller.publish(TENANT_ID, ACTOR_ID, VERSION_ID)).rejects.toMatchObject(
      publicationDisabled,
    );
    await expect(
      controller.retryPublication(TENANT_ID, ACTOR_ID, VERSION_ID),
    ).rejects.toMatchObject(publicationDisabled);
    expect(() => controller.reverse(TENANT_ID, ACTOR_ID, VERSION_ID, {
      correctionReason: 'Correction',
    })).toThrow(ForbiddenException);
    expect(() => controller.supersede(TENANT_ID, ACTOR_ID, VERSION_ID, {
      supersedingVersionId: 'version-2',
      correctionReason: 'Replacement',
    })).toThrow(ForbiddenException);
    expect(publication.beginSend).not.toHaveBeenCalled();
    expect(publication.dispatchAndPublish).not.toHaveBeenCalled();
    expect(publication.retrySend).not.toHaveBeenCalled();
    expect(publication.reversePublishedVersion).not.toHaveBeenCalled();
    expect(publication.supersedePublishedVersion).not.toHaveBeenCalled();
  });

  it('PUBLICATION açık görünse bile WRITE kapalıysa doğrudan gönderim bypass edilemez', async () => {
    const { controller, publication } = buildController();
    delete process.env[CLIENT_FINANCIAL_DISCLOSURE_WRITE_FLAG];

    await expect(
      controller.publish(TENANT_ID, ACTOR_ID, VERSION_ID),
    ).rejects.toMatchObject({ response: { code: 'DISCLOSURE_WRITE_NOT_ENABLED' } });
    expect(publication.beginSend).not.toHaveBeenCalled();
    expect(publication.dispatchAndPublish).not.toHaveBeenCalled();
  });

  it('DTO validation serbest içerik/konu yüzeyi olmadan geçersiz e-postayı reddeder', async () => {
    const content = new RequestDisclosureContentApprovalDto();
    content.approvedRecipientEmail = 'not-an-email';

    expect((await validate(content)).map((error) => error.property)).toEqual([
      'approvedRecipientEmail',
    ]);
  });
});
