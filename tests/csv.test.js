import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, detectDelimiter, detectKind, importCSV, normalizeType, exportLinksCSV, exportNodesCSV } from '../src/csv.js';
import { Graph } from '../src/graph.js';

test('parseCSV: เครื่องหมายคำพูด, CRLF, BOM', () => {
  const rows = parseCSV('﻿a,b,c\r\n1,"x, y","he said ""hi"""\r\n\r\n2,,3\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'x, y', 'he said "hi"'], ['2', '', '3']]);
});

test('detectDelimiter: แท็บ/เซมิโคลอน', () => {
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3'), '\t');
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(detectDelimiter('a,b\n1,2'), ',');
});

test('detectKind', () => {
  assert.equal(detectKind(['from', 'to', 'label']), 'links');
  assert.equal(detectKind(['ชื่อ', 'ประเภท']), 'nodes');
  assert.equal(detectKind(['foo', 'bar']), 'unknown');
});

test('normalizeType ไทย/อังกฤษ', () => {
  assert.equal(normalizeType('บุคคล'), 'person');
  assert.equal(normalizeType('Company'), 'org');
  assert.equal(normalizeType('เบอร์โทร'), 'phone');
  assert.equal(normalizeType('อะไรก็ไม่รู้'), 'generic');
});

test('นำเข้ารายการโหนด (หัวตารางไทย + คอลัมน์เพิ่มเป็นแอตทริบิวต์)', () => {
  const g = new Graph();
  const csv = 'ชื่อ,ประเภท,วันที่,อายุ\nสมชาย,บุคคล,2025-01-01,45\nบจก.เอ,องค์กร,,\n';
  const r = importCSV(g, csv);
  assert.equal(r.kind, 'nodes');
  assert.equal(r.nodesAdded, 2);
  const n = g.findNodeByLabel('สมชาย');
  assert.equal(n.type, 'person');
  assert.equal(n.date, '2025-01-01');
  assert.equal(n.attrs['อายุ'], '45');
  // นำเข้าซ้ำ → อัปเดต ไม่เพิ่ม
  const r2 = importCSV(g, 'ชื่อ,ประเภท,อาชีพ\nสมชาย,บุคคล,ค้าขาย\n');
  assert.equal(r2.nodesAdded, 0); assert.equal(r2.nodesUpdated, 1);
  assert.equal(g.findNodeByLabel('สมชาย').attrs['อาชีพ'], 'ค้าขาย');
  assert.equal(g.findNodeByLabel('สมชาย').attrs['อายุ'], '45', 'แอตทริบิวต์เดิมต้องอยู่');
});

test('นำเข้ารายการเส้น from,to,label สร้างโหนดอัตโนมัติ', () => {
  const g = new Graph();
  g.addNode({ label: 'สมชาย', type: 'person' });
  const csv = 'from,to,label,weight,from_type,to_type,date\nสมชาย,บจก.เอ,กรรมการ,3,บุคคล,องค์กร,2024-01-01\nบจก.เอ,ท่าเรือ,ตั้งอยู่,,,สถานที่,\n';
  const r = importCSV(g, csv);
  assert.equal(r.kind, 'links');
  assert.equal(r.linksAdded, 2);
  assert.equal(r.nodesAdded, 2, 'สร้างเฉพาะโหนดที่ยังไม่มี');
  assert.equal(g.size.nodes, 3);
  assert.equal(g.findNodeByLabel('บจก.เอ').type, 'org');
  assert.equal(g.findNodeByLabel('ท่าเรือ').type, 'place');
  const l = [...g.links.values()][0];
  assert.equal(l.label, 'กรรมการ'); assert.equal(l.weight, 3); assert.equal(l.date, '2024-01-01');
});

test('ตารางความสัมพันธ์แถวละ 1 ความสัมพันธ์ (หัวตารางไทย) + directed=ไม่', () => {
  const g = new Graph();
  const csv = 'ต้นทาง;ปลายทาง;ความสัมพันธ์;ทิศทาง\nก;ข;คู่สมรส;ไม่\nก;ค;โทรหา;ใช่\n';
  const r = importCSV(g, csv);
  assert.equal(r.linksAdded, 2);
  const links = [...g.links.values()];
  assert.equal(links[0].directed, false);
  assert.equal(links[1].directed, true);
});

test('CSV ไม่รู้จัก → warning ไม่พัง', () => {
  const g = new Graph();
  const r = importCSV(g, 'foo,bar\n1,2\n');
  assert.equal(r.kind, 'unknown');
  assert.ok(r.warnings.length);
  assert.equal(g.size.nodes, 0);
});

test('ส่งออก CSV แล้วนำเข้ากลับได้', () => {
  const g = new Graph();
  const a = g.addNode({ label: 'ก, ข', type: 'person', attrs: { x1: 'v' } });
  const b = g.addNode({ label: 'บจก.', type: 'org' });
  g.addLink({ from: a.id, to: b.id, label: 'กรรมการ "ใหญ่"', weight: 2 });
  const nodesCsv = exportNodesCSV(g), linksCsv = exportLinksCSV(g);
  const g2 = new Graph();
  const r1 = importCSV(g2, nodesCsv);
  const r2 = importCSV(g2, linksCsv);
  assert.equal(r1.nodesAdded, 2);
  assert.equal(r2.linksAdded, 1); assert.equal(r2.nodesAdded, 0);
  const l = [...g2.links.values()][0];
  assert.equal(l.label, 'กรรมการ "ใหญ่"'); assert.equal(l.weight, 2);
  assert.equal(g2.findNodeByLabel('ก, ข').attrs.x1, 'v');
});
