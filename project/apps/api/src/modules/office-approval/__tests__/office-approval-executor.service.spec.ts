/** @jest-environment node */
import 'reflect-metadata';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { OfficeApprovalExecutorService } from '../office-approval-executor.service';

/**
 * P4-5A — OfficeApprovalExecutorService (CHANGE_STATUS deferred executor) birim testleri.
 * KESİN (Ulaş kilidi): decision-only DEĞİL → deferred APPLY. PURE CaseStatusService.changeStatus (controller bypass).
 *  K2 missing-replacement→STALE · K3 RUNNING-lock(NOT_RUN→RUNNING) apply-öncesi · K4 actor=approverUserId ·
 *  K5 staleness(case yok ∨ already-at-target; transition-conflict YOK) · K6 entry=NOT_RUN-only · K7 actionCode inert-refusal ·
 *  K8 leak-free (yeni audit sink yok). 10 acceptance + guard/edge kapsanır.
 */

const mkReq = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  tenantId: 't1',
  actionCode: 'CHANGE_STATUS',
  targetType: 'LegalCase',
  targetRef: 'case-1',
  requesterUserId: 'req-u',
  approverUserId: 'appr-u',
  status: 'APPROVED',
  executionStatus: 'NOT_RUN',
  savedIntent: { status: 'BATAK', reason: 'tahsil imkansız' },
  replacementSavedIntent: null,
  payloadHash: 'h'.repeat(64),
  replacementPayloadHash: null,
  reason: null,
  decisionNote: null,
  idempotencyKey: null,
  createdAt: new Date(),
  decidedAt: new Date(),
  executedAt: null,
  expiresAt: null,
  ...over,
});

const mk = (reqRow: Record<string, unknown>, over: any = {}) => {
  const officeApproval: any = {
    getByIdForTenant: jest.fn().mockResolvedValue(reqRow),
    markExecutionRunning: jest.fn().mockResolvedValue({ ...reqRow, executionStatus: 'RUNNING' }),
    markExecutionRetrying: jest.fn().mockResolvedValue({ ...reqRow, executionStatus: 'RUNNING' }),
    markExecutionSucceeded: jest.fn().mockResolvedValue({ ...reqRow, executionStatus: 'SUCCEEDED' }),
    markExecutionFailed: jest.fn().mockResolvedValue({ ...reqRow, executionStatus: 'FAILED' }),
    markExecutionStale: jest.fn().mockResolvedValue({ ...reqRow, executionStatus: 'STALE' }),
    ...(over.officeApproval || {}),
  };
  const caseStatus: any = {
    changeStatus: jest.fn().mockResolvedValue({ id: (reqRow as any).targetRef }),
    ...(over.caseStatus || {}),
  };
  const prisma: any = {
    case: { findFirst: jest.fn().mockResolvedValue({ caseStatus: 'DERDEST' }) },
    ...(over.prisma || {}),
  };
  const svc = new OfficeApprovalExecutorService(prisma, officeApproval, caseStatus);
  return { svc, officeApproval, caseStatus, prisma };
};

const MARKERS = ['markExecutionRunning', 'markExecutionSucceeded', 'markExecutionFailed', 'markExecutionStale'];
const noMarks = (oa: any) => MARKERS.forEach((m) => expect(oa[m]).not.toHaveBeenCalled());

