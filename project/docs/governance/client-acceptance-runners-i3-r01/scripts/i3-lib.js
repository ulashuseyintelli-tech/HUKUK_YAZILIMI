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
  const [addresses, contacts, client, consents, audits] = await Promise.all([
    prisma.clientAddress.findMany({
      where: { clientId },
      orderBy: { id: 'asc' },
    }),
    prisma.clientContact.findMany({ where: { clientId }, orderBy: { id: 'asc' } }),
    prisma.client.findUnique({ where: { id: clientId } }),
    prisma.clientConsent.findMany({ where: { clientId }, orderBy: { id: 'asc' } }).catch(() => null),
    prisma.auditLog.count({ where: { entityId: clientId } }).catch(() => null),
  ]);
  const norm = (rows) => (rows || []).map((r) => JSON.stringify(r, Object.keys(r).sort()));
  return {
    addressById: Object.fromEntries((addresses || []).map((a) => [a.id, JSON.stringify(a, Object.keys(a).sort())])),
    contactRows: norm(contacts),
    clientRow: client ? JSON.stringify(client, Object.keys(client).sort()) : null,
    consentRows: consents === null ? null : norm(consents),
    auditCount: audits,
  };
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

/** "Hiçbir kalıcı etki olmamalı" iddiasını ölçer. */
function unchanged(before, after) {
  const c = diffState(before, after);
  return { ok: c.length === 0, changes: c };
}

/**
 * İ3 aktörleri. `user` ile `elev1/2/3` AYNI role (USER) sahiptir; aralarındaki TEK fark
 * PARTNER lawyer bağıdır. Böylece elevated ayrımı rol adından DEĞİL, ürünün kendi
 * `isApproverEligible` mekanizmasından gelir (İ2 §2.0 / owner D07).
 *
 * Üç eligible aktör vardır çünkü finansal beyan zinciri ÜÇ AYRI KİŞİ ister (İ2 H4-06/H4-07).
 */
const ACTORS = [
  { tag: 'viewer', role: 'VIEWER', partner: false },
  { tag: 'user', role: 'USER', partner: false },
  // `admin`: ADMIN rolu VAR, PARTNER bagi YOK. "review != promote" ayrimini kanitlar —
  // workspace authority primitive'i `ADMIN VEYA canonical elevated` kabul eder
  // (client-workspace-command-authority.ts:95-98, owner §13/11), promote ise YALNIZ
  // `isApproverEligible` (client-intake-promotion.service.ts:87-89): ADMIN yolu YOKTUR.
  { tag: 'admin', role: 'ADMIN', partner: false },
  // `reviewer`: USER rolu, PARTNER bagi YOK, ama `client.intake.review` GLOBAL ALLOW grant VAR.
  // CR-1 md.6 kaniti: bu aktor INCELEME yapabilir ama AKTARIM yapamaz; `elev1` tam tersi.
  { tag: 'reviewer', role: 'USER', partner: false, reviewGrant: true, staff: true },
  { tag: 'elev1', role: 'USER', partner: true },
  { tag: 'elev2', role: 'USER', partner: true },
  { tag: 'elev3', role: 'USER', partner: true },
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
            firstName: 'I3', lastName: 'Reviewer', staffType: 'OFIS_KATIBI',
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
        id: u.id, email: u.email, role: u.role, partner: a.partner,
        reviewGrant: !!a.reviewGrant,
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
    await tx.caseClient.create({ data: { caseId: kase.id, clientId: client.id }, select: { id: true } });

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
      caseId: kase.id, debtorId: debtor.id, actors,
      foreignTenantId: foreign.id, foreignSlug, foreignClientId: foreignClient.id,
    };
  }, { timeout: Number(process.env.I3_SETUP_TX_TIMEOUT_MS || 30000), maxWait: 10000 });
}

module.exports = { AH, AH_DIR, VERDICT, Results, captureState, diffState, unchanged, setupI3, ACTORS };
