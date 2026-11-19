import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniThumb } from '../src/thumb.js';
import { sampleGraph } from '../src/sample.js';

test('miniThumb: ผังว่างได้ SVG พร้อมข้อความ', () => {
  const svg = miniThumb({ nodes: [], links: [] });
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>') && svg.includes('ผังว่าง'));
});

test('miniThumb: วาดโหนด/เส้นอยู่ในกรอบ และไม่ฝังข้อความ/รูปของผู้ใช้', () => {
  const g = sampleGraph();
  let i = 0;
  for (const n of g.nodes.values()) { n.x = (i % 6) * 200; n.y = Math.floor(i / 6) * 120; i++; }
  const doc = g.toJSON();
  doc.nodes[0].image = 'data:image/png;base64,AAAA';
  doc.strokes = [{ id: 's', color: '#dc2626', width: 3, points: [[0, 0], [50, 40], [100, 0]] }];
  const svg = miniThumb(doc, { width: 240, height: 140 });
  assert.ok(!svg.includes('data:image') && !svg.includes('การตลาด'));
  const xs = [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)"/g)].map(m => [Number(m[1]), Number(m[2])]);
  assert.ok(xs.length >= 20);
  for (const [x, y] of xs) assert.ok(x >= 0 && x <= 240 && y >= 0 && y <= 140, `อยู่ในกรอบ ${x},${y}`);
  assert.ok(svg.includes('<polyline') && svg.includes('<line'));
});

test('miniThumb: สีที่ไม่ปลอดภัยถูกแทนด้วยค่าเริ่มต้น (กันโค้ดแฝง)', () => {
  const svg = miniThumb({ nodes: [{ id: 'a', x: 0, y: 0, type: 'topic', color: '"/><script>alert(1)</script>' }], links: [] });
  assert.ok(!svg.includes('script'));
  assert.ok(svg.includes('#64748b'));
});
