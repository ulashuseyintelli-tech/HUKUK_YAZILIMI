import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ViewerWriteDenyGuard } from '../../auth/guards/viewer-write-deny.guard';
import { TebligatController } from '../tebligat.controller';
import { TebligatService } from '../tebligat.service';
import { PttTrackingService } from '../ptt-tracking.service';
import { UetsService } from '../uets.service';

// R12 Kabul A (09.11.2026): dosya Tebligat paneli meşru boş durumda bile "Tebligat bulunamadı. Mevcut liste/özet
// bayat olabilir." gösteriyordu. Neden: Express rotaları tanım sırasıyla eşler; `GET /tebligat/:id`,
// `GET /tebligat/summary`'den ÖNCE tanımlıydı → `summary` bir tebligat kimliği sanılıp findById("summary") → 404.
// Bu spec gerçek denetleyiciyi Express üzerinde ayağa kaldırır; JWT yalnız başlıkla taklit edilir, sınıf düzeyi
// ViewerWriteDenyGuard GERÇEKTİR. Kiracı her zaman JWT kullanıcısından gelir.
describe('TebligatController — GET /tebligat/summary rota sırası (R12 Kabul A)', () => {
  let app: INestApplication;
  const tebligatService = {
    getSummary: jest.fn(),
    findById: jest.fn(),
    findByCaseId: jest.fn(),
  };
  const summary = {
    total: 0, hazirlanan: 0, gonderilen: 0, teslimEdilen: 0, iadeGelen: 0, tebligEdilmisSayilan: 0, bekleyenIslem: 0,
  };
  const as = (r: request.Test) => r.set('x-test-tenant', 'tenant-a');

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TebligatController],
      providers: [
        { provide: TebligatService, useValue: tebligatService },
        { provide: PttTrackingService, useValue: {} },
        { provide: UetsService, useValue: {} },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate: (ctx: any) => {
        const req = ctx.switchToHttp().getRequest();
        const tenantId = req.headers['x-test-tenant'];
        if (!tenantId) throw new UnauthorizedException();
        req.user = { tenantId, id: 'user-1', role: 'LAWYER' };
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => {
    jest.clearAllMocks();
    tebligatService.getSummary.mockResolvedValue(summary);
    tebligatService.findById.mockResolvedValue({ id: 'teb-1' });
    tebligatService.findByCaseId.mockResolvedValue([]);
  });

  it('GET /tebligat/summary?caseId= özet ucuna gider (findById DEĞİL); boş dosya 200 + sıfır sayaçlar', async () => {
    const res = await as(request(app.getHttpServer()).get('/tebligat/summary?caseId=case-1')).expect(200);
    expect(res.body).toEqual(summary);
    expect(tebligatService.getSummary).toHaveBeenCalledWith('tenant-a', 'case-1');
    expect(tebligatService.findById).not.toHaveBeenCalled();
  });

  it('GET /tebligat/summary (caseId yok) imza değişmeden çağrılır', async () => {
    await as(request(app.getHttpServer()).get('/tebligat/summary')).expect(200);
    expect(tebligatService.getSummary).toHaveBeenCalledWith('tenant-a', undefined);
    expect(tebligatService.findById).not.toHaveBeenCalled();
  });

  it('GET /tebligat/:id detay ucu ve GET /tebligat/case/:caseId liste ucu bozulmaz', async () => {
    await as(request(app.getHttpServer()).get('/tebligat/teb-1')).expect(200);
    expect(tebligatService.findById).toHaveBeenCalledWith('tenant-a', 'teb-1');
    await as(request(app.getHttpServer()).get('/tebligat/case/case-1')).expect(200);
    expect(tebligatService.findByCaseId).toHaveBeenCalledWith('tenant-a', 'case-1');
    expect(tebligatService.getSummary).not.toHaveBeenCalled();
  });

  it('kapı gevşemedi: kimliksiz özet isteği 401 ve servis çağrılmaz; sınıf korumaları aynı', async () => {
    await request(app.getHttpServer()).get('/tebligat/summary?caseId=case-1').expect(401);
    expect(tebligatService.getSummary).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(GUARDS_METADATA, TebligatController)).toEqual([JwtAuthGuard, ViewerWriteDenyGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, TebligatController.prototype.getSummary)).toBeUndefined();
  });
});
