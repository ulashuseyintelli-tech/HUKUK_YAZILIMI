/**
 * Format Utilities for Reporter
 * 
 * Consistent formatting for legal documents
 */

// ═══════════════════════════════════════════════════════════════════════════
// MONEY FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format money value with Turkish locale
 * @param amount - Amount in minor units or decimal
 * @param currency - Currency code (default: TRY)
 */
export function formatMoney(amount: number, currency: string = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format money without currency symbol
 */
export function formatMoneyPlain(amount: number): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ═══════════════════════════════════════════════════════════════════════════
// DATE FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format ISO date to Turkish format (DD.MM.YYYY)
 */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

/**
 * Format ISO date to long Turkish format
 */
export function formatDateLong(isoDate: string): string {
  const date = new Date(isoDate + 'T00:00:00+03:00');
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Format date range
 */
export function formatDateRange(startDate: string, endDate: string): string {
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PERCENT FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format decimal rate as percentage
 * @param rate - Decimal rate (e.g., 0.4225 for 42.25%)
 */
export function formatPercent(rate: number): string {
  return `%${(rate * 100).toFixed(2)}`;
}

/**
 * Format decimal rate as percentage without symbol
 */
export function formatPercentPlain(rate: number): string {
  return (rate * 100).toFixed(2);
}

// ═══════════════════════════════════════════════════════════════════════════
// NUMBER FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format number with Turkish locale
 */
export function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMESTAMP FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format timestamp for audit records
 */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format ISO timestamp
 */
export function formatISOTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}
