import 'reflect-metadata';
import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { ClientController } from '../client.controller';
import { ClientKvkkRightsController } from '../client-kvkk-rights.controller';
import { ClientLegalHoldController } from '../client-legal-hold.controller';
import { ClientModule } from '../client.module';
import { ClientService } from '../client.service';
import { ClientDisclosureService } from '../client-disclosure.service';
import { ClientDataSubjectRequestService } from '../client-data-subject-request.service';
import { ClientLegalHoldService } from '../client-legal-hold.service';
import { ClientIntakeLinkService } from '../../client-intake-link/client-intake-link.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

/**
 * CAD-BACKEND-ROUTE-SHADOW-REMEDIATION-R01 regresyon guard'ı (gerçek Nest HTTP seviyesi).
 *
 * Kusur: `ClientController @Get(':id')` catch-all'u, sonra kaydedilen üç tek-segment
 * statik collection GET'ini gölgeliyordu (`/clients/disclosure-texts`,
 * `/clients/data-subject-requests`, `/clients/legal-holds` → 404 "Müvekkil bulunamadı").
 * Bu test iki eksende korur:
 *   (1) HTTP — üç collection GET'i kendi dedicated handler'ına (200 dizi) ulaşır,
 *       `:id` catch-all'una DÜŞMEZ; ve `:id` davranışı (found→200 / unknown→404) korunur.
 *   (2) Yapısal — ClientModule, KVKK/legal-hold controller'larını ClientController'DAN
 *       ÖNCE kaydeder; birisi sırayı bozarsa (shadow geri gelir) bu assertion kırılır.
 */

const allowGuard: CanActivate = {
  canActivate: (ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    req.user = { id: 'u-uat', tenantId: 't-uat', role: 'ADMIN' };
    return true;
  },
};

describe('client compliance route precedence (CAD-BACKEND-ROUTE-SHADOW-REMEDIATION-R01)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      // Prod ClientModule ile AYNI göreli sıra: dedicated controller'lar ClientController'dan önce.
      controllers: [ClientKvkkRightsController, ClientLegalHoldController, ClientController],
      providers: [
        { provide: ClientDisclosureService, useValue: { listTexts: jest.fn().mockResolvedValue([]) } },
        { provide: ClientDataSubjectRequestService, useValue: { listRequests: jest.fn().mockResolvedValue([]) } },
        { provide: ClientLegalHoldService, useValue: { listHolds: jest.fn().mockResolvedValue([]) } },
        {
          provide: ClientService,
          useValue: { findOne: jest.fn(async (id: string) => (id === 'real-client' ? { id } : null)) },
        },
        { provide: ClientIntakeLinkService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowGuard)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    '/clients/disclosure-texts',
    '/clients/data-subject-requests',
    '/clients/legal-holds',
  ])('GET %s → dedicated handler (200 dizi), :id catch-all DEĞİL', async (path) => {
    const res = await request(app.getHttpServer()).get(path);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /clients/:id (bilinen) → findOne, 200 {data}', async () => {
    const res = await request(app.getHttpServer()).get('/clients/real-client');
    expect(res.status).toBe(200);
    expect(res.body?.data?.id).toBe('real-client');
  });

  it('GET /clients/:id (bilinmeyen) → 404 korunur', async () => {
    const res = await request(app.getHttpServer()).get('/clients/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('ClientModule: KVKK + legal-hold controller ClientController’DAN ÖNCE kayıtlı (yapısal guard)', () => {
    const controllers: unknown[] = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ClientModule) || [];
    const idxClient = controllers.indexOf(ClientController);
    const idxKvkk = controllers.indexOf(ClientKvkkRightsController);
    const idxHold = controllers.indexOf(ClientLegalHoldController);
    expect(idxKvkk).toBeGreaterThanOrEqual(0);
    expect(idxHold).toBeGreaterThanOrEqual(0);
    expect(idxClient).toBeGreaterThanOrEqual(0);
    expect(idxKvkk).toBeLessThan(idxClient);
    expect(idxHold).toBeLessThan(idxClient);
  });
});
