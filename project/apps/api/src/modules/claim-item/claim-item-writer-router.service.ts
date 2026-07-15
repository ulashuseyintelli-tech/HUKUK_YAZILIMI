import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import {
  buildClaimItemWriteCommand,
  type ClaimItemWriteCommand,
  type ClaimItemWriteOperation,
} from './claim-item-write-command';
import {
  type ClaimItemWriteGateResult,
  ClaimItemWriteGateService,
} from './claim-item-write-gate.service';
import { ClaimItemSourceIntegrityGuard } from './claim-item-source-integrity.guard';
import {
  CLAIM_ITEM_HUMAN_WRITE_POLICY_REF,
  CLAIM_ITEM_SYSTEM_WRITER_ROUTES,
  type ClaimItemSystemWriterRoute,
} from './claim-item-writer-routes';

type ClaimItemWriterDatabase = PrismaService | Prisma.TransactionClient;

interface ClaimItemRouteBase {
  readonly tenantId: string;
  readonly caseId: string;
  readonly sourceId: string;
  readonly sourceSlot?: string;
  readonly initiatedByUserId: string;
  readonly effectiveAt?: Date;
  readonly correlationId?: string;
  readonly causationId?: string;
}

interface EvaluateHumanClaimItemWriteInput {
  readonly operation: ClaimItemWriteOperation;
  readonly tenantId: string;
  readonly caseId: string;
  readonly actorUserId: string;
  readonly claimItemId?: string;
  readonly payload: Record<string, unknown>;
  readonly currency?: string;
}

interface CreateSystemClaimItemInput extends ClaimItemRouteBase {
  readonly route: ClaimItemSystemWriterRoute;
  readonly data: Record<string, unknown>;
  readonly currency?: string;
}

interface UpdateSystemClaimItemInput extends ClaimItemRouteBase {
  readonly route: ClaimItemSystemWriterRoute;
  readonly claimItemId: string;
  readonly data: Record<string, unknown>;
  readonly currency?: string;
}

interface CancelSystemClaimItemInput extends ClaimItemRouteBase {
  readonly route: ClaimItemSystemWriterRoute;
  readonly claimItemId: string;
  readonly currency?: string;
}

/**
 * RCV-P2-WS01-P03 writer boundary.
 *
 * The router is the only P03 surface that turns an explicitly classified internal
 * route into a ClaimItem persistence call. Human commands are evaluated here but
 * remain subject to the existing ClaimItem/OfficeApproval application flow.
 */
