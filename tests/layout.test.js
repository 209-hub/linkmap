import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mindmapLayout, buildTree, forceLayout, hierarchicalLayout, circularLayout, groupedLayout, timelineLayout, parseDate, runLayout, LAYOUTS } from '../src/layout.js';
import { sampleGraph } from '../src/sample.js';

function data() {
  const g = sampleGraph();
  return { nodes: g.entityNodes(), links: [...g.links.values()] };
}

function allFinite(pos, nodes) {
  assert.equal(pos.size, nodes.length, 'ต้องมีตำแหน่งครบทุกโหนด');
  for (const n of nodes) {
    const p = pos.get(n.id);
    assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y), `ตำแหน่ง ${n.id} ต้องเป็นตัวเลข`);
  }
}

function minPairDistance(pos) {
  const pts = [...pos.values()];
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  }
  return min;
}

test('ทุกเลย์เอาต์ให้ตำแหน่งครบและเป็นตัวเลข', () => {
  const { nodes, links } = data();
  for (const name of Object.keys(LAYOUTS)) {
    const pos = runLayout(name, nodes, links);
    allFinite(pos, nodes);
  }
});

test('ทุกเลย์เอาต์รับรายการว่างและโหนดเดียวได้', () => {
  for (const name of Object.keys(LAYOUTS)) {
    assert.equal(runLayout(name, [], []).size, 0);
    const pos = runLayout(name, [{ id: 'a', x: 5, y: 5, type: 'person' }], []);
    assert.equal(pos.size, 1);
    assert.ok(Number.isFinite(pos.get('a').x));
  }
});

test('force: ซ้ำได้ด้วย seed เดิม และกระจายโหนดไม่ทับกัน', () => {
  const { nodes, links } = data();
  const a = forceLayout(nodes, links, { seed: 1, randomizeZero: true });
  const b = forceLayout(nodes, links, { seed: 1, randomizeZero: true });
  assert.deepEqual([...a], [...b]);
  assert.ok(minPairDistance(a) > 30, `ระยะใกล้สุด ${minPairDistance(a)} ควร > 30`);
});

test('force: โหนดที่เชื่อมกันอยู่ใกล้กว่าค่าเฉลี่ยของคู่สุ่ม', () => {
  const { nodes, links } = data();
  const pos = forceLayout(nodes, links, { seed: 3, randomizeZero: true });
  const d = (a, b) => Math.hypot(pos.get(a).x - pos.get(b).x, pos.get(a).y - pos.get(b).y);
  const linked = links.filter(l => l.from !== l.to && pos.has(l.from) && pos.has(l.to));
  const avgLinked = linked.reduce((s, l) => s + d(l.from, l.to), 0) / linked.length;
  let sum = 0, cnt = 0;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { sum += d(nodes[i].id, nodes[j].id); cnt++; }
  assert.ok(avgLinked < sum / cnt, `เชื่อมกัน ${avgLinked.toFixed(0)} ควรน้อยกว่าเฉลี่ย ${(sum / cnt).toFixed(0)}`);
});

test('hierarchical: ต้นทางอยู่ชั้นบนกว่าปลายทาง (DAG)', () => {
  const nodes = ['a', 'b', 'c', 'd'].map(id => ({ id, x: 0, y: 0 }));
  const links = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'a', to: 'd' }, { from: 'd', to: 'c' }];
  const pos = hierarchicalLayout(nodes, links);
  assert.ok(pos.get('a').y < pos.get('b').y);
  assert.ok(pos.get('b').y < pos.get('c').y);
  assert.ok(pos.get('d').y < pos.get('c').y);
  assert.ok(Math.abs(pos.get('b').y - pos.get('d').y) < 1, 'b และ d ชั้นเดียวกัน');
  const lr = hierarchicalLayout(nodes, links, { direction: 'LR' });
  assert.ok(lr.get('a').x < lr.get('c').x);
});

test('hierarchical: รับวงจรได้ไม่ค้าง', () => {
  const nodes = ['a', 'b', 'c'].map(id => ({ id, x: 0, y: 0 }));
  const links = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }];
  const pos = hierarchicalLayout(nodes, links);
  allFinite(pos, nodes);
  const ys = new Set([...pos.values()].map(p => Math.round(p.y)));
  assert.equal(ys.size, 3, 'ควรแยกเป็น 3 ชั้น');
});

test('circular: ทุกโหนดห่างจุดศูนย์กลางเท่ากัน', () => {
  const { nodes, links } = data();
  const pos = circularLayout(nodes, links);
  const pts = [...pos.values()];
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const rs = pts.map(p => Math.hypot(p.x - cx, p.y - cy));
  assert.ok(Math.max(...rs) - Math.min(...rs) < 3);
});

