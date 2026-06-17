# Party Registry — Design Review

> **Bu doküman = "tasarıma NASIL karar verdik" (eleştiri + risk + faz planı + RFA bağlantıları).**
> Ana tasarım ayrı: `party-registry-design.md` ("tasarım NEDİR"). Bu review onu DEĞİŞTİRMEZ.
> **Durum:** Kod YOK · Migration YOK · PR YOK (yalnız doküman). İnceleme kaydı.
> **Tarih:** 2026-06-17 (Reliability Audit B-hattı + RFA-010 kapandıktan sonra).

---

## 1. Executive summary
`party-registry-design.md` olgun ve uygulanabilir bir tasarım: **tek dış-taraf kimlik kartı (Party) +
çok dosya rolü (CaseParty) + ortak istihbarat havuzu**, 6 fazlı strangler geçişle. Tasarım, az önce
bitirdiğimiz Reliability Audit derslerini (manuel onaylı merge, sessiz merge yok, geri-alınabilir merge,
pairKey suppress) **zaten içselleştirmiş** — IR-0 kararlarımızla birebir örtüşüyor.

**Net sonuç: tasarım sağlam; ama ŞİMDİ kodlanacak iş DEĞİL.** Doğru sıra: bu review'i kilitle →
açık ürün/hukuk kararlarını netleştir → gerçek veri akışı + istihbarat yüzeyi stabilize olsun →
**sonra Faz 0**. Yanlış Party modeli, duplicate bug'dan daha büyük hasar verir.

## 2. Existing design assessment
- **GREENFIELD değil — konsolidasyon:** 5 dış-taraf kimliği (Client/Debtor/ThirdParty/EstateHeir/
  PublicInstitution) tek Party'ye birleşir; alt-ağaçlar (adres/telefon/banka/istihbarat/varlık/belge)
  Party'ye taşınır; junction'lar CaseParty'ye evrilir.
- **Çekirdek ilke:** Önce tekil KİMLİK → sonra dosya ROLÜ → sonra evrak/adres/varlık/istihbarat.
  "Kayıt çoğalmaz; yalnız ROL çoğalır."
- **PartyMatch (§4b):** insan-döngüde eşleştirme; exact kimlik→auto-link, fuzzy→manuel review,
  çelişkili kimlik→BLOCK; merge audit'li + geri-alınabilir (undoPayload, reversibleUntil, sonrası SPLIT);
  REJECTED+pairKey = kalıcı suppress.
- **Strangler geçiş (§6):** Faz 0 additive şema → Faz 6 eski modelleri kaldır. Big-bang yasak,
  dual-write + characterization test zorunlu.

## 3. Decisions to preserve (kritik DOĞRU kararlar)
- **D-1 Party≠Staff:** dış taraf=Party; iç avukat/personel=User+AttorneyProfile+CaseStaff; karşı taraf
  vekili=`CaseParty.role=ATTORNEY`. İç personel ASLA Party'ye gömülmez.
- **D-2 party-level vs case-specific:** `PartyAsset`=kişinin bilinen varlığı (istihbarat) vs
  `CaseAssetAttachment`=bu dosyada haciz (işlem). serviceStatus/tebligat/haciz **dosyaya özgü** kalır.
  Bu ayrım cross-case istihbaratın kilidi.
- **D-3 tenant-scope** (Party tenant içinde tekil) · **D-4 NULL-kimlik birinci sınıf merge** (manuel) ·
  **D-5 admin-only "yine de yeni kayıt"**.
- **§4b geri-alınabilir merge + pairKey suppress** (yanlış merge > duplicate tehlikesi ilkesi).

## 4. Risks / missing decisions
- **IR-0 çift-tasarım riski:** `PartyMatchCandidate` ≈ `DebtorIdentityCandidate` (IR-0). Ayrı inşa =
  atılacak iş. → birleştir (bkz. §7).
- **EstateHeir** (mirasçı): Party-of-Party mı `PartyRelation(HEIR_OF)` mı? AÇIK (hukuki).
- **PublicInstitution** (DETSİS): tam Party mı hafif referans mı? AÇIK.
- **Asset "geri-promote"** (bu dosyada görülen varlık → kişi kartına bilgi olarak yüksel): tasarlanmamış.
- **Borçlu alt-ağacı** (DebtorIntelligence/serviceStatus/pre-haciz, son ~20 PR) taşımada
  destabilize olabilir → characterization test + dual-write.
- **Zamanlama:** istihbarat yüzeyi stabilize + gerçek veri akmadan Faz 4'e girilmemeli.

## 5. Party scope: included vs excluded
**INCLUDED (Party = dış taraf kimliği):** Client · Debtor · ThirdParty · EstateHeir · PublicInstitution.
**EXCLUDED (iç/personel/otorite evreni — AYRI):** User · StaffMember · Lawyer(iç) · CaseStaff · CaseLawyer.
> **NET KARAR: Staff/Lawyer/User Party kapsamına ALINMAYACAK. Party SADECE dış taraf kimliği içindir.**
İlişki modeli: Party = kimlik; `CaseParty.role` (CREDITOR/DEBTOR/GUARANTOR/THIRD_PARTY/ATTORNEY) = dosyadaki rol.
Aynı Party farklı dosyalarda farklı rolde olabilir (kayıt çoğalmaz, rol çoğalır). *(Açık not: aynı DOSYADA
çift rol = çıkar-çatışması → flag gerekebilir, §11.)*

