// การวิเคราะห์เครือข่าย: centrality, คอมโพเนนต์, ชุมชน (Louvain), เส้นทางสั้นสุด
// ทุกฟังก์ชันรับ adj = Map<id, Map<neighborId, weight>> (ไม่มีทิศทาง) จาก graph.adjacency()

export function degreeCentrality(adj) {
  const out = new Map();
  for (const [id, nb] of adj) out.set(id, nb.size);
  return out;
}

export function weightedDegree(adj) {
  const out = new Map();
  for (const [id, nb] of adj) {
    let s = 0; for (const w of nb.values()) s += w;
    out.set(id, s);
  }
  return out;
}

/** Betweenness ของ Brandes (ไม่ถ่วงน้ำหนัก) normalize เป็น 0..1 */
export function betweennessCentrality(adj, { normalized = true } = {}) {
  const ids = [...adj.keys()];
  const cb = new Map(ids.map(id => [id, 0]));
  for (const s of ids) {
    const stack = [];
    const pred = new Map(ids.map(id => [id, []]));
    const sigma = new Map(ids.map(id => [id, 0])); sigma.set(s, 1);
    const dist = new Map(ids.map(id => [id, -1])); dist.set(s, 0);
    const queue = [s];
    while (queue.length) {
      const v = queue.shift();
      stack.push(v);
      for (const w of adj.get(v).keys()) {
        if (dist.get(w) < 0) { queue.push(w); dist.set(w, dist.get(v) + 1); }
        if (dist.get(w) === dist.get(v) + 1) { sigma.set(w, sigma.get(w) + sigma.get(v)); pred.get(w).push(v); }
      }
    }
    const delta = new Map(ids.map(id => [id, 0]));
    while (stack.length) {
      const w = stack.pop();
      for (const v of pred.get(w)) delta.set(v, delta.get(v) + (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w)));
      if (w !== s) cb.set(w, cb.get(w) + delta.get(w));
    }
  }
  const n = ids.length;
  const scale = normalized && n > 2 ? 1 / ((n - 1) * (n - 2)) : 0.5; // กราฟไม่มีทิศทางนับสองรอบ
  for (const id of ids) cb.set(id, cb.get(id) * scale);
  return cb;
}

/** Closeness แบบ harmonic (รองรับกราฟไม่เชื่อมกัน) normalize ด้วย n-1 */
export function closenessCentrality(adj) {
  const ids = [...adj.keys()];
  const out = new Map();
  const n = ids.length;
  for (const s of ids) {
    const dist = new Map([[s, 0]]);
    const queue = [s];
    let sum = 0;
    while (queue.length) {
      const v = queue.shift();
      for (const w of adj.get(v).keys()) {
        if (!dist.has(w)) { dist.set(w, dist.get(v) + 1); sum += 1 / dist.get(w); queue.push(w); }
      }
    }
    out.set(s, n > 1 ? sum / (n - 1) : 0);
  }
  return out;
}

/** คอมโพเนนต์ที่เชื่อมกัน → Map<id, componentIndex> (เรียงจากใหญ่ไปเล็ก) */
export function connectedComponents(adj) {
  const comp = new Map();
  const groups = [];
  for (const s of adj.keys()) {
    if (comp.has(s)) continue;
    const members = [s]; comp.set(s, -1);
    const queue = [s];
    while (queue.length) {
      const v = queue.shift();
      for (const w of adj.get(v).keys()) if (!comp.has(w)) { comp.set(w, -1); members.push(w); queue.push(w); }
    }
    groups.push(members);
  }
  groups.sort((a, b) => b.length - a.length);
  groups.forEach((members, i) => members.forEach(id => comp.set(id, i)));
  return { membership: comp, groups };
}

/** Louvain (modularity optimization) หลายระดับ → Map<id, communityIndex> */
export function louvainCommunities(adj, { resolution = 1, seed = 7 } = {}) {
  let nodes = [...adj.keys()];
  if (!nodes.length) return { membership: new Map(), groups: [] };
  // โครงสร้างระดับปัจจุบัน: weights Map<a, Map<b, w>>, และ map ของโหนดเดิม → โหนดรวม
  let weights = new Map();
  for (const [a, nb] of adj) weights.set(a, new Map(nb));
  let assign = new Map(nodes.map(id => [id, id])); // โหนดเดิม → ชุมชน(โหนดในระดับปัจจุบัน)
  let s = seed >>> 0 || 1;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  for (let level = 0; level < 20; level++) {
    const ids = [...weights.keys()];
    let m2 = 0; // 2m
    const k = new Map();
    for (const [a, nb] of weights) { let d = 0; for (const w of nb.values()) d += w; k.set(a, d); m2 += d; }
    if (m2 === 0) break;
    const comm = new Map(ids.map(id => [id, id]));
    const tot = new Map(ids.map(id => [id, k.get(id)]));
    let improved = false, moved = true, rounds = 0;
    while (moved && rounds++ < 50) {
      moved = false;
      const order = [...ids];
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      for (const v of order) {
        const cv = comm.get(v);
        const kv = k.get(v);
        // น้ำหนักจาก v ไปชุมชนรอบข้าง
        const toComm = new Map();
        for (const [u, w] of weights.get(v)) {
          if (u === v) continue;
          const cu = comm.get(u);
          toComm.set(cu, (toComm.get(cu) || 0) + w);
        }
        // เอาออกจากชุมชนเดิม
        tot.set(cv, tot.get(cv) - kv);
        let best = cv, bestGain = 0;
        const own = toComm.get(cv) || 0;
        const baseGain = own - resolution * tot.get(cv) * kv / m2;
        for (const [c, w] of toComm) {
          const gain = w - resolution * tot.get(c) * kv / m2;
          if (gain - baseGain > bestGain + 1e-12) { bestGain = gain - baseGain; best = c; }
        }
        tot.set(best, tot.get(best) + kv);
        if (best !== cv) { comm.set(v, best); moved = true; improved = true; }
      }
    }
    // บีบรวมเป็นระดับใหม่
    for (const [orig, c] of assign) assign.set(orig, comm.get(c));
    if (!improved) break;
    const newWeights = new Map();
    for (const [a, nb] of weights) {
      const ca = comm.get(a);
      if (!newWeights.has(ca)) newWeights.set(ca, new Map());
      for (const [b, w] of nb) {
        const cb = comm.get(b);
        newWeights.get(ca).set(cb, (newWeights.get(ca).get(cb) || 0) + w);
      }
    }
    if (newWeights.size === weights.size) break;
    weights = newWeights;
  }
  return relabel(assign);
}

