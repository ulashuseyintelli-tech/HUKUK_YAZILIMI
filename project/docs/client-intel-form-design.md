# Müvekkil İstihbarat Formu — Tasarım (DESIGN-ONLY)

> **Ana cümle:** Müvekkilin elindeki ham istihbaratı, dosya açılışında kaynağı/güveni/tarihiyle sisteme almak — sonradan çok daha pahalıya elde edilecek bilgiyi kaçırmamak.
> **Durum:** Tasarım taslağı — **KOD YOK, migration YOK, endpoint YOK, frontend YOK.** İnceleme + onay sonrası fazlı uygulanır.
> **Kapsam dışı (bu doc):** kod, şema migration, veri taşıma, UI. Bunlar onaylı tasarımdan SONRA, ayrı PR'larda.
> **İlgili:** [party-registry-design.md](party-registry-design.md) · [debtor-identity-resolution-ir0.md](debtor-identity-resolution-ir0.md) · [strategic-backlog.md](strategic-backlog.md) (SB-007) · [debtor-module-ledger.md](debtor-module-ledger.md) (D4e istihbarat hattı)

---

## 0. Problem

İcra dosyalarının önemli bir kısmında başarısızlığın sebebi **hukuki bilgi eksikliği değil**, müvekkilin elindeki bilginin sisteme hiç aktarılmamasıdır. Müvekkil çoğu zaman herkesten fazla şey bilir (borçlunun eski telefonu, fiili deposu, kim ödeme yapıyor, sosyal medyası…) ama **sorulmadığı için** kayıt altına alınmaz. Bu bilgi sonradan saha/sorgu maliyetiyle, çoğu zaman çok daha pahalıya elde edilir — ya da hiç elde edilemez.

Çözüm: dosya açılışında (ve sonradan) müvekkilden yapılandırılmış bir **istihbarat beyanı** almak; her beyanı **kaynak = müvekkil**, **güven = beyan**, **tarih**, **dosya**, **borçlu** ile damgalayıp saklamak.

---

## 1. DO-NOW / HOLD sınırı (en kritik bölüm)

Bu işin riski kod değil, **model sınırının yazılı olmaması**. Sınır yazılı olmazsa iş büyür ve farkında olmadan Party/identity mimarisine girilir. Sınır:

```
Müvekkil beyanı girişi (intake)            =  DO-NOW
Cross-case istihbarat / PartyMatch / merge =  HOLD
```

### YAPILACAK (DO-NOW — bu tasarımın kapsamı)
- Müvekkilden alınan bilgiyi tek tek **beyan kaydı** olarak saklamak.
- Her kayıtta: `source = CLIENT_DECLARATION`, `confidence = DECLARED`, `caseId`, `debtorId`, `tenantId`, `createdBy`, `createdAt`.
- Beyanı dosya+borçlu bağlamında listeleyip göstermek.
- Yapılandırılmış kategorilere göre giriş (aşağıda §2 haritası).

### YAPILMAYACAK (HOLD — bu tasarımın AÇIKÇA dışında)
- **PartyMatch** / Party Registry kimlik kartı.
- **IR-0** otomatik kimlik çözümleme (sonradan-TCKN → "olası aynı kişi" adayı vb.).
- **Cross-case intelligence** — başka dosyalardaki beyanları aynı borçluya otomatik yayma.
- **Otomatik merge** — MERNİS / SGK / sosyal medya / saha verisiyle müvekkil beyanını **tek havuzda birleştirme**.
- Beyana dayanarak **otomatik** haciz/görev tetikleme (insan kararı arada kalır).

> **Neden bu form yine de postmortem'e uygun:** [reliability-postmortem.md](reliability-postmortem.md) kuralı "gerçek veri akmadan Party başlamaz" diyor. Bu form **tam da gerçek verinin aktığı musluk**. Musluğu açmak (intake) do-now; veriyi havuzda birleştirmek (merkez) HOLD. Form, gelecekteki Party/IR-0 işini **besler ama uygulamaz**.

---

## 2. Kategori → Model haritası (anti-tekrar)

Form **tek dev tabloya** yazılmaz. Her kategori **doğru kanonik modele** yönlendirilir. Mevcut kanonik modele yazılabilen bilgi **yeni tabloya yazılmaz**.

