/**
 * FAZ-1b backfill APPLY — saf çekirdek (Prisma/IO'dan bağımsız, test edilebilir).
 */

export interface BackfillCandidate {
  id: string;
  tenantId: string;
  caseId: string;
  status: string;
  totalAmount: unknown;
  paidTotal: unknown;
  currency: string;
  createdAt: Date;
}

export interface ParsedArgs {
  actorEmail: string | null;
  confirm: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  let actorEmail: string | null = null;
  let confirm = false;
  for (const arg of argv) {
    if (arg.startsWith('--actor-email=')) {
      actorEmail = arg.slice('--actor-email='.length).trim();
    } else if (arg === '--confirm') {
      confirm = true;
    }
  }
  return { actorEmail, confirm };
}

export interface PartitionResult<T extends { tenantId: string }> {
  applicable: T[];
  skipped: T[];
}

/**
 * Her aday, KENDİ tenant'ında actor resolve edilebiliyorsa "applicable"; edilemiyorsa "skipped".
 * Yanlış tenant'taki bir kullanıcıya atfetmektense dokunmamak tercih edilir (bkz. script header).
 */
export function partitionByActorAvailability<T extends { tenantId: string }>(
  candidates: T[],
  actorByTenant: Map<string, string>,
): PartitionResult<T> {
  const applicable: T[] = [];
  const skipped: T[] = [];
  for (const c of candidates) {
    if (actorByTenant.has(c.tenantId)) {
      applicable.push(c);
    } else {
      skipped.push(c);
    }
  }
  return { applicable, skipped };
}
