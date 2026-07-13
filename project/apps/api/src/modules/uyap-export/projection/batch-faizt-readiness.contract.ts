import {
  DormantFaiztBatchCaseInput,
  DormantFaiztBatchFailure,
  DormantFaiztBatchReadiness,
} from './faizt-projection.types';

/**
 * Future batch policy contract only. No artifact is created and no exporter is
 * called. Every typed failure rejects the complete deterministic batch result.
 */
export function evaluateDormantFaiztBatchReadiness(
  cases: readonly DormantFaiztBatchCaseInput[],
): DormantFaiztBatchReadiness {
  const orderedCases = [...cases].sort((a, b) => a.caseId.localeCompare(b.caseId));
  const failures: DormantFaiztBatchFailure[] = [];
  let projectionCount = 0;

  if (orderedCases.length === 0) {
    failures.push(
      Object.freeze({
        caseId: '(batch)',
        sourceId: '(batch)',
        status: 'BATCH_EMPTY',
      }),
    );
  }

  const caseCounts = new Map<string, number>();
  for (const item of orderedCases) {
    caseCounts.set(item.caseId, (caseCounts.get(item.caseId) ?? 0) + 1);
  }
  for (const [caseId, count] of [...caseCounts].sort(([a], [b]) => a.localeCompare(b))) {
    if (count > 1) {
      failures.push(
        Object.freeze({
          caseId,
          sourceId: '(case)',
          status: 'DUPLICATE_CASE_ID',
        }),
      );
    }
  }

  for (const item of orderedCases) {
    const orderedProjections = [...item.projections].sort(
      (a, b) => a.sourceId.localeCompare(b.sourceId) || a.status.localeCompare(b.status),
    );
    projectionCount += orderedProjections.length;
    if (orderedProjections.length === 0) {
      failures.push(
        Object.freeze({
          caseId: item.caseId,
          sourceId: '(case)',
          status: 'CASE_HAS_NO_PROJECTIONS',
        }),
      );
    }
    for (const projection of orderedProjections) {
      if (projection.ok === true) continue;
      failures.push(
        Object.freeze({
          caseId: item.caseId,
          sourceId: projection.sourceId,
          status: projection.status,
        }),
      );
    }
  }

  failures.sort(
    (a, b) =>
      a.caseId.localeCompare(b.caseId) ||
      a.sourceId.localeCompare(b.sourceId) ||
      a.status.localeCompare(b.status),
  );

  if (failures.length === 0) {
    return Object.freeze({
      status: 'READY',
      policy: 'REJECT_ENTIRE_BATCH',
      artifactProduced: false,
      caseCount: orderedCases.length,
      projectionCount,
      failures: Object.freeze([]) as readonly [],
    });
  }

  return Object.freeze({
    status: 'REJECTED',
    policy: 'REJECT_ENTIRE_BATCH',
    artifactProduced: false,
    caseCount: orderedCases.length,
    projectionCount,
    failures: Object.freeze(failures),
  });
}
