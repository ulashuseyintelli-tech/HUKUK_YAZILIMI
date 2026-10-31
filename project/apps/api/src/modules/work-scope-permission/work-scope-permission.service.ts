import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionGrantEffect, PermissionGrantScope, Prisma } from '@prisma/client';
import { isISO8601 } from 'class-validator';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
// F02-B görünürlük: liste servisleriyle AYNI bayrak okuyucuları (saf fonksiyonlar; Nest modülü bağımlılığı değil)
import { EXPENSE_VIEW_ALL_KEY, isExpenseViewScopeEnabled } from '../expense-request/expense-view-scope';
import { TASK_VIEW_ALL_KEY, isTaskViewScopeEnabled } from '../task/task-view-scope';
import { isApprovalIdentityProofRequired } from '../../common/approval-identity';
import {
  WORK_SCOPE_EFFECTS,
  WORK_SCOPE_PERSON_TYPES,
  WORK_SCOPE_VIEW_ALL_KEYS,
  isWorkScopeViewAllKey,
  type WorkScopeEffect,
  type WorkScopePersonType,
  type WorkScopeResolution,
  type WorkScopeViewAllKey,
} from './work-scope-permission.constants';

export interface WorkScopePersonRef {
  personType: WorkScopePersonType;
  personId: string;
}

export interface WorkScopePermissionState {
  personType: WorkScopePersonType;
  personId: string;
  /** Kişi kartına bağlı giriş hesabı var mı (yoksa grant verilemez: önce davet). */
  linked: boolean;
  permissions: Array<{ key: WorkScopeViewAllKey; effect: WorkScopeResolution; validUntil: string | null }>;
}

type Db = Prisma.TransactionClient | PrismaService;

/** F02-B görünürlük (owner ek talimatı 30.10.2026): bir alanda aktöre ŞU AN uygulanan liste kapsamı. */
export type WorkScopeViewMode = 'OFF' | 'TENANT' | 'BOUND';
export interface WorkScopeAreaView { flagEnabled: boolean; resolution: WorkScopeResolution; mode: WorkScopeViewMode }
/** F02 yayın ölçümü (owner 31.10.2026 madde 3): süreç içi ETKİN bayrak değeri — K-A1 kimlik bayrağı da aynı salt okuma uçtan (yalnız boolean). */
export interface WorkScopeViewState { expenses: WorkScopeAreaView; tasks: WorkScopeAreaView; approvalIdentity: { flagEnabled: boolean } }

/**
 * F02-B-1 — görev / masraf "büro geneli görünüm" izinleri (PermissionGrant GLOBAL). Bildirim geçmişi izni servisiyle AYNI
 * desen: yetki (GÜNCEL DB rolü ADMIN) ve yazma AYNI transaction'da, sıralı kullanıcı kilitleri, audit izi, anahtar/etki/kapsam
 * gövdeden seçilemez (yalnız izin verilen anahtarlar).
 *
 * @remarks Çağrıldığı yerler:
 *  - WorkScopePermissionController (GET describe / POST grant / POST revoke) — ürün ekranı (büro ayarları kişi kartı).
 *  - resolve(): ileride görev (GET /tasks) ve masraf (GET /expense-requests) liste kapsamı dilimleri (F02-B-1 dilim 2/3).
 *    Bu servis TEK BAŞINA hiçbir listeyi genişletmez; kapsam etkinleştirmesi ayrı dilim + ayrı yayın yetkisidir.
 */
