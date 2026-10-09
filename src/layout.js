// อัลกอริทึมจัดผังอัตโนมัติ (เขียนเองทั้งหมด ไม่พึ่งไลบรารีภายนอก)
// ทุกฟังก์ชันรับ nodes = [{id,x,y,type,date,...}], links = [{from,to,weight}]
// และคืน Map<id, {x, y}> ตำแหน่งใหม่ (ไม่แก้ของเดิม)

const NODE_SPACING = 120;

function buildAdj(nodes, links) {
  const ids = new Set(nodes.map(n => n.id));
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const l of links) {
    if (!ids.has(l.from) || !ids.has(l.to) || l.from === l.to) continue;
    adj.get(l.from).add(l.to);
    adj.get(l.to).add(l.from);
  }
  return adj;
}

function bbox(nodes) {
  if (!nodes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, cx: 0, cy: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

/** เลื่อนผลลัพธ์ให้จุดศูนย์กลางตรงกับจุดศูนย์กลางเดิม (ผังไม่กระโดดหนีไปไหน) */
function recenter(positions, nodes) {
  const before = bbox(nodes);
  const after = bbox([...positions.values()]);
  const dx = before.cx - after.cx, dy = before.cy - after.cy;
  for (const p of positions.values()) { p.x += dx; p.y += dy; }
  return positions;
}

// ตัวสร้างเลขสุ่มแบบกำหนด seed ได้ เพื่อให้ผลซ้ำได้และทดสอบได้
function rng(seed = 42) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------------------------------------------------------------- force-directed
export function forceLayout(nodes, links, opts = {}) {
  const {
    iterations = 300, spacing = NODE_SPACING, seed = 42,
    gravity = 0.05,
  } = opts;
  const n = nodes.length;
  const pos = new Map();
  if (n === 0) return pos;
  const rand = rng(seed);
  const ids = nodes.map(x => x.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const px = new Float64Array(n), py = new Float64Array(n);
  const vx = new Float64Array(n), vy = new Float64Array(n);
  const area = spacing * spacing * n * 2.2;
  const R = Math.sqrt(area) / 2;
  nodes.forEach((nd, i) => {
    const hasPos = Number.isFinite(nd.x) && Number.isFinite(nd.y) && !(nd.x === 0 && nd.y === 0 && opts.randomizeZero);
    if (hasPos) { px[i] = nd.x; py[i] = nd.y; }
    else { const a = rand() * Math.PI * 2, r = rand() * R; px[i] = Math.cos(a) * r; py[i] = Math.sin(a) * r; }
    // ป้องกันซ้อนทับพอดีกัน
    px[i] += (rand() - 0.5) * 2; py[i] += (rand() - 0.5) * 2;
  });
  const edges = [];
  const idSet = new Set(ids);
  for (const l of links) {
    if (!idSet.has(l.from) || !idSet.has(l.to) || l.from === l.to) continue;
    edges.push([index.get(l.from), index.get(l.to), Math.min(4, Math.max(0.3, Number(l.weight) || 1))]);
  }
  const k = spacing;                 // ระยะที่พอใจ
  const k2 = k * k;
  let temp = Math.max(R, k) * 0.5;
  const cool = temp / (iterations + 1);
  for (let it = 0; it < iterations; it++) {
    vx.fill(0); vy.fill(0);
    // แรงผลักระหว่างทุกคู่ (O(n²) ใช้ได้สบายถึงหลักพันโหนด)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = px[i] - px[j], dy = py[i] - py[j];
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = (rand() - 0.5) * 0.1; dy = (rand() - 0.5) * 0.1; d2 = dx * dx + dy * dy + 0.01; }
        const d = Math.sqrt(d2);
        const f = k2 / d; // แรงผลัก ~ k²/d (Fruchterman–Reingold)
        const fx = dx / d * f, fy = dy / d * f;
        vx[i] += fx; vy[i] += fy; vx[j] -= fx; vy[j] -= fy;
      }
    }
    // แรงดึงของเส้นเชื่อม ~ d²/k ถ่วงด้วยน้ำหนัก
    for (const [a, b, w] of edges) {
      const dx = px[a] - px[b], dy = py[a] - py[b];
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d * d / k) * (0.6 + 0.4 * w) / Math.max(1, Math.sqrt(w));
      const fx = dx / d * f, fy = dy / d * f;
      vx[a] -= fx; vy[a] -= fy; vx[b] += fx; vy[b] += fy;
    }
    // แรงโน้มถ่วงสู่ศูนย์กลาง กันคอมโพเนนต์ที่ไม่เชื่อมกันลอยหายไป
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += px[i]; cy += py[i]; }
    cx /= n; cy /= n;
    for (let i = 0; i < n; i++) {
      vx[i] -= (px[i] - cx) * gravity * k / 10; vy[i] -= (py[i] - cy) * gravity * k / 10;
    }
    // เคลื่อนที่โดยจำกัดด้วยอุณหภูมิ
    for (let i = 0; i < n; i++) {
      const d = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]) || 1;
      const step = Math.min(d, temp);
      px[i] += vx[i] / d * step; py[i] += vy[i] / d * step;
    }
    temp = Math.max(temp - cool, 0.5);
  }
  nodes.forEach((nd, i) => pos.set(nd.id, { x: Math.round(px[i]), y: Math.round(py[i]) }));
  return recenter(pos, nodes);
}

