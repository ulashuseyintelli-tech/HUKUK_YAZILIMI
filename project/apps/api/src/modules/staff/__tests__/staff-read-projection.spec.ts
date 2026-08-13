/**
 * OFFICE-P5-SECURITY-COMPLETION-R01 / P5-B04 (S3) — staff okuma yüzeyi projeksiyonu.
 *
 * ÖLÇÜM (P5-B03): GET /api/staff(+/:id) yalnız JwtAuthGuard taşıyordu ve tenant'taki
 * HERHANGİ bir authenticated kullanıcı tüm yetki bayraklarını + TCKN'yi okuyabiliyordu.
 * S3 sözleşmesi: F01-yetkisiz aktöre bayraklar ve tckn anahtarı TAMAMEN düşürülür;
 * F01-yetkili aktörün yanıtı DEĞİŞMEZ (owner yasağı: PARTNER/AUTHORIZED akışları korunur).
 * Negatif/cross-tenant/data-leak assertion'ları bu spec'tedir (GO-COMPLETE kapısı).
 */
import { StaffController } from '../staff.controller';
import {
  STAFF_PRIVILEGED_READ_FIELDS,
  projectStaffRowForActor,
  projectStaffRowsForActor,
} from '../staff-public-projection';

const fullRow = () => ({
  id: 's1',
  tenantId: 't1',
  officeId: 'o1',
  firstName: 'Aysu',
  lastName: 'Aktay',
  tckn: '123****01', // liste yüzeyi maskeli taşır (CANDIDATE-F1)
  email: 'aysu@telli.example',
  phone: '0212',
  staffType: 'STAJYER_AVUKAT',
  canCreateCase: true,
  canEditCase: true,
  canGenerateDocuments: false,
  canApproveDocuments: false,
  canSeeFinance: true,
  canApproveFinance: true,
  canPrepareCollectionDisposition: false,
  canSendNotifications: false,
  isDefaultForNewCases: true,
  isActive: true,
  sortOrder: 0,
  userId: 'u3',
});

const buildController = (opts: { authorized: boolean; rows?: any[]; one?: any }) => {
  const staffService: any = {
    findAll: jest.fn().mockResolvedValue(opts.rows ?? [fullRow()]),
    findByType: jest.fn().mockResolvedValue(opts.rows ?? [fullRow()]),
    findOne: jest.fn().mockResolvedValue('one' in opts ? opts.one : fullRow()),
  };
  const officeApproval: any = {
    isF01ActorAuthorized: jest.fn().mockResolvedValue(opts.authorized),
  };
  return { ctrl: new StaffController(staffService, officeApproval), staffService, officeApproval };
};

const req = { user: { id: 'u9', tenantId: 't1' } };

describe('P5-B04 (S3) — alan listesi ve projeksiyon çekirdeği', () => {
  it('ayrıcalıklı alan listesi kilidi: tckn + 8 yetki bayrağı (yeni alan kanıt ister)', () => {
    expect([...STAFF_PRIVILEGED_READ_FIELDS]).toEqual([
      'tckn',
      'canCreateCase',
      'canEditCase',
      'canGenerateDocuments',
      'canApproveDocuments',
      'canSeeFinance',
      'canApproveFinance',
      'canPrepareCollectionDisposition',
      'canSendNotifications',
    ]);
  });

  it('yetkisiz aktör: anahtarlar TAMAMEN yok (null/undefined değil); seçici akış alanları KORUNUR', () => {
    const out: any = projectStaffRowForActor(fullRow(), false);
    for (const field of STAFF_PRIVILEGED_READ_FIELDS) {
      expect(field in out).toBe(false);
    }
    // Ölçülen tüketiciler (personel seçici / lookup / ekip modalı) bu alanlarla çalışır:
    expect(out).toMatchObject({
      id: 's1',
      firstName: 'Aysu',
      lastName: 'Aktay',
      staffType: 'STAJYER_AVUKAT',
      isActive: true,
      isDefaultForNewCases: true,
      sortOrder: 0,
    });
  });

  it('yetkili aktör: satır DEĞİŞMEZ (birebir aynı referans — mevcut akışlar korunur)', () => {
    const row = fullRow();
    const out = projectStaffRowForActor(row, true);
    expect(out).toBe(row);
  });

  it('liste projeksiyonu: boş dizide boş dizi; her satır tek tek projekte edilir', () => {
    expect(projectStaffRowsForActor([], false)).toEqual([]);
    const outs: any[] = projectStaffRowsForActor([fullRow(), fullRow()], false);
    expect(outs).toHaveLength(2);
    for (const o of outs) expect('canSeeFinance' in o).toBe(false);
  });
});

describe('P5-B04 (S3) — StaffController okuma yüzeyi davranışı', () => {
  it('GET /staff (yetkisiz aktör): data satırlarında bayrak/tckn anahtarı YOK (data-leak negatif assertion)', async () => {
    const { ctrl, officeApproval } = buildController({ authorized: false });
    const res: any = await ctrl.findAll(req);
    expect(officeApproval.isF01ActorAuthorized).toHaveBeenCalledWith('u9', 't1');
    for (const field of STAFF_PRIVILEGED_READ_FIELDS) {
      expect(field in res.data[0]).toBe(false);
    }
    expect(res.data[0]).toMatchObject({ id: 's1', firstName: 'Aysu' });
  });

  it('GET /staff (yetkili aktör): yanıt bugünkü ile birebir (maskeli tckn + bayraklar mevcut)', async () => {
    const { ctrl } = buildController({ authorized: true });
    const res: any = await ctrl.findAll(req);
    expect(res.data[0].tckn).toBe('123****01');
    expect(res.data[0].canSeeFinance).toBe(true);
    expect(res.data[0].canApproveFinance).toBe(true);
  });

  it('GET /staff?type= yolu da aynı projeksiyondan geçer', async () => {
    const { ctrl, staffService } = buildController({ authorized: false });
    const res: any = await ctrl.findAll(req, 'MUHASEBE');
    expect(staffService.findByType).toHaveBeenCalledWith('t1', 'MUHASEBE');
    expect('canApproveFinance' in res.data[0]).toBe(false);
  });

  it('GET /staff/:id (yetkisiz aktör): detayda da bayrak/tckn anahtarı YOK', async () => {
    const { ctrl } = buildController({ authorized: false });
    const res: any = await ctrl.findOne(req, 's1');
    for (const field of STAFF_PRIVILEGED_READ_FIELDS) {
      expect(field in res.data).toBe(false);
    }
  });

  it('GET /staff/:id (yetkili aktör): detay yanıtı projeksiyonsuz döner (S3 findOne maskesi servistedir)', async () => {
    const { ctrl } = buildController({ authorized: true });
    const res: any = await ctrl.findOne(req, 's1');
    expect(res.data.canSeeFinance).toBe(true);
  });

  it('cross-tenant findOne: servis null döndürür → { error }, yetki sorgusu HİÇ yapılmaz', async () => {
    const { ctrl, officeApproval } = buildController({ authorized: true, one: null });
    const res: any = await ctrl.findOne({ user: { id: 'u9', tenantId: 'BASKA-TENANT' } }, 's1');
    expect(res).toEqual({ error: 'Personel bulunamadı' });
    expect(officeApproval.isF01ActorAuthorized).not.toHaveBeenCalled();
  });
});