| Form kategorisi | Hedef model | Durum |
|---|---|---|
| **Adres istihbaratı** (resmi/fiili/geçmiş; depo/şube/mağaza/fabrika) | `DebtorAddress` (`source = CLIENT`) | ✅ MEVCUT — reuse |
| **Varlık** (araç/gayrimenkul/iş makinesi/banka/maaş) | `Asset` (VEHICLE/IMMOVABLE/BANK_ACCOUNT/SALARY/…) | ✅ MEVCUT — reuse |
| **İletişim** (cep/sabit/WhatsApp/e-posta/eski numaralar) | `Debtor` alanları + `DebtorCommunication` | ✅ MEVCUT — reuse |
| **Gelir kaynağı** (müteahhit/nakliyeci/doktor/e-ticaretçi…) | `ClientIntelStatement` (YENİ) | 🆕 boş alan |
| **Ticari ilişki** (kim ödüyor / ana müşteri / tedarikçi / banka-POS) | `ClientIntelStatement` (YENİ) | 🆕 boş alan |
| **Aile / yakın çevre** (eş/ortak/muhasebeci/finans müdürü) | `ClientIntelStatement` (YENİ) | 🆕 boş alan |
| **Dijital iz** (Instagram/X/LinkedIn/site/Trendyol/Hepsiburada…) | `ClientIntelStatement` (YENİ) | 🆕 boş alan |
| **Tahsilat geçmişi beyanı** (kim ödedi / hangi IBAN / kim söz verdi) | `ClientIntelStatement` (YENİ) | 🆕 boş alan |
| **Strateji soruları** (ödeme gücü / mal kaçırma / aktif mi / acele haciz?) | `ClientIntelStatement` (YENİ) | 🆕 boş alan |

> **Not — `DebtorIntelligence` neden kullanılmıyor:** Mevcut `DebtorIntelligence` modeli **saha (field) odaklı** (`intelType` = LOCATION_VERIFICATION / ACTIVITY_CHECK / ASSET_SIGHTING / NEIGHBOR_CONFIRM; `result` = saha sonuçları; `confidence` = 0-100 saha skoru). `source` alanı yok, "müvekkil beyanı" kavramı yok. Müvekkil beyanı ≠ saha doğrulaması. Bu yüzden müvekkil beyanı için **ayrı** hafif yapı (`ClientIntelStatement`) gerekir; saha istihbaratı `DebtorIntelligence`'ta kalır.

### Anti-tekrar kuralı (kesin)
1. Adres → `DebtorAddress`, varlık → `Asset`, iletişim → `Debtor`/`DebtorCommunication`. Bu üçü **ClientIntelStatement'a yazılmaz**.
2. `ClientIntelStatement` **yalnız mevcut model karşılığı olmayan yumuşak istihbarat** içindir (gelir/ticari/aile/dijital/tahsilat-beyanı/strateji).
3. Form UI'ı bir "giriş kapısı"dır; arkada beyanı **doğru modele** router eder. Aynı bilgi iki yerde durmaz.

---

## 3. `ClientIntelStatement` taslak şeması (YENİ — yumuşak istihbarat)

> Yalnız taslak. Alan adları/tipleri uygulama fazında (Faz 2) Prisma'ya geçerken kesinleşir.

```
ClientIntelStatement {
  id          String   @id
  tenantId    String                 // multitenant — DebtorIntelligence ile tutarlı (ZORUNLU)
  caseId      String                 // hangi dosya bağlamında beyan edildi
  debtorId    String                 // kime dair beyan
  category    ClientIntelCategory    // INCOME_SOURCE | COMMERCIAL_RELATION | FAMILY_CIRCLE
                                      // | DIGITAL_FOOTPRINT | PAYMENT_HISTORY | STRATEGY
  label       String?                // soru/etiket: "Borçlu nasıl para kazanıyor?"
  value       String                 // müvekkilin cevabı: "Müteahhit, X inşaatında"
  note        String?                // serbest açıklama

  source      ClientIntelSource  @default(CLIENT_DECLARATION)  // sabit (genişlemeye açık enum)
  confidence  ClientIntelConfidence @default(DECLARED)         // beyan = en zayıf güven katmanı

  status      ClientIntelStatus  @default(ACTIVE)  // §4 lifecycle
  revokedAt   DateTime?
  revokedById String?
  supersededById String?            // bu kaydın yerine geçen yeni kaydın id'si

  createdById String                 // beyanı giren personel (delil izi)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt    // yalnız status/lifecycle alanları için (value DEĞİŞMEZ — §4)

  @@index([tenantId, debtorId])
  @@index([caseId])
  @@index([debtorId, status])
}
```

