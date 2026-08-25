/**
 * C15-S1-MODIFIED PR-3 — Transition servisinin tipli hataları.
 *
 * Her hata sınıfı AYRI bir karar yolunu temsil eder; çağıranın davranışı hata tipine
 * göre farklılaşabilmelidir. Özellikle alıkonan-kenar hatası, geçersiz-geçiş
 * hatasından AYRI bir tiptir: aksi hâlde çağıran onu bir veri doğrulama hatası sanıp
 * başka bir yoldan denemeye kalkabilir.
 *
 * Hiçbir hata mesajı lifecycle DEĞERLERİNİ dış yüzeye taşımak için kullanılmamalıdır;
 * bu hatalar İÇ servis hatalarıdır ve PR-3'te HTTP yüzeyi yoktur.
 */

import { TenantLifecycleState } from "./tenant-lifecycle";

/** Tenant bulunamadı — hiçbir yazma yapılmadan reddedilir. */
export class TenantNotFoundError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Tenant bulunamadı: ${tenantId}`);
    this.name = "TenantNotFoundError";
  }
}

/** PR-1 tablosunun izin vermediği geçiş. */
export class InvalidLifecycleTransitionError extends Error {
  constructor(
    public readonly from: TenantLifecycleState,
    public readonly to: TenantLifecycleState,
  ) {
    super(`Geçersiz lifecycle geçişi: ${from} -> ${to}`);
    this.name = "InvalidLifecycleTransitionError";
  }
}

/**
 * PR-3'ün KOŞULSUZ alıkoyduğu güvenlik-kritik kenar. PR-1 tablosu bu kenara izin
 * verse bile PR-3 servisi reddeder; gerekli kanıt sınıfının (readiness/drain)
 * üreticisi henüz yoktur. `quiesceToken` dâhil HİÇBİR koşul bu reddi değiştirmez.
 */
export class LifecycleSafetyCriticalEdgeWithheldError extends Error {
  constructor(
    public readonly from: TenantLifecycleState,
    public readonly to: TenantLifecycleState,
  ) {
    super(
      `Güvenlik-kritik lifecycle kenarı PR-3'te alıkonmuştur: ${from} -> ${to}. ` +
        "Bu kenar, kanıt üreticisiyle birlikte (PR-4) açılacaktır.",
    );
    this.name = "LifecycleSafetyCriticalEdgeWithheldError";
  }
}

/** `lifecycleReason` doğrulaması başarısız (boş, fazla uzun veya yasak desen). */
export class InvalidLifecycleReasonError extends Error {
  constructor(public readonly ihlal: string) {
    super(`Geçersiz lifecycleReason: ${ihlal}`);
    this.name = "InvalidLifecycleReasonError";
  }
}

/** `lifecycleTarget` tutarsız (gerekli iken yok, ya da hedef geçerli değil). */
export class InvalidLifecycleTargetError extends Error {
  constructor(public readonly aciklama: string) {
    super(`Geçersiz lifecycleTarget: ${aciklama}`);
    this.name = "InvalidLifecycleTargetError";
  }
}

/**
 * Advisory lock, `lock_timeout` penceresi içinde alınamadı — aynı tenant üzerinde
 * eşzamanlı başka bir yaşam döngüsü kararı sürüyor.
 *
 * Servis KENDİ İÇİNDE RETRY YAPMAZ; yeniden deneme kararı çağırana aittir. Bu,
 * B02'nin bounded-retry kalıbından bilinçli bir ayrılıştır: orada çakışma teknikti
 * (serialization failure), burada semantiktir ve sessizce yeniden denenmemelidir.
 */
export class LifecycleTransitionBusyError extends Error {
  constructor(public readonly tenantId: string) {
    super(
      `Tenant üzerinde eşzamanlı bir lifecycle geçişi sürüyor (lock_timeout doldu): ${tenantId}`,
    );
    this.name = "LifecycleTransitionBusyError";
  }
}

/**
 * CAS güncellemesi tam 1 satır etkilemedi — kilit her nasılsa atlanmış ve durum
 * okuma ile yazma arasında değişmiş demektir. Transaction ROLLBACK edilir.
 */
export class LifecycleConcurrentModificationError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly beklenenFrom: TenantLifecycleState,
  ) {
    super(
      `Lifecycle CAS güncellemesi 1 satır etkilemedi (beklenen mevcut durum: ${beklenenFrom}): ${tenantId}`,
    );
    this.name = "LifecycleConcurrentModificationError";
  }
}
