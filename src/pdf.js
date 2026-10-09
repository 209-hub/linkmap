// ตัวเขียน PDF อย่างง่าย (ไม่ใช้ไลบรารี): หน้าเดียว ฝังภาพ JPEG เต็มหน้า
// ใช้สำหรับ "ส่งออกเป็น PDF" — ภาพผังถูกเรนเดอร์เป็น JPEG ก่อนแล้วห่อเป็น PDF

const enc = new TextEncoder();

function concat(parts) {
  let len = 0; for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/**
 * สร้างไฟล์ PDF (Uint8Array) ที่มีภาพ JPEG หนึ่งภาพ
 * @param {Uint8Array} jpeg  ไบต์ของไฟล์ JPEG
 * @param {number} width  ความกว้างภาพ (พิกเซล)
 * @param {number} height ความสูงภาพ (พิกเซล)
 * @param {object} opts  { title, pageWidth, pageHeight, margin } หน่วย point (72 = 1 นิ้ว); ถ้าไม่ระบุ หน้าจะพอดีภาพ
 */
export function buildImagePDF(jpeg, width, height, opts = {}) {
  const { title = 'LinkMap', margin = 24 } = opts;
  const scale = opts.pageWidth ? Math.min((opts.pageWidth - margin * 2) / width, (opts.pageHeight - margin * 2) / height) : 0.75;
  const pw = opts.pageWidth || width * scale + margin * 2;
  const ph = opts.pageHeight || height * scale + margin * 2;
  const iw = width * scale, ih = height * scale;
  const ix = (pw - iw) / 2, iy = (ph - ih) / 2;
  const content = `q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${ix.toFixed(2)} ${iy.toFixed(2)} cm /Im0 Do Q`;
  const titleHex = [...enc.encode(title)].map(b => b.toString(16).padStart(2, '0')).join('');
  const objects = [
    enc.encode('<< /Type /Catalog /Pages 2 0 R >>'),
    enc.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`),
    concat([enc.encode(`<< /Length ${content.length} >>\nstream\n`), enc.encode(content), enc.encode('\nendstream')]),
    concat([enc.encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, enc.encode('\nendstream')]),
    enc.encode(`<< /Title <${titleHex}> /Producer (LinkMap) >>`),
  ];
  const parts = [enc.encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  const offsets = [];
  let pos = parts[0].length;
  objects.forEach((body, i) => {
    offsets.push(pos);
    const head = enc.encode(`${i + 1} 0 obj\n`), tail = enc.encode('\nendobj\n');
    parts.push(head, body, tail);
    pos += head.length + body.length + tail.length;
  });
  const xrefPos = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  parts.push(enc.encode(xref));
  return concat(parts);
}

/** ขนาดหน้ามาตรฐาน (point) */
export const PAGE_SIZES = {
  fit: null,
  a4: { w: 595.28, h: 841.89 },
  a4landscape: { w: 841.89, h: 595.28 },
  a3landscape: { w: 1190.55, h: 841.89 },
};
