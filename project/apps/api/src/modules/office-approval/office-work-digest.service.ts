import { Injectable } from '@nestjs/common';
import { EscalationTier, TaskStatus } from '@prisma/client';

/**
 * OFFICE-WR01-B07 — WORK DIGEST (salt-okunur is durumu ozeti).
 *
 * KAPSAM: saf, deterministik aggregate. Sifir IO, sifir persistence, sifir bildirim,
 * sifir schema, sifir migration, sifir scheduler. Servis yalniz cagirana verilen
 * koleksiyonu ozetler; kendisi hicbir kaynaktan veri OKUMAZ ve hicbir kayda YAZMAZ.
 *
 * MEVCUT BILDIRIM MOTORU DEGISMEDI: `escalation/operational-escalation.service.ts`
 * (tier hesabi, `resolveRecipients`, `SENT`/`FAILED`/`SKIPPED` sonucu ve
 * `Task.lastNotifiedLevel` cift-gonderim guard'i) bu blokta emsaldir, bagimlilik
 * DEGILDIR. Digest o motoru cagirmaz, guard'ini okumaz ve ilerletmez.
 *
 * D-WR-3 (KARAR ≠ BILDIRIM): bu dosya ne bildirim alicisi cozer ne de kapanis icin
 * gereken karar/onay sayisi uretir. `OfficeWorkDigest` tipinde approval, quorum veya
 * gereken-karar-sayisi anlamina gelen HICBIR alan yoktur; B06 yuzeylerine bagimlilik
 * kurulmaz. Politika sozlugu (`office-work-routing.contract.ts`) bilerek TUKETILMEZ:
 * digest'e politika/karar sayisi tasimak tam olarak D-WR-3'un yasakladigi karisimdir.
 *
 * D-WR-5 (KISI-PERFORMANSI YASAK): digest yalniz **is** durumunu ozetler. Girdi tipi
 * `OfficeWorkDigestItem` yapisal olarak kisi kimligi TASIMAZ (`assigneeId`,
 * `completedByUserId`, `createdById` gibi alanlar tipe alinmamistir), dolayisiyla
 * kisi bazli sayim, siralama, gruplama veya hiz/SLA metrigi URETILEMEZ. Yasak yalniz
 * adlandirmayla degil, girdi seklinin kendisiyle saglanir.
 *
 * B01 ILISKISI: B01 (#2439) iki yuzey yayimladi — D-WR-3 politika sozlugu ve D-WR-4
 * `actionCode` taksonomisi. Digest ikisini de TUKETMEZ ve YENIDEN TANIMLAMAZ:
 *  - politika sozlugu D-WR-3 geregi digest'e giremez (yukariya bkz.),
 *  - `actionCode` taksonomisi is kaleminin uzerinde tasiyicisi olmadigi icin
 *    (Task modelinde `actionCode` alani YOKTUR) tuketilemez; boyle bir alani icat
 *    etmek yeni domain semantigi uydurmak olurdu.
 * Digest bunun yerine mevcut kanonik repo tiplerini (`TaskStatus`, `EscalationTier`)
 * tuketir; yeni enum/alan/tarih semantigi tanimlamaz.
 *
 * KAPSAM DISI (bilerek uretilmedi): is atama/yeniden atama, round-robin, yuk dengeleme,
 * onay/quorum mantigi (B06), bildirim gonderimi, API/controller/UI yuzeyi (B08),
 * cross-workstream migration (B09), persistence ve flag.
 *
 * @see project/docs/governance/office-wr01-decomposition-r01/wr01-decomposition-brief-r01.md
 * @see ../escalation/operational-escalation.service.ts (bildirim emsali — DEGISMEDI)
 */

/**
 * Digest'in ozetledigi tek is kaleminin MINIMUM durum yuzeyi.
 *
 * Alanlar `Task` modelinin mevcut operasyonel eskalasyon yuzeyinden alinmistir
 * (`status`, `dueDate`, `escalationLevel`); yeni alan turetilmemistir. Kisi kimligi
 * tasiyan alanlar D-WR-5 geregi BILEREK disaridadir.
 */
export interface OfficeWorkDigestItem {
  /** Mukerrer sayimi onlemek icin gereken is kalemi kimligi. */
  readonly id: string;
  readonly status: TaskStatus;
  readonly dueDate: Date | null;
  readonly escalationLevel: EscalationTier | null;
}

/**
 * Digest girdisi. `asOf` acikca verilir: servis sistem saatini KENDISI OKUMAZ, boylece
 * ayni veri + ayni `asOf` her zaman ayni sonucu uretir.
 */
export interface OfficeWorkDigestInput {
  readonly asOf: Date;
  readonly items: readonly OfficeWorkDigestItem[];
}

/**
 * Salt-okunur is durumu ozeti.
 *
 * Sayim ekseni ikidir ve her eksen kendi icinde TEKILDIR:
 *  - `byStatus` toplami = `totalWorkItems`
 *  - `byEscalationTier` toplami + `notEscalatedWorkItems` = `totalWorkItems`
 * `overdueWorkItems` bir kesit sayimidir (acik kalemlerin alt kumesi), ayri eksendir.
 */
export interface OfficeWorkDigest {
  /** Ozetin baglandigi an. Cagiranin `Date` nesnesine takma ad DEGILDIR (kopyadir). */
  readonly asOf: Date;
  readonly totalWorkItems: number;
  /** Henuz sonuclanmamis (acik) is kalemleri. */
  readonly openWorkItems: number;
  /** Acik olup son tamamlama tarihi gecmis is kalemleri. */
  readonly overdueWorkItems: number;
  /** Eskalasyon kademesi atanmis is kalemleri. */
  readonly escalatedWorkItems: number;
  /** Eskalasyon kademesi HENUZ atanmamis is kalemleri. */
  readonly notEscalatedWorkItems: number;
  readonly byStatus: Readonly<Record<TaskStatus, number>>;
  readonly byEscalationTier: Readonly<Record<EscalationTier, number>>;
  /** Ayni kimlikle birden fazla kez verilip sayilmayan kalem adedi (seffaflik). */
  readonly duplicateWorkItemIdsIgnored: number;
}

