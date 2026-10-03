# H3 · H6 · H8 — hizmet kabulü: ölçüt, tamamlanmış kanıt, sınır ve owner beyan taslakları (R01) · 2026-10-02

> **Bu belge kabul vermez ve sayaç ilerletmez.** Hizmet kabulü **0/8**'dir; H3, H6 ve H8 için owner hizmet-kabulü kaydı **yoktur**
> (`decision-log.md` içinde H hizmet-kabulü veren satır araması: 0). Aşağıdaki beyan metinleri **taslaktır**; imza ve karar owner'ındır. İmzalanmadıkça
> hiçbir H ilerlemez; imzalanan metin `decision-log.md`'ye ayrı satırla işlenir.
>
> Yöntem: yalnız governance belgeleri okundu ve kaynak karşılaştırması `git diff` ile yapıldı (2026-10-02; salt okuma). Kanıt
> dizinleri açılmadı, hiçbir test ya da koşucu çalıştırılmadı. **PASS sayıları kapanış kayıtlarının kendi etiketleridir** [B].
> Tazelik yalnız **kaynak** düzeyindedir; canlı derleme dosyalarının özet eşitliği bu çalışmada ölçülmedi.

## 1. "Yalnız imza bekliyor" iddiasının doğrulanması

| H | İddia | Doğrulama sonucu |
|---|---|---|
| H3 Vekâlet | yalnız imza | **Kayıt düzeyinde doğru, bir farkla**: bekleyen ayrı hüküm (R27 §10 K-12 kalemi) yok, ama beyan imzayla birlikte **bir seçim** ister (ölçülmeyen kalemler: kabul dışı / ayrı canlı ölçüm); ikincisi seçilirse H3 yalnız imzayla kapanmaz. Ancak ölçülmeyen yollar kayıtta "kabul dışı" diye yazılı değil; imza metnine yazılmazsa örtük kabul edilmiş olur (§2.3) |
| H6 Gönderim | yalnız imza | **Kayıt düzeyinde doğru**: R27 §10 K-12 kalemleri arasında H6 yok. CLAIM / RECLAIM / HANG için "yalnız kaydet" kararı yalnız İ12 kapanış kaydında geçer; `decision-log.md`'de ayrı satırı yoktur → beyan metni bu kararı açıkça yineler (§3.3) |
| H8 Muhasebe kayıt kapanışı (F04) | yalnız imza | **Kayıt düzeyinde doğru**: yöntem ve ifade kararları verilmiş (decision-log 2026-09-18 ve 2026-09-22 satırları). Beyan "canlı yarış testi değildir" lafzını **korumak zorundadır** (§4.3) |

Not: önceki tabloda H8 "Finansal/izlenebilirlik" diye anılmıştı; kayıtlardaki ad **"Muhasebe kayıt kapanışı (F04) + kilit bütçesi
ifadesi"**dir. Genel bir denetim izi kabulü ölçülmemiştir.

## 2. H3 — Vekâlet (teknik kilometre taşı: CLIENT İ10)

### 2.1 Ölçüt

Kapanış koşulu: "beş gözlem PASS; yetkisiz denemelerde dosya/DB yazımı 0".

| Kimlik | Ölçüt |
|---|---|
| A-1 | Görüntüleyici vekâlet oluşturamaz: 403; vekâlet ve denetim kaydı değişmez |
| A-2 | Yetkisi olmayan kullanıcı vekâleti güncelleyemez: 403; satır ve denetim kaydı değişmez |
| A-3 | Yetkili kullanıcı vekâlet oluşturur: 201; vekâlet +1, denetim kaydı +1 |
| A-4 | Yetkisiz dosya yükleme reddedilir: 403; satır/denetim aynı, depolamada dosya 0 |
| K9 | Geçerli vekâleti olmayan müvekkilde dört yetenek etkisizdir |

### 2.2 Tamamlanmış kanıt [B]

- Canlı koşum: runId `c9b07bcb`, 2026-09-12, çıkış 0; sentetik büro; tek koşum.
- Sayılar: PASS 10 · FAIL 0 · ÖLÇÜLEMEYEN 0 (5 ölçüt gözlemi + 5 ölçüm geçerliliği kalemi); üç yetkisiz deneme de 403.
- Bağımsız salt-okuma doğrulama: yazma kümesi onaylı envanterle birebir; dosya 0.
- Kayıt: `client-live-acceptance-i10-r01/CLIENT-LIVE-ACCEPTANCE-I10-R01.md` §12, §14.2, §14.3, §14.6 ·
  `decision-log.md` 2026-09-12 satırı (CLIENT-I10-LIVE-R01: "hizmet kabulü 0/8 DEĞİŞMEDİ").
