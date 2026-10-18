import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { StaffController } from '../staff.controller';
import { StaffService } from '../staff.service';

/** Controller response semantics only; existing guard/DTO/lifecycle suites cover those separate contracts. */
describe('Staff HTTP errors cannot resolve as successful mutations', () => {
  let app: INestApplication;
  const service = { create: jest.fn(), update: jest.fn(), remove: jest.fn(), updateOrder: jest.fn(), findOne: jest.fn() };
  const routes = [
    { method: 'post', path: '/staff', service: 'create', status: 201 },
    { method: 'put', path: '/staff/id', service: 'update', status: 200 },
    { method: 'delete', path: '/staff/id', service: 'remove', status: 200 },
    { method: 'put', path: '/staff/order/update', service: 'updateOrder', status: 200 },
  ] as const;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StaffController],
      providers: [
        { provide: StaffService, useValue: service },
        { provide: OfficeApprovalService, useValue: {} },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => {
      context.switchToHttp().getRequest().user = { id: 'actor', tenantId: 'tenant', role: 'ADMIN' };
      return true;
    } }).overrideGuard(OfficeF01AuthorizationGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => jest.resetAllMocks());

  it.each(routes)('$service preserves its normal success response', async route => {
    service[route.service].mockResolvedValue({ id: 'id' });
    const response = await request(app.getHttpServer())[route.method](route.path).send({ staffIds: ['id'] }).expect(route.status);
    expect(response.body).toEqual(route.service === 'create' || route.service === 'update' ? { data: { id: 'id' } } : { success: true });
    expect(service[route.service]).toHaveBeenCalledTimes(1);
  });

  it.each(routes)('$service preserves structured business failures as 409', async route => {
    const body = { code: 'BUSINESS_CONFLICT', message: 'No mutation', candidates: [{ id: 'candidate' }] };
    service[route.service].mockRejectedValue(new ConflictException(body));
    const response = await request(app.getHttpServer())[route.method](route.path).send({ staffIds: ['id'] }).expect(409);
    expect(response.body).toEqual(body);
    expect(response.body.success).toBeUndefined();
  });

  it.each(routes)('$service returns 500 for an unexpected error without exposing internal details', async route => {
    service[route.service].mockRejectedValue(new Error('private database connection detail'));
    const response = await request(app.getHttpServer())[route.method](route.path).send({ staffIds: ['id'] }).expect(500);
    expect(response.body.message).toBe('Internal server error');
    expect(JSON.stringify(response.body)).not.toContain('private database');
    expect(response.body.success).toBeUndefined();
  });

  it('missing/cross-tenant detail is 404 rather than HTTP 200 error', async () => {
    service.findOne.mockResolvedValue(null);
    const response = await request(app.getHttpServer()).get('/staff/missing').expect(404);
    expect(response.body.message).toBe('Personel bulunamadı');
    expect(service.findOne).toHaveBeenCalledWith('missing', 'tenant');
  });
});
