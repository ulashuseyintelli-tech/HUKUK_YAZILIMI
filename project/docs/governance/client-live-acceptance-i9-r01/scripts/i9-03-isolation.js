/*
 * CLIENT İ9 — ADIM 3 (KAPANIŞ): KOMŞU TENANT İZOLASYON ÖZETİNİN YENİDEN ÖLÇÜMÜ
 *
 * Kurulumda (i9-01) alınan `isolationBaseline` — `ah-lib.isolationFingerprint`: komşu tenant
 * başına Client ve User SAYISI → sıralı satırların sha256 özeti — kapanışta AYNI fonksiyonla,
 * kendi tenant'ımız HARİÇ yeniden ölçülür ve karşılaştırılır. Salt-okumadır.
 *
 * KAPSAM SINIRI (açıkça): özet yalnız SAYILARI kapsar; komşu satırlardaki GÜNCELLEMELERİ
 * (ör. Office.lastGreetingRunAt) görmez. Tenant bazlı satırlar kurulumda saklanmadığı için fark
 * TOPLAM düzeyinde (tenant / client / user) raporlanır.
 *
 * KARAR: özet eşitse "sayı düzeyinde izolasyon korundu". Farklıysa izolasyon PASS VERİLMEZ;
 * canlıda eşzamanlı gerçek kullanıcı etkinliği de fark üretebilir — bunun ayrıştırması
 * owner'ındır, betik "zararsız" DEMEZ.
 *
 * Çıkış: 0 = özet eşit · 5 = FARK · 3 = ölçülemedi (durum/taban yok ya da DB okunamadı)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../../client-live-acceptance-i1b-r01/scripts/cl-lib');
const AH = require('../../client-acceptance-harness-r01/scripts/ah-lib');

const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'i9-state.json');

function emit(obj, code) {
  console.log(JSON.stringify({ record: 'CL-I9-ISOLATION', ...obj }, null, 1));
  process.exitCode = code;
}

(async () => {
  const env = L.assertEnvironment(); // G-0 — salt-okuma olsa da hedef doğrulanır
  let st = null;
  try { st = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { st = null; }
  const base = st && st.isolationBaseline;
  if (!st || !base || !base.digest || !st.tenantId) {
    emit({ environment: env.environment, verdict: 'OLCULEMEDI', why: 'durum dosyasi veya kurulum tabani YOK' }, 3);
    return;
  }
  const prisma = L.loadPrisma();
  try {
    const now = await AH.isolationFingerprint(prisma, st.tenantId);
    const equal = now.digest === base.digest;
    const delta = {
      tenants: now.tenantsObserved - base.tenantsObserved,
      clients: now.clientTotal - base.clientTotal,
      users: now.userTotal - base.userTotal,
    };
    const verdict = equal ? 'OZET ESIT - sayi duzeyinde izolasyon KORUNDU' : 'FARK VAR - izolasyon PASS VERILMEZ';
    console.log(`[IZOLASYON] kurulum ${base.digest} (tenant ${base.tenantsObserved} · client ${base.clientTotal} · user ${base.userTotal})`);
    console.log(`[IZOLASYON] kapanis ${now.digest} (tenant ${now.tenantsObserved} · client ${now.clientTotal} · user ${now.userTotal})`);
    console.log(`[IZOLASYON] ${verdict}`);
    emit({
      runId: st.runId, environment: env.environment,
      baseline: { digest: base.digest, tenants: base.tenantsObserved, clients: base.clientTotal, users: base.userTotal },
      closure: { digest: now.digest, tenants: now.tenantsObserved, clients: now.clientTotal, users: now.userTotal },
      equal, delta, coverage: 'komsu tenant basina Client+User SAYISI; guncellemeler KAPSAM DISI', verdict,
    }, equal ? 0 : 5);
  } catch (e) {
    emit({ environment: env.environment, verdict: 'OLCULEMEDI', why: `DB okunamadi: ${e && e.message}` }, 3);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('IZOLASYON HATASI:', e && e.message ? e.message : e); process.exitCode = 3; });
