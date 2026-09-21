/*
 * OFFICE C123 KABUL — KABUL ADIMLARI (C1 / C2 / C3)
 *
 * Her RET adimi: tenant anlik goruntusu (DMMF kapsamli; c-lib scopePlan) -> istek -> goruntu.
 *   Olcut = kesin durum + (verilmisse) birebir kod VE goruntu BIREBIR ayni (bu tenant'ta yazma 0).
 *   Goruntu alinamazsa OLCULEMEDI (PASS sayilmaz).
 * Her POZITIF adim: beklenen fark SEKLI (tablo+islem sayilari) KESIN; fazladan degisiklik FAIL.
 *   Sekiller disposable provada OLCULUP burada sabitlendi (EXPECT_SHAPE). Canlida ayni sekil beklenir.
 * Belirsiz HTTP (timeout/tasima) TEKRARLANMAZ; o adim OLCULEMEDI olur.
 * G-5: publish/retry-publication/reverse/supersede CAGRILMAZ (c-lib httpJson reddeder). FD zinciri
 *   CONTENT_APPROVED'da DURUR; musteriye gonderim yoktur.
 */
'use strict';
const L = require('./c-lib');

const CODES = {
  VIEWER_DECISION: 'OFFICE_APPROVAL_DECISION_DENIED_VIEWER',
  FD_NOT_ELIGIBLE: 'DISCLOSURE_APPROVAL_NOT_ELIGIBLE',
  FD_SELF: 'DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN',
  FD_FOUR_EYES: 'DISCLOSURE_APPROVAL_FOUR_EYES_VIOLATION',
  DOMAIN: 'DOMAIN_ACTION_REQUIRED',
};

/**
 * Pozitif adimlarin beklenen fark sekli (disposable provada olculdu; belge §5). null = sekil provada
 * olculecek (yalniz disposable'da kabul edilir; canlida null sekil OLCULEMEDI sayilir).
 */
const EXPECT_SHAPE = require('./c-expect-shapes.json');
const POST_COMMIT_SETTLE_MS = 2000; // C1: dava acilisinin commit-sonrasi (afterCommit) yazmalari icin bekleme

