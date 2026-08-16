import { readFileSync } from 'fs';
import { join } from 'path';
import { EscalationTier, TaskStatus } from '@prisma/client';
import {
  OfficeWorkDigest,
  OfficeWorkDigestItem,
  OfficeWorkDigestService,
  isOfficeWorkItemOpen,
  isOfficeWorkItemOverdue,
} from '../office-work-digest.service';

/**
 * OFFICE-WR01-B07 — WORK DIGEST KILIDI.
 *
 * Bu spec iki seyi birden kanitlar:
 *  1) POZITIF: aggregate siniflandirmasi, tarih siniri, mukerrer kilidi, determinizm.
 *  2) NEGATIF: D-WR-5 (kisi-performansi yok), D-WR-3 (karar/onay sayisi yok) ve
 *     yan-etkisizlik (gonderim/yazma/guard ilerletme yok) — yalniz isim aramasiyla
 *     degil, TIP SEKLI ve MODUL BAGIMLILIKLARI uzerinden mekanik olarak.
 */

const ASOF = new Date('2026-08-16T12:00:00.000Z');

function item(overrides: Partial<OfficeWorkDigestItem> & { id: string }): OfficeWorkDigestItem {
  return {
    status: 'PENDING',
    dueDate: null,
    escalationLevel: null,
    ...overrides,
  };
}

/**
 * TIP DUZEYI ANAHTAR KILIDI — girdi.
 * `Record<keyof OfficeWorkDigestItem, true>` oldugu icin arayuze yeni bir alan
 * (ornegin `assigneeId`) eklenirse typecheck kirilir. D-WR-5 boylece adlandirmayla
 * degil, girdi seklinin kendisiyle korunur.
 */
const DIGEST_ITEM_KEYS: Record<keyof OfficeWorkDigestItem, true> = {
  id: true,
  status: true,
  dueDate: true,
  escalationLevel: true,
};

/** TIP DUZEYI ANAHTAR KILIDI — cikti. Yeni alan eklenirse typecheck kirilir. */
const DIGEST_KEYS: Record<keyof OfficeWorkDigest, true> = {
  asOf: true,
  totalWorkItems: true,
  openWorkItems: true,
  overdueWorkItems: true,
  escalatedWorkItems: true,
  notEscalatedWorkItems: true,
  byStatus: true,
  byEscalationTier: true,
  duplicateWorkItemIdsIgnored: true,
};

/** Sonuc nesnesindeki TUM anahtarlari (ic ice dahil) toplar. */
function collectKeysDeep(value: unknown, acc: string[] = []): string[] {
  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return acc;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    acc.push(key);
    collectKeysDeep(nested, acc);
  }
  return acc;
}

