/*
 * A-07 OWNER PAKETI — HUKUM (SAF MODUL; canli yan etkisi YOK, test edilebilir)
 *
 * 2026-09-10 KUSURU: ozet yalniz KOSULAN olcutleri sayiyordu. Akis A07-04'te (acma restart'i)
 * dustugunde E1-E6 / R1-R2 hic kaydedilmiyor ve ozet "A-07 KABUL: 3/3 PASS · FAIL 0" basiyordu.
 * Nihai satir "PASS DEGIL" dese de ozet PASS GORUNUYORDU.
 *
 * DUZELTME: zorunlu olcut kumesi ONCEDEN ilan edilir. Kosulmayan her zorunlu olcut
 * NOT_EXECUTED olarak eklenir ve OLCULEMEDI sayilir. Hukum `failure` degiskenine DEGIL,
 * zorunlu kumenin TAMAMININ olculup gecmesine dayanir: bir adim sessizce atlansa bile PASS cikmaz.
 */
'use strict';

const MANDATORY = [
  ['A07-01', 'ADMIN erisimi acildi (yalniz kabul suresince)'],
  ['A07-02', 'sentetik ADMIN oturumu acildi'],
  ['A07-03', 'bayrak acma ONCESI uctan KAPALI (403 DISABLED)'],
  ['A07-04', 'bayrak ACIK + servis TOPARLANDI (acma restart)'],
  ['A07-E1', 'executionStatus SUCCEEDED'],
  ['A07-E2', 'AuditLog STARTED izi'],
  ['A07-E3', 'AuditLog SUCCEEDED izi'],
  ['A07-E4', 'CaseStatusHistory KESIN BAG (approvalRequestId + approvalAttempt)'],
  ['A07-E5', 'Case.caseStatus hedefe esit'],
  ['A07-E6', 'DecisionLog satiri yazildi'],
  ['A07-R1', 'reconcile islemi YENIDEN UYGULAMADI'],
  ['A07-R2', 'reconcile terminal durumu dogru degerlendirdi'],
  ['CL-FLAG-FILE', 'kapanis: bayrak dosyada KAPALI'],
  ['CL-FLAG-LOADED', 'kapanis: calisan baslatici GUNCEL (KAPALI) dosyayi okudu'],
  ['CL-FLAG-ENDPOINT', 'kapanis: bayrak uctan KAPALI (403 DISABLED)'],
  ['CL-ACCESS-DB', 'kapanis: sentetik erisim DB de IPTAL'],
  ['CL-ACCESS-LOGIN', 'kapanis: GERCEK parolayla login "devre disi" 401'],
  ['CL-ACCESS-TOKEN', 'kapanis: eski token REDDEDILIYOR (401)'],
  ['CL-SVC-CHAIN', 'kapanis: baslatici zinciri ayakta (host + pwsh + node)'],
  ['CL-SVC-LISTENER', 'kapanis: 8080 API node surecince dinleniyor'],
  ['CL-SVC-DB', 'kapanis: DB ye ulasan sinama 401'],
];

/**
 * @param {Array<{id:string, ok:boolean, unmeasured?:boolean}>} results  recorder sonuclari (yerinde tamamlanir)
 * @param {{failure?: string|null}} ctx
 * @returns {{pass:number, fail:number, unmeasured:number, notExecuted:string[], total:number,
 *            verdict:'PASS'|'PASS DEGIL', reasons:string[]}}
 */
function finalize(results, { failure = null } = {}) {
  const have = new Set(results.map((r) => r.id));
  const notExecuted = [];
  for (const [id, desc] of MANDATORY) {
    if (!have.has(id)) {
      results.push({
        id, desc, ok: false, unmeasured: true, notExecuted: true,
        observed: `NOT_EXECUTED — akis bu adima ULASMADI${failure ? ` (${failure})` : ''}`,
      });
      notExecuted.push(id);
    }
  }
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok && !r.unmeasured).length;
  const unmeasured = results.filter((r) => r.unmeasured).length;
  const allMandatoryOk = MANDATORY.every(([id]) => results.some((r) => r.id === id && r.ok));

  const reasons = [];
  if (failure) reasons.push(failure);
  if (fail) reasons.push(`${fail} olcut DUSTU`);
  if (unmeasured) reasons.push(`${unmeasured} zorunlu olcut OLCULEMEDI/NOT_EXECUTED`);

  const verdict = (!failure && fail === 0 && unmeasured === 0 && allMandatoryOk) ? 'PASS' : 'PASS DEGIL';
  return { pass, fail, unmeasured, notExecuted, total: results.length, verdict, reasons };
}

module.exports = { MANDATORY, finalize };