**Enum taslakları**
- `ClientIntelCategory`: INCOME_SOURCE, COMMERCIAL_RELATION, FAMILY_CIRCLE, DIGITAL_FOOTPRINT, PAYMENT_HISTORY, STRATEGY
- `ClientIntelSource`: CLIENT_DECLARATION *(şimdilik tek değer; gelecekte CLIENT_PORTAL eklenir — Faz 5)*
- `ClientIntelConfidence`: DECLARED *(beyan; en alt katman. MERNİS/saha gibi üst katmanlar HOLD'da, bu enuma şimdi eklenmez)*
- `ClientIntelStatus`: ACTIVE, RETRACTED, SUPERSEDED, FALSE_POSITIVE

**Multitenant gerekçesi:** `ClientIntelStatement` doğrudan filtrelenen operasyonel bir tablo (dosya/borçlu bazlı listelenecek) → `tenantId` **taşımalı** (`DebtorIntelligence` deseniyle birebir). `DebtorAddress`/`Asset`'in `tenantId` taşımayıp `Debtor` üzerinden cascade etmesi mevcut bir borç; yeni tabloyu o borca eklemiyoruz.

---

## 4. Lifecycle — edit YOK, revoke + yeni kayıt (Ulaş'ın sert notu)

Beyan muhasebe kaydı değil ama **operasyonel delil izi** taşır. Örnek:

```
Müvekkil 17.06.2026'da "borçlunun X yerde deposu var" dedi.
Sonra yanlış çıktı.
```

Bu bilgi **silinmez / üzerine yazılmaz**. İleride "kim, neye dayanarak haciz görevi açtı?" sorusu cevapsız kalmasın diye:

- **`value` immutable.** Bir beyanın içeriği düzeltilmez. Düzeltme = eski kaydı `SUPERSEDED` yap + `supersededById` ile yeni kayda bağla.
- **Yanlış çıkan beyan** silinmez; `status` değiştirilir: `RETRACTED` (müvekkil geri aldı), `SUPERSEDED` (yenisiyle değişti), `FALSE_POSITIVE` (yanlış çıktı).
- `revokedAt` / `revokedById` ile kim/ne zaman pasifledi kaydı tutulur.
- `updatedAt` yalnız **lifecycle/status** geçişlerinde değişir; içerik için değil.
- Listeleme varsayılanı: yalnız `ACTIVE`. Geçmiş/pasif kayıtlar ayrı görünümde (denetim izi).

Bu, `DebtorAddress` asimetrik besleme ve [debtor-module-ledger.md](debtor-module-ledger.md)'deki "otoriter verified ezilmez" ilkesiyle aynı çizgide: **zayıf kaynak (beyan) güçlü kaydı ezmez; geçmiş silinmez.**

---

## 5. Faz planı

| Faz | İçerik | Durum |
|---|---|---|
| **Faz 1** | Bu tasarım dokümanı | 👈 **şu an** (kod yok) |
| **Faz 2** | Additive backend: `ClientIntelStatement` model + migration + `POST`/`GET` endpoint (+ kategori router'ı: adres→DebtorAddress, varlık→Asset, iletişim→Debtor) | onay sonrası |
| **Faz 3** | Frontend: dosya/borçlu altında basit istihbarat formu + ACTIVE beyan listesi + revoke aksiyonu | Faz 2 sonrası |
| **Faz 4** | Mail ile müvekkilden bilgi isteme şablonları (mevcut iletişim-görev motoruna bağlanır) | Faz 3 sonrası |
| **Faz 5** | Müvekkil portalı / dış form (`CLIENT_PORTAL` kaynağı) | Faz 4 sonrası |
| **Faz 6** | **HOLD** — Party / IR-0 / cross-case intelligence / otomatik merge | legal-gated; ayrı karar |

Her faz: plan → onay → additive kod → unit + canlı DB e2e → PR → merge → ledger. (Mevcut çalışma disiplini.)

---

## 6. Açık kararlar (Faz 2'den önce netleşmeli)

| # | Karar | Tasarım önerisi |
|---|---|---|
| K1 | Statement editlenebilir mi, yoksa revoke + yeni kayıt mı? | **revoke + yeni kayıt** (§4). `value` immutable. *(Ulaş onayladı.)* |
| K2 | Aynı beyan tekrar girilirse duplicate uyarısı? | **Soft uyarı** (blok yok): aynı `debtorId + category + value` ACTIVE varsa "zaten kayıtlı" uyarısı; personel yine de girebilir. |
| K3 | Beyan dosya bazlı mı, borçlu bazlı mı? | **Her ikisi:** `caseId` (hangi dosyada beyan edildi) + `debtorId` (kime dair). Borçlu bazlı listelenir, dosya bağlamı korunur. İleride global debtor profile'a **taşıma değil**, sadece okuma ile bağlanır (HOLD). |
| K4 | Müvekkil portalından gelen beyan doğrudan mı kaydedilir, onaya mı düşer? | **Personel onayına düşer** (Faz 5). Portal beyanı `status = ACTIVE` değil, ayrı bir "onay bekliyor" durumunda gelir; personel ACTIVE'e alır. *(Faz 5'te kesinleşir; şimdi sadece ilke.)* |

> K1 dışındaki kararlar **öneri**dir; Faz 2 onayında kesinleşir. K1 kullanıcı tarafından kilitlendi.

---

## 7. Özet

- **Kova:** DO-NOW intake. Sınır §1'de yazılı: beyan girişi yapılır, cross-case/merge/identity yapılmaz.
- **Anti-tekrar:** adres/varlık/iletişim mevcut modellere; yalnız yumuşak istihbarat yeni `ClientIntelStatement`'a.
- **Delil izi:** edit yok → revoke + yeni kayıt; geçmiş silinmez.
- **Sonraki adım:** Bu doküman onaylanınca **Faz 2** (additive backend) için ayrı plan + onay. **Bu fazda kod yazılmadı.**
