// P3-2B-2: Kanonik LegalCaseStatus seçenekleri (backend STATUS_DESCRIPTIONS / case-status.service ile birebir 13 değer).
// Statü değiştirme dropdown'larının TEK kaynağı — kanonik POST /case-status/:caseId/change route'una giden değerler.
// Bayat/yanlış "KAPALI / ASKIDA / ARSIV" listelerinin yerine geçer (bunlar geçerli enum DEĞİL → kanonik route 400 verirdi).
export const CASE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "DERDEST", label: "Derdest" },
  { value: "ISLEMDE", label: "İşlemde" },
  { value: "DERKENAR", label: "Derkenar" },
  { value: "HITAM", label: "Hitam" },
  { value: "INFAZ", label: "İnfaz" },
  { value: "MUVEKKILE_IADE", label: "Müvekkile İade" },
  { value: "ACIZ", label: "Aciz" },
  { value: "BATAK", label: "Batak" },
  { value: "MAHSUP", label: "Mahsup" },
  { value: "TEMLIK", label: "Temlik" },
  { value: "AZIL", label: "Azil" },
  { value: "FERAGAT", label: "Feragat" },
  { value: "SULH", label: "Sulh" },
];
