/*
 * OFFICE AK KABUL — KABUL ADIMLARI (AK-2 + AK-1a)
 *
 * Her RET adimi: tenant anlik goruntusu -> istek -> goruntu. Olcut = kesin 403 (kendi kapisinin kodu/metni)
 *   VE goruntu BIREBIR ayni (bu tenant'ta yazma 0). Goruntu alinamazsa OLCULEMEDI (PASS sayilmaz).
 * Her POZITIF adim: beklenen fark KESIN olarak olculur (hangi tablo, hangi satir, hangi audit); fazladan
 *   degisiklik FAIL'dir.
 * Belirsiz HTTP (timeout/tasima) TEKRARLANMAZ; o adim OLCULEMEDI olur.
 *
 * OLCULEN KAYNAK (RELEASE22 13740670):
 *   AK-2  lawyer.service.ts:262-264 (ayricalikli create -> H2), :277-280 (pasif ayricalikli mukerrer -> H2),
 *         :285-318 (LAWYER_REACTIVATE ayni tx), :369-396 (LAWYER_CREATE ayni tx), :583-605 (H2: ADMIN veya
 *         aktif + ayni tenant + bagli PARTNER), :661-672 / :701-714 (ayricalik yuklemleri)
 *   AK-1a office-f01-authorization.guard.ts:40-51 (okuma: F01 aktor; yazma: VIEWER once elenir),
 *         office-write-role.policy.ts:15-28 (OFFICE_WRITE_DENIED_VIEWER)
 */
'use strict';
const L = require('./ak-lib');

const AK2_CREATE_DENY_TEXT = 'yalnız PARTNER veya ADMIN tarafından atanabilir';
const AK2_REACTIVATE_DENY_TEXT = 'yeniden etkinleştirme yalnız PARTNER veya ADMIN tarafından yapılabilir';
const F01_CODE = 'OFFICE_F01_AUTHORIZATION_REQUIRED';
const VIEWER_DENY_CODE = 'OFFICE_WRITE_DENIED_VIEWER';

function parseDiff(list) {
  return list.map((s) => { const m = /^(\w+)([+~-])(.+)$/.exec(s); return { table: m[1], op: m[2], id: m[3] }; });
}

