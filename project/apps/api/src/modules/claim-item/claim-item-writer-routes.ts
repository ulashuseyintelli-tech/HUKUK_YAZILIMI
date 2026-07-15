import { type ClaimItemWriteOperation } from './claim-item-write-command';

export const CLAIM_ITEM_HUMAN_WRITE_POLICY_REF = 'CLAIM_ITEM_WRITE_POLICY_V1' as const;

export const CLAIM_ITEM_SYSTEM_WRITER_ROUTES = {
  DUE_BRIDGE: {
    sourceType: 'DUE_BRIDGE',
    policyRef: 'REC-AUTH-008',
    operations: ['CREATE', 'UPDATE', 'CANCEL'],
  },
  CASE_INSTRUMENT_GENERATOR: {
    sourceType: 'CASE_INSTRUMENT',
    policyRef: 'REC-AUTH-002',
    operations: ['CREATE'],
  },
  DOCUMENT_AUTO_GENERATOR: {
    sourceType: 'DOCUMENT_AUTO_GENERATOR',
    policyRef: 'REC-AUTH-002',
    operations: ['CREATE'],
  },
  RULE_ENGINE_GENERATOR: {
    sourceType: 'RULE_ENGINE_GENERATOR',
    policyRef: 'REC-AUTH-002',
    operations: ['CREATE'],
  },
  PRECAUTIONARY_COST_WRITER: {
    sourceType: 'PRECAUTIONARY_COST',
    policyRef: 'REC-AUTH-002',
    operations: ['CREATE'],
  },
} as const satisfies Record<
  string,
  Readonly<{
    sourceType: string;
    policyRef: string;
    operations: readonly ClaimItemWriteOperation[];
  }>
>;

export type ClaimItemSystemWriterRoute = keyof typeof CLAIM_ITEM_SYSTEM_WRITER_ROUTES;

export function isClaimItemSystemWriterRoute(
  value: string,
): value is ClaimItemSystemWriterRoute {
  return Object.prototype.hasOwnProperty.call(CLAIM_ITEM_SYSTEM_WRITER_ROUTES, value);
}
