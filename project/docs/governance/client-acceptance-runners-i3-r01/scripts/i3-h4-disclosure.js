/*
 * İ3 DÜZENEK — H4-06 / H4-07 / H4-08 (FİNANSAL BEYAN ONAY ZİNCİRİ)
 *
 * Bu üç ölçüt bir `ClientFinancialDisclosureVersion` ister. Sürüm yalnız ürünün kendi
 * yolundan doğar:
 *   Collection → CollectionDisposition → **POSTED** → `createFromDisposition`
 *   (`client-settlement/client-financial-disclosure-command.service.ts:68`,
 *    uç: `POST /client-financial-disclosures/office/clients/:clientId/
 *         preparation-sources/:preparationReference/financial-disclosure`)
 * Ayrıca aktivasyon bayrağı ve aktör yetkisi kapıları vardır.
 *
 * BU MODÜL ÖN KOŞULU **UYDURMAZ**. Prisma ile elle `snapshotHash`/`sourceFingerprint` yazmak,
 * ürünün doğruladığı değerleri taklit etmek olurdu; uyuşmayan bir hash `STALE_SNAPSHOT`
 * ürettiğinde bu, ürün kusuru gibi görünüp YANLIŞ BULGU üretirdi. Bu yüzden:
 *   - ön koşul GERÇEKTEN varsa → üç ölçüt koşulur,
 *   - yoksa → **UNMEASURED** ve EKSİK OLAN SOMUT ÖN KOŞUL raporlanır (PASS YAPILMAZ).
 */
'use strict';
const L = require('./i3-lib');

