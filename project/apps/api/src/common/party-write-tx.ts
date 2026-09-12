import { Prisma } from "@prisma/client";

/** `$transaction` sunan istemci (PrismaService). İmza aşırı yüklü olduğu için gevşek tutulur. */
export interface TransactionCapablePrisma {
  $transaction: (...args: any[]) => any;
}

/**
 * POST /cases satır içi (inline) taraf yazmalarının ORTAK transaction bağlamı.
 *
 * Owner GO 2026-09-12 "OFFICE DAR ATOMİKLİK YAMASI": dosya açılışında yaratılan avukat / ofis /
 * müvekkil / adres / borçlu satırları ve bunların audit kayıtları, dosya (Case) yazmalarıyla AYNI
 * transaction'a katılır. Daha önce her servis KENDİ `$transaction`'ını açıp bağımsız commit ediyordu;
 * sonraki adımda oluşan bir hata (yetki reddi, FK, `fileNumber` P2002, tx timeout) dosyayı geri alıyor
 * ama taraf satırlarını KALICI bırakıyordu.
 *
 * Sözleşme:
 * - `tx` VERİLDİĞİNDE servis KENDİ `$transaction`'ını AÇMAZ. Prisma iç içe interactive transaction
 *   DESTEKLEMEZ; ikinci bir `$transaction` çağrısı dış transaction'ın bağlantısını kullanmaz ve
 *   atomiklik sessizce kaybolur.
 * - `tx` VERİLMEDİĞİNDE davranış BİREBİR eskisi gibidir (`POST /lawyers`, `POST /clients`,
 *   `POST /debtors`, seed): servis kendi transaction'ını açar. Geriye uyumluluk yamanın kabul şartıdır.
 * - Yazma yolundaki İLGİLİ OKUMALAR da aynı client'tan yapılır (`partyDb`). Aksi hâlde (a) okuma dış
 *   transaction'ın HENÜZ COMMIT EDİLMEMİŞ satırını göremez, (b) transaction sürerken havuzdan İKİNCİ
 *   bağlantı istenir → eşzamanlılıkta havuz açlığı/kilitlenme.
 */
export interface PartyWriteTxContext {
  /** Ortak (dış) transaction client'ı. */
  readonly tx: Prisma.TransactionClient;
  /**
   * MEVCUT commit-sonrası işi, dış transaction COMMIT EDİLDİKTEN SONRA çalıştırmak üzere kuyruğa alır.
   *
   * Bu işler transaction'a TAŞINMAZ (owner kısıtı: "HTTP, dosya, e-posta ve mevcut commit-sonrası
   * işler taşınmayacak"). Kuyruk iki yönlü doğrudur: tx içinde koşsalardı geri alınmayan satır
   * bırakırlardı; tx dışında ANINDA koşsalardı dış transaction rollback olduğunda sahipsiz görev
   * satırı kalırdı. Dış transaction commit etmezse kuyruk HİÇ çalıştırılmaz.
   */
  afterCommit(job: () => Promise<void>): void;
}

/**
 * Okuma/yazma hedefi: ortak transaction varsa onun client'ı, yoksa servisin kendi prisma client'ı.
 * Repo'da yerleşik `const source: any = tx ?? this.prisma` deseninin adlandırılmış hâlidir
 * (bkz. client-consent.service.ts, client-legal-hold.service.ts).
 */
export function partyDb(
  prisma: Prisma.TransactionClient,
  ctx?: PartyWriteTxContext,
): Prisma.TransactionClient {
  // TİPLİ döner (`any` DEĞİL): `any` üzerinden yapılan `findMany` çağrıları TypeChecker'da
  // ÇÖZÜLEMEZ hâle gelir ve tenant enumeration envanteri statik guard'ında (C15-S1-MODIFIED PR-2)
  // "çözülemeyen" kümesine düşer. `PrismaService extends PrismaClient` olduğu için servis client'ı
  // `Prisma.TransactionClient`e atanabilir; model delege'leri her iki yolda da çözülür.
  return ctx?.tx ?? prisma;
}

/**
 * Yazmayı ortak transaction içinde (ctx varsa) ya da servisin KENDİ transaction'ında (ctx yoksa)
 * çalıştırır. ctx verildiğinde ikinci bir `$transaction` AÇILMAZ.
 */
export function runPartyWrite<R>(
  // `PrismaService.$transaction` AŞIRI YÜKLÜ (dizi + interactive imzaları). Tip parametresi R'nin
  // yalnız `fn`den çıkarılması için client gevşek tiplenir; aksi hâlde R `unknown`a düşer.
  prisma: TransactionCapablePrisma,
  ctx: PartyWriteTxContext | undefined,
  fn: (tx: Prisma.TransactionClient) => Promise<R>,
): Promise<R> {
  return ctx ? fn(ctx.tx) : (prisma.$transaction as (cb: typeof fn) => Promise<R>)(fn);
}

/**
 * Dış transaction'ı YÖNETEN çağıran (CaseService.create) için bağlam + commit-sonrası kuyruk.
 * Kuyruk YALNIZCA `$transaction` başarıyla döndükten sonra `runAfterCommitJobs` ile boşaltılır.
 */
export function createPartyWriteTxContext(tx: Prisma.TransactionClient): {
  ctx: PartyWriteTxContext;
  deferred: Array<() => Promise<void>>;
} {
  const deferred: Array<() => Promise<void>> = [];
  return {
    ctx: {
      tx,
      afterCommit: (job) => {
        deferred.push(job);
      },
    },
    deferred,
  };
}

/**
 * Commit-sonrası kuyruğu SIRAYLA çalıştırır. Bu işler "best-effort" sözleşmesini korur: biri
 * patlarsa dosya oluşturma GERİ ALINMAZ (zaten commit edilmiştir) ve kalanlar yine çalışır.
 * `onError` çağıranın logger'ına bağlanır.
 */
export async function runAfterCommitJobs(
  deferred: Array<() => Promise<void>>,
  onError: (error: unknown) => void,
): Promise<void> {
  for (const job of deferred) {
    try {
      await job();
    } catch (error) {
      onError(error);
    }
  }
}
