# OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01 — Parent Authorization Envelope

<!-- GOV-COORD-AUTHORITY kind=PROGRAM_AUTHORIZATION recordId=OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01 -->

```text
Authorization ID : OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01
Owner            : Ulaş Hüseyin Telli
payloadSha256    : 5b7c8f9523c8fed93b2b15c47b51a157ed366941f224742dd3dd2b4a26d0adab
Payload          : parent-authorization-payload.json
Serial execution : maxConcurrency 1
Auto-merge       : AUTHORIZED for orchestration-owned PRs under this envelope
Repo-wide auto-merge : NEVER
```

Bu belge owner'ın program-seviyesi kararının **transkripsiyonudur**. Yeni bir
owner kararı üretmez; onu normalize edip hash'e bağlar, böylece alt görevler
tek tek owner onayı istemeden ama **kanıtlanabilir bir çatı altında** türetilir.

`payloadSha256`, `parent-authorization-payload.json`'ın RFC 8785 canonical
formunun SHA-256'sıdır ve `authority.digest()` ile bu kayıt yazılırken
üretilmiştir. Payload değişirse hash değişir ve ona dayanan standing grant'lar
`STANDING_GRANT_PARENT_REF_INVALID` ile reddedilir.

## Owner kararları

```text
OFFICE      kontrollu canli calistirmaya acilir
COLLECTION  kontrollu canli calistirmaya acilir
diger dort program  DENIED kalir
```

OFFICE ve COLLECTION için program-scoped **standing grant** modeli kurulur.
Standing grant sınırsız genel yetki **değildir**; sınırları aşağıdadır ve
hepsi mekanik olarak uygulanır.

`MECHANICAL_GOVERNANCE` profili yalnız önceden tanımlanmış governance işleri
için açılır. Bu profil altındaki hiçbir görev şunları değiştiremez:

```text
authorization engine · standing grant kurallari · branch protection
CI required-check politikasi · secret yonetimi · credential yuzeyi
auto-merge guvenlik kapilari · program eligibility authority
orchestration control-plane guvenlik sinirlari
```

## Alt görev türetme

Alt görev planları yalnız bu envelope'un iş paketlerinden, tanımlı scope'tan,
kabul kriterlerinden ve canonical program/path haritalarından **deterministik**
biçimde türetilir. Her child task için kaydedilir:

```text
child task ID · parent authorization ID · child plan hash
allowed paths · allowed task class · selected executor
reviewer · expected checks · merge policy
```

Alt görev hash'leri owner'a **tekrar gönderilmez**. Bunun karşılığı,
`authority.validateAgainstStandingGrant()`'in her kuralı plan üzerinde,
hiçbir I/O yapmadan, deterministik olarak zorunlu kılmasıdır. Grant dışı bir
child plan otomatik reddedilir.

## Geçerlilik

```text
program kapanisina kadar
owner acikca iptal edene kadar
kill switch etkinlesene kadar
scope ihlali olusana kadar
```

Yetki başka programa, başka repository'ye veya başka owner işine **taşınamaz**.

## Geriye dönük uyumluluk

Task-scoped `grant.schema.json` modeli **korunur**. `T5-COLLECTION-EXECUTION-GRANT-R02`
ve `T5-OFFICE-CAP02-EXECUTION-GRANT-R02` dahil mevcut kayıtlar çalışmaya devam
eder; standing grant onların yerine geçmez, yanlarında durur.

---

**IMPLEMENTATION AUTHORITY:** bu envelope, yalnız `ORCHESTRA-PRODUCTION-ACTIVATION-R01`
programının sıralı iş paketleri ve altındaki standing grant'lar için.