async function runCases({ prisma, plan, st, tokens, R, env, abortAfter, shapesOut }) {
  const base = L.apiBase();
  const T = st.tenantId;
  const snap = () => L.snapshotTenant(prisma, plan, T);
  const call = (method, p, token, body) => L.httpJson(method, `${base}${p}`, { token, body, timeoutMs: 30000 });
  const done = (id) => { if (abortAfter === id) throw new Error(`C123_ABORT_AFTER=${id} — negatif kontrol`); };
  const disposable = env.environment === 'disposable';

  async function rejectStep(id, desc, method, p, token, body, expect) {
    let before;
    try { before = await snap(); } catch (e) { R.unmeasured(id, desc, `on goruntu alinamadi: ${e.message}`); return done(id); }
    const res = await call(method, p, token, body);
    if (expect.settleMs) await new Promise((r) => setTimeout(r, expect.settleMs));
    let after;
    try { after = await snap(); } catch (e) { R.unmeasured(id, desc, `son goruntu alinamadi: ${e.message}`); return done(id); }
    if (res.indeterminate) { R.unmeasured(id, desc, L.describe(res)); return done(id); }
    const diff = L.diffSnapshots(before, after);
    let extra = { ok: true, note: '' };
    if (expect.verify) { try { extra = await expect.verify(res); } catch (e) { extra = { ok: false, note: `dogrulama hatasi: ${e.message}` }; } }
    R.ok(id, desc, L.isExactReject(res, expect) && diff.length === 0 && extra.ok,
      `${L.describe(res)} · yazma ${diff.length === 0 ? '0 (goruntu ayni)' : `VAR: ${diff.join(', ')}`}${extra.note ? ` · ${extra.note}` : ''}`);
    return done(id);
  }

  async function successStep(id, desc, method, p, token, body, { statuses, verify, settleMs }) {
    let before;
    try { before = await snap(); } catch (e) { R.unmeasured(id, desc, `on goruntu alinamadi: ${e.message}`); return { done: done(id) }; }
    const res = await call(method, p, token, body);
    if (settleMs) await new Promise((r) => setTimeout(r, settleMs));
    let after;
    try { after = await snap(); } catch (e) { R.unmeasured(id, desc, `son goruntu alinamadi: ${e.message}`); return { done: done(id) }; }
    if (res.indeterminate) { R.unmeasured(id, desc, L.describe(res)); return { done: done(id) }; }
    const diff = L.diffSnapshots(before, after);
    const shape = L.diffShape(diff);
    if (shapesOut) shapesOut[id] = shape;
    const want = EXPECT_SHAPE[id];
    let extra = { ok: true, note: '' };
    if (L.isSuccess(res, statuses)) {
      try { extra = await verify({ res, diff, after }); } catch (e) { extra = { ok: false, note: `dogrulama hatasi: ${e.message}` }; }
    }
    const note = `${L.describe(res)} · fark [${shape || 'yok'}] beklenen [${want == null ? 'OLCULECEK' : want}]${extra.note ? ` · ${extra.note}` : ''}`;
    if (want == null) {
      if (disposable) R.ok(id, `${desc} (sekil PROVADA olculuyor)`, L.isSuccess(res, statuses) && extra.ok, note);
      else R.unmeasured(id, desc, `beklenen sekil sabitlenmemis — ${note}`);
    } else {
      R.ok(id, desc, L.isSuccess(res, statuses) && shape === want && extra.ok, note);
    }
    done(id);
    return { res, diff };
  }

  const approvalRow = (id) => prisma.officeApprovalRequest.findUnique({ where: { id } });
  const versionRow = (vid) => prisma.clientFinancialDisclosureVersion.findUnique({ where: { id: vid } });

  // ═══════════════════════ C1 — POST /cases atomikligi (#2641 + #2645) ═══════════════════════
  const r = st.runId;
  const c1Body = (fileNumber, tag, extra = {}) => ({
    fileNumber, type: 'GENERAL_EXECUTION',
    // Alacakli e-postasi BILEREK YOK: commit-sonrasi otomatik bilgi-talebi e-postasi tetiklenmez (belge §6).
    creditors: [{ type: 'INDIVIDUAL', name: `C1 Alacakli ${tag} ${r}` }],
    debtors: [{ type: 'INDIVIDUAL', name: `C1 Borclu ${tag} ${r}` }],
    ...extra,
  });
  const c1Rows = async (tag, fileNumber) => ({
    cases: await prisma.case.count({ where: { tenantId: T, fileNumber } }),
    clients: await prisma.client.count({ where: { tenantId: T, name: `C1 Alacakli ${tag} ${r}` } }),
    debtors: await prisma.debtor.count({ where: { tenantId: T, name: `C1 Borclu ${tag} ${r}` } }),
  });

  L.step('C1', 'POST /cases — basarili acilis (satir iliskileri + tek transaction)');
  const fileS = `C1S-${r}`;
  await successStep('C1-S', 'ADMIN -> satir-ici alacakli + borclu ile dava acilisi 201', 'POST', '/cases', tokens.admin,
    c1Body(fileS, 'S'), { statuses: [201], settleMs: POST_COMMIT_SETTLE_MS, verify: async () => {
      const kase = await prisma.case.findFirst({ where: { tenantId: T, fileNumber: fileS }, select: { id: true } });
      const n = await c1Rows('S', fileS);
      const links = kase ? {
        caseClient: await prisma.caseClient.count({ where: { caseId: kase.id } }),
        caseDebtor: await prisma.caseDebtor.count({ where: { caseId: kase.id } }),
      } : {};
      const ok = !!kase && n.cases === 1 && n.clients === 1 && n.debtors === 1 && links.caseClient === 1 && links.caseDebtor === 1;
      return { ok, note: `dava ${n.cases} · muvekkil ${n.clients} · borclu ${n.debtors} · bag caseClient=${links.caseClient} caseDebtor=${links.caseDebtor}` };
    } });

  L.step('C1', 'POST /cases — ISLEM ICI dogal hata: tum taraf yazmalarindan SONRA -> TAM GERI ALMA');
  // `staff[].staffMemberId` var olmayan kimlik: case.service.ts:1651-1656 -> 400; taraf yazmalari ve
  // case.create'ten SONRA transaction icinde patlar. Hata enjeksiyonu YOK; gercek istek.
  const fileR = `C1R-${r}`;
  await rejectStep('C1-R1', 'ADMIN -> ayni govde + var olmayan staffMemberId -> 400, dava/muvekkil/borclu 0 (geri alma)', 'POST', '/cases', tokens.admin,
    c1Body(fileR, 'R', { staff: [{ staffMemberId: `c123-yok-${r}` }] }), { status: 400, settleMs: POST_COMMIT_SETTLE_MS, verify: async () => {
      const n = await c1Rows('R', fileR);
      return { ok: n.cases === 0 && n.clients === 0 && n.debtors === 0, note: `kalinti: dava ${n.cases} · muvekkil ${n.clients} · borclu ${n.debtors}` };
    } });

  L.step('C1', 'POST /cases — ISLEM ONCESI ret (mukerrer dosya no) ve VIEWER siniri');
  await rejectStep('C1-R2', 'ADMIN -> C1-S ile ayni fileNumber -> 409, yazma 0', 'POST', '/cases', tokens.admin,
    c1Body(fileS, 'D'), { status: 409 });
  await rejectStep('C1-V1', 'VIEWER -> satir-ici alacakli ile dava acilisi -> 403, yazma 0', 'POST', '/cases', tokens.viewer,
    c1Body(`C1V-${r}`, 'V'), { status: 403 });

  // ═══════════════════════ C2 — VIEWER karar siniri (#2606) ═══════════════════════
  L.step('C2', `genel kutu kararlari — VIEWER (bagli avukati PARTNER) -> 403 ${CODES.VIEWER_DECISION} + yazma 0`);
  const vDeny = { status: 403, code: CODES.VIEWER_DECISION };
  const oa = (id, action) => `/office-approvals/${id}/${action}`;
  const stillPending = (id) => async () => { const a = await approvalRow(id); return { ok: a && a.status === 'PENDING_APPROVAL', note: `talep ${a && a.status}` }; };
  await rejectStep('C2-G1', 'VIEWER approve (CHANGE_STATUS)', 'POST', oa(st.generic.G1, 'approve'), tokens.viewer, {}, { ...vDeny, verify: stillPending(st.generic.G1) });
  await rejectStep('C2-G2', 'VIEWER reject (CHANGE_STATUS)', 'POST', oa(st.generic.G2, 'reject'), tokens.viewer, { note: 'C123 VIEWER ret denemesi' }, { ...vDeny, verify: stillPending(st.generic.G2) });
  await rejectStep('C2-G3', 'VIEWER request-revision (CHANGE_STATUS)', 'POST', oa(st.generic.G3, 'request-revision'), tokens.viewer, { note: 'C123 VIEWER revizyon denemesi' }, { ...vDeny, verify: stillPending(st.generic.G3) });
  await rejectStep('C2-G4', 'VIEWER approve-with-changes (CHANGE_STATUS)', 'POST', oa(st.generic.G4, 'approve-with-changes'), tokens.viewer,
    { replacementSavedIntent: { kind: 'CHANGE_STATUS', ref: `G4-${r}-degisik` } }, { ...vDeny, verify: stillPending(st.generic.G4) });
  await rejectStep('C2-D1', 'VIEWER POST /collection-dispositions/:id/approve', 'POST', `/collection-dispositions/${st.d1.dispositionId}/approve`, tokens.viewer, {},
    { ...vDeny, verify: async () => {
      const d = await prisma.collectionDisposition.findUnique({ where: { id: st.d1.dispositionId }, select: { status: true } });
      const a = await approvalRow(st.d1.approvalRequestId);
      return { ok: d && d.status === 'DISTRIBUTION_RECOMMENDED' && a && a.status === 'PENDING_APPROVAL', note: `dispozisyon ${d && d.status} · talep ${a && a.status}` };
    } });

  L.step('C2', 'ayirt edicilik: ayni yollarda VIEWER-OLMAYAN uygun aktor karar verebilir (ret rol-ozel)');
  await successStep('C2-GP', 'elev3 (USER + delege) CHANGE_STATUS approve -> 201/200, talep APPROVED + audit', 'POST', oa(st.generic.GP, 'approve'), tokens.elev3, {},
    { statuses: [200, 201], verify: async () => {
      const a = await approvalRow(st.generic.GP);
      return { ok: a && a.status === 'APPROVED' && a.approverUserId === st.actors.elev3.id, note: `talep ${a && a.status} onaylayan=${a && a.approverUserId === st.actors.elev3.id ? 'elev3' : 'FARKLI'}` };
    } });
  await successStep('C2-DP', 'elev1 (USER + PARTNER) dispozisyon approve -> APPROVED', 'POST', `/collection-dispositions/${st.d1.dispositionId}/approve`, tokens.elev1, {},
    { statuses: [200, 201], verify: async () => {
      const d = await prisma.collectionDisposition.findUnique({ where: { id: st.d1.dispositionId }, select: { status: true } });
      const a = await approvalRow(st.d1.approvalRequestId);
      return { ok: a && a.status === 'APPROVED', note: `dispozisyon ${d && d.status} · talep ${a && a.status}` };
    } });

  // ═══════════════════════ C3 — CLF-O0-01 genel kutu retleri + izinli FD alan ilerlemesi ═══════════════════════
  L.step('C3', 'FD zinciri girdisi: dispozisyon POSTED (urunun kendi ucu) -> DRAFT surum');
  const post = await successStep('C3-P0', 'elev1 POST /collection-dispositions/:id/post -> POSTED', 'POST', `/collection-dispositions/${st.fd.dispositionId}/post`, tokens.elev1, {},
    { statuses: [200, 201], verify: async () => {
      const d = await prisma.collectionDisposition.findUnique({ where: { id: st.fd.dispositionId }, select: { status: true } });
      return { ok: d && d.status === 'POSTED', note: `dispozisyon ${d && d.status}` };
    } });
  const draft = await successStep('C3-P1', 'elev1 POST /collection-dispositions/:id/financial-disclosure -> DRAFT surum', 'POST', `/collection-dispositions/${st.fd.dispositionId}/financial-disclosure`, tokens.elev1, {},
    { statuses: [200, 201], verify: async ({ res }) => {
      const b = (res.body && (res.body.data || res.body)) || {};
      const v = b.disclosureVersionId ? await versionRow(b.disclosureVersionId) : null;
      return { ok: !!v && v.status === 'DRAFT', note: `surum ${v ? `${String(v.id).slice(-8)} ${v.status}` : 'YOK'}` };
    } });
  const vid = draft && draft.res && draft.res.body ? ((draft.res.body.data || draft.res.body).disclosureVersionId || null) : null;
  if (!vid || !post || !post.res) {
    for (const id of ['C3-A2', 'C3-G1', 'C3-G2', 'C3-G3', 'C3-G4', 'C3-G5', 'C3-G6', 'C2-F1', 'C3-N1', 'C3-A3', 'C3-A4', 'C2-F2', 'C3-N2', 'C3-N3', 'C3-A5', 'C3-X1']) {
      R.unmeasured(id, 'FD zinciri adimi', 'DRAFT surum uretilemedi — zincir ONKOSULU yok');
    }
    return;
  }
  const fdu = (suffix) => `/client-financial-disclosures/${vid}/${suffix}`;
  const approvalIdOf = async (field) => { const v = await versionRow(vid); return v ? v[field] || null : null; };

  L.step('C3', 'A (elev1) ofis onayi TALEP EDER -> OFFICE_APPROVAL_PENDING');
  await successStep('C3-A2', 'elev1 request-office-approval -> OFFICE_APPROVAL_PENDING + FD talebi', 'POST', fdu('request-office-approval'), tokens.elev1, {},
    { statuses: [200, 201], verify: async () => {
      const v = await versionRow(vid);
      const a = v && v.officeApprovalRequestId ? await approvalRow(v.officeApprovalRequestId) : null;
      return { ok: v && v.status === 'OFFICE_APPROVAL_PENDING' && a && a.status === 'PENDING_APPROVAL' && a.actionCode === 'CLIENT_FINANCIAL_DISCLOSURE_APPROVE',
        note: `surum ${v && v.status} · talep ${a && `${a.actionCode} ${a.status}`}` };
    } });
  const oid = await approvalIdOf('officeApprovalRequestId');

  L.step('C3', `CLF-O0-01: FD talebi GENEL KUTUDAN karara/iptale kapali -> 409 ${CODES.DOMAIN} + yazma 0`);
  const dom = { status: 409, code: CODES.DOMAIN, verify: async () => {
    const a = await approvalRow(oid); const v = await versionRow(vid);
    return { ok: a && a.status === 'PENDING_APPROVAL' && v && v.status === 'OFFICE_APPROVAL_PENDING', note: `talep ${a && a.status} · surum ${v && v.status}` };
  } };
  await rejectStep('C3-G1', 'elev2 (uygun) genel kutu approve', 'POST', oa(oid, 'approve'), tokens.elev2, {}, dom);
  await rejectStep('C3-G2', 'elev2 genel kutu reject', 'POST', oa(oid, 'reject'), tokens.elev2, { note: 'C123 genel kutu ret denemesi' }, dom);
  await rejectStep('C3-G3', 'elev2 genel kutu approve-with-changes', 'POST', oa(oid, 'approve-with-changes'), tokens.elev2, { replacementSavedIntent: { kind: 'C123', ref: r } }, dom);
  await rejectStep('C3-G4', 'elev2 genel kutu request-revision (#2608)', 'POST', oa(oid, 'request-revision'), tokens.elev2, { note: 'C123 revizyon denemesi' }, dom);
  await rejectStep('C3-G5', 'elev1 (talep SAHIBI) genel kutu cancel (#2612)', 'POST', oa(oid, 'cancel'), tokens.elev1, {}, dom);
  await rejectStep('C3-G6', 'elev2 (sahip DEGIL) genel kutu cancel -> 403 (sahiplik kontrolu once)', 'POST', oa(oid, 'cancel'), tokens.elev2, {}, { status: 403, verify: dom.verify });

  L.step('C2/C3', 'FD ofis onayi: VIEWER ve talep eden REDDEDILIR');
  await rejectStep('C2-F1', `VIEWER complete-office-approval -> 403 ${CODES.FD_NOT_ELIGIBLE}`, 'POST', fdu('complete-office-approval'), tokens.viewer, { approvalRequestId: oid },
    { status: 403, code: CODES.FD_NOT_ELIGIBLE, verify: dom.verify });
  await rejectStep('C3-N1', `A (talep eden) complete-office-approval -> 403 ${CODES.FD_SELF}`, 'POST', fdu('complete-office-approval'), tokens.elev1, { approvalRequestId: oid },
    { status: 403, code: CODES.FD_SELF, verify: dom.verify });

  L.step('C3', 'B (elev2, MANAGER) ofis onayini FD ALANINDAN tamamlar -> OFFICE_APPROVED');
  await successStep('C3-A3', 'elev2 complete-office-approval -> OFFICE_APPROVED (onaylayan B)', 'POST', fdu('complete-office-approval'), tokens.elev2, { approvalRequestId: oid },
    { statuses: [200, 201], verify: async () => {
      const v = await versionRow(vid); const a = await approvalRow(oid);
      return { ok: v && v.status === 'OFFICE_APPROVED' && v.officeApprovedById === st.actors.elev2.id && a && a.status === 'APPROVED',
        note: `surum ${v && v.status} · onaylayan ${v && v.officeApprovedById === st.actors.elev2.id ? 'B' : 'FARKLI'} · talep ${a && a.status}` };
    } });

  L.step('C3', 'icerik onayi talebi (alici e-postasi `.invalid`) -> CONTENT_APPROVAL_PENDING');
  await successStep('C3-A4', 'elev1 request-content-approval -> CONTENT_APPROVAL_PENDING', 'POST', fdu('request-content-approval'), tokens.elev1,
    { approvedRecipientEmail: st.clientEmail }, { statuses: [200, 201], verify: async () => {
      const v = await versionRow(vid);
      return { ok: v && v.status === 'CONTENT_APPROVAL_PENDING', note: `surum ${v && v.status}` };
    } });
  const cid = await approvalIdOf('contentApprovalRequestId');
  const contentPending = async () => { const v = await versionRow(vid); return { ok: v && v.status === 'CONTENT_APPROVAL_PENDING', note: `surum ${v && v.status}` }; };

  L.step('C2/C3', 'FD icerik onayi: VIEWER, dort-goz ve talep eden REDDEDILIR');
  await rejectStep('C2-F2', `VIEWER complete-content-approval -> 403 ${CODES.FD_NOT_ELIGIBLE}`, 'POST', fdu('complete-content-approval'), tokens.viewer, { approvalRequestId: cid },
    { status: 403, code: CODES.FD_NOT_ELIGIBLE, verify: contentPending });
  await rejectStep('C3-N2', `B (ofis onaylayicisi) complete-content-approval -> 403 ${CODES.FD_FOUR_EYES}`, 'POST', fdu('complete-content-approval'), tokens.elev2, { approvalRequestId: cid },
    { status: 403, code: CODES.FD_FOUR_EYES, verify: contentPending });
  await rejectStep('C3-N3', `A (talep eden) complete-content-approval -> 403 ${CODES.FD_SELF}`, 'POST', fdu('complete-content-approval'), tokens.elev1, { approvalRequestId: cid },
    { status: 403, code: CODES.FD_SELF, verify: contentPending });

  L.step('C3', 'C (elev3, delege) icerik onayini tamamlar -> CONTENT_APPROVED; ZINCIR BURADA DURUR (publish YOK)');
  await successStep('C3-A5', 'elev3 complete-content-approval -> CONTENT_APPROVED (onaylayan C)', 'POST', fdu('complete-content-approval'), tokens.elev3, { approvalRequestId: cid },
    { statuses: [200, 201], verify: async () => {
      const v = await versionRow(vid);
      return { ok: v && v.status === 'CONTENT_APPROVED' && v.contentApprovedById === st.actors.elev3.id,
        note: `surum ${v && v.status} · onaylayan ${v && v.contentApprovedById === st.actors.elev3.id ? 'C' : 'FARKLI'}` };
    } });

  // Dis etki olcumu: surum hicbir gonderim durumuna gecmedi; publish ucu cagrilmadi (G-5 statik + calisma zamani).
  {
    const v = await versionRow(vid);
    const sendStates = ['SEND_PENDING', 'PUBLISHED', 'SEND_FAILED'];
    R.ok('C3-X1', 'FD surumu gonderim durumuna GECMEDI (publish cagrilmadi; musteriye gonderim yok)',
      v && !sendStates.includes(v.status), `surum ${v && v.status}`);
    done('C3-X1');
  }
  return { vid, oid, cid };
}

module.exports = { runCases, CODES };