describe('P4-5A executor — happy path (acceptance #1, #2, #7)', () => {
  it('acc#1 APPROVED + savedIntent → changeStatus(tenant, targetRef, status, approverUserId, reason) + SUCCEEDED', async () => {
    const { svc, officeApproval, caseStatus } = mk(mkReq());
    const res = await svc.execute('r1', 't1', 'exec-u');
    expect(caseStatus.changeStatus).toHaveBeenCalledWith('t1', 'case-1', 'BATAK', 'appr-u', 'tahsil imkansız');
    expect(officeApproval.markExecutionRunning).toHaveBeenCalledWith('r1', 'appr-u'); // K3
    expect(officeApproval.markExecutionSucceeded).toHaveBeenCalledWith('r1', 'appr-u'); // #7
    expect(res.executionStatus).toBe('SUCCEEDED');
  });

  it('acc#2 APPROVED_WITH_CHANGES → replacementSavedIntent uygulanır (savedIntent DEĞİL)', async () => {
    const { svc, caseStatus } = mk(
      mkReq({
        status: 'APPROVED_WITH_CHANGES',
        savedIntent: { status: 'ACIZ', reason: 'orijinal' },
        replacementSavedIntent: { status: 'MAHSUP', reason: 'mahsup edildi' },
      }),
    );
    await svc.execute('r1', 't1', 'exec-u');
    expect(caseStatus.changeStatus).toHaveBeenCalledWith('t1', 'case-1', 'MAHSUP', 'appr-u', 'mahsup edildi');
  });

  it('reason yoksa changeStatus reason=undefined ile çağrılır', async () => {
    const { svc, caseStatus } = mk(mkReq({ savedIntent: { status: 'BATAK' } }));
    await svc.execute('r1', 't1', 'exec-u');
    expect(caseStatus.changeStatus).toHaveBeenCalledWith('t1', 'case-1', 'BATAK', 'appr-u', undefined);
  });
});

describe('P4-5A executor — status/entry guards (acceptance #3, #4)', () => {
  it.each(['PENDING_APPROVAL', 'REJECTED', 'CANCELLED', 'REVISION_REQUESTED', 'EXPIRED'])(
    'acc#3 status=%s → ConflictException; mutation + mark YOK',
    async (status) => {
      const { svc, officeApproval, caseStatus } = mk(mkReq({ status }));
      await expect(svc.execute('r1', 't1', 'exec-u')).rejects.toThrow(ConflictException);
      expect(caseStatus.changeStatus).not.toHaveBeenCalled();
      noMarks(officeApproval);
    },
  );

  it.each(['SUCCEEDED', 'RUNNING', 'STALE', 'FAILED'])(
    'acc#4 executionStatus=%s → ConflictException (re-run yok); mutation + mark YOK',
    async (es) => {
      const { svc, officeApproval, caseStatus } = mk(mkReq({ executionStatus: es }));
      await expect(svc.execute('r1', 't1', 'exec-u')).rejects.toThrow(ConflictException);
      expect(caseStatus.changeStatus).not.toHaveBeenCalled();
      noMarks(officeApproval);
    },
  );
});

describe('P4-5A executor — staleness (acceptance #5) + missing-replacement (K2)', () => {
  it('acc#5a target case YOK → STALE; mutation + RUNNING-lock YOK', async () => {
    const { svc, officeApproval, caseStatus } = mk(mkReq(), {
      prisma: { case: { findFirst: jest.fn().mockResolvedValue(null) } },
    });
    const res = await svc.execute('r1', 't1', 'exec-u');
    expect(officeApproval.markExecutionStale).toHaveBeenCalledWith('r1', 'appr-u');
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
    expect(officeApproval.markExecutionRunning).not.toHaveBeenCalled();
    expect(res.executionStatus).toBe('STALE');
  });

  it('acc#5b already-at-target (caseStatus === intent.status) → STALE (SUCCEEDED-noop DEĞİL)', async () => {
    const { svc, officeApproval, caseStatus } = mk(mkReq({ savedIntent: { status: 'BATAK' } }), {
      prisma: { case: { findFirst: jest.fn().mockResolvedValue({ caseStatus: 'BATAK' }) } },
    });
    await svc.execute('r1', 't1', 'exec-u');
    expect(officeApproval.markExecutionStale).toHaveBeenCalledWith('r1', 'appr-u');
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
    expect(officeApproval.markExecutionSucceeded).not.toHaveBeenCalled();
  });

  it('K2 APPROVED_WITH_CHANGES ama replacementSavedIntent YOK → STALE (FAILED DEĞİL); staleness probe çağrılmaz', async () => {
    const { svc, officeApproval, caseStatus, prisma } = mk(
      mkReq({ status: 'APPROVED_WITH_CHANGES', replacementSavedIntent: null }),
    );
    const res = await svc.execute('r1', 't1', 'exec-u');
    expect(officeApproval.markExecutionStale).toHaveBeenCalledWith('r1', 'appr-u');
    expect(officeApproval.markExecutionFailed).not.toHaveBeenCalled();
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
    expect(prisma.case.findFirst).not.toHaveBeenCalled(); // intent yok → probe'a gerek yok
    expect(res.executionStatus).toBe('STALE');
  });
});

