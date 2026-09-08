/*
 * CLIENT KABUL DÜZENEKLERİ (İ3) — ORTAK KATMAN
 *
 * İ2 ölçüt setini (`client-acceptance-criteria-i2-r01/`) çalıştırılabilir düzeneklere çevirir.
 * İzolasyon, ortam kapıları ve erişim sonlandırma İ1a altyapısından DEVRALINIR — burada
 * ikinci bir izolasyon mekanizması KURULMAZ.
 *
 * BAĞLAYICI ÖLÇÜM KURALLARI (İ2 §1):
 *  1. **Ölçülemeyen sonuç PASS OLMAZ.** Üç değer vardır: PASS · FAIL · UNMEASURED.
 *     Belirsiz HTTP (timeout/taşıma hatası) veya kurulamayan ön koşul → UNMEASURED.
 *  2. **HTTP kodu tek başına yeterli değildir.** Her ölçüt kalıcı durumu işlem ÖNCESİ ve
 *     SONRASI karşılaştırır (`captureState` + `assertUnchanged`).
 *  3. **Aynı satır sayısı, içeriğin değişmediği kanıtı değildir** — karşılaştırma kayıt
 *     kimliği + ALAN düzeyindedir.
 *  4. **Yetki rol adından çıkarılmaz.** Elevated ayrımı, rolleri EŞİT iki aktör arasında
 *     yalnız `isApproverEligible` bağıyla kurulur (İ1a R-0x deseni).
 */
'use strict';
const path = require('path');

const AH_DIR = path.resolve(__dirname, '../../client-acceptance-harness-r01/scripts');
const AH = require(path.join(AH_DIR, 'ah-lib'));

const VERDICT = { PASS: 'PASS', FAIL: 'FAIL', UNMEASURED: 'UNMEASURED' };

class Results {
  constructor() { this.rows = []; }

  /** Bir ölçütün sonucunu kaydeder. `verdict` üç değerden biridir. */
  add(id, desc, verdict, observed) {
    if (!Object.values(VERDICT).includes(verdict)) {
      throw new Error(`gecersiz verdict '${verdict}' (${id})`);
    }
    this.rows.push({ id, desc, verdict, observed });
    const tag = verdict === VERDICT.PASS ? 'OK  ' : verdict === VERDICT.FAIL ? 'FAIL' : '????';
    console.log(`  ${tag} ${id.padEnd(7)} ${desc}\n          ${observed}`);
    return verdict;
  }

  /** ok=true → PASS, ok=false → FAIL. Belirsizlik için `unmeasured()` kullanılır. */
  check(id, desc, ok, observed) {
    return this.add(id, desc, ok ? VERDICT.PASS : VERDICT.FAIL, observed);
  }

  unmeasured(id, desc, why) {
    return this.add(id, desc, VERDICT.UNMEASURED, `OLCULEMEDI — ${why}`);
  }

  summary(label) {
    const p = this.rows.filter((r) => r.verdict === VERDICT.PASS).length;
    const f = this.rows.filter((r) => r.verdict === VERDICT.FAIL).length;
    const u = this.rows.filter((r) => r.verdict === VERDICT.UNMEASURED).length;
    console.log(`\n${label}: PASS ${p} · FAIL ${f} · OLCULEMEYEN ${u}  (toplam ${this.rows.length})`);
    return { pass: p, fail: f, unmeasured: u, total: this.rows.length };
  }
}

/**
 * Kalıcı durum fotoğrafı — ALAN düzeyinde, kayıt kimliğiyle anahtarlı.
 * Sayım karşılaştırması bilerek YETERSİZ sayılır (İ2 §1, H2-10 tuzağı).
 */
