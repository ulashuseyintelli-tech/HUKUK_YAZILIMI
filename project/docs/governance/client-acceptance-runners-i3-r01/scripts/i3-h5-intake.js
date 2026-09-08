/*
 * İ3 DÜZENEK — H5: BİLGİ/BELGE TOPLAMA (İ2 ölçütleri H5-01…H5-06)
 *
 * H5-01 = A-9 + A-10 · H5-02 = A-5 + A-6. Aynı davranış İ12'de TEKRAR SAYILMAZ (İ2 §6).
 *
 * YANLIŞ PASS YOLLARI KAPATILDI (owner düzeltmesi):
 *  - Sayım/okuma hatası artık `null` DÖNMEZ; `safeCount` ile `{value,error}` döner ve
 *    hata varsa ölçüt **UNMEASURED**'dır. `null === null` ile "değişmedi" iddiası ÜRETİLEMEZ.
 *  - Belirsiz HTTP hiçbir ölçütte PASS üretmez.
 *  - Tekrar (idempotency) isteğinin **sonucu da** kontrol edilir; yalnız loglanmaz.
 *  - Yetki reddi `403` ile ölçülür; genel `500` yetki reddi SAYILMAZ.
 *  - Negatif yetki senaryolarında aktörün GEÇERLİ PROFİLİ vardır; profil eksikliğinden gelen
 *    403 grant reddinin kanıtı SAYILMAZ (ayrımı `H5-05b` ölçer).
 *
 * YOL B: sağlayıcı ayarı süreç-genel ENV'den gelir; İ1a'nın tenant `Office` provası bu yola
 * GEÇERLİ DEĞİLDİR. Sağlayıcı izolasyonu ilk gönderimden ÖNCE doğrulanır (`H5-00`).
 */
'use strict';
const L = require('./i3-lib');

/** Yetki reddi SADECE 403'tür; 500 "reddedildi" sayılmaz. */
const isDenied = (r) => !r.indeterminate && r.status === 403;
const anyIndet = (...rs) => rs.some((r) => r && r.indeterminate);