@Injectable()
export class ClaimItemWriterRouterService {
  private readonly sourceIntegrity = new ClaimItemSourceIntegrityGuard();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: ClaimItemWriteGateService,
  ) {}

  async evaluateHuman(
    input: EvaluateHumanClaimItemWriteInput,
    database: ClaimItemWriterDatabase = this.prisma,
  ): Promise<ClaimItemWriteGateResult> {
    const occurredAt = new Date().toISOString();
    const command = buildClaimItemWriteCommand({
      operation: input.operation,
      ...(input.claimItemId === undefined ? {} : { claimItemId: input.claimItemId }),
      envelope: {
        tenantId: input.tenantId,
        caseId: input.caseId,
        actor: { type: 'HUMAN', userId: input.actorUserId },
        correlationId: `claim-item-human:${randomUUID()}`,
        idempotencyKey: this.buildIdempotencyKey(
          'HUMAN',
          input.operation,
          input.claimItemId ?? input.caseId,
          input.payload,
        ),
        occurredAt,
        effectiveAt: occurredAt,
        source: {
          sourceType: 'USER_COMMAND',
          sourceId: input.claimItemId ?? input.caseId,
          evidenceRefs: [],
        },
        authority: { policyRef: CLAIM_ITEM_HUMAN_WRITE_POLICY_REF },
        ...(input.currency === undefined ? {} : { currency: input.currency }),
      },
      payload: input.payload,
    });

    return this.gate.evaluate(command, database);
  }

  async createSystemClaimItem<T>(
    input: CreateSystemClaimItemInput,
    database: ClaimItemWriterDatabase = this.prisma,
  ): Promise<T> {
    if (database === this.prisma) {
      return this.prisma.$transaction((tx) => this.createSystemClaimItem<T>(input, tx));
    }
    const command = await this.assertSystemRouteAllowed(
      'CREATE',
      input,
      undefined,
      input.data,
      database,
    );
    const data = await this.sourceIntegrity.prepareSystemCreate(
      { ...input, envelope: command.envelope },
      database,
    );
    return (database as any).claimItem.create({ data }) as Promise<T>;
  }

  async updateSystemClaimItem<T>(
    input: UpdateSystemClaimItemInput,
    database: ClaimItemWriterDatabase = this.prisma,
  ): Promise<T> {
    await this.assertSystemRouteAllowed(
      'UPDATE',
      input,
      input.claimItemId,
      input.data,
      database,
    );
    await this.sourceIntegrity.assertSystemMutation(input, database);
    return (database as any).claimItem.update({
      where: { id: input.claimItemId },
      data: input.data,
    }) as Promise<T>;
  }

  async cancelSystemClaimItem<T>(
    input: CancelSystemClaimItemInput,
    database: ClaimItemWriterDatabase = this.prisma,
  ): Promise<T> {
    const payload = { status: 'CANCELLED' };
    await this.assertSystemRouteAllowed(
      'CANCEL',
      input,
      input.claimItemId,
      payload,
      database,
    );
    await this.sourceIntegrity.assertSystemMutation(input, database);
    return (database as any).claimItem.update({
      where: { id: input.claimItemId },
      data: payload,
    }) as Promise<T>;
  }

  private async assertSystemRouteAllowed(
    operation: ClaimItemWriteOperation,
    input: ClaimItemRouteBase & {
      readonly route: ClaimItemSystemWriterRoute;
      readonly currency?: string;
    },
    claimItemId: string | undefined,
    payload: Record<string, unknown>,
    database: ClaimItemWriterDatabase,
  ): Promise<ClaimItemWriteCommand<Record<string, unknown>>> {
    const route = CLAIM_ITEM_SYSTEM_WRITER_ROUTES[input.route];
    const occurredAt = new Date().toISOString();
    const command = buildClaimItemWriteCommand({
      operation,
      ...(claimItemId === undefined ? {} : { claimItemId }),
      envelope: {
        tenantId: input.tenantId,
        caseId: input.caseId,
        actor: { type: 'SYSTEM', system: input.route },
        correlationId:
          input.correlationId ?? this.buildSystemCorrelationId(input),
        ...(input.causationId === undefined
          ? {}
          : { causationId: input.causationId }),
        idempotencyKey: this.buildIdempotencyKey(
          input.route,
          operation,
          `${input.sourceId}:${input.sourceSlot ?? 'PRIMARY'}`,
          payload,
        ),
        occurredAt,
        effectiveAt: (input.effectiveAt ?? new Date(occurredAt)).toISOString(),
        source: {
          sourceType: route.sourceType,
          sourceId: input.sourceId,
          evidenceRefs: [`user:${input.initiatedByUserId}`],
        },
        authority: { policyRef: route.policyRef },
        ...(input.currency === undefined ? {} : { currency: input.currency }),
      },
      payload,
    });

    const result = await this.gate.evaluate(command, database);
    if (result.outcome === 'DENIED') {
      throw new ForbiddenException(
        `ClaimItem ${input.route} route denied: ${result.reasonCode}`,
      );
    }
    if (result.outcome !== 'DIRECT_ALLOWED' || result.actorType !== 'SYSTEM') {
      throw new ConflictException(
        `ClaimItem ${input.route} route did not produce a system direct-allow result.`,
      );
    }
    return command;
  }

  private buildSystemCorrelationId(
    input: ClaimItemRouteBase & { readonly route: ClaimItemSystemWriterRoute },
  ): string {
    const lineage = stableJsonHash({
      version: 1,
      tenantId: input.tenantId,
      caseId: input.caseId,
      route: input.route,
      sourceId: input.sourceId,
      sourceSlot: input.sourceSlot ?? 'PRIMARY',
    });
    return `claim-item-source:${lineage}`;
  }

  private buildIdempotencyKey(
    authority: string,
    operation: ClaimItemWriteOperation,
    sourceId: string,
    payload: Record<string, unknown>,
  ): string {
    // JSON's native Date/Decimal serialization is applied before canonical key sorting;
    // otherwise object-valued temporal fields collapse to an empty record in sortDeep.
    const serializablePayload = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    const fingerprint = stableJsonHash({ authority, operation, sourceId, payload: serializablePayload });
    return `claim-item:${operation.toLowerCase()}:${fingerprint}`;
  }
}