async function captureState(prisma, clientId) {
  // YANLIS PASS YOLU KAPATILDI: onceki surum `.catch(() => null)` kullaniyordu; sorgu
  // basarisiz olsa bile once/sonra fotograflari `null === null` ile ESIT gorunuyor ve
  // "kalici etki YOK" iddiasi YANLIS PASS uretiyordu. Artik sorgu hatasi YUKARI FIRLAR
  // ve cagiran olcut UNMEASURED raporlar (bkz. safeCapture).
  const [addresses, contacts, client, consents, audits] = await Promise.all([
    prisma.clientAddress.findMany({ where: { clientId }, orderBy: { id: 'asc' } }),
    prisma.clientContact.findMany({ where: { clientId }, orderBy: { id: 'asc' } }),
    prisma.client.findUniqueOrThrow({ where: { id: clientId } }),
    prisma.clientConsent.findMany({ where: { clientId }, orderBy: { id: 'asc' } }),
    prisma.auditLog.count({ where: { entityId: clientId } }),
  ]);
  const norm = (rows) => rows.map((r) => JSON.stringify(r, Object.keys(r).sort()));
  return {
    addressById: Object.fromEntries(addresses.map((a) => [a.id, JSON.stringify(a, Object.keys(a).sort())])),
    contactRows: norm(contacts),
    clientRow: JSON.stringify(client, Object.keys(client).sort()),
    consentRows: norm(consents),
    auditCount: audits,
  };
}

/**
 * Fotograf alirken sorgu duserse `{ error }` doner — cagiran olcut PASS URETEMEZ.
 * "Olculemeyen sonuc PASS olmaz" kuralinin veri katmanindaki karsiligi.
 */
async function safeCapture(prisma, clientId) {
  try {
    return { state: await captureState(prisma, clientId), error: null };
  } catch (e) {
    return { state: null, error: e && e.message ? e.message : String(e) };
  }
}

/** Sayim/skaler okuma; duserse `null` DEGIL `{ error }` doner (null karsilastirmasi yasak). */
async function safeCount(fn) {
  try { return { value: await fn(), error: null }; }
  catch (e) { return { value: null, error: e && e.message ? e.message : String(e) }; }
}

/** İki fotoğrafı karşılaştırır; farkları insan-okur biçimde döndürür. */
function diffState(before, after) {
  const changes = [];
  const ids = new Set([...Object.keys(before.addressById), ...Object.keys(after.addressById)]);
  for (const id of ids) {
    const b = before.addressById[id];
    const a = after.addressById[id];
    if (b === undefined) changes.push(`adres+${id.slice(-6)}`);
    else if (a === undefined) changes.push(`adres-${id.slice(-6)}`);
    else if (b !== a) changes.push(`adres~${id.slice(-6)}`);
  }
  if (JSON.stringify(before.contactRows) !== JSON.stringify(after.contactRows)) {
    changes.push(`iletisim~(${before.contactRows.length}→${after.contactRows.length})`);
  }
  if (before.clientRow !== after.clientRow) changes.push('muvekkil~');
  if (before.consentRows !== null && JSON.stringify(before.consentRows) !== JSON.stringify(after.consentRows)) {
    changes.push(`riza~(${before.consentRows.length}→${after.consentRows.length})`);
  }
  if (before.auditCount !== null && after.auditCount !== null && before.auditCount !== after.auditCount) {
    changes.push(`audit~(${before.auditCount}→${after.auditCount})`);
  }
  return changes;
}

/**
 * "Hicbir kalici etki olmamali" iddiasini olcer.
 * Fotograflardan biri alinamamissa `ok` DEGIL `unmeasured` doner — yanlis PASS yolu kapali.
 */
function unchanged(before, after) {
  if (!before || !after) {
    return { ok: false, unmeasured: true, changes: ['fotograf alinamadi — OLCULEMEDI'] };
  }
  const c = diffState(before, after);
  return { ok: c.length === 0, unmeasured: false, changes: c };
}

/**
 * İ3 aktörleri. `user` ile `elev1/2/3` AYNI role (USER) sahiptir; aralarındaki TEK fark
 * PARTNER lawyer bağıdır. Böylece elevated ayrımı rol adından DEĞİL, ürünün kendi
 * `isApproverEligible` mekanizmasından gelir (İ2 §2.0 / owner D07).
 *
 * Üç eligible aktör vardır çünkü finansal beyan zinciri ÜÇ AYRI KİŞİ ister (İ2 H4-06/H4-07).
 */
