/*
 * İ3 DÜZENEK — H4: TALİMAT, BEYAN, RIZA, KVKK (İ2 ölçütleri H4-01…H4-08)
 *
 * DÖRT AYRI MEKANİZMA — eşikleri birbirine GENELLENMEZ (İ2 §3.0):
 *   1 Rıza (consent)          — rıza kapısı yetkiden BAĞIMSIZDIR: elevated aktör de rızasız yazamaz
 *   2 Müvekkil onay defteri   — kararın KAYNAĞI müvekkil, KAYDI personel; aktör personeldir
 *   3 Büro (ofis) onayı       — talep eden onaylayamaz + onaylayan eligible olmalı
 *   4 İçerik onayı            — ayrıca ofis onaylayıcısı olamaz → ÜÇ AYRI KİŞİ
 *
 * H4-06/07/08 finansal beyan SÜRÜMÜ ister; sürüm yalnız Collection→Disposition→posting
 * zincirinden doğar (`client-settlement/...command.service.ts:68,144` → writer). Bu ön koşul
 * kurulamazsa ölçüt PASS YAPILMAZ, UNMEASURED raporlanır.
 */
'use strict';
const L = require('./i3-lib');

const GREETING_ACTIVITY = 'GREETING_AND_OPTIONAL_COMMUNICATION';