describe('OFFICE-WR01-B07 — digest aggregate davranisi', () => {
  const service = new OfficeWorkDigestService();

  it('bos girdi icin stabil ve tamamen sifir sonuc uretir', () => {
    const digest = service.buildDigest({ asOf: ASOF, items: [] });

    expect(digest.totalWorkItems).toBe(0);
    expect(digest.openWorkItems).toBe(0);
    expect(digest.overdueWorkItems).toBe(0);
    expect(digest.escalatedWorkItems).toBe(0);
    expect(digest.notEscalatedWorkItems).toBe(0);
    expect(digest.duplicateWorkItemIdsIgnored).toBe(0);
    expect(digest.byStatus).toEqual({ PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 });
    expect(digest.byEscalationTier).toEqual({ STAFF: 0, MANAGER: 0, FOUNDER: 0 });
    expect(digest.asOf.getTime()).toBe(ASOF.getTime());
  });

  it('bekleyen/devam eden/sonuclanmis isleri durumuna gore ayirir', () => {
    const digest = service.buildDigest({
      asOf: ASOF,
      items: [
        item({ id: 'a', status: 'PENDING' }),
        item({ id: 'b', status: 'PENDING' }),
        item({ id: 'c', status: 'IN_PROGRESS' }),
        item({ id: 'd', status: 'COMPLETED' }),
        item({ id: 'e', status: 'CANCELLED' }),
      ],
    });

    expect(digest.byStatus).toEqual({ PENDING: 2, IN_PROGRESS: 1, COMPLETED: 1, CANCELLED: 1 });
    // Acik is = PENDING + IN_PROGRESS (mevcut eskalasyon motorunun filtresiyle ayni).
    expect(digest.openWorkItems).toBe(3);
    expect(digest.totalWorkItems).toBe(5);
  });

  it('geciken isleri yalniz ACIK kalemler icinden sayar', () => {
    const past = new Date(ASOF.getTime() - 86_400_000);
    const future = new Date(ASOF.getTime() + 86_400_000);
    const digest = service.buildDigest({
      asOf: ASOF,
      items: [
        item({ id: 'gecikmis-pending', status: 'PENDING', dueDate: past }),
        item({ id: 'gecikmis-inprogress', status: 'IN_PROGRESS', dueDate: past }),
        item({ id: 'zamaninda', status: 'PENDING', dueDate: future }),
        item({ id: 'tarihsiz', status: 'PENDING', dueDate: null }),
        // Sonuclanmis kalem gecmis tarihli olsa da GECIKMIS degildir.
        item({ id: 'tamamlanmis', status: 'COMPLETED', dueDate: past }),
        item({ id: 'iptal', status: 'CANCELLED', dueDate: past }),
      ],
    });

    expect(digest.overdueWorkItems).toBe(2);
    expect(digest.openWorkItems).toBe(4);
  });

  it('tarih sinirinda deterministiktir: dueDate == asOf GECIKMISTIR', () => {
    const digest = service.buildDigest({
      asOf: ASOF,
      items: [
        item({ id: 'bir-ms-once', dueDate: new Date(ASOF.getTime() - 1) }),
        item({ id: 'tam-sinir', dueDate: new Date(ASOF.getTime()) }),
        item({ id: 'bir-ms-sonra', dueDate: new Date(ASOF.getTime() + 1) }),
      ],
    });

    expect(digest.overdueWorkItems).toBe(2);

    // Predikat duzeyinde de acikca sabitlenir.
    expect(isOfficeWorkItemOverdue(item({ id: 'x', dueDate: new Date(ASOF.getTime() - 1) }), ASOF)).toBe(true);
    expect(isOfficeWorkItemOverdue(item({ id: 'x', dueDate: new Date(ASOF.getTime()) }), ASOF)).toBe(true);
    expect(isOfficeWorkItemOverdue(item({ id: 'x', dueDate: new Date(ASOF.getTime() + 1) }), ASOF)).toBe(false);
  });

  it('eskalasyon kademelerini ozetler ve kademesiz isleri ayri tutar', () => {
    const digest = service.buildDigest({
      asOf: ASOF,
      items: [
        item({ id: 'a', escalationLevel: 'STAFF' }),
        item({ id: 'b', escalationLevel: 'STAFF' }),
        item({ id: 'c', escalationLevel: 'MANAGER' }),
        item({ id: 'd', escalationLevel: 'FOUNDER' }),
        item({ id: 'e', escalationLevel: null }),
      ],
    });

    expect(digest.byEscalationTier).toEqual({ STAFF: 2, MANAGER: 1, FOUNDER: 1 });
    expect(digest.escalatedWorkItems).toBe(4);
    expect(digest.notEscalatedWorkItems).toBe(1);
    expect(digest.escalatedWorkItems + digest.notEscalatedWorkItems).toBe(digest.totalWorkItems);
  });

  it('bir is aggregate icinde MUKERRER sayilmaz', () => {
    const digest = service.buildDigest({
      asOf: ASOF,
      items: [
        item({ id: 'ayni', status: 'PENDING', escalationLevel: 'STAFF' }),
        item({ id: 'ayni', status: 'PENDING', escalationLevel: 'STAFF' }),
        item({ id: 'ayni', status: 'COMPLETED', escalationLevel: 'FOUNDER' }),
        item({ id: 'farkli', status: 'PENDING' }),
      ],
    });

    expect(digest.totalWorkItems).toBe(2);
    expect(digest.duplicateWorkItemIdsIgnored).toBe(2);
    // Ilk gorulen kayit gecerlidir → deterministik.
    expect(digest.byStatus.PENDING).toBe(2);
    expect(digest.byStatus.COMPLETED).toBe(0);
    expect(digest.byEscalationTier).toEqual({ STAFF: 1, MANAGER: 0, FOUNDER: 0 });
  });

  it('her eksen kendi icinde tekildir (eksen toplamlari = toplam is)', () => {
    const digest = service.buildDigest({
      asOf: ASOF,
      items: [
        item({ id: 'a', status: 'PENDING', escalationLevel: 'STAFF' }),
        item({ id: 'b', status: 'IN_PROGRESS', escalationLevel: 'MANAGER' }),
        item({ id: 'c', status: 'COMPLETED', escalationLevel: null }),
        item({ id: 'd', status: 'CANCELLED', escalationLevel: 'FOUNDER' }),
      ],
    });

    const statusTotal = Object.values(digest.byStatus).reduce((sum, n) => sum + n, 0);
    const tierTotal = Object.values(digest.byEscalationTier).reduce((sum, n) => sum + n, 0);

    expect(statusTotal).toBe(digest.totalWorkItems);
    expect(tierTotal + digest.notEscalatedWorkItems).toBe(digest.totalWorkItems);
  });

  it('ayni veri + ayni asOf ayni sonucu uretir (deterministik)', () => {
    const build = (): OfficeWorkDigest =>
      service.buildDigest({
        asOf: new Date(ASOF.getTime()),
        items: [
          item({ id: 'a', status: 'PENDING', dueDate: new Date(ASOF.getTime() - 5), escalationLevel: 'MANAGER' }),
          item({ id: 'b', status: 'COMPLETED', dueDate: new Date(ASOF.getTime() + 5), escalationLevel: null }),
        ],
      });

    expect(build()).toEqual(build());
  });

  it('girdi koleksiyonunu ve elemanlarini MUTATE ETMEZ', () => {
    const items: OfficeWorkDigestItem[] = [
      item({ id: 'a', status: 'PENDING', dueDate: new Date(ASOF.getTime() - 10), escalationLevel: 'STAFF' }),
      item({ id: 'a', status: 'CANCELLED' }),
      item({ id: 'b', status: 'IN_PROGRESS' }),
    ];
    const asOf = new Date(ASOF.getTime());
    const snapshot = JSON.stringify(items);
    const asOfSnapshot = asOf.getTime();
    const dueDateRef = items[0].dueDate;

    service.buildDigest({ asOf, items });

    expect(JSON.stringify(items)).toBe(snapshot);
    expect(items).toHaveLength(3);
    expect(items[0].dueDate).toBe(dueDateRef);
    expect(asOf.getTime()).toBe(asOfSnapshot);
  });

  it('asOf ciktisi cagiranin Date nesnesine TAKMA AD degildir', () => {
    const asOf = new Date(ASOF.getTime());
    const digest = service.buildDigest({ asOf, items: [] });

    expect(digest.asOf).not.toBe(asOf);
    expect(digest.asOf.getTime()).toBe(asOf.getTime());
  });
});

