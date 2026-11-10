import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ClientBankAccount } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { maskIban } from '../../common/pii-mask.util';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { assertClientObjectScope } from './client-object-scope';
import { decideClientUpdate } from './client-mutation-policy';
import { normalizeClientIban, validateClientBankAccountInput } from './dto/client-bank-account.dto';

export interface ClientBankActor { userId: string; tenantId: string }

@Injectable()
export class ClientBankAccountService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService,
    private readonly officeApproval: OfficeApprovalService) {}

  private assertIdentity(actor: ClientBankActor, clientId: string) {
    if (!actor || typeof actor.userId !== 'string' || !actor.userId || typeof actor.tenantId !== 'string' || !actor.tenantId) {
      throw new ForbiddenException({ code: 'CLIENT_READ_DENIED' });
    }
    if (typeof clientId !== 'string' || !clientId) throw new NotFoundException('Müvekkil bulunamadı');
  }

  private async context(tx: Prisma.TransactionClient, actor: ClientBankActor, clientId: string, write: boolean) {
    this.assertIdentity(actor, clientId);
    // User -> Client lock order. Fresh checks happen after both actual lock waits.
    const users = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User" WHERE "id"=${actor.userId} AND "tenantId"=${actor.tenantId} FOR SHARE`;
    if (users.length !== 1) throw new ForbiddenException({ code: 'CLIENT_READ_DENIED' });
    const clients = write
      ? await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Client" WHERE "id"=${clientId} AND "tenantId"=${actor.tenantId} AND "isActive"=true FOR UPDATE`
      : await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Client" WHERE "id"=${clientId} AND "tenantId"=${actor.tenantId} AND "isActive"=true FOR SHARE`;
    if (clients.length !== 1) throw new NotFoundException('Müvekkil bulunamadı');
    await assertClientObjectScope(tx, actor.tenantId, actor.userId, clientId);
    const user = await tx.user.findFirst({ where: { id: actor.userId, tenantId: actor.tenantId, isActive: true }, select: { role: true } });
    if (!user) throw new ForbiddenException({ code: 'CLIENT_READ_DENIED' });
    const elevatedAuthority = user.role !== 'ADMIN' && await this.officeApproval.isApproverEligible(actor.userId, actor.tenantId, tx);
    const decision = decideClientUpdate({ userId: actor.userId, role: user.role, elevatedAuthority }, { bankName: true });
    if (write && !decision.allowed) throw new ForbiddenException({ code: decision.reasonCode });
    return { canCreate: decision.allowed, canUpdate: decision.allowed, reasonCode: decision.reasonCode };
  }

  private present(row: ClientBankAccount) {
    return { id: row.id, bankName: row.bankName, branchName: row.branchName, accountHolder: row.accountHolder,
      isPrimary: row.isPrimary, ibanMasked: maskIban(row.iban) };
  }

  /** Actor-facing consumer: ClientBankAccountController.list. No actor-less/internal bypass. */
  async list(clientId: string, actor: ClientBankActor) {
    this.assertIdentity(actor, clientId);
    return this.prisma.$transaction(async tx => {
      const capabilities = await this.context(tx, actor, clientId, false);
      const rows = await tx.clientBankAccount.findMany({ where: { clientId }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] });
      return { items: rows.map(row => this.present(row)), capabilities };
    });
  }

  /** Actor-facing consumer: ClientBankAccountController.create. */
  async create(clientId: string, input: unknown, actor: ClientBankActor) {
    return this.write(clientId, undefined, input, actor);
  }

  /** Actor-facing consumer: ClientBankAccountController.update. */
  async update(clientId: string, accountId: string, input: unknown, actor: ClientBankActor) {
    if (typeof accountId !== 'string' || !accountId) throw new NotFoundException('Banka hesabı bulunamadı');
    return this.write(clientId, accountId, input, actor);
  }

  private async write(clientId: string, accountId: string | undefined, input: unknown, actor: ClientBankActor) {
    this.assertIdentity(actor, clientId);
    const data = validateClientBankAccountInput(input, accountId === undefined);
    return this.prisma.$transaction(async tx => {
      await this.context(tx, actor, clientId, true);
      const existing = accountId === undefined ? null : await tx.clientBankAccount.findFirst({ where: { id: accountId, clientId } });
      if (accountId !== undefined && !existing) throw new NotFoundException('Banka hesabı bulunamadı');
      if (data.iban !== undefined) {
        const siblings = await tx.clientBankAccount.findMany({ where: { clientId }, select: { id: true, iban: true } });
        if (siblings.some(row => row.id !== accountId && normalizeClientIban(row.iban) === data.iban)) {
          throw new ConflictException({ code: 'CLIENT_BANK_DUPLICATE_IBAN', message: 'Bu müvekkilde aynı IBAN zaten kayıtlı.' });
        }
      }
      const keys = Object.keys(data) as Array<keyof typeof data>;
      const changed = existing ? keys.filter(key => existing[key] !== data[key]) : keys;
      if (existing && !changed.length) return this.present(existing);
      const replaced = data.isPrimary === true
        ? await tx.clientBankAccount.findMany({ where: { clientId, isPrimary: true, ...(accountId ? { id: { not: accountId } } : {}) }, select: { id: true } }) : [];
      if (replaced.length) await tx.clientBankAccount.updateMany({ where: { clientId, id: { in: replaced.map(row => row.id) } }, data: { isPrimary: false } });
      const row = existing
        ? await tx.clientBankAccount.update({ where: { id: existing.id }, data })
        : await tx.clientBankAccount.create({ data: { clientId, bankName: data.bankName!, iban: data.iban!, branchName: data.branchName, accountHolder: data.accountHolder, isPrimary: data.isPrimary } });
      await this.audit.logInTransaction(tx, { tenantId: actor.tenantId, userId: actor.userId, entityType: 'CLIENT', entityId: clientId,
        action: existing ? 'CLIENT_BANK_ACCOUNT_UPDATE' : 'CLIENT_BANK_ACCOUNT_CREATE',
        metadata: { bankAccountId: row.id, changedFields: changed, replacedPrimaryIds: replaced.map(item => item.id) } });
      return this.present(row);
    }, { timeout: 15_000 });
  }
}
