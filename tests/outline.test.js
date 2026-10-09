import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOutline, importOutline, toOutline, extractJSON, normalizeTree, importTree } from '../src/outline.js';
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

test('extractJSON: ดึง JSON จากบล็อกโค้ดและข้อความปน', () => {
  const fenced = ['นี่คือผล:', '```json', '{"a":1}', '```', 'จบ'].join(String.fromCharCode(10));
  assert.deepEqual(extractJSON(fenced), { a: 1 });
  assert.deepEqual(extractJSON('ผลลัพธ์ {"a":[1,2]} ครับ'), { a: [1, 2] });
  assert.equal(extractJSON('ไม่มีอะไร'), null);
});

test('normalizeTree รองรับหลายรูปแบบที่เอไอชอบตอบ', () => {
  const a = normalizeTree({ title: 'วิชา', root: { text: 'ราก', children: [{ text: 'ก', notes: 'n', children: [] }] } });
  assert.equal(a.text, 'ราก'); assert.equal(a.children[0].notes, 'n');
  const b = normalizeTree({ name: 'ราก', subtopics: ['x', { label: 'y', items: ['z'] }] });
  assert.deepEqual(b.children.map(c => c.text), ['x', 'y']); assert.equal(b.children[1].children[0].text, 'z');
  const c = normalizeTree({ 'บทที่ 1': ['ก', 'ข'] });
  assert.equal(c.text, 'บทที่ 1'); assert.equal(c.children.length, 2);
});

test('importTree สร้างมายแมปจาก JSON และต่อใต้หัวข้อที่เลือกได้', () => {
  const g = new Graph();
  const ids = importTree(g, { root: { text: 'ราก', children: [{ text: 'ก', children: [{ text: 'ก1' }] }, { text: 'ข' }] } });
  assert.equal(ids.length, 4);
  assert.equal(g.size.links, 3);
  const parents = (id) => [...g.links.values()].filter(l => l.to === id).map(l => l.from);
  assert.deepEqual(parents(ids[2]), [ids[1]]);
  const more = importTree(g, { text: 'ค', children: [] }, { parentId: ids[3] });
  assert.deepEqual(parents(more[0]), [ids[3]]);
});
