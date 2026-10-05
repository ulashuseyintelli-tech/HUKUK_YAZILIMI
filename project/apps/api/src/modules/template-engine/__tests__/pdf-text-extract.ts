/**
 * Test yardımcısı — pdfmake/pdfkit çıktısından METİN çıkarır (yeni bağımlılık YOK; `pdf-parse` 1.1.1 gömülü TrueType
 * çıktısında "bad XRef entry" ile düştüğü için güvenilir değil).
 *
 * Neden gerekli: standart yazı tipinde (Courier/Helvetica) Türkçe harfler kodlayıcıda bozulur ve PDF yine de "geçerli"
 * görünür; kusuru ancak PDF'in İÇİNDEKİ metni okuyarak yakalarız. Bu çıkarıcı:
 *   - zlib akışlarını açar, `/Font` kaynak adlarını (F1, F2 …) font nesnelerine bağlar,
 *   - gömülü (Type0 / Identity-H) yazı tiplerini ToUnicode CMap'iyle çözer (bfchar + bfrange: skaler ve dizi biçimi),
 *   - ToUnicode'u olmayan (standart Type1) yazı tiplerini TEK bayt / Windows-1252 sayar — yani bozuk kodlama bozuk
 *     metin olarak görünür ve karşılaştırma DÜŞER (kör değil).
 * pdfmake her kelimeyi ayrı `BT … Tf … TJ … ET` bloğu yazar (boşluk glifi yok): metin = kelimelerin akış sırasıyla
 * birleşimi; karşılaştırma boşluksuz yapılır (bkz. `stripWhitespace`).
 */
import { inflateSync } from 'zlib';

export interface PdfFontInfo {
  /** `/BaseFont` değeri (gömülü alt kümede `ABCDEF+` öneki vardır) */
  baseFont: string;
  /** Standart (gömülmemiş) Type1 yazı tipi mi — WinAnsi, Türkçe harfleri taşımaz */
  standard: boolean;
}

export interface PdfTextExtraction {
  /** Akış sırasıyla çözülmüş kelime parçaları */
  words: string[];
  /** words birleşimi (boşluksuz) */
  text: string;
  fonts: PdfFontInfo[];
  pageCount: number;
  /** Gömülü TrueType yazı tipi dosyası (`/FontFile2`) sayısı */
  embeddedFontFiles: number;
}

export const stripWhitespace = (s: string): string => s.replace(/\s+/gu, '');

interface PdfObject {
  id: number;
  dict: string;
  stream?: Buffer;
}

function parseObjects(pdf: Buffer): PdfObject[] {
  const s = pdf.toString('latin1');
  const out: PdfObject[] = [];
  const re = /(?:^|[\r\n])(\d+) 0 obj\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const streamAt = s.indexOf('stream', start);
    const endObj = s.indexOf('endobj', start);
    if (endObj < 0) break;
    const hasStream = streamAt >= 0 && streamAt < endObj && /^\s*(?:\r?\n)/u.test(s.slice(streamAt + 6, streamAt + 8));
    if (!hasStream) {
      out.push({ id: Number(m[1]), dict: s.slice(start, endObj) });
      re.lastIndex = endObj;
      continue;
    }
    const dict = s.slice(start, streamAt);
    const dataStart = streamAt + 6 + (s[streamAt + 6] === '\r' ? 2 : 1);
    const endStream = s.indexOf('endstream', dataStart);
    let data: Buffer = Buffer.from(s.slice(dataStart, endStream), 'latin1');
    if (/\/FlateDecode/u.test(dict)) {
      try {
        data = inflateSync(data);
      } catch {
        data = Buffer.alloc(0); // bozuk / beklenmeyen akış: metin çıkarılamaz (test eşitliği düşer)
      }
    }
    out.push({ id: Number(m[1]), dict, stream: data });
    re.lastIndex = endStream + 9;
  }
  return out;
}

const hexToUnicode = (hex: string): string => {
  const b = Buffer.from(hex.length % 4 === 0 ? hex : hex.padStart(hex.length + (4 - (hex.length % 4)), '0'), 'hex');
  return Buffer.from(b).swap16().toString('utf16le');
};

function parseToUnicode(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/gu)) {
    for (const e of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/gu)) map.set(parseInt(e[1], 16), hexToUnicode(e[2]));
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/gu)) {
    const body = block[1];
    // <lo> <hi> [<d0> <d1> ...]   |   <lo> <hi> <dst>
    for (const e of body.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/gu)) {
      const lo = parseInt(e[1], 16);
      const hi = parseInt(e[2], 16);
      if (e[3].startsWith('[')) {
        [...e[3].matchAll(/<([0-9a-fA-F]+)>/gu)].forEach((d, i) => map.set(lo + i, hexToUnicode(d[1])));
      } else {
        const base = hexToUnicode(e[3].slice(1, -1));
        for (let c = lo; c <= hi; c++) map.set(c, base.length === 1 ? String.fromCodePoint(base.codePointAt(0)! + (c - lo)) : base);
      }
    }
  }
  return map;
}

