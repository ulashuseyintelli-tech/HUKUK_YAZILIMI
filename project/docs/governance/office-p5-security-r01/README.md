# OFFICE P5 Security R01 — PHASE A Evidence (lane-local)

## 1. Kimlik ve yetki sınırı

| Alan | Değer |
|---|---|
| Task | `OFFICE-P5-SECURITY-COMPLETION-R01` |
| Lane | `CLAUDE-C2` (OFFICE execution lane) |
| Phase | **PHASE A — evidence-only** (B01 + B03) |
| Owner kararı | RATIFIED (D5) |
| Base SHA | `271e81d3f0007fe91562608ea7f73ad05758c233` (= origin/main, drift yok) |
| Gözlem tarihi | 2026-08-13 (09:19–09:45 penceresi) |
| Worktree | `C:\Development\HUKUK_YAZILIMI\HY_office_p5_security` / branch `claude/office-p5-security-completion-r01` |
| Runtime mutation | `NONE` |
| DB mutation | `NONE` (yalnız SELECT; WAVE 3 DB write lease CODEX-X3'te) |
| CI manifest | DOKUNULMADI (WAVE 3 manifest lease CODEX-X3'te) |
| Production kod değişikliği | `NONE` (PHASE A kuralı) |

Bu dizin lane-local kanıt belgesidir; canonical governance markdown değildir. PHASE B
(B02/B04/B05 implementasyonu) yalnız X3 terminal + PAGE-O0 lease sonrası açılır.

## 2. Fresh preflight (VERIFIED)

- `HEAD = main = origin/main = ls-remote main = 271e81d3f0007fe91562608ea7f73ad05758c233` — beklenen tabanla birebir.
- Açık PR: **0** (beklenen).
- Aktif paralel lane: CODEX-X3 — worktree `C:\Development\HUKUK_YAZILIMI\HY_office_p3_reportingline`,
  branch `codex/office-p3-reportingline-completion-r01` (2026-08-13 tarihli, remote'a push edilmemiş — uçuşta).
  Bu worktree'ye ve `modules/reporting-line` + `office-cap02-reportingline-*` dosyalarına dokunulmadı.
- `modules/office · staff · lawyer · user · auth · seed` üzerinde başka rakip yazıcı izi yok
  (son dallar taraması; bugünün tek diğer aktif dalı `claude/wsmr-a4-demo-fallbacks` — farklı program).
- Governance taraması: `project/docs/governance/` altında `OFFICE-P5`/`P5-B0` kaydı **yok** —
  bu dizin programın ilk lane-local kaydıdır (canonical register güncellemesi bu lane'in kapsamı dışında).

## 3. Yöntem kısıtları

- `.env` dosyası **açılmadı**; hiçbir secret değeri okunmadı. DB kanıtları yalnız
  önek sınıflandırması (`enc:v1:` LIKE testi) ve `count(*)` düzeyindedir.
- Canlı API'ye yalnız **kimliksiz** GET probları atıldı (401/404 gözlemi); hiçbir mutasyon çağrısı yapılmadı.
- X1'in scanner'ı (`src/scripts/office-runtime-release-readiness.ts`) salt-okuma modda,
  X1'in yayınladığı komut sözleşmesiyle yeniden koşuldu; üstüne scanner'dan bağımsız ham ölçüm
  (dosya SHA-256, `git hash-object`, marker grep, `merge-base --is-ancestor`, süreç/port envanteri) yapıldı.

## 4. Belgeler

| Belge | İçerik |
|---|---|
| [`b01-credential-containment-runtime-status.md`](./b01-credential-containment-runtime-status.md) | P5-B01: credential containment runtime yeniden-doğrulaması — capability × kanıt tablosu, canlı yüzey çözümü, at-rest DB durumu, hüküm |
| [`b03-staff-authorization-compatibility-matrix.md`](./b03-staff-authorization-compatibility-matrix.md) | P5-B03: staff yetkilendirme uyumluluk matrisi — endpoint envanteri, aktör × endpoint matrisi (DB-doğrulanmış), kırılma analizi, geçiş planı önerileri |

## 5. Bulgu kaydı (özet)

| ID | Bulgu | Sınıf | Durum |
|---|---|---|---|
| F-B01-01 | `GET /api/auth/me` yanıtı `passwordHash`/`tokenVersion`/`passwordChangedAt` içeriyor (yalnız çağıranın kendi satırı) | Credential containment açığı | **FIXED — PHASE B** (owner-ratified): `/auth/me` public projection (`user-public-projection.ts`) + negatif assertion spec'i; kapsam bounded (yalnız passwordHash+tokenVersion; passwordChangedAt owner kapsamı dışında, kayıtta kalır) |
| F-B01-02 | Scanner F01 marker'ı `PUBLIC_S0_ONLY` tip-düzeyi string — derlemede silinir; hiçbir dist bu marker'ı içeremez → RELEASE10 için yanlış `STALE` | Ölçüm aracı defekti | **CROSS-LANE — GR-12 kayıtlı** (X1/P6 successor; bu lane DOKUNMAZ) |
| F-B01-03 | `GET /office/smtp-settings` ve `GET /office/sms-settings` yalnız JwtAuthGuard (PUT karşılıkları F01+ADMIN) — secret'lar maskeli, konfig alanları tenant içi herkese görünür | Yetki asimetrisi (residual) | AÇIK — owner disposition (PHASE B kapsamına alınmadı) |
| F-B01-04 | `OfficeService.getOrCreate` public ve ham satır döndürür (bugünkü 4 çağıranın tümü yalnız `name` okuyor — sızıntı yok) | Korumasız ham yüzey (residual) | AÇIK — owner disposition |
| F-B01-05 | `Lawyer.uyapToken` şema yorumu "// Şifrelenmiş" — kod karşılığı yok; ayrıca alana yazan hiçbir servis yolu yok ve DB'de dolu satır 0 | Belge/kod tutarsızlığı (düşük) | Kayıt |
| F-B03-01 | Handoff öncülü ("StaffController'da rol kapısı yok") canonical main için **bayat**: 4 mutasyon ucu #2076'dan beri `OfficeF01AuthorizationGuard` taşıyor; öncül yalnız GET'ler ve bayat RUNTIME dist'i için doğru | Öncül/repo çelişkisi (raporlandı) | B03 §2'de belgelendi |
| F-B03-02 | `GET /api/staff/:id` maskesiz **ham TCKN** döndürür; liste ucu maskeler — herhangi bir authenticated tenant kullanıcısı erişebilir | PII ifşası | **FIXED — PHASE B (B04/S3)**: findOne liste maskesine bağlandı + F01-yetkisiz aktöre okuma projeksiyonu (8 bayrak + tckn anahtarı düşer) + maskeli-tckn geri-yazım koruması |
| F-B03-03 | Staff mutasyonlarında DTO yok (`body: any`) → global `ValidationPipe(whitelist)` etkisiz | Doğrulama boşluğu | **FIXED — PHASE B (B04/S3)**: typed DTO'lar (`dto/staff.dto.ts`, tam-satır PUT toleranslı) + guard-metadata/DTO wiring spec'i |
| F-B03-04 | `POST /api/seed/staff` + `seedAll` → `as any` ile StaffService guard'larını bypass eden doğrudan `prisma.staffMember.create` (seedLawyers'ta eşdeğeri) | Seed yüzeyi | **FIXED — PHASE B (B02)**: seedStaff/seedLawyers kanonik StaffService/LawyerService.create yoluna bağlandı; SIMILAR_NAME_REVIEW satırı atlanıp açıkça raporlanır; spec'lerle kilitli |
| F-B02-01 | Handoff'un "POST /seed/public-institutions guard'sız" öncülü de **bayat**: OWN-13 I02-R3 (owner D03) JwtAuthGuard eklemiş ve `seed-controller-guards.spec` regresyonu kilitliyor. Kalan residual: GLOBAL (tenant'sız) tabloya herhangi bir authenticated tenant kullanıcısının yazabilmesi (rol kapısı yok) | Öncül drift + residual | AÇIK — rol-gate eklemek D03'ün ratifiye semantiğini değiştirir; owner disposition ister (bu lane değiştirmedi) |

Bilinen devredilmiş kalemler yeniden açılmadı (personel ad-hijyeni satırları, BLOCKED_BY_RUNTIME_MODEL
deployment residual'ı, GR-01..GR-12).
