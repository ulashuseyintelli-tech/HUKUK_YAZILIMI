/*
 * İ3 DÜZENEK — H4-06 / H4-07 / H4-08 (FİNANSAL BEYAN ONAY ZİNCİRİ)
 *
 * ÖN KOŞUL ÜRÜNÜN KENDİ YOLUNDAN kurulur (kayıtlar `i3-lib.setupDisclosureChain`, sürüm ürün):
 *   Collection → CollectionDisposition(DISTRIBUTION_APPROVED)
 *   → `POST /collection-dispositions/:id/post`                 → POSTED
 *   → `POST /collection-dispositions/:id/financial-disclosure` → DRAFT sürüm
 * `snapshotHash`/`sourceFingerprint` ELLE YAZILMAZ.
 *
 * AYRI SENARYOLAR (owner talimatı — tek ölçütte birleştirilmez):
 *   H4-06a  self-approval yasağı        (talep eden onaylayamaz)
 *   H4-06b  eligibility                 (eligible olmayan onaylayamaz)
 *   H4-07a  four-eyes                   (ofis onaylayıcısı içerik onaylayıcısı olamaz)
 *   H4-07b  STALE_SNAPSHOT              (kayıtlı intent ↔ sürüm snapshot'ı uyuşmuyor)
 *   H4-07c  CONTENT_HASH_MISMATCH      (bildirim içeriği hash'i uyuşmuyor)
 *   H4-08   yayın allowlist'i           (onaylı sağlayıcı dışına çıkılmaz)
 *
 * GENEL `500` YETKİ REDDİ SAYILMAZ: yetki ölçütleri `403` bekler, sözleşme hatası `400`.
 * Her senaryoda beklenen hata sözleşmesi VE korunacak kalıcı durum BİRLİKTE sınanır.
 */
'use strict';
const L = require('./i3-lib');

// Karar mantigi TEK KAYNAKTAN (`i3-lib.decide`).
const isDenied = L.decide.isDenied;
const codeOf = (r) => (r.body && (r.body.code || r.body.reasonCode
  || (r.body.message && (r.body.message.code || r.body.message.reasonCode)))) || null;

/** Sürüm durumunun karşılaştırılabilir fotoğrafı. */
async function snap(prisma, vid) {
  try {
    const v = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({
      where: { id: vid },
      select: {
        status: true, officeApprovedById: true, officeApprovedAt: true,
        contentApprovedById: true, contentApprovedAt: true, snapshotHash: true,
        providerMessageId: true, providerAcceptedAt: true,
      },
    });
    return { value: v, json: JSON.stringify(v), error: null };
  } catch (e) {
    return { value: null, json: null, error: e && e.message ? e.message : String(e) };
  }
}