// ═══ AKTOR MATRISI ═══
// CR-1 review kapisi UC ayri kosul zinciri uygular
// (`client-intake-review-authorization.service.ts`):
//   (a) aktif tenant aktoru, (b) TAM OLARAK BIR profil (Lawyer XOR StaffMember),
//   (c) exact GLOBAL `client.intake.review` ALLOW grant (gecerli DENY oncelikli).
// OLCUM KURALI: negatif yetki senaryolarinda aktorun GECERLI PROFILI OLMALIDIR. Profilsiz
// aktorun 403'u `ACTOR_PROFILE_INVALID`ten gelir ve GRANT REDDININ KANITI SAYILAMAZ.
// `noprofile` aktoru bilerek profilsizdir: iki ret nedeninin AYIRT EDILDIGINI kanitlar.
const ACTORS = [
  { tag: 'viewer', role: 'VIEWER', staff: true },
  { tag: 'user', role: 'USER', staff: true },
  // ADMIN rolu VAR, grant YOK → rol tek basina review yetkisi VERMEZ (CR-1).
  { tag: 'admin', role: 'ADMIN', staff: true },
  // Grant VAR + StaffMember profili VAR → INCELEME yapar; `isApproverEligible` staffMember
  // yuzunden fail-closed doner (office-approval.service.ts:463) → AKTARIM yapamaz.
  { tag: 'reviewer', role: 'USER', staff: true, reviewGrant: true },
  // PARTNER lawyer → promotion/elevated esigini tasir; review grant YOK → inceleme yapamaz.
  { tag: 'elev1', role: 'USER', partner: true },
  { tag: 'elev2', role: 'USER', partner: true },
  { tag: 'elev3', role: 'USER', partner: true },
  // Profil YOK: ret nedeni ayrimini olcmek icin (PROFILE_INVALID != PERMISSION_REQUIRED).
  { tag: 'noprofile', role: 'USER' },
  // MUHASEBE personeli + canPrepareCollectionDisposition → finansal bildirim HAZIRLAYABILIR
  // ama `isApproverEligible` DEGILDIR (staffMember fail-closed) → onaylayamaz.
  { tag: 'accountant', role: 'USER', staff: true, staffType: 'MUHASEBE', canPrepare: true },
];

