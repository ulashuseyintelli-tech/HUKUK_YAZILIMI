/*
 * İ3 DÜZENEK — H5: BİLGİ/BELGE TOPLAMA (İ2 ölçütleri H5-01…H5-06)
 *
 * H5-01 = A-9 + A-10 (sağlayıcı reddi → 503 + kayıt yok · belirsiz → INDETERMINATE + tekrar yok).
 * H5-02 = A-5 + A-6 (ham token kalıcı gövdede taşınmaz).
 * Aynı davranış İ12'de TEKRAR SAYILMAZ (İ2 §6 çift sayım uyarısı).
 *
 * YOL B İZOLASYONU: bu ölçütler `EmailProviderService` üzerinden gider ve sağlayıcı ayarı
 * SÜREÇ-GENEL ENV'den gelir (`EMAIL_PROVIDER`, `SMTP_HOST/PORT`). İ1a'nın tenant `Office`
 * provası bu yola GEÇERLİ DEĞİLDİR. Koşum, API'yi `EMAIL_PROVIDER=smtp` + loopback yakalama
 * ile başlatılmış olarak varsayar; `mock` sağlayıcı gerçek taşıma hatası kanıtı YERİNE GEÇMEZ.
 */
'use strict';
const L = require('./i3-lib');

module.exports = async function runH5(ctx) {
  const { base, prisma, tokens, st, R, sink } = ctx;
  const cid = st.clientId;
  L.AH.step('H5', 'bilgi/belge toplama — 6 olcut');

  const infoRequests = () => prisma.clientInfoRequest.count({ where: { tenantId: st.tenantId } });
  const notifications = () => prisma.clientNotification.count({ where: { tenantId: st.tenantId } });

  const postInfoRequest = (subject) => L.AH.httpJson('POST', `${base}/address-discovery/client-info-request`, {
    token: tokens.elev1,
    body: {
      caseId: st.caseId, clientId: cid,
      emailTo: `alici-${st.runId}@ah-harness.invalid`,
      emailSubject: subject,
      emailBody: 'I3 sentetik bilgi talebi govdesi.',
    },
    timeoutMs: 25000,
  });

  // ══ H5-01 · Üç sonuç ayrı: ACCEPTED / REJECTED / INDETERMINATE ══
  if (!sink || !sink.available) {
    R.unmeasured('H5-01', 'bilgi talebi ucu sonuc (A-9/A-10)',
      'Yol B izolasyonu kurulmadi (EMAIL_PROVIDER=smtp + loopback yakalama gerekir); '
      + 'mock saglayici gercek tasima hatasi kaniti YERINE GECMEZ');
  } else {
    // (a) ACCEPTED — sink kabul eder → kayıt YAZILIR
    await sink.setMode('');
    const reqBefore = await infoRequests();
    const rOk = await postInfoRequest(`I3-ACCEPT-${st.runId}`);
    const reqAfterOk = await infoRequests();

    // (b) REJECTED — sink 550 ile doğrulanabilir ret → kayıt YAZILMAZ, 503 + _EMAIL_FAILED
    await sink.setMode('reject');
    const capBefore = sink.count();
    const rRej = await postInfoRequest(`I3-REJECT-${st.runId}`);
    const reqAfterRej = await infoRequests();
    const notifAfterRej = await notifications();

    // (c) INDETERMINATE — sink DATA'da bağlantıyı koparır → ECONNRESET.
    // `ECONNRESET` üründe TRANSPORT_NEVER_SENT kümesinde DEĞİLDİR (veri gönderilmiş olabilir),
    // bu yüzden `classifyTransportError` onu INDETERMINATE sayar.
    await sink.setMode('reset');
    const convBeforeInd = sink.conversations();
    const notifBefore = await notifications();
    const rInd = await postInfoRequest(`I3-INDET-${st.runId}`);
    const reqAfterInd = await infoRequests();
    const notifAfterInd = await notifications();
    await sink.setMode('');

    const code = (r) => (r.body && (r.body.reasonCode || (r.body.message && r.body.message.reasonCode))) || null;

    if (rOk.indeterminate || rRej.indeterminate || rInd.indeterminate) {
      R.unmeasured('H5-01', 'bilgi talebi ucu uc sonuc (A-9/A-10)',
        'HTTP katmani BELIRSIZ — sunucu sonucu ayirt edilemedi');
    } else {
      const acceptedOk = rOk.status < 400 && reqAfterOk === reqBefore + 1;
      const rejectedOk = rRej.status === 503 && code(rRej) === 'CLIENT_INFO_REQUEST_EMAIL_FAILED'
        && reqAfterRej === reqAfterOk;
      const indetOk = rInd.status === 503 && code(rInd) === 'CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE'
        && reqAfterInd === reqAfterRej && notifAfterInd === notifBefore;
      R.check('H5-01', 'uc sonuc AYRI: kabul→kayit · dogrulanabilir ret→503+kayit YOK · belirsiz→503+kayit YOK',
        acceptedOk && rejectedOk && indetOk,
        `ACCEPTED HTTP ${rOk.status} kayit ${reqBefore}→${reqAfterOk}`
        + ` | REJECTED HTTP ${rRej.status}/${code(rRej)} kayit ${reqAfterOk}→${reqAfterRej}`
        + ` | INDETERMINATE HTTP ${rInd.status}/${code(rInd)} kayit ${reqAfterRej}→${reqAfterInd}`
        + ` bildirim ${notifBefore}→${notifAfterInd} · yakalanan (ret modunda) ${capBefore}→${sink.count()}`);
    }

    // Belirsiz sonuçta OTOMATİK TEKRAR GÖNDERİM olmadığını ölç. Sabit bir üst sınır
    // varsayılmaz (bir gönderim kaç TCP konuşması açar, taşıma katmanının işidir); ölçülen şey
    // BELİRSİZ POST'un ÇEVRESİNDEKİ FARK'tır: ürün kör tekrar yapsaydı fark ikiye çıkardı.
    const convDelta = sink.conversations() - convBeforeInd;
    R.check('H5-01b', 'belirsiz sonucta OTOMATIK TEKRAR GONDERIM yapilmaz',
      convDelta === 1,
      `belirsiz POST cevresinde saglayici konusma farki=${convDelta} (tek deneme beklenir;`
      + ` kor tekrar olsaydi >=2 olurdu) · toplam konusma=${sink.conversations()}`);
  }

  // ══ H5-02 · Ham token yalnız oluşturma yanıtında (A-5/A-6) ══
  let linkId = null; let rawToken = null;
  {
    const r = await L.AH.httpJson('POST', `${base}/client-intake-links/case/${st.caseId}`, {
      // CreateClientIntakeLinkDto: clientId + scope[] ZORUNLU (enum ClientIntakeFieldCategory).
      token: tokens.elev1, body: { clientId: cid, scope: ['ADDRESS'] },
    });
    if (r.indeterminate) {
      R.unmeasured('H5-02', 'ham token kalici govdede tasinmaz (A-5/A-6)', r.indeterminateReason);
    } else {
      const b = r.body || {};
      const d = b.data || b;
      linkId = d.id || (d.link && d.link.id) || null;
      rawToken = d.rawToken || d.token || (d.link && d.link.rawToken) || null;

      let readLeak = null;
      if (linkId) {
        const rRead = await L.AH.httpJson('GET', `${base}/client-intake-links/${linkId}`, { token: tokens.elev1 });
        readLeak = !rRead.indeterminate && rawToken
          ? JSON.stringify(rRead.body || {}).includes(rawToken) : null;
      }
      // Kalıcı gövde taraması: bildirim/talep kayıtlarında ham token var mı?
      let persistedLeak = null;
      if (rawToken) {
        const [notif, infoReq] = await Promise.all([
          prisma.clientNotification.findMany({ where: { tenantId: st.tenantId }, select: { body: true, subject: true } }),
          prisma.clientInfoRequest.findMany({ where: { tenantId: st.tenantId } }),
        ]);
        const blob = JSON.stringify(notif) + JSON.stringify(infoReq);
        persistedLeak = blob.includes(rawToken);
      }
      R.check('H5-02', 'ham token YALNIZ olusturma yanitinda; okuma ucunda ve KALICI govdede YOK',
        r.status === 201 && !!rawToken && readLeak === false && persistedLeak === false,
        `HTTP ${r.status} · olusturma yanitinda token=${!!rawToken}`
        + ` · okuma ucunda sizinti=${readLeak === null ? 'OLCULEMEDI' : readLeak}`
        + ` · kalici govdede sizinti=${persistedLeak === null ? 'OLCULEMEDI' : persistedLeak}`);
    }
  }

  // ══ H5-03 · Bağlantı iptali sonraki kullanımı kapatır ══
  if (!linkId || !rawToken) {
    R.unmeasured('H5-03', 'baglanti iptali kullanimi kapatir', 'baglanti veya ham token alinamadi');
  } else {
    const rBefore = await L.AH.httpJson('GET', `${base}/public/intake/${rawToken}`);
    const rRevoke = await L.AH.httpJson('POST', `${base}/client-intake-links/${linkId}/revoke`, {
      token: tokens.elev1, body: {},
    });
    const rAfter = await L.AH.httpJson('GET', `${base}/public/intake/${rawToken}`);
    const rSubmit = await L.AH.httpJson('POST', `${base}/public/intake/${rawToken}`, {
      // SubmitIntakeDto: fields[].category ZORUNLU (enum ClientIntakeFieldCategory) + value
      body: { fields: [{ category: 'ADDRESS', value: 'iptal sonrasi deneme' }] },
    });
    const subs = await prisma.clientIntakeSubmission.count({ where: { tenantId: st.tenantId } }).catch(() => null);

    if (rBefore.indeterminate || rRevoke.indeterminate || rAfter.indeterminate) {
      R.unmeasured('H5-03', 'baglanti iptali kullanimi kapatir', 'uclardan biri BELIRSIZ');
    } else {
      R.check('H5-03', 'iptal ONCESI acik, SONRASI kapali; iptalli baglantidan kalici kayit OLUSMAZ',
        rBefore.status < 400 && rRevoke.status < 400 && rAfter.status >= 400
        && (rSubmit.indeterminate || rSubmit.status >= 400),
        `iptal oncesi GET→${rBefore.status} · revoke→${rRevoke.status} · sonrasi GET→${rAfter.status}`
        + ` · sonrasi POST→${rSubmit.indeterminate ? 'BELIRSIZ' : rSubmit.status}`
        + ` · submission sayisi=${subs === null ? 'OLCULEMEDI' : subs}`);
    }
  }

  // ══ H5-04/05/06 · Public toplar → inceleme → aktarım ══
  // Yeni bir bağlantı üretilir (öncekini iptal ettik) ve gerçek bir submission kurulur.
  let submissionId = null; let fieldId = null;
  {
    const rLink = await L.AH.httpJson('POST', `${base}/client-intake-links/case/${st.caseId}`, {
      token: tokens.elev1, body: { clientId: cid, scope: ['ADDRESS'] },
    });
    const d = (rLink.body && (rLink.body.data || rLink.body)) || {};
    const tok = d.rawToken || d.token || (d.link && d.link.rawToken) || null;

    if (!tok) {
      for (const id of ['H5-04', 'H5-05', 'H5-06']) {
        R.unmeasured(id, 'intake inceleme/aktarim', 'ikinci baglanti veya ham token alinamadi');
      }
      return;
    }

    const intelBefore = await prisma.clientIntelStatement.count({ where: { tenantId: st.tenantId } }).catch(() => null);
    const addrBefore = await prisma.clientAddress.count({ where: { clientId: cid } });
    const rSubmit = await L.AH.httpJson('POST', `${base}/public/intake/${tok}`, {
      body: { fields: [{ category: 'ADDRESS', value: 'I3 sentetik adres beyani' }] },
    });
    const intelAfter = await prisma.clientIntelStatement.count({ where: { tenantId: st.tenantId } }).catch(() => null);
    const addrAfter = await prisma.clientAddress.count({ where: { clientId: cid } });

    const sub = await prisma.clientIntakeSubmission.findFirst({
      where: { tenantId: st.tenantId }, orderBy: { createdAt: 'desc' }, select: { id: true },
    }).catch(() => null);
    submissionId = sub && sub.id;

    if (rSubmit.indeterminate) {
      R.unmeasured('H5-04', 'public uc toplar, ana kayda AKTARMAZ', rSubmit.indeterminateReason);
    } else {
      R.check('H5-04', 'public gonderim kaydedilir ama KANONIK kayda (adres/intel) DOKUNMAZ',
        rSubmit.status < 400 && !!submissionId
        && intelBefore === intelAfter && addrBefore === addrAfter,
        `HTTP ${rSubmit.status} · submission olustu=${!!submissionId}`
        + ` · ClientIntelStatement ${intelBefore}→${intelAfter}`
        + ` · adres ${addrBefore}→${addrAfter} (ikisi de DEGISMEMELI)`);
    }
  }

  if (!submissionId) {
    R.unmeasured('H5-05', 'inceleme ek esik istemez', 'submission kurulamadi');
    R.unmeasured('H5-06', 'aktarim elevated ister', 'submission kurulamadi');
    return;
  }

  // ══ H5-05 · İnceleme: AYRI ve BAĞIMSIZ `client.intake.review` yetkisi ══
  // İ3 ÖLÇÜMÜNÜN DÜZELTTİĞİ İKİ HATA:
  //   (1) "serviste isApproverEligible yok -> eşik yok"  — YANLIŞ; kapı controller'dadır.
  //   (2) "eşik ADMIN VEYA elevated"                     — YANLIŞ; o, WORKSPACE komutlarının eşiği.
  // Gerçek sözleşme CR-1 (owner RATIFIED 2026-08-03, client-mutation-policy.ts:432-441):
  // yükseltme sinyali `reviewAuthority`dir, `isApproverEligible`dan BAĞIMSIZDIR ve
  // ROL (ADMIN DAHİL) TEK BAŞINA YETKİ VERMEZ. Kaynağı canonical PermissionGrant:
  // exact GLOBAL `client.intake.review` ALLOW (geçerli DENY her zaman öncelikli).
  {
    const rViewer = await L.AH.httpJson('POST', `${base}/client-intake-submissions/${submissionId}/claim`, {
      token: tokens.viewer, body: {},
    });
    const rUser = await L.AH.httpJson('POST', `${base}/client-intake-submissions/${submissionId}/claim`, {
      token: tokens.user, body: {},
    });
    // ADMIN rolü: grant YOKSA reddedilmeli (CR-1 — rol tek başına yetki vermez).
    const rAdmin = await L.AH.httpJson('POST', `${base}/client-intake-submissions/${submissionId}/claim`, {
      token: tokens.admin, body: {},
    });
    // elevated (PARTNER bağı): promotion eşiğini taşır ama REVIEW grant YOK -> reddedilmeli.
    const rElev = await L.AH.httpJson('POST', `${base}/client-intake-submissions/${submissionId}/claim`, {
      token: tokens.elev1, body: {},
    });
    // reviewer: grant VAR, PARTNER bağı YOK -> İZİN.
    const rReviewer = await L.AH.httpJson('POST', `${base}/client-intake-submissions/${submissionId}/claim`, {
      token: tokens.reviewer, body: {},
    });

    const fields = await prisma.clientIntakeField.findMany({
      where: { submissionId }, select: { id: true, reviewStatus: true },
    }).catch(() => []);
    fieldId = fields[0] && fields[0].id;

    let rReview = null;
    if (fieldId) {
      rReview = await L.AH.httpJson('POST', `${base}/client-intake-fields/${fieldId}/review`, {
        token: tokens.reviewer, body: { decision: 'APPROVE', note: 'I3' },
      });
    }
    const after = fieldId ? await prisma.clientIntakeField.findUnique({
      where: { id: fieldId }, select: { reviewStatus: true, promotedRefId: true },
    }) : null;
    const intel = await prisma.clientIntelStatement.count({ where: { tenantId: st.tenantId } }).catch(() => null);

    if (!fieldId) {
      R.unmeasured('H5-05', 'inceleme AYRI client.intake.review yetkisi ister', 'submission alani bulunamadi');
    } else if ([rViewer, rUser, rAdmin, rElev, rReviewer].some((r) => r.indeterminate)) {
      R.unmeasured('H5-05', 'inceleme AYRI client.intake.review yetkisi ister', 'claim uclarindan biri BELIRSIZ');
    } else {
      R.check('H5-05', 'inceleme: ROL (ADMIN DAHIL) ve PARTNER bagi YETMEZ; yalniz GRANT izin verir',
        rViewer.status === 403 && rUser.status === 403 && rAdmin.status === 403 && rElev.status === 403
        && rReviewer.status < 400 && rReview.status < 400
        && after.reviewStatus === 'APPROVED' && after.promotedRefId === null,
        `VIEWER→${rViewer.status} · USER→${rUser.status} · ADMIN→${rAdmin.status}`
        + ` · elevated(PARTNER)→${rElev.status} · reviewer(grant)→${rReviewer.status}`
        + ` · review→${rReview.status} · alan=${after.reviewStatus}`
        + ` · promotedRefId=${after.promotedRefId} · intel=${intel} (aktarim YAPILMADI)`);
    }
  }

  // ══ H5-06 · Aktarım: YALNIZ `isApproverEligible` — ADMIN rolü YETMEZ ══
  // Bu, "review ≠ promote" ayrımının GERÇEK kanıtıdır: aynı ADMIN aktörü incelemeyi yapabilir
  // ama aktarımı YAPAMAZ (`assertCanManagePromotion` ADMIN yolunu TANIMAZ).
  if (!fieldId) {
    R.unmeasured('H5-06', 'aktarim yalniz isApproverEligible', 'onaylanmis alan yok');
  } else {
    const promoteBody = {
      debtorId: st.debtorId,
      street: 'I3 aktarilan sentetik adres',
      city: 'Ankara',
    };
    const before = await L.captureState(prisma, cid);
    const intelBefore = await prisma.clientIntelStatement.count({ where: { tenantId: st.tenantId } }).catch(() => null);

    // (a) reviewer — İNCELEMEYİ yapan aktör; aktarım yetkisi AYRIDIR -> RED (CR-1 md.6)
    const rReviewer = await L.AH.httpJson('POST', `${base}/client-intake-fields/${fieldId}/promote-address`, {
      token: tokens.reviewer, body: promoteBody,
    });
    // (a2) ADMIN — rol tek başına aktarım yetkisi vermez
    const rAdmin = await L.AH.httpJson('POST', `${base}/client-intake-fields/${fieldId}/promote-address`, {
      token: tokens.admin, body: promoteBody,
    });
    const midState = await L.captureState(prisma, cid);
    const intelMid = await prisma.clientIntelStatement.count({ where: { tenantId: st.tenantId } }).catch(() => null);
    const adminClean = L.unchanged(before, midState);

    // (b) elevated (PARTNER bağı) — İZİN
    const rAllow = await L.AH.httpJson('POST', `${base}/client-intake-fields/${fieldId}/promote-address`, {
      token: tokens.elev1, body: promoteBody,
    });
    const field = await prisma.clientIntakeField.findUnique({
      where: { id: fieldId }, select: { promotedRefId: true },
    });
    // (c) idempotency
    const rAgain = await L.AH.httpJson('POST', `${base}/client-intake-fields/${fieldId}/promote-address`, {
      token: tokens.elev1, body: promoteBody,
    });
    const fieldAfter = await prisma.clientIntakeField.findUnique({
      where: { id: fieldId }, select: { promotedRefId: true },
    });

    if ([rReviewer, rAdmin, rAllow].some((r) => r.indeterminate)) {
      R.unmeasured('H5-06', 'aktarim yalniz isApproverEligible', 'uclardan biri BELIRSIZ');
    } else {
      R.check('H5-06', 'aktarim: INCELEYEN aktor ve ADMIN YETMEZ (CR-1 md.6 iki yetki AYRI), elevated IZIN, IDEMPOTENT',
        rReviewer.status === 403 && rAdmin.status === 403 && adminClean.ok && intelMid === intelBefore
        && rAllow.status < 400 && !!field.promotedRefId
        && fieldAfter.promotedRefId === field.promotedRefId,
        `reviewer(inceleme granti VAR)→${rReviewer.status} · ADMIN→${rAdmin.status}`
        + ` (kanonik etki=${adminClean.ok ? 'YOK' : adminClean.changes.join(',')}, intel ${intelBefore}→${intelMid})`
        + ` · elevated(PARTNER)→${rAllow.status} · promotedRefId dolu=${!!field.promotedRefId}`
        + ` · tekrar→${rAgain.indeterminate ? 'BELIRSIZ' : rAgain.status}`
        + ` · ref DEGISMEDI=${fieldAfter.promotedRefId === field.promotedRefId}`);
    }
  }
};
