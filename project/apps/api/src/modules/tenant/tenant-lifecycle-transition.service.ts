/**
 * C15-S1-MODIFIED PR-3 — Tenant lifecycle GEÇİŞ OTORİTESİ (iç servis).
 *
 * Bu servis bir YETENEKTİR, politika değildir: PR-3 sonunda üretim kodunda SIFIR
 * çağrısı vardır (statik kapıyla sabitlenir). Operatör yüzeyi, zamanlayıcı, drain
 * ve readiness kanıtı PR-4/PR-5'tedir.
 *
 * DI KAYDI BİLEREK YAPILMAMIŞTIR (PR-1 kalıbı: saf katman tüketicisiz teslim edilir).
 * `TenantModule.imports`'a `AuditModule` eklemek, zinciriyle gerçek `PrismaModule`'ü
 * PR-2'nin stub'lı HTTP test uygulamasına sürükler ve `$connect` bootstrap'ı düşürür;
 * sıfır call-site'ta DI kaydının işlevsel etkisi de yoktur. Kayıt, ilk gerçek
 * tüketiciyle birlikte PR-4'te yapılacaktır (statik kapı sıfır-kayıt sabitini korur).
 *
 * ZORUNLU TRANSACTION SIRASI (owner GO):
 *
 *   BEGIN
 *    0. SET LOCAL lock_timeout = '3000ms'   <- yalnız konfigürasyon; veri okumaz/yazmaz.
 *                                              Kilitten SONRA gelseydi kilidi bağlamazdı.
 *    1. pg_advisory_xact_lock(hashtextextended('tenant-lifecycle|<id>|transition', 0))
 *                                           <- VERİYE DOKUNAN İLK ifade. Kanonik kalıp.
 *    2. kilitten SONRA taze Tenant SELECT   <- kilit ÖNCESİ okunsaydı eşzamanlı iki geçiş
 *                                              aynı `from`u görüp ikisi de geçerli sayılırdı.
 *    3. satır yok        -> TenantNotFoundError (yazım 0)
 *    4. from === to      -> NO-OP: changed=false; kolon/timestamp/audit DEĞİŞMEZ
 *    5. reason doğrulaması (yalnız gerçek geçişte)
 *    6. withheld kenar   -> LifecycleSafetyCriticalEdgeWithheldError (KOŞULSUZ)
 *    7. tablo doğrulaması-> InvalidLifecycleTransitionError
 *    8. hedef tutarlılığı (requiresLifecycleTarget / isQuiesceTargetState)
 *    9. CAS UPDATE ... WHERE id AND lifecycle=<from>; clock_timestamp() ile damga
 *   10. etkilenen satır !== 1 -> LifecycleConcurrentModificationError -> ROLLBACK
 *   11. AuditService.logInTransaction(tx, ...)  <- AYNI tx; hata -> ROLLBACK
 *   COMMIT
 *
 * NEDEN CAS, KİLİDE EK: kilit bir gün yanlış anahtarla alınabilir veya bir çağrı yolu
 * kilidi atlayabilir. `WHERE lifecycle=<from>` + "tam 1 satır" iddiası kilitten
 * BAĞIMSIZ ikinci savunmadır.
 *
 * NEDEN clock_timestamp(): `now()`/`CURRENT_TIMESTAMP` transaction BAŞLANGICINI verir;
 * kilit beklemesi uzunsa damga gerçeği yansıtmaz (B02 kuralı). Bu zorunluluk CAS
 * update'in raw SQL olmasını gerektirir — Prisma `data` nesnesinde SQL fonksiyonu
 * ifade edilemez. Governance-writer kapısı bu raw yazımı TEK onaylı yazar olarak tanır.
 *
 * RETRY YOKTUR: lock_timeout dolarsa LifecycleTransitionBusyError çağırana döner.
 * Yeniden deneme kararı çağıranındır (B02 bounded-retry'den bilinçli ayrılış: orada
 * çakışma teknikti, burada aynı tenant üzerinde eşzamanlı ikinci bir yaşam döngüsü
 * KARARIDIR ve sessizce yeniden denenmemelidir).
 *
 * AUDIT: yalnız `AuditService.logInTransaction` — `log()` YASAKTIR (içindeki try/catch
 * hatayı yutar; kullanılsaydı denetimsiz mutation commit olurdu). actorType "SYSTEM"
 * (audit-types.ts'teki mevcut değer; yeni değer EKLENMEDİ). userId/userName/userIp/
 * userAgent yazılmaz — operatör yüzeyi yokken uydurulmuş aktör kaydı denetimi yanıltır.
 * entityType "TENANT" bu alanda YENİ bir değerdir (mevcutlar CASE/CLIENT/POA/USER);
 * alan String olduğundan şema değişikliği değildir ve burada açıkça kayda geçirilmiştir.
 */

