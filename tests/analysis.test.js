import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  degreeCentrality, betweennessCentrality, closenessCentrality, connectedComponents,
  louvainCommunities, labelPropagation, modularity, shortestPath, neighborhood, normalizeScores,
} from '../src/analysis.js';
import { Graph } from '../src/graph.js';
import { sampleGraph } from '../src/sample.js';

function pathGraph(n) {
  const g = new Graph();
  for (let i = 0; i < n; i++) g.addNode({ id: 'n' + i, label: 'n' + i });
  for (let i = 0; i < n - 1; i++) g.addLink({ from: 'n' + i, to: 'n' + (i + 1) });
  return g;
}

function twoCliques() {
  const g = new Graph();
  const a = ['a1', 'a2', 'a3', 'a4'], b = ['b1', 'b2', 'b3', 'b4'];
  for (const id of [...a, ...b]) g.addNode({ id, label: id });
  for (const grp of [a, b]) for (let i = 0; i < grp.length; i++) for (let j = i + 1; j < grp.length; j++) g.addLink({ from: grp[i], to: grp[j] });
  g.addLink({ from: 'a1', to: 'b1' }); // สะพาน
  return g;
}

test('degree centrality', () => {
  const adj = pathGraph(3).adjacency();
  const d = degreeCentrality(adj);
  assert.equal(d.get('n0'), 1);
  assert.equal(d.get('n1'), 2);
});

test('betweenness: โหนดกลางของเส้นตรงมีค่าสูงสุด ปลายเป็น 0', () => {
  const adj = pathGraph(5).adjacency();
  const b = betweennessCentrality(adj);
  assert.equal(b.get('n0'), 0);
  assert.equal(b.get('n4'), 0);
  assert.ok(b.get('n2') > b.get('n1'));
  // path 5 โหนด: n2 อยู่บนทุกเส้นทางที่ข้ามกลาง = 4 คู่ จาก 6 คู่ → normalize ด้วย (n-1)(n-2)=12 → 4*2/12
  assert.ok(Math.abs(b.get('n2') - 4 * 2 / 12) < 1e-9);
});

test('betweenness: สะพานระหว่างสองกลุ่มสูงสุด', () => {
  const adj = twoCliques().adjacency();
  const b = betweennessCentrality(adj);
  assert.ok(b.get('a1') > b.get('a2'));
  assert.ok(b.get('b1') > b.get('b3'));
});

test('closeness: โหนดกลางใกล้ที่สุด', () => {
  const adj = pathGraph(5).adjacency();
  const c = closenessCentrality(adj);
  assert.ok(c.get('n2') > c.get('n0'));
  assert.ok(c.get('n2') <= 1 && c.get('n2') > 0);
});

test('connected components', () => {
  const g = pathGraph(3);
  g.addNode({ id: 'x', label: 'x' }); g.addNode({ id: 'y', label: 'y' });
  g.addLink({ from: 'x', to: 'y' });
  g.addNode({ id: 'z', label: 'z' });
  const { membership, groups } = connectedComponents(g.adjacency());
  assert.equal(groups.length, 3);
  assert.equal(groups[0].length, 3, 'เรียงจากใหญ่ไปเล็ก');
  assert.equal(membership.get('n0'), membership.get('n2'));
  assert.notEqual(membership.get('n0'), membership.get('x'));
});

test('Louvain แยกสองกลุ่มที่เชื่อมด้วยสะพาน', () => {
  const adj = twoCliques().adjacency();
  const { membership, groups } = louvainCommunities(adj);
  assert.equal(groups.length, 2);
  assert.equal(membership.get('a1'), membership.get('a4'));
  assert.equal(membership.get('b1'), membership.get('b4'));
  assert.notEqual(membership.get('a1'), membership.get('b1'));
  assert.ok(modularity(adj, membership) > 0.3);
});

test('Louvain บนตัวอย่าง: ทุกโหนดได้ชุมชน และ modularity > 0', () => {
  const adj = sampleGraph().adjacency();
  const { membership } = louvainCommunities(adj);
  assert.equal(membership.size, adj.size);
  assert.ok(modularity(adj, membership) > 0.2);
});

test('label propagation แยกสองกลุ่ม', () => {
  const adj = twoCliques().adjacency();
  const { membership } = labelPropagation(adj);
  assert.equal(membership.get('a1'), membership.get('a3'));
  assert.notEqual(membership.get('a1'), membership.get('b2'));
});

test('เส้นทางสั้นสุด', () => {
  const adj = pathGraph(5).adjacency();
  const r = shortestPath(adj, 'n0', 'n4');
  assert.deepEqual(r.path, ['n0', 'n1', 'n2', 'n3', 'n4']);
  assert.equal(r.length, 4);
  const g = pathGraph(2); g.addNode({ id: 'z', label: 'z' });
  assert.equal(shortestPath(g.adjacency(), 'n0', 'z'), null, 'ไม่เชื่อมกัน');
  assert.equal(shortestPath(adj, 'n0', 'ไม่มี'), null);
});

test('เส้นทางสั้นสุดแบบถ่วงน้ำหนัก เลือกเส้นหนักกว่า', () => {
  const g = new Graph();
  for (const id of ['a', 'b', 'c']) g.addNode({ id, label: id });
  g.addLink({ from: 'a', to: 'c', weight: 1 });
  g.addLink({ from: 'a', to: 'b', weight: 10 });
  g.addLink({ from: 'b', to: 'c', weight: 10 });
  assert.deepEqual(shortestPath(g.adjacency(), 'a', 'c').path, ['a', 'c']);
  assert.deepEqual(shortestPath(g.adjacency(), 'a', 'c', { weighted: true }).path, ['a', 'b', 'c']);
});

test('neighborhood ขยายเพื่อนบ้าน', () => {
  const adj = pathGraph(5).adjacency();
  assert.deepEqual([...neighborhood(adj, ['n2'], 1)].sort(), ['n1', 'n2', 'n3']);
  assert.equal(neighborhood(adj, ['n2'], 2).size, 5);
});

test('normalizeScores → 0..1 โดยยึดศูนย์ไว้ (ค่าบวกไม่กลายเป็น 0)', () => {
  const s = normalizeScores(new Map([['a', 0], ['b', 6], ['c', 3]]));
  assert.equal(s.get('a'), 0); assert.equal(s.get('b'), 1); assert.equal(s.get('c'), 0.5);
  assert.ok(normalizeScores(new Map([['a', 2], ['b', 6]])).get('a') > 0);
});