describe('P4-5A executor — malformed intent (acceptance #6)', () => {
  const cases: [string, unknown][] = [
    ['status alanı yok', { reason: 'x' }],
    ['geçersiz status değeri', { status: 'NOT_A_STATUS' }],
    ['status string değil', { status: 123 }],
    ['intent null', null],
    ['intent array', ['BATAK']],
  ];
  it.each(cases)('acc#6 malformed (%s) → FAILED; mutation + staleness probe YOK', async (_label, intent) => {
    const { svc, officeApproval, caseStatus, prisma } = mk(mkReq({ savedIntent: intent }));
    const res = await svc.execute('r1', 't1', 'exec-u');
    expect(officeApproval.markExecutionFailed).toHaveBeenCalledWith('r1', 'appr-u');
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
    expect(officeApproval.markExecutionRunning).not.toHaveBeenCalled();
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(res.executionStatus).toBe('FAILED');
  });
});

describe('P4-5A executor — apply error (acceptance #8) + RUNNING-lock (K3)', () => {
  it('acc#8 changeStatus throw → markExecutionFailed (RUNNING-lock alınmış; SUCCEEDED YOK)', async () => {
    const { svc, officeApproval } = mk(mkReq(), {
      caseStatus: { changeStatus: jest.fn().mockRejectedValue(new Error('boom')) },
    });
    const res = await svc.execute('r1', 't1', 'exec-u');
    expect(officeApproval.markExecutionRunning).toHaveBeenCalledWith('r1', 'appr-u');
    expect(officeApproval.markExecutionFailed).toHaveBeenCalledWith('r1', 'appr-u');
    expect(officeApproval.markExecutionSucceeded).not.toHaveBeenCalled();
    expect(res.executionStatus).toBe('FAILED');
  });

  it('K3 RUNNING-lock conflict (eşzamanlı executor claim etti) → ConflictException propagate; changeStatus YOK', async () => {
    const { svc, caseStatus } = mk(mkReq(), {
      officeApproval: { markExecutionRunning: jest.fn().mockRejectedValue(new ConflictException('RUNNING-lock')) },
    });
    await expect(svc.execute('r1', 't1', 'exec-u')).rejects.toThrow(ConflictException);
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
  });
});

describe('P4-5A executor — actionCode/targetType scope guard (K7, acceptance #10 yardımcı)', () => {
  it('K7 actionCode !== CHANGE_STATUS → BadRequest; executionStatus DOKUNULMAZ (mark YOK), mutation YOK', async () => {
    const { svc, officeApproval, caseStatus } = mk(mkReq({ actionCode: 'CREATE_CLIENT' }));
    await expect(svc.execute('r1', 't1', 'exec-u')).rejects.toThrow(BadRequestException);
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
    noMarks(officeApproval); // yabancı row'u FAILED işaretleme YOK
  });

  it('K7 targetType !== LegalCase → BadRequest; yan-etki YOK', async () => {
    const { svc, officeApproval, caseStatus } = mk(mkReq({ targetType: 'Client' }));
    await expect(svc.execute('r1', 't1', 'exec-u')).rejects.toThrow(BadRequestException);
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
    noMarks(officeApproval);
  });
});

