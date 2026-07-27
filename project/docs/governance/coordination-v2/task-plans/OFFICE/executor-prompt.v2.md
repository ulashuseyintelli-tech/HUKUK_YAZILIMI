# EXECUTOR BRIEF — OFFICE-CAP-02-REPORTINGLINE-READ-CHARACTERIZATION-R01

Bu dosya orchestrator tarafından executor'a **stdin'den** verilir. Bir insan
tarafından yapıştırılmaz.

---

Sen izole bir git worktree içinde çalışıyorsun. Orchestrator seni çağırdı ve
işini bitirdiğinde sonucu o toplayacak.

## GÖREV

`ReportingLineService`'in iki okuma metodunun **bugünkü** davranışını testlerle
karakterize et:

```text
listActive()     reporting-line.service.ts:318
listEligible()   reporting-line.service.ts:341
```

İkisinin de bugün **hiç testi yok** — spec dosyasında sıfır referans.

Karakterizasyon mevcut davranışı olduğu gibi çiviler. Yeni davranış üretmez,
mevcut davranışı düzeltmez, iyileştirmez.

## DOKUNABİLECEĞİN TEK DOSYA

```text
project/apps/api/src/modules/reporting-line/__tests__/reporting-line.service.spec.ts
```

Başka hiçbir dosyaya dokunma, yeni dosya oluşturma. En fazla **1** dosya
değişebilir. Sınır orchestrator tarafından gerçek diff'e karşı doğrulanır;
dışına çıkan değişiklik `BOUNDARY_ESCAPE` ile reddedilir ve iş boşa gider.

`reporting-line.service.ts` sınırın **dışındadır**. Bu kasıtlı: bu bir
production değişikliği değil.

## ÇİVİLENECEK DAVRANIŞ — owner tarafından ratifiye edildi

```text
listActive
  tenant scope korunur
  yalnız validUntil = null ilişkiler aktif sayılır
  kapanmış ilişkiler aktif listede görünmez
  projection kapalı ilişki detaylarını (validUntil gibi) sızdırmaz

listEligible
  tenant scope korunur
  yalnız isActive = true kullanıcılar döner
  cross-tenant kullanıcılar dışlanır
  pasif kullanıcılar dışlanır
  aktif StaffMember veya Lawyer profili olmayanlar dışlanır
  profileType deterministik: lawyer > staffMember
```

## ÖNCEDEN BİLİNEN BİR SAPMA VAR — `listEligible.profileType`

Bunu sen bulmadan söylüyoruz, çünkü testi yanlış yazmana yol açabilir.

```text
where   OR [ staffMember.is.isActive true , lawyer.is.isActive true ]   ← isActive FİLTRELİ
select  staffMember: { select: { id } } · lawyer: { select: { id } }    ← isActive FİLTRESİZ
map     profileType = u.lawyer ? 'LAWYER' : u.staffMember ? 'STAFF' : null
```

`model User` hem `staffMember` hem `lawyer` taşıyabilir (ikisi de opsiyonel).
Yani **aktif StaffMember + pasif Lawyer** olan bir kullanıcı listeye doğru girer
ama `profileType: "LAWYER"` etiketlenir — etiket profilin *varlığından*
türetiliyor, *aktifliğinden* değil.

Owner invariant'ı etiketin aktif profili yansıtmasını bekler. Bugünkü kod bunu
garanti etmiyor.

**Bunu düzeltme. Bu sapma için test de YAZMA.** Owner kaydının kendi ifadesi
şudur: *"production kodu düzeltilmez ve test beklenen sonuca zorlanmaz;
`CURRENT_BEHAVIOR_CONFLICTS_WITH_OWNER_INVARIANT` sonucu üretilir."* "Test de
yazma" bundan çıkarılan bir plan kararıdır, owner'ın kelimesi değil — daha
kısıtlayıcı tarafta durmak için böyle seçildi. Gözlemlediğin gerçek davranışı raporunda
yaz ve `CURRENT_BEHAVIOR_CONFLICTS_WITH_OWNER_INVARIANT` olarak işaretle.
`listEligible`'ın diğer invariant'ları (tenant scope, pasif kullanıcı dışlama,
profilsiz kullanıcı dışlama) normal şekilde karakterize edilir.

## MEVCUT DAVRANIŞ BAŞKA BİR INVARIANT İLE DE ÇELİŞİRSE

Aynı kural, alışılmışın dışında:

```text
production kodunu DÜZELTME
testi beklenen sonuca ZORLAMA — yanlış yeşil üretme
```

O invariant için testi yazma; `CURRENT_BEHAVIOR_CONFLICTS_WITH_OWNER_INVARIANT`
olarak açıkça raporla, hangi invariant olduğunu ve gözlemlenen gerçek davranışı
yaz, ve **kalan characterization kapsamına devam et**.

