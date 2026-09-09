/*
 * A-07 OWNER PAKETI — BAGIMLILIK COZUCU
 *
 * NEDEN VAR (olculdu, tahmin degil): paket kanonik kokten calistirilacak ama
 * `C:/Development/HUKUK_YAZILIMI/project/apps/api/node_modules/` altinda **@prisma/client ve
 * bcrypt YOKTU**. Sabit gomulu tek yol kullanilsaydi paket owner'in makinesinde "modul yok"
 * ile duserdi — hem de bayrak acildiktan SONRA degil, neyse ki once; ama yine de kosum
 * bosa giderdi. Bu cozucu adaylari SIRAYLA dener ve HANGISINI kullandigini YAZDIRIR.
 *
 * Adaylar (once ortam degiskeni, sonra en yakindan en uzaga):
 *   1) OW_PRISMA_ROOT / A07_BCRYPT_ROOT  (acik override)
 *   2) paketin kendi agaci        <repo>/project/apps/api/node_modules/<pkg>
 *   3) CANLI surum agaci          HY_W4_RELEASE21/project/apps/api/node_modules/<pkg>
 *      (YALNIZ OKUMA — surum agacina hicbir sey yazilmaz)
 *   4) bilinen calisma agaclari   HY_WT/OFF_A02/...
 *
 * SEMA UYUMU: Prisma client hangi agactan gelirse gelsin `approvalRequestId`/`approvalAttempt`
 * alanlarini TANIMALIDIR. `assertPrismaKnowsDeltaA()` bunu ONCEDEN sinar; tanimiyorsa
 * kanit sorgusu sessizce bos donerdi — bu yuzden fail-closed.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
// HERE = <project>/docs/governance/office-delivery-r01/a07-owner-pack  -> DORT seviye yukari.
// (Ilk yazimda UC seviye yazilmisti ve `<project>/docs/apps/...` gibi var olmayan bir yol
//  uretiyordu; cozucu 2. adaya dustugu icin SESSIZCE calisiyordu — olculup duzeltildi.)
const REPO_PROJECT = path.resolve(HERE, '..', '..', '..', '..'); // .../project

function candidates(pkg) {
  const rels = [
    path.join(REPO_PROJECT, 'apps', 'api', 'node_modules', pkg),
    path.join('C:', 'Development', 'HUKUK_YAZILIMI', 'HY_W4_RELEASE21', 'project', 'apps', 'api', 'node_modules', pkg),
    path.join('C:', 'Development', 'HY_WT', 'OFF_A02', 'project', 'apps', 'api', 'node_modules', pkg),
  ];
  return rels;
}

function resolvePkg(pkg, envVar) {
  const override = process.env[envVar];
  const list = override ? [override, ...candidates(pkg)] : candidates(pkg);
  for (const c of list) {
    try { if (fs.existsSync(c)) return c; } catch (e) { /* sonraki aday */ }
  }
  return null;
}

/** Cozer, ortama yazar ve KULLANILAN YOLU raporlar. Bulunamazsa fail-closed hata. */
function resolveAll({ needBcrypt = false } = {}) {
  const prismaRoot = resolvePkg('@prisma/client', 'OW_PRISMA_ROOT');
  if (!prismaRoot) {
    throw new Error(
      '@prisma/client HICBIR ADAYDA BULUNAMADI. Denenen yollar:\n  '
      + candidates('@prisma/client').join('\n  ')
      + '\n  Cozum: OW_PRISMA_ROOT ile acik yol verin.',
    );
  }
  process.env.OW_PRISMA_ROOT = prismaRoot;

  let bcryptRoot = null;
  if (needBcrypt) {
    bcryptRoot = resolvePkg('bcrypt', 'A07_BCRYPT_ROOT');
    if (!bcryptRoot) {
      throw new Error(
        'bcrypt HICBIR ADAYDA BULUNAMADI. Denenen yollar:\n  '
        + candidates('bcrypt').join('\n  ')
        + '\n  Cozum: A07_BCRYPT_ROOT ile acik yol verin.',
      );
    }
  }
  return { prismaRoot, bcryptRoot };
}

/**
 * DELTA-A alanlari client'ta VAR MI? Yoksa kanit sorgusu SESSIZCE bos doner ve A-07
 * "olculemedi" olur — bu yuzden ONCEDEN sinanir. Sorgu DB'ye gitmez (validation asamasinda
 * duser), yani DB kapaliyken de anlamli bir cevap verir.
 */
async function assertPrismaKnowsDeltaA(prisma) {
  try {
    await prisma.caseStatusHistory.findFirst({
      where: { approvalRequestId: 'A07-DELTA-A-SEMA-SINAMASI', approvalAttempt: 0 },
      select: { id: true },
    });
    return { ok: true, detail: 'client approvalRequestId/approvalAttempt alanlarini TANIYOR' };
  } catch (e) {
    const msg = (e && e.message) || String(e);
    // Baglanti hatasi = sema sorunu DEGIL; alan bilinmiyor hatasindan AYIRT EDILIR.
    if (/Unknown (arg|field)|Unknown argument/i.test(msg)) {
      return { ok: false, detail: `client DELTA-A alanlarini TANIMIYOR: ${msg.split('\n')[0]}` };
    }
    return { ok: true, detail: `sema sinamasi baglanti nedeniyle kesin degil (${msg.split('\n')[0].slice(0, 80)})` };
  }
}

module.exports = { resolveAll, resolvePkg, assertPrismaKnowsDeltaA, candidates };