async function setupI3(prisma, bcrypt, runId, passwordHash) {
  const slug = `${AH.TENANT_PREFIX}${runId}`;
  AH.assertOwnSlug(slug); // G-1

  const clash = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
  if (clash) throw new Error(`G-3 IHLALI: '${slug}' zaten var`);

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: `I3 ${runId}`, slug }, select: { id: true } });

    const actors = {};
    for (const a of ACTORS) {
      const u = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: `${a.tag}-${runId}@ah-harness.invalid`,
          name: a.tag.toUpperCase(), surname: 'I3', passwordHash, role: a.role,
        },
        select: { id: true, email: true, role: true },
      });
      if (a.partner) {
        await tx.lawyer.create({
          data: {
            tenantId: tenant.id, name: 'I3', surname: a.tag.toUpperCase(),
            lawyerRank: 'PARTNER', userId: u.id,
          },
          select: { id: true },
        });
      }
      if (a.staff) {
        // `assertActiveTenantActor` aktorun TAM OLARAK BIR profil tasimasini ister
        // (Lawyer XOR StaffMember). StaffMember bilerek secildi: `isApproverEligible`
        // staffMember varsa fail-closed doner (office-approval.service.ts:463), boylece
        // ayni aktor INCELEME yapabilir ama AKTARIM yapamaz — CR-1 md.6'nin dogrudan kaniti.
        await tx.staffMember.create({
          data: {
            tenantId: tenant.id, userId: u.id,
            firstName: 'I3', lastName: a.tag.toUpperCase(),
            staffType: a.staffType || 'OFIS_KATIBI',
            ...(a.canPrepare ? { canPrepareCollectionDisposition: true } : {}),
          },
          select: { id: true },
        });
      }
      if (a.reviewGrant) {
        // Review yetkisi rolden veya eligibility'den TUREMEZ; canonical PermissionGrant
        // substrate'inden gelir: exact GLOBAL `client.intake.review` ALLOW
        // (client-intake-review-authorization.service.ts:5,15-16).
        await tx.permissionGrant.create({
          data: {
            tenantId: tenant.id, subjectUserId: u.id,
            permissionKey: 'client.intake.review',
            effect: 'ALLOW', scope: 'GLOBAL',
            reason: 'I3 kabul duzenegi - CR-1 review yetkisi',
          },
          select: { id: true },
        });
      }
      actors[a.tag] = {
        id: u.id, email: u.email, role: u.role,
        partner: !!a.partner, staff: !!a.staff, reviewGrant: !!a.reviewGrant,
      };
    }

    const client = await tx.client.create({
      data: {
        tenantId: tenant.id, type: 'PERSON', name: `I3 Client ${runId}`,
        email: `client-${runId}@ah-harness.invalid`,
      },
      select: { id: true },
    });

    // İkinci müvekkil: tenant-içi kapsam ve "başka müvekkilin satırı" senaryoları için.
    const otherClient = await tx.client.create({
      data: { tenantId: tenant.id, type: 'PERSON', name: `I3 Other ${runId}` },
      select: { id: true },
    });

    const kase = await tx.case.create({
      data: {
        tenantId: tenant.id,
        fileNumber: `I3-${runId}`,
        type: 'GENERAL_EXECUTION',
      },
      select: { id: true },
    });
    const caseClient = await tx.caseClient.create({
      data: { caseId: kase.id, clientId: client.id }, select: { id: true },
    });

    // Borclu: `promote-address` DTO'su `debtorId` ZORUNLU kilar (PromoteAddressDto:11).
    const debtor = await tx.debtor.create({
      data: { tenantId: tenant.id, type: 'INDIVIDUAL', name: `I3 Debtor ${runId}` },
      select: { id: true },
    });

    // YABANCI TENANT — tenant sınırı ölçütleri için karşı kayıt. Yalnız izole ortamda kurulur
    // ve aynı `ah-` önekini taşır, böylece kurtarma/temizlik kapsamının dışına düşmez.
    const foreignSlug = `${AH.TENANT_PREFIX}${runId}-x`;
    AH.assertOwnSlug(foreignSlug);
    const foreign = await tx.tenant.create({
      data: { name: `I3 foreign ${runId}`, slug: foreignSlug }, select: { id: true },
    });
    const foreignClient = await tx.client.create({
      data: { tenantId: foreign.id, type: 'PERSON', name: `I3 Foreign Client ${runId}` },
      select: { id: true },
    });
    // F46-K1: promote-address borclunun dosyayla CaseDebtor bagini SART kosar
    // (client-intake-promotion.service.ts:255-256).
    await tx.caseDebtor.create({
      data: { caseId: kase.id, debtorId: debtor.id }, select: { id: true },
    });

    return {
      tenantId: tenant.id, slug, clientId: client.id, otherClientId: otherClient.id,
      caseId: kase.id, caseClientId: caseClient.id, debtorId: debtor.id, actors,
      foreignTenantId: foreign.id, foreignSlug, foreignClientId: foreignClient.id,
    };
  }, { timeout: Number(process.env.I3_SETUP_TX_TIMEOUT_MS || 30000), maxWait: 10000 });
}


/**
 * H4-06/07/08 ON KOSULU — finansal beyan zinciri.
 *
 * Surum URUNUN KENDI YOLUNDAN uretilir:
 *   Collection → CollectionDisposition (DISTRIBUTION_APPROVED) → HTTP `POST
 *   /collection-dispositions/:id/post` → POSTED → HTTP `POST
 *   /collection-dispositions/:id/financial-disclosure` → DRAFT surum.
 *
 * `snapshotHash` / `sourceFingerprint` ELLE YAZILMAZ: urunun dogruladigi degeri taklit etmek,
 * uyusmazlikta YANLIS `STALE_SNAPSHOT` bulgusu uretirdi. Kurulum yalniz zincirin GIRDI
 * kayitlarini yazar; surumu urun uretir.
 *
 * Sema kaynagi: `f04-live-acceptance-r01/scripts/f04-01-setup.js` (kod DEVRALINMAZ — o paketin
 * bilinen kusurlu yurutme yoluna GIRILMEZ; yalniz gereken kayit sekli buradan okunmustur).
 */
