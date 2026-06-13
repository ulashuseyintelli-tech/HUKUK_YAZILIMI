/**
 * P3 — UYAP Geçici Arıza (temporary outage) gate'leri — birim testleri
 *
 * Gate-checker SEVİYESİNDE doğrudan test edilir (CPE/provider'a girilmez; fact'ler
 * doğrudan FactMap ile verilir). Kapsam:
 *  - system.uyap_available === false + UYAP_QUERY → blocked:false + SOFT uyarı (metin birebir)
 *  - system.uyap_available === false + UYAP_SEND  → blocked:true (HARD, metin birebir)
 *  - system.uyap_available === true  → outage uyarı/blok YOK
 *  - İzolasyon: allow_uyap_actions (UYAP_DISABLED HARD) ile outage flag birbirini ETKİLEMEZ
 *
 * Not: GateWarning alanı `message`'dır (gate-checker `message: gate.reason` ile doldurur).
 */
import { GateCheckerService } from '../gate-checker.service';
import { ActionCode } from '../../types/action-code.enum';
import type { FactMap, FactValue } from '../../fact-store';

const SOFT_REASON = 'UYAP sistemi geçici olarak devre dışı';
const HARD_SEND_REASON = 'UYAP sistemi geçici olarak devre dışı. Gönderim yapılamaz.';

const factMap = (entries: Record<string, FactValue>): FactMap =>
  new Map<string, FactValue>(Object.entries(entries));

describe('P3 — UYAP geçici arıza gate\'leri (gate-checker)', () => {
  let gateChecker: GateCheckerService;

  beforeEach(() => {
    gateChecker = new GateCheckerService();
  });

  describe('UYAP_QUERY — outage uyarısı (SOFT)', () => {
    it('system.uyap_available=false → blocked:false + SOFT uyarı (metin birebir)', async () => {
      const facts = factMap({ 'system.uyap_available': false });

      const result = await gateChecker.checkGates('case-x', ActionCode.UYAP_QUERY, facts);

      expect(result.blocked).toBe(false);
      expect(result.softWarnings).toBeDefined();
      const w = result.softWarnings?.find((x) => x.code === 'UYAP_TEMPORARILY_UNAVAILABLE');
      expect(w).toBeDefined();
      expect(w?.message).toBe(SOFT_REASON);
      expect(w?.severity).toBe('WARNING');
    });

    it('system.uyap_available=true → outage uyarısı YOK', async () => {
      const facts = factMap({ 'system.uyap_available': true });

      const result = await gateChecker.checkGates('case-x', ActionCode.UYAP_QUERY, facts);

      expect(result.blocked).toBe(false);
      const w = result.softWarnings?.find((x) => x.code === 'UYAP_TEMPORARILY_UNAVAILABLE');
      expect(w).toBeUndefined();
    });
  });

  describe('UYAP_SEND — outage gönderim engeli (HARD)', () => {
    it('system.uyap_available=false → blocked:true (HARD, metin birebir)', async () => {
      // POWER_OF_ATTORNEY_MISSING (prio 25) de tetiklenebilir; outage (prio 12) ÖNCE gelmeli.
      const facts = factMap({ 'system.uyap_available': false });

      const result = await gateChecker.checkGates('case-x', ActionCode.UYAP_SEND, facts);

      expect(result.blocked).toBe(true);
      expect(result.gateCode).toBe('UYAP_TEMPORARILY_UNAVAILABLE_SEND');
      expect(result.reason).toBe(HARD_SEND_REASON);
      expect(result.severity).toBe('HARD');
    });

    it('system.uyap_available=true (diğer gate\'ler geçerse) → outage bloğu YOK, allow', async () => {
      // Diğer SEND HARD gate'lerini geçir: vekaletname var, masraf/closed/archived yok.
      const facts = factMap({
        'system.uyap_available': true,
        'case.has_power_of_attorney': true,
      });

      const result = await gateChecker.checkGates('case-x', ActionCode.UYAP_SEND, facts);

      expect(result.blocked).toBe(false);
      expect(result.gateCode).not.toBe('UYAP_TEMPORARILY_UNAVAILABLE_SEND');
    });
  });

  describe('İzolasyon — outage vs allow_uyap_actions (UYAP_DISABLED)', () => {
    it('allow_uyap_actions=false → UYAP_DISABLED HARD çalışır (outage flag açıkken bile)', async () => {
      const facts = factMap({
        'case.allow_uyap_actions': false,
        'system.uyap_available': true, // outage YOK; kalıcı kapatma ayrı
      });

      const result = await gateChecker.checkGates('case-x', ActionCode.UYAP_QUERY, facts);

      expect(result.blocked).toBe(true);
      expect(result.gateCode).toBe('UYAP_DISABLED');
    });

    it('system.uyap_available=false → UYAP_DISABLED tetiklemez; allow_uyap_actions fact\'i değişmez', async () => {
      const facts = factMap({ 'system.uyap_available': false });

      const result = await gateChecker.checkGates('case-x', ActionCode.UYAP_QUERY, facts);

      // Outage kalıcı kapatma DEĞİL → blocked değil, yalnız SOFT uyarı
      expect(result.blocked).toBe(false);
      expect(result.gateCode).not.toBe('UYAP_DISABLED');
      expect(
        result.softWarnings?.some((x) => x.code === 'UYAP_TEMPORARILY_UNAVAILABLE'),
      ).toBe(true);
      // Gate-checker fact'leri yazmaz: allow_uyap_actions hâlâ tanımsız
      expect(facts.get('case.allow_uyap_actions')).toBeUndefined();
    });
  });
});
