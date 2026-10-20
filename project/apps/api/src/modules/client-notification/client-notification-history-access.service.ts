import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { maskIban } from "../../common/pii-mask.util";
import { PrismaService } from "../../prisma/prisma.service";
import { CASE_ASSIGNMENT_COUNTED_ROLES } from "../lawyer/acting-lawyer-resolver.service";
import { NOTIFICATION_HISTORY_AUDIT_PERMISSION } from "./notification-history-permission.service";

type HistoryTarget = { kind: "client" | "case"; id: string };
type HistoryQuery = { limit?: unknown; cursor?: unknown };
type HistoryKey = { id: string; createdAt: Date; full: boolean };

const STATUS_FIELDS = {
  id: true, caseId: true, type: true, channel: true, status: true,
  sentAt: true, deliveredAt: true, createdAt: true,
} as const;

@Injectable()
export class ClientNotificationHistoryAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Called only by ClientNotificationController's client/case history GET handlers. */
  async read(tenantId: string, userId: string, target: HistoryTarget, query: HistoryQuery = {}) {
    const { limit, cursor } = this.parseQuery(target, query);
    const empty = { items: [], nextCursor: null as string | null };
    if (!tenantId || !userId || !target.id) return empty;

    // Actor, grants, assignments, page keys and field projection share one read snapshot.
    return this.prisma.$transaction(async tx => {
      const actor = await tx.user.findUnique({
        where: { id: userId },
        select: {
          tenantId: true, role: true, isActive: true,
          lawyer: { select: { id: true, tenantId: true, isActive: true, lawyerRank: true, role: true } },
          staffMember: { select: { id: true, tenantId: true, isActive: true } },
        },
      });
      if (!actor?.isActive || actor.tenantId !== tenantId || actor.role === "VIEWER") return empty;
      let global = actor.role === "ADMIN";
      if (!global) {
        if (Boolean(actor.lawyer) === Boolean(actor.staffMember)) return empty;
        const profile = actor.lawyer ?? actor.staffMember;
        if (!profile?.isActive || profile.tenantId !== tenantId) return empty;
        const now = new Date();
        const grants = await tx.permissionGrant.findMany({ where: {
          tenantId, subjectUserId: userId, permissionKey: NOTIFICATION_HISTORY_AUDIT_PERMISSION,
          scope: "GLOBAL", validFrom: { lte: now },
          OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        }, select: { effect: true } });
        global = grants.some(g => g.effect === "ALLOW") && !grants.some(g => g.effect === "DENY");
      }

      const lawyer = actor.lawyer;
      const full = global ? Prisma.sql`TRUE` : lawyer && lawyer.lawyerRank !== "INTERN" && lawyer.role !== "INTERN"
        ? Prisma.sql`EXISTS (SELECT 1 FROM "CaseLawyer" cl WHERE cl."caseId" = n."caseId"
            AND cl."lawyerId" = ${lawyer.id} AND cl."role"::text IN (${Prisma.join([...CASE_ASSIGNMENT_COUNTED_ROLES])}))`
        : Prisma.sql`FALSE`;
      const statusOnly = !global && actor.staffMember
        ? Prisma.sql`(n."type" = 'MASRAF_ISTEK' AND EXISTS (SELECT 1 FROM "CaseStaff" cs
            WHERE cs."caseId" = n."caseId" AND cs."staffMemberId" = ${actor.staffMember.id}
            AND cs."roleOnCase" = 'MUHASEBE'))`
        : Prisma.sql`FALSE`;
      const objectFilter = target.kind === "client"
        ? Prisma.sql`n."clientId" = ${target.id}` : Prisma.sql`n."caseId" = ${target.id}`;
      const after = cursor ? Prisma.sql`AND (n."createdAt" < ${cursor.createdAt}
        OR (n."createdAt" = ${cursor.createdAt} AND n."id" < ${cursor.id}))` : Prisma.empty;

      // ClientNotification.caseId has no FK. Validate its tenant AND client association
      // before pagination. Select only keys here; restricted readers never fetch content.
      const keys = await tx.$queryRaw<HistoryKey[]>(Prisma.sql`
        SELECT n."id", n."createdAt", (${full}) AS "full"
        FROM "ClientNotification" n
        JOIN "Client" client ON client."id" = n."clientId" AND client."tenantId" = ${tenantId}
        WHERE n."tenantId" = ${tenantId} AND ${objectFilter}
          AND ((${full}) OR (${statusOnly}))
          AND ((n."caseId" IS NULL AND ${global}) OR EXISTS (
            SELECT 1 FROM "Case" c WHERE c."id" = n."caseId" AND c."tenantId" = ${tenantId}
              AND (c."clientId" = n."clientId" OR EXISTS (SELECT 1 FROM "CaseClient" cc
                WHERE cc."caseId" = c."id" AND cc."clientId" = n."clientId"))))
          ${after}
        ORDER BY n."createdAt" DESC, n."id" DESC LIMIT ${limit + 1}`);
      const page = keys.slice(0, limit);
      const fullIds = page.filter(k => k.full).map(k => k.id);
      const restrictedIds = page.filter(k => !k.full).map(k => k.id);
      const fullRows = fullIds.length ? await tx.clientNotification.findMany({
        where: { tenantId, id: { in: fullIds } },
        ...(target.kind === "case" ? { include: { client: { select: {
          id: true, displayName: true, firstName: true, lastName: true,
        } } } } : {}),
      }) : [];
      const restrictedRows = restrictedIds.length ? await tx.clientNotification.findMany({
        where: { tenantId, id: { in: restrictedIds } }, select: STATUS_FIELDS,
      }) : [];
      const rows = new Map([...fullRows.map(row => this.maskIbanForRead(row)), ...restrictedRows].map(row => [row.id, row]));
      const last = page[page.length - 1];
      return {
        items: page.map(key => rows.get(key.id)!),
        nextCursor: keys.length > limit && last ? Buffer.from(JSON.stringify({
          target: `${target.kind}:${target.id}`, createdAt: last.createdAt.toISOString(), id: last.id,
        })).toString("base64url") : null,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  /** Caller: read; response-only O-4 projection, never stored or sent content. */
  private maskIbanForRead<T extends { body?: string | null; metadata?: Prisma.JsonValue }>(row: T): T {
    const metadata = row.metadata;
    const tokens = metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata.tokens : undefined;
    return {
      ...row,
      ...(typeof row.body === "string" ? {
        body: row.body.replace(/\bTR(?:[\s]*\d){24}(?!\d)/gi, iban => maskIban(iban)),
      } : {}),
      ...(tokens && typeof tokens === "object" && !Array.isArray(tokens) && typeof tokens.officeIban === "string" && tokens.officeIban.trim() ? {
        metadata: { ...(metadata as Prisma.JsonObject), tokens: { ...tokens, officeIban: maskIban(tokens.officeIban) } },
      } : {}),
    };
  }

  private parseQuery(target: HistoryTarget, query: HistoryQuery) {
    const raw = query.limit ?? "50";
    if (typeof raw !== "string" || !/^[1-9]\d?$/.test(raw) || Number(raw) > 50) {
      throw new BadRequestException("limit must be an integer between 1 and 50");
    }
    let cursor: { id: string; createdAt: Date } | null = null;
    if (query.cursor !== undefined) {
      try {
        if (typeof query.cursor !== "string" || query.cursor.length > 1024 || !/^[\w-]+$/.test(query.cursor)) throw new Error();
        const value = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"));
        if (value.target !== `${target.kind}:${target.id}` || typeof value.id !== "string" || !value.id || value.id.length > 100
          || typeof value.createdAt !== "string" || new Date(value.createdAt).toISOString() !== value.createdAt) throw new Error();
        cursor = { id: value.id, createdAt: new Date(value.createdAt) };
      } catch { throw new BadRequestException("Invalid notification history cursor"); }
    }
    return { limit: Number(raw), cursor };
  }
}