- Tazelik [Ö]: ölçüm kaynağı `13740670` (RELEASE22). İ10'un davranışı belirleyen **altı kaynak dosyasında** (vekâlet servisi ve
  denetleyicisi; müvekkil modülündeki yetki eşiği, vekâlet yeteneği değerlendiricisi ve ucu; ortak depolama yolu) `13740670` →
  `1b758d29` (canlı R27) arasında **0 fark**; vekâlet modülünün tamamında da 0 (9 dosya). Müvekkil modülünde aynı aralıkta test dışı
  yalnız müvekkil servisi değişti (#2645) — ölçülen yolların dışındadır. Altı dosya yayın adayı taslağında da değişmiyor. Canlı derleme
  özeti ayrıca karşılaştırılmadı.

### 2.3 Sınırlar (canlıda ölçülmedi)

Vekâlet iptali · avukat ekleme/çıkarma ve dosyaya bağlama (sihirbaz dahil) · yetkili yükleme, indirme, dosya silme (yalnız ret
ölçüldü) · ADMIN rolüyle yazma · süre dolumu ve süre bildirimi zamanlanmış işleri · web ekranları · gerçek büro verisi.

### 2.4 Beyan taslağı

```text
H3 — VEKÂLET · HİZMET KABULÜ BEYANI

1. Dayanak. CLIENT İ10 canlı kabul koşumu (runId c9b07bcb, 2026-09-12; PASS 10 · FAIL 0 · ÖLÇÜLEMEYEN 0) bir TEKNİK ÖLÇÜT
   KAPANIŞIDIR. Bu beyan o kapanıştan ayrı, benim hizmet kabulü kararımdır.

2. Kabul ettiğim kapsam — yalnız şu beş gözlem:
   A-1: Görüntüleyici vekâlet oluşturamaz (403, yazma 0).
   A-2: Yetkili olmayan kullanıcı vekâleti güncelleyemez (403, kayıt değişmez).
   A-3: Yetkili kullanıcı vekâlet oluşturur (201, denetim kaydı yazılır).
   A-4: Yetkisiz dosya yükleme reddedilir (403, dosya ve veritabanı yazımı 0).
   K9:  Geçerli vekâleti olmayan müvekkilde tahsil / sulh / feragat / ibra yetkileri etkisizdir.

3. Bu kabulün KAPSAMADIĞI — canlıda ölçülmedi, kabul edilmiş sayılmaz:
   a) vekâlet iptali;
   b) vekâlete avukat ekleme/çıkarma ve vekâletin dosyaya bağlanması (dosya açma sihirbazı dahil);
   c) yetkili kullanıcının dosya yüklemesi, indirmesi ve dosya silmesi;
   d) ADMIN rolüyle yazma yolu;
   e) vekâlet süre dolumu ve süre bildirimi zamanlanmış işleri;
   f) web ekranları (ölçüm API düzeyindedir) ve gerçek büro verisi (ölçüm sentetik büroda yapıldı).
   Bu kalemler için karar: [ ] kabul dışı / sonraki iş   [ ] ayrı canlı ölçüm istiyorum

4. Sürüm. Ölçüm RELEASE22 kaynağında (13740670) yapıldı. Canlıdaki R27 adayı (1b758d29) ile arasında, ölçümü belirleyen altı
   kaynak dosyada (vekâlet servisi ve denetleyicisi, müvekkil modülündeki yetki eşiği ile vekâlet yeteneği dosyaları, depolama
   yolu) fark yoktur (git diff, 2026-10-02); canlı derleme ayrıca karşılaştırılmamıştır. Kabulüm canlıdaki bu sürüme aittir; bu
   yolları değiştiren bir yayında yeniden değerlendirilir.

5. Karar. Yukarıdaki sınırlarla H3 hizmetini kabul ediyorum. Bu beyan yalnız H3'e aittir.

Tarih: ____ / ____ / ________          İmza (owner): ______________________
```

## 3. H6 — Gönderim (teknik kilometre taşı: CLIENT İ12)

### 3.1 Ölçüt

Kapanış koşulu: yedi gözlem canlıda PASS + güvenli kapanış + bağımsız doğrulama PASS.

| Kimlik | Ölçüt |
|---|---|
| G1 | Sağlayıcı reddederse bilgi talebi kaydı oluşmaz (503) |
| G2 | Sağlayıcı yanıt vermezse sonuç "belirsiz"; kayıt oluşmaz; ikinci çağrı yok |
| G3 | Onaylı sağlayıcıyla finansal beyan yayını tamamlanır; gönderim ve yayın denetim kayıtları birer kez |
| G4 | Aynı yayının ikinci denemesi ilerlemez |
| G5 | Onaylı listede olmayan sağlayıcıyla yayın reddedilir; bağlantı kurulmaz |
| G6 | "Gönderildi" ve "yayımlandı" iki ayrı denetim kaydıdır |
| G7 | Aylık ekstre teslimi hedef büroda bir kez; yabancı büroda 0; ikinci tetikte 0 |

### 3.2 Tamamlanmış kanıt [B]

- Canlı koşum: runId `92d04ef3`, 2026-09-18 (canlı sürüm R24); üç faz 10/10 + 4/4 + 3/3 = **17/17 PASS**.
- Bağımsız kapanış doğrulaması 10/10 PASS (ayrı süreç, salt okuma). İlk doğrulayıcı koşumu 8 PASS · 2 ÖLÇÜLEMEYEN idi; iki ölçüt
  sıkılaştırılarak düzeltildi ve yalnız salt-okuma doğrulama yeniden koşuldu.
- Hedef dışı taraması: yakalanan gönderimlerde hedef dışı alıcı 0; sentetik olmayan bürolarda iz 0.
- Kayıt: `client-live-acceptance-i12-r01/CLIENT-LIVE-ACCEPTANCE-I12-R01.md` §9.15 ve §9.15-ek · `decision-log.md` 2026-09-18 ve
  2026-09-19 satırları (ikisi de hizmet kabulünün 0/8 kaldığını yazar).
- Tazelik [Ö]: ölçüm kaynağı `006c4dd2` (R24). `006c4dd2` → `1b758d29` arasında API kaynağının **tamamında** test dışı yalnız 7 dosya
  değişti; hepsi portal, giriş hız sınırı ve vekil sunucu ayarıdır — gönderim yollarında (finansal beyan 44 dosya, ekstre 28,
  bildirim 8, bilgi talebi servisi) **0 fark**. **Uyarı (canlıda değil):** `main`'de finansal beyan modülünde 4, ekstre modülünde 3 test dışı dosya
  değişti; yayınlanırlarsa H6 tazeliği yeniden ölçülür. Yayın adayı taslağı finansal beyan modülünde 4 test dışı dosyayı değiştiriyor.

### 3.3 Sınırlar

Bütün gönderimler **test alıcısına** gitti; gerçek sağlayıcı ve gerçek alıcı ölçülmedi · CLAIM / RECLAIM / HANG canlıda ölçülmedi
(kanıt yalnız ayrı test ortamında; canlı sayıya eklenmez) · aylık teslim canlıda **elle** tetiklendi; takvimin kendiliğinden
çalışması canlıda gözlenmedi · onaylı listedeki diğer sağlayıcılar ve büronun gerçek e-posta hesabı ölçülmedi · yedi gözlemin
dışındaki gönderim türleri (davet, parola sıfırlama, hatırlatma vb.) kapsam dışı · koşum sırasında yerel erişim teknik olarak
engellenmedi, kullanılmama koşuluna bağlandı · web ekranları ölçülmedi.

### 3.4 Beyan taslağı

```text
H6 — GÖNDERİM · HİZMET KABULÜ BEYANI

1. Dayanak. CLIENT İ12 canlı kabul koşumu (runId 92d04ef3, 2026-09-18; canlı ölçüm 17/17 PASS · FAIL 0 · ÖLÇÜLEMEYEN 0;
   bağımsız doğrulama 10/10) bir TEKNİK ÖLÇÜT KAPANIŞIDIR. Bu beyan o kapanıştan ayrı, benim hizmet kabulü kararımdır.

2. Kabul ettiğim kapsam — yalnız şu yedi gözlem:
   G1: Sağlayıcı reddederse bilgi talebi kaydı oluşmaz (503).
   G2: Sağlayıcı yanıt vermezse sonuç "belirsiz" sayılır, kayıt oluşmaz, ikinci gönderim denenmez.
   G3: Onaylı sağlayıcıyla finansal beyan yayını tamamlanır; gönderim ve yayın denetim kayıtları birer kez yazılır.
   G4: Aynı yayın ikinci kez ilerlemez.
   G5: Onaylı listede olmayan sağlayıcıyla yayın reddedilir, hiçbir şey gönderilmez.
   G6: "Gönderildi" ve "yayımlandı" denetim kayıtları ayrıdır.
   G7: Aylık ekstre teslimi hedef büroda bir kez yapılır; başka büroya taşmaz; aynı dönemde tekrarlanmaz.

3. Bu kabulün KAPSAMADIĞI — kabul edilmiş sayılmaz:
   a) Bütün gönderimler TEST ALICISINA yapılmıştır; gerçek sağlayıcıya ve gerçek alıcıya gönderim ölçülmemiştir.
   b) CLAIM / RECLAIM / HANG (eşzamanlı yayın, ret sonrası yeniden deneme, yanıtsız sağlayıcı) CANLIDA ÖLÇÜLMEMİŞTİR; kanıtı
      yalnız ayrı test ortamındadır. Bu konudaki "yalnız kaydet" kararımı burada yineliyorum; canlı kabul sayısına dahil değildir.
   c) Aylık teslim canlıda elle tetiklenerek ölçülmüştür; takvimin kendiliğinden çalışması canlıda gözlenmemiştir.
   d) Onaylı listedeki diğer sağlayıcılar ve büronun gerçek e-posta hesabıyla gönderim ölçülmemiştir.
   e) Yedi gözlemin dışındaki gönderim türleri (davet, parola sıfırlama, hatırlatma vb.) ve web ekranları bu kabulün dışındadır.
   f) Koşum sırasında yerel erişim teknik olarak engellenmemiş, kullanılmama koşuluna bağlanmıştır.

4. Sürüm. Ölçüm R24 kaynağında (006c4dd2) yapıldı. Canlıdaki R27 adayı (1b758d29) ile arasında gönderim yollarında kaynak farkı
   yoktur (git diff, 2026-10-02); canlı derleme ayrıca karşılaştırılmamıştır. Ana daldaki, henüz yayınlanmamış gönderim
   değişiklikleri bu kabulün dışındadır; yayınlandıklarında kabul yeniden değerlendirilir.

5. Karar. Yukarıdaki sınırlarla H6 hizmetini kabul ediyorum. Bu beyan yalnız H6'ya aittir.

Tarih: ____ / ____ / ________          İmza (owner): ______________________
```

## 4. H8 — Muhasebe kayıt kapanışı (F04) + kilit bütçesi ifadesi (teknik kilometre taşı: CLIENT İ15)

### 4.1 Ölçüt

Kapanış koşulu: "KABUL-5 PASS; kalan yedi senaryo için seçilen kanıt yöntemi kayıtlı ve uygulanmış".

| Kimlik | Ölçüt |
|---|---|
| K5-0 | Hedef büronun dağıtımı ön koşulda muhasebeleştirilmemiş |
| K5-1 | Başka büronun aktörü muhasebeleştirmeyi dener: yalnız 403 ya da 404 kabul (canlıda 404) |
| K5-2 | Hedefte finansal ve denetim izi oluşmaz |
| K5-CLOSE | Kapanış: sentetik kullanıcılar pasif, dosya kapalı, giriş ve eski oturum reddi |
| K5-ISO | Sentetik olmayan büroların parmak izi önce ve sonra aynı |
| İ5(b) test | Yedi senaryo (A, 1, 2, 3, 4, B, D) ayrı veritabanında, canlı R24 kaynağında |
| İ5(b) tarama | Canlı salt-okuma tutarlılık taraması |
| İfade | Kabul betiğinin kilit bütçesi 3500 ms (tavan 4000 ms); üründe süre taahhüdü yok |

### 4.2 Tamamlanmış kanıt [B]

- Canlı koşum (KABUL-5): runId `1b83637a`, 2026-09-20, çıkış 0; **5/5 PASS**; bağımsız kapanış doğrulaması 7/7 PASS (salt okuma).
- İ5(b) test kanıtı: kaynak `006c4dd2`, ayrı tek kullanımlık veritabanı, 10/10 PASS. **Bu bir test kanıtıdır, canlı ölçüm değildir.**
- İ5(b) canlı tarama (2026-09-18, 16 dağıtım): bir denetim dışında ihlal 0; o denetimde 4 kayıt (3 gerçek eski kayıt + 1 sentetik).
- Kayıt: `client-live-acceptance-i15-r01/CLIENT-LIVE-ACCEPTANCE-I15-R01.md` §4 · `decision-log.md` 2026-09-18 (yöntem kararı:
  "canlı yarış testi PASS olarak sunulmaz"), 2026-09-20 (kapanış; "kapsam sınırı: canlı yarış testi değildir") ve 2026-09-22
  (ifade onayı) satırları.
- Tazelik [Ö]: `006c4dd2` → `1b758d29` ve `4443600a` → `1b758d29` arasında tahsilat/dağıtım kayıt modülünde (73 dosya) ve yevmiye
  modülünde (44) **0 fark**. **Uyarı (canlıda değil):** `main`'de kayıt modülünde 13, yevmiye modülünde 1 test dışı dosya değişti
  ve adaydan sonra 5 migration eklendi; yayınlanırlarsa yedi senaryoluk test kanıtı o kaynakta yenilenmeden taze sayılmaz. Yayın adayı
  taslağı kayıt modülünde 10 test dışı dosyayı değiştiriyor (migration 0).

### 4.3 Sınırlar

**Canlı yarış testi değildir**: eşzamanlı çift kayıt canlıda koşulmadı · yedi senaryo ayrı veritabanında, sıralaması denetimli
kurularak koşuldu (serbest yarış üretmez) · canlı tarama "ihlal izi bulunmadı" sonucu canlı eşzamanlılık ispatı değildir ve tarama
gününe aittir · kilit davranışı canlıda ölçülmedi; kilit süresi için ürün taahhüdü yok · yevmiye mekanizmasından önce kaydedilmiş
üç gerçek eski kayıt yevmiyesizdir (yalnız okundu; doldurma kararı owner'da, **açık**) · başarılı muhasebeleştirme R25B/R27
üzerinde canlıda yeniden ölçülmedi · genel denetim izi kabulü ve web ekranları ölçülmedi.

### 4.4 Beyan taslağı

```text
H8 — MUHASEBE KAYIT KAPANIŞI (F04) · HİZMET KABULÜ BEYANI

1. Dayanak. CLIENT İ15 canlı kabul koşumu (KABUL-5; runId 1b83637a, 2026-09-20; 5/5 PASS · FAIL 0 · ÖLÇÜLEMEYEN 0; bağımsız
   doğrulama 7/7) bir TEKNİK ÖLÇÜT KAPANIŞIDIR. Bu beyan o kapanıştan ayrı, benim hizmet kabulü kararımdır.

2. Kabul ettiğim kapsam:
   a) Canlıda ölçülen: bir büronun kullanıcısı başka bir büronun dağıtımını muhasebeleştiremez (404) ve hedefte hiçbir finansal
      ya da denetim izi oluşmaz; erişim kapanışı ve büro izolasyonu doğrulanmıştır.
   b) Test kanıtı: tahsilat kaydı / iptal yarışının yedi senaryosu (A, 1, 2, 3, 4, B, D) canlı R24 kaynağında, AYRI bir
      veritabanında geçmiştir (10/10).
   c) Canlı salt-okuma tutarlılık taraması (2026-09-18): yarım yazım ya da çift kayıt izi bulunmamıştır.
   d) İfade: kabul betiğinin kilit bütçesi 3500 ms'dir (tavan 4000 ms); ürün tarafında süre taahhüdü yoktur.

3. Bu kabulün KAPSAMADIĞI — kabul edilmiş sayılmaz:
   a) Bu bir CANLI YARIŞ TESTİ DEĞİLDİR. Eşzamanlı çift kayıt canlıda denenmemiştir; (b) maddesi test kanıtıdır, "canlı yarış
      testi geçti" anlamına gelmez. Testte sıralama denetimli kurulur, serbest yarış üretilmez.
   b) Canlı tarama, yarışın canlıda yaşanıp doğru sonuçlandığını göstermez; yalnız kalıcı kayıtların tutarlı olduğunu gösterir
      ve tarama gününe aittir.
   c) Kilit davranışı canlıda ölçülmemiştir. Kilit süresi için hizmet taahhüdü vermiyorum.
   d) Yevmiye mekanizmasından önce kaydedilmiş üç eski gerçek kayıt yevmiyesizdir; yalnız okunmuş, veri yazılmamıştır. Bu konu
      ayrı kararımı bekler.
   e) Başarılı muhasebeleştirme bu sürümde canlıda yeniden ölçülmemiştir; web ekranları ve genel denetim izi kapsamı bu kabulün
      dışındadır.

4. Sürüm. Canlı ölçüm R25B, test kanıtı R24 kaynağındadır (006c4dd2). Canlıdaki R27 adayı (1b758d29) ile aralarında ilgili
   muhasebe yollarında kaynak farkı yoktur (git diff, 2026-10-02); canlı derleme ayrıca karşılaştırılmamıştır. Ana daldaki,
   henüz yayınlanmamış kayıt/yetki değişiklikleri bu kabulün dışındadır; yayınlandıklarında test kanıtı o kaynakta yenilenmeden
   bu kabul geçerli sayılmaz.

5. Karar. Yukarıdaki sınırlarla H8 hizmetini kabul ediyorum. Bu beyan yalnız H8'e aittir.

Tarih: ____ / ____ / ________          İmza (owner): ______________________
```

## 5. Diğer beş hizmet — imzadan önce gereken hükümler (beyan taslağı yazılmadı)

| H | İmzadan önce gereken hüküm |
|---|---|
| H1 Kimlik | B-2 için "kabul dışı / ürün işi" hükmü (bugünkü "bloke etmez" ifadesi belgenin hükmüdür; owner kararı bulunamadı) + tazelik hükmü (ölçümden sonra müvekkil servisinde #2645 değişikliği) |
| H2 Adres/iletişim | KB-03 / H2-10: (a) mevcut davranış kabul ya da (b) ayrı ürün işi — ölçüm (a) önerisiyle yapıldı, owner kararı yok |
| H4 Talimat/beyan/rıza | H4-08'in "gerçek yayın" ayağı test alıcısı kanıtına bağlı: "bağlı kanıt yeterli" ya da "gerçek sağlayıcıyla ayrı ölçüm" hükmü. H6 beyanındaki "gerçek sağlayıcı ölçülmedi" sınırıyla **çelişmemelidir** |
| H5 Bilgi/belge toplama | R27 §10 K-13: toplu metne dahil değil; ayrı hizmet-kabulü satırı + B-I11-2 hükmü |
| H7 Portal | H7-05b · K-1 · PSUS yalnız tek kullanımlık ortamda ölçüldü: "yeterli" ya da D-6 canlı koşumuna bağlama hükmü. **Tazelik hükmü zorunlu**: ölçümden sonra portal servis/controller/dto değişti (D-5 düzeltmeleri); kanıt canlı R27 portal koduna birebir ait değildir |

`office-remaining-decisions-r01` §4'teki hazır toplu metin **olduğu gibi imzalanmamalıdır**: aynı belgenin §7.1'i o metnin iki
hatasını kayda geçirir, H3 runId'sini vermez ve R27 §10 K-12 kalemlerini örtük kabul ettirir.

## 6. Bilinen kayıt tutarsızlıkları (bu belgeyle düzeltilmedi)

- `H1-H8-ACIK-OLCUTLER-R01.md` içindeki `product-backlog.md` satır atıfları kaymıştır (başlık ve H satırları ileri taşındı).
- İ10 belgesindeki "R27 derlemesi" ifadesi RELEASE22 adayının R27 revizyonudur; CLIENT R27 yayını (`1b758d29`) ile aynı şey değildir.
- İ10/İ12 belgelerinin atıf yaptığı "CLIENT bütünsel canlı teslim planı R02" depoda izlenen dosyalar arasında bulunamadı; H3 plan
  satırı yalnız ikincil alıntılardan okunabildi. Plan owner'da ise H3 beyanının 3. maddesi onunla karşılaştırılmalıdır.