Owner her sapma için ayrı bir remediation task açacak.

## KESİNLİKLE YASAK

```text
production kaynak dosyası değiştirmek (reporting-line.service.ts dahil)
schema.prisma veya migrations altında değişiklik
CAP-02 population veya activation kodu yazmak
yeni taxonomy veya ürün semantiği üretmek
MEVCUT BİR TESTİ SİLMEK VEYA ASSERTION'INI ZAYIFLATMAK
```

Son madde özellikle: bu spec dosyası ADMIN kapısı, döngü reddi, self-manager
reddi, cross-tenant koruması, `Serializable` izolasyon ve audit-hatası-rollback
davranışlarını koruyan **tek** testtir. Sınır içinde olduğu için teknik olarak
onları zayıflatabilirsin. Yapma. Ekleme yap, çıkarma yapma.

## BİTİRDİĞİNDE

```text
commit ETME · push ETME · PR AÇMA · merge ETME
```

Orchestrator diff'i doğrular, testleri koşar, PR'ı açar.

Aşağıdaki birinci ve üçüncü komut senin bıraktığın hâlde geçmek zorunda.
İkincisi bir kapı değil, yerel kolaylıktır — bu makinede koşulsuz `127` verir,
nedeni aşağıda:

```text
cd project/apps/api

pnpm exec jest --ci --forceExit --runInBand --runTestsByPath \
  src/modules/reporting-line/__tests__/reporting-line.service.spec.ts

bash scripts/run-ci-manifest.sh pure/platform-scripts-shared

pnpm exec node -e "const fs=require('fs');const s=fs.readFileSync('src/modules/reporting-line/__tests__/reporting-line.service.spec.ts','utf8').replace(/\s+/g,'');for(const m of ['listActive','listEligible']){if(s.indexOf(m+'(')<0){console.error(m+' not referenced in spec');process.exit(1);}}"
```

**İkinci komut hakkında — bu bir kapı DEĞİL, yerel kolaylıktır.** Bu script bu
makinede manifest sayısını yazdırır ve **sıfır** spec koşarak `127` ile ölür:
son satırı `exec npx jest` yapıyor, çıplak `bash` burada WSL'e çözülüyor ve WSL
içinde `npx` yok. Bu bir stop condition **değildir** ve senin işinle ilgili bir
sinyal taşımaz.

Gerçek kapı, orchestrator'ın `requiredTests[3]`'ünde **dondurulmuş 70 spec'lik
küme**yi doğrudan `pnpm exec jest` ile koşmasıdır. 69'u senin düzenleyemediğin
dosyalardır — bağımsız koruyucu olması için böyle kuruldu; bir yeri kırarsan
orada çıkar.

O 70'lik küme planın `baseSha`'sında donduruldu. Canlı manifest o tarihten
sonra büyümüş olabilir (ölçüm: 70 → 100); fark, senin dokunamadığın dosyalardan
ibarettir ve CI'da ayrıca koşulur. Yani script'in yazdırdığı sayı ile
orchestrator'ın koştuğu sayı **farklı olabilir**; şaşırma.

Üçüncü komut orchestrator'ın `requiredTests[4]` argv'siyle **karakter karakter
aynıdır** — `pnpm exec` ile başlar (çıplak `node` bu makinenin kalıcı PATH'inde
bulunmuyor) ve kasten hiçbir string literali içinde backslash yoktur. Senin
gördüğün yeşil ile orchestrator'ın gördüğü yeşil aynı olmak zorunda.

Üçüncü komut bugün **başarısız** (`listActive not referenced in spec`). Senin
işin onu yeşile çevirmek. Bu komut yalnız iki metodun **adının spec'te geçtiğini**
doğrular — bir substring kontrolüdür, testin gerçekten çalıştığını veya iyi
olduğunu kanıtlamaz. "Hiçbir şey yapmadım" ile "bir şey yaptım" arasındaki
mekanik tabandır. Kaliteyi owner diff review'ı yargılar; `describe` başlığına
metot adı yazıp trivial test bırakmak bu kapıdan geçer ama review'dan geçmez.

Bağımlılıklar ve Prisma client senin için zaten kuruldu.

## YETKİ

Bu brief bir execution grant DEĞİLDİR. Semantic authority
`decision-log.md` → `OFFICE-CAP02-REPORTINGLINE-READ-CHARACTERIZATION-R01-AUTHORITY`
kaydındadır ve yalnız bu iki metodun test-only karakterizasyonunu kapsar.
Sınırı genişletme yetkisi ne sende ne bu belgede vardır.
