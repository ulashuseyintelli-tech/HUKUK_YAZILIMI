# DEBTOR PLATFORM — UYAP RESMÎ TEKNİK PAKET TEMİN TALEBİ (DBP-P2-UYAP-PKG-REQ)

```text
Belge yolu : project/docs/governance/DEBTOR-DBP-P2-UYAP-PACKAGE-PROCUREMENT-REQUEST-v1.0.md
Durum      : RECORDED (procurement request specification) — CANONICAL UPON APPROVED MERGE
Rol        : Operasyonel temin (procurement) talep kaydı. Semantic/execution/runtime
             authority ÜRETMEZ. Resmî UYAP teknik paketinin owner/procurement tarafından
             hangi artefaktlarla, hangi kanaldan ve hangi teslim/güvenlik koşullarıyla
             temin edileceğini kayda geçirir; gönderilebilir talep metnini EK-A'da taşır.
Task ID    : DBP-P2-UYAP-PKG-REQ
Mod        : GO-DOCS (docs-only). IMPLEMENTATION AUTHORITY: NONE.
Tarih      : 2026-07-18
Domain     : Borçlu Platformu — Phase 2 (UYAP role-contract cutover gate hattı)
```

## IMPLEMENTATION AUTHORITY

```text
IMPLEMENTATION AUTHORITY : NONE
RUNTIME AUTHORITY        : NONE (hiçbir DTD/XSD/rol kodu bu kayıtla runtime authority olmaz)
SCHEMA / MIGRATION       : NONE
CODE / TEST CHANGE       : NONE (docs-only)
PROCUREMENT EXECUTION    : OWNER / ORGANIZASYON TARAFI — bu ajan yürütemez
```

Bu belge bir **temin (procurement) talebinin** yapılandırılmış kaydıdır. Paketin fiilen
elde edilmesi owner/organizasyon tarafındaki bir eylemdir (yetkili portal erişimi, resmî
yazışma, entegratör/sözleşme ilişkisi gerektirir). Ajan bu paketi temin etmez ve bu
kayıt hiçbir kod/schema/runtime/cutover değişikliğini başlatmaz.

## 1. Amaç ve Kapsam

Borçlu Platformu **UYAP role-contract cutover gate**'inin (bkz. `decision-log.md`
2026-07-17 `DBP-P2-LDO-01-GOV` ve `DBP-P2-LDO-01-GOV-R1` kayıtları) doğrulanabilmesi için,
kullanılan UYAP entegrasyonuna ait **güncel ve resmî teknik sözleşme paketinin** temin
edilmesi gerekir.

Gerekçe (repository truth, `DBP-P2-UYAP-CONTRACT-01` GO-VERIFY, 2026-07-17):

- Repository iki ayrı UYAP taraf-rol sözleşmesi taşır ve bunlar VERIFIED/CONSISTENT'tır:
  - XML/exchangeData: `uyap-xml.service.ts` — 10 kodlu `UYAP_ROL_TURLERI`; `exchange.dtd`
    içinde `rolTur` serbest `CDATA` (enum ile doğrulanmaz).
  - export/takipTalepleri: `uyap-case-mapper.service.ts` — 6 değerli `UyapTarafRolu` tipli
    union; kambiyo dosyalarını `LEGACY_UYAP_INSTRUMENT_DATA_UNAVAILABLE` ile reddeder.
- Gerçek UYAP gönderimi STUB'tır (`uyap.controller.ts` `mode:'STUB'` / `uyap.service.ts`).
- **Resmî UYAP `rolTur` / taraf-rolü sözleşmesi** repository'den veya doğrulanabilir kamusal
  birincil kaynaktan **kurulamamıştır (BLOCKED / NOT PROVABLE)**.

Bu boşluk kapanmadan `TASFIYE_MEMURU`, `IFLAS_MASASI`, fail-closed rol davranışı ve export
target değişiklikleri **NOT AUTHORIZED** durumundadır (IMPLEMENTATION FREEZE, §7).

## 2. Talep Edilen Artefaktlar

Mümkün olan en güncel sürümleriyle:

```text
1.  exchangeData XML DTD / XSD dosyaları
2.  takipTalepleri XML DTD / XSD dosyaları
3.  rolTur / taraf rolü kod listesi ve açıklamaları
4.  UyapTarafRolu izin verilen değerler sözlüğü
5.  Takip türü ve taraf rolü uyumluluk matrisi
6.  Kambiyo senetleri için taraf ve rol sözleşmesi
7.  Tasfiye memuru için geçerli teknik rol / temsil kodu
8.  İflas masası, müflis ve iflas idaresi için geçerli rol kodları
9.  Mirasçı ve tereke senaryoları için geçerli taraf kodları
10. Paket sürüm numarası ve yayın / güncelleme tarihi
11. Entegrasyon kullanım veya uyumluluk şartnamesi
12. Örnek geçerli XML dosyaları
13. Submission endpoint ve test ortamı teknik dokümanları
```