test('grouped: โหนดประเภทเดียวกันอยู่ใกล้กันมากกว่าต่างประเภท', () => {
  const { nodes, links } = data();
  const pos = groupedLayout(nodes, links, { keyFn: n => n.type });
  const centroid = {};
  for (const n of nodes) { (centroid[n.type] ||= []).push(pos.get(n.id)); }
  const cents = Object.fromEntries(Object.entries(centroid).map(([t, ps]) => [t, { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length }]));
  for (const n of nodes) {
    const own = Math.hypot(pos.get(n.id).x - cents[n.type].x, pos.get(n.id).y - cents[n.type].y);
    for (const [t, c] of Object.entries(cents)) if (t !== n.type) {
      assert.ok(own < Math.hypot(pos.get(n.id).x - c.x, pos.get(n.id).y - c.y), `${n.id} ใกล้กลุ่มตัวเองกว่า ${t}`);
    }
  }
});

test('timeline: เรียงซ้าย→ขวาตามเวลา โหนดไม่มีวันที่อยู่ขวาสุด', () => {
  const nodes = [
    { id: 'e1', type: 'event', date: '2025-03-01', x: 0, y: 0 },
    { id: 'e2', type: 'event', date: '2025-01-01', x: 0, y: 0 },
    { id: 'e3', type: 'event', date: '15/02/2568', x: 0, y: 0 }, // พ.ศ.
    { id: 'p', type: 'person', date: '', x: 0, y: 0 },
  ];
  const pos = timelineLayout(nodes, []);
  assert.ok(pos.get('e2').x < pos.get('e3').x);
  assert.ok(pos.get('e3').x < pos.get('e1').x);
  assert.ok(pos.get('p').x > pos.get('e1').x);
  assert.notEqual(pos.get('p').y, pos.get('e1').y, 'คนละเลนตามประเภท');
});

test('parseDate รองรับ ISO, วัน/เดือน/ปี และ พ.ศ.', () => {
  assert.equal(new Date(parseDate('2025-02-10')).getMonth(), 1);
  const t = parseDate('10/02/2568');
  assert.equal(new Date(t).getFullYear(), 2025);
  assert.equal(new Date(parseDate('1/3/25')).getFullYear(), 2025);
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('ไม่ใช่วันที่'), null);
});

test('เลย์เอาต์คงจุดศูนย์กลางเดิมไว้ (ไม่กระโดด)', () => {
  const nodes = [{ id: 'a', x: 1000, y: 1000 }, { id: 'b', x: 1200, y: 1000 }, { id: 'c', x: 1100, y: 1200 }];
  const pos = circularLayout(nodes, [{ from: 'a', to: 'b' }]);
  const pts = [...pos.values()];
  const cx = (Math.min(...pts.map(p => p.x)) + Math.max(...pts.map(p => p.x))) / 2;
  assert.ok(Math.abs(cx - 1100) < 2, `ศูนย์กลาง x=${cx}`);
});

test('mindmap: รากอยู่กลาง ลูกแบ่งซ้าย/ขวา หลานอยู่ถัดออกไปด้านเดียวกับพ่อ', () => {
  const nodes = ['root', 'a', 'b', 'c', 'a1', 'a2', 'b1'].map(id => ({ id, x: 0, y: 0, label: id }));
  const links = [['root', 'a'], ['root', 'b'], ['root', 'c'], ['a', 'a1'], ['a', 'a2'], ['b', 'b1']].map(([from, to]) => ({ from, to }));
  const pos = mindmapLayout(nodes, links, { rootId: 'root' });
  const r = pos.get('root');
  const sides = ['a', 'b', 'c'].map(id => Math.sign(pos.get(id).x - r.x));
  assert.ok(sides.includes(1) && sides.includes(-1), 'ต้องมีทั้งซ้ายและขวา');
  const sa = Math.sign(pos.get('a').x - r.x);
  assert.equal(Math.sign(pos.get('a1').x - r.x), sa);
  assert.ok(Math.abs(pos.get('a1').x - r.x) > Math.abs(pos.get('a').x - r.x), 'หลานไกลกว่าลูก');
  assert.notEqual(pos.get('a1').y, pos.get('a2').y, 'พี่น้องไม่ทับกัน');
});

test('buildTree: เลือกรากอัตโนมัติ (ไม่มีเส้นเข้า) และรองรับหลายต้น', () => {
  const nodes = ['r', 'x', 'y', 'q'].map(id => ({ id, x: 0, y: 0 }));
  const links = [{ from: 'r', to: 'x' }, { from: 'x', to: 'y' }];
  const t = buildTree(nodes, links);
  assert.equal(t.roots[0], 'r');
  assert.deepEqual(t.children.get('r'), ['x']);
  assert.ok(t.roots.includes('q'));
  const pos = mindmapLayout(nodes, links);
  assert.equal(pos.size, 4);
});
