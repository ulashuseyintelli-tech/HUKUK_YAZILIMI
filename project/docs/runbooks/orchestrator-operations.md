# GOV-COORD-V2 orkestratör — operatör runbook'u

Bu belge orkestratörü **çalıştıran** kişi içindir. Mimari anlatmaz; ne yazacağını
ve ters giderse ne yapacağını söyler.

Her komut repository kökünden, `project/` içinden koşulur.

## 1. Bir şey ters gittiğinde — ÖNCE BU

```bash
pnpm orch:service stop --reason "ne oldugunu bir cumleyle yaz"
```

Bu komut `project/docs/governance/coordination-v2/activation/KILL-SWITCH`
dosyasını yazar. **Mekanizma dosyanın kendisidir**; komut yalnızca kolaylıktır.
Orkestratör çalışmıyorsa, cevap vermiyorsa, ya da makineye erişemiyorsanız aynı
etkiyi dosyayı elle oluşturup push ederek elde edersiniz:

```bash
echo "durduruldu" > project/docs/governance/coordination-v2/activation/KILL-SWITCH
```

Dosya varken:

```text
yeni gorev  ADMIT EDILMEZ
hicbir PR   MERGE EDILMEZ
ucustaki gorev mevcut adimini bitirir ve orada durur
```

Kill switch bir *duraklatma* değildir. Duraklatma için `pause` vardır.

## 2. Durum sorma

```bash
pnpm orch:service status
```

`admits work` satırı boolean değil **gerekçe** verir. "Hiçbir şey çalıştırmıyor"
ile "hiçbir şey çalıştırmayı reddediyor" dışarıdan aynı görünür:

| Gerekçe | Anlamı | Yapılacak |
|---|---|---|
| `QUEUE_EMPTY` | İş yok | Bir şey yok |
| `PAUSED` | İş var, alınmıyor | `resume` |
| `SLOT_OCCUPIED` | Tek yuva dolu | Bekle veya `status` ile kimin tuttuğuna bak |
| `KILL_SWITCH_ENGAGED` | Durduruldu | Kök nedeni çöz, sonra `start --reason` |

`status` **diskten** okur. Başka bir shell'den, reboot sonrasında, hiçbir şey
çalışmıyorken doğru cevap verir.

## 3. Yeniden başlatma

```bash
pnpm orch:service start --reason "kok neden #1234 ile giderildi"
```

`--reason` **zorunludur** ve bu kasıtlıdır. Durmak tören istemez; bir olaydan
sonra yeniden başlatmak birinin sahiplendiği bir karardır, ve silinmiş
KILL-SWITCH dosyası sonradan bunun hesabını veremez. Gerekçe audit log'a düşer.

## 4. Duraklatma (olay değil, operasyonel tercih)

```bash
pnpm orch:service pause  --reason "owner karari bekleniyor"
pnpm orch:service resume --reason "karar alindi"
```

Fark: `pause` mevcut görevin **bitmesine izin verir** ve yenisini almaz;
`stop` merge dahil her şeyi keser.

## 5. Kuyruk ve geçmiş

```bash
pnpm orch:service queue              # her kayit ve state'i
pnpm orch:service audit --limit 40   # kim ne zaman ne yapti
```

Her ikisi de append-only JSONL'den okunur. Kuyruk dosyası git common dir altında
(`.git/governance-coordination/queue/`) durur — validate edilen ağacın dışında,
böylece orkestratörün kendi defteri kendi boundary gate'ine takılmaz.

## 6. Çökme sonrası

```bash
pnpm orch:service recover            # DRY RUN — ne yapardi
pnpm orch:service recover --apply    # uygula
```

Kurtarma **asla ikinci bir executor başlatmaz.** İşçisi hâlâ canlı olabilecek
bir kayda dokunmaz; yalnızca pid'i ölü **ve** heartbeat'i 15 dakikalık grace'i
geçmiş bir kaydı geri alır.

Geri alma, devam ettirme değildir:

| Öldüğü yer | Nereye sarılır | Neden |
|---|---|---|
| `EXECUTING` | `AUTHORIZED` | Preflight'tan temiz başlar |
| `PR_OPEN` | `CI_WAITING` | PR duruyor; `EXECUTING`'e sarmak **ikinci PR** açardı |
| `MERGING` | — | Merge oldu mu olmadı mı yalnız remote söyler → `BLOCKED` |

`RECOVERY_NEEDS_EVIDENCE` ile bloklanmış bir kayıt gördüğünüzde: PR'ı `gh` ile
açın, merge olup olmadığına bakın, ve durumu ona göre elle ilerletin. **Tahmin
etmeyin** — modül tam olarak bu yüzden tahmin etmiyor.

## 7. Bir görevi çalıştırma

```bash
pnpm orch:run --plan <plan.v1.json> --grant <grant.json> --prompt <file> \
  --lane CLAUDE_LOCAL --target-branch main
```

Merge **varsayılan olarak yapılmaz**. Auto-merge için iki anahtar da gerekir:

```bash
pnpm orch:run ... --standing-grant \
  project/docs/governance/coordination-v2/activation/STANDING-GRANT-OFFICE-LIVE-R01.json \
  --auto-merge
```

Grant tek başına yetmez, bayrak tek başına yetmez. İkisi varken bile kapılar
kaybolmaz: merge anında PR durumu, review, head sha ve **canlı** required
check'ler yeniden okunur.

`--dry-run` planı ve yetkiyi doğrular, hiçbir şey çalıştırmaz.

## 8. Bir programı açma veya kapama

Manifest **elle düzenlenmez.** `programs.manifest.json` kendi authority'sinin
türetmesidir ve bir test bunu doğrular; elle yapılan düzenleme CI'da kırmızı
döner.

Yol:

```text
1. owner karari PARENT-AUTHORIZATION-ENVELOPE.md'ye girer
2. program-eligibility-authority.json yeni alintiyi ve digest'i pinler
3. turetici calisir, manifest yeniden uretilir
4. diff neyin nicin degistigini okunabilir birakir
```

Bir programı **acilen** kapatmak için manifest'i beklemeyin — kill switch veya
o programın `revocationPath`'indeki dosya anında etkilidir ve merge anında
tekrar okunur.

## 9. Ne zaman durup owner'a sormalı

Orkestratör bunları kendi çözmez, siz de çözmeyin:

```text
BLOCKED_BASE_SHA_DRIFT          plan pinlendigi base'i asmis
ATTESTATION_INVALIDATED         MERGE_READY sonrasi dunya degismis
MERGE_HEAD_DRIFTED              attestation sonrasi push yapilmis
RECOVERY_NEEDS_EVIDENCE         merge ortasinda olunmus
GOVERNANCE_TARGET_OFF_QUEUE_SURFACE   kanonik governance yazimi isteniyor
```

Son satır özellikle: `MECHANICAL_GOVERNANCE` profili `decision-log.md` gibi
kanonik belgeleri **yazamaz** ve bu bir eksiklik değil, contract §1.2'nin
gereğidir. O işler V1 governance-writer akışından geçer.

## 10. Bilinen sınırlar

```text
tek host          dagitik lease protokolu yok; pid + heartbeat yeterli
tek yuva          maxConcurrency 1, standing grant'larda pinli, ayar degil
Windows MAX_PATH  worktree dizin adi 24 karaktere kirpilir
CI suresi         Test Suite ~30 dk; required degil ama CLEAN icin beklenir
```