async function runCases({ prisma, st, tokens, R, abortAfter }) {
  const base = L.apiBase();
  const T = st.tenantId;
  const snap = () => L.snapshotTenant(prisma, T);
  const call = (method, p, token, body) => L.httpJson(method, `${base}${p}`, { token, body });
  const done = (id) => { if (abortAfter === id) throw new Error(`AK_ABORT_AFTER=${id} — negatif kontrol`); };

  async function rejectStep(id, desc, method, p, token, body, expect) {
    let before;
    try { before = await snap(); } catch (e) { R.unmeasured(id, desc, `on goruntu alinamadi: ${e.message}`); return done(id); }
    const res = await call(method, p, token, body);
    let after;
    try { after = await snap(); } catch (e) { R.unmeasured(id, desc, `son goruntu alinamadi: ${e.message}`); return done(id); }
    if (res.indeterminate) { R.unmeasured(id, desc, L.describe(res)); return done(id); }
    const diff = L.diffSnapshots(before, after);
    R.ok(id, desc, L.isExactReject(res, expect) && diff.length === 0,
      `${L.describe(res)} · yazma ${diff.length === 0 ? '0 (goruntu ayni)' : `VAR: ${diff.join(', ')}`}`);
    return done(id);
  }

  /** Pozitif: beklenen durum + beklenen fark kumesi (tablo/islem sayilari) + ek dogrulama. */
  async function successStep(id, desc, method, p, token, body, { statuses, expectDiff, verify }) {
    let before;
    try { before = await snap(); } catch (e) { R.unmeasured(id, desc, `on goruntu alinamadi: ${e.message}`); return done(id); }
    const res = await call(method, p, token, body);
    let after;
    try { after = await snap(); } catch (e) { R.unmeasured(id, desc, `son goruntu alinamadi: ${e.message}`); return done(id); }
    if (res.indeterminate) { R.unmeasured(id, desc, L.describe(res)); return done(id); }
    const diff = parseDiff(L.diffSnapshots(before, after));
    const shape = diff.map((d) => `${d.table}${d.op}`).sort().join(',');
    const want = [...expectDiff].sort().join(',');
    let extra = { ok: true, note: '' };
    if (L.isSuccess(res, statuses) && shape === want) {
      try { extra = await verify({ res, diff, after }); } catch (e) { extra = { ok: false, note: `dogrulama hatasi: ${e.message}` }; }
    }
    R.ok(id, desc, L.isSuccess(res, statuses) && shape === want && extra.ok,
      `${L.describe(res)} · fark [${shape || 'yok'}] beklenen [${want}]${extra.note ? ` · ${extra.note}` : ''}`);
    return done(id);
  }

  const auditOf = async (diff, action) => {
    const ids = diff.filter((d) => d.table === 'auditLog' && d.op === '+').map((d) => d.id);
    return prisma.auditLog.findMany({ where: { id: { in: ids }, tenantId: T, action } });
  };
  const newLawyerId = (diff) => (diff.find((d) => d.table === 'lawyer' && d.op === '+') || {}).id;

  // ═══════════════════════ AK-2 — ayricalikli olusturma / yeniden etkinlestirme ═══════════════════════
  L.step('AK-2', 'yetkisiz (bagli MANAGER: F01 yazmayi gecer, H2 reddeder) — RET + yazma 0');
  const denyCreate = { textIncludes: AK2_CREATE_DENY_TEXT, notCode: F01_CODE };
  const denyReact = { textIncludes: AK2_REACTIVATE_DENY_TEXT, notCode: F01_CODE };
  const nm = (tag) => ({ name: `AkYeni${tag}`, surname: st.runId });
  await rejectStep('AK2-N1', 'MANAGER -> lawyerRank PARTNER ile create', 'POST', '/lawyers', tokens.manager, { ...nm('N1'), lawyerRank: 'PARTNER' }, denyCreate);
  await rejectStep('AK2-N2', 'MANAGER -> lawyerRank MANAGER ile create', 'POST', '/lawyers', tokens.manager, { ...nm('N2'), lawyerRank: 'MANAGER' }, denyCreate);
  await rejectStep('AK2-N3', 'MANAGER -> canModifyOtherPermissions=true ile create', 'POST', '/lawyers', tokens.manager, { ...nm('N3'), canModifyOtherPermissions: true }, denyCreate);
  await rejectStep('AK2-N4', 'MANAGER -> permissionsLocked=true ile create', 'POST', '/lawyers', tokens.manager, { ...nm('N4'), permissionsLocked: true }, denyCreate);
  await rejectStep('AK2-N5', 'MANAGER -> pasif PARTNER kaydin (P1) mukerreri: yeniden etkinlestirme', 'POST', '/lawyers', tokens.manager,
    { name: 'AkPasifOrtak', surname: st.runId, barNumber: st.p1BarNumber }, denyReact);
  await rejectStep('AK2-N6', 'MANAGER -> pasif delege kaydin (P2) mukerreri: yeniden etkinlestirme', 'POST', '/lawyers', tokens.manager,
    { name: 'AkPasifDelege', surname: st.runId, barNumber: st.p2BarNumber }, denyReact);

  L.step('AK-2', 'ayirt edicilik kontrolu: ayni MANAGER ayricaliksiz create yapabilir (ret aktor-genel DEGIL)');
  await successStep('AK2-C1', 'MANAGER -> ayricaliksiz create 201 + LAWYER_CREATE (userId=MANAGER)', 'POST', '/lawyers', tokens.manager,
    { ...nm('C1'), lawyerRank: 'LAWYER' }, { statuses: [201], expectDiff: ['lawyer+', 'auditLog+'], verify: async ({ diff }) => {
      const lid = newLawyerId(diff); const l = await prisma.lawyer.findUnique({ where: { id: lid } });
      const a = await auditOf(diff, 'LAWYER_CREATE');
      const ok = l && l.tenantId === T && l.officeId === st.officeId && l.lawyerRank === 'LAWYER' && a.length === 1 && a[0].entityId === lid && a[0].userId === st.managerUserId;
      return { ok, note: `avukat ${lid} rank=${l && l.lawyerRank} · audit ${a.length} userId=${a[0] && a[0].userId === st.managerUserId ? 'MANAGER' : 'FARKLI'}` };
    } });

  L.step('AK-2', 'yetkili olusturma (ADMIN / bagli PARTNER) — 201 + ayricalik kalici + ayni tx audit');
  const verifyPrivCreate = (actorUserId, want) => async ({ diff }) => {
    const lid = newLawyerId(diff); const l = await prisma.lawyer.findUnique({ where: { id: lid } });
    const a = await auditOf(diff, 'LAWYER_CREATE');
    const md = (a[0] && a[0].metadata) || {};
    const ok = l && l.tenantId === T && l.officeId === st.officeId
      && Object.entries(want).every(([k, v]) => l[k] === v && md[k] === v)
      && a.length === 1 && a[0].entityId === lid && a[0].userId === actorUserId && a[0].actorType === 'USER';
    return { ok, note: `avukat ${lid} ${Object.keys(want).map((k) => `${k}=${l && l[k]}`).join(' ')} · audit ${a.length} metadata=${JSON.stringify(md)}` };
  };
  await successStep('AK2-P1', 'ADMIN -> PARTNER + canModify + locked ile create', 'POST', '/lawyers', tokens.admin,
    { ...nm('P1'), lawyerRank: 'PARTNER', canModifyOtherPermissions: true, permissionsLocked: true },
    { statuses: [201], expectDiff: ['lawyer+', 'auditLog+'], verify: verifyPrivCreate(st.adminUserId, { lawyerRank: 'PARTNER', canModifyOtherPermissions: true, permissionsLocked: true }) });
  await successStep('AK2-P2', 'bagli PARTNER -> MANAGER + canModify ile create', 'POST', '/lawyers', tokens.partner,
    { ...nm('P2'), lawyerRank: 'MANAGER', canModifyOtherPermissions: true },
    { statuses: [201], expectDiff: ['lawyer+', 'auditLog+'], verify: verifyPrivCreate(st.partnerUserId, { lawyerRank: 'MANAGER', canModifyOtherPermissions: true }) });

  L.step('AK-2', 'yetkili yeniden etkinlestirme — satir SAYISI degismez, isActive false->true + LAWYER_REACTIVATE');
  const verifyReact = (lawyerId, actorUserId) => async ({ diff }) => {
    const l = await prisma.lawyer.findUnique({ where: { id: lawyerId } });
    const a = await auditOf(diff, 'LAWYER_REACTIVATE');
    const md = (a[0] && a[0].metadata) || {};
    const touched = diff.filter((d) => d.table === 'lawyer').map((d) => d.id);
    const ok = l && l.isActive === true && touched.length === 1 && touched[0] === lawyerId
      && a.length === 1 && a[0].entityId === lawyerId && a[0].userId === actorUserId && md.privileged === true && md.reactivatedFromDuplicate === true;
    return { ok, note: `hedef ${lawyerId} isActive=${l && l.isActive} · audit ${a.length} privileged=${md.privileged}` };
  };
  await successStep('AK2-R1', 'bagli PARTNER -> P1 mukerreri: yeniden etkinlestirme', 'POST', '/lawyers', tokens.partner,
    { name: 'AkPasifOrtak', surname: st.runId, barNumber: st.p1BarNumber },
    { statuses: [201], expectDiff: ['lawyer~', 'auditLog+'], verify: verifyReact(st.p1LawyerId, st.partnerUserId) });
  await successStep('AK2-R2', 'ADMIN -> P2 mukerreri: yeniden etkinlestirme', 'POST', '/lawyers', tokens.admin,
    { name: 'AkPasifDelege', surname: st.runId, barNumber: st.p2BarNumber },
    { statuses: [201], expectDiff: ['lawyer~', 'auditLog+'], verify: verifyReact(st.p2LawyerId, st.adminUserId) });

  // ═══════════════════════ AK-1a — VIEWER OFFICE salt-okuma ═══════════════════════
  L.step('AK-1a', 'VIEWER (bagli avukati PARTNER) — izinli OKUMA 200, okuma yazma uretmez');
  let readBefore = null;
  try { readBefore = await snap(); } catch (e) { /* asagida OLCULEMEDI */ }
  const reads = [
    ['AK1A-R1', 'GET /lawyers', '/lawyers', (b) => Array.isArray(b) ? b : (b && (b.items || b.data)) || []],
    ['AK1A-R2', 'GET /lawyers/:id (T)', `/lawyers/${st.targetLawyerId}`, null],
    ['AK1A-R3', 'GET /lawyers/defaults', '/lawyers/defaults', null],
    ['AK1A-R4', 'GET /office', '/office', null],
  ];
  for (const [id, desc, p, listOf] of reads) {
    const res = await call('GET', p, tokens.viewer);
    if (res.indeterminate) { R.unmeasured(id, desc, L.describe(res)); done(id); continue; }
    let ok = res.status === 200;
    let note = '';
    if (ok && listOf) { const arr = listOf(res.body); ok = arr.some((x) => x && x.id === st.targetLawyerId); note = ` · listede T ${ok ? 'VAR' : 'YOK'} (${arr.length} kayit)`; }
    if (ok && id === 'AK1A-R2') { ok = res.body && res.body.id === st.targetLawyerId; note = ` · id ${ok ? 'eslesti' : 'ESLESMEDI'}`; }
    R.ok(id, `VIEWER okuma: ${desc}`, ok, `${L.describe(res)}${note}`);
    done(id);
  }
  if (!readBefore) R.unmeasured('AK1A-R0', 'okumalar yazma uretmedi', 'on goruntu alinamadi');
  else {
    try {
      const readAfter = await snap(); const d = L.diffSnapshots(readBefore, readAfter);
      R.ok('AK1A-R0', 'okumalar yazma uretmedi (goruntu ayni)', d.length === 0, d.length ? `FARK: ${d.join(', ')}` : 'fark yok');
    } catch (e) { R.unmeasured('AK1A-R0', 'okumalar yazma uretmedi', e.message); }
  }

  L.step('AK-1a', `VIEWER YAZMA — 403 ${VIEWER_DENY_CODE} + yazma 0`);
  const vDeny = { code: VIEWER_DENY_CODE };
  const tId = st.targetLawyerId;
  await rejectStep('AK1A-W1', 'VIEWER POST /lawyers (ayricaliksiz)', 'POST', '/lawyers', tokens.viewer, { ...nm('W1'), lawyerRank: 'LAWYER' }, vDeny);
  await rejectStep('AK1A-W2', 'VIEWER PUT /lawyers/:T', 'PUT', `/lawyers/${tId}`, tokens.viewer, { title: 'AK VIEWER PUT' }, vDeny);
  await rejectStep('AK1A-W3', 'VIEWER PATCH /lawyers/:T', 'PATCH', `/lawyers/${tId}`, tokens.viewer, { phone: '05550000000' }, vDeny);
  await rejectStep('AK1A-W4', 'VIEWER DELETE /lawyers/:T (pasiflestirme)', 'DELETE', `/lawyers/${tId}`, tokens.viewer, undefined, vDeny);
  await rejectStep('AK1A-W5', 'VIEWER PUT /lawyers/order/update', 'PUT', '/lawyers/order/update', tokens.viewer, { lawyerIds: [tId] }, vDeny);
  await rejectStep('AK1A-W6', 'VIEWER PUT /lawyers/defaults/set', 'PUT', '/lawyers/defaults/set', tokens.viewer, { lawyerIds: [tId] }, vDeny);
  await rejectStep('AK1A-W7', 'VIEWER PUT /office', 'PUT', '/office', tokens.viewer, { name: `AK VIEWER ${st.runId}` }, vDeny);
  await rejectStep('AK1A-W8', 'VIEWER POST /office/bank-accounts', 'POST', '/office/bank-accounts', tokens.viewer, { bankName: 'AK Banka', iban: 'TR330006100519786457841326' }, vDeny);
  await rejectStep('AK1A-W9', 'VIEWER POST /staff', 'POST', '/staff', tokens.viewer, { firstName: 'AkPersonel', lastName: st.runId }, vDeny);

  L.step('AK-1a', 'ayirt edicilik kontrolu: ayni rutbede (bagli PARTNER) VIEWER-OLMAYAN aktor yazabilir');
  // W2 ile AYNI rota + govde (PUT title): fark yalniz aktorun rolundedir. (PatchLawyerDto `title` TANIMAZ -> 400; prova A2'de olculdu.)
  await successStep('AK1A-C1', 'bagli PARTNER (USER) PUT /lawyers/:T title -> 200, yalniz T degisir', 'PUT', `/lawyers/${tId}`, tokens.partner,
    { title: 'AK Kabul' }, { statuses: [200], expectDiff: ['lawyer~'], verify: async () => {
      const l = await prisma.lawyer.findUnique({ where: { id: tId } });
      return { ok: !!l && l.title === 'AK Kabul', note: `T.title=${l && l.title}` };
    } });

  L.step('AK-1a', 'anonim erisim');
  const anon = await call('GET', '/lawyers', undefined);
  R.ok('AK1A-A1', 'anonim GET /lawyers -> 401', !anon.indeterminate && anon.status === 401, L.describe(anon));
  done('AK1A-A1');
}

module.exports = { runCases, AK2_CREATE_DENY_TEXT, AK2_REACTIVATE_DENY_TEXT, VIEWER_DENY_CODE };
