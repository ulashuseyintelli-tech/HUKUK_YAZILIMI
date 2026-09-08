/*
 * İ3 DÜZENEK — H2: ADRES VE İLETİŞİM (İ2 ölçütleri H2-01…H2-10)
 *
 * Ölçülen eşik (İ2 §2.0, owner D02/D03/D07):
 *   ARCHIVE/RESTORE → her zaman elevated
 *   UPDATE          → hedef şu an birincilse VEYA devir talebi varsa elevated
 *   CREATE          → yalnız açık birincillik talebi mevcut aktif birincili düşürecekse
 *   D03             → ilk adresin otomatik birincil olması STANDARD'dır
 *   D07             → elevated YALNIZ isApproverEligible'dan türer; ADMIN rolü yetmez
 *
 * Başarı kodları controller'ın gerçek sözleşmesidir: @Post→201, @Put→200 (@HttpCode YOK).
 * Ürün koduna uydurma YAPILMAZ; sapma çıkarsa FAIL raporlanır.
 */
'use strict';
const L = require('./i3-lib');

const P = (base, clientId) => `${base}/clients/${clientId}/addresses`;

/** Adres gövdesi — kişisel veri sentetiktir. */
// DTO ile birebir: CreateClientAddressDto yalnız {type,street,city,district,region,
// postalCode,isPrimary} kabul eder (`client/dto/client-address.dto.ts:19-30`). Fazladan alan
// whitelist tarafından reddedilir — gövde ürünün sözleşmesine UYDURULUR, tersi değil.
const addr = (n, extra = {}) => ({
  type: 'BEYAN', street: `Sentetik Sokak ${n}`, city: 'Ankara', district: 'Cankaya',
  ...extra,
});