## 6. Relationship to Reliability Audit
Reliability Audit (10 PR: RFA-016/017/005/006/008/013/007/010 + ledger + doc) Party'nin **doğal
precursor'ıydı**:
- Çözdüğümüz duplicate/reactivate/dedup guard'ları (Client/Debtor/ThirdParty/Lookup/Portal/adres)
  bugün mevcut tabloları **temiz tutuyor** → Party **Faz 1 backfill'inde dedupe edilecek duplicate
  sayısını azaltıyor** = backfill'i de-riske ediyor.
- RFA-006 adres dedup mantığı (normalize+hash) Faz 2'de `PartyAddress`'e taşınır.
- Audit'in süreç disiplini (ledger, A/B/C güven, canlı DB doğrulama, küçük PR) Party fazlarında da
  aynen uygulanacak.

## 7. Relationship to IR-0
IR-0 (`debtor-identity-resolution-ir0.md`, PR #140) = **PartyMatch'in debtor-scoped alt kümesi.**
`DebtorIdentityCandidate` (state pending/same/different/ignored + signals + no-auto-merge) ≈
`PartyMatchCandidate` (status PENDING/ACCEPTED/REJECTED/IGNORED + matchReasons + pairKey suppress).
> **NET KARAR: IR-0 STANDALONE implement EDİLMEYECEK. PartyMatch (Faz 5) içine GÖMÜLECEK.**
IR-0 dokümanı, Party gelene kadar **debtor kimlik kararlarının referansı** olarak kalır; uygulama
Party PartyMatch ile tek motorda olur.

## 8. RFA mapping by Party phase
| Faz | İş | Kapanan RFA / DEAD |
|---|---|---|
| Faz 0 | Party+PartyIdentifier+CaseParty additive şema (okuma değişmez) | — (migration) |
| Faz 1 | Backfill 5 kimlik→Party (TCKN/VKN dedupe, NULL→ayrı), dual-write | mevcut dedup guard'lar backfill'i temizler |
| Faz 2 | Alt-ağaçlar→PartyAddress/Phone/Bank/Intelligence/Asset/Document | **DEAD-2** (PartyAsset) · **EstateHeir dedup** · RFA-006 addressHash mantığı · **RFA-015** (PartyIntelligence idempotency) |
| Faz 3 | Junction→CaseParty | **RFA-009** (Debtor soft-delete = Party lifecycle) |
| Faz 4 | Okuyucular→Party API (interest/collection/tebligat/UYAP/reports) | — (en hassas; characterization) |
| Faz 5 | PartyMatch + merge workflow + UI dedupe | **IR-0** (DebtorIdentityCandidate ⊂ PartyMatchCandidate) |
| Faz 6 | Eski modelleri @deprecated→kaldır | — |
> **NET KARAR: RFA-009 (Debtor soft-delete) STANDALONE yapılmayacak; Party lifecycle (Faz 1/3)
> içinde çözülecek.** Düşük RFA'lar (RFA-011/012/014) Party'den bağımsız küçük temizlik olarak
> istenirse ayrıca yapılabilir.

## 9. Migration risks
- Dual-write tutarsızlığı (Faz 1-3): eski tablo ≠ yeni tablo riski → her yazımda doğrulama.
- Borçlu alt-ağacı destabilizasyonu (Faz 2) → characterization test zorunlu.
- NULL-kimlik backfill'de yanlış-merge → Faz 1'de **merge YOK** (ayrı party); merge Faz 5'te manuel.
- Okuyucu taşımada hesap/tebligat regresyonu (Faz 4) → her okuyucu **ayrı PR + characterization**.

## 10. Test strategy
Her faz: (1) characterization test (mevcut davranışı dondur) → (2) additive değişiklik → (3) dual-write
doğrulama (eski=yeni) → (4) okuyucu başına regresyon. PartyMatch = unit (karar matrisi: exact/fuzzy/
çelişki) + canlı DB (merge/undo/suppress idempotency). Audit'teki "unit + canlı DB-count e2e" deseni korunur.

## 11. Open product / legal decisions
1. **EstateHeir** = `PartyRelation(HEIR_OF)` mı, alt-Party mı? (hukuki — mirasçı ayrı kişi + tereke ilişkisi)
2. **PublicInstitution** = tam Party mı hafif referans mı?
3. **Aynı dosyada Party çift rolü** (alacaklı+borçlu) = çıkar-çatışması flag'i gerekli mi?
4. **Merge geri-alma penceresi** (`reversibleUntil`) politikası.
5. **Faz 0 başlama koşulu:** gerçek veri akışı + istihbarat yüzeyi stabilizasyonu (aşağıya bak).

## 12. Explicit non-goals
- İç personeli (Lawyer/Staff/User) Party'ye gömme.
- Big-bang migration.
- Fuzzy eşleşmede otomatik merge.
- IR-0'ı Party'den bağımsız kodlama.
- `EnforcementAction`/serviceStatus'u Party'ye indirme (case-specific kalır).
- Gerçek veri akmadan Faz 1+ başlatma.

## 13. Recommendation: do not implement yet
> **NET KARAR: Party Registry ŞİMDİ KODLANMAYACAK.**
> **Faz 0 ön-koşulu: (a) gerçek veri girişi başlamış olmalı (gerçek duplicate desenleri görülsün),
> (b) borçlu istihbarat yüzeyi stabilize + characterization test kapsaması olmalı, (c) §11 açık
> ürün/hukuk kararları netleşmeli, (d) Av. sign-off.**
> Bu koşullar oluşana kadar Party = onaylı tasarım + bu review. Acil bug'lar zaten kapandı (Reliability
> Audit 10 PR); sistem Party gelene kadar ayakta.

---
İlgili: `party-registry-design.md` (ana tasarım) · `debtor-identity-resolution-ir0.md` (IR-0) ·
`reliability-ledger.md` (RFA kayıt defteri).