module.exports = async function runH4Disclosure(ctx) {
  const { base, prisma, tokens, st, R, chain, chainError } = ctx;
  const IDS = ['H4-06a', 'H4-06b', 'H4-07a', 'H4-07c', 'H4-07b', 'H4-08'];
  L.AH.step('H4-FD', 'finansal beyan onay zinciri — 5 senaryo');

  const skipAll = (why) => IDS.forEach((id) => R.unmeasured(id, 'finansal beyan onay zinciri', why));

  if (!chain) {
    skipAll(`on kosul kayitlari kurulamadi${chainError ? `: ${String(chainError).slice(0, 140)}` : ''}`);
    return;
  }

  // ── Adım 1: POSTED (ürünün kendi ucu) ──
  const rPost = await L.AH.httpJson('POST',
    `${base}/collection-dispositions/${chain.dispositionId}/post`,
    { token: tokens.elev1, body: {}, timeoutMs: 25000 });
  if (rPost.indeterminate) { skipAll(`posting BELIRSIZ: ${rPost.indeterminateReason}`); return; }
  const disp = await prisma.collectionDisposition.findUnique({
    where: { id: chain.dispositionId }, select: { status: true },
  }).catch(() => null);
  if (!disp || disp.status !== 'POSTED') {
    skipAll(`dispozisyon POSTED degil (HTTP ${rPost.status}, durum=${disp ? disp.status : 'OKUNAMADI'}`
      + `${rPost.status >= 400 ? `, govde=${JSON.stringify(rPost.body).slice(0, 120)}` : ''})`);
    return;
  }

  // ── Adım 2: DRAFT sürüm (ürünün kendi ucu; aktivasyon bayrağı prova ortamında) ──
  const rCreate = await L.AH.httpJson('POST',
    `${base}/collection-dispositions/${chain.dispositionId}/financial-disclosure`,
    { token: tokens.elev1, body: {}, timeoutMs: 25000 });
  if (rCreate.indeterminate) { skipAll(`surum uretimi BELIRSIZ: ${rCreate.indeterminateReason}`); return; }
  const cd = (rCreate.body && (rCreate.body.data || rCreate.body)) || {};
  const vid = cd.disclosureVersionId || null;
  if (!vid) {
    skipAll(`surum uretilemedi (HTTP ${rCreate.status}, code=${codeOf(rCreate)}, `
      + `govde=${JSON.stringify(rCreate.body).slice(0, 140)})`);
    return;
  }
  console.log(`      surum uretildi: ${vid.slice(-8)} (HTTP ${rCreate.status})`);

  const url = (suffix) => `${base}/client-financial-disclosures/${vid}/${suffix}`;

  /** Onay uclari `approvalRequestId` ZORUNLU kilar; deger surumden okunur. */
  const approvalIdOf = async (field) => {
    try {
      const v = await prisma.clientFinancialDisclosureVersion.findUniqueOrThrow({
        where: { id: vid }, select: { [field]: true },
      });
      return v[field] || null;
    } catch (e) { return null; }
  };

  // ── H4-06a · Self-approval yasağı ──
  const rReqOffice = await L.AH.httpJson('POST', url('request-office-approval'),
    { token: tokens.elev1, body: {} });
  if (rReqOffice.indeterminate) { skipAll(`ofis onay talebi BELIRSIZ: ${rReqOffice.indeterminateReason}`); return; }
  if (rReqOffice.status >= 400) {
    skipAll(`ofis onayi talep edilemedi (HTTP ${rReqOffice.status}, code=${codeOf(rReqOffice)})`);
    return;
  }
  {
    const before = await snap(prisma, vid);
    const oid = await approvalIdOf('officeApprovalRequestId');
    const rSelf = await L.AH.httpJson('POST', url('complete-office-approval'),
      { token: tokens.elev1, body: { approvalRequestId: oid } }); // talep eden = elev1
    const after = await snap(prisma, vid);
    if (rSelf.indeterminate || before.error || after.error) {
      R.unmeasured('H4-06a', 'self-approval yasagi',
        rSelf.indeterminateReason || before.error || after.error);
    } else {
      R.check('H4-06a', 'talep eden KENDI onaylayamaz: 403 + SELF_APPROVAL kodu + durum DEGISMEZ',
        isDenied(rSelf) && String(codeOf(rSelf) || '').includes('SELF_APPROVAL')
        && before.json === after.json,
        `HTTP ${rSelf.status} (403 beklenir; 500 yetki reddi SAYILMAZ) · code=${codeOf(rSelf)}`
        + ` · surum durumu DEGISMEDI=${before.json === after.json}`);
    }
  }

  // ── H4-06b · Eligibility: eligible olmayan aktör onaylayamaz ──
  {
    const before = await snap(prisma, vid);
    // `accountant`: MUHASEBE personeli — HAZIRLAYABILIR ama isApproverEligible DEGILDIR.
    const oid = await approvalIdOf('officeApprovalRequestId');
    const rNotElig = await L.AH.httpJson('POST', url('complete-office-approval'),
      { token: tokens.accountant, body: { approvalRequestId: oid } });
    const after = await snap(prisma, vid);
    if (rNotElig.indeterminate || before.error || after.error) {
      R.unmeasured('H4-06b', 'eligibility kapisi', rNotElig.indeterminateReason || before.error || after.error);
    } else {
      R.check('H4-06b', 'eligible OLMAYAN aktor (MUHASEBE personeli) onaylayamaz: 403 + durum DEGISMEZ',
        isDenied(rNotElig) && before.json === after.json,
        `HTTP ${rNotElig.status} (403 beklenir) · code=${codeOf(rNotElig)}`
        + ` · surum durumu DEGISMEDI=${before.json === after.json}`);
    }
  }

  // ── Ofis onayı tamamlanır (farklı + eligible aktör) ──
  const officeApprovalId = await approvalIdOf('officeApprovalRequestId');
  const rOfficeOk = await L.AH.httpJson('POST', url('complete-office-approval'),
    { token: tokens.elev2, body: { approvalRequestId: officeApprovalId } });
  const afterOffice = await snap(prisma, vid);
  if (rOfficeOk.indeterminate || rOfficeOk.status >= 400 || afterOffice.error
      || afterOffice.value.officeApprovedById !== st.actors.elev2.id) {
    for (const id of ['H4-07a', 'H4-07b', 'H4-07c', 'H4-08']) {
      R.unmeasured(id, 'icerik onayi / yayin',
        `ofis onayi tamamlanamadi (HTTP ${rOfficeOk.status ?? 'belirsiz'}, code=${codeOf(rOfficeOk)})`);
    }
    return;
  }

  // ── H4-07a · Four-eyes: ofis onaylayıcısı içerik onaylayıcısı OLAMAZ ──
  // `RequestDisclosureContentApprovalDto`: `approvedRecipientEmail` ZORUNLU (IsEmail).
  const rReqContent = await L.AH.httpJson('POST', url('request-content-approval'),
    { token: tokens.elev1, body: { approvedRecipientEmail: `client-${st.runId}@ah-harness.invalid` } });
  if (rReqContent.indeterminate || rReqContent.status >= 400) {
    for (const id of ['H4-07a', 'H4-07b', 'H4-07c', 'H4-08']) {
      R.unmeasured(id, 'icerik onayi / yayin',
        `icerik onayi talep edilemedi (HTTP ${rReqContent.status ?? 'belirsiz'}, code=${codeOf(rReqContent)})`);
    }
    return;
  }
  {
    const before = await snap(prisma, vid);
    const rFourEyes = await L.AH.httpJson('POST', url('complete-content-approval'),
      { token: tokens.elev2, body: { approvalRequestId: await approvalIdOf('contentApprovalRequestId') } }); // ofis onaylayıcısı
    const mid = await snap(prisma, vid);
    const rRequester = await L.AH.httpJson('POST', url('complete-content-approval'),
      { token: tokens.elev1, body: { approvalRequestId: await approvalIdOf('contentApprovalRequestId') } }); // talep eden
    const after = await snap(prisma, vid);

    if (rFourEyes.indeterminate || rRequester.indeterminate || before.error || after.error) {
      R.unmeasured('H4-07a', 'four-eyes', rFourEyes.indeterminateReason || before.error || after.error);
    } else {
      R.check('H4-07a', 'icerik onayi: ofis onaylayicisi FOUR_EYES ile, talep eden SELF_APPROVAL ile RED; durum DEGISMEZ',
        isDenied(rFourEyes) && String(codeOf(rFourEyes) || '').includes('FOUR_EYES')
        && isDenied(rRequester) && String(codeOf(rRequester) || '').includes('SELF_APPROVAL')
        && before.json === mid.json && before.json === after.json,
        `ofis-onaylayici→${rFourEyes.status}/${codeOf(rFourEyes)}`
        + ` · talep-eden→${rRequester.status}/${codeOf(rRequester)}`
        + ` · durum DEGISMEDI=${before.json === after.json}`);
    }
  }

  // ══ KAPI SIRASI (completeContentApproval, approval.service.ts:598-672) ══
  //   1) CONTENT_REQUIRED
  //   2) recomputedContentHash !== version.notificationContentHash → CONTENT_HASH_MISMATCH
  //   3) officeApprovalRequestId/officeApprovedById yok            → REQUEST_NOT_FOUND
  //   4) request bulunamadı                                        → REQUEST_NOT_FOUND
  //   5) readIntent(request.savedIntent).snapshotHash !== version.snapshotHash → STALE_SNAPSHOT
  //   6) SELF_APPROVAL · 7) FOUR_EYES · 8) eligibility
  //
  // KRİTİK: `recomputedContentHash` **`version.snapshotHash`'i içerir** (`:628-633`). Bu yüzden
  // sürümün snapshot'ını bozmak 2. kapıyı tetikler ve 5. kapıya HİÇ ULAŞILMAZ. İki senaryo
  // bu nedenle FARKLI alanlara enjekte edilir ve her biri TAM kod eşleşmesi arar.
  let staleRestoreFailed = false;

  // ── H4-07c · CONTENT_HASH_MISMATCH (2. kapı) ──
  // Enjeksiyon: YALNIZ `version.notificationContentHash`. `recomputed` doğru kalır, saklanan
  // değer bozulur → 2. kapı tetiklenir. Sürüm snapshot'ına DOKUNULMAZ.
  {
    const before = await snap(prisma, vid);
    const orig = await prisma.clientFinancialDisclosureVersion
      .findUnique({ where: { id: vid }, select: { notificationContentHash: true } })
      .then((v) => (v ? v.notificationContentHash : undefined)).catch(() => undefined);

    if (orig === undefined || orig === null) {
      R.unmeasured('H4-07c', 'CONTENT_HASH_MISMATCH (2. kapi)',
        orig === null
          ? 'notificationContentHash NULL — 2. kapiya ulasilamaz (senaryo on kosulu yok)'
          : 'notificationContentHash okunamadi');
    } else {
      let injected = false; let restoreError = null; let r = null; let after = null;
      try {
        await prisma.clientFinancialDisclosureVersion.update({
          where: { id: vid }, data: { notificationContentHash: `i3-contenthash-${st.runId}` },
        });
        injected = true;
        r = await L.AH.httpJson('POST', url('complete-content-approval'),
          { token: tokens.elev3, body: { approvalRequestId: await approvalIdOf('contentApprovalRequestId') } });
        after = await snap(prisma, vid);
      } catch (e) {
        r = r || { indeterminate: true, indeterminateReason: e && e.message ? e.message : String(e) };
      } finally {
        if (injected) {
          try {
            await prisma.clientFinancialDisclosureVersion.update({
              where: { id: vid }, data: { notificationContentHash: orig },
            });
          } catch (e) { restoreError = e && e.message ? e.message : String(e); }
        }
      }
      if (restoreError) {
        R.add('H4-07c', 'CONTENT_HASH_MISMATCH (2. kapi)', L.VERDICT.FAIL,
          `enjeksiyon GERI ALINAMADI: ${restoreError}`);
        staleRestoreFailed = true; // bagimli senaryolar CALISTIRILMAZ
      } else if (!r || r.indeterminate || !after || after.error || before.error) {
        R.unmeasured('H4-07c', 'CONTENT_HASH_MISMATCH (2. kapi)',
          (r && r.indeterminateReason) || (after && after.error) || 'senaryo kurulamadi');
      } else {
        // TAM kod eslesmesi; genel >=400 YETMEZ.
        const exact = L.decide.matchesExactCode(r, 'DISCLOSURE_APPROVAL_CONTENT_HASH_MISMATCH');
        // Korunacak alanlar: onay damgalari ve snapshot DEGISMEMELI.
        const preserved = after.value.contentApprovedById === null
          && after.value.contentApprovedAt === null
          && after.value.snapshotHash === before.value.snapshotHash
          && after.value.officeApprovedById === before.value.officeApprovedById;
        R.check('H4-07c', 'saklanan notificationContentHash bozulunca 2. KAPI: TAM CONTENT_HASH_MISMATCH; onay damgalari korunur',
          exact && preserved,
          `HTTP ${r.status} · code=${codeOf(r)} · TAM eslesme=${exact}`
          + ` (beklenen DISCLOSURE_APPROVAL_CONTENT_HASH_MISMATCH; genel >=400 YETMEZ)`
          + ` · contentApprovedById=${after.value.contentApprovedById}`
          + ` contentApprovedAt=${after.value.contentApprovedAt ? 'DOLU(!)' : 'null'}`
          + ` · snapshotHash KORUNDU=${after.value.snapshotHash === before.value.snapshotHash}`
          + ` · officeApprovedById KORUNDU=${after.value.officeApprovedById === before.value.officeApprovedById}`);
      }
    }
  }

  // ── H4-07b · STALE_SNAPSHOT (5. kapı) ──
  // Enjeksiyon: YALNIZ `OfficeApprovalRequest.savedIntent.snapshotHash`. Sürümün
  // `snapshotHash`/`notificationContentHash` alanlarına DOKUNULMAZ → 2. kapı GEÇİLİR
  // (recomputed === stored) ve 5. kapıya ULAŞILIR. Bu, "önceki kontrolleri geçip amaçlanan
  // kontrole ulaştı" iddiasının kanıtıdır.
  if (staleRestoreFailed) {
    R.unmeasured('H4-07b', 'STALE_SNAPSHOT (5. kapi)',
      'onceki enjeksiyon geri alinamadi — bagimli senaryo CALISTIRILMADI (bozuk zemin)');
  } else {
    const before = await snap(prisma, vid);
    const oid = await approvalIdOf('officeApprovalRequestId');
    const origIntent = oid
      ? await prisma.officeApprovalRequest.findUnique({ where: { id: oid }, select: { savedIntent: true } })
        .then((x) => (x ? x.savedIntent : undefined)).catch(() => undefined)
      : undefined;

    if (!oid || origIntent === undefined) {
      R.unmeasured('H4-07b', 'STALE_SNAPSHOT (5. kapi)', 'ofis onay talebi/savedIntent okunamadi');
    } else {
      let injected = false; let restoreError = null; let r = null; let after = null;
      try {
        const mutated = { ...(origIntent && typeof origIntent === 'object' ? origIntent : {}),
          snapshotHash: `i3-stale-intent-${st.runId}` };
        await prisma.officeApprovalRequest.update({ where: { id: oid }, data: { savedIntent: mutated } });
        injected = true;
        r = await L.AH.httpJson('POST', url('complete-content-approval'),
          { token: tokens.elev3, body: { approvalRequestId: await approvalIdOf('contentApprovalRequestId') } });
        after = await snap(prisma, vid);
      } catch (e) {
        r = r || { indeterminate: true, indeterminateReason: e && e.message ? e.message : String(e) };
      } finally {
        if (injected) {
          try {
            await prisma.officeApprovalRequest.update({ where: { id: oid }, data: { savedIntent: origIntent } });
          } catch (e) { restoreError = e && e.message ? e.message : String(e); }
        }
      }
      if (restoreError) {
        R.add('H4-07b', 'STALE_SNAPSHOT (5. kapi)', L.VERDICT.FAIL,
          `enjeksiyon GERI ALINAMADI: ${restoreError}`);
        staleRestoreFailed = true;
      } else if (!r || r.indeterminate || !after || after.error || before.error) {
        R.unmeasured('H4-07b', 'STALE_SNAPSHOT (5. kapi)',
          (r && r.indeterminateReason) || (after && after.error) || 'senaryo kurulamadi');
      } else {
        const exact = L.decide.matchesExactCode(r, 'DISCLOSURE_APPROVAL_STALE_SNAPSHOT');
        const passedGate2 = !L.decide.matchesExactCode(r, 'DISCLOSURE_APPROVAL_CONTENT_HASH_MISMATCH');
        const preserved = after.value.contentApprovedById === null
          && after.value.contentApprovedAt === null
          && after.value.snapshotHash === before.value.snapshotHash;
        R.check('H4-07b', 'savedIntent bozulunca 2. KAPI GECILIR ve 5. KAPI: TAM STALE_SNAPSHOT; onay damgalari korunur',
          exact && passedGate2 && preserved,
          `HTTP ${r.status} · code=${codeOf(r)} · TAM eslesme=${exact}`
          + ` (beklenen DISCLOSURE_APPROVAL_STALE_SNAPSHOT)`
          + ` · 2. kapi (CONTENT_HASH) GECILDI=${passedGate2}`
          + ` · contentApprovedById=${after.value.contentApprovedById}`
          + ` · snapshotHash KORUNDU=${after.value.snapshotHash === before.value.snapshotHash}`);
      }
    }
  }

  // ── İçerik onayı tamamlanır (üçüncü kişi) — enjeksiyon geri alınamadıysa ÇALIŞTIRILMAZ ──
  if (staleRestoreFailed) {
    R.unmeasured('H4-08', 'yayin allowlist kapisi',
      'onceki enjeksiyon geri alinamadi — bagimli senaryo CALISTIRILMADI (erisim sonlandirma YINE calisir)');
    return;
  }
  const rContentOk = await L.AH.httpJson('POST', url('complete-content-approval'),
    { token: tokens.elev3, body: { approvalRequestId: await approvalIdOf('contentApprovalRequestId') } });
  const afterContent = await snap(prisma, vid);

  // ── H4-08 · Yayın allowlist'i: onaylı sağlayıcı ilerler, allowlist DIŞI REDDEDİLİR ──
  // Allowlist dışı senaryo YERELDE koşulur: `EmailProviderService.providerName` allowlist'te
  // değilse yayın **sağlayıcıya tek byte gitmeden** durur (charter §35.10). Sağlayıcı çağrısı
  // yapılmadığı, yakalayıcıdaki mesaj sayısının DEĞİŞMEMESİYLE ölçülür.
  {
    const declared = (process.env.I3_API_EMAIL_PROVIDER || '').toLowerCase();
    if (rContentOk.indeterminate || rContentOk.status >= 400 || afterContent.error
        || afterContent.value.contentApprovedById !== st.actors.elev3.id) {
      R.unmeasured('H4-08', 'yayin allowlist kapisi',
        `icerik onayi tamamlanamadi (HTTP ${rContentOk.status ?? 'belirsiz'}, code=${codeOf(rContentOk)})`);
    } else if (!declared) {
      R.unmeasured('H4-08', 'yayin allowlist kapisi', 'I3_API_EMAIL_PROVIDER bildirilmedi');
    } else {
      const approved = ['smtp', 'sendgrid', 'ses'].includes(declared);
      const before = await snap(prisma, vid);
      // IKI AYRI OLCUM: (a) teslim edilen mesaj sayisi, (b) DISPATCHER CAGRI sayisi
      // (TCP oturumu). "Yakalayicida mesaj yok" tek basina "cagri yapilmadi" DEMEZ.
      const sentBefore = ctx.sink ? ctx.sink.count() : null;
      const callsBefore = ctx.sink ? ctx.sink.dispatcherCalls() : null;
      const rPub = await L.AH.httpJson('POST', url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
      const after = await snap(prisma, vid);
      const sentAfter = ctx.sink ? ctx.sink.count() : null;
      const callsAfter = ctx.sink ? ctx.sink.dispatcherCalls() : null;

      if (rPub.indeterminate || before.error || after.error) {
        R.unmeasured('H4-08', 'yayin allowlist kapisi', rPub.indeterminateReason || after.error);
      } else if (approved) {
        R.check('H4-08', `onayli saglayici (${declared}) ile yayin ILERLER`,
          rPub.status < 400 && before.json !== after.json,
          `HTTP ${rPub.status} · durum ${before.value.status}→${after.value.status}`
          + (sentBefore === null ? '' : ` · yakalanan mesaj ${sentBefore}→${sentAfter}`
            + ` · dispatcher cagrisi ${callsBefore}→${callsAfter}`));
      } else {
        // Allowlist DISI (§35.10 `assertProductionProvider`): saglayiciya TEK BYTE gitmeden
        // reddedilir. OLCULEN SEY — urun davranisi DEGISTIRILMEDI:
        //   (1) istek reddedilir (403),
        //   (2) yayin TAMAMLANMAZ: durum PUBLISHED olmaz,
        //   (3) saglayici KABULU YOK: providerMessageId/providerAcceptedAt bos kalir,
        //   (4) SAGLAYICIYA CAGRI YOK: yakalayici mesaj sayisi sabit.
        // Durum alaninin bir basarisizlik damgasi almasi urunun mesru davranisidir; olcut
        // "hic degismesin" demez, "YAYIN TAMAMLANMASIN" der.
        // (a) teslim edilen mesaj yok  (b) DISPATCHER hic cagrilmadi — AYRI iddialar.
        const noMessage = sentBefore === null ? null : (sentAfter === sentBefore);
        const noDispatcherCall = callsBefore === null ? null : (callsAfter === callsBefore);
        const notPublished = after.value.status !== 'PUBLISHED';
        const noProviderAccept = !after.value.providerMessageId && !after.value.providerAcceptedAt;
        R.check('H4-08', `allowlist DISI (${declared}): RED + yayin TAMAMLANMAZ + saglayici kabulu YOK + DISPATCHER CAGRILMADI`,
          rPub.status === 403 && notPublished && noProviderAccept
          && noMessage === true && noDispatcherCall === true,
          `HTTP ${rPub.status} · code=${codeOf(rPub)}`
          + ` · durum ${before.value.status}→${after.value.status} (PUBLISHED DEGIL=${notPublished})`
          + ` · providerMessageId=${after.value.providerMessageId ?? 'null'}`
          + ` providerAcceptedAt=${after.value.providerAcceptedAt ? 'DOLU(!)' : 'null'}`
          + ` · [a] teslim mesaji ${sentBefore}→${sentAfter} (yok=${noMessage})`
          + ` · [b] DISPATCHER CAGRISI ${callsBefore}→${callsAfter} (cagrilmadi=${noDispatcherCall})`
          + ` — (a) ve (b) AYRI iddialardir; ikisi de olculmeden PASS URETILMEZ`);
      }

    }
  }
};
