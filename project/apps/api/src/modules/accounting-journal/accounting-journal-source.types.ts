import type {
  AccountingJournalSourceType,
  JournalMetadata,
  JournalMetadataValue,
  JournalSource,
  JournalSourceAction,
} from './accounting-journal.types';

export const JOURNAL_SOURCE_ERROR_CODES = [
  'SOURCE_NOT_FOUND',
  'SOURCE_NOT_FINAL',
  'TENANT_MISMATCH',
  'UNSUPPORTED_SOURCE_ACTION',
  'SOURCE_VERSION_UNAVAILABLE',
  'SOURCE_HASH_FAILED',
  'INCOMPLETE_SOURCE_DIMENSIONS',
  'UNSUPPORTED_SOURCE_TYPE',
  'NON_JOURNALABLE_SOURCE',
] as const;

export type JournalSourceErrorCode = (typeof JOURNAL_SOURCE_ERROR_CODES)[number];

export interface JournalSourceError {
  code: JournalSourceErrorCode;
  message: string;
  path: string | null;
  details: JournalMetadata;
  authorizationFailure: false;
}

export type JournalSourceIdentityValidationResult =
  | { ok: true; identity: JournalSourceIdentity }
  | { ok: false; errors: JournalSourceError[] };

export interface JournalSourceIdentity {
  tenantId: string;
  sourceType: AccountingJournalSourceType;
  sourceId: string;
  sourceAction: JournalSourceAction;
  sourceVersion: string;
}

export type JournalSourceRelationData = Record<string, JournalMetadataValue>;

export interface JournalSourceSnapshot<
  TPayload = unknown,
  TRelationData extends JournalSourceRelationData = JournalSourceRelationData,
> {
  identity: JournalSourceIdentity;
  tenantId: string;
  occurredAt: string;
  effectiveDate: string;
  actorId: string | null;
  currency: string;
  sourceHash: string | null;
  metadata: JournalMetadata;
  payload: TPayload;
  relationData?: TRelationData;
}

export interface JournalSourceLoadRequest<TIdentity extends JournalSourceIdentity = JournalSourceIdentity> {
  tenantId: string;
  identity: TIdentity;
}

export type JournalSourceLoadResult<TSnapshot extends JournalSourceSnapshot = JournalSourceSnapshot> =
  | { ok: true; snapshot: TSnapshot }
  | { ok: false; errors: JournalSourceError[] };

export interface JournalSourceLoader<TSnapshot extends JournalSourceSnapshot = JournalSourceSnapshot> {
  load(request: JournalSourceLoadRequest): Promise<JournalSourceLoadResult<TSnapshot>>;
}

export type JournalSourceAdapterResult<TSource extends JournalSource = JournalSource> =
  | { ok: true; source: TSource }
  | { ok: false; errors: JournalSourceError[] };

export interface JournalSourceAdapter<
  TSnapshot extends JournalSourceSnapshot = JournalSourceSnapshot,
  TSource extends JournalSource = JournalSource,
> {
  adapt(snapshot: TSnapshot): JournalSourceAdapterResult<TSource>;
}

export type JournalSourceAdapterFn<
  TSnapshot extends JournalSourceSnapshot = JournalSourceSnapshot,
  TSource extends JournalSource = JournalSource,
> = (snapshot: TSnapshot) => JournalSourceAdapterResult<TSource>;

const SUPPORTED_SOURCE_TYPES: ReadonlyArray<AccountingJournalSourceType> = [
  'COLLECTION_DISPOSITION_LINE',
  'CLIENT_PAYOUT',
  'CLIENT_OFFSET',
  'BALANCE_LEDGER',
  'EXPENSE_REQUEST',
  'ACCOUNTING_JOURNAL_ENTRY',
];

const SUPPORTED_SOURCE_ACTIONS: ReadonlyArray<JournalSourceAction> = [
  'posted',
  'recorded',
  'apply',
  'reversal',
  'cancel',
  'manual-adjustment',
];

export function createJournalSourceError(
  code: JournalSourceErrorCode,
  message: string,
  options: { path?: string | null; details?: JournalMetadata } = {},
): JournalSourceError {
  return {
    code,
    message,
    path: options.path ?? null,
    details: options.details ?? {},
    authorizationFailure: false,
  };
}

export function isJournalSourceErrorCode(code: string): code is JournalSourceErrorCode {
  return JOURNAL_SOURCE_ERROR_CODES.includes(code as JournalSourceErrorCode);
}

export function validateJournalSourceIdentity(
  identity: Partial<JournalSourceIdentity>,
): JournalSourceIdentityValidationResult {
  const errors: JournalSourceError[] = [];

  if (!identity.tenantId) {
    errors.push(createJournalSourceError('TENANT_MISMATCH', 'Journal source identity requires tenantId.', {
      path: 'tenantId',
    }));
  }

  if (!identity.sourceType || !SUPPORTED_SOURCE_TYPES.includes(identity.sourceType)) {
    errors.push(
      createJournalSourceError('UNSUPPORTED_SOURCE_TYPE', 'Journal source identity requires a supported sourceType.', {
        path: 'sourceType',
      }),
    );
  }

  if (!identity.sourceId) {
    errors.push(createJournalSourceError('INCOMPLETE_SOURCE_DIMENSIONS', 'Journal source identity requires sourceId.', {
      path: 'sourceId',
    }));
  }

  if (!identity.sourceAction || !SUPPORTED_SOURCE_ACTIONS.includes(identity.sourceAction)) {
    errors.push(
      createJournalSourceError(
        'UNSUPPORTED_SOURCE_ACTION',
        'Journal source identity requires a supported sourceAction.',
        {
          path: 'sourceAction',
        },
      ),
    );
  }

  if (!identity.sourceVersion) {
    errors.push(
      createJournalSourceError('SOURCE_VERSION_UNAVAILABLE', 'Journal source identity requires sourceVersion.', {
        path: 'sourceVersion',
      }),
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    identity: identity as JournalSourceIdentity,
  };
}
