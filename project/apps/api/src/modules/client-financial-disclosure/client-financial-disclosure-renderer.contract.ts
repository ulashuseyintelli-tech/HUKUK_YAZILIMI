import {
  CLIENT_DISCLOSURE_ALLOWED_FIELDS,
  CLIENT_DISCLOSURE_ALLOWED_LINE_FIELDS,
  type ClientDisclosureLineProjection,
  type ClientDisclosureProjection,
} from './client-financial-disclosure-projection.contract';

/**
 * CLIENT-ACCOUNTING-DELIVERY R01 / X2-B01 — deterministic renderer public contract.
 *
 * The renderer boundary is derived only from the existing client projection allowlists.
 * A branded input can only be created by `createClientFinancialDisclosureRenderInput`,
 * whose exact generic contract rejects additional top-level or line keys at compile time.
 */

type AllowedProjectionField = (typeof CLIENT_DISCLOSURE_ALLOWED_FIELDS)[number];
type AllowedLineField = (typeof CLIENT_DISCLOSURE_ALLOWED_LINE_FIELDS)[number];

type Exact<Base, Candidate extends Base> = Candidate &
  Record<Exclude<keyof Candidate, keyof Base>, never>;

export type ClientFinancialDisclosureRenderLineV1 = Readonly<
  Pick<ClientDisclosureLineProjection, AllowedLineField>
>;

type ClientFinancialDisclosureRenderInputShapeV1 = Readonly<
  Omit<Pick<ClientDisclosureProjection, AllowedProjectionField>, 'lines'> & {
    readonly lines: readonly ClientFinancialDisclosureRenderLineV1[];
  }
>;

declare const clientFinancialDisclosureRenderInputBrand: unique symbol;

/**
 * Opaque renderer input. Consumers cannot construct it from a broad ORM/domain object;
 * they must cross the exact allowlist-derived factory boundary below.
 */
export type ClientFinancialDisclosureRenderInputV1 =
  ClientFinancialDisclosureRenderInputShapeV1 & {
    readonly [clientFinancialDisclosureRenderInputBrand]: true;
  };

/**
 * Produces the only valid renderer input shape and freezes its nested line collection.
 * Additional keys — including every current forbidden field — are compile-time errors.
 */
export function createClientFinancialDisclosureRenderInput<
  const TLine extends ClientFinancialDisclosureRenderLineV1,
  const TInput extends Omit<ClientFinancialDisclosureRenderInputShapeV1, 'lines'> & {
    readonly lines: readonly TLine[];
  },
>(
  input: Exact<ClientFinancialDisclosureRenderInputShapeV1, TInput> & {
    readonly lines: readonly Exact<ClientFinancialDisclosureRenderLineV1, TLine>[];
  },
): ClientFinancialDisclosureRenderInputV1 {
  const lines = Object.freeze(
    input.lines.map((line) =>
      Object.freeze({
        type: line.type,
        amount: line.amount,
      }),
    ),
  );

  return Object.freeze({
    disclosureId: input.disclosureId,
    version: input.version,
    fileNumber: input.fileNumber,
    currency: input.currency,
    totalCollected: input.totalCollected,
    clientNetAmount: input.clientNetAmount,
    lines,
    approvedAt: input.approvedAt,
    notifiedAt: input.notifiedAt,
    publishedAt: input.publishedAt,
    isCurrentEffective: input.isCurrentEffective,
    supersedesDisclosureId: input.supersedesDisclosureId,
    supersededByDisclosureId: input.supersededByDisclosureId,
    isReversed: input.isReversed,
    correctionReason: input.correctionReason,
    remittanceStatus: input.remittanceStatus,
  }) as ClientFinancialDisclosureRenderInputV1;
}

export const CLIENT_FINANCIAL_DISCLOSURE_RENDER_CONTRACT_VERSION =
  'ClientFinancialDisclosureRenderV1' as const;

/** X1 preview and publication delivery consume this same frozen semantic output. */
export interface ClientFinancialDisclosureRenderOutputV1 {
  readonly contractVersion: typeof CLIENT_FINANCIAL_DISCLOSURE_RENDER_CONTRACT_VERSION;
  readonly subject: string;
  readonly text: string;
}

/** Freezes the versioned renderer output at the public XL-A boundary. */
export function freezeClientFinancialDisclosureRenderOutput(input: {
  readonly subject: string;
  readonly text: string;
}): ClientFinancialDisclosureRenderOutputV1 {
  return Object.freeze({
    contractVersion: CLIENT_FINANCIAL_DISCLOSURE_RENDER_CONTRACT_VERSION,
    subject: input.subject,
    text: input.text,
  });
}