// ---------------------------------------------------------------- hierarchical (ชั้นตามทิศทาง)
/** ตัดวงจรด้วย DFS (กลับทิศเส้นย้อนกลับ) แล้วจัดชั้นแบบ longest-path + เรียงด้วย barycenter */
export function hierarchicalLayout(nodes, links, opts = {}) {
  const { direction = 'TB', layerGap = 140, nodeGap = 150 } = opts;
  const pos = new Map();
  if (!nodes.length) return pos;
  const ids = nodes.map(n => n.id);
  const idSet = new Set(ids);
  const out = new Map(ids.map(id => [id, new Set()]));
  const inn = new Map(ids.map(id => [id, new Set()]));
  for (const l of links) {
    if (!idSet.has(l.from) || !idSet.has(l.to) || l.from === l.to) continue;
    out.get(l.from).add(l.to); inn.get(l.to).add(l.from);
  }
  // ตัดวงจร
  const state = new Map(); // 0 ยังไม่ไป, 1 กำลังไป, 2 เสร็จ
  const reversed = [];
  const visit = (u) => {
    state.set(u, 1);
    for (const v of [...out.get(u)]) {
      const sv = state.get(v) || 0;
      if (sv === 1) reversed.push([u, v]);
      else if (sv === 0) visit(v);
    }
    state.set(u, 2);
  };
  // เริ่มจากโหนดที่ in-degree น้อยก่อนให้ชั้นบนเป็นต้นทางจริง
  const order = [...ids].sort((a, b) => inn.get(a).size - inn.get(b).size || out.get(b).size - out.get(a).size);
  for (const id of order) if (!state.get(id)) visit(id);
  for (const [u, v] of reversed) { out.get(u).delete(v); inn.get(v).delete(u); out.get(v).add(u); inn.get(u).add(v); }
  // longest-path layering (Kahn)
  const layer = new Map(ids.map(id => [id, 0]));
  const indeg = new Map(ids.map(id => [id, inn.get(id).size]));
  const queue = ids.filter(id => indeg.get(id) === 0);
  while (queue.length) {
    const u = queue.shift();
    for (const v of out.get(u)) {
      layer.set(v, Math.max(layer.get(v), layer.get(u) + 1));
      indeg.set(v, indeg.get(v) - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }
  // โหนดโดดเดี่ยวไปอยู่ชั้นล่างสุดแยกต่างหาก
  const maxLayer = Math.max(0, ...layer.values());
  const isolated = ids.filter(id => inn.get(id).size === 0 && out.get(id).size === 0);
  const isoLayer = ids.length === isolated.length ? 0 : maxLayer + 1;
  for (const id of isolated) layer.set(id, isoLayer);
  const layers = [];
  for (const id of ids) { (layers[layer.get(id)] ||= []).push(id); }
  for (let i = 0; i < layers.length; i++) layers[i] ||= [];
  // barycenter ordering sweeps
  const posIn = new Map();
  const setOrder = (arr) => arr.forEach((id, i) => posIn.set(id, i));
  layers.forEach(setOrder);
  const bary = (id, nbrs) => {
    const arr = [...nbrs].filter(x => posIn.has(x));
    if (!arr.length) return posIn.get(id);
    return arr.reduce((s, x) => s + posIn.get(x), 0) / arr.length;
  };
  for (let sweep = 0; sweep < 8; sweep++) {
    const down = sweep % 2 === 0;
    for (let li = down ? 1 : layers.length - 2; down ? li < layers.length : li >= 0; li += down ? 1 : -1) {
      const arr = layers[li];
      const keyed = arr.map(id => [id, bary(id, down ? inn.get(id) : out.get(id))]);
      keyed.sort((a, b) => a[1] - b[1]);
      layers[li] = keyed.map(k => k[0]);
      setOrder(layers[li]);
    }
  }
  // กำหนดพิกัด จัดแต่ละชั้นให้อยู่กึ่งกลาง
  const widest = Math.max(...layers.map(l => l.length));
  layers.forEach((arr, li) => {
    const offset = (widest - arr.length) / 2;
    arr.forEach((id, i) => {
      const a = (i + offset) * nodeGap, b = li * layerGap;
      pos.set(id, direction === 'LR' ? { x: b, y: a } : { x: a, y: b });
    });
  });
  return recenter(pos, nodes);
}

// ---------------------------------------------------------------- circular
export function circularLayout(nodes, links, opts = {}) {
  const { sortBy = 'degree', spacing = NODE_SPACING } = opts;
  const pos = new Map();
  if (!nodes.length) return pos;
  const adj = buildAdj(nodes, links);
  let order = [...nodes];
  if (sortBy === 'degree') order.sort((a, b) => adj.get(b.id).size - adj.get(a.id).size || String(a.label).localeCompare(String(b.label), 'th'));
  else if (sortBy === 'type') order.sort((a, b) => String(a.type).localeCompare(String(b.type)) || adj.get(b.id).size - adj.get(a.id).size);
  else if (sortBy === 'label') order.sort((a, b) => String(a.label).localeCompare(String(b.label), 'th'));
  // เรียงให้โหนดที่เชื่อมกันอยู่ใกล้กันบนวง (greedy)
  if (sortBy === 'degree' && order.length > 3) {
    const placed = [order[0]]; const used = new Set([order[0].id]);
    while (placed.length < order.length) {
      const last = placed[placed.length - 1];
      let next = order.find(n => !used.has(n.id) && adj.get(last.id).has(n.id));
      if (!next) next = order.find(n => !used.has(n.id));
      placed.push(next); used.add(next.id);
    }
    order = placed;
  }
  const n = order.length;
  const r = n === 1 ? 0 : Math.max(spacing, (n * spacing) / (2 * Math.PI));
  order.forEach((nd, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pos.set(nd.id, { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) });
  });
  return recenter(pos, nodes);
}

// ---------------------------------------------------------------- grouped (คลัสเตอร์)
/** จัดเป็นกลุ่มตาม keyFn (เช่น ประเภท หรือชุมชน) แต่ละกลุ่มจัดวงกลมเล็ก แล้ววางกลุ่มเป็นตาราง */
export function groupedLayout(nodes, links, opts = {}) {
  const { keyFn = (n) => n.type, spacing = NODE_SPACING, groupGap = 160 } = opts;
  const pos = new Map();
  if (!nodes.length) return pos;
  const groups = new Map();
  for (const n of nodes) {
    const k = String(keyFn(n) ?? '');
    (groups.get(k) || groups.set(k, []).get(k)).push(n);
  }
  const keys = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length || a.localeCompare(b, 'th'));
  // จัดในกลุ่มด้วยวงกลมซ้อน (ใจกลาง 1 โหนด แล้วเรียงวงออกไป)
  const clusters = keys.map(k => {
    const members = groups.get(k);
    const adj = buildAdj(members, links);
    members.sort((a, b) => adj.get(b.id).size - adj.get(a.id).size);
    const local = new Map();
    let placed = 0, ring = 0;
    while (placed < members.length) {
      const r = ring * spacing * 0.9;
      const cap = ring === 0 ? 1 : Math.floor((2 * Math.PI * r) / (spacing * 0.9));
      const count = Math.min(cap, members.length - placed);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + ring * 0.5;
        local.set(members[placed + i].id, { x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      placed += count; ring++;
    }
    const radius = Math.max(spacing * 0.6, (ring - 1) * spacing * 0.9 + spacing * 0.6);
    return { key: k, local, radius };
  });
  // วางคลัสเตอร์เป็นตารางสี่เหลี่ยมโดยประมาณ
  const cols = Math.ceil(Math.sqrt(clusters.length));
  const cellSize = Math.max(...clusters.map(c => c.radius)) * 2 + groupGap;
  clusters.forEach((c, i) => {
    const cx = (i % cols) * cellSize, cy = Math.floor(i / cols) * cellSize;
    for (const [id, p] of c.local) pos.set(id, { x: Math.round(cx + p.x), y: Math.round(cy + p.y) });
  });
  return recenter(pos, nodes);
}

// ---------------------------------------------------------------- timeline
export function parseDate(s) {
  if (s == null || s === '') return null;
  if (s instanceof Date) return isNaN(s) ? null : s.getTime();
  if (typeof s === 'number') return s;
  const str = String(s).trim();
  // รองรับ วัน/เดือน/ปี (ไทยนิยม) และ ISO
  const m = str.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    let y = Number(m[3]); if (y < 100) y += 2000; if (y > 2400) y -= 543; // พ.ศ. → ค.ศ.
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
    return isNaN(d) ? null : d.getTime();
  }
  const t = Date.parse(str);
  return isNaN(t) ? null : t;
}

/** เรียงตามเวลาซ้าย→ขวา โหนดไม่มีวันที่ไปอยู่คอลัมน์ขวาสุด แยกเลนด้วย laneFn (ค่าเริ่มต้น: ประเภท) */
export function timelineLayout(nodes, links, opts = {}) {
  const { laneFn = (n) => n.type, width = null, laneGap = 130, minGap = 110 } = opts;
  const pos = new Map();
  if (!nodes.length) return pos;
  const dated = [], undated = [];
  for (const n of nodes) {
    const t = parseDate(n.date);
    (t == null ? undated : dated).push({ n, t });
  }
  dated.sort((a, b) => a.t - b.t);
  const lanes = [...new Set(nodes.map(n => String(laneFn(n) ?? '')))].sort((a, b) => a.localeCompare(b, 'th'));
  const laneIdx = new Map(lanes.map((l, i) => [l, i]));
  const tMin = dated.length ? dated[0].t : 0, tMax = dated.length ? dated[dated.length - 1].t : 1;
  const span = Math.max(1, tMax - tMin);
  const W = width ?? Math.max(600, dated.length * minGap);
  // กำหนด x ตามเวลา แต่กันทับกันด้วย minGap ในแนวเดียวกัน
  let lastX = -Infinity;
  for (const d of dated) {
    let x = ((d.t - tMin) / span) * W;
    if (x - lastX < minGap * 0.6) x = lastX + minGap * 0.6;
    lastX = x;
    pos.set(d.n.id, { x: Math.round(x), y: laneIdx.get(String(laneFn(d.n) ?? '')) * laneGap });
  }
  const startX = (dated.length ? lastX : 0) + minGap * 1.5;
  const perLane = new Map();
  for (const u of undated) {
    const lane = String(laneFn(u.n) ?? '');
    const k = perLane.get(lane) || 0;
    perLane.set(lane, k + 1);
    pos.set(u.n.id, { x: Math.round(startX + k * minGap), y: laneIdx.get(lane) * laneGap });
  }
  return recenter(pos, nodes);
}


// ---------------------------------------------------------------- mindmap (ซ้าย-ขวา รอบราก)
/** หาต้นไม้จากราก: ใช้ทิศทางเส้น (from→to) เป็นพ่อ→ลูก ถ้าไม่ถึงให้ใช้แบบไม่มีทิศทาง */
export function buildTree(nodes, links, rootId = null) {
  const ids = nodes.map(n => n.id);
  const idSet = new Set(ids);
  const out = new Map(ids.map(id => [id, []]));
  const und = new Map(ids.map(id => [id, []]));
  const indeg = new Map(ids.map(id => [id, 0]));
  for (const l of links) {
    if (!idSet.has(l.from) || !idSet.has(l.to) || l.from === l.to) continue;
    out.get(l.from).push(l.to); indeg.set(l.to, indeg.get(l.to) + 1);
    und.get(l.from).push(l.to); und.get(l.to).push(l.from);
  }
  const children = new Map(ids.map(id => [id, []]));
  const parent = new Map();
  const visited = new Set();
  const roots = [];
  const grow = (root) => {
    roots.push(root); visited.add(root);
    const queue = [root];
    while (queue.length) {
      const u = queue.shift();
      for (const v of [...out.get(u), ...und.get(u)]) {
        if (visited.has(v)) continue;
        visited.add(v); parent.set(v, u); children.get(u).push(v); queue.push(v);
      }
    }
  };
  const byId = new Map(nodes.map(n => [n.id, n]));
  const sortChildren = () => {
    for (const [id, arr] of children) {
      const idx = new Map(arr.map((c, i) => [c, i]));
      arr.sort((a, b) => {
        const oa = byId.get(a)?.order, ob = byId.get(b)?.order;
        const ka = oa == null ? Infinity : oa, kb = ob == null ? Infinity : ob;
        return ka - kb || idx.get(a) - idx.get(b);
      });
    }
  };
  if (rootId && idSet.has(rootId)) grow(rootId);
  // รากถัดไป: โหนดที่ยังไม่ถูกเยี่ยม เลือกตัวที่ไม่มีเส้นเข้าและมีเส้นออกมากสุด
  const order = [...ids].sort((a, b) => indeg.get(a) - indeg.get(b) || out.get(b).length - out.get(a).length || und.get(b).length - und.get(a).length);
  for (const id of order) if (!visited.has(id)) grow(id);
  sortChildren();
  return { roots, children, parent };
}

export function mindmapLayout(nodes, links, opts = {}) {
  const { rootId = null, hGap = 190, vGap = 46, sizeFn = null } = opts;
  const pos = new Map();
  if (!nodes.length) return pos;
  const byId = new Map(nodes.map(n => [n.id, n]));
  const { roots, children } = buildTree(nodes, links, rootId);
  const height = (id) => { // ความสูงรวมของซับทรี (หน่วย: โหนด)
    const ch = children.get(id);
    if (!ch.length) return 1;
    return ch.reduce((s, c) => s + height(c), 0);
  };
  const nodeW = (id) => (sizeFn ? sizeFn(byId.get(id)).w : 120);
  // วางซับทรีไปทางด้านหนึ่ง (dir = +1 ขวา, -1 ซ้าย) โดย y เป็นกึ่งกลางของช่วง
  const place = (id, x, yTop, dir, depth) => {
    const h = height(id) * vGap;
    const yCenter = yTop + h / 2;
    pos.set(id, { x, y: yCenter });
    let cy = yTop;
    for (const c of children.get(id)) {
      const ch = height(c) * vGap;
      const cx = x + dir * (nodeW(id) / 2 + hGap * 0.55 + nodeW(c) / 2);
      place(c, cx, cy, dir, depth + 1);
      cy += ch;
    }
  };
  let yCursor = 0;
  for (const root of roots) {
    const ch = children.get(root);
    // แบ่งลูกชั้นแรกเป็นซ้าย/ขวาให้สมดุลตามความสูงของซับทรี
    const right = [], left = [];
    let hr = 0, hl = 0;
    for (const c of ch) {
      const h = height(c);
      if (hr <= hl) { right.push(c); hr += h; } else { left.push(c); hl += h; }
    }
    const total = Math.max(1, hr, hl) * vGap;
    const rootY = yCursor + total / 2;
    pos.set(root, { x: 0, y: rootY });
    const side = (arr, dir, hsum) => {
      let cy = rootY - (hsum * vGap) / 2;
      for (const c of arr) {
        const h = height(c) * vGap;
        const cx = dir * (nodeW(root) / 2 + hGap * 0.6 + nodeW(c) / 2);
        place(c, cx, cy, dir, 1);
        cy += h;
      }
    };
    side(right, 1, hr); side(left, -1, hl);
    yCursor += total + vGap * 1.5;
  }
  return recenter(pos, nodes);
}

// ---------------------------------------------------------------- grid (ตัวช่วย)
export function gridLayout(nodes, links, opts = {}) {
  const { spacing = NODE_SPACING } = opts;
  const pos = new Map();
  const cols = Math.ceil(Math.sqrt(nodes.length));
  nodes.forEach((n, i) => pos.set(n.id, { x: (i % cols) * spacing, y: Math.floor(i / cols) * spacing }));
  return recenter(pos, nodes);
}

export const LAYOUTS = {
  mindmap: { name: 'มายแมป (ซ้าย-ขวา)', fn: mindmapLayout },
  force: { name: 'กระจายแรง (force)', fn: forceLayout },
  hierarchical: { name: 'ลำดับชั้น (hierarchical)', fn: hierarchicalLayout },
  circular: { name: 'วงกลม (circular)', fn: circularLayout },
  grouped: { name: 'จัดกลุ่ม (grouped)', fn: groupedLayout },
  timeline: { name: 'ไทม์ไลน์ (timeline)', fn: timelineLayout },
  grid: { name: 'ตาราง (grid)', fn: gridLayout },
};

export function runLayout(name, nodes, links, opts = {}) {
  const L = LAYOUTS[name];
  if (!L) throw new Error(`ไม่รู้จักเลย์เอาต์ ${name}`);
  return L.fn(nodes, links, opts);
}
