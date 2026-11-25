/**
 * F03-B2 (OFP-02; owner kararı K2-a, 25.11.2026) — dosyaya bağlı Task satırı → Operasyon Masası "Yapılacaklar" görevi.
 *
 * Dosya sayfasındaki iş listesi üç AYRI kaynaktan beslenir ve eylemleri birbirine karışmaz:
 *   - adres görevi            → `/address-tasks/*`
 *   - masraf talebinden türev → eylem yok (`taskType: "EXPENSE_REQUEST"`)
 *   - Task satırı (bu dosya)  → `/tasks/*` (`taskType: CASE_TASK_DECK_TYPE`)
 * Bu dönüştürücü saf işlevdir; sunucu durumu yalnız `TaskStatus` değerleridir (PENDING / IN_PROGRESS / COMPLETED / CANCELLED).
 */
export const CASE_TASK_DECK_TYPE = "TASK";

/** Dosya görevleri okunurken durum başına çekilen en çok sayfa (sayfa boyu 100). Aşılırsa liste kısaltılmış sayılır. */
export const CASE_TASK_MAX_PAGES = 5;
export const CASE_TASK_PAGE_SIZE = 100;
/** Dosyada "bekleyen iş" sayılan sunucu durumları. */
export const CASE_TASK_OPEN_STATUSES = ["PENDING", "IN_PROGRESS"] as const;

export interface CaseTaskRow {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  dueDate?: string | null;
  createdById?: string | null;
}

export interface CaseDeckTask {
  id: string;
  title: string;
  description?: string;
  source: "SISTEM" | "MANUEL";
  taskType: string;
  status: "BEKLIYOR" | "YAPILDI" | "IPTAL";
  dueDate?: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  /** Görevin KENDİ öncelik etiketi (Görevler ekranındaki adla aynı). Liste üç kademeli rozete indirger; etiket indirgenmez. */
  priorityLabel: string;
  category: "SURE_BAGLI";
}

const DECK_STATUS: Record<string, CaseDeckTask["status"]> = {
  PENDING: "BEKLIYOR",
  IN_PROGRESS: "BEKLIYOR",
  COMPLETED: "YAPILDI",
  CANCELLED: "IPTAL",
};

const DECK_PRIORITY: Record<string, CaseDeckTask["priority"]> = {
  URGENT: "HIGH",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

/** Görevler ekranındaki öncelik adları (tasks/page.tsx formu): dosyada "Yüksek" görev "Acil" diye görünmez. */
const TASK_PRIORITY_LABEL: Record<string, string> = {
  URGENT: "Acil",
  HIGH: "Yüksek",
  MEDIUM: "Orta",
  LOW: "Düşük",
};

/** Bilinmeyen durum "bekliyor" SAYILMAZ: satır listeye girmez (null). Ekran API'nin vermediği bir durumu uydurmaz. */
export function taskRowToDeckTask(row: CaseTaskRow): CaseDeckTask | null {
  const status = DECK_STATUS[row.status];
  if (!row || typeof row.id !== "string" || !row.id || !status) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    // Kullanıcının açtığı görev `createdById` taşır; sistem üreticileri taşımaz.
    source: row.createdById ? "MANUEL" : "SISTEM",
    taskType: CASE_TASK_DECK_TYPE,
    status,
    dueDate: row.dueDate ?? undefined,
    priority: DECK_PRIORITY[String(row.priority ?? "")] ?? "MEDIUM",
    priorityLabel: TASK_PRIORITY_LABEL[String(row.priority ?? "")] ?? TASK_PRIORITY_LABEL.MEDIUM,
    category: "SURE_BAGLI",
  };
}

/**
 * `GET /tasks` yanıt zarfı `{ data, meta: { totalPages } }`. Zarf beklenen biçimde değilse satır yoktur ve tek sayfadır
 * (hata değildir; okuma hatası çağıranın `catch` dalındadır).
 */
export function taskRowsFromListResponse(res: unknown): { rows: CaseTaskRow[]; totalPages: number } {
  const body = res && typeof res === "object" ? (res as { data?: unknown; meta?: { totalPages?: unknown } }) : {};
  const rows = Array.isArray(body.data) ? (body.data as CaseTaskRow[]) : [];
  const totalPages = Number(body.meta?.totalPages);
  return { rows, totalPages: Number.isInteger(totalPages) && totalPages > 0 ? totalPages : 1 };
}