/** Label propagation แบบกำหนด seed (ทางเลือกที่เร็วกว่า) */
export function labelPropagation(adj, { maxIter = 50, seed = 7 } = {}) {
  const ids = [...adj.keys()];
  const label = new Map(ids.map(id => [id, id]));
  let s = seed >>> 0 || 1;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let it = 0; it < maxIter; it++) {
    let changed = false;
    const order = [...ids];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (const v of order) {
      const counts = new Map();
      for (const [u, w] of adj.get(v)) counts.set(label.get(u), (counts.get(label.get(u)) || 0) + w);
      if (!counts.size) continue;
      let best = label.get(v), bestC = counts.get(best) || 0;
      for (const [l, c] of counts) if (c > bestC || (c === bestC && l < best)) { best = l; bestC = c; }
      if (best !== label.get(v)) { label.set(v, best); changed = true; }
    }
    if (!changed) break;
  }
  return relabel(label);
}

function relabel(assign) {
  // เปลี่ยนป้ายเป็นเลข 0..k-1 เรียงจากชุมชนใหญ่ไปเล็ก
  const groupsMap = new Map();
  for (const [id, c] of assign) (groupsMap.get(c) || groupsMap.set(c, []).get(c)).push(id);
  const groups = [...groupsMap.values()].sort((a, b) => b.length - a.length || String(a[0]).localeCompare(String(b[0])));
  const membership = new Map();
  groups.forEach((members, i) => members.forEach(id => membership.set(id, i)));
  return { membership, groups };
}

/** Modularity ของการแบ่งกลุ่ม (ใช้ตรวจสอบคุณภาพ/ทดสอบ) */
export function modularity(adj, membership) {
  let m2 = 0;
  const k = new Map();
  for (const [a, nb] of adj) { let d = 0; for (const w of nb.values()) d += w; k.set(a, d); m2 += d; }
  if (!m2) return 0;
  let q = 0;
  for (const [a, nb] of adj) {
    for (const [b, w] of nb) if (membership.get(a) === membership.get(b)) q += w - k.get(a) * k.get(b) / m2;
  }
  return q / m2;
}

/** เส้นทางสั้นสุด (Dijkstra, ต้นทุน = 1/weight เพื่อให้เส้นหนักกว่า = ใกล้กว่า หรือ unweighted) */
export function shortestPath(adj, from, to, { weighted = false } = {}) {
  if (!adj.has(from) || !adj.has(to)) return null;
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const visited = new Set();
  const frontier = [[0, from]];
  while (frontier.length) {
    frontier.sort((a, b) => a[0] - b[0]);
    const [d, v] = frontier.shift();
    if (visited.has(v)) continue;
    visited.add(v);
    if (v === to) break;
    for (const [u, w] of adj.get(v)) {
      const cost = weighted ? 1 / Math.max(1e-6, w) : 1;
      const nd = d + cost;
      if (!dist.has(u) || nd < dist.get(u)) { dist.set(u, nd); prev.set(u, v); frontier.push([nd, u]); }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return { path, length: dist.get(to) };
}

/** โหนดภายในระยะ k ก้าวจากชุดเริ่มต้น (รวมตัวเอง) */
export function neighborhood(adj, seeds, depth = 1) {
  const seen = new Set(seeds.filter(id => adj.has(id)));
  let frontier = [...seen];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next = [];
    for (const v of frontier) for (const u of adj.get(v).keys()) if (!seen.has(u)) { seen.add(u); next.push(u); }
    frontier = next;
  }
  return seen;
}

export function normalizeScores(scores) {
  const vals = [...scores.values()];
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  const out = new Map();
  for (const [id, v] of scores) out.set(id, max > min ? (v - min) / (max - min) : 0);
  return out;
}

export const CENTRALITIES = {
  degree: { name: 'Degree (จำนวนเส้นเชื่อม)', fn: degreeCentrality },
  weighted: { name: 'Weighted degree (น้ำหนักรวม)', fn: weightedDegree },
  betweenness: { name: 'Betweenness (ตัวกลางเชื่อม)', fn: betweennessCentrality },
  closeness: { name: 'Closeness (ความใกล้ชิดเครือข่าย)', fn: closenessCentrality },
};
