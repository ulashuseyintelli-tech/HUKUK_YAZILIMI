# ai_valuation_prompt_v5.md
Aşağıdaki bilgileri kullanarak Türkiye pazarı için araç değer tahmini üret.

Girdi JSON:
{
  "plate": "...",
  "make": "...",
  "model": "...",
  "year": 2019,
  "vin": "...",
  "km": 120000,
  "fuel": "Dizel/Benzin/Hybrid/EV/Unknown",
  "transmission": "Otomatik/Manuel/Unknown",
  "trim": "...",
  "notes": "hasar, boya, tramer, ticari kullanım, segment vs.",
  "market": "TR"
}

Çıktı JSON (yalnız JSON döndür):
{
  "model_version": "v5",
  "value_low": <number>,
  "value_mid": <number>,
  "value_high": <number>,
  "confidence": <0..1>,
  "liquidation_factor": <0..1>,
  "reasoning_bullets": ["...","...","..."],
  "assumptions": {"km_missing": true/false, "condition_unknown": true/false}
}

Kurallar:
- Bilgi eksikse confidence düşür, value bandını genişlet.
- Likidite faktörünü segment/yaş/araç türüne göre belirle.
- TL cinsinden üret.
