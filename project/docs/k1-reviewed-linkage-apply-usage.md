# K1 Reviewed Linkage — Guarded Apply (K1-3) Usage

> K1-3 **guarded apply tooling** ekler; **canlı apply'ı kendisi çalıştırmaz**. Gerçek (owner-run) apply
> ayrı bir karardır (K1-4). Bu araç hiçbir HTTP/Nest yoluna bağlı değildir; runtime davranışı değişmez.

## Bağlam

K1-1 ölçtü: 2 login User · 14 Lawyer + 10 StaffMember (24 profil) · **0 bağlı** · **0 güvenli exact-email eşleşme** → 24 profil manuel inceleme. K1-2 insan-incelemeli bir **manifest** doğrular + planlar (yazma yok). K1-3 aynı manifest'i **açık, guard'lı, transaction-safe** uygulayabilecek CLI apply yolu ekler.

İzin verilen tek yazma: `Lawyer.userId` set + `StaffMember.userId` set (yalnız `LINK_EXISTING_USER`).

## CREATE_LOGIN_USER neden BLOCKED_NOT_IMPLEMENTED?

`User.passwordHash` şemada **NOT NULL**'dır ve tek user-create yolu `auth.service.register` = `bcrypt.hash(gerçek-parola)`. Otomatik bir CLI'nin **güvenli parola edinme yolu yoktur**; rastgele/varsayılan/tahmin parola üretmek (veya credential mail atmak) yasaktır — yanlış login user yaratmak, eksik linkage'dan daha kötüdür. Bu yüzden `CREATE_LOGIN_USER` apply **uygulanmaz** (kod yok), planda `BLOCKED_NOT_IMPLEMENTED` olarak raporlanır. Bu profiller için login User yaratımı K1-4 / owner-run kararına bırakılır.

## Komutlar

```bash
# 1) İskelet üret (PII yok; --verbose ile email ipucu)
npx --yes tsx scripts/k1-reviewed-linkage.ts --template --tenant <tenantId>

# 2) Doğrula + planla (dry-run, counts-only — HİÇBİR yazma)
npx --yes tsx scripts/k1-reviewed-linkage.ts --manifest ./k1-manifest.json
npx --yes tsx scripts/k1-reviewed-linkage.ts --manifest ./k1-manifest.json --json

# 3) GUARDED APPLY (yalnız LINK_EXISTING_USER; üçlü kapı zorunlu)
npx --yes tsx scripts/k1-reviewed-linkage.ts --manifest ./k1-manifest.json \
    --apply --allow-dev-db-write --confirm-manifest-reviewed
```

## Guard modeli (apply ancak hepsi geçerse çalışır)

**Üçlü kapı (üçü de gerekir):** `--apply` + `--allow-dev-db-write` + `--confirm-manifest-reviewed`.

**Env/DB hard-stop:**
- `NODE_ENV=production` → stop
- `DATABASE_URL` `prod|live|customer|staging` içeriyor → stop
- `DATABASE_URL` yok → stop
- DB hedefi açıkça non-prod değil (unknown) → stop

**Preflight hard-stop (zero-write, partial apply YOK):** blocked entry > 0, conflict (unsafe) > 0, veya manifest-level hata varsa **hiçbir yazma yapılmaz**.

## Idempotency

- Profile zaten **hedef** userId'ye bağlıysa → `ALREADY_APPLIED` (no-op).
- Profile/hedef-user **başka** bir bağa sahipse → `CONFLICT` (hard stop; sessiz üzerine-yazma yok).
- Aynı manifest'i ikinci kez çalıştırmak güvenlidir: uygulanmışlar no-op, çakışanlar bloklanır.

## Transaction

Tüm yazmalar tek `prisma.$transaction` içindedir. Apply ortasında bir hata olursa **tam rollback** (yarı-uygulanmış durum oluşmaz).

## Çıktı güvenliği

Varsayılan counts-only. `DATABASE_URL` **asla** ham basılmaz (yalnız `non-prod|prod|unknown|missing` sınıfı). Email/isim/TCKN/telefon/adres ve parola/secret/token basılmaz.

## Sınırlar (K1-3 KAPSAM DIŞI)

P3 enforcement · new 403/deny · controller/guard/decorator/Nest module · frontend · migration · case-policy değişikliği · observe genişletme · auto-inference/fuzzy/name-phone-role guessing · **canlı apply çalıştırma** · prod apply. Bunlar ayrı kararlardır.
