-- Faz 3 alt-faz 3.2: MessageTemplateCategory enum'a 3 yeni değer (additive, ayrı migration)
-- Mail tipleri: müvekkil onayı, ekstre hazır, ödeme bilgisi.
-- ADD VALUE'ları ayrı migration'da tutuyoruz; aynı transaction'da KULLANILMIYOR (seed ayrı çalışır).

ALTER TYPE "MessageTemplateCategory" ADD VALUE IF NOT EXISTS 'CLIENT_APPROVAL';
ALTER TYPE "MessageTemplateCategory" ADD VALUE IF NOT EXISTS 'STATEMENT_READY';
ALTER TYPE "MessageTemplateCategory" ADD VALUE IF NOT EXISTS 'PAYMENT_INFO';