module.exports = async function runH4Disclosure(ctx) {
  const { base, prisma, tokens, st, R } = ctx;
  L.AH.step('H4-FD', 'finansal beyan onay zinciri — on kosul denetimi');

  // ── Ön koşul denetimi: POSTED disposition + kullanılabilir sürüm ──
  const postedCount = await prisma.collectionDisposition
    .count({ where: { tenantId: st.tenantId, status: 'POSTED' } })
    .catch(() => null);
  const versionCount = await prisma.clientFinancialDisclosureVersion
    .count({ where: { tenantId: st.tenantId } })
    .catch(() => null);

  const missing = [];
  if (postedCount === null) missing.push('CollectionDisposition okunamadi');
  else if (postedCount === 0) missing.push('POSTED durumda CollectionDisposition YOK');
  if (versionCount === 0) missing.push('ClientFinancialDisclosureVersion YOK');

  if (missing.length > 0) {
    const why = `on kosul kurulamadi — ${missing.join(' · ')}. `
      + 'Surum yalnız Collection→Disposition→POSTED→createFromDisposition zincirinden dogar; '
      + 'bu tur o finansal posting zinciri KURULMADI. Prisma ile elle snapshotHash/'
      + 'sourceFingerprint yazmak urunun dogruladigi degeri TAKLIT etmek olurdu ve yanlis '
      + 'STALE_SNAPSHOT bulgusu uretirdi.';
    R.unmeasured('H4-06', 'buro onayi: talep eden onaylayamaz + onaylayan eligible', why);
    R.unmeasured('H4-07', 'icerik onayi: four-eyes — UC AYRI KISI + STALE_SNAPSHOT', why);
    R.unmeasured('H4-08', 'yayin yalniz ONAYLI saglayiciya cikar', why);
    console.log('      → uc olcut UNMEASURED; eksik somut on kosul yukarida kayitli');
    return;
  }

  // ── Ön koşul VARSA: üç ölçüt gerçek uçlar üzerinden koşulur ──
  const version = await prisma.clientFinancialDisclosureVersion.findFirst({
    where: { tenantId: st.tenantId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, officeApprovedById: true, snapshotHash: true },
  });
  const vid = version.id;
  const url = (suffix) => `${base}/client-financial-disclosures/${vid}/${suffix}`;

  // H4-06 · talep eden kendi onaylayamaz + onaylayan eligible olmalı
  {
    const rReq = await L.AH.httpJson('POST', url('request-office-approval'), {
      token: tokens.elev1, body: {},
    });
    const before = await prisma.clientFinancialDisclosureVersion.findUnique({
      where: { id: vid }, select: { status: true, officeApprovedById: true },
    });
    // (a) talep eden kendisi tamamlamayı dener → SELF_APPROVAL
    const rSelf = await L.AH.httpJson('POST', url('complete-office-approval'), {
      token: tokens.elev1, body: {},
    });
    const mid = await prisma.clientFinancialDisclosureVersion.findUnique({
      where: { id: vid }, select: { status: true, officeApprovedById: true },
    });
    // (b) eligible OLMAYAN aktör dener → yetki reddi
    const rNotElig = await L.AH.httpJson('POST', url('complete-office-approval'), {
      token: tokens.user, body: {},
    });
    // (c) farklı ve eligible aktör → onay
    const rOk = await L.AH.httpJson('POST', url('complete-office-approval'), {
      token: tokens.elev2, body: {},
    });
    const after = await prisma.clientFinancialDisclosureVersion.findUnique({
      where: { id: vid }, select: { status: true, officeApprovedById: true },
    });

    if (rReq.indeterminate || rSelf.indeterminate || rOk.indeterminate) {
      R.unmeasured('H4-06', 'buro onayi self-approval + eligibility', 'uclardan biri BELIRSIZ');
    } else {
      const selfBlocked = rSelf.status >= 400
        && JSON.stringify(before) === JSON.stringify(mid);
      R.check('H4-06', 'buro onayi: talep eden RED (durum degismez), eligible olmayan RED, ucuncu kisi ONAYLAR',
        selfBlocked && rNotElig.status >= 400 && rOk.status < 400
        && after.officeApprovedById === st.actors.elev2.id,
        `request→${rReq.status} · SELF→${rSelf.status} (durum degismedi=${JSON.stringify(before) === JSON.stringify(mid)})`
        + ` · eligible-degil→${rNotElig.status} · farkli+eligible→${rOk.status}`
        + ` · officeApprovedById=elev2 mi=${after.officeApprovedById === st.actors.elev2.id}`);
    }
  }

  // H4-07 · içerik onayı: four-eyes (ofis onaylayıcısı olamaz) + requester olamaz
  {
    const rReq = await L.AH.httpJson('POST', url('request-content-approval'), {
      token: tokens.elev1, body: {},
    });
    const before = await prisma.clientFinancialDisclosureVersion.findUnique({
      where: { id: vid }, select: { status: true, contentApprovedById: true },
    });
    const rOffice = await L.AH.httpJson('POST', url('complete-content-approval'), {
      token: tokens.elev2, body: {}, // ofis onaylayıcısı → FOUR_EYES_VIOLATION
    });
    const rRequester = await L.AH.httpJson('POST', url('complete-content-approval'), {
      token: tokens.elev1, body: {}, // talep eden → SELF_APPROVAL
    });
    const mid = await prisma.clientFinancialDisclosureVersion.findUnique({
      where: { id: vid }, select: { status: true, contentApprovedById: true },
    });
    const rThird = await L.AH.httpJson('POST', url('complete-content-approval'), {
      token: tokens.elev3, body: {}, // üçüncü kişi → onay
    });
    const after = await prisma.clientFinancialDisclosureVersion.findUnique({
      where: { id: vid }, select: { status: true, contentApprovedById: true },
    });
    const code = (r) => (r.body && (r.body.code || r.body.reasonCode
      || (r.body.message && r.body.message.code))) || null;

    if (rReq.indeterminate || rOffice.indeterminate || rThird.indeterminate) {
      R.unmeasured('H4-07', 'icerik onayi four-eyes', 'uclardan biri BELIRSIZ');
    } else {
      R.check('H4-07', 'icerik onayi UC AYRI KISI ister: ofis onaylayicisi RED, talep eden RED, ucuncu ONAYLAR',
        rOffice.status >= 400 && rRequester.status >= 400
        && JSON.stringify(before) === JSON.stringify(mid)
        && rThird.status < 400 && after.contentApprovedById === st.actors.elev3.id,
        `request→${rReq.status} · ofis-onaylayici→${rOffice.status}/${code(rOffice)}`
        + ` · talep-eden→${rRequester.status}/${code(rRequester)}`
        + ` (ikisinde de durum degismedi=${JSON.stringify(before) === JSON.stringify(mid)})`
        + ` · ucuncu kisi→${rThird.status} · contentApprovedById=elev3 mi=`
        + `${after.contentApprovedById === st.actors.elev3.id}`);
    }
  }

  // H4-08 · yayın yalnız onaylı sağlayıcıya çıkar
  {
    const before = await prisma.clientFinancialDisclosureVersion.findUnique({
      where: { id: vid }, select: { status: true },
    });
    const r = await L.AH.httpJson('POST', url('publish'), { token: tokens.elev3, body: {} });
    const after = await prisma.clientFinancialDisclosureVersion.findUnique({
      where: { id: vid }, select: { status: true },
    });
    const declared = (process.env.I3_API_EMAIL_PROVIDER || '').toLowerCase();
    const approved = ['smtp', 'sendgrid', 'ses'].includes(declared);

    if (r.indeterminate) {
      R.unmeasured('H4-08', 'yayin yalniz onayli saglayiciya cikar', r.indeterminateReason);
    } else if (!declared) {
      R.unmeasured('H4-08', 'yayin yalniz onayli saglayiciya cikar',
        'I3_API_EMAIL_PROVIDER bildirilmedi — allowlist kararinin girdisi BILINMIYOR');
    } else {
      R.check('H4-08', `yayin karari onayli-saglayici allowlist'ine uyar (bildirilen: ${declared})`,
        approved ? r.status < 400 : (r.status >= 400 && before.status === after.status),
        `saglayici=${declared} (allowlist'te=${approved}) · HTTP ${r.status}`
        + ` · durum ${before.status}→${after.status}`);
    }
  }
};
