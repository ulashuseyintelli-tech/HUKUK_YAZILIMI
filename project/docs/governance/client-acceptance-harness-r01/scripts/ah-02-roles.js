/*
 * CLIENT KABUL ALTYAPISI (İ1a) — ADIM 2: ÜÇ AKTÖRÜN YETKİ BAĞLARI
 *
 * KAPSAM: yalnız **altyapının doğru kurulduğunu** gösterir — sekiz hizmetin kabul senaryoları
 * DEĞİL. Ölçülen şey, üç aktörün ürünün KENDİ eşiklerinde beklendiği gibi ayrışmasıdır.
 *
 * Ölçülen sözleşme (OWN-13 I01, mevcut ürün davranışı — bu paket onu DEĞİŞTİRMEZ):
 *   VIEWER                      → mutation'da fail-closed DENY
 *   USER, PARTNER bağı YOK      → standart alan İZİN; HASSAS alanda DENY
 *   USER, PARTNER bağı VAR      → hassas alanda da İZİN
 *   Tenant sınırı               → başka tenant'ın kaydına erişim yok
 *
 * ROL ADI YETKİ KANITI DEĞİLDİR — ölçümün kurgusu bunu zorunlu kılar:
 * `user` ve `elevated` **AYNI role** (USER) sahiptir. Hassas alan eşiği
 * `role === 'ADMIN' || isApproverEligible` olduğundan (client.service.ts:528-531), ADMIN yolu
 * ikisinde de KAPALIDIR; R-3 ile R-4 arasındaki fark yalnız `isApproverEligible`'dan gelebilir.
 * R-0e bu kurgunun bozulmadığını (rollerin hâlâ eşit olduğunu) ölçer — eşit değilse ölçüm
 * GEÇERSİZDİR ve FAIL raporlanır.
 *
 * Her satır HTTP sonucu + **kalıcı durum** ile doğrulanır; yetkisiz denemelerde yazma
 * olmadığı ayrıca ölçülür.
 */
'use strict';
const L = require('./ah-lib');

