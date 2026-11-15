import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertClientObjectScope, clientCaseObjectScope } from '../client/client-object-scope';
import { ACTIVE_TENANT_WHERE } from '../tenant/tenant-lifecycle';
import { ClientStatementService } from './client-statement.service';
import { ClientStatementPdfService } from './client-statement-pdf.service';
import { buildClientStatementRender } from './client-statement-render.mapper';
import { resolveClientSafeFileReferences } from './client-statement-file-reference';
import { identifyMonthlyStatementPeriod } from './client-statement-monthly-period';
import { buildMonthlyStatementSkipDedupeKey } from './client-statement-monthly-skip-trace';
import { hydrateNativeRender, nativeStatementHash, nativeStatementMembership, nativeMonthlyLockKey } from './client-statement-native.contract';

export interface NativeStatementActor { userId: string; role: string }
const includeDocuments = { documents: { orderBy: { currency: 'asc' as const }, include: { artifact: { select: { sha256: true } } } },
  deliveries: { select: { status: true, attempts: true, nextRetryAt: true, sentAt: true }, orderBy: { createdAt: 'desc' as const } } };
type NativeSet = Prisma.ClientStatementNativeSetGetPayload<{ include: typeof includeDocuments }>;

/** E2 native documents are projections of existing accounting sources, never a replacement ledger. */
@Injectable()
export class ClientStatementNativeService {
  constructor(private readonly prisma: PrismaService, private readonly statements: ClientStatementService,
    private readonly pdf: ClientStatementPdfService, private readonly audit: AuditService) {}

