# Canonicalization Policy

**Durum:** Bağlayıcı kural seti — `canonicalization-register.md` içindeki kayıtların nasıl ele alınacağını tanımlar.
**Son güncelleme:** 2026-07-05
**Kapsam:** Program geneli semantic duplicate / legacy-canonical drift yönetimi. `CLAUDE.md` §2 (Architecture Principles) ve §8 (Dangerous Operations) ile birlikte okunur; çelişki halinde `CLAUDE.md` esastır.

---

## 1. Temel İlke

> Tek domain → tek canonical owner → tek write path.
> Canlı legacy → adapter.
> Trafik/veri yoksa → veri kontrolü sonrası silme adayı.
> Kritik duplicate → önce ölçüm/envanter, sonra kesme.

---

## 2. Sınıflandırma Esasları

### ARCHITECTURAL_DRIFT
Planlanmamış, organik olarak çoğalmış çoklu-yazıcı veya canonical bypass. Bilinçli bir migration planı yoktur; kod genellikle bunu itiraf eden bir TODO/yorum içerir ama geçiş stratejisi yazılmamıştır.

**Kural:** Canonical owner dışında hiçbir servis, controller, job, cron, webhook, bot veya scheduler ilgili tabloya/alana doğrudan yazamaz. Tespit edilen her ARCHITECTURAL_DRIFT maddesi önce temizlenir (P0).

### DEAD_CODE
Import/call/write path'i bulunmayan model, component veya route.

**Kural:** DB veri kontrolü olmadan hiçbir model veya migration silinmez. Frontend component'ler için import grafiği doğrulaması zorunludur. Veri kontrolü ve import doğrulaması tamamlanmadan "muhtemelen ölü" bir yapı silinmez.

### CUTOVER
Bilinçli, devam eden legacy → canonical geçişi. Kod içinde açık TODO, `@deprecated` etiketi, shadow-diff paneli veya canonical mapping testi gibi kanıtlar bulunur.

**Kural:** Canonical taraf tamamlanana kadar legacy taraf korunur; **legacy tarafa yeni business logic eklenemez**. Yeni geliştirme yalnız canonical tarafta yapılır. Kör silme yapılmaz; cutover'ın kapanışı ayrı bir kararla (veri envanteri + parity testi) belgelenir.

### INTENTIONAL_BOUNDED_CONTEXT
Duplicate gibi görünen ama kasıtlı olarak ayrı tutulmuş domain sınırı.

**Kural:** Dokunulmaz. Yalnız sınır ihlali (bounded context'in core aggregate'e sızması, örn. `Case` tablosuna doğrudan yazım) varsa bu ihlal ayrıca ARCHITECTURAL_DRIFT olarak ele alınır; bounded context'in kendi iç modeli (örn. kendi task/log tabloları) hedef alınmaz.

---

## 3. Patch Uygulama Kuralları

1. Her patch tek register maddesiyle (veya doğrudan bağımlı alt-maddelerle) sınırlıdır; birden fazla domain'i aynı patch'te birleştirmek yasaktır.
2. Her patch base commit SHA'sını açıkça belirtir. Base SHA hedef repo ile uyuşmuyorsa patch uygulanmaz.
3. Davranış değiştiren her patch, önce characterization/regression testiyle başlar.
4. Migration gerektiren patch'ler ayrıca işaretlenir; migration'lar bu politika kapsamındaki markdown-only patch'lere karıştırılmaz.
5. Bir patch'in kapsamı register'da tanımlı `action` alanına sadıktır (`fix` bir refactor'e genişletilemez, `inventory` bir silme işlemine dönüştürülemez).

## 4. Silme Öncesi Veri Envanteri Zorunluluğu

Herhangi bir model, tablo veya migration silinmeden önce:
- Salt-okunur SQL/ORM sorgusuyla satır sayısı doğrulanır.
- Sonuç register'a (`canonicalization-register.md`, ilgili maddenin "Required verification" alanı) işlenir.
- Satır sayısı sıfır değilse silme durdurulur; veri migration/backfill planı ayrı bir GO-IMPLEMENT gerektirir.

## 5. CUTOVER Maddelerinde Legacy'ye Yeni Business Logic Yazma Yasağı

CUTOVER olarak sınıflandırılmış bir maddenin legacy tarafında (örn. `Due`, eski `Hesap Özeti` hesaplaması, nested address route, `validation-gate`, eski `recalculate-interest` endpoint'i):
- Yeni feature eklenemez.
- Bug fix dışında davranış değişikliği yapılamaz.
- Yeni endpoint/route eklenemez.

Tüm yeni geliştirme ilgili canonical tarafta (`ClaimItem`, `interest-engine`, `AddressService`, `policy-engine`) yapılır.

## 6. DEAD_CODE Maddelerinde Veri Kontrolü Olmadan Silme Yasağı

Bkz. Bölüm 4. Ayrıca: DEAD_CODE olarak işaretlenmiş ama kısmen tamamlanmış bir özellik (örn. yalnız `updateMany` olan, hiç `create` olmayan bir history tablosu) doğrudan "ölü, sil" olarak işlenmez; bu durumda action `needs-owner-decision` olur, `delete` değil.

## 7. ARCHITECTURAL_DRIFT Maddelerinde Canonical Owner Dışında Direct Write Yasağı

ARCHITECTURAL_DRIFT olarak işaretlenmiş bir alanda (örn. `Case.workflowStage`, `Case` tablosu, notification "sent" durumu):
- Canonical owner servis dışında hiçbir kod doğrudan Prisma write yapamaz.
- Yeni job/cron/webhook/bot entegrasyonu canonical owner servisi bypass edemez.
- Gerçek provider/sonuç onayı olmadan `sent`/`success`/`completed` gibi durum değerleri yazılamaz.

## 8. INTENTIONAL_BOUNDED_CONTEXT Maddelerinde Dokunma Kuralı

INTENTIONAL_BOUNDED_CONTEXT olarak işaretlenmiş bir yapı (örn. `IcrabotTask`):
- Refactor, silme veya "canonicalize etme" kapsamına alınamaz.
- Yalnız bounded context'in kendi sınırının dışına (core aggregate'e) sızıp sızmadığı izlenir; sızma varsa bu, bounded context'in kendisi değil, sızan spesifik write path'i ARCHITECTURAL_DRIFT olarak ayrı ele alınır.

---

**Onay Bekleniyor: YES** — bu politika dokümantasyon kapsamındadır; kod/test/migration/runtime davranışı üzerinde hiçbir etkisi yoktur.