describe('P4-5A executor — actor truthfulness (K4) + load/edge', () => {
  it('K4 actor = approverUserId (requesterUserId/executorUserId DEĞİL) — changeStatus + markExecution*', async () => {
    const { svc, officeApproval, caseStatus } = mk(mkReq({ requesterUserId: 'REQ', approverUserId: 'APPR' }));
    await svc.execute('r1', 't1', 'EXEC');
    expect(caseStatus.changeStatus).toHaveBeenCalledWith('t1', 'case-1', 'BATAK', 'APPR', 'tahsil imkansız');
    expect(officeApproval.markExecutionSucceeded).toHaveBeenCalledWith('r1', 'APPR');
    expect(caseStatus.changeStatus).not.toHaveBeenCalledWith('t1', 'case-1', 'BATAK', 'REQ', expect.anything());
    expect(caseStatus.changeStatus).not.toHaveBeenCalledWith('t1', 'case-1', 'BATAK', 'EXEC', expect.anything());
  });

  it('bozuk kayıt: APPROVED ama approverUserId null → ConflictException; mutation + mark YOK', async () => {
    const { svc, officeApproval, caseStatus } = mk(mkReq({ approverUserId: null }));
    await expect(svc.execute('r1', 't1', 'exec-u')).rejects.toThrow(ConflictException);
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
    noMarks(officeApproval);
  });

  it('load: getByIdForTenant 404 (çapraz-tenant/yok) → propagate; hiçbir yan-etki yok', async () => {
    const { svc, caseStatus } = mk(mkReq(), {
      officeApproval: { getByIdForTenant: jest.fn().mockRejectedValue(new NotFoundException()) },
    });
    await expect(svc.execute('r1', 't-OTHER', 'exec-u')).rejects.toThrow(NotFoundException);
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
  });
});

describe('P4-5A executor — sequence ordering + leak-free (K8) + route-yok (acceptance #9, #10)', () => {
  it('sıra: staleness probe < RUNNING-lock < changeStatus (stale → RUNNING-lock alınmaz; apply ÖNCE RUNNING)', async () => {
    const { svc, officeApproval, caseStatus, prisma } = mk(mkReq());
    await svc.execute('r1', 't1', 'exec-u');
    const probe = prisma.case.findFirst.mock.invocationCallOrder[0];
    const run = officeApproval.markExecutionRunning.mock.invocationCallOrder[0];
    const apply = caseStatus.changeStatus.mock.invocationCallOrder[0];
    expect(probe).toBeLessThan(run); // staleness RUNNING-lock'tan önce
    expect(run).toBeLessThan(apply); // RUNNING-lock apply'dan önce
  });

  it('acc#9 leak-free: executor AuditService dependency YOK; office-approval yüzeyi yalnız getByIdForTenant + markExecution* (hash-only); reason yalnız changeStatus(case-domain)', async () => {
    const { svc, officeApproval, caseStatus } = mk(mkReq());
    expect((svc as any).audit).toBeUndefined(); // executor'a ham audit sink enjekte edilmedi
    await svc.execute('r1', 't1', 'exec-u');
    const called = Object.keys(officeApproval)
      .filter((k) => officeApproval[k].mock.calls.length > 0)
      .sort();
    expect(called).toEqual(['getByIdForTenant', 'markExecutionRunning', 'markExecutionSucceeded'].sort());
    // ham savedIntent.reason yalnız case-domain changeStatus'a gider (meşru hukuki kayıt), OFFICE_APPROVAL_* audit'e DEĞİL.
    expect(caseStatus.changeStatus).toHaveBeenCalledWith('t1', 'case-1', 'BATAK', 'appr-u', 'tahsil imkansız');
  });

  it('acc#10 executor public route DEĞİL: sınıfta @Controller path + execute() route-method metadata YOK', () => {
    expect(Reflect.getMetadata('path', OfficeApprovalExecutorService)).toBeUndefined();
    expect(Reflect.getMetadata('method', OfficeApprovalExecutorService.prototype.execute)).toBeUndefined();
  });
});

