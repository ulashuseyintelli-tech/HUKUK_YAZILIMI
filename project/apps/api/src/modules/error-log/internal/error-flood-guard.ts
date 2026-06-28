// PR-2a: In-memory flood guard (ŞEMA DEĞİŞİKLİĞİ YOK). Aynı fingerprint pencere içinde tekrar
// gelirse DB write'ı BASTIRIR → saniyede 100 aynı hata tabloyu şişirmez. PR-2b'de DB-upsert
// occurrenceCount artırımı bunun yerine geçecek (o migration gerektirir, ayrı GO).
import { Injectable } from "@nestjs/common";

@Injectable()
export class ErrorFloodGuard {
  private readonly windowMs = 10_000;
  private readonly max = 5_000;
  private readonly seen = new Map<string, number>();
  private clock: () => number = () => Date.now();

  /** test-only: deterministik saat enjekte et (gerçek zamana bağımlılığı kaldırır). */
  setClockForTest(fn: () => number): void {
    this.clock = fn;
  }

  /** true → DB'ye yazılmalı; false → pencere içinde tekrar (bastır). */
  shouldPersist(fingerprint: string): boolean {
    const now = this.clock();
    const last = this.seen.get(fingerprint);
    if (last !== undefined && now - last < this.windowMs) {
      this.seen.set(fingerprint, now);
      return false;
    }
    this.seen.set(fingerprint, now);
    if (this.seen.size > this.max) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return true;
  }
}