## 3. Kaynak Kısıtı (Authority)

Paket **yalnız** aşağıdaki kanallardan temin edilir:

```text
- UYAP Avukat Portalı
- Adalet Bakanlığı / UYAP resmî birimi
- Yetkili UYAP entegratörü
- Mevcut kurumsal entegrasyon sağlayıcısı
```

Üçüncü taraf blog, forum, eski mirror veya kaynağı doğrulanamayan dosyalar **authority
kabul edilmez**. Bu nedenle paket web araması / rastgele indirme ile toplanmaz; yalnız
yukarıdaki resmî kanallardan, kaynağı belgelenmiş olarak alınır.

## 4. Temin Sırasında Sorulacak Sorular

```text
1.  Bu paket şu anda yürürlükte olan en güncel paket midir?
2.  Önceki sürümleri supersede ediyor mu?
3.  rolTur alanı için bağlayıcı kod listesi hangi dosyadadır?
4.  LEHTAR ve MUHATAP resmî roller midir?
5.  TASFIYE_MEMURU için ayrı rol kodu bulunuyor mu?
6.  IFLAS_MASASI, MUFLIS ve IFLAS_IDARESI ayrı teknik rollere sahip midir?
7.  UCUNCU_SAHIS hangi takip türlerinde kullanılabilir?
8.  Kambiyo dosyaları takipTalepleri sözleşmesinde destekleniyor mu?
9.  Test ve production sözleşmeleri arasında fark var mı?
10. Yeni entegrasyon veya sertifika gereksinimi bulunuyor mu?
```

## 5. Teslim Formatı

Paket teslim alınırken kaydedilecekler:

```text
- Orijinal indirilen dosyalar (dosya adları DEĞİŞTİRİLMEDEN)
- Kaynak portal / gönderen kurum bilgisi
- Temin tarihi
- Sürüm bilgisi
- Varsa resmî e-posta veya yazı (correspondence)
- Dosyaların SHA-256 değerleri
```

Bu alanlar için hazır intake şablonu ve manifest, repo-DIŞI teslim-alma konumundadır (§6).

## 6. Güvenlik — READ-ONLY REVIEW LOCATION

Paket **doğrudan production repository'ye eklenmez.** İlk aşamada repo-DIŞI, salt-okunur
bir inceleme konumunda saklanır:

```text
READ-ONLY REVIEW LOCATION (repo-DIŞI, git-tracked DEĞİL):
  C:\Development\HUKUK_YAZILIMI\UYAP_OFFICIAL_PACKAGE_REVIEW\
```

Bu konumda:

- `00_README_INTAKE_CHECKLIST.md` — güvenlik banner'ı, teslim-alma checklist'i, §4 soruları.
- `MANIFEST.template.md` — dosya + kaynak + tarih + sürüm + SHA-256 manifest şablonu.
- `01_dtd_xsd/ … 06_official_correspondence/` — 13 artefakt için sınıflandırılmış klasörler.

**Kural:** Teknik doğrulama (`DBP-P2-UYAP-CONTRACT-02`, §7) tamamlanmadan hiçbir DTD/XSD
veya rol kodu **runtime authority** olarak kabul edilmez ve repository'ye taşınmaz.

## 7. Sonraki Adım ve IMPLEMENTATION FREEZE

Paket temin edildikten **sonra** açılacak görev:

```text
DBP-P2-UYAP-CONTRACT-02
MODE: GO-VERIFY ONLY
Karşılaştırma: official package  vs.  repository DTD / types / mappers
Üretmez: kod değişikliği, schema/migration, cutover yetkisi, runtime authority
```

`DBP-P2-UYAP-CONTRACT-02` **bu kayıtla başlatılmaz**; ayrı owner GO gerektirir ve yalnız
paket resmî kanaldan temin edilip §6 konumuna alındıktan sonra anlamlıdır.

**IMPLEMENTATION FREEZE (resmî paket temin edilene + ayrı owner GO verilene kadar):**

```text
- fail-closed role patch                         : NOT AUTHORIZED
- TASFIYE_MEMURU (ayrı rol/temsil hedefi)         : NOT AUTHORIZED
- IFLAS_MASASI / MUFLIS / IFLAS_IDARESI hedefi     : NOT AUTHORIZED
- export target (UyapTarafRolu) değişiklikleri     : NOT AUTHORIZED
- gerçek UYAP submit cutover (submitDocument STUB) : HOLD
- OD-07 / PARTY FOUNDATION                         : NOT REOPENED
- DBP-P2-BP-01                                     : UNCHANGED
```

