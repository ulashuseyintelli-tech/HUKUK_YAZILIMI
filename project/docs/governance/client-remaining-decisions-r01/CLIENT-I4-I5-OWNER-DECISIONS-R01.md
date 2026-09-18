# CLIENT — İ4 ve İ5 OWNER KARAR KAYDI (R01)

**Tarih:** 2026-09-18 · **Karar veren:** owner (doğrudan owner mesajı) · **Kaydeden:** CLIENT
**Kanonik plan:** `CLIENT-BUTUNSEL-CANLI-TESLIM-PLANI-R02` (owner talimatıyla repo dışında tutulur; bu kayıt kararların repo içindeki tek dayanağıdır)

Bu belge **yalnız iki kararı** kaydeder. Hiçbir kabulü vermez, hiçbir canlı işlem yapmaz ve hizmet kabul sayacını değiştirmez.

---

## 1. İ4 — H7 portal kapsam kararı: **DAHİL**

**Owner kararı:** H7 portal kabulü teslim kapsamına alınır, **İ16** kanonik plana (kritik yola) eklenir.

**Karar önündeki bilgi (karar gerekçesi değil, bağlam):**
- Taahhüt: R02 §2 H7 "müvekkilin kendi yüzeyine erişimi". Durum: **KABUL YOK**.
- İ2 ölçütleri hazır: `client-acceptance-criteria-i2-r01/CLIENT-ACCEPTANCE-CRITERIA-I2-R01.md` §7 H7-00…H7-05.
- Portal kodda koşulsuz açık, feature flag yok (`app.module.ts` `PortalModule`). Erişimi yalnız veri belirler: `ClientPortalUser.isActive` ve `Client.hasPortalAccess`.
- Canlı salt-okuma ölçümü (2026-09-18): 3 portal kullanıcısı (`telli-hukuk`), aktif 0, son giriş 2026-06-17.

**Owner'ın İ16 kapsamına eklediği kural:**
- **Kapsam:** personel **belge inceleme** uçları (`portal.controller.ts` bekleyen belge listesi, onay, ret) ve **mesajlaşma** uçları (personel ↔ müvekkil) kabul ölçütlerine bağlanır.
- **Politika:** ölçüt **mevcut rol/tenant politikasına** göre yazılır. Personele yönelik her işleme kendiliğinden **onaylayıcı (`isApproverEligible`) şartı EKLENMEZ**.
- **Kod değişikliği sınırı:** yalnız **somut** bir yetki ya da izolasyon kusuru bulunursa, dar bir patch ile düzeltilir. Örnek: tenant/müvekkil kapsamı dışına erişim ya da yanlış aktörün kabulü.

**Sonuç:** İ16 koşullu kümeden kritik yola geçer. İ16 **tamamlanmış sayılmaz**; kapanışı kendi kabul kanıtına bağlıdır.

---

## 2. İ5 — F04 kalan yedi senaryonun kanıt yöntemi: **(b)**

**Owner kararı:** (b). Yedi senaryo (**KABUL-A, 1, 2, 3, 4, B, D**) şöyle kanıtlanır:

1. **Test kanıtı.** `f04-posting-reversal-race.db-gated.integration.spec.ts` şu koşullarda çalıştırılır:
   - **canlı R24'ün doğrulanmış kaynak SHA'sı:** `006c4dd2` (R24 kaydı #2704 @ `fe55fb41`: kaynak `006c4dd2` → canlı dist `87712E0E…5453`);
   - **ayrı** (disposable) bir PostgreSQL test ortamı.
   - Eski RELEASE20 (`08ce8e25`) PASS kaydı **yeterli sayılmaz**.
2. **Canlı kanıt.** Canlıda **yalnız** mevcut kapsamın **salt-okuma tutarlılık taraması** yapılır. Canlıda yazma, kilit tutma ya da yarış kurma yoktur.
3. **Ayrı kayıt.** Test sonucu, canlı tarama sonucu ve kanıt sınırları **ayrı ayrı** kaydedilir.

**Kanıt sınırları (kayıtta korunacak lafız):**
- Spec, sıralamayı `jest.spyOn` bariyeriyle belirlenimci kurar. Serbest yarış üretmez.
- KABUL-A ve KABUL-D gerçek kilit beklemesi ölçer. KABUL-1, 2, 3, 4 ve B sıralı ya da hata enjeksiyonludur.
- Canlı taramada "ihlal izi bulunmadı" sonucu **canlı eşzamanlılık ispatı değildir**. Yalnız kalıcı sonuç durumunun tutarlı olduğunu gösterir.
- Sonuçlar **"canlı yarış testi PASS" olarak sunulmaz**.
- **KABUL-C** yedinin dışındadır. Kanıtı **dolaylıdır**: spec, PostgreSQL kilit semantiğini ham SQL ile ölçer, posting servisini ölçmez. Canlıda kilit modu davranışı ölçülmez.

**Sonuç:** **İ5a AÇILMAZ.** İ5a yalnız İ5=(a) seçilirse ve kilitli senaryo canlıda kurulursa açılacaktı. Kararın uygulanması **İ15**'in parçasıdır (R02 §3.3: "KABUL-5 + İ5 kararının uygulanması").

---

## 3. Sayaç — kanonik sayım kuralına göre

R02 §3.1 kapanış ölçütleri: İ4 "karar kayıtlı", İ5 "yöntem seçildi". Bu kayıt main'e alındığında ikisi de kapanır.

| Küme | Önce | Sonra |
|---|---|---|
| **Kritik yol — kesin** | 17 | **18** (+İ16; R02 §9 "İ4 = DAHİL → İ16 kritik yola geçer → 18 kesin") |
| **Tamamlanan** | 11 (İ1a · İ1b · İ2 · İ3 · İ5b · İ6 · İ7 · İ8 · İ9 · İ10 · İ11) | **13** (+İ4 · +İ5) |
| **Kalan** | 6 | **5**: İ12 · İ13 · İ14 · İ15 · **İ16** |
| **Koşullu** | 2 (İ16 · İ5a) | **0** (İ16 kritik yola geçti; İ5a İ5=(b) ile açılmaz) |
| **Kritik yol dışı** | 1 (İ17) | 1 (İ17) — değişmez |
| **Hizmet kabulü (ayrı sayaç)** | 0/8 tam | **0/8 tam — DEĞİŞMEZ** (owner kabulü olmadan değişmez) |

**Sıra (R02 §5, değişmedi):** İ12 → İ13 → İ14 → İ15. İ16'nın öncülleri İ3 ve İ7'dir ve ikisi de tamamlandı. İ16 hazırlığı, İ12 kapandıktan sonra toplu sıraya uygun olarak yürür.

**Durum notu (2026-09-18):** İ12 **AÇIK**. Canlı kabul, owner Blok 1 sonucunu bekliyor. Bu kayıt İ12'yi etkilemez.
