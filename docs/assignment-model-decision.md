# ASSIGN-0 - Assignment Model Decision

Durum: Karar kaydı (ASSIGN-4d ile güncellendi; 4a/4b/4c kod hattı tamamlandı)

Kapsam: Bu doküman kod davranışı değiştirmez. Sorumlu avukat, personel ve görev atama modelinin kanonik kararlarını sabitler. Sonraki PR'lar bu kararı referans alarak yapılacaktır.

## Problem

Mevcut sistemde "sorumlu" kavramı birden fazla yerde farklı anlamlarda kullanılıyor:

- Hukuki dosya sorumluluğu (avukat): `CaseLawyer.role`, `CaseLawyer.isResponsible`
- Operasyonel sorumlu / bildirim hedefi (kullanıcı): `Case.sorumluPersonelId`
- Genel görev sorumlusu: `Task.assigneeId`
- Adres/istihbarat görevi sorumlusu: `AddressTask.assignedToId`
- Takvim kaydı: `CalendarEvent.createdById`

Bu alanlar aynı iş kuralını temsil etmiyor. Bu nedenle dosyanın hukuki sorumlusu, işi fiilen yapan kişi, görevi kapatan kişi ve bildirim alacak kişi birbirine karışabiliyor.

Doğru teşhis (ASSIGN-4d): `Case.sorumluPersonelId` "deprecated" değildir; önceki bu teşhis yanlıştı. Asıl sorun, **aynı kelimeyle ("sorumlu") iki farklı sorumluluğun** anlatılmasıdır — biri **operasyonel iş sahibi / bildirim hedefi** (`Case.sorumluPersonelId` → `User`), diğeri **hukuki sorumlu avukat** (`CaseLawyer.isResponsible` → `Lawyer`). Bu iki eksen bilerek ayrı kalır.

## Kanonik Kararlar

### 1. Hukuki Dosya Sorumlusu

Kanonik kaynak: `CaseLawyer.isResponsible`

Anlamı:

- Dosyanın hukuki sorumluluğunu taşıyan avukatı gösterir.
- UYAP, vekalet, hukuki onay, haciz gibi avukat sorumluluğu gerektiren akışlarda referans alınacak ana modeldir.
- Personel veya operasyonel görev ataması değildir.

Beklenen hedef davranış:

- Aktif dosyada **tam olarak bir** hukuki sorumlu avukat bulunur (avukatsız dosya istisna).
- Ürün dili tek "sorumlu avukat" üzerinden kurgulanır.
- Bu invariant PR-ASSIGN-4b ile uygulandı (create/update/add/remove sonrası tam-1; demote = `isResponsible=false` + `role=ASSIGNED`). Mevcut legacy 0/>1 drift'in tek seferlik onarımı ayrı script/PR konusudur.

### 2. Operasyonel Görev Sorumlusu

Kanonik kaynaklar:

- Genel görevler: `Task.assigneeId`
- Adres/istihbarat görevleri: `AddressTask.assignedToId`

Anlamı:

- Görevi fiilen takip edecek kişiyi gösterir.
- Avukat, icra personeli, sekreter, muhasebe veya başka bir kullanıcı olabilir.
- Hukuki dosya sorumluluğu anlamına gelmez.

### 3. Operasyonel Sorumlu / Bildirim Hedefi

Kanonik kaynak: `Case.sorumluPersonelId` (bir `User`)

Karar (ASSIGN-4d): Bu alan **deprecated DEĞİLDİR**. Önceki "deprecated aday" teşhisi yanlıştı.

Anlamı:

- Dosyanın operasyonel sahibini / bildirim hedefini gösterir (yeni takip formunda zorunlu "Sorumlu" alanı).
- Vade hatırlatması gibi bildirimlerin gönderildiği kullanıcıdır (`scheduler` DUE_REMINDER `userId`).
- Raporlama filtrelerinde operasyonel sahip olarak kullanılır.
- Hukuki sorumlu avukat anlamına GELMEZ (o `CaseLawyer.isResponsible`'dır).

Neden hukuki sorumluyla birleştirilmedi (`isResponsible` üzerinden unify edilmedi):

- `Case.sorumluPersonelId` doğrudan bir `User`'dır → her zaman bildirim alabilir.
- `CaseLawyer.isResponsible` bir `Lawyer`'dır; `Lawyer.userId` **opsiyoneldir** (her avukatın login `User` hesabı yoktur).
- Bu nedenle scheduler/rapor bildirimleri hukuki sorumlu avukata güvenilir biçimde yönlendirilemez → iki eksen **bilerek ayrı** tutulur.
- Unify / auto-sync (sorumlu avukatın `userId`'sinden türetme) şu an YAPILMAZ; ileride gerçek ihtiyaç + avukat onayı netleşince değerlendirilebilir.

## Avukat Değişimi ve Görev Devri

Varsayılan davranış: Açık görevler otomatik taşınmaz.

Gerekçe:

- Hukuki sorumluluk devri ile operasyonel iş devri aynı şey değildir.
- Açık görevleri otomatik taşımak, kimin hangi işi neden devraldığını belirsiz hale getirir.
- Görev devri üretimde audit izi gerektiren ayrı bir karardır.

Hedef ürün davranışı:

```text
Sorumlu avukat değiştirildi.
Açık görevler eski kişilerde kalsın mı?

[ ] Tüm açık görevleri yeni sorumluya taşı
[ ] Sadece hukuki görevleri taşı
[ ] Hiçbirini taşıma
```

Default seçim: Hiçbirini taşıma.

Not:

- Bu akış PR-ASSIGN-4 veya sonrasında tasarlanacaktır.
- ASSIGN-0 kapsamında kod veya UI değişikliği yapılmaz.

## Audit Zorunluluğu

Aşağıdaki değişiklikler audit üretmelidir:

- Sorumlu avukat değişimi
- Dosyaya avukat ekleme
- Dosyadan avukat çıkarma
- Dosyaya personel ekleme
- Dosyadan personel çıkarma
- Görev assignee değişimi
- AddressTask assignee değişimi
- Görev devri/migration seçimi

Minimum audit içeriği:

- Tenant
- Dosya
- Eski kişi veya kayıt
- Yeni kişi veya kayıt
- İşlemi yapan kullanıcı
- İşlem zamanı
- Devir kapsamı
- Etkilenen açık görev sayısı
- Kullanıcı seçimi veya gerekçe

## Multitenant Kararı

Assignment ile ilgili tüm okuma/yazma işlemleri tenant izolasyonuna uymalıdır.

Kurallar:

- Tenant bilgisi request body veya query parametresinden güvenilir kaynak olarak alınmamalıdır.
- Tenant bilgisi auth context üzerinden alınmalıdır.
- Case, Task, AddressTask, CaseLawyer ve CaseStaff işlemlerinde tenant guard zorunludur.
- Cross-tenant assignment, cross-tenant task okuma ve tenant'sız caseId sorguları güvenlik açığı kabul edilir.

Bu nedenle PR-ASSIGN-1, assignment modelinden önce ele alınacak güvenlik PR'ıdır.

## Mevcut Risk Kanıtları

Bu karar aşağıdaki mevcut bulgulara dayanır:

- `Case.sorumluPersonelId`, `CaseLawyer.isResponsible`, `Task.assigneeId`, `AddressTask.assignedToId` ve `CalendarEvent.createdById` ayrı alanlardır.
- Yeni takip ekranında seçilen personel state'te tutulur, ancak createCase payload'ında açık bir staff listesi olarak gönderilmez.
- Backend createCase akışı yalnızca default staff kayıtlarını ekler.
- `PATCH /cases/:id/staff/:caseStaffId` frontend tarafında çağrılır, ancak backend controller'da karşılığı yoktur.
- AddressTask controller tenant bilgisini body/query üzerinden alır ve auth guard kullanmaz.
- Genel task, tebligat task, istihbarat task ve scheduler task üreticileri açık işleri sorumlu avukata otomatik bağlamaz.
- Haciz akışında kullanılan avukat `request.lawyerId` ile gelir; bu değer kanonik sorumlu avukattan türetilmez.

## PR Sırası

### PR-ASSIGN-0 - Karar Kaydı

Kapsam:

- Sadece bu doküman.
- Kod değişikliği yok.
- Doc-only karar kaydı PR'ı olarak açılır.

### PR-ASSIGN-1 - AddressTask Güvenlik Fix

Kapsam:

- `AddressTaskController` için `JwtAuthGuard`.
- Tenant bilgisinin auth context'ten alınması.
- AddressTask servis sorgularında tenant izolasyonu.
- Body/query tenant kullanımının kaldırılması veya geriye uyumluluk için güvenli hale getirilmesi.

Sebep:

- Bu mimari borç değil, güvenlik açığıdır.

### PR-ASSIGN-2 - Yeni Takip Personel Seçimi

Kapsam:

- Yeni takip ekranında seçilen personelin gerçekten case assignment'a yazılıp yazılmadığının düzeltilmesi.
- Kullanıcıya gösterilen seçim ile kalıcı veri arasında tutarlılık.

Sebep:

- Sessiz veri kaybı ve kullanıcıyı yanlış sonuca götüren akıştır.

### PR-ASSIGN-3 - CaseStaff PATCH Uyumsuzluğu

Kapsam:

- Frontend'in çağırdığı `PATCH /cases/:id/staff/:caseStaffId` akışının backend kontratıyla uyumlu hale getirilmesi.
- Personel rol/yetki güncelleme davranışının audit ile tanımlanması.

Sebep:

- Mevcut frontend/backend kontratı kırık görünmektedir.

### PR-ASSIGN-4 - Sorumlu Avukat Kanonikleştirme (TAMAMLANDI)

Durum: 4a/4b/4c kod hattı tamamlandı; 4d karar düzeltmesidir (bu doküman).

- 4a (#222): bulk-assign sessiz no-op düzeltmesi — toplu sorumlu personel ataması gerçekten yazılır (`POST /cases/batch-update`); avukat toplu ataması dürüstçe devre dışı (`responsibleLawyerId` için backend yazıcısı yoktur); `patchFlags` üzerinden sessiz alan-düşürme kalktı.
- 4b (#223): `CaseLawyer.isResponsible` "tam olarak 1 sorumlu" invariant'ı — create/update/add/remove atomik; son sorumluyu (başka biri yükseltilmeden) düşürme `BadRequest`; sorumlu silinince önceliğe göre fallback promote; otomatik promote/demote audit'lenir.
- 4c (#225): atama audit'i — `addCaseLawyer`/`removeCaseLawyer` için `CASE_LAWYER` CREATE/DELETE audit; `batchUpdate` için `sorumluPersonelId` tenant-doğrulaması + tek özet `CASE` UPDATE audit.
- 4d (bu doküman): `Case.sorumluPersonelId` **deprecated değildir**; operasyonel sorumlu / bildirim hedefi (`User`) olarak netleştirilir. Hukuki sorumlu (`CaseLawyer.isResponsible` / `Lawyer`) ile **bilerek ayrı** kalır. `Lawyer.userId` opsiyonel olduğundan scheduler/rapor `isResponsible` üzerinden unify EDİLMEZ; scheduler/rapor `sorumluPersonelId` üzerinde kalır, müvekkil iletişimi / hukuki taraf `isResponsible` üzerinde kalır.

Açık backlog (bu doküman dışı; ayrı kod PR'ları): legacy 0/>1 sorumlu drift onarımı script'i; `CaseLawyer` için partial-unique index (`UNIQUE(caseId) WHERE isResponsible`); tekil `create()`/`update()` `sorumluPersonelId` tenant guard.

## Non-Goals

ASSIGN-0 kapsamında yapılmayacaklar:

- Kod değişikliği
- Database migration
- Controller veya service değişikliği
- UI değişikliği
- Otomatik görev taşıma
- Yeni tebligat, istihbarat veya haciz görevi ekleme

## Ürün İlkesi

Yeni tebligat, istihbarat, haciz veya görev otomasyonu yazmadan önce assignment zemini net olmalıdır.

Bozuk veya parçalı assignment modeli üzerine yeni operasyonel akış eklemek, ileride sessiz görev kaybı, yanlış kişiye bildirim, hatalı performans raporu ve audit eksikliği üretir.

## Kapanış Özeti & Gerekçe (Closure Review)

Durum: ASSIGN-0 → ASSIGN-4 tamamlandı (2026-06-19). Bu bölüm, aylar sonra "neden böyle?" sorularına hızlı yanıt için kararların gerekçesini özetler. (Kod hattı kapandı; kalan işler "Açık backlog"ta, strand dışıdır.)

### Ne yapıldı ve neden bu sıra
Sıra bilinçliydi: önce **model**, sonra **özellik**. Bozuk zemin üzerine özellik yazmak sessiz görev kaybı / yanlış bildirim üretir.

1. ASSIGN-0 (#199) — **Karar**: model kanonik kararları sabitlendi (kod yok).
2. ASSIGN-1 (#202 · #207 · #209) — **Güvenlik**: AddressTask tenant izolasyonu (auth guard + body/query tenant→403 + cross-tenant→404 + CaseDebtor link + öksüz görev temizliği). Mimari borç değil güvenlik açığı → önce bu.
3. ASSIGN-2 (#210 · #212 · #214) — **Veri kaybı**: yeni takipte seçilen personel artık gerçekten case'e yazılır (eskiden sessizce kaybediliyordu).
4. ASSIGN-3 (#217 · #219 · #221) — **Kırık kontrat**: `PATCH /cases/:id/staff/:caseStaffId` ucu eklendi (eskiden 404), drawer CaseStaff modeline hizalandı, bayat tip temizlendi.
5. ASSIGN-4 (#222 · #223 · #225 · #231) — **Kanonik model**: sorumlu avukat tek otorite + audit + anlam netleştirme.

### Üç kritik "neden?" (en sık unutulan)

**Neden `Case.sorumluPersonelId` SİLİNMEDİ / deprecated değil?**
Çünkü "sorumlu" kelimesiyle **iki ayrı sorumluluk** anlatılıyordu:
- `Case.sorumluPersonelId` = **operasyonel sorumlu / bildirim hedefi** → bir **`User`** (her zaman bildirim alabilir). Scheduler vade-hatırlatması (`DUE_REMINDER.userId`) ve rapor filtreleri buna bağlıdır; yeni-takip formunda zorunlu alandır.
- `CaseLawyer.isResponsible` = **hukuki sorumlu avukat** → bir **`Lawyer`**.
Silinemez çünkü scheduler/rapor yük taşıyor. `isResponsible`'a "unify" edilmedi çünkü `Lawyer.userId` **opsiyoneldir** (her avukatın login `User` hesabı yok) → sorumlu avukata güvenilir bildirim gönderilemez. İki eksen bilerek ayrı tutulur.

**Neden "tam olarak 1 sorumlu avukat" invariant'ı var?**
Önceden **0 sorumlu** (tek sorumluyu düşürme/silme) veya **>1 sorumlu** (2. RESPONSIBLE ekleme / 2 ortak) mümkündü → `client-info-request` `take:1` rastgele avukat seçiyordu (belirsizlik). 4b ile create/update/add/remove sonrası **tam-1** garanti edilir (demote = `isResponsible=false` + `role=ASSIGNED`; son sorumluyu başka biri yükseltilmeden düşürme → `BadRequest`; sorumlu silinince önceliğe göre otomatik yeni sorumlu). Avukatsız dosya istisnadır.

**Neden avukat toplu-atama (bulk lawyer assign) DEVRE DIŞI?**
"Sorumlu avukat" `Case` üzerinde bir skalar **değildir** (`CaseLawyer.isResponsible`'dır). Frontend `responsibleLawyerId` gönderiyordu ama backend yazıcısı **yoktu** → `patchFlags` alanı sessizce düşürüyordu (sahte "başarılı" toast). Gerçek bir "toplu sorumlu avukat değiştir" semantiği (mevcut sorumluyu düşürme? görev devri? çok-avukatlı dosyalar?) ayrı tasarım gerektirir → sahte buton yerine **dürüstçe disable**. Personel toplu-ataması çalışır (`POST /cases/batch-update` → `sorumluPersonelId`).

### Açık backlog (bu strand DIŞI; ayrı kod işleri)
- Legacy 0/>1 sorumlu **drift onarımı** (büyük ölçüde ayrı bir PR ile yapıldı).
- `CaseLawyer` için **partial-unique index** (`UNIQUE("caseId") WHERE "isResponsible"`) — DB seviyesinde ≤1 garanti + eşzamanlılık race'ini kapatır; migration gerektirir (drift onarımı ön koşul).
- Tekil `create()` / `update()` için `sorumluPersonelId` **tenant guard** (batchUpdate'te var, tekil yollarda yok).