  /** Callers: native HTTP create/supersede; reads and writes share the transaction's fresh identity. */
  async create(tenantId: string, clientId: string, actor: NativeStatementActor,
    input: { periodStart: string; periodEnd: string }, replacesId?: string) {
    const period = this.period(input);
    const set = await this.prisma.$transaction(async tx => {
      await this.lock(tx, tenantId, clientId, period.start, period.end);
      await this.assertActorScope(tx, tenantId, clientId, actor, true);
      if (replacesId) await this.assertFrozenCases(tx, tenantId, actor, await this.findSet(tx, tenantId, replacesId));
      return this.generate(tx, tenantId, clientId, actor.userId, period.start, period.end, replacesId);
    }, { isolationLevel: 'RepeatableRead', timeout: 60_000 }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException('E2_CONCURRENT_SET_CHANGE');
      throw error;
    });
    // Generation has committed. A rendering failure is visible, never reported as financial rollback.
    return this.withArtifactOutcome(set);
  }

  /** Trusted caller only: NativeMonthlyService, with an already resolved closed calendar month. No actorless HTTP path. */
  async ensureMonthly(tenantId: string, clientId: string, start: Date, end: Date) {
    if (!identifyMonthlyStatementPeriod(start, end)) throw new BadRequestException('E2_MONTH_REQUIRED');
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, tenantId, clientId, start, end);
      const client = await tx.client.findFirst({ where: { id: clientId, tenantId, isActive: true, tenant: ACTIVE_TENANT_WHERE }, select: { id: true } });
      if (!client) throw new NotFoundException('Müvekkil bulunamadı');
      const existing = await tx.clientStatementNativeSet.findFirst({ where: { tenantId, clientId, periodStart: start, periodEnd: end, status: 'ACTIVE' }, include: includeDocuments });
      if (existing) { this.assertComplete(existing); return { ...existing, generated: false }; }
      return { ...await this.generate(tx, tenantId, clientId, 'SYSTEM_MONTHLY_STATEMENT', start, end), generated: true };
    }, { isolationLevel: 'RepeatableRead', timeout: 60_000 });
  }

  /** Callers: native HTTP list, never a clipped subset of a total-client document. */
  async list(tenantId: string, clientId: string, actor: NativeStatementActor) {
    return this.prisma.$transaction(async tx => {
      await this.assertActorScope(tx, tenantId, clientId, actor);
      const sets = await tx.clientStatementNativeSet.findMany({ where: { tenantId, clientId }, include: includeDocuments, orderBy: { createdAt: 'desc' } });
      for (const set of sets) { this.assertComplete(set); await this.assertFrozenCases(tx, tenantId, actor, set); }
      return sets.map(set => this.present(set));
    });
  }

  /** Callers: native HTTP detail/PDF/retry; parent and historical case scope are resolved from storage. */
  async get(tenantId: string, setId: string, actor: NativeStatementActor) {
    return this.prisma.$transaction(async tx => {
      const set = await this.findSet(tx, tenantId, setId);
      await this.assertActorScope(tx, tenantId, set.clientId, actor);
      await this.assertFrozenCases(tx, tenantId, actor, set);
      return this.present(set);
    });
  }

  /** Callers: native HTTP supersede. The old parent fixes client and period, never caller-selected reparenting. */
  async supersede(tenantId: string, setId: string, actor: NativeStatementActor) {
    const old = await this.get(tenantId, setId, actor);
    return this.create(tenantId, old.clientId, actor, { periodStart: old.periodStart.toISOString(), periodEnd: old.periodEnd.toISOString() }, setId);
  }

  /** Callers: native HTTP void; whole-set lifecycle only, with an atomic audit. */
  async void(tenantId: string, setId: string, actor: NativeStatementActor, note: string) {
    if (typeof note !== 'string' || !note.trim() || note.length > 500) throw new BadRequestException('Geçersiz gerekçe');
    return this.prisma.$transaction(async tx => {
      const old = await this.findSet(tx, tenantId, setId);
      await this.lock(tx, tenantId, old.clientId, old.periodStart, old.periodEnd);
      await this.assertActorScope(tx, tenantId, old.clientId, actor, true);
      await this.assertFrozenCases(tx, tenantId, actor, old);
      await this.assertLifecycleAvailable(tx, old);
      const changed = await tx.clientStatementNativeSet.updateMany({ where: { id: old.id, tenantId, status: 'ACTIVE' }, data: { status: 'VOID', closedAt: new Date(), closeNote: note.trim() } });
      if (changed.count !== 1) throw new ConflictException('E2_SET_NOT_ACTIVE');
      await this.audit.logInTransaction(tx, { tenantId, userId: actor.userId, action: 'UPDATE', entityType: 'ClientStatementNativeSet', entityId: old.id,
        newValues: { status: 'VOID' }, description: 'Native statement set voided', metadata: { note: note.trim() } });
      return { id: old.id, status: 'VOID' };
    });
  }

  /** Callers: native HTTP PDF; all members must have verified artifacts before any download is exposed. */
  async download(tenantId: string, setId: string, currency: string, actor: NativeStatementActor) {
    await this.get(tenantId, setId, actor);
    const artifacts = await this.artifacts(tenantId, setId);
    const document = artifacts.find(d => d.currency === currency);
    if (!document) throw new NotFoundException('Belge bulunamadı');
    // Recheck after rendering, before exposing immutable bytes to an actor who might have lost scope meanwhile.
    await this.get(tenantId, setId, actor);
    return document;
  }

  /** Callers: HTTP generation/download and native monthly sender. All PDFs are persisted in one artifact transaction. */
  async artifacts(tenantId: string, setId: string) {
    const set = await this.findSet(this.prisma, tenantId, setId);
    if (set.status !== 'ACTIVE') throw new ConflictException('E2_SET_NOT_ACTIVE');
    const ready = await this.prisma.clientStatementNativeArtifact.findMany({ where: { tenantId, documentId: { in: set.documents.map(d => d.id) } } });
    if (ready.length && ready.length !== set.memberCount) throw new ConflictException('E2_INCOMPLETE_ARTIFACT_SET');
    if (!ready.length) {
      // Build every member before the first artifact write; a failed second currency leaves zero PDF artifacts.
      const generated: Prisma.ClientStatementNativeArtifactCreateManyInput[] = [];
      for (const doc of set.documents) {
        const pdf = await this.pdf.render(hydrateNativeRender(doc.render), 'ACTIVE');
        if (!Buffer.isBuffer(pdf) || pdf.length < 5 || pdf.subarray(0, 5).toString() !== '%PDF-') throw new ConflictException('E2_INVALID_PDF');
        generated.push({ documentId: doc.id, tenantId, pdf, sha256: this.hashBytes(pdf) });
      }
      await this.prisma.$transaction(async tx => {
        await this.lock(tx, tenantId, set.clientId, set.periodStart, set.periodEnd);
        const current = await this.findSet(tx, tenantId, setId);
        if (current.status !== 'ACTIVE' || current.memberHash !== set.memberHash) throw new ConflictException('E2_SET_CHANGED');
        const count = await tx.clientStatementNativeArtifact.count({ where: { tenantId, documentId: { in: current.documents.map(d => d.id) } } });
        if (count === 0) await tx.clientStatementNativeArtifact.createMany({ data: generated });
        else if (count !== current.memberCount) throw new ConflictException('E2_INCOMPLETE_ARTIFACT_SET');
      });
    }
    const artifacts = await this.prisma.clientStatementNativeArtifact.findMany({ where: { tenantId, documentId: { in: set.documents.map(d => d.id) } } });
    if (artifacts.length !== set.memberCount) throw new ConflictException('E2_INCOMPLETE_ARTIFACT_SET');
    return set.documents.map(doc => {
      const artifact = artifacts.find(a => a.documentId === doc.id)!;
      if (artifact.sha256 !== this.hashBytes(artifact.pdf)) throw new ConflictException('E2_ARTIFACT_HASH_MISMATCH');
      return { currency: doc.currency, render: hydrateNativeRender(doc.render), content: Buffer.from(artifact.pdf), sha256: artifact.sha256 };
    });
  }

  /** Caller: native monthly claim transaction. This method never grants action authority by relation alone. */
  async assertActorScope(tx: Prisma.TransactionClient, tenantId: string, clientId: string, actor: NativeStatementActor, write = false) {
    const current = actor?.userId ? await tx.user.findFirst({ where: { id: actor.userId, tenantId, isActive: true, role: { in: ['USER', 'ADMIN'] } }, select: { role: true } }) : null;
    if (!current || current.role !== actor.role) throw new ForbiddenException('E2_ACTOR_REQUIRED');
    await assertClientObjectScope(tx, tenantId, actor.userId, clientId);
    if (write && !await tx.client.findFirst({ where: { id: clientId, tenantId, isActive: true, tenant: ACTIVE_TENANT_WHERE }, select: { id: true } })) throw new NotFoundException('Müvekkil bulunamadı');
    const links = await tx.caseClient.findMany({ where: { clientId, client: { tenantId } }, select: { caseId: true } });
    await this.assertCases(tx, tenantId, actor, links.map(l => l.caseId));
  }

  /** Caller: native delivery transaction; validates immutable membership even after reload. */
  async findSet(tx: Prisma.TransactionClient | PrismaService, tenantId: string, id: string): Promise<NativeSet> {
    if (!id || !tenantId) throw new NotFoundException('Belge seti bulunamadı');
    const set = await tx.clientStatementNativeSet.findFirst({ where: { id, tenantId }, include: includeDocuments });
    if (!set) throw new NotFoundException('Belge seti bulunamadı');
    this.assertComplete(set);
    return set;
  }

  private async generate(tx: Prisma.TransactionClient, tenantId: string, clientId: string, userId: string, start: Date, end: Date, replacesId?: string): Promise<NativeSet> {
    const active = await tx.clientStatementNativeSet.findFirst({ where: { tenantId, clientId, periodStart: start, periodEnd: end, status: 'ACTIVE' }, include: includeDocuments });
    if (replacesId) {
      if (!active || active.id !== replacesId) throw new ConflictException('E2_SET_NOT_ACTIVE');
      await this.assertLifecycleAvailable(tx, active);
      await tx.clientStatementNativeSet.update({ where: { id: active.id }, data: { status: 'SUPERSEDED', closedAt: new Date() } });
    } else if (active) throw new ConflictException('E2_ACTIVE_SET_EXISTS');
    const sourceCutAt = (await tx.$queryRaw<{ now: Date }[]>`SELECT transaction_timestamp() AS now`)[0].now;
    const projection = await this.statements.collectNativeClientLevel(tx, tenantId, clientId, start, end);
    const drafts = projection.documents;
    if (drafts.some(d => d.lines.some(l => !l.caseId))) throw new ConflictException('E2_SOURCE_PARENT_NOT_PROVEN');
    const sourceCaseIds = projection.sourceCaseIds;
    const linkCount = await tx.caseClient.findMany({ where: { clientId, client: { tenantId }, case: { tenantId }, caseId: { in: sourceCaseIds } }, select: { caseId: true } });
    if (new Set(linkCount.map(l => l.caseId)).size !== sourceCaseIds.length) throw new ConflictException('E2_SOURCE_PARENT_NOT_PROVEN');
    const client = await tx.client.findFirstOrThrow({ where: { tenantId, id: clientId }, select: { displayName: true, name: true, firstName: true, lastName: true } });
    const office = await tx.office.findUnique({ where: { tenantId }, select: { name: true } });
    const clientName = client.displayName || client.name || [client.firstName, client.lastName].filter(Boolean).join(' ') || 'Müvekkil';
    const references = await resolveClientSafeFileReferences(tx as PrismaService, tenantId, clientId, drafts.flatMap(d => d.lines.flatMap(l => l.caseId ? [l.caseId] : [])));
    const documents = drafts.map(draft => {
      const render = buildClientStatementRender({ statement: { caseId: null, currency: draft.currency, periodStart: start, periodEnd: end,
        openingBalance: draft.opening, closingBalance: draft.closing, lines: draft.lines }, clientName, officeName: office?.name ?? '', fileReferences: references });
      return { currency: draft.currency, render: JSON.parse(JSON.stringify(render)) as Prisma.InputJsonValue, renderHash: nativeStatementHash(render) };
    });
    const set = await tx.clientStatementNativeSet.create({ data: { tenantId, clientId, periodStart: start, periodEnd: end, sourceCutAt,
      generatedById: userId, sourceCaseIds, memberCount: documents.length, memberHash: nativeStatementMembership(documents), documents: { create: documents } }, include: includeDocuments });
    if (active) await tx.clientStatementNativeSet.update({ where: { id: active.id }, data: { supersededById: set.id } });
    await this.audit.logInTransaction(tx, { tenantId, userId, action: 'CREATE', entityType: 'ClientStatementNativeSet', entityId: set.id,
      description: 'Complete native-currency client statement set generated', metadata: { clientId, sourceCutAt: sourceCutAt.toISOString(),
        memberHash: set.memberHash, currencies: documents.map(d => d.currency), currencySkipResolutionEligible: true, ...(active ? { supersedesSetId: active.id } : {}) } });
    await this.resolveSkipTasks(tx, set);
    return set;
  }

  private async resolveSkipTasks(tx: Prisma.TransactionClient, set: NativeSet) {
    const period = identifyMonthlyStatementPeriod(set.periodStart, set.periodEnd);
    if (!period) return;
    // The whole source-checked set AND server generation audit are in this same commit. Delivery is not asserted.
    const tasks = await tx.task.findMany({ where: { tenantId: set.tenantId, clientId: set.clientId, createdById: null,
      status: { in: ['PENDING', 'IN_PROGRESS'] }, createdAt: { lte: set.createdAt },
      dedupeKey: { in: ['NON_TRY_SOURCE', 'CURRENCY_UNDETERMINED'].map(reason => buildMonthlyStatementSkipDedupeKey(set.tenantId, set.clientId, period.periodKey, reason)) } }, select: { id: true, status: true } });
    for (const task of tasks) {
      const changed = await tx.task.updateMany({ where: { id: task.id, tenantId: set.tenantId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        data: { status: 'COMPLETED', completedAt: new Date(), completedByUserId: null, resolutionType: 'AUTO_SYSTEM' } });
      if (changed.count === 1) await tx.auditLog.create({ data: { tenantId: set.tenantId, action: 'MONTHLY_STATEMENT_SKIP_RESOLVED', entityType: 'Task', entityId: task.id,
        userId: null, actorType: 'SYSTEM', decisionResult: 'SUCCESS', reasonCode: 'STATEMENT_GENERATED', oldValues: { status: task.status },
        newValues: { status: 'COMPLETED', resolutionType: 'AUTO_SYSTEM' }, metadata: { nativeSetId: set.id, memberHash: set.memberHash, periodKey: period.periodKey, deliveryProven: false } } });
    }
  }

  private async assertLifecycleAvailable(tx: Prisma.TransactionClient, set: NativeSet) {
    if (set.status !== 'ACTIVE') throw new ConflictException('E2_SET_NOT_ACTIVE');
    // Once reserved, even a failed/uncertain delivery cannot be bypassed by generating a new set identity.
    if (await tx.clientStatementNativeDelivery.count({ where: { tenantId: set.tenantId, setId: set.id } })) throw new ConflictException('E2_DELIVERY_BOUND_SET');
  }

  private assertComplete(set: NativeSet) {
    if (!set.memberCount || set.documents.length !== set.memberCount || new Set(set.documents.map(d => d.currency)).size !== set.memberCount ||
      set.documents.some(d => !/^[A-Z]{3}$/.test(d.currency) || nativeStatementHash(d.render) !== d.renderHash ||
        (d.render as any).currency !== d.currency || (d.render as any).periodStart !== set.periodStart.toISOString() || (d.render as any).periodEnd !== set.periodEnd.toISOString()) ||
      nativeStatementMembership(set.documents) !== set.memberHash) throw new ConflictException('E2_INCOMPLETE_DOCUMENT_SET');
  }

  /** Caller: HTTP read/lifecycle and monthly claim; detached historical parents cannot disclose a total-client snapshot. */
  async assertFrozenCases(tx: Prisma.TransactionClient, tenantId: string, actor: NativeStatementActor | undefined, set: NativeSet) {
    if (actor) await this.assertCases(tx, tenantId, actor, set.sourceCaseIds);
    const links = await tx.caseClient.findMany({ where: { clientId: set.clientId, client: { tenantId }, case: { tenantId }, caseId: { in: set.sourceCaseIds } }, select: { caseId: true } });
    if (new Set(links.map(l => l.caseId)).size !== set.sourceCaseIds.length) throw new ForbiddenException('E2_SOURCE_PARENT_NOT_PROVEN');
  }

  private async assertCases(tx: Prisma.TransactionClient, tenantId: string, actor: NativeStatementActor, caseIds: string[]) {
    const unique = [...new Set(caseIds)];
    const scope = await clientCaseObjectScope(tx, tenantId, actor.userId);
    const visible = await tx.case.count({ where: { AND: [scope, { id: { in: unique } }] } });
    if (visible !== unique.length) throw new ForbiddenException('E2_COMPLETE_CLIENT_SCOPE_REQUIRED');
  }

  private period(input: { periodStart: string; periodEnd: string }) {
    const start = new Date(input.periodStart), end = new Date(input.periodEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) throw new BadRequestException('Geçersiz dönem');
    return { start, end };
  }

  private async lock(tx: Prisma.TransactionClient, tenantId: string, clientId: string, start: Date, end: Date) {
    const period = identifyMonthlyStatementPeriod(start, end);
    const key = period ? nativeMonthlyLockKey(tenantId, clientId, period.periodKey) : `native-statement-set|${tenantId}|${clientId}|${start.toISOString()}|${end.toISOString()}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  private present(set: NativeSet) {
    return { ...set, artifactOutcome: set.documents.every(d => d.artifact) ? 'COMPLETE' as const : 'FAILED' as const,
      documents: set.documents.map(({ id, currency, render, renderHash, artifact }) => ({ id, currency, render, renderHash, artifactSha256: artifact?.sha256 ?? null })) };
  }

  private async withArtifactOutcome(set: NativeSet) {
    try { await this.artifacts(set.tenantId, set.id); return this.present(await this.findSet(this.prisma, set.tenantId, set.id)); }
    catch { return { ...this.present(set), artifactOutcome: 'FAILED' as const, artifactError: 'E2_PDF_SET_NOT_READY' }; }
  }

  private hashBytes(bytes: Uint8Array) { return createHash('sha256').update(bytes).digest('hex'); }
}