describe('OFFICE-WR01-B07 — enum kapsami eksiksizdir', () => {
  const service = new OfficeWorkDigestService();
  const digest = service.buildDigest({ asOf: ASOF, items: [] });

  it('byStatus TUM TaskStatus degerlerini kapsar (eksik/fazla yok)', () => {
    expect(Object.keys(digest.byStatus).sort()).toEqual(
      (Object.values(TaskStatus) as string[]).sort(),
    );
  });

  it('byEscalationTier TUM EscalationTier degerlerini kapsar (eksik/fazla yok)', () => {
    expect(Object.keys(digest.byEscalationTier).sort()).toEqual(
      (Object.values(EscalationTier) as string[]).sort(),
    );
  });

  it('acik/kapali siniflandirmasi her TaskStatus icin tanimlidir (ortulu fallback yok)', () => {
    for (const status of Object.values(TaskStatus) as TaskStatus[]) {
      expect(typeof isOfficeWorkItemOpen(status)).toBe('boolean');
    }
    expect(isOfficeWorkItemOpen('PENDING')).toBe(true);
    expect(isOfficeWorkItemOpen('IN_PROGRESS')).toBe(true);
    expect(isOfficeWorkItemOpen('COMPLETED')).toBe(false);
    expect(isOfficeWorkItemOpen('CANCELLED')).toBe(false);
  });
});