const results = [];
function chk(id, desc, ok, observed) {
  results.push({ id, desc, ok, observed });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(5)} ${desc}\n        ${observed}`);
}
function unmeasured(id, desc, why) {
  results.push({ id, desc, ok: false, unmeasured: true, observed: `OLCULEMEDI — ${why}` });
  console.log(`  ????? ${id.padEnd(5)} ${desc}\n        OLCULEMEDI — ${why}`);
}

const VALID_TCKN = '10000000146'; // sentetik; gerçek kişi verisi DEĞİL

(async () => {
  L.assertDisposableEnvironment(); // G-0
  const base = L.requireEnv('AH_API_BASE_URL').replace(/\/+$/, '');
  const password = L.requireLoginPassword();
  const st = L.loadState();
  L.assertOwnSlug(st.slug); // G-1

  const prisma = L.loadPrisma();
  try {
    await L.assertOwnTenant(prisma, st.tenantId); // G-2
    L.step('R', `yetki baglari — tenant ${st.slug}`);

    // ── Üç aktör de oturum açabiliyor mu? ──
    const tokens = {};
    for (const tag of ['viewer', 'user', 'elevated']) {
      const a = st.actors[tag];
      const r = await L.login(base, a.email, password, st.slug);
      if (r.indeterminate) { unmeasured(`R-0${tag[0]}`, `${tag} login`, r.reason); continue; }
      tokens[tag] = r.token;
      chk(`R-0${tag[0]}`, `${tag} oturum acabiliyor`, r.ok, `HTTP ${r.status} · token=${r.token ? 'ALINDI' : 'YOK'}`);
    }
    if (!tokens.viewer || !tokens.user || !tokens.elevated) {
      throw new Error('uc aktorun tamami oturum acamadi — altyapi kurulumu EKSIK');
    }

    // ── R-0e: ÖLÇÜM GEÇERLİLİĞİ — `user` ile `elevated` AYNI rolde olmalı ──
    // Aksi hâlde R-3/R-4 farkı rol adından gelebilir ve eligibility bağını KANITLAMAZ.
    const roleUser = st.actors.user.role;
    const roleElev = st.actors.elevated.role;
    const eligUser = await prisma.user.findUnique({
      where: { id: st.actors.user.id },
      select: { lawyer: { select: { lawyerRank: true, canApproveOfficeActions: true } }, staffMember: { select: { id: true } } },
    });
    const eligElev = await prisma.user.findUnique({
      where: { id: st.actors.elevated.id },
      select: { lawyer: { select: { lawyerRank: true, canApproveOfficeActions: true } }, staffMember: { select: { id: true } } },
    });
    const partnerUser = !!eligUser.lawyer && !eligUser.staffMember && eligUser.lawyer.lawyerRank === 'PARTNER';
    const partnerElev = !!eligElev.lawyer && !eligElev.staffMember && eligElev.lawyer.lawyerRank === 'PARTNER';
    chk('R-0x', 'OLCUM GECERLI: iki aktor AYNI rolde, fark YALNIZ PARTNER bagi',
      roleUser === roleElev && roleUser !== 'ADMIN' && partnerElev && !partnerUser,
      `user=${roleUser}/partner:${partnerUser} · elevated=${roleElev}/partner:${partnerElev}`
      + ` — ADMIN yolu ikisinde de KAPALI=${roleUser !== 'ADMIN' && roleElev !== 'ADMIN'}`);

    const readPhone = async () => (await prisma.client.findUniqueOrThrow({
      where: { id: st.clientId }, select: { phone: true, tckn: true },
    }));

    // ── R-1: VIEWER mutation → DENY, yazma 0 ──
    const before1 = await readPhone();
    const r1 = await L.httpJson('PUT', `${base}/clients/${st.clientId}`, {
      token: tokens.viewer, body: { phone: '5550000001' },
    });
    const after1 = await readPhone();
    chk('R-1', 'VIEWER mutation REDDEDILIR ve YAZMA YAPILMAZ',
      !r1.indeterminate && r1.status >= 400 && after1.phone === before1.phone,
      `HTTP ${r1.status} · phone degismedi=${after1.phone === before1.phone}`);

    // ── R-2: USER standart alan → İZİN ──
    const r2 = await L.httpJson('PUT', `${base}/clients/${st.clientId}`, {
      token: tokens.user, body: { phone: '5550000002' },
    });
    const after2 = await readPhone();
    chk('R-2', 'USER standart alani guncelleyebilir',
      !r2.indeterminate && r2.status < 400 && after2.phone === '5550000002',
      `HTTP ${r2.status} · phone=${after2.phone === '5550000002' ? 'yazildi' : 'YAZILMADI'}`);

    // ── R-3: USER HASSAS alan → DENY, yazma 0 ──
    const before3 = await readPhone();
    const r3 = await L.httpJson('PUT', `${base}/clients/${st.clientId}`, {
      token: tokens.user, body: { tckn: VALID_TCKN },
    });
    const after3 = await readPhone();
    chk('R-3', 'PARTNER bagi OLMAYAN USER hassas alanda REDDEDILIR, yazma YOK',
      !r3.indeterminate && r3.status >= 400 && after3.tckn === before3.tckn,
      `HTTP ${r3.status} · tckn degismedi=${after3.tckn === before3.tckn}`);

    // ── R-4: ELEVATED hassas alan → İZİN (isApproverEligible bağı çalışıyor) ──
    const r4 = await L.httpJson('PUT', `${base}/clients/${st.clientId}`, {
      token: tokens.elevated, body: { tckn: VALID_TCKN },
    });
    const after4 = await readPhone();
    chk('R-4', 'AYNI roldeki PARTNER bagli USER hassas alani guncelleyebilir',
      !r4.indeterminate && r4.status < 400 && after4.tckn === VALID_TCKN,
      `HTTP ${r4.status} · tckn=${after4.tckn === VALID_TCKN ? 'yazildi' : 'YAZILMADI'}`);

    // ── R-5: TENANT SINIRI — karşı kayıt YALNIZ disposable ortamda kurulur ──
    L.step('R-5', 'tenant siniri (karsi tenant disposable ortamda kurulur)');
    const otherRunId = L.newRunId();
    const otherSlug = `${L.TENANT_PREFIX}${otherRunId}`;
    L.assertOwnSlug(otherSlug);
    const other = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({ data: { name: `AH other ${otherRunId}`, slug: otherSlug }, select: { id: true } });
      const c = await tx.client.create({
        data: { tenantId: t.id, type: 'PERSON', name: `AH Other Client ${otherRunId}` },
        select: { id: true },
      });
      return { tenantId: t.id, clientId: c.id };
    });
    const beforeX = await prisma.client.findUniqueOrThrow({
      where: { id: other.clientId }, select: { phone: true },
    });
    const r5 = await L.httpJson('PUT', `${base}/clients/${other.clientId}`, {
      token: tokens.elevated, body: { phone: '5559999999' },
    });
    const afterX = await prisma.client.findUniqueOrThrow({
      where: { id: other.clientId }, select: { phone: true },
    });
    chk('R-5', 'BASKA tenant\'in kaydina erisim REDDEDILIR ve yazma YOK',
      !r5.indeterminate && r5.status >= 400 && afterX.phone === beforeX.phone,
      `HTTP ${r5.status} · hedef phone degismedi=${afterX.phone === beforeX.phone} · karsi tenant=${otherSlug}`);

    // Karşı tenant temizliği (yalnız bu paketin ürettiği kayıt).
    await prisma.client.deleteMany({ where: { tenantId: other.tenantId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: other.tenantId } }).catch(() => {});

    // ── R-6: izolasyon — komşu tenant'lar DEĞİŞMEDİ ──
    // Karşılaştırma kendi tenant'ımız hariç TÜM dağılımın parmak izi üzerindendir; tek bir
    // komşu satırdaki değişiklik bile digest'i bozar.
    const nowFp = await L.isolationFingerprint(prisma, st.tenantId);
    const baseFp = st.isolationBaseline || {};
    const sameDigest = !!baseFp.digest && baseFp.digest === nowFp.digest;
    chk('R-6', 'komsu tenantlar DEGISMEDI (dagilim parmak izi)', sameDigest,
      `${nowFp.tenantsObserved} komsu tenant · client ${baseFp.clientTotal}→${nowFp.clientTotal}`
      + ` · user ${baseFp.userTotal}→${nowFp.userTotal} · digest ${baseFp.digest || 'YOK'}`
      + `${sameDigest ? ' = ' : ' ≠ '}${nowFp.digest}`);

    const okN = results.filter((r) => r.ok).length;
    const unm = results.filter((r) => r.unmeasured).length;
    console.log(`\nYETKI BAGLARI: ${okN}/${results.length}${unm ? ` · OLCULEMEYEN ${unm}` : ''} `
      + `${okN === results.length ? 'PASS' : 'FAIL'}`);
    console.log(JSON.stringify({
      record: 'AH-ROLE-BINDINGS', tenant: st.slug, runId: st.runId,
      result: `${okN}/${results.length}`, unmeasured: unm, secretsPrinted: false,
    }, null, 1));
    process.exitCode = okN === results.length ? 0 : 2;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nYETKI OLCUM HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