@Injectable()
export class WorkScopePermissionService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /**
   * Saf okuma: aktörün verilen anahtar için etkin izni. DENY > ALLOW > NONE; yalnız GLOBAL kapsam ve geçerlilik penceresi
   * içindeki satırlar. Rol, rütbe, ReportingLine HESABA GİRMEZ (yalnız açık grant).
   */
  async resolve(db: Db, tenantId: string, subjectUserId: string, key: WorkScopeViewAllKey, now = new Date()): Promise<WorkScopeResolution> {
    if (!tenantId || !subjectUserId) return 'NONE';
    const rows = await db.permissionGrant.findMany({
      where: {
        tenantId, subjectUserId, permissionKey: key, scope: PermissionGrantScope.GLOBAL,
        validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      select: { effect: true, validUntil: true },
    });
    if (rows.some((r) => r.effect === PermissionGrantEffect.DENY)) return 'DENY';
    if (rows.some((r) => r.effect === PermissionGrantEffect.ALLOW)) return 'ALLOW';
    return 'NONE';
  }

  /**
   * F02-B görünürlük (owner ek talimatı 30.10.2026, madde 4): aktörün masraf ve görev listelerinde ŞU AN uygulanan kapsam —
   * liste servislerinin kullandığı AYNI bayrak okuyucuları (`isExpenseViewScopeEnabled` / `isTaskViewScopeEnabled`) ve AYNI
   * `resolve()` ile türetilir; ayrı kaynak yoktur (ekran ↔ liste tutarlılığı yapısal). mode: OFF = kapsam sınırı etkin değil
   * (bayrak kapalı → liste büro geneli) · TENANT = bayrak açık + view_all ALLOW (büro geneli) · BOUND = bayrak açık, ALLOW yok
   * ya da DENY (dosya bağı ∪ oluşturan ∪ atanan/onaylayan). `resolution` bayrak kapalıyken de döner (grant hazırlığı
   * doğrulanabilsin; G3). Saf okuma; grant yazmaz, listeyi değiştirmez; müvekkil kapsamı (K16) ile ilgisi yoktur.
   */
  async viewScopeFor(tenantId: string, actorUserId: string, env: NodeJS.ProcessEnv = process.env): Promise<WorkScopeViewState> {
    const area = async (flagEnabled: boolean, key: WorkScopeViewAllKey): Promise<WorkScopeAreaView> => {
      const resolution = await this.resolve(this.prisma, tenantId, actorUserId, key);
      const mode: WorkScopeViewMode = !flagEnabled ? 'OFF' : resolution === 'ALLOW' ? 'TENANT' : 'BOUND';
      return { flagEnabled, resolution, mode };
    };
    const [expenses, tasks] = await Promise.all([
      area(isExpenseViewScopeEnabled(env), EXPENSE_VIEW_ALL_KEY),
      area(isTaskViewScopeEnabled(env), TASK_VIEW_ALL_KEY),
    ]);
    // Kimlik bayrağı: onay motorunun kullandığı AYNI okuyucu (common/approval-identity) → ekran/ölçüm ↔ yürütme yolu tutarlı; env değeri dökülmez.
    return { expenses, tasks, approvalIdentity: { flagEnabled: isApprovalIdentityProofRequired(env) } };
  }

  /** Caller: controller GET — ADMIN (güncel DB rolü); kişi kartı → bağlı hesap → anahtar başına etkin durum. */
  async describe(tenantId: string, actorUserId: string, ref: unknown): Promise<WorkScopePermissionState> {
    const person = this.personRef(ref);
    await this.assertAdmin(this.prisma, tenantId, actorUserId);
    const subjectUserId = await this.linkedUserId(this.prisma, tenantId, person);
    if (!subjectUserId) {
      return { ...person, linked: false, permissions: WORK_SCOPE_VIEW_ALL_KEYS.map((key) => ({ key, effect: 'NONE' as const, validUntil: null })) };
    }
    const now = new Date();
    const rows = await this.prisma.permissionGrant.findMany({
      where: {
        tenantId, subjectUserId, permissionKey: { in: [...WORK_SCOPE_VIEW_ALL_KEYS] }, scope: PermissionGrantScope.GLOBAL,
        validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      select: { permissionKey: true, effect: true, validUntil: true },
    });
    const permissions = WORK_SCOPE_VIEW_ALL_KEYS.map((key) => {
      const mine = rows.filter((r) => r.permissionKey === key);
      const deny = mine.find((r) => r.effect === PermissionGrantEffect.DENY);
      const allow = mine.find((r) => r.effect === PermissionGrantEffect.ALLOW);
      const winner = deny ?? allow ?? null;
      return { key, effect: (winner ? winner.effect : 'NONE') as WorkScopeResolution, validUntil: winner?.validUntil?.toISOString() ?? null };
    });
    return { ...person, linked: true, permissions };
  }

  /**
   * Caller: controller POST. Durum ATAMA semantiği: aynı anahtarın etkin bütün grant'leri (ALLOW ve DENY) süresi geçmiş yapılır,
   * sonra istenen etki tek satır olarak yazılır — ekranda tek seçim (varsayılan / büro geneli / açık ret) tek gerçek.
   */
  async grant(tenantId: string, actorUserId: string, body: unknown) {
    const input = this.input(body, ['personType', 'personId', 'key', 'effect', 'validUntil', 'reason']);
    const person = this.personRef(input);
    const key = this.key(input.key);
    const effect = this.effect(input.effect);
    const reason = this.reason(input.reason);
    // Girdi doğrulaması transaction AÇILMADAN önce (geçersiz girdi hiçbir kilit/sorgu üretmez).
    const validUntil = input.validUntil === undefined || input.validUntil === null ? null : this.date(input.validUntil, 'validUntil');
    if (validUntil && validUntil <= new Date()) throw new BadRequestException('İzin bitişi mevcut zamandan sonra olmalıdır');
    return this.prisma.$transaction(async (tx) => {
      const subjectUserId = await this.lockAndResolve(tx, tenantId, actorUserId, person, true);
      const now = new Date();
      const expired = await tx.permissionGrant.updateMany({
        where: { tenantId, subjectUserId, permissionKey: key, scope: PermissionGrantScope.GLOBAL, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        data: { validUntil: now },
      });
      const grant = await tx.permissionGrant.create({
        data: {
          tenantId, subjectUserId, permissionKey: key,
          effect: effect === 'DENY' ? PermissionGrantEffect.DENY : PermissionGrantEffect.ALLOW,
          scope: PermissionGrantScope.GLOBAL, validFrom: now, validUntil, grantedByUserId: actorUserId, reason,
        },
      });
      await this.audit.logInTransaction(tx, {
        tenantId, userId: actorUserId, action: 'CREATE', entityType: 'PERMISSION_GRANT', entityId: grant.id,
        newValues: { subjectUserId, personType: person.personType, personId: person.personId, permissionKey: key, effect, scope: 'GLOBAL', validFrom: now.toISOString(), validUntil: validUntil?.toISOString() ?? null, supersededCount: expired.count },
        description: 'Work-scope view-all permission set',
      });
      return { ...person, subjectUserId, key, effect, validUntil: validUntil?.toISOString() ?? null, supersededCount: expired.count, grantId: grant.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  /** Caller: controller POST /revoke — anahtarın etkin bütün grant'lerini (ALLOW ve DENY) süresi geçmiş yapar → varsayılan kapsam. */
  async revoke(tenantId: string, actorUserId: string, body: unknown) {
    const input = this.input(body, ['personType', 'personId', 'key', 'reason']);
    const person = this.personRef(input);
    const key = this.key(input.key);
    const reason = this.reason(input.reason);
    return this.prisma.$transaction(async (tx) => {
      // Pasif hesabın izni de geri alınabilir (granting=false).
      const subjectUserId = await this.lockAndResolve(tx, tenantId, actorUserId, person, false);
      const now = new Date();
      const where: Prisma.PermissionGrantWhereInput = {
        tenantId, subjectUserId, permissionKey: key, scope: PermissionGrantScope.GLOBAL, OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      };
      const before = await tx.permissionGrant.findMany({ where, orderBy: { id: 'asc' }, select: { id: true, effect: true, validUntil: true } });
      const result = await tx.permissionGrant.updateMany({ where, data: { validUntil: now } });
      await this.audit.logInTransaction(tx, {
        tenantId, userId: actorUserId, action: 'UPDATE', entityType: 'PERMISSION_GRANT', entityId: subjectUserId,
        oldValues: { grants: before.map((r) => ({ id: r.id, effect: r.effect, validUntil: r.validUntil?.toISOString() ?? null })) },
        newValues: { subjectUserId, personType: person.personType, personId: person.personId, permissionKey: key, scope: 'GLOBAL', validUntil: now.toISOString(), expiredCount: result.count },
        description: 'Work-scope view-all permission reverted to default scope',
        metadata: { reasonPresent: reason !== null, reasonLength: reason?.length ?? 0, reasonHash: reason === null ? null : createHash('sha256').update(reason).digest('hex') },
      });
      return { ...person, subjectUserId, key, revoked: result.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  /** Callers: grant/revoke. Danışma kilidi + sıralı kullanıcı kilitleri; ADMIN rolü AYNI tx'te DB'den okunur; kişi kartı → bağlı hesap. */
  private async lockAndResolve(tx: Prisma.TransactionClient, tenantId: string, actorUserId: string, person: WorkScopePersonRef, granting: boolean): Promise<string> {
    if ([tenantId, actorUserId].some((v) => typeof v !== 'string' || v.length === 0 || v !== v.trim())) throw new ForbiddenException({ code: 'WORK_SCOPE_ADMIN_REQUIRED' });
    const lockKey = `work-scope-permission:${tenantId}:${person.personType}:${person.personId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    await this.assertAdmin(tx, tenantId, actorUserId);
    const subjectUserId = await this.linkedUserId(tx, tenantId, person);
    if (!subjectUserId) throw new ConflictException({ code: 'WORK_SCOPE_PERSON_NOT_LINKED', message: 'Bu kişinin giriş hesabı yok; önce davet edin' });
    const users = [...new Set([actorUserId, subjectUserId])].sort();
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(users)}) ORDER BY "id" FOR UPDATE`;
    const subject = await tx.user.findFirst({ where: { id: subjectUserId, tenantId, ...(granting ? { isActive: true } : {}) }, select: { id: true } });
    if (!subject) throw new NotFoundException('İzin kullanıcısı bulunamadı');
    return subjectUserId;
  }

  /** Yetki: yalnız GÜNCEL DB rolü ADMIN, aktif, aynı kiracı (token iddiası DEĞİL). */
  private async assertAdmin(db: Db, tenantId: string, actorUserId: string): Promise<void> {
    const actor = await db.user.findFirst({ where: { id: actorUserId, tenantId, isActive: true, role: 'ADMIN' }, select: { id: true } });
    if (!actor) throw new ForbiddenException({ code: 'WORK_SCOPE_ADMIN_REQUIRED' });
  }

  /** Kişi kartı (aynı kiracı) → bağlı giriş hesabı; kart yoksa 404, hesap yoksa null. */
  private async linkedUserId(db: Db, tenantId: string, person: WorkScopePersonRef): Promise<string | null> {
    const row = person.personType === 'lawyer'
      ? await db.lawyer.findFirst({ where: { id: person.personId, tenantId }, select: { userId: true } })
      : await db.staffMember.findFirst({ where: { id: person.personId, tenantId }, select: { userId: true } });
    if (!row) throw new NotFoundException('Kişi kartı bulunamadı');
    return row.userId ?? null;
  }

  private input(body: unknown, allowed: string[]): Record<string, unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => !allowed.includes(k))) throw new BadRequestException('İzin girdisi geçersiz');
    return body as Record<string, unknown>;
  }

  private personRef(value: unknown): WorkScopePersonRef {
    const v = (value ?? {}) as Record<string, unknown>;
    const personType = v.personType;
    const personId = v.personId;
    if (typeof personType !== 'string' || !(WORK_SCOPE_PERSON_TYPES as readonly string[]).includes(personType)) throw new BadRequestException('personType lawyer | staff olmalıdır');
    if (typeof personId !== 'string' || personId.length === 0 || personId !== personId.trim()) throw new BadRequestException('personId gerekir');
    return { personType: personType as WorkScopePersonType, personId };
  }

  private key(value: unknown): WorkScopeViewAllKey {
    if (!isWorkScopeViewAllKey(value)) throw new BadRequestException(`key şunlardan biri olmalıdır: ${WORK_SCOPE_VIEW_ALL_KEYS.join(', ')}`);
    return value;
  }

  private effect(value: unknown): WorkScopeEffect {
    if (typeof value !== 'string' || !(WORK_SCOPE_EFFECTS as readonly string[]).includes(value)) throw new BadRequestException('effect ALLOW | DENY olmalıdır');
    return value as WorkScopeEffect;
  }

  private reason(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new BadRequestException('İzin gerekçesi metin olmalıdır');
    return value;
  }

  private date(value: unknown, field: string): Date {
    if (typeof value !== 'string' || !isISO8601(value, { strict: true, strictSeparator: true }) || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new BadRequestException(`${field} saat dilimli ISO tarih olmalıdır`);
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException(`${field} geçersiz`);
    return date;
  }
}
