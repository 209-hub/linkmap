import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOutline, importOutline, toOutline } from '../src/outline.js';
import { Graph } from '../src/graph.js';
import { sampleGraph } from '../src/sample.js';

test('parseOutline: #, -, เยื้อง, โน้ต >', () => {
  const items = parseOutline('# วิชา A\n- บทที่ 1\n  - หัวข้อ 1.1\n  > จำให้ดี\n  - หัวข้อ 1.2\n- บทที่ 2\n');
  assert.deepEqual(items.map(i => [i.label, i.depth]), [['วิชา A', 0], ['บทที่ 1', 1], ['หัวข้อ 1.1', 2], ['หัวข้อ 1.2', 2], ['บทที่ 2', 1]]);
  assert.equal(items[2].notes, 'จำให้ดี');
});

test('parseOutline: ไม่มี # และใช้แท็บ/ตัวเลข', () => {
  const items = parseOutline('ราก\n\t1. ลูก\n\t\t* หลาน\n');
  assert.deepEqual(items.map(i => [i.label, i.depth]), [['ราก', 0], ['ลูก', 1], ['หลาน', 2]]);
});

test('importOutline สร้างต้นไม้ถูกโครง และต่อใต้หัวข้อที่เลือกได้', () => {
  const g = new Graph();
  const ids = importOutline(g, '# A\n- B\n  - C\n- D\n');
  assert.equal(ids.length, 4);
  const [a, b, c, d] = ids;
  const parents = (id) => [...g.links.values()].filter(l => l.to === id).map(l => l.from);
  assert.deepEqual(parents(b), [a]); assert.deepEqual(parents(c), [b]); assert.deepEqual(parents(d), [a]);
  const more = importOutline(g, '- E\n  - F\n', { parentId: d });
  assert.deepEqual(parents(more[0]), [d]);
  assert.equal(g.getNode(more[0]).type, 'topic');
});

test('toOutline แล้ว importOutline กลับได้โครงเดิม', () => {
  const g = sampleGraph();
  const md = toOutline(g);
  assert.ok(md.startsWith('# การตลาดดิจิทัล'));
  const g2 = new Graph();
  importOutline(g2, md);
  assert.equal(g2.size.nodes, g.entityNodes().length);
  assert.equal(toOutline(g2), md);
});

test('เครื่องหมายเน้น (mark) ไปกลับได้', () => {
  const g = new Graph();
  importOutline(g, '# ราก\n- ⭐ สำคัญ\n');
  const n = [...g.nodes.values()][1];
  assert.equal(n.mark, '⭐'); assert.equal(n.label, 'สำคัญ');
  assert.ok(toOutline(g).includes('- ⭐ สำคัญ'));
});