module.exports = async function runH2(ctx) {
  const { base, prisma, tokens, st, R } = ctx;
  const cid = st.clientId;
  L.AH.step('H2', 'adres ve iletisim — 10 olcut');

  const readAddr = (id) => prisma.clientAddress.findUnique({ where: { id } });
  const listAddr = () => prisma.clientAddress.findMany({ where: { clientId: cid }, orderBy: { id: 'asc' } });

  // ══ H2-02 · İlk adres otomatik birincil (STANDARD, elevated GEREKMEZ) ══
  // Önce ölçülür: kalan ölçütlerin başlangıç durumunu bu kurar.
  {
    const existing = await listAddr();
    if (existing.length > 0) {
      R.unmeasured('H2-02', 'ilk adres otomatik birincil (D03 STANDARD)',
        `baslangic kosulu saglanmadi: muvekkilde zaten ${existing.length} adres var`);
    } else {
      const r = await L.AH.httpJson('POST', P(base, cid), { token: tokens.user, body: addr(1) });
      if (r.indeterminate) {
        R.unmeasured('H2-02', 'ilk adres otomatik birincil (D03 STANDARD)', r.indeterminateReason);
      } else {
        const rows = await listAddr();
        const row = rows[0];
        R.check('H2-02', 'ilk adres otomatik birincil — elevated GEREKMEZ (D03)',
          r.status === 201 && rows.length === 1 && row.isCurrent === true && row.isPrimary === true,
          `HTTP ${r.status} (beklenen 201) · satir=${rows.length}`
          + (row ? ` · isCurrent=${row.isCurrent} isPrimary=${row.isPrimary}` : ''));
      }
    }
  }

  const primary = (await listAddr()).find((a) => a.isPrimary && a.isCurrent) || null;
  if (!primary) {
    for (const id of ['H2-01', 'H2-03', 'H2-04', 'H2-05', 'H2-06', 'H2-07', 'H2-08', 'H2-09']) {
      R.unmeasured(id, 'H2 olcutu', 'birincil adres kurulamadi — bu olcutlerin on kosulu YOK');
    }
    return;
  }

  // ══ H2-01 · VIEWER hiçbir adres mutasyonu yapamaz ══
  {
    const before = await L.captureState(prisma, cid);
    const attempts = [
      ['POST', P(base, cid), addr(9)],
      ['PUT', `${P(base, cid)}/${primary.id}`, { street: 'VIEWER denemesi' }],
      ['POST', `${P(base, cid)}/${primary.id}/archive`, {}],
      ['POST', `${P(base, cid)}/${primary.id}/restore`, {}],
    ];
    const seen = [];
    let indeterminate = null;
    for (const [m, url, body] of attempts) {
      const r = await L.AH.httpJson(m, url, { token: tokens.viewer, body });
      if (r.indeterminate) { indeterminate = r.indeterminateReason; break; }
      seen.push(`${m.padEnd(4)}→${r.status}${r.body && r.body.code ? `/${r.body.code}` : ''}`);
    }
    const after = await L.captureState(prisma, cid);
    const u = L.unchanged(before, after);
    if (indeterminate) {
      R.unmeasured('H2-01', 'VIEWER adres mutasyonu REDDEDILIR', indeterminate);
    } else {
      const allDenied = seen.every((s) => /→40[13]/.test(s));
      const codeOk = seen.some((s) => s.includes('CLIENT_MUTATION_DENIED_VIEWER'));
      R.check('H2-01', 'VIEWER adres mutasyonu REDDEDILIR ve KALICI ETKI YOK',
        allDenied && u.ok,
        `${seen.join(' · ')} · VIEWER kodu goruldu=${codeOk} · kalici degisiklik=`
        + `${u.ok ? 'YOK' : u.changes.join(',')}`);
    }
  }

  // ══ H2-04 · Mevcut birincil kaydın alanı elevated ister ══
  {
    const before = await L.captureState(prisma, cid);
    const rDeny = await L.AH.httpJson('PUT', `${P(base, cid)}/${primary.id}`,
      { token: tokens.user, body: { street: 'elevated olmayan deneme' } });
    const mid = await L.captureState(prisma, cid);
    const denyClean = L.unchanged(before, mid);

    const rAllow = await L.AH.httpJson('PUT', `${P(base, cid)}/${primary.id}`,
      { token: tokens.elev1, body: { street: 'I3 elevated guncelleme' } });
    const row = await readAddr(primary.id);

    if (rDeny.indeterminate || rAllow.indeterminate) {
      R.unmeasured('H2-04', 'birincil kaydin alani elevated ister',
        rDeny.indeterminateReason || rAllow.indeterminateReason);
    } else {
      R.check('H2-04', 'birincil kaydin alani: PARTNER bagi olmayan USER RED, elevated IZIN',
        rDeny.status === 403 && denyClean.ok
        && rAllow.status === 200 && row.street === 'I3 elevated guncelleme'
        && row.isPrimary === true && row.isCurrent === true,
        `USER→${rDeny.status} (kalici etki=${denyClean.ok ? 'YOK' : denyClean.changes.join(',')})`
        + ` · elevated→${rAllow.status} (beklenen 200) · street yazildi=${row.street === 'I3 elevated guncelleme'}`
        + ` · birincillik korundu=${row.isPrimary === true && row.isCurrent === true}`);
    }
  }

  // ══ H2-03 · Birincillik devri elevated ister ══
  // İkinci (birincil OLMAYAN) adres kurulur; devir talebi iki aktörle denenir.
  let second = null;
  {
    const rc = await L.AH.httpJson('POST', P(base, cid), { token: tokens.user, body: addr(2) });
    if (!rc.indeterminate && rc.status === 201) {
      second = (await listAddr()).find((a) => a.id !== primary.id) || null;
    }
    if (!second) {
      R.unmeasured('H2-03', 'birincillik devri elevated ister',
        `ikinci adres kurulamadi (HTTP ${rc.status ?? 'belirsiz'})`);
    } else {
      const before = await L.captureState(prisma, cid);
      const rDeny = await L.AH.httpJson('PUT', `${P(base, cid)}/${second.id}`,
        { token: tokens.user, body: { isPrimary: true } });
      const mid = await L.captureState(prisma, cid);
      const denyClean = L.unchanged(before, mid);

      const rAllow = await L.AH.httpJson('PUT', `${P(base, cid)}/${second.id}`,
        { token: tokens.elev1, body: { isPrimary: true } });
      const rows = await listAddr();
      const newPrimary = rows.find((a) => a.id === second.id);
      const oldPrimary = rows.find((a) => a.id === primary.id);

      if (rDeny.indeterminate || rAllow.indeterminate) {
        R.unmeasured('H2-03', 'birincillik devri elevated ister',
          rDeny.indeterminateReason || rAllow.indeterminateReason);
      } else {
        const invOk = newPrimary && oldPrimary
          && newPrimary.isPrimary === true && newPrimary.isCurrent === true
          && oldPrimary.isPrimary === false && oldPrimary.isCurrent === true
          && rows.filter((a) => a.isPrimary).length === 1; // INV-06
        R.check('H2-03', 'birincillik devri: USER RED (yazma yok), elevated IZIN (INV-03/06 korunur)',
          rDeny.status === 403 && denyClean.ok && rAllow.status === 200 && invOk,
          `USER→${rDeny.status}/${rDeny.body && rDeny.body.code} (kalici etki=`
          + `${denyClean.ok ? 'YOK' : denyClean.changes.join(',')}) · elevated→${rAllow.status}`
          + ` · tek birincil=${rows.filter((a) => a.isPrimary).length}`
          + ` · eski birincil isCurrent=${oldPrimary && oldPrimary.isCurrent}`);
      }
    }
  }

  // Devirden sonra güncel birincil `second`, arşiv/geri alma hedefi `primary` (birincil DEĞİL).
  const archiveTarget = second ? primary.id : null;

  // ══ H2-05 · Arşivleme her zaman elevated; tekrarı sabit hata ══
  if (!archiveTarget) {
    R.unmeasured('H2-05', 'arsivleme her zaman elevated', 'devir kurulmadi — hedef adres yok');
  } else {
    const before = await L.captureState(prisma, cid);
    const rDeny = await L.AH.httpJson('POST', `${P(base, cid)}/${archiveTarget}/archive`,
      { token: tokens.user, body: {} });
    const mid = await L.captureState(prisma, cid);
    const denyClean = L.unchanged(before, mid);

    const rAllow = await L.AH.httpJson('POST', `${P(base, cid)}/${archiveTarget}/archive`,
      { token: tokens.elev1, body: {} });
    const row = await readAddr(archiveTarget);

    // Tekrar: zaten arşivli → SABİT HATA (idempotent başarı DEĞİL)
    const rRepeat = await L.AH.httpJson('POST', `${P(base, cid)}/${archiveTarget}/archive`,
      { token: tokens.elev1, body: {} });
    const afterRepeat = await readAddr(archiveTarget);

    if (rDeny.indeterminate || rAllow.indeterminate || rRepeat.indeterminate) {
      R.unmeasured('H2-05', 'arsivleme elevated + tekrar sabit hata',
        rDeny.indeterminateReason || rAllow.indeterminateReason || rRepeat.indeterminateReason);
    } else {
      R.check('H2-05', 'arsivleme: USER RED, elevated 201, TEKRAR sabit hata (idempotent basari DEGIL)',
        rDeny.status === 403 && denyClean.ok
        && rAllow.status === 201 && row.isCurrent === false && row.isPrimary === false
        && rRepeat.status >= 400
        && JSON.stringify(row) === JSON.stringify(afterRepeat),
        `USER→${rDeny.status} (etki=${denyClean.ok ? 'YOK' : denyClean.changes.join(',')})`
        + ` · elevated→${rAllow.status} (beklenen 201) · isCurrent=${row.isCurrent} isPrimary=${row.isPrimary}`
        + ` · tekrar→${rRepeat.status} · tekrar sonrasi satir AYNI=`
        + `${JSON.stringify(row) === JSON.stringify(afterRepeat)}`);
    }
  }

  // ══ H2-06 · Geri alma her zaman elevated; tekrarı sabit hata ══
  if (!archiveTarget) {
    R.unmeasured('H2-06', 'geri alma her zaman elevated', 'arsivlenmis hedef yok');
  } else {
    const before = await L.captureState(prisma, cid);
    const rDeny = await L.AH.httpJson('POST', `${P(base, cid)}/${archiveTarget}/restore`,
      { token: tokens.user, body: {} });
    const mid = await L.captureState(prisma, cid);
    const denyClean = L.unchanged(before, mid);

    const rAllow = await L.AH.httpJson('POST', `${P(base, cid)}/${archiveTarget}/restore`,
      { token: tokens.elev1, body: {} });
    const row = await readAddr(archiveTarget);
    const rRepeat = await L.AH.httpJson('POST', `${P(base, cid)}/${archiveTarget}/restore`,
      { token: tokens.elev1, body: {} });

    if (rDeny.indeterminate || rAllow.indeterminate || rRepeat.indeterminate) {
      R.unmeasured('H2-06', 'geri alma elevated + tekrar sabit hata',
        rDeny.indeterminateReason || rAllow.indeterminateReason || rRepeat.indeterminateReason);
    } else {
      const repeatCode = rRepeat.body && (rRepeat.body.code || rRepeat.body.message);
      R.check('H2-06', 'geri alma: USER RED, elevated 201, TEKRAR sabit hata',
        rDeny.status === 403 && denyClean.ok
        && rAllow.status === 201 && row.isCurrent === true && rRepeat.status >= 400,
        `USER→${rDeny.status} (etki=${denyClean.ok ? 'YOK' : denyClean.changes.join(',')})`
        + ` · elevated→${rAllow.status} (beklenen 201) · isCurrent=${row.isCurrent}`
        + ` · tekrar→${rRepeat.status} ${String(repeatCode || '').slice(0, 40)}`);
    }
  }

  // ══ H2-07 · Fiziksel silme her zaman reddedilir, arşive çevrilmez ══
  {
    const target = archiveTarget || primary.id;
    const before = await L.captureState(prisma, cid);
    const rElev = await L.AH.httpJson('DELETE', `${P(base, cid)}/${target}`, { token: tokens.elev1 });
    const after = await L.captureState(prisma, cid);
    const u = L.unchanged(before, after);
    const row = await readAddr(target);

    if (rElev.indeterminate) {
      R.unmeasured('H2-07', 'fiziksel silme reddedilir', rElev.indeterminateReason);
    } else {
      const b = rElev.body || {};
      R.check('H2-07', 'fiziksel silme ELEVATED aktorde bile RED; arsive CEVRILMEZ, audit YOK',
        rElev.status === 400 && b.code === 'CLIENT_ADDRESS_PHYSICAL_DELETE_NOT_AUTHORIZED'
        && !!row && u.ok,
        `HTTP ${rElev.status} · code=${b.code} · unsatisfiedPolicy=${b.unsatisfiedPolicy}`
        + ` · satir duruyor=${!!row} · kalici degisiklik=${u.ok ? 'YOK' : u.changes.join(',')}`);
    }
  }

  // ══ H2-08 · Okuma sözleşmesi (status filtresi) + kapsam dışı 404 ══
  {
    // Bir adres arşivli, biri aktif olacak şekilde ayarla.
    if (archiveTarget) {
      await L.AH.httpJson('POST', `${P(base, cid)}/${archiveTarget}/archive`,
        { token: tokens.elev1, body: {} });
    }
    const rAct = await L.AH.httpJson('GET', `${P(base, cid)}?status=active`, { token: tokens.user });
    const rArc = await L.AH.httpJson('GET', `${P(base, cid)}?status=archived`, { token: tokens.user });
    const rAll = await L.AH.httpJson('GET', `${P(base, cid)}?status=all`, { token: tokens.user });
    // Kapsam dışı: BAŞKA tenant'ın müvekkili → 404 (bos liste DEGIL)
    const rOut = await L.AH.httpJson('GET', P(base, st.foreignClientId), { token: tokens.user });

    const pick = (r) => {
      const b = r.body;
      const arr = Array.isArray(b) ? b : (b && (b.data || b.items || b.addresses)) || null;
      return Array.isArray(arr) ? arr : null;
    };
    if (rAct.indeterminate || rArc.indeterminate || rAll.indeterminate || rOut.indeterminate) {
      R.unmeasured('H2-08', 'okuma sozlesmesi + kapsam disi 404', 'okuma uclarindan biri BELIRSIZ');
    } else {
      const A = pick(rAct); const B = pick(rArc); const C = pick(rAll);
      const shapeOk = A && B && C;
      const actOk = shapeOk && A.every((x) => x.isCurrent === true);
      const arcOk = shapeOk && B.every((x) => x.isCurrent === false);
      const allOk = shapeOk && C.length === A.length + B.length;
      R.check('H2-08', 'status filtresi dogru ayirir; BASKA tenant muvekkili 404 (bos liste DEGIL)',
        actOk && arcOk && allOk && rOut.status === 404,
        `active=${A ? A.length : '?'} hepsi isCurrent=${actOk} · archived=${B ? B.length : '?'} `
        + `hepsi arsiv=${arcOk} · all=${C ? C.length : '?'} toplam tutuyor=${allOk}`
        + ` · kapsam disi HTTP ${rOut.status} (beklenen 404)`);
    }
  }

  // ══ H2-09 · Invariant ihlali geçersiz ara durumu COMMIT etmez ══
  {
    // İki birincil üretmeye çalış: arşivli adresi `makePrimary` ile geri al VE ardından
    // ikinci bir devir talebi gönder. Ürün bunu invariant motoruyla engellemeli.
    const before = await L.captureState(prisma, cid);
    // Doğrudan ihlal denemesi: birincil olmayan bir adresi isPrimary=true + isCurrent=false ile güncelle
    const target = archiveTarget;
    let r = null;
    if (target) {
      r = await L.AH.httpJson('PUT', `${P(base, cid)}/${target}`,
        { token: tokens.elev1, body: { isPrimary: true, isCurrent: false } });
    }
    const after = await L.captureState(prisma, cid);
    const rows = await listAddr();
    const primaryCount = rows.filter((a) => a.isPrimary).length;
    const violated = rows.some((a) => a.isPrimary && !a.isCurrent); // INV-01/02

    if (!target) {
      R.unmeasured('H2-09', 'invariant ihlali COMMIT edilmez', 'hedef adres yok');
    } else if (r.indeterminate) {
      R.unmeasured('H2-09', 'invariant ihlali COMMIT edilmez', r.indeterminateReason);
    } else {
      // Kabul: ya istek reddedilir (400 lifecycle) ya da ürün isteği invariant'ı KORUYARAK
      // uygular. İkisi de geçerlidir; KABUL EDİLEMEZ olan, geçersiz durumun COMMIT edilmesidir.
      const b = r.body || {};
      const rejected = r.status >= 400;
      const stateValid = primaryCount <= 1 && !violated;
      R.check('H2-09', 'invariant ihlali gecersiz ara durumu COMMIT ETMEZ',
        stateValid,
        `HTTP ${r.status}${b.code ? `/${b.code}` : ''}${b.violation ? ` violation=${b.violation}` : ''}`
        + ` · istek reddedildi=${rejected} · birincil sayisi=${primaryCount}`
        + ` · isPrimary&&!isCurrent ihlali=${violated ? 'VAR(!)' : 'YOK'}`
        + (rejected ? ` · rollback sonrasi degisiklik=${L.unchanged(before, after).ok ? 'YOK' : 'VAR'}` : ''));
    }
  }

  // ══ H2-10 · İletişim kişileri: ayrı CRUD yok, TAM DEĞİŞTİRME var ══
  {
    // Tetikleyici alanlar `phones`/`emails`'tir (`client.service.ts:1893`); `contacts` adlı bir
    // gövde alanı YOKTUR. Önce iki iletişim kaydı yazılır.
    const seed = await L.AH.httpJson('PUT', `${base}/clients/${cid}`, {
      token: tokens.user,
      // phones/emails ClientContactInputDto[] tasir (create-client.dto.ts:33-44) — duz string DEGIL.
      body: {
        phones: [{ value: '5550001111', isPrimary: true }],
        emails: [{ value: `c1-${st.runId}@ah-harness.invalid` }],
      },
    });
    const afterSeed = await prisma.clientContact.findMany({ where: { clientId: cid }, orderBy: { id: 'asc' } });

    // VIEWER denemesi → tamamı korunmalı
    const beforeViewer = await L.captureState(prisma, cid);
    const rViewer = await L.AH.httpJson('PUT', `${base}/clients/${cid}`, {
      token: tokens.viewer, body: { phones: [], emails: [] },
    });
    const afterViewer = await L.captureState(prisma, cid);
    const viewerClean = L.unchanged(beforeViewer, afterViewer);

    // TAM DEĞİŞTİRME kanıtı: tek kayıtla gönder → diğerleri SİLİNİR (sayı DEĞİL, KİMLİK ölçülür)
    const rReplace = await L.AH.httpJson('PUT', `${base}/clients/${cid}`, {
      token: tokens.user,
      body: { phones: [{ value: '5550002222' }] },
    });
    const afterReplace = await prisma.clientContact.findMany({ where: { clientId: cid }, orderBy: { id: 'asc' } });
    const oldIds = new Set(afterSeed.map((c) => c.id));
    const survivingOld = afterReplace.filter((c) => oldIds.has(c.id)).length;

    if (seed.indeterminate || rViewer.indeterminate || rReplace.indeterminate) {
      R.unmeasured('H2-10', 'iletisim kisileri tam degistirme', 'uclardan biri BELIRSIZ');
    } else {
      R.check('H2-10', 'iletisim kisileri: VIEWER RED (tamami korunur); USER TAM DEGISTIRME yapar',
        rViewer.status === 403 && viewerClean.ok
        && rReplace.status === 200 && survivingOld === 0 && afterSeed.length >= 1,
        `seed=${afterSeed.length} kayit · VIEWER→${rViewer.status} (kalici etki=`
        + `${viewerClean.ok ? 'YOK' : viewerClean.changes.join(',')})`
        + ` · USER→${rReplace.status} · degistirme sonrasi ESKI KIMLIKTEN kalan=${survivingOld}`
        + ` (sayim ${afterSeed.length}→${afterReplace.length}; SAYIM tek basina kanit DEGIL)`);
    }
  }
};
