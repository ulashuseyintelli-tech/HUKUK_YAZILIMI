import { ForbiddenException } from '@nestjs/common';
import { CLIENT_MUTATION_REASON } from '../client/client-mutation-policy';
import { ClientIntakeLinkController } from './client-intake-link.controller';

const TENANT = 'tenant-1';
const CLIENT = 'client-1';
const CASE = 'case-1';
const USER = 'user-1';

const requestOf = (role?: string) =>
  ({ user: { id: USER, tenantId: TENANT, role } }) as any;

describe('ClientIntakeLinkController — X3-B02 C2-R5 authority wiring', () => {
  const dto = { clientId: CLIENT, scope: ['ADDRESS'] } as any;
  let service: {
    create: jest.Mock;
    revoke: jest.Mock;
    findOne: jest.Mock;
    listByCase: jest.Mock;
  };
  let officeApproval: { isApproverEligible: jest.Mock };
  let audit: { log: jest.Mock };
  let controller: ClientIntakeLinkController;

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue({
        link: { id: 'link-1', status: 'ACTIVE' },
        rawToken: 'secret-token',
        intakeUrl: 'https://example.test/intake/secret-token',
      }),
      revoke: jest.fn().mockResolvedValue({ id: 'link-1', status: 'REVOKED' }),
      findOne: jest.fn().mockResolvedValue({
        id: 'link-1',
        tenantId: TENANT,
        clientId: CLIENT,
        status: 'ACTIVE',
      }),
      listByCase: jest.fn(),
    };
    officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(false) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    controller = new ClientIntakeLinkController(
      service as any,
      officeApproval as any,
      audit as any,
    );
  });

  it('USER + elevated=false create komutunu reddeder; link/dispatch yolu hiç çalışmaz', async () => {
    await expect(controller.create(requestOf('USER'), CASE, dto)).rejects.toMatchObject({
      response: { reasonCode: CLIENT_MUTATION_REASON.WORKSPACE_COMMAND_DENIED },
    });

    expect(service.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('VIEWER create komutunu coarse gate üzerinde reddeder; eligibility sorgulanmaz', async () => {
    await expect(controller.create(requestOf('VIEWER'), CASE, dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('ADMIN create komutunu C2-R5 ile çalıştırır; secret audit metadata içine girmez', async () => {
    const result = await controller.create(requestOf('ADMIN'), CASE, dto);

    expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
    expect(service.create).toHaveBeenCalledWith(TENANT, CASE, USER, dto);
    expect(result).toMatchObject({ link: { id: 'link-1', status: 'ACTIVE' } });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        userId: USER,
        action: 'CLIENT_WORKSPACE_COMMAND',
        entityType: 'Client',
        entityId: CLIENT,
        metadata: {
          commandType: 'INTAKE_LINK_CREATE',
          actorRole: 'ADMIN',
          status: 'ACTIVE',
        },
      }),
    );
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('secret-token');
  });

  it('USER + elevated=false revoke komutunda yalnız tenant-bound read yapar; mutation yoktur', async () => {
    await expect(controller.revoke(requestOf('USER'), 'link-1')).rejects.toMatchObject({
      response: { reasonCode: CLIENT_MUTATION_REASON.WORKSPACE_COMMAND_DENIED },
    });

    expect(service.findOne).toHaveBeenCalledWith(TENANT, 'link-1');
    expect(service.revoke).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('canonical elevated USER revoke komutunu çalıştırır ve C2-R5 audit üretir', async () => {
    officeApproval.isApproverEligible.mockResolvedValue(true);

    const result = await controller.revoke(requestOf('USER'), 'link-1');

    expect(officeApproval.isApproverEligible).toHaveBeenCalledWith(USER, TENANT);
    expect(service.revoke).toHaveBeenCalledWith(TENANT, 'link-1', USER);
    expect(result).toEqual({ id: 'link-1', status: 'REVOKED' });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        userId: USER,
        action: 'CLIENT_WORKSPACE_COMMAND',
        entityType: 'Client',
        entityId: CLIENT,
        metadata: {
          commandType: 'INTAKE_LINK_REVOKE',
          actorRole: 'USER',
          status: 'REVOKED',
        },
      }),
    );
  });

  it('tanımsız rol fail-closed reddedilir; eligibility ve mutasyon çalışmaz', async () => {
    await expect(controller.create(requestOf(undefined), CASE, dto)).rejects.toMatchObject({
      response: { reasonCode: CLIENT_MUTATION_REASON.UNKNOWN_ROLE },
    });

    expect(officeApproval.isApproverEligible).not.toHaveBeenCalled();
    expect(service.create).not.toHaveBeenCalled();
  });
});
