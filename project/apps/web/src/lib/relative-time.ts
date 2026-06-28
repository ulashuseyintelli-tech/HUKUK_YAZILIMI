// Error Logs UI polish: göreli zaman ("5 dk önce" / "2 saat önce" / "3 gün önce").
// SAF + now-injectable (test deterministik). Absolute tarih çağıran tarafta title olarak kalır.
export function relativeTime(date?: string | null, now: number = Date.now()): string {
  if (!date) return "-";
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return String(date);

  const diff = now - t; // pozitif = geçmiş
  const abs = Math.abs(diff);
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);

  if (sec < 45) return "az önce";

  let phrase: string;
  if (min < 60) phrase = `${min} dk`;
  else if (hr < 24) phrase = `${hr} saat`;
  else if (day < 30) phrase = `${day} gün`;
  else if (day < 365) phrase = `${Math.round(day / 30)} ay`;
  else phrase = `${Math.round(day / 365)} yıl`;

  return diff >= 0 ? `${phrase} önce` : `${phrase} sonra`;
}