/**
 * Hangi `TaskStatus` degerinin "acik is" sayildigi.
 *
 * EKSIKSIZLIK KILIDI: tip `Record<TaskStatus, boolean>` oldugu icin enum'a yeni bir
 * durum eklenip bu tablo guncellenmezse typecheck kirilir. Ortulu fallback ve
 * `default:` dali BILEREK yoktur — yeni durumun acik mi kapali mi oldugu acikca
 * karara baglanir. Ayni desenin emsali: B01 `OFFICE_WORK_ACTION_CATEGORY`.
 *
 * Deger secimi mevcut motorun sorgusuyla birebir ayni: operasyonel eskalasyon
 * `status: { in: ["PENDING", "IN_PROGRESS"] }` filtresini kullanir.
 */
const OFFICE_WORK_OPEN_STATUS: Readonly<Record<TaskStatus, boolean>> = {
  PENDING: true,
  IN_PROGRESS: true,
  COMPLETED: false,
  CANCELLED: false,
};

/** Sifirlanmis durum sayaclari. `Record<TaskStatus, number>` ayni eksiksizlik kilidini tasir. */
function createStatusCounters(): Record<TaskStatus, number> {
  return { PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 };
}

/** Sifirlanmis kademe sayaclari. `Record<EscalationTier, number>` eksiksizlik kilidi. */
function createEscalationTierCounters(): Record<EscalationTier, number> {
  return { STAFF: 0, MANAGER: 0, FOUNDER: 0 };
}

/** Is kalemi henuz sonuclanmamis mi? Bilinmeyen durum tip duzeyinde elenir. */
export function isOfficeWorkItemOpen(status: TaskStatus): boolean {
  return OFFICE_WORK_OPEN_STATUS[status];
}

/**
 * Is kalemi gecikmis mi?
 *
 * TARIH SINIRI (acik kural): `dueDate <= asOf` gecikmis sayilir; yani tam sinirda
 * olan kalem GECIKMISTIR. Bu, mevcut eskalasyon icerik yardimcisinin kuraliyla
 * ayni: `formatRemaining` kalan sureyi `ms <= 0` oldugunda "SURESI GECTI" olarak
 * raporlar. Sonuclanmis (COMPLETED/CANCELLED) kalem gecikmis SAYILMAZ; gecikme
 * yalniz hala acik olan isin ozelligidir. `dueDate` yoksa gecikme de yoktur.
 */
export function isOfficeWorkItemOverdue(item: OfficeWorkDigestItem, asOf: Date): boolean {
  if (!isOfficeWorkItemOpen(item.status)) {
    return false;
  }
  if (item.dueDate === null) {
    return false;
  }
  return item.dueDate.getTime() <= asOf.getTime();
}

/**
 * Salt-okunur is durumu digest'i uretir.
 *
 * Constructor BAGIMLILIGI YOKTUR. Bu tesadufi degil, yapisal bir guvencedir:
 * servis Prisma, notifier veya baska bir IO isbirlikcisi ENJEKTE ETMEDIGI icin
 * kayit yazmasi, bildirim gondermesi ya da `Task.lastNotifiedLevel` guard'ini
 * ilerletmesi MUMKUN DEGILDIR.
 *
 * <remarks>
 * Cagrildigi yerler:
 * - (henuz yok) B08 gorunurluk yuzeyi bu servisi tuketecektir. Yapay tuketici
 *   (controller/scheduler/mevcut bildirim akisina baglama) B07 kapsaminda BILEREK
 *   uretilmemistir.
 * </remarks>
 */
@Injectable()
export class OfficeWorkDigestService {
  buildDigest(input: OfficeWorkDigestInput): OfficeWorkDigest {
    const asOf = new Date(input.asOf.getTime());
    const byStatus = createStatusCounters();
    const byEscalationTier = createEscalationTierCounters();
    const seenWorkItemIds = new Set<string>();

    let totalWorkItems = 0;
    let openWorkItems = 0;
    let overdueWorkItems = 0;
    let escalatedWorkItems = 0;
    let notEscalatedWorkItems = 0;
    let duplicateWorkItemIdsIgnored = 0;

    for (const item of input.items) {
      // Mukerrer kilidi: ayni kimlik bir aggregate icinde YALNIZ BIR KEZ sayilir.
      // Ilk gorulen kayit gecerlidir (deterministik; girdi sirasina baglidir).
      if (seenWorkItemIds.has(item.id)) {
        duplicateWorkItemIdsIgnored += 1;
        continue;
      }
      seenWorkItemIds.add(item.id);

      totalWorkItems += 1;
      byStatus[item.status] += 1;

      if (isOfficeWorkItemOpen(item.status)) {
        openWorkItems += 1;
      }
      if (isOfficeWorkItemOverdue(item, asOf)) {
        overdueWorkItems += 1;
      }

      if (item.escalationLevel === null) {
        notEscalatedWorkItems += 1;
      } else {
        escalatedWorkItems += 1;
        byEscalationTier[item.escalationLevel] += 1;
      }
    }

    return {
      asOf,
      totalWorkItems,
      openWorkItems,
      overdueWorkItems,
      escalatedWorkItems,
      notEscalatedWorkItems,
      byStatus,
      byEscalationTier,
      duplicateWorkItemIdsIgnored,
    };
  }
}