import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  TenantLifecycleState,
  canTransitionLifecycle,
  isQuiesceTargetState,
  isTenantLifecycleState,
  requiresLifecycleTarget,
} from "./tenant-lifecycle";
import { isWithheldSafetyCriticalEdge } from "./tenant-lifecycle-edges";
import {
  InvalidLifecycleTargetError,
  InvalidLifecycleTransitionError,
  LifecycleConcurrentModificationError,
  LifecycleSafetyCriticalEdgeWithheldError,
  LifecycleTransitionBusyError,
  TenantNotFoundError,
} from "./tenant-lifecycle-errors";
import { validateLifecycleReason } from "./tenant-lifecycle-reason";

/** Advisory lock bekleme üst sınırı (owner GO: 3000ms). */
export const LIFECYCLE_LOCK_TIMEOUT_MS = 3000;

/**
 * Interactive transaction üst sınırı (owner GO: >= 10000ms).
 * lock_timeout(3s) + SELECT + UPDATE + audit için yeterli pay bırakır.
 */
export const LIFECYCLE_TRANSACTION_TIMEOUT_MS = 15000;

/** Kilit anahtarı domain'i — repodaki kanonik `<domain>|<id>|<key>` kalıbı. */
const LOCK_DOMAIN = "tenant-lifecycle";
const LOCK_KEY = "transition";

export interface TransitionInput {
  readonly tenantId: string;
  readonly to: TenantLifecycleState;
  /** Gerçek geçişte zorunlu; same-state no-op'ta istenmez ve okunmaz. */
  readonly reason?: string;
  /** Yalnız QUIESCING hedefli geçişte anlamlı: faz-2 hedefi (SUSPENDED|RETIRED). */
  readonly target?: TenantLifecycleState;
}

export interface TransitionResult {
  readonly changed: boolean;
  readonly from: TenantLifecycleState;
  readonly to: TenantLifecycleState;
  /** Yalnız changed=true iken dolu; DB'nin clock_timestamp() değeri. */
  readonly changedAt: Date | null;
}

/** Prisma'nın lock_timeout (SQLSTATE 55P03) hatası — PG16+Prisma provasıyla ölçüldü:
 *  PrismaClientKnownRequestError, code=P2010, meta.code="55P03". */
function isLockTimeoutError(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code !== "P2010") return false;
  const metaCode = (e.meta as { code?: unknown } | undefined)?.code;
  return metaCode === "55P03";
}

