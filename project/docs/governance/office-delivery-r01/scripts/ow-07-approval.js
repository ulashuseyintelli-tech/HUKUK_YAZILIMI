/*
 * OFFICE A-07 — KONTROLLU YURUTME KABULU (kosum plani §5, on kosullar §2.1.1)
 *
 * IKI FAZ (plan §1: 5a hazirlik / 5c yurutme) — ARALARINDA bayrak acilir ve API restart olur:
 *   OW_A07_PHASE=prepare  → fixture yazilir (2 SATIR: Case + OfficeApprovalRequest) ve
 *                           §2.1.1'in BES ON KOSULU tek tek OLCULUR. Bayrak KAPALI olmali.
 *   OW_A07_PHASE=execute  → kontrollu uctan execute + kanit dogrulamasi + hedefli reconcile.
 *
 * NEDEN IKI FAZ: bayrak penceresi owner karariyla DARALTILDI — yalniz yurutme adimi boyunca
 * acik kalir. Fixture'i pencere icinde yazmak pencereyi gereksiz uzatirdi.
 *
 * §2.1.1 — YURUTME IZININ OLUSMADIGI BES YOL (kaynakta olculdu):
 *   SESSIZ  : K5 staleness (:193) · sekil-gecersiz savedIntent (:105)  → 2xx doner, iz YOK
 *   GURULTULU: K6 giris-durumu (:85) · K3 CAS (:111) · approverUserId bos (:94) → 409
 * Sessiz ikisi A-07'nin sessizce OLCULEMEZ kalmasinin en olasi yoludur; bu yuzden fixture
 * yazildiktan SONRA bes kosul da DB'den DOGRULANIR (varsayilmaz).
 *
 * 409 KURALI: 409 alinirsa "zaten yapildi" VARSAYILMAZ. Iz DOGRUDAN aranir; bulunamazsa
 * sonuc OLCULEMEDI'dir ve PASS DEGILDIR.
 */
'use strict';
const crypto = require('crypto');
const L = require('./ow-lib');

const PHASE = (process.env.OW_A07_PHASE || 'prepare').toLowerCase();
const START_STATUS = 'ISLEMDE';   // DERDEST varsayilanindan BILEREK farkli (K5)
const TARGET_STATUS = 'DERKENAR'; // start'tan farkli; ikisi de "otomasyon acik" -> yan etki dar

function stableHash(o) {
  return crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
}

