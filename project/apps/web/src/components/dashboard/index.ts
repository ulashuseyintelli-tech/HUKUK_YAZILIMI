// WSMR-A2c — bu barrel, production'dan ULAŞILAMAYAN ve tamamı uydurma veri üreten
// 14 bileşeni de export ediyordu. O bileşenler kaldırıldı
// (FIXED — UNSUPPORTED_SYNTHETIC_UI_REMOVED); barrel yalnız yaşayan yüzeyleri taşır.
//
// Kaldırılanlar ve nedenleri kısaca: `activity-summary` Math.random() ile sahte
// metrik üretiyordu · `case-status-dashboard` / `lawyer-performance-compare`
// modül seviyesinde `mockData`/`mockLawyers` render ediyordu ·
// `collection-target(-tracker)` demo hedefleri localStorage'a KALICI yazıyordu ·
// `chart-widget`, `advanced`/`lawyer`/`personel` panelleri ile
// `collection-performance-chart`, `case-stat-cards`, `lawyer-task-distribution`,
// `lawyer-calendar`, `stats-widget`, `collection-dashboard` hata veya veri
// yokluğunda uydurma finansal/performans rakamı gösteriyordu.
//
// Gerçek endpoint sözleşmesi olmadığı için veri uydurulmadı; yüzeyler production
// kodundan çıkarıldı. İhtiyaç doğarsa doğrulanmış bir sözleşmeye bağlanarak
// yeniden yazılırlar.

export { ActivityFeed } from "./activity-feed";
export { UpcomingEvents } from "./upcoming-events";
export { QuickSummary } from "./quick-summary";
export { RecentCases } from "./recent-cases";
export { FavoriteCases } from "./favorite-cases";
export { AdvancedStats } from "./advanced-stats";
export { DraggableDashboard, DraggableGrid } from "./draggable-dashboard";
export { StickyNotes } from "./sticky-notes";
export { ThemeCustomizer } from "./theme-customizer";
export { WidgetStore } from "./widget-store";
