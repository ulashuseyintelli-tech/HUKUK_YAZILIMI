export const CAPABILITY_STATUSES = [
  'PRESENT_IN_SOURCE',
  'PRESENT_IN_DIST',
  'ABSENT',
  'STALE',
  'UNKNOWN',
] as const;

export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export type ProgramClass =
  | 'OFFICE'
  | 'CLIENT'
  | 'DEBTOR'
  | 'RCV_COL'
  | 'SHARED_CONTROL_PLANE'
  | 'UNKNOWN';

export interface SourceEvidence {
  path: string;
  canonicalBlob: string | null;
  runtimeBlob: string | null;
}

export interface DistEvidence {
  path: string;
  exists: boolean;
  sha256: string | null;
  requiredMarkers: string[];
  missingMarkers: string[];
}

export interface AncestryEvidence {
  commit: string;
  inRuntimeHead: boolean | null;
}

export interface ConsumerEvidence {
  state: 'PRESENT' | 'ABSENT' | 'UNKNOWN';
  processIds: number[];
  reason: string;
}

export interface CapabilityEvidence {
  id: string;
  sources: SourceEvidence[];
  dist: DistEvidence[];
  ancestry: AncestryEvidence[];
  consumer: ConsumerEvidence;
}

export interface CapabilityEvaluation {
  id: string;
  status: CapabilityStatus;
  reasons: string[];
}

/**
 * Source, dist, ancestry ve consumer katmanlari kasitli olarak ayri tutulur.
 * Genel status yalniz repository/runtime artifact mevcudiyetini siniflandirir;
 * calisan consumer yoklugu dist varligini ABSENT'e cevirmez.
 */
export function evaluateCapability(evidence: CapabilityEvidence): CapabilityEvaluation {
  const reasons: string[] = [];
  const canonicalUnavailable = evidence.sources.some((source) => source.canonicalBlob === null);
  if (canonicalUnavailable) {
    return {
      id: evidence.id,
      status: 'UNKNOWN',
      reasons: ['CANONICAL_SOURCE_UNAVAILABLE'],
    };
  }

  const runtimePresent = evidence.sources.filter((source) => source.runtimeBlob !== null).length;
  const allRuntimeSourcesPresent = runtimePresent === evidence.sources.length;
  const noRuntimeSourcesPresent = runtimePresent === 0;
  const allSourceBlobsEqual = evidence.sources.every(
    (source) => source.runtimeBlob !== null && source.runtimeBlob === source.canonicalBlob,
  );

  const distPresent = evidence.dist.filter((item) => item.exists).length;
  const noDistPresent = distPresent === 0;
  const allDistPresent = distPresent === evidence.dist.length;
  const allDistMarkersPresent = evidence.dist.every(
    (item) => item.exists && item.sha256 !== null && item.missingMarkers.length === 0,
  );

  if (noRuntimeSourcesPresent && noDistPresent) {
    reasons.push('RUNTIME_SOURCE_ABSENT', 'RUNTIME_DIST_ABSENT');
    return { id: evidence.id, status: 'ABSENT', reasons };
  }

  if (!allRuntimeSourcesPresent) reasons.push('RUNTIME_SOURCE_PARTIAL');
  if (allRuntimeSourcesPresent && !allSourceBlobsEqual) reasons.push('RUNTIME_SOURCE_BLOB_DRIFT');
  if (!allDistPresent) reasons.push('RUNTIME_DIST_PARTIAL');
  if (evidence.dist.some((item) => item.exists && item.missingMarkers.length > 0)) {
    reasons.push('RUNTIME_DIST_MARKER_MISSING');
  }

  if (allSourceBlobsEqual && allDistMarkersPresent) {
    return { id: evidence.id, status: 'PRESENT_IN_DIST', reasons: ['SOURCE_PARITY', 'DIST_MARKERS_PRESENT'] };
  }

  if (allSourceBlobsEqual && noDistPresent) {
    return { id: evidence.id, status: 'PRESENT_IN_SOURCE', reasons: ['SOURCE_PARITY', 'RUNTIME_DIST_ABSENT'] };
  }

  if (reasons.length > 0) {
    return { id: evidence.id, status: 'STALE', reasons };
  }

  return { id: evidence.id, status: 'UNKNOWN', reasons: ['EVIDENCE_INSUFFICIENT'] };
}

const MIGRATION_PREFIXES: Array<[RegExp, ProgramClass]> = [
  [/(?:^|_)(?:office|staff|lawyer)(?:_|$)/i, 'OFFICE'],
  [/(?:^|_)client(?:_|$)/i, 'CLIENT'],
  [/(?:^|_)(?:debtor|service_occurrence|cpe)(?:_|$)/i, 'DEBTOR'],
  [/(?:^|_)(?:rcv|rc_col|claim|legal_application|collection|bank)(?:_|$)/i, 'RCV_COL'],
];

/**
 * Bu siniflandirici positive allowlist'tir. Sahibi path'ten kanitlanamayan her sey
 * UNKNOWN kalir; OFFICE'e veya baska bir programa tahminle atanmaz.
 */
export function classifyDeltaPath(rawPath: string): ProgramClass {
  const path = rawPath.replace(/\\/g, '/');

  if (
    path === 'AGENTS.md' ||
    path.startsWith('.github/') ||
    path.startsWith('project/docs/governance/') ||
    path.startsWith('project/scripts/') ||
    path.startsWith('project/apps/api/ci-manifests/')
  ) {
    return 'SHARED_CONTROL_PLANE';
  }

  const migrationMatch = path.match(
    /^project\/apps\/api\/prisma\/migrations\/([^/]+)\/migration\.sql$/,
  );
  if (migrationMatch) {
    for (const [pattern, program] of MIGRATION_PREFIXES) {
      if (pattern.test(migrationMatch[1])) return program;
    }
    return 'UNKNOWN';
  }

  if (
    /\/modules\/(?:office|lawyer|staff|reporting-line|office-approval)(?:\/|$)/i.test(path) ||
    /\/scripts\/office-(?:cap02|runtime|release)-/i.test(path)
  ) {
    return 'OFFICE';
  }

  if (/\/modules\/(?:client|client-portal|client-statement)(?:\/|$)/i.test(path)) {
    return 'CLIENT';
  }

  if (/\/modules\/(?:debtor|service-occurrence)(?:\/|$)/i.test(path)) {
    return 'DEBTOR';
  }

  if (
    /\/modules\/(?:receivable|claim-item|collection|ledger|legal-application)(?:\/|$)/i.test(path)
  ) {
    return 'RCV_COL';
  }

  return 'UNKNOWN';
}

export function redactProcessSignature(name: string, commandLine: string): string {
  const normalized = commandLine.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('dist/apps/api/src/main.js')) return `${name}:api-main`;
  if (normalized.includes('next') && normalized.includes('start')) return `${name}:next-start`;
  return `${name}:other`;
}
