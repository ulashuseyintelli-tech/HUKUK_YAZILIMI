# ASSIGN-0 - Assignment Model Decision

Durum: Taslak karar kaydı

Kapsam: Bu doküman kod davranışı değiştirmez. Sorumlu avukat, personel ve görev atama modelinin kanonik kararlarını sabitler. Sonraki PR'lar bu kararı referans alarak yapılacaktır.

## Problem

Mevcut sistemde "sorumlu" kavramı birden fazla yerde farklı anlamlarda kullanılıyor:

- Hukuki dosya sorumluluğu: `CaseLawyer.role`, `CaseLawyer.isResponsible`
- Eski/genel dosya sorumlusu: `Case.sorumluPersonelId`
- Genel görev sorumlusu: `Task.assigneeId`
- Adres/istihbarat görevi sorumlusu: `AddressTask.assignedToId`
- Takvim kaydı: `CalendarEvent.createdById`

Bu alanlar aynı iş kuralını temsil etmiyor. Bu nedenle dosyanın hukuki sorumlusu, işi fiilen yapan kişi, görevi kapatan kişi ve bildirim alacak kişi birbirine karışabiliyor.

## Kanonik Kararlar

### 1. Hukuki Dosya Sorumlusu

Kanonik kaynak: `CaseLawyer.isResponsible`

Anlamı:

- Dosyanın hukuki sorumluluğunu taşıyan avukatı gösterir.
- UYAP, vekalet, hukuki onay, haciz gibi avukat sorumluluğu gerektiren akışlarda referans alınacak ana modeldir.
- Personel veya operasyonel görev ataması değildir.

Beklenen hedef davranış:

- Aktif dosyada en az bir hukuki sorumlu avukat bulunmalıdır.
- Ürün dili tek "sorumlu avukat" üzerinden kurgulanır.
- Birden fazla `isResponsible=true` kaydı oluşmasını engelleme veya legacy veriyi düzeltme konusu PR-ASSIGN-4 kapsamında ele alınacaktır.

### 2. Operasyonel Görev Sorumlusu

Kanonik kaynaklar:

- Genel görevler: `Task.assigneeId`
- Adres/istihbarat görevleri: `AddressTask.assignedToId`

Anlamı:

- Görevi fiilen takip edecek kişiyi gösterir.
- Avukat, icra personeli, sekreter, muhasebe veya başka bir kullanıcı olabilir.
- Hukuki dosya sorumluluğu anlamına gelmez.

### 3. Deprecated Alan

Deprecated aday: `Case.sorumluPersonelId`

Karar:

- Yeni hukuki sorumluluk kararlarında kanonik kaynak olarak kullanılmayacaktır.
- Yeni özelliklerde bu alan üzerinden "sorumlu avukat" anlamı kurulmayacaktır.
- Geçiş sürecinde raporlama veya eski ekran uyumluluğu için okunabilir.
- Yazma yolları kontrollü biçimde azaltılacak, sonra kaldırma/deprecated migration planı hazırlanacaktır.

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

### PR-ASSIGN-4 - Sorumlu Avukat Kanonikleştirme

Kapsam:

- `CaseLawyer.isResponsible` tek hukuki sorumluluk kaynağı olarak sabitlenir.
- `Case.sorumluPersonelId` deprecated okuma/yazma planı netleşir.
- `responsibleLawyerId`, `sorumluPersonelId`, batch update ve patchFlags uyumsuzlukları temizlenir.
- Avukat değişimi audit üretir.
- Görev devri için default "hiçbirini taşıma" davranışı korunur.

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