describe('P4-5C-1 executor — reconcileStuckRunning (PRECISE age-gate; case.caseStatus=hakikat; R2/lock7)', () => {
  // CUTOFF = now - STUCK_TIMEOUT. runningStartedAt > CUTOFF → henüz stuck değil; <= CUTOFF veya null → eligible.
  const CUTOFF = new Date(2026, 5, 29, 12, 0, 0);
  const OLD = new Date(2026, 5, 29, 11, 0, 0); // CUTOFF'tan eski → stuck (eligible)
  const FRESH = new Date(2026, 5, 29, 12, 5, 0); // CUTOFF'tan sonra → taze in-flight (skip)
  const runningReq = (over: Record<string, unknown> = {}) =>
    mkReq({ executionStatus: 'RUNNING', runningStartedAt: OLD, ...over });

  it('caseStatus === intent.status (applied-but-unmarked) → markExecutionSucceeded (re-apply YOK)', async () => {
    const { svc, officeApproval, caseStatus } = mk(runningReq({ savedIntent: { status: 'BATAK' } }), {
      prisma: { case: { findFirst: jest.fn().mockResolvedValue({ caseStatus: 'BATAK' }) } },
    });
    const res = await svc.reconcileStuckRunning('r1', 't1', CUTOFF);
    expect(officeApproval.markExecutionSucceeded).toHaveBeenCalledWith('r1', 'appr-u');
    expect(officeApproval.markExecutionStale).not.toHaveBeenCalled();
    expect(officeApproval.markExecutionFailed).not.toHaveBeenCalled();
    expect(caseStatus.changeStatus).not.toHaveBeenCalled(); // reconcile ASLA re-apply etmez
    expect(officeApproval.markExecutionRunning).not.toHaveBeenCalled(); // claim-lock'a dokunmaz
    expect(res.executionStatus).toBe('SUCCEEDED');
  });

  it('lock7: caseStatus !== intent.status (not-applied) → markExecutionFailed (P4-5B STALE → P4-5C FAILED; bounded-retry havuzu)', async () => {
    const { svc, officeApproval, caseStatus } = mk(runningReq({ savedIntent: { status: 'BATAK' } }), {
      prisma: { case: { findFirst: jest.fn().mockResolvedValue({ caseStatus: 'DERDEST' }) } },
    });
    const res = await svc.reconcileStuckRunning('r1', 't1', CUTOFF);
    expect(officeApproval.markExecutionFailed).toHaveBeenCalledWith('r1', 'appr-u'); // retryCount artar (orphan sayılır)
    expect(officeApproval.markExecutionStale).not.toHaveBeenCalled();
    expect(officeApproval.markExecutionSucceeded).not.toHaveBeenCalled();
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
    expect(res.executionStatus).toBe('FAILED');
  });

  it('case YOK → markExecutionStale (hedef yok, başarı iddia edilemez)', async () => {
    const { svc, officeApproval } = mk(runningReq(), {
      prisma: { case: { findFirst: jest.fn().mockResolvedValue(null) } },
    });
    await svc.reconcileStuckRunning('r1', 't1', CUTOFF);
    expect(officeApproval.markExecutionStale).toHaveBeenCalledWith('r1', 'appr-u');
    expect(officeApproval.markExecutionFailed).not.toHaveBeenCalled();
  });

  it('APPROVED_WITH_CHANGES → replacementSavedIntent.status hakikat ile karşılaştırılır', async () => {
    const { svc, officeApproval } = mk(
      runningReq({ status: 'APPROVED_WITH_CHANGES', savedIntent: { status: 'ACIZ' }, replacementSavedIntent: { status: 'MAHSUP' } }),
      { prisma: { case: { findFirst: jest.fn().mockResolvedValue({ caseStatus: 'MAHSUP' }) } } },
    );
    await svc.reconcileStuckRunning('r1', 't1', CUTOFF);
    expect(officeApproval.markExecutionSucceeded).toHaveBeenCalledWith('r1', 'appr-u');
  });

  it('malformed intent → markExecutionStale (hedef belirsiz, asla başaramaz → retry havuzuna SOKMA)', async () => {
    const { svc, officeApproval, prisma } = mk(runningReq({ savedIntent: { reason: 'status yok' } }));
    await svc.reconcileStuckRunning('r1', 't1', CUTOFF);
    expect(officeApproval.markExecutionStale).toHaveBeenCalledWith('r1', 'appr-u');
    expect(officeApproval.markExecutionFailed).not.toHaveBeenCalled();
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
  });

  // PRECISE age-gate (P4-5C-1 yeni): taze in-flight claim YANLIŞ reconcile edilmez.
  it('age-gate: runningStartedAt > stuckCutoff (taze claim) → ConflictException; mark YOK; case OKUNMAZ', async () => {
    const { svc, officeApproval, prisma } = mk(runningReq({ runningStartedAt: FRESH }));
    await expect(svc.reconcileStuckRunning('r1', 't1', CUTOFF)).rejects.toThrow(ConflictException);
    noMarks(officeApproval);
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
  });

  it('age-gate: runningStartedAt = null (pre-migration orphan) → eligible (reconcile devam eder)', async () => {
    const { svc, officeApproval } = mk(runningReq({ runningStartedAt: null, savedIntent: { status: 'BATAK' } }), {
      prisma: { case: { findFirst: jest.fn().mockResolvedValue({ caseStatus: 'BATAK' }) } },
    });
    await svc.reconcileStuckRunning('r1', 't1', CUTOFF);
    expect(officeApproval.markExecutionSucceeded).toHaveBeenCalledWith('r1', 'appr-u');
  });

  it.each(['NOT_RUN', 'SUCCEEDED', 'FAILED', 'STALE'])(
    'RUNNING DIŞI (executionStatus=%s) → ConflictException; mark YOK',
    async (es) => {
      const { svc, officeApproval } = mk(runningReq({ executionStatus: es }));
      await expect(svc.reconcileStuckRunning('r1', 't1', CUTOFF)).rejects.toThrow(ConflictException);
      noMarks(officeApproval);
    },
  );

  it('RUNNING ama approverUserId null (bozuk) → ConflictException; mark YOK', async () => {
    const { svc, officeApproval } = mk(runningReq({ approverUserId: null }));
    await expect(svc.reconcileStuckRunning('r1', 't1', CUTOFF)).rejects.toThrow(ConflictException);
    noMarks(officeApproval);
  });

  it('idempotent CAS: canlı executor önce terminalize etti → markExecution* count=0 Conflict → propagate (cron yutar)', async () => {
    const { svc } = mk(runningReq({ savedIntent: { status: 'BATAK' } }), {
      prisma: { case: { findFirst: jest.fn().mockResolvedValue({ caseStatus: 'BATAK' }) } },
      officeApproval: { markExecutionSucceeded: jest.fn().mockRejectedValue(new ConflictException('Yürütme zaten sonlanmış')) },
    });
    await expect(svc.reconcileStuckRunning('r1', 't1', CUTOFF)).rejects.toThrow(ConflictException);
  });

  it('load: getByIdForTenant 404 (çapraz-tenant/yok) → propagate', async () => {
    const { svc } = mk(runningReq(), {
      officeApproval: { getByIdForTenant: jest.fn().mockRejectedValue(new NotFoundException()) },
    });
    await expect(svc.reconcileStuckRunning('r1', 't-OTHER', CUTOFF)).rejects.toThrow(NotFoundException);
  });
});