async function setupDisclosureChain(prisma, st, runId) {
  return prisma.$transaction(async (tx) => {
    const collection = await tx.collection.create({
      data: {
        tenantId: st.tenantId, caseId: st.caseId, amount: '100.00', type: 'TAHSILAT',
        date: new Date(), idempotencyKey: `i3-col-${runId}`, status: 'CONFIRMED',
      },
      select: { id: true },
    });
    const expense = await tx.expenseRequest.create({
      data: {
        tenantId: st.tenantId, caseId: st.caseId, clientId: st.clientId,
        totalAmount: '40.00', paidTotal: '0.00', currency: 'TRY',
        status: 'SENT', expenseApprovalStatus: 'APPROVED', createdById: st.actors.elev1.id,
      },
      select: { id: true },
    });
    const approval = await tx.officeApprovalRequest.create({
      data: {
        tenantId: st.tenantId, actionCode: 'COLLECTION_DISPOSITION_POST',
        targetType: 'COLLECTION_DISPOSITION', targetRef: 'pending',
        requesterUserId: st.actors.elev1.id, approverUserId: st.actors.elev2.id,
        status: 'APPROVED', decidedAt: new Date(), savedIntent: {}, payloadHash: `i3-${runId}`,
      },
      select: { id: true },
    });
    const disposition = await tx.collectionDisposition.create({
      data: {
        tenantId: st.tenantId, caseId: st.caseId, collectionId: collection.id,
        beneficiaryScope: 'SINGLE_CASE_CLIENT', caseClientId: st.caseClientId,
        status: 'DISTRIBUTION_APPROVED', totalAmount: '100.00', currency: 'TRY',
        approvalRequestId: approval.id, approvedById: st.actors.elev2.id,
        // Uzlastirma kurali (client-financial-disclosure-canonical.ts:202-223):
        // satir toplami = totalCollected VE TAM BIR `CLIENT_PAYABLE` satiri olmali.
        lines: {
          create: [
            { type: 'CLIENT_PAYABLE', amount: '60.00', caseClientId: st.caseClientId },
            {
              type: 'CLIENT_EXPENSE_REIMBURSEMENT', amount: '40.00',
              expenseRequestId: expense.id, caseClientId: st.caseClientId,
            },
          ],
        },
      },
      select: { id: true },
    });
    return { collectionId: collection.id, dispositionId: disposition.id };
  }, { timeout: Number(process.env.I3_SETUP_TX_TIMEOUT_MS || 30000), maxWait: 10000 });
}

/**
 * AKTARIMIN GERCEK HEDEFLERI — sayim/kimlik degil, KORUNMASI GEREKEN ALANLAR.
 *
 * `promote-address` kanonik hedefi **`DebtorAddress`**'tir
 * (`client-intake-promotion.service.ts:280` → `promotedRefType: 'DebtorAddress'`),
 * `promote-soft` ise `ClientIntelStatement`. Aktarim audit'i
 * `action='CLIENT_INTAKE_PROMOTE_ADDRESS'`, `entityType='CLIENT_INTAKE_FIELD'` ile yazilir ve
 * YALNIZ gercek promote'ta (`created=true`) uretilir — DUPLICATE dalinda kanonik yazma da
 * audit de YOKTUR.
 */