(async () => {
  L.assertRunEnvironment();
  const st = L.loadState();
  L.assertOwnSlug(st.slug);
  const prisma = L.loadPrisma();
  const R = L.makeRecorder(`A-07 (${PHASE})`);
  const base = L.requireEnv('OW_API_BASE_URL').replace(/\/+$/, '');

  try {
    await L.assertOwnTenant(prisma, st.tenantId);

    // ─────────────────────────── FAZ 1: HAZIRLIK ───────────────────────────
    if (PHASE === 'prepare') {
      L.step('A07-1', 'fixture yaziliyor — 2 satir (Case + OfficeApprovalRequest), tek transaction');
      const savedIntent = { status: TARGET_STATUS, reason: 'A-07 kabul kosumu' };

      const fx = await prisma.$transaction(async (tx) => {
        const kase = await tx.case.create({
          data: {
            tenantId: st.tenantId,
            fileNumber: `A07-${st.runId}`,
            type: 'GENERAL_EXECUTION', // CaseType enum'unda ILAMSIZ YOKTUR (olculdu)
            caseStatus: START_STATUS, // varsayilana GUVENILMEZ, acikca yazilir
          },
          select: { id: true, caseStatus: true },
        });
        const req = await tx.officeApprovalRequest.create({
          data: {
            tenantId: st.tenantId,
            actionCode: 'CHANGE_STATUS',
            targetType: 'LegalCase',
            targetRef: kase.id,
            requesterUserId: st.adminUserId,
            approverUserId: st.adminUserId, // K4: resmi actor; bos olursa 409
            status: 'APPROVED',
            savedIntent,
            payloadHash: stableHash(savedIntent),
            decidedAt: new Date(),
          },
          select: { id: true, executionStatus: true, status: true, retryCount: true },
        });
        return { caseId: kase.id, caseStatus: kase.caseStatus, requestId: req.id };
      }, { timeout: 30000, maxWait: 10000 });

      L.log(`      Case=${fx.caseId} (${fx.caseStatus}) · Request=${fx.requestId}`);

      // ── §2.1.1 BES ON KOSUL — DB'den OLCULUR ──
      L.step('A07-2', '§2.1.1 on kosullari olculuyor (bes yolun hicbiri acik kalmamali)');
      const req = await prisma.officeApprovalRequest.findFirst({
        where: { id: fx.requestId, tenantId: st.tenantId },
      });
      const kase = await prisma.case.findFirst({
        where: { id: fx.caseId, tenantId: st.tenantId }, select: { caseStatus: true },
      });
      const intent = req && req.savedIntent;

      R.ok('A07-P1', 'K5: caseStatus intent hedefinden FARKLI (staleness kapali)',
        !!kase && !!intent && kase.caseStatus !== intent.status,
        `caseStatus=${kase && kase.caseStatus} · intent.status=${intent && intent.status}`);
      R.ok('A07-P2', 'K6: executionStatus NOT_RUN (giris kapisi acik)',
        !!req && req.executionStatus === 'NOT_RUN', `executionStatus=${req && req.executionStatus}`);
      R.ok('A07-P3', 'approverUserId DOLU (409 approver kapisi kapali)',
        !!req && !!req.approverUserId, `approverUserId=${req && req.approverUserId ? 'DOLU' : 'BOS'}`);
      R.ok('A07-P4', 'savedIntent SEKIL-GECERLI (sessiz FAILED yolu kapali)',
        !!intent && typeof intent === 'object' && typeof intent.status === 'string',
        `savedIntent.status tipi=${intent ? typeof intent.status : 'YOK'}`);
      R.ok('A07-P5', 'kapsam CHANGE_STATUS/LegalCase ve status APPROVED',
        !!req && req.actionCode === 'CHANGE_STATUS' && req.targetType === 'LegalCase'
          && req.status === 'APPROVED',
        `${req && req.actionCode}/${req && req.targetType} · ${req && req.status}`);

      const s = { ...st, a07: { caseId: fx.caseId, requestId: fx.requestId, startStatus: START_STATUS, targetStatus: TARGET_STATUS, attemptAtPrepare: req ? req.retryCount : null } };
      L.saveState(s);
      L.log('      fixture durum dosyasina islendi (sir icermez)');

      const sum = R.summary();
      process.exitCode = sum.fail === 0 ? 0 : 1;
      return;
    }

    // ─────────────────────────── FAZ 2: YURUTME ───────────────────────────
    if (!st.a07) throw new Error('A-07 fixture durumu YOK — once OW_A07_PHASE=prepare kosulmali');
    const { requestId, caseId, targetStatus } = st.a07;
    const token = process.env.OW_ADMIN_TOKEN;
    if (!token) throw new Error('OW_ADMIN_TOKEN yok — tek yurutucu oturumu acmali (G-4)');

    // Claim anindaki deneme sayaci — kanit bagi BUNA gore aranir.
    const pre = await prisma.officeApprovalRequest.findFirst({
      where: { id: requestId, tenantId: st.tenantId },
      select: { retryCount: true, executionStatus: true },
    });
    if (!pre) throw new Error('A-07 talebi bulunamadi (tenant kapsamli okuma)');
    const attempt = pre.retryCount;
    L.log(`      claim oncesi: executionStatus=${pre.executionStatus} · retryCount(attempt)=${attempt}`);

    L.step('A07-3', 'kontrollu uctan execute — TEK KEZ (K6 fixture i TUKETIR)');
    const ex = await L.httpJson('POST', `${base}/office-approvals/${requestId}/execute`,
      { token, timeoutMs: 60000 });
    L.log(`      HTTP ${ex.status === null ? 'BELIRSIZ' : ex.status}${ex.indeterminate ? ` (${ex.indeterminateReason})` : ''}`);

    // 409 KURALI + BELIRSIZ KURALI: tekrar GONDERILMEZ; iz DOGRUDAN aranir.
    if (ex.indeterminate) {
      L.log('      !!! BELIRSIZ sonuc — istek TEKRAR GONDERILMEZ; kalici durum salt-okuma uzlastirilir');
    }
    if (ex.status === 409) {
      L.log('      !!! 409 — "zaten yapildi" VARSAYILMAZ; iz asagida DOGRUDAN aranir');
    }

    // ── KANIT DOGRULAMASI (plan §5) ──
    L.step('A07-4', 'yurutme izi dogrulaniyor');
    const post = await prisma.officeApprovalRequest.findFirst({
      where: { id: requestId, tenantId: st.tenantId },
      select: { executionStatus: true, executedAt: true, retryCount: true },
    });
    R.ok('A07-E1', 'executionStatus SUCCEEDED',
      !!post && post.executionStatus === 'SUCCEEDED', `executionStatus=${post && post.executionStatus}`);

    const audits = await prisma.auditLog.findMany({
      where: {
        tenantId: st.tenantId,
        action: { in: ['OFFICE_APPROVAL_EXECUTION_STARTED', 'OFFICE_APPROVAL_EXECUTION_SUCCEEDED'] },
      },
      select: { action: true, createdAt: true },
    });
    const acts = new Set(audits.map((a) => a.action));
    R.ok('A07-E2', 'AuditLog STARTED izi var',
      acts.has('OFFICE_APPROVAL_EXECUTION_STARTED'), `bulunan=${[...acts].join(',') || 'YOK'}`);
    R.ok('A07-E3', 'AuditLog SUCCEEDED izi var',
      acts.has('OFFICE_APPROVAL_EXECUTION_SUCCEEDED'), `audit satiri=${audits.length}`);

    // KESIN BAG — talebe VE denemeye ozgu
    const hist = await prisma.caseStatusHistory.findFirst({
      where: { approvalRequestId: requestId, approvalAttempt: attempt },
      select: { id: true, toStatus: true, fromStatus: true, approvalAttempt: true },
    });
    R.ok('A07-E4', 'CaseStatusHistory KESIN BAG (approvalRequestId + approvalAttempt)',
      !!hist, hist ? `history=${hist.id} · ${hist.fromStatus}->${hist.toStatus} · attempt=${hist.approvalAttempt}`
        : `bag YOK (requestId=${requestId}, attempt=${attempt}) — OLCULEMEZLIK`);

    const kase2 = await prisma.case.findFirst({
      where: { id: caseId, tenantId: st.tenantId }, select: { caseStatus: true },
    });
    R.ok('A07-E5', 'Case.caseStatus hedefe esit',
      !!kase2 && kase2.caseStatus === targetStatus, `caseStatus=${kase2 && kase2.caseStatus} (hedef ${targetStatus})`);

    // DecisionLog'da tenantId YOKTUR (olculdu) — kapsam caseId uzerinden kurulur.
    const dec = await prisma.decisionLog.count({ where: { caseId } });
    R.ok('A07-E6', 'DecisionLog satiri yazildi', dec > 0, `decisionLog(case)=${dec}`);

    // ── HEDEFLI RECONCILE — kesin bagi bulmali, YENIDEN UYGULAMAMALI ──
    L.step('A07-5', 'hedefli reconcile — kesin bag bulunmali, islem YENIDEN UYGULANMAMALI');
    const beforeHist = await prisma.caseStatusHistory.count({ where: { approvalRequestId: requestId } });
    const rc = await L.httpJson('POST', `${base}/office-approvals/${requestId}/reconcile`,
      { token, timeoutMs: 60000 });
    const afterHist = await prisma.caseStatusHistory.count({ where: { approvalRequestId: requestId } });
    const rcBody = JSON.stringify(rc.body || {});
    // SUCCEEDED terminal oldugu icin reconcile 409 ile reddedilir (yalniz RUNNING anlamli).
    // Bu BEKLENEN ve DOGRU davranistir; olculen sey "yeniden uygulama YOK"tur.
    R.ok('A07-R1', 'reconcile islemi YENIDEN UYGULAMADI (history satir sayisi sabit)',
      beforeHist === afterHist, `history ${beforeHist} -> ${afterHist}`);
    R.ok('A07-R2', 'reconcile yaniti terminal durumu dogru degerlendirdi (409 RUNNING-only VEYA SUCCEEDED verdict)',
      rc.status === 409 || rcBody.includes('SUCCEEDED'),
      `HTTP ${rc.status} · ${rcBody.slice(0, 160)}`);

    const sum = R.summary();
    process.exitCode = sum.fail === 0 ? 0 : 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => {
  console.error('\nA-07 HATASI:', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
