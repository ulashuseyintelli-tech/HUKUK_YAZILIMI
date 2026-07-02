/**
 * CBND-7 (H4) — PortalController admin uçları actor kimliği.
 *
 * Açık: JwtStrategy.validate() authService.validateUser(payload.sub)'ın döndürdüğü HAM Prisma User
 * entity'sini req.user'a koyar — bu entity'de "id" alanı vardır, "sub" YOKTUR (sub yalnız JWT payload'ının
 * kendisinde bir claim adıdır, resolve edilmiş User nesnesinde yoktur). PortalController'ın 5 admin ucu
 * `req.user.sub` okuyordu → her zaman undefined:
 *  - createPortalUser/disablePortalUser: actor.userId=undefined → Task 10-S gate PARTNER dahil HERKESE
 *    ForbiddenException fırlatıyordu (portal erişimi hiç açılıp kapatılamıyordu).
 *  - reviewDocument (approve/reject): reviewedBy=undefined → belge onaylanıyor ama onaylayan aktör KAYBOLUYOR.
 *  - sendMessageFromOffice: PortalMessage.senderId zorunlu → undefined ile Prisma create hatası (500).
 * Fix: `req.user.sub` → `req.user.id` (5 yerde), diğer tüm controller'larla aynı desen.
 */
import { PortalController } from '../portal.controller';

const REQ_USER = { id: 'user-real-1', tenantId: 'tenant-1', email: 'avukat@buro.com', name: 'Ayşe Yılmaz', role: 'PARTNER' };

function setup() {
  const portalService: any = {
    createPortalUser: jest.fn().mockResolvedValue({ success: true }),
    disablePortalUser: jest.fn().mockResolvedValue({ success: true }),
    reviewDocument: jest.fn().mockResolvedValue({ success: true }),
    sendMessageFromOffice: jest.fn().mockResolvedValue({ success: true }),
  };
  const controller = new PortalController(portalService);
  return { controller, portalService };
}

describe('CBND-7 (H4) PortalController — admin uçları req.user.id kullanır (sub DEĞİL)', () => {
  it('createPortalUser: actor.userId = req.user.id, undefined DEĞİL', async () => {
    const { controller, portalService } = setup();
    await controller.createPortalUser({ user: REQ_USER } as any, { clientId: 'c1', email: 'e@x.com', password: 'pw' });
    expect(portalService.createPortalUser).toHaveBeenCalledWith('c1', 'e@x.com', 'pw', 'tenant-1', { userId: 'user-real-1' });
  });

  it('disablePortalUser: actor.userId = req.user.id, undefined DEĞİL', async () => {
    const { controller, portalService } = setup();
    await controller.disablePortalUser({ user: REQ_USER } as any, { clientId: 'c1' });
    expect(portalService.disablePortalUser).toHaveBeenCalledWith('c1', 'tenant-1', { userId: 'user-real-1' });
  });

  it('approveDocument: reviewedBy = req.user.id, undefined DEĞİL', async () => {
    const { controller, portalService } = setup();
    await controller.approveDocument('doc-1', { user: REQ_USER } as any, { note: 'uygun' });
    expect(portalService.reviewDocument).toHaveBeenCalledWith('doc-1', 'tenant-1', 'user-real-1', true, 'uygun');
  });

  it('rejectDocument: reviewedBy = req.user.id, undefined DEĞİL', async () => {
    const { controller, portalService } = setup();
    await controller.rejectDocument('doc-1', { user: REQ_USER } as any, { note: 'eksik' });
    expect(portalService.reviewDocument).toHaveBeenCalledWith('doc-1', 'tenant-1', 'user-real-1', false, 'eksik');
  });

  it('sendMessageToClient: senderId = req.user.id, undefined DEĞİL', async () => {
    const { controller, portalService } = setup();
    await controller.sendMessageToClient('c1', { user: REQ_USER } as any, { content: 'Merhaba' });
    expect(portalService.sendMessageFromOffice).toHaveBeenCalledWith('c1', 'tenant-1', 'Merhaba', 'user-real-1', 'Ayşe Yılmaz', undefined);
  });

  it('req.user gerçek JwtStrategy şeklini yansıtır: "sub" alanı YOK, yalnız "id" var', () => {
    expect((REQ_USER as any).sub).toBeUndefined();
    expect(REQ_USER.id).toBe('user-real-1');
  });
});
