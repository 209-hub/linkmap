import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Graph, History } from '../src/graph.js';
import { sampleGraph } from '../src/sample.js';

test('เพิ่ม/ลบโหนดและเส้น', () => {
  const g = new Graph();
  const a = g.addNode({ label: 'ก', type: 'person' });
  const b = g.addNode({ label: 'ข', type: 'org' });
  const l = g.addLink({ from: a.id, to: b.id, label: 'ทำงานที่' });
  assert.equal(g.size.nodes, 2);
  assert.equal(g.size.links, 1);
  assert.deepEqual([...g.neighbors(a.id)], [b.id]);
  assert.equal(g.degree(b.id), 1);
  g.removeNode(a.id);
  assert.equal(g.size.links, 0, 'ลบโหนดต้องลบเส้นที่ติดอยู่ด้วย');
  assert.equal(g.getLink(l.id), undefined);
});

test('เส้นต้องอ้างถึงโหนดที่มีอยู่', () => {
  const g = new Graph();
  const a = g.addNode({ label: 'ก' });
  assert.throws(() => g.addLink({ from: a.id, to: 'ไม่มี' }));
});

test('toJSON/fromJSON ไปกลับได้ครบ', () => {
  const g = sampleGraph();
  const json = JSON.parse(JSON.stringify(g.toJSON()));
  const g2 = Graph.fromJSON(json);
  assert.equal(g2.size.nodes, g.size.nodes);
  assert.equal(g2.size.links, g.size.links);
  assert.equal(g2.getNode('p1').attrs['บทบาท'], 'หัวหน้ากลุ่ม');
  assert.equal(g2.meta.title, g.meta.title);
});

test('fromJSON ปฏิเสธรูปแบบผิด', () => {
  assert.throws(() => Graph.fromJSON({ foo: 1 }));
  assert.throws(() => Graph.fromJSON(null));
});

test('adjacency ไม่รวมโน้ต/กรอบ และรวมน้ำหนักเส้นซ้ำ', () => {
  const g = sampleGraph();
  const adj = g.adjacency();
  assert.ok(!adj.has('note1'));
  // p1→p3 มี 2 เส้น (2+1) และ p3→p1 อีก 1 เส้น
  assert.equal(adj.get('p1').get('p3'), 4);
  assert.equal(adj.get('p3').get('p1'), 4);
});

test('findNodeByLabel ไม่สนตัวพิมพ์/ช่องว่าง', () => {
  const g = new Graph();
  g.addNode({ label: 'Somchai ' });
  assert.ok(g.findNodeByLabel('somchai'));
  assert.equal(g.findNodeByLabel('ไม่มี'), null);
});

test('undo/redo แบบ snapshot', () => {
  let g = new Graph();
  const h = new History();
  h.push(g);
  g.addNode({ id: 'x', label: 'x' });
  assert.equal(g.size.nodes, 1);
  g = h.undo(g);
  assert.equal(g.size.nodes, 0);
  g = h.redo(g);
  assert.equal(g.size.nodes, 1);
  assert.equal(h.canRedo(), false);
});
