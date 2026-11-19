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
  assert.equal(g2.getNode('t1').label, g.getNode('t1').label);
  assert.equal(g2.getNode('t1').type, 'topic');
  assert.equal(g2.meta.title, g.meta.title);
});

test('fromJSON ปฏิเสธรูปแบบผิด', () => {
  assert.throws(() => Graph.fromJSON({ foo: 1 }));
  assert.throws(() => Graph.fromJSON(null));
});

test('adjacency ไม่รวมโน้ต/กรอบ และรวมน้ำหนักเส้นซ้ำ', () => {
  const g = sampleGraph();
  g.addLink({ from: 't1', to: 't2', weight: 2 });
  g.addLink({ from: 't2', to: 't1', weight: 1 });
  const adj = g.adjacency();
  assert.ok(!adj.has('note1'));
  // t1→t2 มีอยู่แล้ว (1) + 2 + สวนทาง 1 = 4
  assert.equal(adj.get('t1').get('t2'), 4);
  assert.equal(adj.get('t2').get('t1'), 4);
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

test('ลายมือ (strokes): เพิ่ม/ลบ และบันทึก-โหลดกลับได้ ย้อนกลับได้', () => {
  let g = new Graph();
  const h = new History();
  h.push(g);
  const s = g.addStroke({ color: '#dc2626', width: 4, points: [[0, 0], [10.26, 5.04], [20, 0]] });
  assert.equal(g.strokes.length, 1);
  assert.deepEqual(s.points[1], [10.3, 5]);
  const g2 = Graph.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
  assert.equal(g2.strokes.length, 1);
  assert.equal(g2.strokes[0].color, '#dc2626');
  assert.ok(g2.removeStroke(s.id));
  assert.equal(g2.strokes.length, 0);
  g = h.undo(g);
  assert.equal(g.strokes.length, 0, 'undo กลับไปก่อนขีด');
});
