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
  const IDS = ['H4-06a', 'H4-06b', 'H4-07a', 'H4-07b', 'H4-07c', 'H4-08'];
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

  // ── H4-07b · STALE_SNAPSHOT: kayıtlı intent ↔ sürüm snapshot'ı uyuşmuyor ──
  // Amaçlanan kontrol: `complete-content-approval` içindeki
  // `intent.snapshotHash !== version.snapshotHash || stableJsonHash(intent) !== payloadHash`
  // (`client-financial-disclosure-approval.service.ts:455-459`).
  // Enjeksiyon `version.snapshotHash` üzerinde yapılır; GERİ ALMA `finally` içindedir ve
  // geri alma hatası YUTULMAZ — yutulursa sonraki senaryolar bozuk zeminde koşardı.
  {
    const before = await snap(prisma, vid);
    let injected = false;
    let restoreError = null;
    let rStale = null;
    let after = null;
    try {
      if (before.error) throw new Error(`fotograf alinamadi: ${before.error}`);
      await prisma.clientFinancialDisclosureVersion.update({
        where: { id: vid }, data: { snapshotHash: `i3-stale-${st.runId}` },
      });
      injected = true;
      rStale = await L.AH.httpJson('POST', url('complete-content-approval'),
        { token: tokens.elev3, body: { approvalRequestId: await approvalIdOf('contentApprovalRequestId') } });
      after = await snap(prisma, vid);
    } catch (e) {
      restoreError = restoreError || null;
      rStale = rStale || { indeterminate: true, indeterminateReason: e && e.message ? e.message : String(e) };
    } finally {
      if (injected) {
        try {
          await prisma.clientFinancialDisclosureVersion.update({
            where: { id: vid }, data: { snapshotHash: before.value.snapshotHash },
          });
        } catch (e) {
          // GERI ALMA HATASI YUTULMAZ: sonraki senaryolar bozuk zeminde kosmamali.
          restoreError = e && e.message ? e.message : String(e);
        }
      }
    }
    if (restoreError) {
      R.add('H4-07b', 'STALE_SNAPSHOT kapisi', L.VERDICT.FAIL,
        `enjeksiyon GERI ALINAMADI: ${restoreError} — sonraki senaryolar bozuk zeminde kosar`);
    } else if (!rStale || rStale.indeterminate || !after || after.error) {
      R.unmeasured('H4-07b', 'STALE_SNAPSHOT kapisi',
        (rStale && rStale.indeterminateReason) || (after && after.error) || 'senaryo kurulamadi');
    } else {
      const c = String(codeOf(rStale) || '');
      R.check('H4-07b', 'surum snapshot\'i degisince STALE_SNAPSHOT ile RED; icerik onayi YAZILMAZ',
        rStale.status >= 400 && (c.includes('STALE') || c.includes('CONTENT_HASH_MISMATCH'))
        && after.value.contentApprovedById === null,
        `HTTP ${rStale.status} · code=${c} (amaclanan kontrol: intent↔surum snapshot karsilastirmasi)`
        + ` · contentApprovedById=${after.value.contentApprovedById} (null beklenir)`
        + ` · enjeksiyon geri alindi=EVET`);
    }
  }

  // ── H4-07c · CONTENT_HASH_MISMATCH: bildirim içeriği hash'i uyuşmuyor ──
  // Amaçlanan kontrol AYRIDIR: `recomputedContentHash !== version.notificationContentHash`
  // (`client-financial-disclosure-approval.service.ts:638`). Enjeksiyon bu kez
  // `notificationContentHash` üzerindedir; snapshot'a DOKUNULMAZ.
  {
    const before = await snap(prisma, vid);
    const origHash = await prisma.clientFinancialDisclosureVersion
      .findUnique({ where: { id: vid }, select: { notificationContentHash: true } })
      .then((v) => (v ? v.notificationContentHash : undefined))
      .catch(() => undefined);

    if (origHash === undefined) {
      R.unmeasured('H4-07c', 'CONTENT_HASH_MISMATCH kapisi', 'notificationContentHash okunamadi');
    } else if (origHash === null) {
      R.unmeasured('H4-07c', 'CONTENT_HASH_MISMATCH kapisi',
        'bu asamada notificationContentHash NULL — amaclanan kontrole ulasilamaz (senaryo on kosulu yok)');
    } else {
      let injected = false; let restoreError = null; let rHash = null; let after = null;
      try {
        await prisma.clientFinancialDisclosureVersion.update({
          where: { id: vid }, data: { notificationContentHash: `i3-contenthash-${st.runId}` },
        });
        injected = true;
        rHash = await L.AH.httpJson('POST', url('complete-content-approval'),
          { token: tokens.elev3, body: { approvalRequestId: await approvalIdOf('contentApprovalRequestId') } });
        after = await snap(prisma, vid);
      } catch (e) {
        rHash = rHash || { indeterminate: true, indeterminateReason: e && e.message ? e.message : String(e) };
      } finally {
        if (injected) {
          try {
            await prisma.clientFinancialDisclosureVersion.update({
              where: { id: vid }, data: { notificationContentHash: origHash },
            });
          } catch (e) { restoreError = e && e.message ? e.message : String(e); }
        }
      }
      if (restoreError) {
        R.add('H4-07c', 'CONTENT_HASH_MISMATCH kapisi', L.VERDICT.FAIL,
          `enjeksiyon GERI ALINAMADI: ${restoreError}`);
      } else if (!rHash || rHash.indeterminate || !after || after.error || before.error) {
        R.unmeasured('H4-07c', 'CONTENT_HASH_MISMATCH kapisi',
          (rHash && rHash.indeterminateReason) || (after && after.error) || 'senaryo kurulamadi');
      } else {
        const c = String(codeOf(rHash) || '');
        R.check('H4-07c', 'bildirim icerigi hash\'i degisince CONTENT_HASH_MISMATCH ile RED; icerik onayi YAZILMAZ',
          rHash.status >= 400 && c.includes('CONTENT_HASH_MISMATCH')
          && after.value.contentApprovedById === null,
          `HTTP ${rHash.status} · code=${c} (amaclanan kontrol: notificationContentHash karsilastirmasi)`
          + ` · contentApprovedById=${after.value.contentApprovedById} (null beklenir)`
          + ` · enjeksiyon geri alindi=EVET`);
      }
    }
  }

  // ── İçerik onayı tamamlanır (üçüncü kişi) ──
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
      // Sayac saglayici BILDIRIMINDEN bagimsizdir: sink sureci calisiyorsa sayilir.
      const sentBefore = ctx.sink ? ctx.sink.count() : null;
      const rPub = await L.AH.httpJson('POST', url('publish'), { token: tokens.elev3, body: {}, timeoutMs: 25000 });
      const after = await snap(prisma, vid);
      const sentAfter = ctx.sink ? ctx.sink.count() : null;

      if (rPub.indeterminate || before.error || after.error) {
        R.unmeasured('H4-08', 'yayin allowlist kapisi', rPub.indeterminateReason || after.error);
      } else if (approved) {
        R.check('H4-08', `onayli saglayici (${declared}) ile yayin ILERLER`,
          rPub.status < 400 && before.json !== after.json,
          `HTTP ${rPub.status} · durum ${before.value.status}→${after.value.status}`
          + (sentBefore === null ? '' : ` · yakalanan mesaj ${sentBefore}→${sentAfter}`));
      } else {
        // Allowlist DISI (§35.10 `assertProductionProvider`): saglayiciya TEK BYTE gitmeden
        // reddedilir. OLCULEN SEY — urun davranisi DEGISTIRILMEDI:
        //   (1) istek reddedilir (403),
        //   (2) yayin TAMAMLANMAZ: durum PUBLISHED olmaz,
        //   (3) saglayici KABULU YOK: providerMessageId/providerAcceptedAt bos kalir,
        //   (4) SAGLAYICIYA CAGRI YOK: yakalayici mesaj sayisi sabit.
        // Durum alaninin bir basarisizlik damgasi almasi urunun mesru davranisidir; olcut
        // "hic degismesin" demez, "YAYIN TAMAMLANMASIN" der.
        const noProviderCall = sentBefore === null ? null : (sentAfter === sentBefore);
        const notPublished = after.value.status !== 'PUBLISHED';
        const noProviderAccept = !after.value.providerMessageId && !after.value.providerAcceptedAt;
        R.check('H4-08', `allowlist DISI saglayici (${declared}): RED + yayin TAMAMLANMAZ + saglayici kabulu YOK + CAGRI YOK`,
          rPub.status === 403 && notPublished && noProviderAccept && noProviderCall === true,
          `HTTP ${rPub.status} · code=${codeOf(rPub)}`
          + ` · durum ${before.value.status}→${after.value.status} (PUBLISHED DEGIL=${notPublished})`
          + ` · providerMessageId=${after.value.providerMessageId ?? 'null'}`
          + ` providerAcceptedAt=${after.value.providerAcceptedAt ? 'DOLU(!)' : 'null'}`
          + ` · yakalayici mesaj sayisi ${sentBefore}→${sentAfter}`
          + ` (SABIT beklenir = saglayiciya cagri YOK; olculemezse PASS URETILMEZ)`);
      }

    }
  }
};
