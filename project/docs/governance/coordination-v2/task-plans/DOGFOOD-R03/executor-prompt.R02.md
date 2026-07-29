# GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R03 — revision 2 executor prompt

Tek dosya degistir:

```text
project/scripts/orchestration-v2/delivery/delivery.test.cjs
```

Baska hicbir dosyaya dokunma. Governance artefaktlari, runtime, finalizer,
orchestrator ve service kodu bu task'in disindadir. Mevcut DV57 korunacak;
revision 2 onun uretici-kapi bagini committed successor authority yuzeyine
genisletir.

## Yapilacak is

`DV58` ekle: committed R03 predecessor plan declaration, semantic authority,
task grant successor pin'i ve successor gate'in okudugu kimlik/digest yuzeyi
birebir eslesmelidir.

Test su production artefaktlarini repository'den okumali:

```text
project/docs/governance/coordination-v2/task-plans/DOGFOOD-R03/plan.v4.json
project/docs/governance/coordination-v2/task-plans/DOGFOOD-R03/successor.plan.v4.json
project/docs/governance/coordination-v2/task-plans/DOGFOOD-R03/grant.v4.json
project/docs/governance/coordination-v2/task-plans/DOGFOOD-R03/semantic-authority.R02.md
```

1. Predecessor plan `DECLARED_SUCCESSOR` demeli.
2. Successor plan task kimligi
   `GOV-COORD-DTV-DOGFOOD-SUCCESSOR-R03` olmali ve predecessor listesi yalniz
   `GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R03` icermeli.
3. Semantic authority ayni successor kimligini plain text olarak tasimali.
4. Grant'teki successor pin'i `authority.specDigests(successorPlan)` ile
   hesaplanan taskSpec, intent, boundary, required-tests ve delivery-contract
   digest'lerinin tamamiyla eslesmeli.
5. DV57'deki gibi gercek `evidence.build` ciktisini
   `postMerge.deliveryRecordFrom` ile production stamping'den gecir; bunu
   `CLOSED` predecessor record'una koy ve `successor.evaluate` cagrisinin
   successor planin predecessor listesiyle `eligible === true` verdigini kanitla.
6. Negatif tarafta grant successor pin'inin task kimligini baska bir kimlikle
   degistir ve dort-yuzey parity assertion'inin reddettigini kanitla. Gate veya
   digest kontrolunu gevsetme.

## Kabul

```text
node --test scripts/orchestration-v2/delivery/delivery.test.cjs
```

`project` dizininden PASS olmalidir. DV58 gercek production artefaktlarini ve
gercek gate'i kullanmali; elle kurulmus alternatif plan/grant fixture'i yeterli
degildir.

## Yasaklar

- DV57'yi silme, gevsetme veya yeniden adlandirma.
- `assert.ok(true)`, wildcard, sabit alt sinir veya yalniz string-search testi
  yazma.
- Governance artefaktlarini, grant'i, finalizer'i, gate'i veya ureticiyi
  degistirme.
- Successor'u dispatch etme; bu task yalniz eligibility kanitlar.
