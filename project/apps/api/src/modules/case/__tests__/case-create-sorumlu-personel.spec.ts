/**
 * PR-1 (F1) — CaseService.create() operasyonel sorumlu (Case.sorumluPersonelId) persist + tenant guard.
 *
 * Bug: frontend zorunlu "Sorumlu" alanını gönderiyor, DTO kabul ediyordu, ama create() data bloğu
 * YAZMIYORDU → "Yeni Takip" sihirbazından açılan her dosyada sessizce null kalıyordu (veri kaybı).
 * Fix: tx ÖNCESİ tenant-doğrulamalı persist (batchUpdate ile AYNI kural; cross-tenant/geçersiz User
 * → 400). Mevcut null kayıtlar dokunulmaz (backfill yok); update() kapsam dışı.
 *
 * A2: sorumluPersonelId boş gelirse oluşturan kullanıcıya (userId) düşer — yeni dosyalar sahipsiz
 * kalmaz. Backfill (eski null kayıtlar) HÂLÂ kapsam dışı; ayrı PR.
 *
 * Test deseni (4c spec'leriyle aynı): mock prisma + $transaction passthrough; pre-tx
 * party-resolve/subcategory metodları no-op override. `case.create` bir sentinel fırlatır → create()'in
 * tx-sonrası ~300 satırını mock'lamadan yazılan `data`yı yakalarız (catch non-P2002 → re-throw eder).
 */

import { BadRequestException } from '@nestjs/common';
import { CaseService } from '../case.service';

const STOP = '__STOP_AFTER_CASE_CREATE__';

function setup(opts: { userFound?: any } = {}) {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

  const userFindFirst = jest.fn(async () => ('userFound' in opts ? opts.userFound : { id: 'u1' }));
  const caseCreate = jest.fn(async (_args: any) => {
    throw new Error(STOP); // case.create'ten sonra dur → downstream tx mock'lanmaz
  });

  // Bu testin kapsamı DIŞI olan pre-tx adımları no-op'a çevir (4b/4c izolasyon deseni).
  (service as any).validateSubCategoryRules = () => {};
  (service as any).resolveInlinePartiesBeforeTx = jest.fn(async () => {});
  (service as any).validateDebtorOwnershipBeforeCreate = jest.fn(async () => {});

  (service as any).prisma = {
    user: { findFirst: userFindFirst },
    $transaction: jest.fn(async (cb: any) =>
      cb({
        executionOffice: { findUnique: jest.fn(async () => null) },
        case: { create: caseCreate },
      }),
    ),
  };

  return { service, userFindFirst, caseCreate };
}

describe('PR-1 (F1) CaseService.create() — sorumluPersonelId persist + tenant guard', () => {
  it('cross-tenant/geçersiz sorumluPersonelId → BadRequest (tx ÖNCESİ; dosya yaratılmaz)', async () => {
    const { service, userFindFirst, caseCreate } = setup({ userFound: null });

    await expect(
      service.create('tenant-1', { sorumluPersonelId: 'foreign' } as any, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(caseCreate).not.toHaveBeenCalled(); // guard tx ÖNCESİ reddetti → hiç dosya yaratılmaz
  });

  it('geçerli sorumluPersonelId → case.create data alanı içerir (tenant-doğrulandı)', async () => {
    const { service, userFindFirst, caseCreate } = setup({ userFound: { id: 'u1' } });

    await expect(
      service.create('tenant-1', { sorumluPersonelId: 'u1' } as any, 'user-1'),
    ).rejects.toThrow(STOP); // guard geçti → case.create'e ULAŞTI

    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: 'u1', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(caseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sorumluPersonelId: 'u1', tenantId: 'tenant-1' }),
      }),
    );
  });

  it('sorumluPersonelId yoksa → A2: oluşturan kullanıcıya (userId) düşer; tenant guard atlanır', async () => {
    const { service, userFindFirst, caseCreate } = setup();

    await expect(service.create('tenant-1', {} as any, 'user-1')).rejects.toThrow(STOP);

    expect(userFindFirst).not.toHaveBeenCalled(); // dto boş → cross-tenant kontrolü çalışmaz
    const data = caseCreate.mock.calls[0][0].data;
    expect(data.sorumluPersonelId).toBe('user-1'); // A2 fallback: dto.sorumluPersonelId || userId
  });

  // WP-1b: Case.createdById — dosyayı oluşturan kullanıcı (creator attribution). userId create'te
  // zorunlu; data bloğuna createdById=userId yazılır. Operasyon owner'dan (sorumluPersonelId/
  // responsibleLawyerId) AYRI kavram; bağımsız yazılır.
  it('WP-1b: create → case.create data.createdById = userId (creator)', async () => {
    const { service, caseCreate } = setup({ userFound: { id: 'u1' } });

    await expect(
      service.create('tenant-1', { sorumluPersonelId: 'u1' } as any, 'user-1'),
    ).rejects.toThrow(STOP);

    const data = caseCreate.mock.calls[0][0].data;
    expect(data.createdById).toBe('user-1'); // oluşturan kullanıcı (operasyon owner'dan bağımsız)
  });
});