module.exports = async function runH5(ctx) {
  const { base, prisma, tokens, st, R, sink } = ctx;
  const cid = st.clientId;
  L.AH.step('H5', 'bilgi/belge toplama — 6 olcut');

  const cntInfoReq = () => L.safeCount(() => prisma.clientInfoRequest.count({ where: { tenantId: st.tenantId } }));
  const cntNotif = () => L.safeCount(() => prisma.clientNotification.count({ where: { tenantId: st.tenantId } }));
  const cntAudit = () => L.safeCount(() => prisma.addressAuditLog.count({ where: { tenantId: st.tenantId } }));
  const cntIntel = () => L.safeCount(() => prisma.clientIntelStatement.count({ where: { tenantId: st.tenantId } }));

  const postInfoRequest = (subject, extra = {}) => L.AH.httpJson(
    'POST', `${base}/address-discovery/client-info-request`, {
      token: tokens.elev1,
      body: {
        caseId: st.caseId, clientId: cid,
        emailTo: `alici-${st.runId}@ah-harness.invalid`,
        emailSubject: subject,
        emailBody: 'I3 sentetik bilgi talebi govdesi.',
        ...extra,
      },
      timeoutMs: 25000,
    });

  // ══ H5-00 · Sağlayıcı izolasyonu GÖNDERİMDEN ÖNCE doğrulanır ══
  if (!sink || !sink.available) {
    R.unmeasured('H5-00', 'saglayici izolasyonu gonderimden ONCE dogrulandi',
      'Yol B izolasyonu bildirilmedi (EMAIL_PROVIDER=smtp + loopback yakalama gerekir); '
      + 'mock saglayici gercek tasima hatasi kaniti YERINE GECMEZ');
  } else {
    const probe = await sink.verifyBoundBeforeSend();
    R.check('H5-00', 'yerel yakalayici ERISILIR ve LAN adresinden ERISILEMEZ (gonderimden ONCE)',
      probe.loopbackReachable && !probe.anyLanReachable && probe.lanChecked > 0,
      `loopback=${probe.loopbackReachable ? 'ERISILIR' : 'ERISILEMEZ'}`
      + ` · LAN ${probe.lanChecked} adres denendi, erisilen=${probe.anyLanReachable ? 'VAR(!)' : 'YOK'}`);
  }

  // ══ H5-01 · Üç sonuç ayrı: ACCEPTED / REJECTED / INDETERMINATE ══
  if (!sink || !sink.available) {
    R.unmeasured('H5-01', 'bilgi talebi ucu uc sonuc (A-9/A-10)', 'Yol B izolasyonu kurulmadi');
    R.unmeasured('H5-01b', 'belirsiz sonucta otomatik tekrar gonderim yok', 'Yol B izolasyonu kurulmadi');
  } else {
    // (a) ACCEPTED → kayıt YAZILIR
    await sink.setMode('');
    const reqA = await cntInfoReq();
    const rOk = await postInfoRequest(`I3-ACCEPT-${st.runId}`);
    const reqB = await cntInfoReq();

    // (b) REJECTED (550) → 503 + kayıt YAZILMAZ + bildirim/audit de YAZILMAZ
    await sink.setMode('reject');
    const notifB = await cntNotif();
    const auditB = await cntAudit();
    const rRej = await postInfoRequest(`I3-REJECT-${st.runId}`);
    const reqC = await cntInfoReq();
    const notifC = await cntNotif();
    const auditC = await cntAudit();

    // (c) INDETERMINATE (ECONNRESET) → 503 + kayıt YAZILMAZ + TEK deneme
    await sink.setMode('reset');
    const convBefore = sink.conversations();
    const rInd = await postInfoRequest(`I3-INDET-${st.runId}`);
    const reqD = await cntInfoReq();
    const notifD = await cntNotif();
    const convAfter = sink.conversations();
    await sink.setMode('');

    const code = (r) => (r.body && (r.body.reasonCode
      || (r.body.message && r.body.message.reasonCode))) || null;
    const counts = [reqA, reqB, reqC, reqD, notifB, notifC, notifD, auditB, auditC];
    const countErr = counts.find((c) => c.error);

    if (anyIndet(rOk, rRej, rInd)) {
      R.unmeasured('H5-01', 'bilgi talebi ucu uc sonuc (A-9/A-10)',
        'HTTP katmani BELIRSIZ — sunucu sonucu ayirt edilemedi');
    } else if (countErr) {
      R.unmeasured('H5-01', 'bilgi talebi ucu uc sonuc (A-9/A-10)',
        `kalici durum sorgusu DUSTU: ${countErr.error}`);
    } else {
      const acceptedOk = rOk.status < 400 && reqB.value === reqA.value + 1;
      const rejectedOk = rRej.status === 503
        && code(rRej) === 'CLIENT_INFO_REQUEST_EMAIL_FAILED'
        && reqC.value === reqB.value && notifC.value === notifB.value
        && auditC.value === auditB.value;
      const indetOk = rInd.status === 503
        && code(rInd) === 'CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE'
        && reqD.value === reqC.value && notifD.value === notifC.value;
      R.check('H5-01', 'uc sonuc AYRI: kabul→kayit · ret→503+kayit/bildirim/audit YOK · belirsiz→503+kayit YOK',
        acceptedOk && rejectedOk && indetOk,
        `ACCEPTED HTTP ${rOk.status} talep ${reqA.value}→${reqB.value}`
        + ` | REJECTED HTTP ${rRej.status}/${code(rRej)} talep ${reqB.value}→${reqC.value}`
        + ` bildirim ${notifB.value}→${notifC.value} audit ${auditB.value}→${auditC.value}`
        + ` | INDETERMINATE HTTP ${rInd.status}/${code(rInd)} talep ${reqC.value}→${reqD.value}`
        + ` bildirim ${notifC.value}→${notifD.value}`);
    }

    // A-10'un ikinci yarısı: belirsiz POST çevresinde TEK sağlayıcı denemesi
    if (anyIndet(rInd)) {
      R.unmeasured('H5-01b', 'belirsiz sonucta otomatik tekrar gonderim yok', 'belirsiz POST olculemedi');
    } else {
      const delta = convAfter - convBefore;
      R.check('H5-01b', 'belirsiz sonucta OTOMATIK TEKRAR GONDERIM yapilmaz',
        delta === 1,
        `belirsiz POST cevresinde saglayici konusma farki=${delta}`
        + ` (tek deneme beklenir; kor tekrar olsaydi >=2)`);
    }
  }

  // ══ H5-02 · A-5/A-6: bağlantı TAŞIMA gövdesinde, KALICI kayıtlarda DEĞİL ══
  // Bağımsız link üretimi (H5-02a) ile BAĞLANTILI bilgi talebi gönderimi (H5-02b) AYRI ölçülür.
  let linkId = null; let rawToken = null;
  {
    const r = await L.AH.httpJson('POST', `${base}/client-intake-links/case/${st.caseId}`, {
      token: tokens.elev1, body: { clientId: cid, scope: ['ADDRESS'] },
    });
    if (r.indeterminate) {
      R.unmeasured('H5-02a', 'bagimsiz baglanti uretimi: ham token yalniz olusturma yanitinda',
        r.indeterminateReason);
    } else {
      const d = (r.body && (r.body.data || r.body)) || {};
      linkId = d.id || (d.link && d.link.id) || null;
      rawToken = d.rawToken || d.token || (d.link && d.link.rawToken) || null;
      let readLeak = null;
      if (linkId && rawToken) {
        const rRead = await L.AH.httpJson('GET', `${base}/client-intake-links/${linkId}`, { token: tokens.elev1 });
        readLeak = rRead.indeterminate ? null : JSON.stringify(rRead.body || {}).includes(rawToken);
      }
      R.check('H5-02a', 'bagimsiz baglanti: ham token YALNIZ olusturma yanitinda, okuma ucunda YOK',
        r.status === 201 && !!rawToken && readLeak === false,
        `HTTP ${r.status} · token dondu=${!!rawToken}`
        + ` · okuma ucunda sizinti=${readLeak === null ? 'OLCULEMEDI' : readLeak}`);
    }
  }

  // H5-02b — GERÇEK attachIntakeLink akışı: aynı işlemde taşıma gövdesi ve kalıcı kayıtlar
  if (!sink || !sink.available) {
    R.unmeasured('H5-02b', 'baglantili bilgi talebi: link TASIMADA, kalici kayitlarda YOK',
      'Yol B yakalayicisi yok — tasima govdesi okunamaz');
  } else {
    await sink.setMode('');
    const before = sink.count();
    const subject = `I3-ATTACH-${st.runId}`;
    const r = await postInfoRequest(subject, { attachIntakeLink: true, intakeScope: ['ADDRESS'] });
    await new Promise((res) => setTimeout(res, 400));

    if (r.indeterminate) {
      R.unmeasured('H5-02b', 'baglantili bilgi talebi (A-5/A-6)', r.indeterminateReason);
    } else if (r.status >= 400) {
      R.unmeasured('H5-02b', 'baglantili bilgi talebi (A-5/A-6)',
        `gonderim HTTP ${r.status} — akis kurulamadi (${JSON.stringify(r.body).slice(0, 120)})`);
    } else {
      // Bu işlemde üretilen bağlantının ham token'ı: taşıma gövdesinden okunur.
      const captured = sink.readCaptured().filter((m) => m.includes(subject));
      const transport = captured.join('\n');
      const m = transport.match(/intake\/([A-Za-z0-9._~-]{16,})/);
      const attachedToken = m ? m[1] : null;

      // Kalıcı yüzeyler: talep + bildirim + adres audit
      const [reqRows, notifRows, auditRows] = await Promise.all([
        prisma.clientInfoRequest.findMany({ where: { tenantId: st.tenantId } }),
        prisma.clientNotification.findMany({ where: { tenantId: st.tenantId } }),
        prisma.addressAuditLog.findMany({ where: { tenantId: st.tenantId } }).catch(() => null),
      ]);
      const persisted = JSON.stringify(reqRows) + JSON.stringify(notifRows)
        + (auditRows === null ? '' : JSON.stringify(auditRows));
      const persistedLeak = attachedToken ? persisted.includes(attachedToken) : null;

      R.check('H5-02b', 'A-5/A-6: baglanti TASIMA govdesinde VAR, ayni islemin KALICI kayitlarinda YOK',
        captured.length >= 1 && !!attachedToken && persistedLeak === false
        && (auditRows !== null),
        `yakalanan mesaj ${before}→${sink.count()} (bu talebe ait ${captured.length})`
        + ` · tasimada baglanti=${!!attachedToken}`
        + ` · kalici govdede sizinti=${persistedLeak === null ? 'OLCULEMEDI' : persistedLeak}`
        + ` · taranan yuzey: ClientInfoRequest(${reqRows.length}) + ClientNotification(${notifRows.length})`
        + ` + AddressAuditLog(${auditRows === null ? 'OKUNAMADI' : auditRows.length})`);
    }
  }

  // ══ H5-03 · İptal: sonraki kullanım kapanır ve KALICI KAYIT OLUŞMAZ ══
  if (!linkId || !rawToken) {
    R.unmeasured('H5-03', 'baglanti iptali kullanimi kapatir', 'baglanti veya ham token alinamadi');
  } else {
    const subsBefore = await L.safeCount(() => prisma.clientIntakeSubmission.count({
      where: { intakeLinkId: linkId },
    }));
    const rBefore = await L.AH.httpJson('GET', `${base}/public/intake/${rawToken}`);
    const rRevoke = await L.AH.httpJson('POST', `${base}/client-intake-links/${linkId}/revoke`, {
      token: tokens.elev1, body: {},
    });
    const rAfter = await L.AH.httpJson('GET', `${base}/public/intake/${rawToken}`);
    const rSubmit = await L.AH.httpJson('POST', `${base}/public/intake/${rawToken}`, {
      body: { fields: [{ category: 'ADDRESS', value: 'iptal sonrasi deneme' }] },
    });
    const subsAfter = await L.safeCount(() => prisma.clientIntakeSubmission.count({
      where: { intakeLinkId: linkId },
    }));
    // `ClientIntakeLink` `revokedAt` TASIMAZ; iptal `status` alanindadir (schema:5543).
    const linkRow = await prisma.clientIntakeLink.findUnique({
      where: { id: linkId }, select: { status: true },
    }).catch(() => null);

    if (anyIndet(rBefore, rRevoke, rAfter, rSubmit)) {
      R.unmeasured('H5-03', 'baglanti iptali kullanimi kapatir', 'uclardan biri BELIRSIZ');
    } else if (subsBefore.error || subsAfter.error) {
      R.unmeasured('H5-03', 'baglanti iptali kullanimi kapatir',
        `submission sorgusu DUSTU: ${subsBefore.error || subsAfter.error}`);
    } else if (!linkRow) {
      R.unmeasured('H5-03', 'baglanti iptali kullanimi kapatir', 'baglanti satiri okunamadi');
    } else {
      R.check('H5-03', 'iptal: oncesi ACIK, sonrasi KAPALI; iptalli baglantidan BU LINKE bagli kayit OLUSMAZ',
        rBefore.status < 400 && rRevoke.status < 400 && rAfter.status >= 400
        && rSubmit.status >= 400 && linkRow.status === 'REVOKED'
        && subsAfter.value === subsBefore.value,
        `oncesi GET→${rBefore.status} · revoke→${rRevoke.status} (link durumu=${linkRow.status})`
        + ` · sonrasi GET→${rAfter.status} · sonrasi POST→${rSubmit.status}`
        + ` · BU LINKE bagli submission ${subsBefore.value}→${subsAfter.value}`);
    }
  }

  // ══ H5-04 · Public uç toplar, KANONİK kayda dokunmaz ══
  let submissionId = null; let fieldId = null;
  {
    const rLink = await L.AH.httpJson('POST', `${base}/client-intake-links/case/${st.caseId}`, {
      token: tokens.elev1, body: { clientId: cid, scope: ['ADDRESS'] },
    });
    const d = (rLink.body && (rLink.body.data || rLink.body)) || {};
    const tok = d.rawToken || d.token || (d.link && d.link.rawToken) || null;

    if (!tok) {
      for (const id of ['H5-04', 'H5-05', 'H5-05b', 'H5-06']) {
        R.unmeasured(id, 'intake inceleme/aktarim', 'ikinci baglanti veya ham token alinamadi');
      }
      return;
    }

    // Kanonik hedefler KİMLİK düzeyinde fotoğraflanır (sayım tek başına yeterli değil).
    const intelBefore = await L.safeCount(() => prisma.clientIntelStatement.findMany({
      where: { tenantId: st.tenantId }, select: { id: true }, orderBy: { id: 'asc' },
    }));
    const addrBefore = await L.safeCount(() => prisma.clientAddress.findMany({
      where: { clientId: cid }, select: { id: true }, orderBy: { id: 'asc' },
    }));
    const rSubmit = await L.AH.httpJson('POST', `${base}/public/intake/${tok}`, {
      body: { fields: [{ category: 'ADDRESS', value: 'I3 sentetik adres beyani' }] },
    });
    const intelAfter = await L.safeCount(() => prisma.clientIntelStatement.findMany({
      where: { tenantId: st.tenantId }, select: { id: true }, orderBy: { id: 'asc' },
    }));
    const addrAfter = await L.safeCount(() => prisma.clientAddress.findMany({
      where: { clientId: cid }, select: { id: true }, orderBy: { id: 'asc' },
    }));
    const sub = await prisma.clientIntakeSubmission.findFirst({
      where: { tenantId: st.tenantId }, orderBy: { createdAt: 'desc' }, select: { id: true },
    }).catch(() => null);
    submissionId = sub && sub.id;

    const errs = [intelBefore, addrBefore, intelAfter, addrAfter].find((c) => c.error);
    if (rSubmit.indeterminate) {
      R.unmeasured('H5-04', 'public uc toplar, KANONIK kayda dokunmaz', rSubmit.indeterminateReason);
    } else if (errs) {
      R.unmeasured('H5-04', 'public uc toplar, KANONIK kayda dokunmaz',
        `kanonik kayit sorgusu DUSTU: ${errs.error}`);
    } else {
      const sameIntel = JSON.stringify(intelBefore.value) === JSON.stringify(intelAfter.value);
      const sameAddr = JSON.stringify(addrBefore.value) === JSON.stringify(addrAfter.value);
      R.check('H5-04', 'public gonderim kaydedilir; ClientIntelStatement ve ClientAddress KIMLIK duzeyinde DEGISMEZ',
        rSubmit.status < 400 && !!submissionId && sameIntel && sameAddr,
        `HTTP ${rSubmit.status} · submission olustu=${!!submissionId}`
        + ` · intel kimlikleri AYNI=${sameIntel} (${intelBefore.value.length}→${intelAfter.value.length})`
        + ` · adres kimlikleri AYNI=${sameAddr} (${addrBefore.value.length}→${addrAfter.value.length})`);
    }
  }

  if (!submissionId) {
    for (const id of ['H5-05', 'H5-05b', 'H5-06']) {
      R.unmeasured(id, 'intake inceleme/aktarim', 'submission kurulamadi');
    }
    return;
  }

  // ══ H5-05 · İnceleme: AYRI ve BAĞIMSIZ `client.intake.review` yetkisi ══
  // NEGATİF AKTÖRLERİN HEPSİNİN GEÇERLİ PROFİLİ VARDIR (StaffMember veya Lawyer) — bu yüzden
  // 403'leri `PROFILE_INVALID`ten değil GRANT/coarse reddinden gelir.
  const claim = (tag) => L.AH.httpJson('POST', `${base}/client-intake-submissions/${submissionId}/claim`, {
    token: tokens[tag], body: {},
  });
  {
    const rViewer = await claim('viewer');   // VIEWER coarse red
    const rUser = await claim('user');       // profil VAR, grant YOK
    const rAdmin = await claim('admin');     // profil VAR, ADMIN rolu, grant YOK
    const rElev = await claim('elev1');      // Lawyer profili VAR, grant YOK
    const rReviewer = await claim('reviewer'); // profil VAR + grant VAR

    const fields = await L.safeCount(() => prisma.clientIntakeField.findMany({
      where: { submissionId }, select: { id: true, reviewStatus: true }, orderBy: { id: 'asc' },
    }));
    fieldId = !fields.error && fields.value[0] ? fields.value[0].id : null;

    let rReview = null;
    if (fieldId) {
      rReview = await L.AH.httpJson('POST', `${base}/client-intake-fields/${fieldId}/review`, {
        token: tokens.reviewer, body: { decision: 'APPROVE', note: 'I3' },
      });
    }
    const after = fieldId ? await prisma.clientIntakeField.findUnique({
      where: { id: fieldId }, select: { reviewStatus: true, promotedRefId: true },
    }).catch(() => null) : null;
    const intel = await cntIntel();

    const codeOf = (r) => (r.body && (r.body.code || r.body.reasonCode
      || (r.body.message && r.body.message.code))) || null;

    if (!fieldId) {
      R.unmeasured('H5-05', 'inceleme AYRI client.intake.review yetkisi ister',
        fields.error ? `alan sorgusu DUSTU: ${fields.error}` : 'submission alani bulunamadi');
    } else if (anyIndet(rViewer, rUser, rAdmin, rElev, rReviewer, rReview)) {
      R.unmeasured('H5-05', 'inceleme AYRI client.intake.review yetkisi ister', 'uclardan biri BELIRSIZ');
    } else if (!after) {
      R.unmeasured('H5-05', 'inceleme AYRI client.intake.review yetkisi ister', 'alan durumu okunamadi');
    } else {
      // Reddedilenlerin hiçbiri PROFILE_INVALID olmamalı — hepsinin profili GEÇERLİ.
      const denials = [rUser, rAdmin, rElev];
      const profileNoise = denials.some((r) => String(codeOf(r) || '').includes('PROFILE_INVALID'));
      R.check('H5-05', 'inceleme: GECERLI profilli USER/ADMIN/PARTNER RED (grant yok), yalniz GRANT izin verir',
        isDenied(rViewer) && isDenied(rUser) && isDenied(rAdmin) && isDenied(rElev)
        && !profileNoise
        && rReviewer.status < 400 && rReview.status < 400
        && after.reviewStatus === 'APPROVED' && after.promotedRefId === null,
        `VIEWER→${rViewer.status}/${codeOf(rViewer)} · USER→${rUser.status}/${codeOf(rUser)}`
        + ` · ADMIN→${rAdmin.status}/${codeOf(rAdmin)} · PARTNER→${rElev.status}/${codeOf(rElev)}`
        + ` · reviewer(grant)→${rReviewer.status} · review→${rReview.status}`
        + ` · PROFILE_INVALID gurultusu=${profileNoise ? 'VAR(!)' : 'YOK'}`
        + ` · alan=${after.reviewStatus} · promotedRefId=${after.promotedRefId}`
        + ` · intel=${intel.error ? 'OKUNAMADI' : intel.value}`);
    }
  }

  // ══ H5-05b · Ret nedenleri DIŞARI SIZMAZ — ve bu, ölçüm disiplinini ZORUNLU kılar ══
  // İLK VARSAYIMIM YANLIŞTI: "profil reddi ile grant reddi FARKLI kod taşır" beklemiştim.
  // Ürün ikisini de tek koda düşürüyor (`CLIENT_MUTATION_DENIED_INTAKE_REVIEW`) — iç ret
  // nedenini (PROFILE_INVALID / PERMISSION_REQUIRED) dışarı SIZDIRMIYOR. Bu DOĞRU güvenlik
  // davranışıdır ve beklenti buna göre düzeltildi (kod geçsin diye gevşetilmedi; ölçülen
  // gerçek, iddia edilenden DAHA SIKI çıktı).
  //
  // SONUÇ — ölçüm için bağlayıcı: kodlar ayırt edilemediğinden, profilsiz bir aktörün 403'ü
  // GRANT REDDİNİN KANITI OLARAK KULLANILAMAZ. Bu yüzden H5-05'teki negatif aktörlerin
  // hepsinin GEÇERLİ PROFİLİ vardır; bu ölçüt o zorunluluğun gerekçesini kanıtlar.
  {
    const rNoProfile = await claim('noprofile');
    const rUserAgain = await claim('user');
    const codeOf = (r) => (r.body && (r.body.code || r.body.reasonCode)) || null;
    if (anyIndet(rNoProfile, rUserAgain)) {
      R.unmeasured('H5-05b', 'ret nedenleri disari sizmaz', 'uclardan biri BELIRSIZ');
    } else {
      const cNo = String(codeOf(rNoProfile) || '');
      const cGrant = String(codeOf(rUserAgain) || '');
      R.check('H5-05b', 'profilsiz ve grantsiz retler AYNI kodu tasir (ic ret nedeni SIZMAZ) → profilsiz 403 grant kaniti SAYILAMAZ',
        isDenied(rNoProfile) && isDenied(rUserAgain) && cNo === cGrant && cNo.length > 0,
        `profilsiz→${rNoProfile.status}/${cNo || '(kod yok)'}`
        + ` · profilli-grantsiz→${rUserAgain.status}/${cGrant || '(kod yok)'}`
        + ` · kodlar AYNI=${cNo === cGrant} (ayrim sizmiyor)`);
    }
  }

  // ══ H5-06 · Aktarım: YALNIZ `isApproverEligible`; TEKRAR isteğinin sonucu da ölçülür ══
  if (!fieldId) {
    R.unmeasured('H5-06', 'aktarim yalniz isApproverEligible', 'onaylanmis alan yok');
  } else {
    const promoteBody = { debtorId: st.debtorId, street: 'I3 aktarilan sentetik adres', city: 'Ankara' };
    const promote = (tag) => L.AH.httpJson('POST', `${base}/client-intake-fields/${fieldId}/promote-address`, {
      token: tokens[tag], body: promoteBody,
    });

    const capBefore = await L.safeCapture(prisma, cid);
    const intelBefore = await L.safeCount(() => prisma.clientIntelStatement.count({ where: { tenantId: st.tenantId } }));

    const rReviewer = await promote('reviewer'); // inceleyen aktör → RED (CR-1 md.6)
    const rAdmin = await promote('admin');       // rol tek başına yetmez
    const capMid = await L.safeCapture(prisma, cid);
    const intelMid = await L.safeCount(() => prisma.clientIntelStatement.count({ where: { tenantId: st.tenantId } }));

    const rAllow = await promote('elev1');       // PARTNER → İZİN
    const fieldAfter = await prisma.clientIntakeField.findUnique({
      where: { id: fieldId }, select: { promotedRefId: true },
    }).catch(() => null);

    // TEKRAR: sonucu da kontrol edilir (yalnız loglanmaz)
    const rAgain = await promote('elev1');
    const fieldFinal = await prisma.clientIntakeField.findUnique({
      where: { id: fieldId }, select: { promotedRefId: true },
    }).catch(() => null);

    const denyClean = L.unchanged(capBefore.state, capMid.state);

    if (anyIndet(rReviewer, rAdmin, rAllow, rAgain)) {
      R.unmeasured('H5-06', 'aktarim yalniz isApproverEligible', 'uclardan biri BELIRSIZ');
    } else if (capBefore.error || capMid.error || intelBefore.error || intelMid.error) {
      R.unmeasured('H5-06', 'aktarim yalniz isApproverEligible',
        `kalici durum sorgusu DUSTU: ${capBefore.error || capMid.error || intelBefore.error || intelMid.error}`);
    } else if (!fieldAfter || !fieldFinal) {
      R.unmeasured('H5-06', 'aktarim yalniz isApproverEligible', 'alan satiri okunamadi');
    } else if (denyClean.unmeasured) {
      R.unmeasured('H5-06', 'aktarim yalniz isApproverEligible', 'kalici durum fotografi alinamadi');
    } else {
      R.check('H5-06', 'aktarim: INCELEYEN ve ADMIN RED (CR-1 md.6), PARTNER IZIN, TEKRAR yeni yazma URETMEZ',
        isDenied(rReviewer) && isDenied(rAdmin) && denyClean.ok
        && intelMid.value === intelBefore.value
        && rAllow.status < 400 && !!fieldAfter.promotedRefId
        && rAgain.status >= 400
        && fieldFinal.promotedRefId === fieldAfter.promotedRefId,
        `reviewer(grant VAR)→${rReviewer.status} · ADMIN→${rAdmin.status}`
        + ` (kanonik etki=${denyClean.ok ? 'YOK' : denyClean.changes.join(',')},`
        + ` intel ${intelBefore.value}→${intelMid.value})`
        + ` · PARTNER→${rAllow.status} promotedRefId dolu=${!!fieldAfter.promotedRefId}`
        + ` · TEKRAR→${rAgain.status} (>=400 beklenir) · ref DEGISMEDI=`
        + `${fieldFinal.promotedRefId === fieldAfter.promotedRefId}`);
    }
  }
};
