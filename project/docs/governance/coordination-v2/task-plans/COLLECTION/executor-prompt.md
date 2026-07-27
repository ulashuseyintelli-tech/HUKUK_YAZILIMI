# EXECUTOR BRIEF — RCV-COL-W2.2D-1A-CHARACTERIZATION-R01

Bu dosya orchestrator tarafından executor'a **stdin'den** verilir
(`run-task.cjs --prompt <bu dosya>`). Bir insan tarafından yapıştırılmaz.

---

Sen izole bir git worktree içinde çalışıyorsun. Orchestrator seni çağırdı,
işini bitirdiğinde sonucu o toplayacak.

## GÖREV

`Collection` confirmation davranışını **testlerle karakterize et**.

Karakterizasyon: mevcut davranışı olduğu gibi çiviler. Yeni davranış üretmez,
mevcut davranışı düzeltmez, iyileştirmez.

## DOKUNABİLECEĞİN TEK DOSYA

```text
project/apps/api/src/modules/interest-engine/calc-prep/__tests__/payment-mapper.spec.ts
```

Başka **hiçbir** dosyaya dokunma. Yeni dosya oluşturma. Bu sınır orchestrator
tarafından gerçek diff'e karşı doğrulanır; dışına çıkan bir değişiklik
`BOUNDARY_ESCAPE` ile reddedilir ve iş boşa gider.

## ÇİVİLENECEK DAVRANIŞ

Bu dosya `mapPayments()`'ın Collection satırlarını nasıl işlediğini test ediyor.
Eklemen gereken, `confirmedAt`'in mevcut anlamsızlığını kayda geçiren
assertion'lar:

```text
B1  "confirmed" kararı YALNIZ status üzerinden verilir.
    confirmedAt bu karara girmez.

B2  confirmedAt bir effective-date authority DEĞİLDİR.
    (Dosyada zaten böyle bir test var: satır ~86-100. Onu genişlet,
     yerine yenisini yazma.)

B3  status=CONFIRMED ile confirmedAt=null birlikte var olabilir —
    bu bir tutarsızlık değil, bugünkü davranış.
```

Bu üçünü ifade eden testler yaz. Mevcut testleri bozma, mevcut assertion'ları
gevşetme.

## KESİNLİKLE YASAK

```text
confirmedAt için bir yazma yolu (writer) eklemek
status=CONFIRMED + confirmedAt=null'ın ne anlama geldiğine karar vermek
unapplied remainder / overpayment ile confirmation etkileşimini tanımlamak
herhangi bir production kaynak dosyasını değiştirmek
schema.prisma veya migrations altında herhangi bir değişiklik
mevcut bir testi silmek veya assertion'ını zayıflatmak
COL-RISK-G03'ü kapatmak veya statüsünü değiştirmek
```

Bir şeyin yanlış olduğunu düşünüyorsan **düzeltme** — raporla ve bırak.
Bu görev bir karakterizasyon görevi; yanlışı çivilemek de karakterizasyondur.

## BİTİRDİĞİNDE

```text
commit ETME
push ETME
PR AÇMA
merge ETME
```

Orchestrator diff'i doğrular, testleri koşar, PR'ı açar. Sen yalnız worktree'de
dosyayı bırak.

Şu komut senin bıraktığın hâlde geçmek zorunda — koşup gördükten sonra bitir:

```text
cd project/apps/api
pnpm exec jest --ci --forceExit --runInBand --runTestsByPath \
  src/modules/interest-engine/calc-prep/__tests__/payment-mapper.spec.ts
```

Bağımlılıklar ve Prisma client senin için zaten kuruldu.

## YETKİ

Bu brief bir execution grant DEĞİLDİR. Yetki `grant.json`'dadır ve orchestrator
tarafından zaten doğrulanmıştır — sen bu noktaya geldiysen o kapı geçilmiştir.
Buradaki sınırı genişletme yetkisi ne sende ne bu belgede vardır.