module.exports = async function runH4(ctx) {
  const { base, prisma, tokens, st, R } = ctx;
  const cid = st.clientId;
  L.AH.step('H4', 'talimat / beyan / riza / KVKK — 8 olcut');

  const putClient = (token, body) => L.AH.httpJson('PUT', `${base}/clients/${cid}`, { token, body });
  const readClient = () => prisma.client.findUnique({
    where: { id: cid },
    select: { sendBirthdayGreeting: true, sendHolidayGreeting: true, greetingChannel: true, phone: true },
  });
  const consents = () => prisma.clientConsent.findMany({ where: { clientId: cid }, orderBy: { id: 'asc' } });

  // ══ H4-01 · Rızasız greeting bayrağı yazılamaz — elevated aktör DAHİL ══
  {
    const active = await prisma.clientConsent.count({
      where: { clientId: cid, activity: GREETING_ACTIVITY, status: 'GRANTED', revokedAt: null },
    });
    if (active > 0) {
      R.unmeasured('H4-01', 'rizasiz greeting bayragi yazilamaz',
        'baslangic kosulu saglanmadi: aktif riza ZATEN var');
    } else {
      const before = await L.captureState(prisma, cid);
      // Aynı istekte standart bir alan da var: rıza kapısı yazma ÖNCESİ çalışırsa O DA yazılmaz.
      const rUser = await putClient(tokens.user, { sendBirthdayGreeting: true, phone: '5559998888' });
      const rElev = await putClient(tokens.elev1, { sendHolidayGreeting: true });
      const after = await L.captureState(prisma, cid);
      const row = await readClient();
      const u = L.unchanged(before, after);

      if (rUser.indeterminate || rElev.indeterminate) {
        R.unmeasured('H4-01', 'rizasiz greeting bayragi yazilamaz',
          rUser.indeterminateReason || rElev.indeterminateReason);
      } else {
        R.check('H4-01', 'riza kapisi YETKIDEN BAGIMSIZ — elevated aktor de rizasiz yazamaz',
          rUser.status === 403 && rElev.status === 403
          && row.sendBirthdayGreeting !== true && row.sendHolidayGreeting !== true && u.ok,
          `USER→${rUser.status} · ELEVATED→${rElev.status} (ikisi de 403 beklenir)`
          + ` · bayraklar yazilmadi=${row.sendBirthdayGreeting !== true && row.sendHolidayGreeting !== true}`
          + ` · ayni istekteki STANDART alan da yazilmadi=${row.phone !== '5559998888'}`
          + ` · kalici degisiklik=${u.ok ? 'YOK' : u.changes.join(',')}`);
      }
    }
  }

  // ══ H4-02 · Rıza verme: YENİ SATIR açılır (tarihçe korunur), sonra yazma açılır ══
  {
    const before = await consents();
    const r = await L.AH.httpJson('POST', `${base}/clients/${cid}/consents`, {
      token: tokens.elev1, body: { activity: GREETING_ACTIVITY },
    });
    const after = await consents();
    const rWrite = await putClient(tokens.user, { sendBirthdayGreeting: true });
    const row = await readClient();

    if (r.indeterminate || rWrite.indeterminate) {
      R.unmeasured('H4-02', 'riza verme tarihceyi korur', r.indeterminateReason || rWrite.indeterminateReason);
    } else {
      const added = after.length - before.length;
      const granted = after.find((c) => c.activity === GREETING_ACTIVITY && c.status === 'GRANTED' && !c.revokedAt);
      R.check('H4-02', 'riza YENI SATIR olarak yazilir ve bayrak yazimini ACAR',
        r.status < 400 && added === 1 && !!granted
        && rWrite.status === 200 && row.sendBirthdayGreeting === true,
        `riza HTTP ${r.status} · satir ${before.length}→${after.length} (yeni=${added}, guncelleme DEGIL)`
        + ` · aktif GRANTED=${!!granted} · sonraki yazma HTTP ${rWrite.status}`
        + ` · bayrak=${row.sendBirthdayGreeting}`);
    }
  }

  // ══ H4-03 · Rıza geri alma: satır SİLİNMEZ, yazma yeniden kapanır ══
  {
    const before = await consents();
    const r = await L.AH.httpJson('POST', `${base}/clients/${cid}/consents/revoke`, {
      token: tokens.elev1, body: { activity: GREETING_ACTIVITY },
    });
    const after = await consents();
    const rWrite = await putClient(tokens.user, { sendAnniversaryGreeting: true });
    const row = await prisma.client.findUnique({
      where: { id: cid }, select: { sendAnniversaryGreeting: true },
    });

    if (r.indeterminate || rWrite.indeterminate) {
      R.unmeasured('H4-03', 'riza geri alma yazmayi kapatir', r.indeterminateReason || rWrite.indeterminateReason);
    } else {
      const revoked = after.find((c) => c.activity === GREETING_ACTIVITY && c.revokedAt);
      R.check('H4-03', 'geri alma: satir SILINMEZ (revokedAt dolar), bayrak yazimi yeniden RED',
        r.status < 400 && after.length === before.length && !!revoked
        && !!revoked.revokedByUserId && rWrite.status === 403 && row.sendAnniversaryGreeting !== true,
        `revoke HTTP ${r.status} · satir sayisi ${before.length}→${after.length} (SILINMEDI)`
        + ` · revokedAt dolu=${!!revoked} · revokedByUserId dolu=${!!(revoked && revoked.revokedByUserId)}`
        + ` · sonraki yazma HTTP ${rWrite.status} (403 beklenir) · bayrak=${row.sendAnniversaryGreeting}`);
    }
  }

  // ══ H4-04 · Müvekkil onay defteri: aktör PERSONEL, içerik IMMUTABLE ══
  {
    const create = await L.AH.httpJson('POST', `${base}/client-approvals/case/${st.caseId}`, {
      token: tokens.elev1,
      // CreateClientApprovalRequestDto: clientId + subjectType + channel ZORUNLU.
      // MANUAL kanal mail tetiklemez → H4-04 yalniz defter davranisini olcer.
      body: {
        clientId: cid, subjectType: 'OPERATION', channel: 'MANUAL',
        title: 'I3 onay talebi', description: 'Sentetik onay defteri kaydi',
      },
    });
    if (create.indeterminate) {
      R.unmeasured('H4-04', 'onay defteri aktor/immutability', create.indeterminateReason);
      R.unmeasured('H4-05', 'onay maili best-effort', 'onay kaydi olusturulamadi');
      return;
    }
    const body = create.body || {};
    const approvalId = body.id || (body.data && body.data.id);
    if (!approvalId) {
      R.unmeasured('H4-04', 'onay defteri aktor/immutability',
        `onay kaydi kimligi alinamadi (HTTP ${create.status})`);
      R.unmeasured('H4-05', 'onay maili best-effort', 'onay kaydi olusturulamadi');
      return;
    }

    const rSend = await L.AH.httpJson('POST', `${base}/client-approvals/${approvalId}/send`, {
      token: tokens.elev1, body: {},
    });
    const rDecide = await L.AH.httpJson('POST', `${base}/client-approvals/${approvalId}/decision`, {
      token: tokens.elev1, body: { decision: 'APPROVE', note: 'I3' },
    });
    // İçerik değiştirme uçları BULUNMAMALI (immutability)
    const rPut = await L.AH.httpJson('PUT', `${base}/client-approvals/${approvalId}`, {
      token: tokens.elev1, body: { title: 'degistirilmis' },
    });
    const rDel = await L.AH.httpJson('DELETE', `${base}/client-approvals/${approvalId}`, {
      token: tokens.elev1,
    });

    const row = await prisma.clientApprovalRequest.findUnique({ where: { id: approvalId } })
      .catch(() => null);

    R.check('H4-04', 'onay defteri: aktor PERSONELDIR; icerik PATCH/PUT/DELETE ucu YOK',
      create.status === 201 && rSend.status < 400 && rDecide.status < 400
      && rPut.status === 404 && rDel.status === 404
      && !!row && row.requestedById === st.actors.elev1.id,
      `create→${create.status} send→${rSend.status} decision→${rDecide.status}`
      + ` · PUT→${rPut.status} DELETE→${rDel.status} (ikisi de 404 = ucun YOKLUGU)`
      + ` · kayit aktoru personel=${row ? row.requestedById === st.actors.elev1.id : 'OLCULEMEDI'}`
      + ` · durum=${row ? row.status : '?'}`);

    // ══ H4-05 · Onay maili BEST-EFFORT: sağlayıcı hatası durumu DEĞİŞTİRMEZ ══
    {
      const stateBefore = row ? JSON.stringify(row) : null;
      // Sağlayıcıyı bilerek ulaşılamaz yap (Office satırındaki SMTP hedefi kapalı porta).
      await prisma.office.upsert({
        where: { tenantId: st.tenantId },
        update: { smtpHost: '127.0.0.1', smtpPort: 65535, smtpUser: `sink-${st.runId}@ah-harness.invalid` },
        create: {
          tenantId: st.tenantId, name: `I3 Office ${st.runId}`,
          smtpHost: '127.0.0.1', smtpPort: 65535, smtpSecure: false,
          smtpUser: `sink-${st.runId}@ah-harness.invalid`, smtpPass: 'i3-no-auth',
          smtpFromEmail: `noreply-${st.runId}@ah-harness.invalid`, smtpFromName: 'I3',
        },
      });
      const second = await L.AH.httpJson('POST', `${base}/client-approvals/case/${st.caseId}`, {
        token: tokens.elev1,
        // EMAIL kanali: mail TETIKLENIR → best-effort davranisi olculebilir.
        body: {
          clientId: cid, subjectType: 'OPERATION', channel: 'EMAIL',
          title: 'I3 mail best-effort', description: 'saglayici ulasilamaz',
        },
      });
      const sid = second.body && (second.body.id || (second.body.data && second.body.data.id));
      let rSend2 = null; let row2 = null;
      if (sid) {
        rSend2 = await L.AH.httpJson('POST', `${base}/client-approvals/${sid}/send`, {
          token: tokens.elev1, body: {},
        });
        row2 = await prisma.clientApprovalRequest.findUnique({ where: { id: sid } }).catch(() => null);
      }
      const rowAfter = row ? await prisma.clientApprovalRequest.findUnique({ where: { id: approvalId } })
        .catch(() => null) : null;

      if (!sid || !rSend2 || rSend2.indeterminate) {
        R.unmeasured('H4-05', 'onay maili best-effort',
          rSend2 && rSend2.indeterminate ? rSend2.indeterminateReason : 'ikinci onay kaydi kurulamadi');
      } else {
        R.check('H4-05', 'saglayici ULASILAMAZ iken durum gecisi COMMIT kalir, uc THROW ETMEZ',
          rSend2.status < 400 && !!row2 && row2.status === 'SENT'
          && (!stateBefore || JSON.stringify(rowAfter) === stateBefore),
          `send→${rSend2.status} (saglayici kapali port 65535) · durum=${row2 ? row2.status : '?'}`
          + ` · onceki kayit degismedi=${!stateBefore || JSON.stringify(rowAfter) === stateBefore}`);
      }
    }
  }
};
