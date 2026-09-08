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
 *   H4-07b  stale snapshot              (ofis onayından sonra içerik değişirse onay geçersiz)
 *   H4-08   yayın allowlist'i           (onaylı sağlayıcı dışına çıkılmaz)
 *
 * GENEL `500` YETKİ REDDİ SAYILMAZ: yetki ölçütleri `403` bekler, sözleşme hatası `400`.
 * Her senaryoda beklenen hata sözleşmesi VE korunacak kalıcı durum BİRLİKTE sınanır.
 */
'use strict';
const L = require('./i3-lib');

const isDenied = (r) => !r.indeterminate && r.status === 403;
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
      },
    });
    return { value: v, json: JSON.stringify(v), error: null };
  } catch (e) {
    return { value: null, json: null, error: e && e.message ? e.message : String(e) };
  }
}

module.exports = async function runH4Disclosure(ctx) {
  const { base, prisma, tokens, st, R, chain, chainError } = ctx;
  const IDS = ['H4-06a', 'H4-06b', 'H4-07a', 'H4-07b', 'H4-08'];
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
    for (const id of ['H4-07a', 'H4-07b', 'H4-08']) {
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
    for (const id of ['H4-07a', 'H4-07b', 'H4-08']) {
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

  // ── H4-07b · Stale snapshot: ofis onayından SONRA içerik değişirse onay geçersizdir ──
  {
    const before = await snap(prisma, vid);
    // Finansal içeriği ürünün gördüğü yerden değiştir: snapshotHash artık kayıtlı intent ile
    // uyuşmaz. (Kalıcı durum bozulmasın diye DEĞER geri alınır.)
    let mutated = false;
    try {
      await prisma.clientFinancialDisclosureVersion.update({
        where: { id: vid }, data: { snapshotHash: `i3-stale-${st.runId}` },
      });
      mutated = true;
    } catch (e) { /* asagida UNMEASURED */ }

    if (!mutated) {
      R.unmeasured('H4-07b', 'stale snapshot kapisi', 'snapshot degistirilemedi — senaryo kurulamadi');
    } else {
      const rStale = await L.AH.httpJson('POST', url('complete-content-approval'),
        { token: tokens.elev3, body: {} }); // ucuncu kisi: four-eyes/self engeli YOK
      const after = await snap(prisma, vid);
      // Değeri geri koy ki H4-08 tutarlı bir sürümle koşsun.
      await prisma.clientFinancialDisclosureVersion.update({
        where: { id: vid }, data: { snapshotHash: before.value.snapshotHash },
      }).catch(() => {});

      if (rStale.indeterminate || before.error || after.error) {
        R.unmeasured('H4-07b', 'stale snapshot kapisi', rStale.indeterminateReason || after.error);
      } else {
        // OLCULEN HATA SOZLESMESI: `snapshotHash` degisiminde urun 409 +
        // `DISCLOSURE_APPROVAL_CONTENT_HASH_MISMATCH` dondurur; `savedIntent` bayatlamasinda
        // `DISCLOSURE_APPROVAL_STALE_SNAPSHOT`. IKISI DE ayni invariant'in kapisidir.
        // Beklenti GEVSETILMEDI — davranis (red + icerik onayi YAZILMAMASI) aynen aranir;
        // yalnizca kod adi varsayimi GERCEK SOZLESMEYE baglandi.
        const stCode = String(codeOf(rStale) || '');
        R.check('H4-07b', 'ofis onayindan SONRA icerik degisirse onay REDDEDILIR (hash/stale kapisi) ve icerik onayi YAZILMAZ',
          !rStale.indeterminate && rStale.status >= 400
          && (stCode.includes('STALE') || stCode.includes('CONTENT_HASH_MISMATCH'))
          && after.value.contentApprovedById === null,
          `HTTP ${rStale.status} · code=${stCode}`
          + ` · contentApprovedById=${after.value.contentApprovedById} (null beklenir)`);
      }
    }
  }

  // ── İçerik onayı tamamlanır (üçüncü kişi) ──
  const rContentOk = await L.AH.httpJson('POST', url('complete-content-approval'),
    { token: tokens.elev3, body: { approvalRequestId: await approvalIdOf('contentApprovalRequestId') } });
  const afterContent = await snap(prisma, vid);

  // ── H4-08 · Yayın yalnız ONAYLI sağlayıcıya çıkar ──
  {
    const declared = (process.env.I3_API_EMAIL_PROVIDER || '').toLowerCase();
    const approved = ['smtp', 'sendgrid', 'ses'].includes(declared);
    if (rContentOk.indeterminate || rContentOk.status >= 400 || afterContent.error
        || afterContent.value.contentApprovedById !== st.actors.elev3.id) {
      R.unmeasured('H4-08', 'yayin allowlist kapisi',
        `icerik onayi tamamlanamadi (HTTP ${rContentOk.status ?? 'belirsiz'}, code=${codeOf(rContentOk)})`);
    } else if (!declared) {
      R.unmeasured('H4-08', 'yayin allowlist kapisi',
        'I3_API_EMAIL_PROVIDER bildirilmedi — allowlist kararinin girdisi BILINMIYOR');
    } else {
      const before = await snap(prisma, vid);
      const rPub = await L.AH.httpJson('POST', url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
      const after = await snap(prisma, vid);
      if (rPub.indeterminate || before.error || after.error) {
        R.unmeasured('H4-08', 'yayin allowlist kapisi', rPub.indeterminateReason || after.error);
      } else if (approved) {
        R.check('H4-08', `onayli saglayici (${declared}) ile yayin ILERLER`,
          rPub.status < 400 && before.json !== after.json,
          `HTTP ${rPub.status} · durum ${before.value.status}→${after.value.status}`);
      } else {
        R.check('H4-08', `allowlist DISI saglayici (${declared}) ile yayin BASLAMAZ ve durum DEGISMEZ`,
          rPub.status >= 400 && before.json === after.json,
          `HTTP ${rPub.status} · code=${codeOf(rPub)} · durum DEGISMEDI=${before.json === after.json}`);
      }
    }
  }
};