async function capturePromotionTargets(prisma, opts) {
  const { tenantId, debtorId, fieldId } = opts;
  try {
    const [debtorAddresses, intel, field, promoteAudit] = await Promise.all([
      prisma.debtorAddress.findMany({
        where: { debtorId },
        orderBy: { id: 'asc' },
      }),
      prisma.clientIntelStatement.findMany({
        where: { tenantId }, orderBy: { id: 'asc' },
      }),
      prisma.clientIntakeField.findUniqueOrThrow({
        where: { id: fieldId },
        select: {
          reviewStatus: true, promotedRefType: true, promotedRefId: true,
          promotedAt: true, promotedById: true, value: true,
        },
      }),
      prisma.auditLog.count({
        where: { entityType: 'CLIENT_INTAKE_FIELD', entityId: fieldId },
      }),
    ]);
    return {
      error: null,
      // Alan duzeyinde: yalniz kimlik degil, korunmasi gereken ICERIK de karsilastirilir.
      debtorAddressJson: JSON.stringify(debtorAddresses.map((a) => ({
        id: a.id, street: a.street, city: a.city, district: a.district,
        source: a.source, isActive: a.isActive,
      }))),
      debtorAddressCount: debtorAddresses.length,
      intelJson: JSON.stringify(intel.map((i) => ({ id: i.id, category: i.category, value: i.value }))),
      intelCount: intel.length,
      fieldJson: JSON.stringify(field),
      field,
      promoteAuditCount: promoteAudit,
    };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}

/** Iki hedef fotografini karsilastirir; farklari alan adiyla listeler. */
function diffPromotionTargets(a, b) {
  const d = [];
  if (a.debtorAddressJson !== b.debtorAddressJson) {
    d.push(`DebtorAddress icerik~ (${a.debtorAddressCount}→${b.debtorAddressCount})`);
  }
  if (a.intelJson !== b.intelJson) d.push(`ClientIntelStatement icerik~ (${a.intelCount}→${b.intelCount})`);
  if (a.fieldJson !== b.fieldJson) d.push('intake alani~');
  if (a.promoteAuditCount !== b.promoteAuditCount) {
    d.push(`aktarim audit~ (${a.promoteAuditCount}→${b.promoteAuditCount})`);
  }
  return d;
}

// =========================================================================================
// KARAR FONKSIYONLARI — TEK KAYNAK
//
// Olcut modulleri VE negatif kontroller AYNI fonksiyonlari kullanir. Negatif kontrolde
// kopyasi yeniden yazilirsa, gercek kapi bozuldugunda test YINE GECER (kopya bozulmadigi
// icin) — bu, testin kendi kendini onaylamasidir. Bu yuzden karar mantigi BURADA tanimlanir
// ve her iki taraf da `L.decide.*` uzerinden tuketir.
// =========================================================================================
const decide = {
  /** Yetki reddi SADECE 403'tur; genel 500 "reddedildi" SAYILMAZ. */
  isDenied(r) {
    return !!r && r.indeterminate !== true && r.status === 403;
  },
  /** Verilen yanitlardan herhangi biri BELIRSIZ mi? (belirsizlik PASS uretemez) */
  anyIndeterminate(...rs) {
    return rs.some((r) => r && r.indeterminate === true);
  },
  /**
   * Tekrar (idempotency) sozlesmesi: urun "Alan zaten promote edilmis" icin **400** doner.
   * 500 / 409 / belirsiz KABUL EDILMEZ.
   */
  acceptsRepeatContract(r) {
    return !!r && r.indeterminate !== true && r.status === 400;
  },
  /**
   * Gonderim kapisi: yakalayici yoksa, bildirilmemisse VEYA tasima bagi dogrulanmamissa
   * gonderime GECILMEZ. `true` = engelle.
   */
  blocksSending(sink, transportBound) {
    return !sink || sink.available !== true || transportBound !== true;
  },
  /**
   * Hata sozlesmesi TAM eslesme: beklenen kod, gozlenen kodun KENDISI olmali.
   * Alternatif ("su VEYA bu") kabul edilmez.
   */
  matchesExactCode(r, expectedCode) {
    if (!r || r.indeterminate === true) return false;
    const b = r.body || {};
    const code = b.code || b.reasonCode
      || (b.message && (b.message.code || b.message.reasonCode)) || null;
    return code === expectedCode;
  },
};

module.exports = {
  AH, AH_DIR, VERDICT, Results,
  captureState, safeCapture, safeCount, diffState, unchanged,
  setupI3, setupDisclosureChain, ACTORS,
  capturePromotionTargets, diffPromotionTargets, decide,
};
