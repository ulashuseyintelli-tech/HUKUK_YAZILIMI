# EXECUTOR BRIEF — OFFICE-CAP-09A-CONSUMER-01-R01

Bu dosya orchestrator tarafından executor'a **stdin'den** verilir
(`run-task.cjs --prompt <bu dosya>`). Bir insan tarafından yapıştırılmaz.

---

Sen izole bir git worktree içinde çalışıyorsun. Orchestrator seni çağırdı,
işini bitirdiğinde sonucu o toplayacak.

## GÖREV

`StaffService.remove()`'u `LawyerService.delete()` ile **aynı transactional
audit attribution paritesine** getir.

Referans davranış — bunu taklit et, yeniden tasarlama:

```text
lawyer.controller.ts:175-180   @CurrentUser("id") userId → delete(tenantId, id, { userId }, …)
lawyer.service.ts:528          async delete(tenantId, id, actor?, …)
lawyer.service.ts:638-650      await this.audit.logInTransaction(tx, {
                                 tenantId, action: "LAWYER_DEACTIVATE",
                                 entityType: "LAWYER", entityId: id,
                                 userId: actor?.userId, metadata: {…} })
```

Bugünkü durum:

```text
staff.controller.ts:64   async remove(@Request() req, @Param('id') id)
                         req.user.tenantId kullanıyor, ama AKTÖRÜ SERVİSE GEÇMİYOR
staff.service.ts:196     async remove(id, tenantId)  → $transaction içinde, audit YOK
                         constructor yalnız PrismaService alıyor
```

## DOKUNABİLECEĞİN DÖRT DOSYA

```text
project/apps/api/src/modules/staff/staff.service.ts
project/apps/api/src/modules/staff/staff.controller.ts
project/apps/api/src/modules/staff/__tests__/staff-deactivate-lifecycle.spec.ts
project/apps/api/src/modules/audit/__tests__/audit.service.attribution.spec.ts
```

Başka **hiçbir** dosyaya dokunma, yeni dosya oluşturma. En fazla 4 dosya
değişebilir. Sınır orchestrator tarafından gerçek diff'e karşı doğrulanır;
dışına çıkan bir değişiklik `BOUNDARY_ESCAPE` ile reddedilir.

`staff.module.ts` sınır dışıdır ve **gerekmiyor**: `AuditModule` `@Global()`,
`app.module.ts` onu zaten import ediyor. `AuditService`'i inject etmek için
modül değişikliği yapmana gerek yok.

## TAKSONOMİ — PİNLİ, SEÇİM DEĞİL

```text
action     : "STAFF_DEACTIVATE"
entityType : "STAFF"
```

Bunlar `LAWYER_DEACTIVATE` / `LAWYER` çiftinin birebir aynasıdır ve owner
tarafından plan hash'i içinde ratifiye edilmiştir. Başka bir isim seçme.

## AKTÖR AKTARIMI ZORUNLU

Attribution'sız audit bu görevin engellemek için var olduğu dejenere sonuçtur.
`userId` controller'dan servise geçmeli. Repoda request-scoped bir actor context
yok; `staff.controller.ts:65` zaten `req.user.tenantId` okuyor, `req.user.id`
de oradadır.

## KESİNLİKLE YASAK

```text
AuditLog şemasını değiştirmek
yeni audit taksonomisi üretmek (yukarıdaki iki string dışında)
CAP-09A-FOUNDATION / SLICE 2 kapsamını örtük olarak uygulamak
başka staff lifecycle işlemlerini (create/update/updateOrder) değiştirmek
maskListRow() veya tenant scoping davranışını değiştirmek
mevcut bir testi silmek veya assertion'ını zayıflatmak
```

`staff-deactivate-lifecycle.spec.ts` ratifiye `CANDIDATE-A` kontratını koruyan
tek testtir (`count !== 1` → tam rollback, "best-effort YASAK"). Constructor
değişikliği için düzeltmen gerekebilir — ama o assertion'lara **dokunma**.

## BİTİRDİĞİNDE

```text
commit ETME · push ETME · PR AÇMA · merge ETME
```

Orchestrator diff'i doğrular, testleri koşar, PR'ı açar.

Şu iki komut senin bıraktığın hâlde geçmek zorunda:

```text
cd project/apps/api

pnpm exec jest --ci --forceExit --runInBand --runTestsByPath \
  src/modules/audit/__tests__/audit-metadata-builder.spec.ts \
  src/modules/audit/__tests__/audit.service.attribution.spec.ts

pnpm exec jest --ci --forceExit --runInBand --runTestsByPath \
  src/modules/staff/__tests__/staff-deactivate-lifecycle.spec.ts \
  src/modules/staff/__tests__/staff-duplicate-guard.spec.ts \
  src/modules/staff/__tests__/staff-list-masking.spec.ts \
  src/modules/staff/__tests__/staff-update-duplicate-guard.spec.ts
```

İkinci komuttaki dört spec'ten **üçü sınırın dışındadır** — onları
düzeltemezsin, yalnız kırmamak zorundasın. Bağımsız koruyucu olmaları için
böyle kuruldu. `staff-list-masking.spec.ts` ratifiye PII maskelemesinin tek
koruyucusudur.

Bağımlılıklar ve Prisma client senin için zaten kuruldu.

## YETKİ

Bu brief bir execution grant DEĞİLDİR. Yetki `grant.json`'dadır ve orchestrator
tarafından zaten doğrulanmıştır. Buradaki sınırı genişletme yetkisi ne sende ne
bu belgede vardır.
