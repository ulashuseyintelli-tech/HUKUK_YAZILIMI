import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { WorkScopePermissionService } from '../work-scope-permission/work-scope-permission.service';
import { OfficeContactGrantDto, OfficeContactRevokeDto } from './dto/office-contact.dto';
import { OFFICE_CONTACT_FIELDS, OFFICE_CONTACT_KEYS, OFFICE_CONTACT_SELECT, OfficeContactKey, STAFF_CONTACT_FIELDS, STAFF_CONTACT_SELECT } from './office-contact.constants';
import { readContactReopenGrants } from './office-contact-account-reopen';

type Actor = { tenantId: string; userId: string; requestId?: string };
type Tx = Prisma.TransactionClient;
const PERSON = { id: true, tenantId: true, officeId: true, userId: true, isActive: true, firstName: true, lastName: true } as const;

@Injectable()
export class OfficeContactService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService,
    private readonly officeApproval: OfficeApprovalService, private readonly workScope: WorkScopePermissionService) {}

  async capabilities(actor: Actor) {
    return this.prisma.$transaction(async tx => {
      const { user, office } = await this.context(tx, actor);
      return {
        office: await this.allowed(tx, actor, 'office.contact.manage', false),
        staff: await this.allowed(tx, actor, 'staff.contact.manage', false),
        writeOffice: await this.allowed(tx, actor, 'office.contact.manage', true),
        writeStaff: await this.allowed(tx, actor, 'staff.contact.manage', true),
        managePermissions: user.role === 'ADMIN' && !user.staffMember
          && await this.officeApproval.isF01ActorAuthorized(user.id, actor.tenantId, office.id, { write: true, db: tx }),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async readOffice(actor: Actor) {
    return this.prisma.$transaction(async tx => {
      await this.authorize(tx, actor, 'office.contact.manage', false);
      return tx.office.findUniqueOrThrow({ where: { tenantId: actor.tenantId }, select: OFFICE_CONTACT_SELECT });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async listStaff(actor: Actor, management: boolean, cursor?: string, limit?: string) {
    const take = limit === undefined ? 50 : Number(limit);
    if (!Number.isInteger(take) || take < 1 || take > 100 || (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor !== cursor.trim()))) throw new BadRequestException('Geçersiz sayfalama.');
    return this.prisma.$transaction(async tx => {
      if (management) await this.assertIssuer(tx, actor);
      else await this.authorize(tx, actor, 'staff.contact.manage', false);
      const { office } = await this.context(tx, actor);
      const rows = await tx.staffMember.findMany({
        where: { tenantId: actor.tenantId, officeId: office.id, ...(management ? {} : { isActive: true }), ...(cursor ? { id: { gt: cursor } } : {}) },
        orderBy: { id: 'asc' }, take: take + 1,
        select: management ? { id: true, firstName: true, lastName: true, isActive: true } : { id: true, firstName: true, lastName: true, ...STAFF_CONTACT_SELECT },
      });
      return { items: rows.slice(0, take), nextCursor: rows.length > take ? rows[take - 1].id : null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async updateOffice(actor: Actor, body: unknown) {
    const data = this.contactInput(body, OFFICE_CONTACT_FIELDS);
    return this.write(actor, undefined, async tx => {
      await this.authorize(tx, actor, 'office.contact.manage', true);
      const { office } = await this.context(tx, actor);
      await tx.$queryRaw`SELECT "id" FROM "Office" WHERE "id" = ${office.id} AND "tenantId" = ${actor.tenantId} FOR UPDATE`;
      // Re-evaluate validity after the target-row lock, not before a potentially long wait.
      await this.authorize(tx, actor, 'office.contact.manage', true);
      const before = await tx.office.findUniqueOrThrow({ where: { id: office.id }, select: OFFICE_CONTACT_SELECT });
      const after = await tx.office.update({ where: { id: office.id }, data, select: OFFICE_CONTACT_SELECT });
      await this.contactAudit(tx, actor, 'OFFICE', office.id, before, after);
      return after;
    });
  }

  async updateStaff(actor: Actor, staffId: string, body: unknown) {
    const data = this.contactInput(body, STAFF_CONTACT_FIELDS);
    return this.write(actor, staffId, async tx => {
      await this.authorize(tx, actor, 'staff.contact.manage', true);
      await this.subject(tx, actor, staffId, true);
      const before = await tx.staffMember.findUniqueOrThrow({ where: { id: staffId }, select: STAFF_CONTACT_SELECT });
      const after = await tx.staffMember.update({ where: { id: staffId }, data, select: STAFF_CONTACT_SELECT });
      await this.contactAudit(tx, actor, 'STAFF', staffId, before, after);
      return after;
    });
  }

  async permissionState(actor: Actor, staffId: string) {
    return this.prisma.$transaction(async tx => {
      await this.assertIssuer(tx, actor);
      const person = await this.subject(tx, actor, staffId, false);
      const user = person.userId ? await tx.user.findFirst({ where: { id: person.userId, tenantId: actor.tenantId }, select: { isActive: true, role: true } }) : null;
      return { staffId, canReceiveGrant: person.isActive && !!user?.isActive && user.role !== 'VIEWER',
        grants: (await readContactReopenGrants(tx, actor.tenantId, person.userId, new Date())).map(({ updatedAt, grantedByUserId, ...g }) => g) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async grant(actor: Actor, staffId: string, body: OfficeContactGrantDto) {
    this.permissionInput(body, true);
    const validFrom = new Date(body.validFrom), validUntil = new Date(body.validUntil);
    if (!Number.isFinite(+validFrom) || !Number.isFinite(+validUntil) || validUntil <= validFrom) throw new BadRequestException('Geçersiz izin tarihleri.');
    return this.write(actor, staffId, async tx => {
      await this.assertIssuer(tx, actor);
      const person = await this.subject(tx, actor, staffId, true);
      const subject = person.userId ? await tx.user.findFirst({ where: { id: person.userId, tenantId: actor.tenantId, isActive: true }, select: { id: true, role: true } }) : null;
      if (!subject || subject.role === 'VIEWER') throw new ConflictException('Personelin uygun aktif giriş hesabı yok.');
      if (validUntil <= new Date()) throw new BadRequestException('İzin bitişi gelecekte olmalıdır.');
      const grant = await tx.permissionGrant.create({ data: { tenantId: actor.tenantId, subjectUserId: subject.id,
        permissionKey: body.permissionKey, effect: 'ALLOW', scope: 'GLOBAL', validFrom, validUntil,
        grantedByUserId: actor.userId, reason: body.reason.trim() }, select: { id: true, permissionKey: true, validFrom: true, validUntil: true, effect: true, scope: true } });
      await this.audit.logInTransaction(tx, { tenantId: actor.tenantId, userId: actor.userId, action: 'CREATE', entityType: 'PERMISSION_GRANT', entityId: grant.id,
        newValues: { ...grant, validFrom: validFrom.toISOString(), validUntil: validUntil.toISOString() },
        metadata: { source: 'OFFICE_CONTACT_G1G2', actorRole: 'ADMIN', authoritySource: 'CURRENT_NON_STAFF_ADMIN_AND_F01', staffId, requestId: actor.requestId ?? randomUUID(), ...this.reasonMetadata(body.reason) } });
      return grant;
    });
  }

  async revoke(actor: Actor, staffId: string, body: OfficeContactRevokeDto) {
    this.permissionInput(body, false);
    return this.write(actor, staffId, async tx => {
      await this.assertIssuer(tx, actor);
      const person = await this.subject(tx, actor, staffId, false);
      if (!person.userId || !await tx.user.findFirst({ where: { id: person.userId, tenantId: actor.tenantId }, select: { id: true } })) throw new ConflictException('Bağlı giriş hesabı doğrulanamadı.');
      const now = new Date();
      const where: Prisma.PermissionGrantWhereInput = { tenantId: actor.tenantId, subjectUserId: person.userId,
        permissionKey: body.permissionKey, effect: 'ALLOW', scope: 'GLOBAL', OR: [{ validUntil: null }, { validUntil: { gt: now } }] };
      const before = await tx.permissionGrant.findMany({ where, orderBy: { id: 'asc' }, select: { id: true } });
      const result = await tx.permissionGrant.updateMany({ where, data: { validUntil: now } });
      await this.audit.logInTransaction(tx, { tenantId: actor.tenantId, userId: actor.userId, action: 'UPDATE', entityType: 'PERMISSION_GRANT', entityId: person.userId,
        oldValues: { grantIds: before.map(g => g.id) }, newValues: { permissionKey: body.permissionKey, expiredCount: result.count, validUntil: now.toISOString() },
        metadata: { source: 'OFFICE_CONTACT_G1G2', actorRole: 'ADMIN', authoritySource: 'CURRENT_NON_STAFF_ADMIN_AND_F01', staffId, requestId: actor.requestId ?? randomUUID(), ...this.reasonMetadata(body.reason) } });
      return { revoked: result.count };
    });
  }

  private async context(tx: Tx, actor: Actor) {
    if (!actor?.userId || !actor.tenantId) throw new ForbiddenException('İletişim erişim bağlamı eksik.');
    const user = await tx.user.findFirst({ where: { id: actor.userId, tenantId: actor.tenantId, isActive: true },
      select: { id: true, role: true, staffMember: { select: PERSON } } });
    if (!user) throw new ForbiddenException('İletişim erişimi yok.');
    const office = await tx.office.findUnique({ where: { tenantId: actor.tenantId }, select: { id: true } });
    if (!office) throw new NotFoundException('Büro bulunamadı.');
    return { user, office };
  }

  private async allowed(tx: Tx, actor: Actor, key: OfficeContactKey, write: boolean) {
    const { user, office } = await this.context(tx, actor);
    if (write && user.role === 'VIEWER') return false;
    const f01 = await this.officeApproval.isF01ActorAuthorized(actor.userId, actor.tenantId, office.id, { write, db: tx });
    if (f01) return true; // Existing F01 is neither conferred nor revoked by contact grants.
    const staff = user.staffMember;
    if (user.role === 'VIEWER' || !staff?.isActive || staff.tenantId !== actor.tenantId || staff.officeId !== office.id || staff.userId !== user.id) return false;
    const grants = await tx.permissionGrant.findMany({ where: { tenantId: actor.tenantId, subjectUserId: user.id, permissionKey: key, scope: 'GLOBAL',
      OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] }, select: { effect: true, validFrom: true, validUntil: true } });
    const now = new Date(), current = grants.filter(g => g.validFrom <= now && (!g.validUntil || g.validUntil > now));
    return !current.some(g => g.effect === 'DENY') && current.some(g => g.effect === 'ALLOW' && g.validUntil !== null);
  }

  private async authorize(tx: Tx, actor: Actor, key: OfficeContactKey, write: boolean) {
    if (!await this.allowed(tx, actor, key, write)) throw new ForbiddenException('Bu iletişim işlemi için yetkiniz yok.');
  }

  private async assertIssuer(tx: Tx, actor: Actor) {
    const { user, office } = await this.context(tx, actor);
    if (user.role !== 'ADMIN' || user.staffMember || !await this.officeApproval.isF01ActorAuthorized(user.id, actor.tenantId, office.id, { write: true, db: tx })) {
      throw new ForbiddenException('İletişim izni yönetimi için güncel ADMIN ve F01 yetkisi gerekir.');
    }
  }

  private async subject(tx: Tx, actor: Actor, staffId: string, active: boolean) {
    const { office } = await this.context(tx, actor);
    const person = await tx.staffMember.findFirst({ where: { id: staffId, tenantId: actor.tenantId, officeId: office.id, ...(active ? { isActive: true } : {}) }, select: PERSON });
    if (!person) throw new NotFoundException('Personel bulunamadı.');
    return person;
  }

  private async write<T>(actor: Actor, targetId: string | undefined, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async tx => {
      const pre = await this.context(tx, actor);
      const ids = [...new Set([...(pre.user.staffMember ? [pre.user.staffMember.id] : []), ...(targetId ? [targetId] : [])])].sort();
      for (const id of ids) await this.workScope.lockPersonInTx(tx, actor.tenantId, { personType: 'staff', personId: id });
      const target = targetId ? await this.subject(tx, actor, targetId, false) : null;
      const users = [...new Set([actor.userId, ...(target?.userId ? [target.userId] : [])])].sort();
      // Match the existing F01 withdrawal order: Lawyer before User (LawyerService.delete).
      await tx.$queryRaw`SELECT "id" FROM "Lawyer" WHERE "userId" = ${actor.userId} FOR SHARE`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "tenantId" = ${actor.tenantId} AND "id" IN (${Prisma.join(users)}) ORDER BY "id" FOR UPDATE`;
      if (ids.length) await tx.$queryRaw`SELECT "id" FROM "StaffMember" WHERE "tenantId" = ${actor.tenantId} AND "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
      await this.officeApproval.isF01WriteActorAuthorizedInTx(tx, actor.userId, actor.tenantId);
      const fresh = await this.context(tx, actor);
      if (fresh.user.staffMember?.id !== pre.user.staffMember?.id) throw new ConflictException('Aktör bağlantısı değişti; işlem uygulanmadı.');
      if (target && (await this.subject(tx, actor, targetId!, false)).userId !== target.userId) throw new ConflictException('Personel hesap bağlantısı değişti.');
      return work(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 15_000 });
  }

  private contactInput(body: unknown, fields: readonly string[]) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('İletişim alanları gerekli.');
    const entries = Object.entries(body);
    if (!entries.length || entries.some(([k, v]) => !fields.includes(k) || (typeof v !== 'string' && v !== null))) throw new BadRequestException('Yalnız izinli iletişim alanları gönderilebilir.');
    return Object.fromEntries(entries);
  }

  private permissionInput(body: OfficeContactRevokeDto | OfficeContactGrantDto, grant: boolean) {
    const keys = ['permissionKey', 'reason', ...(grant ? ['validFrom', 'validUntil'] : [])];
    if (!body || typeof body !== 'object' || Object.keys(body).some(k => !keys.includes(k))
      || !(OFFICE_CONTACT_KEYS as readonly string[]).includes(body.permissionKey) || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 1000
      || (grant && (typeof (body as OfficeContactGrantDto).validFrom !== 'string' || typeof (body as OfficeContactGrantDto).validUntil !== 'string'))) throw new BadRequestException('Geçersiz iletişim izin isteği.');
  }

  private async contactAudit(tx: Tx, actor: Actor, type: string, id: string, before: object, after: object) {
    const { user, office } = await this.context(tx, actor);
    const legacy = await this.officeApproval.isF01ActorAuthorized(actor.userId, actor.tenantId, office.id, { write: true, db: tx });
    await this.audit.logInTransaction(tx, { tenantId: actor.tenantId, userId: actor.userId, action: 'UPDATE', entityType: type, entityId: id,
      oldValues: before, newValues: after, actorType: 'USER', decisionResult: 'SUCCESS', policyRef: 'OFFICE-CONTACT-G1G2-SA01',
      metadata: { source: 'OFFICE_CONTACT_G1G2', actorRole: user.role, authoritySource: legacy ? 'EXISTING_F01' : 'EXPLICIT_PERMISSION_GRANT',
        permissionKey: type === 'OFFICE' ? OFFICE_CONTACT_KEYS[0] : OFFICE_CONTACT_KEYS[1], requestId: actor.requestId ?? randomUUID() } });
  }

  private reasonMetadata(reason: string) {
    const normalized = reason.trim();
    return { reasonProvided: true, reasonLength: normalized.length, reasonSha256: createHash('sha256').update(normalized).digest('hex') };
  }
}
