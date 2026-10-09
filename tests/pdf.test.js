import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildImagePDF, PAGE_SIZES } from '../src/pdf.js';

const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);
const dec = new TextDecoder('latin1');

test('buildImagePDF: โครงสร้าง PDF ถูกต้อง (header, objects, xref, trailer)', () => {
  const pdf = buildImagePDF(fakeJpeg, 400, 300, { title: 'ทดสอบ' });
  const s = dec.decode(pdf);
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.includes('/Type /Catalog'));
  assert.ok(s.includes('/Width 400 /Height 300'));
  assert.ok(s.includes('/Filter /DCTDecode'));
  assert.ok(s.includes('/Im0 Do'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  // ตำแหน่งใน xref ต้องชี้ไปที่ "N 0 obj" จริง
  const xrefPos = Number(s.match(/startxref\n(\d+)/)[1]);
  assert.equal(s.slice(xrefPos, xrefPos + 4), 'xref');
  const offsets = [...s.slice(xrefPos).matchAll(/(\d{10}) 00000 n/g)].map(m => Number(m[1]));
  assert.equal(offsets.length, 6);
  offsets.forEach((o, i) => assert.equal(s.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
  // ไบต์ JPEG ต้องอยู่ครบในไฟล์
  const idx = s.indexOf(dec.decode(fakeJpeg));
  assert.ok(idx > 0);
});

test('buildImagePDF: หน้า A4 แนวนอนย่อภาพให้พอดี', () => {
  const pdf = buildImagePDF(fakeJpeg, 4000, 1000, { pageWidth: PAGE_SIZES.a4landscape.w, pageHeight: PAGE_SIZES.a4landscape.h });
  const s = dec.decode(pdf);
  assert.ok(s.includes('/MediaBox [0 0 841.89 595.28]'));
  const m = s.match(/q ([\d.]+) 0 0 ([\d.]+) /);
  assert.ok(Number(m[1]) <= 841.89 - 48 && Number(m[2]) <= 595.28 - 48);
});
