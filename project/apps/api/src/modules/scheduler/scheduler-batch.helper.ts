/**
 * Cursor-based Batch Pagination Helper
 *
 * Faz 0b Stabilizasyon — Task 1.2
 *
 * Varsayimlar:
 * - Model'de tekil, siralanabilir id (UUID) alani mevcuttur.
 * - Prisma cursor objesi { id: cursorId } formatindadir.
 * - orderBy: { id: 'asc' } ile stable siralama saglanir.
 * - Farkli cursor alani gerekirse cursorField parametresi ile override edilir.
 * - ONEMLI: cursorField immutable VE unique olmalidir.
 *   Degisen alanlarla cursor kullanmak INV-3'u ihlal eder.
 *   Unique olmayan alanlarla Prisma cursor calismaz (runtime hata).
 * - Tie-breaker: cursorField != 'id' ise orderBy otomatik olarak
 *   [{ cursorField: 'asc' }, { id: 'asc' }] olur (stable ordering garantisi).
 */

import {
  SCHED_BATCH_SIZE,
  SCHED_MAX_BATCHES,
  SCHED_MAX_TOTAL,
} from './scheduler.constants';

export interface RunBatchedOptions {
  batchSize?: number;
  maxBatches?: number;
  maxTotal?: number;
  /**
   * Varsayilan: 'id'. Composite key veya farkli cursor alani icin override.
   * MUST be immutable AND unique (or part of a unique constraint).
   * Degisen alanlarla cursor kullanmak INV-3'u ihlal eder.
   * Unique olmayan alanlarla Prisma cursor calismaz (runtime hata).
   */
  cursorField?: string;
}

export interface RunBatchedResult {
  processed: number;
  batches: number;
  truncated: boolean;
}

export async function runBatched<T extends Record<string, any>>(
  // F2: cursor/orderBy Prisma'da model-özel tiplerdir (XWhereUniqueInput / XOrderByInput).
  // Generic helper bunları bilemez → `any`. Böylece scheduler'da `db` PrismaService olarak
  // tiplenince call-site'taki `findMany({ where, ...args })` spread'i Prisma findMany'e
  // friction'sız geçer; where/include YİNE type-checked kalır. Runtime davranışı DEĞİŞMEZ
  // (args zaten içeride `any` olarak kuruluyor).
  findMany: (args: {
    take: number;
    skip?: number;
    cursor?: any;
    orderBy?: any;
  }) => Promise<T[]>,
  handler: (item: T) => Promise<void>,
  options?: RunBatchedOptions,
): Promise<RunBatchedResult> {
  const batchSize = options?.batchSize ?? SCHED_BATCH_SIZE;
  const maxBatches = options?.maxBatches ?? SCHED_MAX_BATCHES;
  const maxTotal = options?.maxTotal ?? SCHED_MAX_TOTAL;
  const cursorField = options?.cursorField ?? 'id';

  // Tie-breaker: cursorField != 'id' ise ek id siralamasi ekle
  const orderBy =
    cursorField === 'id'
      ? { [cursorField]: 'asc' as const }
      : [{ [cursorField]: 'asc' as const }, { id: 'asc' as const }];

  let processed = 0;
  let batches = 0;
  let cursorId: string | undefined;

  while (batches < maxBatches && processed < maxTotal) {
    const remaining = maxTotal - processed;
    const take = Math.min(batchSize, remaining);

    const args: any = { take, orderBy };

    if (cursorId) {
      args.cursor = { [cursorField]: cursorId };
      args.skip = 1; // cursor kaydini atla
    }

    const items = await findMany(args);
    batches++;

    if (items.length === 0) break;

    for (const item of items) {
      await handler(item);
      processed++;
    }

    // Runtime assert: cursorField degeri string olmalidir
    const cursorValue = items[items.length - 1][cursorField];
    if (typeof cursorValue !== 'string') {
      throw new Error(
        `runBatched: cursorField '${cursorField}' returned non-string value: ${cursorValue}`,
      );
    }
    cursorId = cursorValue;

    if (items.length < take) break; // Son batch - daha fazla kayit yok
  }

  const truncated = processed >= maxTotal || batches >= maxBatches;

  return { processed, batches, truncated };
}