## 8. Bağlayıcı Notlar

- Bu kayıt bir **temin talebinin** kaydıdır; hukuki veya teknik hiçbir sınıflandırmayı
  kesinleştirmez ve hiçbir implementasyonu başlatmaz.
- `LEHDAR → LEHTAR` ve `MUHATAP → MUHATAP` XML sözleşme sınıflandırması **CANONICAL**'dır
  (bkz. `DBP-P2-LDO-01-GOV-R1`); bu kayıt onların üzerine "global borçlu/sorumluluk"
  sonucu **eklemez**.
- Procurement icrası owner/organizasyon tarafındadır; ajan resmî portala erişemez, kimlik
  bilgisi giremez ve üçüncü taraf kaynağı authority saymaz.
- **NEXT ELIGIBLE TASK: OWNER — OFFICIAL UYAP TECHNICAL PACKAGE ACQUISITION** (bu belgedeki
  spesifikasyona göre). Paket geldikten sonra owner ayrıca `DBP-P2-UYAP-CONTRACT-02`
  (GO-VERIFY ONLY) yetkilendirebilir.

---

## EK-A — GÖNDERİLEBİLİR RESMÎ TALEP METNİ (TASLAK)

> Bu metin owner/büro tarafından doldurulup (köşeli parantezli alanlar) resmî kanala
> (§3) gönderilmek üzere hazırlanmış bir **taslak**tır. Ajan bu metni göndermez;
> gönderim owner tarafındadır.

```text
[Büro / Firma Antetli Kağıdı]

Tarih : [GG.AA.YYYY]
Konu  : UYAP Entegrasyonu Güncel Resmî Teknik Paket Temin Talebi

Alıcı : [Yetkili UYAP Entegratörü / Adalet Bakanlığı UYAP Birimi /
         Kurumsal Entegrasyon Sağlayıcısı]

Sayın Yetkili,

[Büro/Firma adı] olarak yürüttüğümüz UYAP entegrasyonunda taraf rolü (rolTur) ve
takip türü sözleşmelerinin güncel ve resmî sürümleriyle doğrulanması gerekmektedir.
Bu kapsamda, mümkün olan en güncel sürümleriyle aşağıdaki teknik artefaktların
tarafımıza iletilmesini rica ederiz:

  1.  exchangeData XML DTD / XSD dosyaları
  2.  takipTalepleri XML DTD / XSD dosyaları
  3.  rolTur / taraf rolü kod listesi ve açıklamaları
  4.  UyapTarafRolu (izin verilen taraf rolü değerleri) sözlüğü
  5.  Takip türü ile taraf rolü uyumluluk matrisi
  6.  Kambiyo senetlerine ilişkin taraf ve rol sözleşmesi
  7.  Tasfiye memuru için geçerli teknik rol / temsil kodu
  8.  İflas masası, müflis ve iflas idaresi için geçerli rol kodları
  9.  Mirasçı ve tereke senaryoları için geçerli taraf kodları
  10. Paket sürüm numarası ve yayın / güncelleme tarihi
  11. Entegrasyon kullanım / uyumluluk şartnamesi
  12. Örnek geçerli XML dosyaları
  13. Submission endpoint ve test ortamı teknik dokümanları

Ayrıca aşağıdaki hususların netleştirilmesini rica ederiz:

  a. Bu paket şu anda yürürlükte olan en güncel paket midir; önceki sürümleri
     supersede ediyor mu?
  b. rolTur alanı için bağlayıcı kod listesi hangi dosyada tanımlıdır?
  c. LEHTAR ve MUHATAP resmî roller midir?
  d. TASFIYE_MEMURU için ayrı bir rol kodu bulunuyor mu?
  e. IFLAS_MASASI, MUFLIS ve IFLAS_IDARESI ayrı teknik rollere sahip midir?
  f. UCUNCU_SAHIS hangi takip türlerinde kullanılabilir?
  g. Kambiyo dosyaları takipTalepleri sözleşmesinde destekleniyor mu?
  h. Test ve production sözleşmeleri arasında fark var mıdır?
  i. Yeni entegrasyon veya sertifika gereksinimi bulunuyor mu?

Dosyaların, dosya adları değiştirilmeden, sürüm ve yayın tarihi bilgisiyle birlikte
iletilmesi bizim için önemlidir.

İlginize teşekkür eder, çalışmalarınızda başarılar dileriz.

Saygılarımızla,

[Ad Soyad]
[Unvan / Baro-Sicil No]
[Büro / Firma Adı]
[İletişim: telefon / e-posta]
```
