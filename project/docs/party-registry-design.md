# Party Registry & Cross-Case Intelligence — Tasarım (PR-3, DESIGN-ONLY)

> **Ana cümle:** Tek kişi/şirket kartı, çok dosya rolü, ortak istihbarat havuzu.
> **Durum:** Tasarım taslağı — KOD YOK, migration YOK. İnceleme + onay sonrası fazlı uygulanır.
> **Kapsam dışı (bu doc):** kod, şema migration, veri taşıma. Bunlar onaylı tasarımdan SONRA, ayrı PR'lar.

## 0. Problem
Aynı gerçek kişi/şirket bugün sistemde **birden fazla kez** kayıt oluyor. Sonuç: adres bir kartta,
telefon başka kartta, araç haczi başka kartta, saha notu başka kartta → **istihbarat bölünüyor**.
Bu, "müvekkil" sorunundan ibaret değil; aynı çatlak **üç eksende** var:

| Eksen | Bugünkü tablo(lar) | Sorun |
|---|---|---|
| Müvekkil/Alacaklı | `Client` | TCKN/VKN ile tekrar kayıt; vekalet/iletişim bölünür |
| Borçlu/Üçüncü kişi | `Debtor`, `ThirdParty`, `EstateHeir`, `PublicInstitution` | aynı borçlu farklı dosyalarda farklı kayıt → adres/telefon/varlık/istihbarat bölünür |
| Avukat/Personel | `User`, `StaffMember`, `Lawyer` | (zaten ayrı; Party'ye GÖMÜLMEMELİ — aşağıya bak) |

## 1. Çekirdek ilke
```
Önce tekil KİMLİK kartı  →  sonra dosya ROLÜ  →  sonra evrak/adres/telefon/varlık/istihbarat/görev
```
Kişi/şirket bir kez kayıtlı olur. Aynı kişi bir dosyada müvekkil, başka dosyada borçlu, başka
yerde üçüncü kişi olabilir. **Kayıt çoğalmaz; yalnız ROL çoğalır.**

## 2. Bu GREENFIELD değil — KONSOLİDASYON
Yeni model çizmiyoruz; **5 parçalı kimliği birleştirip** alt-ağaçları ve junction'ları yeniden bağlıyoruz.

**Party'ye birleşecek kimlik tabloları:** `Client` · `Debtor` · `ThirdParty` · `EstateHeir` · `PublicInstitution`
**Party'ye TAŞINACAK alt-ağaçlar:** `DebtorAddress` → `PartyAddress` · `ClientContact`/telefon → `PartyPhone` · `ClientBankAccount` → `PartyBankAccount` · `DebtorIntelligence` → `PartyIntelligence` · `Asset` → `PartyAsset` (+ case eki) · `ClientPowerOfAttorney` → `PartyDocument`/POA
**Junction'a (CaseParty) evrilecek:** `CaseClient` · `CaseDebtor` · `ThirdParty`(dosya bağı)
**AYRI kalacak (personel evreni):** `User` · `StaffMember` · `Lawyer` · `CaseStaff` · `CaseLawyer`

## 3. Hedef model
### 3.1 Kimlik evreni (dış taraflar)
```
Party { id, tenantId, kind(REAL|LEGAL), displayName, birthDate?, foundingDate?, isActive, createdAt }
PartyIdentifier { id, partyId, type(TCKN|VKN|MERSIS|DETSIS|PASSPORT), value, verified }
PartyAddress  { id, partyId, type, source, verified, verifiedSource, confidence, riskFlags, ... }
PartyPhone    { id, partyId, value, type, verified, source }
PartyBankAccount { id, partyId, iban, bankName, ... }
PartyDocument { id, partyId, kind(POA|CONTRACT|...), notaryName?, dateIssued?, filePath?, ... }  # POA buraya
PartyIntelligence { id, partyId, addressId?, intelType, result, confidence, evidence, ... }      # bugünkü DebtorIntelligence
PartyAsset    { id, partyId, kind(VEHICLE|REAL_ESTATE|BANK|SALARY|...), identifier, source, lastSeenAt }  # kişinin BİLİNEN malvarlığı
PartyRelation { id, fromPartyId, toPartyId, type(GUARANTOR_OF|SHAREHOLDER_OF|SPOUSE_OF|...) }     # sonraki katman
```
### 3.2 Dosya rolleri
```
CaseParty { id, caseId, partyId, role(CREDITOR|DEBTOR|GUARANTOR|THIRD_PARTY|ATTORNEY) , serviceStatus?, serviceChannel?, ... }
CaseAssetAttachment { id, caseId, partyAssetId, status(SEIZED|LIEN|SALE|...), seizedAt, ... }     # bu DOSYADA işlem
CaseAction { id, caseId, type, ... }   # mevcut EnforcementAction'ın genel hali
```
### 3.3 İç personel evreni (AYRI)
```
User / StaffMember            # ofis kullanıcısı/personeli (mevcut)
AttorneyProfile { id, userId, barNumber, barCity }   # iç avukat kimliği (mevcut Lawyer ~ buna denk)
CaseStaff { caseId, userId, role(RESPONSIBLE_LAWYER|STAFF|FIELD_AGENT|REVIEWER) }   # mevcut, rolleri netleşir
```

## 4. Kritik tasarım kararları
- **D-1 (Party vs Staff ayrımı):** İç avukat/personel = `User`+`AttorneyProfile`+`CaseStaff`. **Karşı taraf vekili** = `Party` + `CaseParty.role=ATTORNEY`. Vekaletname = `Party`(müvekkil) → `AttorneyProfile`(iç avukat) köprüsü. İç personel ASLA Party'ye gömülmez.
- **D-2 (case-specific vs party-level):** `serviceStatus`/tebligat, haciz işlemi **dosyaya özgüdür** → `CaseParty`/`CaseAssetAttachment` üstünde kalır, Party'ye İNMEZ. `PartyAsset`=kişinin bilinen varlığı (istihbarat), `CaseAssetAttachment`=bu dosyada haczedildi mi (işlem). Bu ayrım cross-case istihbaratın kilidi.
- **D-3 (tenant scope):** Party tenant-scoped. Unique kimlik **tenant içinde**: `UNIQUE(tenantId, value) WHERE value IS NOT NULL` (PartyIdentifier başına). Cross-case istihbarat tenant İÇİNDE.
- **D-4 (NULL-kimlik = birinci sınıf merge):** UYAP borçlularının çoğu yalnız isim taşır. Unique constraint NULL'ları tekilleştiremez → **PartyMatch** bileşeni: TCKN/VKN varsa exact-dedupe; yoksa isim+doğum/isim+adres FUZZY aday üretir → **manuel onaylı merge**. Sessiz otomatik merge YOK. (Tam workflow + geri-alınabilirlik: **§4b**.)
- **D-5 (UI dedupe akışı):** Borçlu/müvekkil eklerken TCKN/VKN girilince: "Bu kişi/şirket zaten kayıtlı. Mevcut kart kullanılsın mı?" → [Mevcut kartı kullan] [Yeni rol olarak ekle] [Vazgeç]. "Yine de yeni kayıt oluştur" yalnız **ADMIN**.

## 4b. Eşleştirme (PartyMatch) & geri-alınabilir merge (KRİTİK)
> **Temel kural:** Yanlış merge, duplicate kayıttan DAHA tehlikelidir. Bu yüzden: sistem yalnız
> **önerir**, insan **karar verir**, kabul edilen merge **audit'li ve geri alınabilir** olur.

### 4b.1 Eşleştirme akışı (insan döngüde)
```
Kayıt eklenir/taranır (Client/Debtor/ThirdParty/EstateHeir/PublicInstitution)
  → PartyMatch aday üretir (skor + nedenler)
  → exact kimlik mi, fuzzy mi? (karar matrisi 4b.3)
  → exact → auto-link (ama isim çok farklıysa SOFT-UYARI: olası TCKN yazım hatası)
  → fuzzy → İNSAN incelemesi: [Mevcut kartı kullan] [Ayrı kişi olarak kaydet] [Kararsız/incele]
```
**Asla:** fuzzy eşleşmede insan onayı olmadan merge YOK.

### 4b.2 Modeller
```
PartyMatchCandidate {
  id, tenantId,
  sourceRecordType(CLIENT|DEBTOR|THIRD_PARTY|ESTATE_HEIR|PUBLIC_INSTITUTION),
  sourceRecordId,                 # geçici; suppress için pairKey de tut
  candidatePartyId,
  pairKey,                        # STABLE: normalize(isim+kimlik imzası) — recordId değil
  matchScore, matchReasons[],     # ör. "TCKN eşleşiyor", "isim %92", "aynı telefon"
  status(PENDING|ACCEPTED|REJECTED|IGNORED),
  reviewedBy?, reviewedAt?, reviewNote?
}
# NOT: ayrı "PartyMatchDecision" tablosu GEREKMEZ — karar bu kaydın status+reviewedBy'ında.
# REJECTED + pairKey = suppress listesi (aynı çift bir daha ÖNERİLMEZ).

PartyMergeLog {
  id, tenantId,
  sourcePartyId, targetPartyId,   # survivor=target
  canonicalReason,                # neden target survivor (daha çok doğrulanmış/eski/çok dosya | insan seçti)
  movedRecords[],                 # taşınan adres/telefon/intel/POA/caseParty id'leri
  performedBy, performedAt,
  undoPayload,                    # pre-merge snapshot (geri-alma için)
  reversibleUntil                 # bkz 4b.4 — ilk post-merge yazıma kadar TEMİZ
}
```

### 4b.3 Karar matrisi
```
TCKN/VKN/MERSIS aynı            → auto-link  (isim çok farklıysa → SOFT-UYARI, yine de incele)
telefon + isim benzer          → review (insan)
adres + isim benzer            → review (insan)
yalnız isim benzer             → düşük güven → review
çelişkili TCKN/VKN             → BLOCK / ayrı kayıt (auto-link YOK)
```

### 4b.4 Geri-alınabilirlik sınırı (dürüst kısıt)
- Merge **temiz geri alınabilir yalnız ilk post-merge yazıma kadar** (`reversibleUntil`).
- Merge sonrası karta YENİ veri eklenirse (yeni dosya/istihbarat/telefon), saf "undo" belirsizleşir
  (post-merge kayıt hangi orijinale ait?). Bu noktadan sonra işlem **undo değil SPLIT** (ayırma) olur —
  daha zor, ayrı tasarlanmalı.
- `undoPayload` = pre-merge snapshot + taşınan id listesi. Undo: taşınanları sourcePartyId'ye geri ver,
  target'ı eski haline al. Post-merge eklenenler için kural: **target'ta kalır** (veya kullanıcıya sor).

### 4b.5 Reddin kalıcılığı
- REJECTED bir aday → `pairKey` ile suppress; aynı çift gelecekte **tekrar önerilmez**.
- Suppress anahtarı **transient recordId değil**, normalize kimlik-imzasıdır (kayıt yeniden import edilse de korunur).

## 5. Cross-case istihbarat (asıl kazanım)
Yeni dosya açılınca sistem Party kartından besler:
```
Bu borçlu daha önce N dosyada kayıtlı.
Son bilinen adresler / son doğrulanmış telefonlar / önceden haczedilen varlıklar /
başarılı temas-tahsilat notları / saha istihbaratı sonuçları.
```
Kural: **Dosya bilgisi dosyada kalır; kişi bilgisi kişi kartında birikir; istihbarat kişi kartına bağlanır; dosyalar ortak karttan beslenir.**

## 6. Fazlı strangler geçiş (big-bang YASAK)
```
Faz 0  Şema additive: Party + PartyIdentifier + CaseParty (okuma değişmez).
Faz 1  Backfill: Client/Debtor/ThirdParty/EstateHeir/PublicInstitution → Party
       (tenant içi TCKN/VKN dedupe; NULL-kimlik → ayrı party, merge sonra). Dual-write başlar.
Faz 2  Alt-ağaçları Party'ye taşı: PartyAddress/Phone/BankAccount/Intelligence/Asset/Document
       (backfill + dual-write; eski tablolar okunmaya devam).
Faz 3  Junction'ları CaseParty'ye yönlendir (CaseClient/CaseDebtor → CaseParty) adapter ardında.
Faz 4  Okuyucuları taşı: interest-engine · collection · tebligat · UYAP · DebtorIntelligence ·
       reports · pre-haciz risk → Party API'sine (her biri ayrı PR, characterization testli).
Faz 5  PartyMatch/merge workflow + UI dedupe diyaloğu.
Faz 6  Eski modelleri @deprecated → en son kaldır.
```
Her faz = çok PR. Bu **aylarca** sürecek bir epic; tek PR değil.

## 7. Riskler / açık sorular
- Borçlu alt-ağacı (DebtorIntelligence/serviceStatus/pre-haciz) son ~20 PR'da kuruldu; taşıma onu destabilize edebilir → characterization test + dual-write zorunlu.
- `EstateHeir` (tereke/mirasçı) Party-of-Party mı, yoksa PartyRelation mı? (açık)
- `PublicInstitution` (DETSİS) tam Party mı, hafif referans mı? (açık)
- Mevcut `Asset`/`EnforcementAction` case-scoped → PartyAsset'e "geri promote" mantığı (bu dosyada görülen varlık → kişi kartına bilgi olarak yüksel) tasarlanmalı.
- Zamanlama: mevcut istihbarat yüzeyi stabilize olmadan Faz 4'e girilmemeli.

## 8. Öneri
PR-3 = **yalnız bu tasarım**. Uygulama, onay + faz planı kilitlendikten sonra Faz 0'dan başlar.
Acil bug'lar (PR-1 müvekkil görünürlük, PR-2 POA dedupe) zaten kapandı; bunlar Party gelene kadar
sistemi ayakta tutar.