describe('OFFICE-WR01-B07 — D-WR-5 / D-WR-3 negatif sinirlari', () => {
  const service = new OfficeWorkDigestService();
  const digest = service.buildDigest({
    asOf: ASOF,
    items: [item({ id: 'a', status: 'PENDING', escalationLevel: 'MANAGER' })],
  });
  const digestKeys = collectKeysDeep(digest);

  it('girdi tipi KISI KIMLIGI tasimaz (D-WR-5 yapisal kilit)', () => {
    expect(Object.keys(DIGEST_ITEM_KEYS).sort()).toEqual(
      ['dueDate', 'escalationLevel', 'id', 'status'],
    );
  });

  it('cikti yuzeyi tam olarak beyan edilen alanlardan olusur', () => {
    expect(Object.keys(digest).sort()).toEqual(Object.keys(DIGEST_KEYS).sort());
  });

  it('digest sonucunda KISI-PERFORMANSI alani/metrigi YOKTUR (D-WR-5)', () => {
    const forbidden = [
      'assignee',
      'assigned',
      'user',
      'lawyer',
      'staffmember',
      'personnel',
      'personel',
      'employee',
      'performance',
      'performans',
      'productivity',
      'verimlilik',
      'score',
      'puan',
      'ranking',
      'leaderboard',
      'siralama',
      'throughput',
      'velocity',
      'sla',
      'completedby',
      'createdby',
      'resolvedby',
      'perperson',
      'byuser',
      'byassignee',
      'byperson',
    ];
    const offenders = digestKeys.filter((key) =>
      forbidden.some((token) => key.toLowerCase().includes(token)),
    );
    expect(offenders).toEqual([]);
  });

  it('digest sonucunda KISI/ASSIGNEE bazli siralama veya gruplama YOKTUR (D-WR-5)', () => {
    // Gruplama eksenleri yalniz sunlardir; kisi ekseni YOKTUR.
    const groupingKeys = Object.keys(digest).filter((key) => key.startsWith('by'));
    expect(groupingKeys.sort()).toEqual(['byEscalationTier', 'byStatus']);

    // Hicbir alan dizi degildir → siralanmis kisi listesi tasinamaz.
    const arrays = Object.entries(digest).filter(([, value]) => Array.isArray(value));
    expect(arrays).toEqual([]);
  });

  it('digest sonucunda ONAY/QUORUM/KARAR-SAYISI alani YOKTUR (D-WR-3)', () => {
    const forbidden = [
      'approval',
      'approve',
      'approver',
      'quorum',
      'requireddecision',
      'decisioncount',
      'decisions',
      'vote',
      'policy',
      'politika',
      'onay',
      'recipient',
      'notify',
      'notification',
      'fanout',
    ];
    const offenders = digestKeys.filter((key) =>
      forbidden.some((token) => key.toLowerCase().includes(token)),
    );
    expect(offenders).toEqual([]);
  });

  it('digest sonucunda BILDIRIM GUARD alani (lastNotifiedLevel) YOKTUR', () => {
    expect(digestKeys.map((key) => key.toLowerCase())).not.toContain('lastnotifiedlevel');
    expect(Object.keys(DIGEST_ITEM_KEYS)).not.toContain('lastNotifiedLevel');
  });
});

describe('OFFICE-WR01-B07 — yan etki yokluğu (yapisal kanit)', () => {
  const SOURCE_PATH = join(__dirname, '..', 'office-work-digest.service.ts');
  const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

  it('servis HICBIR bagimliligi enjekte ETMEZ → gonderim/yazma yapisal olarak imkansiz', () => {
    // Class.length = constructor arity. 0 → Prisma, notifier veya baska IS BIRLIKCISI yok.
    expect(OfficeWorkDigestService.length).toBe(0);
    expect(() => new OfficeWorkDigestService()).not.toThrow();
  });

  it('modul YALNIZ iki bagimlilik import eder (persistence/notifier/B06 yok)', () => {
    const importLines = SOURCE.split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('import '));

    expect(importLines).toEqual([
      "import { Injectable } from '@nestjs/common';",
      "import { EscalationTier, TaskStatus } from '@prisma/client';",
    ]);
  });

  it('digest uretimi SENKRONDUR → beklenen bir IO cagrisi yoktur', () => {
    const digest = new OfficeWorkDigestService().buildDigest({ asOf: ASOF, items: [] });
    expect(digest).not.toBeInstanceOf(Promise);
    expect(typeof digest.totalWorkItems).toBe('number');
  });

  it('mevcut bildirim motorunu veya B01 politika sozlugunu TUKETMEZ', () => {
    // Kaynak, calisma zamaninda hicbir iliskisel yolu import etmez (yorum satirlari
    // haric gercek import ifadeleri yukaridaki testte birebir kilitlidir). Burada
    // ek olarak dinamik yukleme yollari da bulunmadigini dogrulariz.
    expect(SOURCE).not.toMatch(/\brequire\s*\(/);
    expect(SOURCE).not.toMatch(/\bimport\s*\(/);
    expect(SOURCE).not.toMatch(/PrismaService/);
    expect(SOURCE).not.toMatch(/TenantNotifier/);
  });

  it('kontrolsuz zaman kaynagi (Date.now / argumansiz new Date) KULLANMAZ', () => {
    expect(SOURCE).not.toMatch(/Date\.now\s*\(/);
    expect(SOURCE).not.toMatch(/new Date\s*\(\s*\)/);
  });
});