const win1252 = new TextDecoder('windows-1252');

export function extractPdfText(pdf: Buffer): PdfTextExtraction {
  const objects = parseObjects(pdf);
  const byId = new Map(objects.map((o) => [o.id, o]));

  // Font nesneleri: id → { baseFont, cmap | standart }
  const fontById = new Map<number, { info: PdfFontInfo; cmap: Map<number, string> | null }>();
  for (const o of objects) {
    if (!/\/Type\s*\/Font\b/u.test(o.dict) || /\/Subtype\s*\/CIDFontType2\b/u.test(o.dict)) continue;
    const baseFont = /\/BaseFont\s*\/([^\s/>\[]+)/u.exec(o.dict)?.[1] ?? '';
    const tu = /\/ToUnicode\s+(\d+)\s+0\s+R/u.exec(o.dict)?.[1];
    const cmapObj = tu ? byId.get(Number(tu)) : undefined;
    const cmap = cmapObj?.stream ? parseToUnicode(cmapObj.stream.toString('latin1')) : null;
    fontById.set(o.id, { info: { baseFont, standard: !cmap && /\/Subtype\s*\/Type1\b/u.test(o.dict) }, cmap });
  }

  // Kaynak adı (F1 …) → font nesnesi
  const nameToFont = new Map<string, number>();
  for (const o of objects) {
    for (const res of o.dict.matchAll(/\/Font\s*<<([^>]*)>>/gu)) {
      for (const e of res[1].matchAll(/\/([A-Za-z0-9_]+)\s+(\d+)\s+0\s+R/gu)) nameToFont.set(e[1], Number(e[2]));
    }
  }

  const words: string[] = [];
  for (const o of objects) {
    if (!o.stream) continue;
    const content = o.stream.toString('latin1');
    if (!/\bBT\b/u.test(content) || !/\bTf\b/u.test(content)) continue; // yalnız metin içeren sayfa içerik akışları
    let current: { cmap: Map<number, string> | null } | undefined;
    const tokenRe = /\/([A-Za-z0-9_]+)\s+[-\d.]+\s+Tf|\[((?:[^\]\\]|\\.)*)\]\s*TJ|(<[0-9a-fA-F]*>|\((?:\\.|[^)\\])*\))\s*Tj/gu;
    let t: RegExpExecArray | null;
    while ((t = tokenRe.exec(content))) {
      if (t[1]) {
        const fid = nameToFont.get(t[1]);
        current = fid !== undefined ? fontById.get(fid) : undefined;
        continue;
      }
      const strings = t[2] !== undefined ? [...t[2].matchAll(/<([0-9a-fA-F]*)>|\(((?:\\.|[^)\\])*)\)/gu)] : [...t[3].matchAll(/<([0-9a-fA-F]*)>|\(((?:\\.|[^)\\])*)\)/gu)];
      for (const sm of strings) {
        const raw = sm[1] !== undefined ? Buffer.from(sm[1], 'hex') : Buffer.from((sm[2] ?? '').replace(/\\(.)/gu, '$1'), 'latin1');
        if (current?.cmap) {
          let w = '';
          for (let i = 0; i + 1 < raw.length; i += 2) w += current.cmap.get(raw.readUInt16BE(i)) ?? '�';
          words.push(w);
        } else {
          words.push(win1252.decode(raw)); // standart yazı tipi: tek bayt (Türkçe harfler burada bozuk görünür)
        }
      }
    }
  }

  const infos = [...fontById.values()].map((f) => f.info);
  return {
    words,
    text: stripWhitespace(words.join('')),
    fonts: infos,
    pageCount: (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/gu) ?? []).length,
    embeddedFontFiles: (pdf.toString('latin1').match(/\/FontFile2\b/gu) ?? []).length,
  };
}

/** pdfmake belge tanımındaki (içerik) metin dizelerini akış sırasıyla toplar — karşılaştırmanın KAYNAK tarafı. */
export function collectDefinitionText(node: unknown, acc: string[] = []): string[] {
  if (node == null) return acc;
  if (typeof node === 'string') {
    acc.push(node);
    return acc;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectDefinitionText(n, acc));
    return acc;
  }
  if (typeof node === 'object') {
    const n = node as Record<string, unknown>;
    if (n.text !== undefined) collectDefinitionText(n.text, acc);
    for (const k of ['columns', 'stack', 'ul', 'ol', 'content']) if (n[k] !== undefined) collectDefinitionText(n[k], acc);
    const table = n.table as { body?: unknown[][] } | undefined;
    if (table?.body) table.body.forEach((row) => row.forEach((c) => collectDefinitionText(c, acc)));
  }
  return acc;
}
