/**
 * DBND-D6A-1 route collision regression. Debtor'un bare `addresses/:addressId` (PUT/DELETE) ve
 * Client'ın eski bare `addresses/:addressId` route'u aynı path'i paylaşıyordu; AppModule'de
 * DebtorModule ClientModule'den önce import edildiği için Client tarafı Express router'da hiç
 * tetiklenmiyordu (bkz client-debtor-address-route-collision memory). Fix: Client route'u
 * `clients/:clientId/addresses/:addressId` altına nest edildi.
 *
 * Bu test gerçek AddressController + ClientAddressController'ı (gerçek route decorator'larıyla),
 * üretimdeki AppModule sırasına uygun şekilde (Debtor önce) aynı testing module'e bağlayıp HTTP
 * isteği atarak doğrular. Servisler mock'lanır — DB'ye dokunulmaz.
 */
import 'reflect-metadata';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AddressController } from '../../debtor/address.controller';
import { AddressService } from '../../debtor/address.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ClientAddressController } from '../client-address.controller';
import { ClientAddressService } from '../client-address.service';

describe('Client/Debtor address route collision regression (DBND-D6A-1)', () => {
  let app: INestApplication;

  const addressServiceMock = {
    update: jest.fn().mockResolvedValue({ source: 'debtor-update' }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const clientAddressServiceMock = {
    update: jest.fn().mockResolvedValue({ source: 'client-update' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      // Sıra üretimdeki AppModule'ü yansıtır: DebtorModule (AddressController) ClientModule'den
      // (ClientAddressController) önce gelir — route collision tam bu sırada ortaya çıkmıştı.
      controllers: [AddressController, ClientAddressController],
      providers: [
        { provide: AddressService, useValue: addressServiceMock },
        { provide: ClientAddressService, useValue: clientAddressServiceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { tenantId: 'tenant-1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('PUT /addresses/:addressId (debtor, bare route) hâlâ AddressService.update çağırır', async () => {
    await request(app.getHttpServer()).put('/addresses/addr-debtor-1').send({ street: 'X' }).expect(200);

    expect(addressServiceMock.update).toHaveBeenCalledWith(
      'tenant-1',
      'addr-debtor-1',
      expect.objectContaining({ street: 'X' }),
    );
    expect(clientAddressServiceMock.update).not.toHaveBeenCalled();
  });

  it('DELETE /addresses/:addressId (debtor, bare route) hâlâ AddressService.delete çağırır', async () => {
    await request(app.getHttpServer()).delete('/addresses/addr-debtor-1').expect(200);

    expect(addressServiceMock.delete).toHaveBeenCalledWith('tenant-1', 'addr-debtor-1');
    expect(clientAddressServiceMock.remove).not.toHaveBeenCalled();
  });

  it('PUT /clients/:clientId/addresses/:addressId ClientAddressService.update çağırır, debtor AddressService çağrılmaz', async () => {
    await request(app.getHttpServer())
      .put('/clients/client-1/addresses/addr-client-1')
      .send({ city: 'İstanbul' })
      .expect(200);

    expect(clientAddressServiceMock.update).toHaveBeenCalledWith(
      'tenant-1',
      'client-1',
      'addr-client-1',
      expect.objectContaining({ city: 'İstanbul' }),
    );
    expect(addressServiceMock.update).not.toHaveBeenCalled();
  });

  it('DELETE /clients/:clientId/addresses/:addressId ClientAddressService.remove çağırır, debtor AddressService çağrılmaz', async () => {
    await request(app.getHttpServer()).delete('/clients/client-1/addresses/addr-client-1').expect(200);

    expect(clientAddressServiceMock.remove).toHaveBeenCalledWith('tenant-1', 'client-1', 'addr-client-1');
    expect(addressServiceMock.delete).not.toHaveBeenCalled();
  });
});