describe('P4-5C-2 executor — executeRetry (bounded FAILED-retry; FAILED-entry; execute()-AYRI)', () => {
  const failedReq = (over: Record<string, unknown> = {}) =>
    mkReq({ executionStatus: 'FAILED', retryCount: 1, ...over });

  it('FAILED + retryCount<MAX + geçerli intent → markExecutionRetrying claim + changeStatus + SUCCEEDED (markExecutionRunning DEĞİL)', async () => {
    const { svc, officeApproval, caseStatus } = mk(failedReq({ savedIntent: { status: 'BATAK', reason: 'tahsil imkansız' } }));
    const res = await svc.executeRetry('r1', 't1', 'SYSTEM_CRON', 3);
    expect(officeApproval.markExecutionRetrying).toHaveBeenCalledWith('r1', 'appr-u', 3);
    expect(officeApproval.markExecutionRunning).not.toHaveBeenCalled(); // retry, NOT_RUN-claim DEĞİL
    expect(caseStatus.changeStatus).toHaveBeenCalledWith('t1', 'case-1', 'BATAK', 'appr-u', 'tahsil imkansız');
    expect(officeApproval.markExecutionSucceeded).toHaveBeenCalledWith('r1', 'appr-u');
    expect(res.executionStatus).toBe('SUCCEEDED');
  });

  it('exhausted: retryCount>=MAX → ConflictException; claim YOK, mutation YOK', async () => {
    const { svc, officeApproval, caseStatus } = mk(failedReq({ retryCount: 3 }));
    await expect(svc.executeRetry('r1', 't1', 'SYSTEM_CRON', 3)).rejects.toThrow(ConflictException);
    expect(officeApproval.markExecutionRetrying).not.toHaveBeenCalled();
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
  });

  it.each(['NOT_RUN', 'RUNNING', 'SUCCEEDED', 'STALE'])(
    'FAILED DIŞI (executionStatus=%s) → ConflictException; claim YOK',
    async (es) => {
      const { svc, officeApproval } = mk(failedReq({ executionStatus: es }));
      await expect(svc.executeRetry('r1', 't1', 'SYSTEM_CRON', 3)).rejects.toThrow(ConflictException);
      expect(officeApproval.markExecutionRetrying).not.toHaveBeenCalled();
    },
  );

  it('scope guard: actionCode!=CHANGE_STATUS → BadRequest; claim YOK', async () => {
    const { svc, officeApproval, caseStatus } = mk(failedReq({ actionCode: 'CREATE_CLIENT' }));
    await expect(svc.executeRetry('r1', 't1', 'SYSTEM_CRON', 3)).rejects.toThrow(BadRequestException);
    expect(officeApproval.markExecutionRetrying).not.toHaveBeenCalled();
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
  });

  it('approverUserId null (bozuk) → ConflictException; claim YOK', async () => {
    const { svc, officeApproval } = mk(failedReq({ approverUserId: null }));
    await expect(svc.executeRetry('r1', 't1', 'SYSTEM_CRON', 3)).rejects.toThrow(ConflictException);
    expect(officeApproval.markExecutionRetrying).not.toHaveBeenCalled();
  });

  it('claim sonrası changeStatus throw → markExecutionFailed (retryCount++ via 5C-1; bounded)', async () => {
    const { svc, officeApproval } = mk(failedReq(), {
      caseStatus: { changeStatus: jest.fn().mockRejectedValue(new Error('boom')) },
    });
    const res = await svc.executeRetry('r1', 't1', 'SYSTEM_CRON', 3);
    expect(officeApproval.markExecutionRetrying).toHaveBeenCalledWith('r1', 'appr-u', 3);
    expect(officeApproval.markExecutionFailed).toHaveBeenCalledWith('r1', 'appr-u');
    expect(res.executionStatus).toBe('FAILED');
  });

  it('claim sonrası already-at-target → markExecutionStale (re-apply YOK)', async () => {
    const { svc, officeApproval, caseStatus } = mk(failedReq({ savedIntent: { status: 'BATAK' } }), {
      prisma: { case: { findFirst: jest.fn().mockResolvedValue({ caseStatus: 'BATAK' }) } },
    });
    await svc.executeRetry('r1', 't1', 'SYSTEM_CRON', 3);
    expect(officeApproval.markExecutionStale).toHaveBeenCalledWith('r1', 'appr-u');
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
  });

  it('claim conflict (markExecutionRetrying count=0 yarış) → propagate (cron yutar)', async () => {
    const { svc, caseStatus } = mk(failedReq(), {
      officeApproval: { markExecutionRetrying: jest.fn().mockRejectedValue(new ConflictException('retry claim alınamadı')) },
    });
    await expect(svc.executeRetry('r1', 't1', 'SYSTEM_CRON', 3)).rejects.toThrow(ConflictException);
    expect(caseStatus.changeStatus).not.toHaveBeenCalled();
  });
});
