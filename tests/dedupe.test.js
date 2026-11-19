import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normLabel, findDuplicates, mergeNodes, linkDuplicates } from '../src/dedupe.js';
import { Graph } from '../src/graph.js';

function sample() {
  const g = new Graph();
  for (const [id, label] of [['r', 'ราก'], ['a', 'การวางแผน'], ['b', 'การประเมิน'], ['a2', ' การวางแผน '], ['a3', 'การวางแผน:'], ['x', 'ลูกของ a2'], ['n', 'การวางแผน']]) g.addNode({ id, label, type: id === 'n' ? 'note' : 'topic' });
  g.addLink({ from: 'r', to: 'a' }); g.addLink({ from: 'r', to: 'b' }); g.addLink({ from: 'b', to: 'a2' }); g.addLink({ from: 'a2', to: 'x' }); g.addLink({ from: 'b', to: 'a3' });
  return g;
}

test('normLabel: ช่องว่าง ตัวพิมพ์ วรรคตอนท้าย', () => {
  assert.equal(normLabel('  Plan  A: '), 'plan a');
  assert.equal(normLabel('การวางแผน'), normLabel(' การวางแผน.'));
});

test('findDuplicates: หากลุ่มชื่อซ้ำ ไม่นับโน้ต', () => {
  const d = findDuplicates(sample());
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].ids, ['a', 'a2', 'a3']);
});

test('mergeNodes: ย้ายเส้นมาที่ตัวหลัก ไม่มีเส้นซ้ำ/วนตัวเอง', () => {
  const g = sample();
  g.updateNode('a2', { notes: 'โน้ตจาก a2' });
  const merged = mergeNodes(g, 'a', ['a2', 'a3']);
  assert.equal(merged, 2);
  assert.ok(!g.getNode('a2') && !g.getNode('a3'));
  assert.equal(g.getNode('a').notes, 'โน้ตจาก a2');
  assert.equal(g.linksBetween('a', 'x').length, 1, 'ลูกของ a2 ย้ายมาอยู่กับ a');
  assert.equal(g.linksBetween('a', 'b').length, 1, 'เส้น b→a2 และ b→a3 รวมเหลือเส้นเดียว');
  assert.equal(g.linksBetween('r', 'a').length, 1);
  assert.ok([...g.links.values()].every(l => l.from !== l.to));
  assert.equal(findDuplicates(g).length, 0);
});

test('linkDuplicates: เชื่อมเป็นสาย ไม่เพิ่มซ้ำ', () => {
  const g = sample();
  assert.equal(linkDuplicates(g, ['a', 'a2', 'a3']), 2);
  assert.equal(linkDuplicates(g, ['a', 'a2', 'a3']), 0);
  assert.equal(g.linksBetween('a', 'a2')[0].label, 'คำเดียวกัน');
});