@Injectable()
export class TenantLifecycleTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async transition(input: TransitionInput): Promise<TransitionResult> {
    const { tenantId, to } = input;
    if (!isTenantLifecycleState(to)) {
      // `to` dış girdidir; tip iddiasına güvenilmez, çalışma zamanında doğrulanır.
      throw new InvalidLifecycleTransitionError(to as TenantLifecycleState, to);
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => this.transitionInTx(tx, input),
        {
          timeout: LIFECYCLE_TRANSACTION_TIMEOUT_MS,
          maxWait: LIFECYCLE_TRANSACTION_TIMEOUT_MS,
        },
      );
    } catch (e) {
      if (isLockTimeoutError(e)) {
        // RETRY YOK — tek deneme; karar çağıranın.
        throw new LifecycleTransitionBusyError(tenantId);
      }
      throw e;
    }
  }

  private async transitionInTx(
    tx: Prisma.TransactionClient,
    input: TransitionInput,
  ): Promise<TransitionResult> {
    const { tenantId, to } = input;

    // 0) Konfigürasyon — veri okumaz/yazmaz; kilidin ÖNÜNE gelmek zorundadır.
    await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LIFECYCLE_LOCK_TIMEOUT_MS}ms'`);

    // 1) VERİYE DOKUNAN İLK ifade: advisory lock (kanonik kalıp).
    //    $executeRaw bilinçli: fonksiyon `void` döner ve $queryRaw void kolonu
    //    deserialize edemez; $executeRaw satır çözümlemez, parametre bağlar.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${LOCK_DOMAIN}|${tenantId}|${LOCK_KEY}`}, 0))`;

    // 2) Kilitten SONRA taze okuma.
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, lifecycle: true, lifecycleTarget: true },
    });

    // 3) Yok -> yazım 0.
    if (!tenant) throw new TenantNotFoundError(tenantId);
    const from = tenant.lifecycle as TenantLifecycleState;

    // 4) Same-state NO-OP: hiçbir kolon, timestamp veya audit değişmez.
    //    Karar kilit + taze SELECT'ten SONRA verilir; kilitsiz verilseydi eşzamanlı
    //    bir geçişin ortasındaki durumla yarışırdı.
    if (from === to) {
      return { changed: false, from, to, changedAt: null };
    }

    // 5) Gerçek geçiş — reason zorunlu ve doğrulanır (trim edilmiş hâli yazılır).
    const reason = validateLifecycleReason(input.reason);

    // 6) KOŞULSUZ alıkoyma — tablo doğrulamasından ÖNCE gelir ki alıkonan kenar
    //    "geçersiz geçiş" olarak DEĞİL, kendi tipiyle reddedilsin. quiesceToken'ın
    //    varlığı/değeri bu kararı ETKİLEMEZ.
    if (isWithheldSafetyCriticalEdge(from, to)) {
      throw new LifecycleSafetyCriticalEdgeWithheldError(from, to);
    }

    // 7) PR-1 tablosu.
    if (!canTransitionLifecycle(from, to)) {
      throw new InvalidLifecycleTransitionError(from, to);
    }

    // 8) Hedef tutarlılığı.
    let target: TenantLifecycleState | null = null;
    if (requiresLifecycleTarget(to)) {
      if (input.target === undefined || !isQuiesceTargetState(input.target)) {
        throw new InvalidLifecycleTargetError(
          `${to} hedef ister; verilen: ${String(input.target)}`,
        );
      }
      target = input.target;
    } else if (input.target !== undefined) {
      throw new InvalidLifecycleTargetError(`${to} hedef almaz; verilen: ${String(input.target)}`);
    }

    // quiesceToken: QUIESCING'e girişte üretilir, çıkışta temizlenir. PR-3'te
    // YALNIZ yazılan/temizlenen opak bir dizedir; hiçbir koşulda finalizasyon
    // kanıtı olarak YORUMLANMAZ (alıkoyma 6. adımda zaten koşulsuz verildi).
    const quiesceToken = to === "QUIESCING" ? randomUUID() : null;

    // 9) CAS update — raw SQL, çünkü clock_timestamp() zorunlu ve Prisma `data`
    //    nesnesinde SQL fonksiyonu ifade edilemez. Governance-writer kapısının
    //    tanıdığı TEK onaylı yazar bu ifadedir.
    const rows = await tx.$queryRaw<{ lifecycleChangedAt: Date }[]>`
      UPDATE "Tenant"
         SET "lifecycle"          = CAST(${to} AS "TenantLifecycle"),
             "lifecycleChangedAt" = clock_timestamp(),
             "lifecycleReason"    = ${reason},
             "lifecycleTarget"    = CAST(${target} AS "TenantLifecycle"),
             "quiesceToken"       = ${quiesceToken}
       WHERE "id" = ${tenantId}
         AND "lifecycle" = CAST(${from} AS "TenantLifecycle")
       RETURNING "lifecycleChangedAt"`;

    // 10) Tam 1 satır — değilse kilitten bağımsız ikinci savunma devreye girer.
    if (rows.length !== 1) {
      throw new LifecycleConcurrentModificationError(tenantId, from);
    }
    const changedAt = rows[0].lifecycleChangedAt;

    // 11) Denetim — AYNI transaction. logInTransaction try/catch İÇERMEZ; hata
    //     fırlatırsa tüm geçiş ROLLBACK olur (audit'siz mutation kalmaz).
    //     log() KULLANILMAZ — o metod hatayı yutar.
    await this.audit.logInTransaction(tx, {
      tenantId,
      action: "UPDATE",
      // "TENANT" bu alanda yeni bir DEĞERDİR (alan String; şema değişikliği değil).
      entityType: "TENANT",
      entityId: tenantId,
      oldValues: { lifecycle: from, lifecycleTarget: tenant.lifecycleTarget },
      newValues: { lifecycle: to, lifecycleTarget: target },
      description: reason,
      actorType: "SYSTEM",
      reasonCode: "TENANT_LIFECYCLE_TRANSITION",
    });

    return { changed: true, from, to, changedAt };
  }
}
