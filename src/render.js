// ตัวเรนเดอร์ SVG + การโต้ตอบบนผืนผ้าใบ (ซูม/แพน ลาก เลือก สร้างเส้น ปรับขนาด)
import { typeInfo, heatColor, paletteColor, getTheme } from './types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const BASE_R = 22;
export const NOTE_DEFAULT = { w: 180, h: 80 };
export const GROUP_DEFAULT = { w: 320, h: 220 };

function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function setAttrs(e, attrs) { for (const [k, v] of Object.entries(attrs)) if (v == null) e.removeAttribute(k); else e.setAttribute(k, v); }

export function isBox(node) { return node.type === 'note' || node.type === 'group' || node.type === 'topic'; }
/** ขนาดกล่องหัวข้อ (มายแมป) คำนวณจากความยาวข้อความ */
export const IMAGE_MAX_W = 220;
export function topicBox(node) {
  const text = (node.mark ? node.mark + ' ' : '') + (node.label || ' ');
  const lines = wrapText(text, 22, 3);
  const longest = Math.max(...lines.map(l => l.length));
  const scale = node.level === 0 ? 1.25 : 1;
  const bold = node.bold || node.level <= 1 ? 1.06 : 1;
  let w = Math.max(70, longest * 8.2 * scale * bold + 28);
  let h = (lines.length * 18 + 16) * scale;
  let img = null;
  if (node.image && node.imageW && node.imageH) {
    const iw = node.imgW || Math.min(IMAGE_MAX_W, node.imageW), ih = node.imageH * (iw / node.imageW);
    img = { w: iw, h: ih };
    if (node.imageOnly) return { w: iw, h: ih, lines: [], scale: 1, img, imageOnly: true }; // โหนดรูปล้วน: ขนาดโหนด = ขนาดรูป
    w = Math.max(w, iw + 20); h += ih + 8;
  }
  return { w, h, lines, scale, img };
}

/** เส้นลายมือแบบเรียบ (quadratic ผ่านจุดกึ่งกลาง) */
export function strokePath(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]} l0.01,0`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0]},${pts[i][1]} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L${l[0]},${l[1]}`;
}
export function nodeBox(node) {
  if (node.type === 'note') return { w: node.w || NOTE_DEFAULT.w, h: node.h || NOTE_DEFAULT.h };
  if (node.type === 'group') return { w: node.w || GROUP_DEFAULT.w, h: node.h || GROUP_DEFAULT.h };
  if (node.type === 'topic') { const b = topicBox(node); return { w: b.w, h: b.h }; }
  return null;
}

/** ตัดข้อความเป็นบรรทัดโดยประมาณ (ภาษาไทยไม่มีช่องว่าง จึงใช้จำนวนตัวอักษร) */
export function wrapText(text, maxChars, maxLines = Infinity) {
  const out = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const cand = line ? line + ' ' + w : w;
      if (cand.length <= maxChars) { line = cand; continue; }
      if (line) out.push(line);
      let rest = w;
      while (rest.length > maxChars) { out.push(rest.slice(0, maxChars)); rest = rest.slice(maxChars); }
      line = rest;
    }
    out.push(line);
  }
  if (out.length > maxLines) { const kept = out.slice(0, maxLines); kept[maxLines - 1] = kept[maxLines - 1].slice(0, Math.max(1, maxChars - 1)) + '…'; return kept; }
  return out;
}

// ---------- เรขาคณิตเส้นเชื่อม ----------
function bez(p0, c, p1, t) {
  const mt = 1 - t;
  return { x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x, y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y };
}
function bezTangent(p0, c, p1, t) {
  return { x: 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x), y: 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y) };
}
function inside(node, r, p) {
  const box = nodeBox(node);
  if (box) return Math.abs(p.x - node.x) <= box.w / 2 && Math.abs(p.y - node.y) <= box.h / 2;
  return Math.hypot(p.x - node.x, p.y - node.y) <= r;
}
function trimT(node, r, p0, c, p1, fromEnd) {
  // ค้นหาค่า t ที่จุดบนเส้นโค้งอยู่พอดีขอบโหนด (binary search)
  let lo = 0, hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const p = bez(p0, c, p1, mid);
    const inn = inside(node, r, p);
    if (fromEnd) { if (inn) hi = mid; else lo = mid; } else { if (inn) lo = mid; else hi = mid; }
  }
  return (lo + hi) / 2;
}

export function linkGeometry(link, a, b, ra, rb, offset) {
  // คืน {path, end, angle, label:{x,y}, start}
  if (a !== b && a.type === 'topic' && b.type === 'topic' && Math.abs(offset) < 1) {
    // กิ่งมายแมป: เส้นโค้งรูปตัว S ออกจากขอบซ้าย/ขวาของกล่อง
    const ba = nodeBox(a), bb = nodeBox(b);
    const dx = b.x - a.x, dy = b.y - a.y;
    const dirX = dx >= 0 ? 1 : -1, dirY = dy >= 0 ? 1 : -1;
    // ช่องว่างระหว่างขอบกล่องในแต่ละแกน: เลือกแกนที่มีช่องว่างมากกว่า (ลูกอยู่ซ้าย/ขวา → เกาะขอบข้าง, อยู่บน/ล่าง → เกาะขอบบน/ล่าง)
    const gapX = Math.abs(dx) - (ba.w + bb.w) / 2;
    const gapY = Math.abs(dy) - (ba.h + bb.h) / 2;
    if (gapY > gapX && gapY > 8) {
      const s = { x: a.x, y: a.y + dirY * ba.h / 2 };
      const e = { x: b.x, y: b.y - dirY * bb.h / 2 };
      const my = (s.y + e.y) / 2;
      const path = `M${s.x},${s.y} C${s.x},${my} ${e.x},${my} ${e.x},${e.y}`;
      return { path, end: e, angle: dirY > 0 ? Math.PI / 2 : -Math.PI / 2, label: { x: (s.x + e.x) / 2, y: my }, start: s };
    }
    const s = { x: a.x + dirX * ba.w / 2, y: a.y };
    const e = { x: b.x - dirX * bb.w / 2, y: b.y };
    if (gapX < 8) { // กล่องซ้อนกันทั้งสองแกน → เส้นตรงจากขอบที่ใกล้ที่สุด
      const p = `M${a.x},${a.y} L${b.x},${b.y}`;
      return { path: p, end: { x: b.x, y: b.y }, angle: Math.atan2(dy, dx), label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, start: { x: a.x, y: a.y } };
    }
    const mx = (s.x + e.x) / 2;
    const path = `M${s.x},${s.y} C${mx},${s.y} ${mx},${e.y} ${e.x},${e.y}`;
    return { path, end: e, angle: dirX > 0 ? 0 : Math.PI, label: { x: mx, y: (s.y + e.y) / 2 }, start: s };
  }
  if (a === b) {
    const r = ra, k = 26 + offset * 0.6;
    const p0 = { x: a.x - r * 0.45, y: a.y - r * 0.9 }, p1 = { x: a.x + r * 0.45, y: a.y - r * 0.9 };
    const c0 = { x: a.x - r - k, y: a.y - r - k * 1.6 }, c1 = { x: a.x + r + k, y: a.y - r - k * 1.6 };
    const top = { x: a.x, y: a.y - r - k * 1.25 };
    const path = `M${p0.x},${p0.y} C${c0.x},${c0.y} ${c1.x},${c1.y} ${p1.x},${p1.y}`;
    const ang = Math.atan2(p1.y - c1.y, p1.x - c1.x);
    return { path, end: p1, angle: ang, label: top, start: p0 };
  }
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d, ny = dx / d;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const c = { x: mid.x + nx * offset * 2, y: mid.y + ny * offset * 2 }; // ควบคุม = 2×offset เพื่อให้จุดกลางโค้งห่าง offset พอดี
  const p0 = { x: a.x, y: a.y }, p1 = { x: b.x, y: b.y };
  const t0 = trimT(a, ra, p0, c, p1, false);
  const t1 = trimT(b, rb, p0, c, p1, true);
  const s = bez(p0, c, p1, t0), e = bez(p0, c, p1, t1);
  // สร้างเส้นโค้งใหม่ระหว่าง s..e ที่ยังผ่านจุดควบคุมเดิมโดยประมาณ
  const tan = bezTangent(p0, c, p1, t1);
  const ang = Math.atan2(tan.y, tan.x);
  const path = `M${s.x},${s.y} Q${c.x},${c.y} ${e.x},${e.y}`;
  const labelPt = bez(s, c, e, 0.5);
  return { path, end: e, angle: ang, label: labelPt, start: s };
}

export function linkWidth(link) { return Math.min(8, 1.5 + (Number(link.weight) || 1) * 0.9); }
export function linkColor(link, a, b) {
  if (link.color) return link.color;
  const t = [a, b].find(n => n && n.type === 'topic' && n.branchColor);
  return t ? t.branchColor + 'aa' : '#94a3b8';
}

export class Renderer {
  constructor(app, svg) {
    this.app = app;
    this.svg = svg;
    this.viewport = svg.querySelector('#viewport');
    this.gGroups = svg.querySelector('#layer-groups');
    this.gLinks = svg.querySelector('#layer-links');
    this.gNodes = svg.querySelector('#layer-nodes');
    this.gOverlay = svg.querySelector('#layer-overlay');
    this.gInk = svg.querySelector('#layer-ink');
    this.inkEls = new Map();
    this.gridBg = svg.querySelector('#grid-bg');
    this.nodeEls = new Map();
    this.linkEls = new Map();
    this.drag = null;
    this.pointers = new Map(); // นิ้ว/พอยน์เตอร์ที่กดอยู่ (สำหรับ pinch zoom)
    this.pinch = null;
    this.hoverNode = null;
    this.linkSource = null; // สำหรับเครื่องมือเส้น (คลิกต้นทาง → ปลายทาง)
    this._bind();
  }

  // ---------- พิกัด ----------
  screenToWorld(sx, sy) {
    const r = this.svg.getBoundingClientRect();
    const { x, y, k } = this.app.view;
    return { x: (sx - r.left - x) / k, y: (sy - r.top - y) / k };
  }
  worldToScreen(wx, wy) {
    const r = this.svg.getBoundingClientRect();
    const { x, y, k } = this.app.view;
    return { x: wx * k + x + r.left, y: wy * k + y + r.top };
  }
  worldToLocal(wx, wy) { // พิกัดภายใน #canvas-wrap
    const { x, y, k } = this.app.view;
    return { x: wx * k + x, y: wy * k + y };
  }
  applyView() {
    const { x, y, k } = this.app.view;
    this.viewport.setAttribute('transform', `translate(${x},${y}) scale(${k})`);
    // เลื่อนลวดลายตารางตามมุมมอง
    const g1 = this.svg.querySelector('#grid-small'), g2 = this.svg.querySelector('#grid-large');
    const s1 = 20 * k, s2 = 100 * k;
    g1.setAttribute('width', s1); g1.setAttribute('height', s1);
    g1.firstElementChild.setAttribute('d', `M ${s1} 0 L 0 0 0 ${s1}`);
    g2.setAttribute('width', s2); g2.setAttribute('height', s2);
    g2.setAttribute('x', x); g2.setAttribute('y', y);
    g2.children[1].setAttribute('d', `M ${s2} 0 L 0 0 0 ${s2}`);
    g2.children[0].setAttribute('width', s2); g2.children[0].setAttribute('height', s2);
    this.gridBg.style.display = this.app.opts.grid ? '' : 'none';
    this.app.onViewChanged?.();
  }
  zoomAt(sx, sy, factor) {
    const v = this.app.view;
    const nk = Math.min(8, Math.max(0.05, v.k * factor));
    const r = this.svg.getBoundingClientRect();
    const px = sx - r.left, py = sy - r.top;
    v.x = px - (px - v.x) * (nk / v.k);
    v.y = py - (py - v.y) * (nk / v.k);
    v.k = nk;
    this.applyView();
  }
  contentBounds(ids = null) {
    const nodes = [...this.app.graph.nodes.values()].filter(n => !this.app.isHidden(n.id) && (!ids || ids.has(n.id)));
    const strokes = ids ? [] : (this.app.graph.strokes || []);
    if (!nodes.length && !strokes.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of strokes) for (const p of s.points) { minX = Math.min(minX, p[0] - 6); maxX = Math.max(maxX, p[0] + 6); minY = Math.min(minY, p[1] - 6); maxY = Math.max(maxY, p[1] + 6); }
    for (const n of nodes) {
      const box = nodeBox(n); const hw = box ? box.w / 2 : 40, hh = box ? box.h / 2 : 45;
      minX = Math.min(minX, n.x - hw); maxX = Math.max(maxX, n.x + hw);
      minY = Math.min(minY, n.y - hh); maxY = Math.max(maxY, n.y + hh);
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }
  fit(ids = null, pad = 60) {
    const b = this.contentBounds(ids);
    const r = this.svg.getBoundingClientRect();
    if (r.width < 100 || r.height < 100) { // ยังไม่ถูกจัดวาง (เช่นตอนเปิดหน้า) → ลองใหม่เฟรมถัดไป
      if ((this._fitRetry = (this._fitRetry || 0) + 1) < 60) requestAnimationFrame(() => this.fit(ids, pad));
      return;
    }
    this._fitRetry = 0;
    if (!b) { this.app.view = { x: r.width / 2, y: r.height / 2, k: 1 }; this.applyView(); return; }
    const k = Math.min(3, Math.max(0.05, Math.min((r.width - pad * 2) / Math.max(1, b.w), (r.height - pad * 2) / Math.max(1, b.h))));
    this.app.view = { k, x: r.width / 2 - (b.minX + b.w / 2) * k, y: r.height / 2 - (b.minY + b.h / 2) * k };
    this.applyView();
  }
  centerOn(id) {
    const n = this.app.graph.getNode(id); if (!n) return;
    const r = this.svg.getBoundingClientRect();
    const v = this.app.view;
    if (v.k < 0.35) v.k = 0.8;
    v.x = r.width / 2 - n.x * v.k; v.y = r.height / 2 - n.y * v.k;
    this.applyView();
  }
  /** เลื่อนมุมมองให้น้อยที่สุดเพื่อให้โหนดอยู่ในจอ (ไม่เปลี่ยนซูม) */
  ensureVisible(id, margin = 80) {
    const n = this.app.graph.getNode(id); if (!n) return;
    const r = this.svg.getBoundingClientRect();
    const v = this.app.view;
    const sx = n.x * v.k + v.x, sy = n.y * v.k + v.y;
    let dx = 0, dy = 0;
    if (sx < margin) dx = margin - sx; else if (sx > r.width - margin) dx = r.width - margin - sx;
    if (sy < margin) dy = margin - sy; else if (sy > r.height - margin) dy = r.height - margin - sy;
    if (dx || dy) { v.x += dx; v.y += dy; this.applyView(); }
  }

  // ---------- ขนาด/สีตามผลวิเคราะห์ ----------
  nodeRadius(node) {
    const s = this.app.visual.size?.get(node.id);
    return s == null ? BASE_R : 15 + 27 * s;
  }
  nodeStroke(node) {
    const c = this.app.visual.color?.get(node.id);
    return c || node.color || node.branchColor || typeInfo(node.type).color;
  }

  // ---------- เรนเดอร์ ----------
  render() {
    const { graph, hidden, selection } = this.app;
    const dimmed = this.app.visual.dimmed;
    // ---- โหนด & กรอบ ----
    const seen = new Set();
    for (const n of graph.nodes.values()) {
      if (this.app.isHidden(n.id)) continue;
      seen.add(n.id);
      let g = this.nodeEls.get(n.id);
      if (!g || g.dataset.type !== n.type) {
        if (g) g.remove();
        g = this._createNodeEl(n);
        this.nodeEls.set(n.id, g);
      }
      this._updateNodeEl(g, n, selection.has(n.id), dimmed?.has(n.id));
    }
    for (const [id, g] of [...this.nodeEls]) if (!seen.has(id)) { g.remove(); this.nodeEls.delete(id); }
    // ---- เส้น ----
    const seenL = new Set();
    const pairIndex = this._pairIndex();
    for (const l of graph.links.values()) {
      const a = graph.getNode(l.from), b = graph.getNode(l.to);
      if (!a || !b || this.app.isHidden(a.id) || this.app.isHidden(b.id)) continue;
      seenL.add(l.id);
      let g = this.linkEls.get(l.id);
      if (!g) { g = this._createLinkEl(l); this.linkEls.set(l.id, g); }
      const pi = pairIndex.get(l.id);
      this._updateLinkEl(g, l, a, b, pi, selection.has(l.id), dimmed && (dimmed.has(a.id) || dimmed.has(b.id)));
    }
    for (const [id, g] of [...this.linkEls]) if (!seenL.has(id)) { g.remove(); this.linkEls.delete(id); }
    // ---- ลายมือ ----
    if (this.gInk) {
      const seenS = new Set();
      for (const s of graph.strokes || []) {
        seenS.add(s.id);
        let ig = this.inkEls.get(s.id);
        if (!ig) {
          ig = el('g', { class: 'ink-g', 'data-id': s.id }, this.gInk);
          const d0 = strokePath(s.points);
          el('path', { class: 'ink-hit', d: d0, fill: 'none', stroke: 'transparent', 'stroke-width': s.width + 14, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ig);
          el('path', { class: 'ink', d: d0, stroke: s.color, 'stroke-width': s.width, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ig);
          this.inkEls.set(s.id, ig);
        }
        ig.classList.toggle('selected', selection.has(s.id));
      }
      for (const [id, p] of [...this.inkEls]) if (!seenS.has(id)) { p.remove(); this.inkEls.delete(id); }
    }
    this.app.onRendered?.();
  }

  /** ดัชนีเส้นซ้ำระหว่างคู่เดียวกัน → offset ความโค้ง */
  _pairIndex() {
    const groups = new Map();
    for (const l of this.app.graph.links.values()) {
      const key = l.from < l.to ? `${l.from}|${l.to}` : `${l.to}|${l.from}`;
      (groups.get(key) || groups.set(key, []).get(key)).push(l);
    }
    const out = new Map();
    for (const [key, arr] of groups) {
      const [first] = key.split('|');
      arr.forEach((l, i) => {
        const m = arr.length;
        let off = (i - (m - 1) / 2) * 28;
        if (l.from !== first) off = -off; // ให้เส้นสวนทางโค้งไปคนละฝั่งอย่างสม่ำเสมอ
        out.set(l.id, l.from === l.to ? i * 18 : off);
      });
    }
    return out;
  }

  _createNodeEl(n) {
    const g = el('g', { class: 'node', 'data-id': n.id });
    g.dataset.type = n.type;
    if (n.type === 'group') {
      g.setAttribute('class', 'group');
      el('rect', { class: 'shape' }, g);
      el('text', { class: 'title' }, g);
      el('rect', { class: 'resize-handle', width: 12, height: 12 }, g);
      this.gGroups.appendChild(g);
      return g;
    }
    if (n.type === 'topic') {
      g.setAttribute('class', 'node topic');
      el('rect', { class: 'sel-ring-rect' }, g);
      el('rect', { class: 'shape' }, g);
      el('text', { class: 'topic-text' }, g);
      el('circle', { class: 'badge-bg', r: 9 }, g);
      el('text', { class: 'badge' }, g);
      el('circle', { class: 'port', r: 6 }, g);
      el('circle', { class: 'port port-hit', r: 13 }, g);
      el('circle', { class: 'port port-left', r: 6 }, g);
      el('circle', { class: 'port port-hit', r: 13 }, g);
      const cg = el('g', { class: 'collapse-btn' }, g);
      el('circle', { class: 'collapse-bg', r: 9 }, cg);
      el('text', { class: 'collapse-txt' }, cg);
      el('text', { class: 'notes-ind' }, g);
      el('image', { class: 'topic-img', preserveAspectRatio: 'xMidYMid meet' }, g);
      el('line', { class: 'underline' }, g);
      el('rect', { class: 'resize-handle img-handle', width: 14, height: 14, rx: 3 }, g);
      this._addPlusBtn(g);
      this.gNodes.appendChild(g);
      return g;
    }
    if (n.type === 'note') {
      g.setAttribute('class', 'node note');
      el('rect', { class: 'shape' }, g);
      el('text', { class: 'note-text' }, g);
      el('rect', { class: 'resize-handle', width: 12, height: 12 }, g);
      el('circle', { class: 'port', r: 6 }, g);
      el('circle', { class: 'port port-hit', r: 13 }, g);
      this.gNodes.appendChild(g);
      return g;
    }
    el('circle', { class: 'sel-ring' }, g);
    el('circle', { class: 'shape' }, g);
    el('text', { class: 'icon' }, g);
    el('text', { class: 'label' }, g);
    el('text', { class: 'sublabel' }, g);
    el('circle', { class: 'badge-bg', r: 9 }, g);
    el('text', { class: 'badge' }, g);
    el('circle', { class: 'port', r: 6 }, g);
    el('circle', { class: 'port port-hit', r: 13 }, g);
    this._addPlusBtn(g);
    this.gNodes.appendChild(g);
    return g;
  }

  /** ปุ่ม + แบบ Canva: แตะเพื่อสร้างหัวข้อ/โหนดที่เชื่อมกับโหนดนี้ */
  _addPlusBtn(g) {
    const b = el('g', { class: 'add-btn' }, g);
    el('circle', { class: 'add-hit', r: 18 }, b);
    el('circle', { class: 'add-bg', r: 12 }, b);
    el('path', { class: 'add-plus', d: 'M-5,0 H5 M0,-5 V5' }, b);
    return b;
  }

  _updateNodeEl(g, n, selected, dim) {
    g.classList.toggle('selected', !!selected);
    g.classList.toggle('dimmed', !!dim);
    g.setAttribute('transform', `translate(${n.x},${n.y})`);
    const box = nodeBox(n);
    if (n.type === 'group') {
      const [rect, title, handle] = g.children;
      setAttrs(rect, { x: -box.w / 2, y: -box.h / 2, width: box.w, height: box.h, stroke: n.color || null, fill: n.color ? n.color + '18' : null });
      title.textContent = n.label; setAttrs(title, { x: -box.w / 2 + 12, y: -box.h / 2 + 20 });
      setAttrs(handle, { x: box.w / 2 - 8, y: box.h / 2 - 8 });
      return;
    }
    if (n.type === 'topic') {
      const tb = topicBox(n);
      const [ring, rect, text, badgeBg, badge, port, portHit, portL, portLHit, cbtn, notesInd, img, uline] = g.children;
      const theme = getTheme();
      const color = this.app.visual.color?.get(n.id) || n.color || n.branchColor || theme.root;
      const tree = this.app.tree;
      const parentId = tree?.parent?.get(n.id);
      const parentNode = parentId ? this.app.graph.getNode(parentId) : null;
      const side = parentNode ? (Math.sign(n.x - parentNode.x) || 1) : 1;
      const kids = tree?.children?.get(n.id) || [];
      const hasKids = kids.length > 0;
      const sz = this.app.visual.size?.get(n.id);
      const shape = n.shape || (n.level === 0 ? 'pill' : 'rounded');
      const rx = shape === 'pill' ? tb.h / 2 : shape === 'rect' ? 2 : 10;
      setAttrs(ring, { x: -tb.w / 2 - 5, y: -tb.h / 2 - 5, width: tb.w + 10, height: tb.h + 10, rx: rx + 4 });
      setAttrs(rect, { x: -tb.w / 2, y: -tb.h / 2, width: tb.w, height: tb.h, rx, stroke: color });
      const isRoot = n.level === 0;
      if (shape === 'underline') {
        rect.style.fill = this.app.visual.fill?.get(n.id) || 'transparent'; rect.style.strokeWidth = 0;
        uline.style.display = '';
        setAttrs(uline, { x1: -tb.w / 2, x2: tb.w / 2, y1: tb.h / 2, y2: tb.h / 2, stroke: color, 'stroke-width': isRoot ? 4 : 2.5 });
      } else {
        uline.style.display = 'none';
        rect.style.fill = this.app.visual.fill?.get(n.id) || (isRoot ? color : (n.level === 1 ? color + (theme.dark ? '33' : '1a') : theme.box));
        rect.style.strokeWidth = isRoot ? 0 : (sz != null ? 1.5 + sz * 4 : (n.level === 1 ? 2.5 : 1.8));
      }
      text.textContent = '';
      const fs = 13 * tb.scale;
      const imgH = tb.img ? tb.img.h + 8 : 0;
      tb.lines.forEach((ln, i) => { const ts = el('tspan', { x: 0, y: -tb.h / 2 + imgH + (12 + 5) * tb.scale + i * 18 * tb.scale }, text); ts.textContent = ln; });
      const rootFilled = isRoot && shape !== 'underline';
      setAttrs(text, { fill: rootFilled ? (theme.dark ? '#0f172a' : '#fff') : theme.text, 'font-size': fs, 'font-weight': n.bold || n.level <= 1 ? 700 : 500, 'font-style': n.italic ? 'italic' : 'normal' });
      const imgTop = -tb.h / 2 + (tb.imageOnly ? 0 : 6);
      if (tb.img) { img.style.display = ''; setAttrs(img, { href: n.image, x: -tb.img.w / 2, y: imgTop, width: tb.img.w, height: tb.img.h }); }
      else { img.style.display = 'none'; img.removeAttribute('href'); }
      const imgHandle = g.querySelector('.img-handle');
      if (tb.img) { imgHandle.style.display = ''; setAttrs(imgHandle, { x: tb.img.w / 2 - 8, y: imgTop + tb.img.h - 8 }); } else imgHandle.style.display = 'none';
      if (tb.imageOnly) { // รูปล้วน: ไม่มีพื้นหลัง/เส้นขอบ/เงา
        rect.style.fill = 'transparent'; rect.style.strokeWidth = 0; rect.style.filter = 'none'; uline.style.display = 'none';
        rect.setAttribute('rx', 4); ring.setAttribute('rx', 6);
      } else rect.style.filter = '';
      const bd = this.app.visual.badge?.get(n.id);
      if (bd != null) { badgeBg.style.display = ''; badge.style.display = ''; setAttrs(badgeBg, { cx: tb.w / 2, cy: -tb.h / 2, fill: paletteColor(bd) }); badge.textContent = String(bd); setAttrs(badge, { x: tb.w / 2, y: -tb.h / 2 }); }
      else { badgeBg.style.display = 'none'; badge.style.display = 'none'; }
      // จุดเชื่อม (port) อยู่ด้านบน/ล่าง, ปุ่มยุบ/ขยายอยู่ด้านที่มีลูก
      setAttrs(port, { cx: 0, cy: tb.h / 2 + 10 }); setAttrs(portHit, { cx: 0, cy: tb.h / 2 + 10 });
      setAttrs(portL, { cx: 0, cy: -tb.h / 2 - 10 }); setAttrs(portLHit, { cx: 0, cy: -tb.h / 2 - 10 });
      if (hasKids || n.collapsed) {
        cbtn.style.display = '';
        cbtn.setAttribute('transform', `translate(${side * (tb.w / 2 + 12)},0)`);
        cbtn.classList.toggle('collapsed', !!n.collapsed);
        const cnt = n.collapsed ? this.app.descendantCount?.(n.id) ?? kids.length : 0;
        cbtn.children[0].setAttribute('stroke', color);
        cbtn.children[1].textContent = n.collapsed ? String(cnt) : '−';
        cbtn.children[1].setAttribute('fill', n.collapsed ? '#fff' : color);
        cbtn.children[0].style.fill = n.collapsed ? color : '#fff';
      } else cbtn.style.display = 'none';
      notesInd.textContent = n.notes ? '📝' : '';
      setAttrs(notesInd, { x: -tb.w / 2 + 2, y: -tb.h / 2 - 3 });
      const addBtn = g.querySelector('.add-btn');
      addBtn.setAttribute('transform', `translate(${side * (tb.w / 2 + (hasKids || n.collapsed ? 36 : 18))},0)`);
      addBtn.querySelector('.add-bg').setAttribute('fill', color);
      return;
    }
    if (n.type === 'note') {
      const [rect, text, handle, port, portHit] = g.children;
      setAttrs(rect, { x: -box.w / 2, y: -box.h / 2, width: box.w, height: box.h, fill: n.color || null });
      const lines = wrapText(n.label, Math.max(4, Math.floor((box.w - 20) / 7.2)), Math.max(1, Math.floor((box.h - 14) / 17)));
      text.textContent = '';
      lines.forEach((ln, i) => { const ts = el('tspan', { x: -box.w / 2 + 10, y: -box.h / 2 + 22 + i * 17 }, text); ts.textContent = ln; });
      setAttrs(handle, { x: box.w / 2 - 8, y: box.h / 2 - 8 });
      setAttrs(port, { cx: box.w / 2 + 9, cy: 0 }); setAttrs(portHit, { cx: box.w / 2 + 9, cy: 0 });
      return;
    }
    const r = this.nodeRadius(n);
    const color = this.nodeStroke(n);
    const [ring, shape, icon, label, sub, badgeBg, badge, port, portHit] = g.children;
    setAttrs(ring, { r: r + 5 });
    setAttrs(shape, { r, stroke: color });
    shape.style.fill = this.app.visual.fill?.get(n.id) || '#fff';
    icon.textContent = typeInfo(n.type).icon; icon.style.fontSize = `${Math.max(12, r * 0.8)}px`;
    const lines = wrapText(n.label, 16, 2);
    label.textContent = '';
    lines.forEach((ln, i) => { const ts = el('tspan', { x: 0, y: r + 16 + i * 15 }, label); ts.textContent = ln; });
    const subText = this.app.visual.subLabel?.get(n.id) ?? '';
    sub.textContent = subText; setAttrs(sub, { y: r + 16 + lines.length * 15 });
    const bd = this.app.visual.badge?.get(n.id);
    if (bd != null) {
      badgeBg.style.display = ''; badge.style.display = '';
      setAttrs(badgeBg, { cx: r * 0.75, cy: -r * 0.75, fill: this.app.visual.badgeColor?.get(n.id) || paletteColor(bd) });
      badge.textContent = String(bd); setAttrs(badge, { x: r * 0.75, y: -r * 0.75 });
    } else { badgeBg.style.display = 'none'; badge.style.display = 'none'; }
    setAttrs(port, { cx: r + 10, cy: 0 }); setAttrs(portHit, { cx: r + 10, cy: 0 });
    const addBtn = g.querySelector('.add-btn');
    addBtn.setAttribute('transform', `translate(${r + 14},${-r - 4})`);
    addBtn.querySelector('.add-bg').setAttribute('fill', color);
  }

  _createLinkEl(l) {
    const g = el('g', { class: 'link', 'data-id': l.id });
    el('path', { class: 'hit' }, g);
    el('path', { class: 'line' }, g);
    el('path', { class: 'arrow' }, g);
    el('text', { class: 'label' }, g);
    this.gLinks.appendChild(g);
    return g;
  }

  _updateLinkEl(g, l, a, b, offset, selected, dim) {
    g.classList.toggle('selected', !!selected);
    g.classList.toggle('dimmed', !!dim);
    g.classList.toggle('highlight', this.app.visual.pathLinks?.has(l.id) || false);
    const geo = linkGeometry(l, a, b, this.nodeRadius(a), this.nodeRadius(b), offset || 0);
    const w = linkWidth(l), color = linkColor(l, a, b);
    const [hit, line, arrow, label] = g.children;
    hit.setAttribute('d', geo.path);
    setAttrs(line, { d: geo.path, stroke: color, 'stroke-width': w });
    if (l.directed) {
      const s = 5 + w * 1.4, ang = geo.angle;
      const tip = geo.end;
      const bx = tip.x - Math.cos(ang) * s, by = tip.y - Math.sin(ang) * s;
      const nx = -Math.sin(ang) * s * 0.5, ny = Math.cos(ang) * s * 0.5;
      setAttrs(arrow, { d: `M${tip.x},${tip.y} L${bx + nx},${by + ny} L${bx - nx},${by - ny} Z`, fill: color });
      arrow.style.display = '';
    } else arrow.style.display = 'none';
    if (this.app.opts.linkLabels && l.label) {
      label.style.display = '';
      label.textContent = l.label.length > 28 ? l.label.slice(0, 27) + '…' : l.label;
      setAttrs(label, { x: geo.label.x, y: geo.label.y });
    } else label.style.display = 'none';
  }

  // ---------- การโต้ตอบ ----------
  _bind() {
    const svg = this.svg;
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || !e.shiftKey) {
        const factor = Math.exp(-e.deltaY * 0.0015);
        this.zoomAt(e.clientX, e.clientY, factor);
      } else {
        this.app.view.x -= e.deltaY; this.applyView();
      }
    }, { passive: false });
    svg.addEventListener('pointerdown', (e) => this._onDown(e));
    svg.addEventListener('pointermove', (e) => this._onMove(e));
    svg.addEventListener('pointerup', (e) => this._onUp(e));
    svg.addEventListener('pointercancel', (e) => this._onUp(e));
    svg.addEventListener('dblclick', (e) => this._onDblClick(e));
    svg.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const hit = this._hitTest(e.target);
      if (hit && !this.app.selection.has(hit.id)) this.app.select([hit.id]);
      this.app.showContextMenu(e.clientX, e.clientY, hit);
    });
    svg.addEventListener('pointerover', (e) => {
      const hit = this._hitTest(e.target);
      this.hoverNode = hit && hit.kind === 'node' ? hit.id : null;
    });
    new ResizeObserver(() => this.applyView()).observe(svg);
  }

  _hitTest(target) {
    if (!target) return null;
    const nodeEl = target.closest?.('.node, .group');
    if (nodeEl) return { kind: 'node', id: nodeEl.dataset.id, el: nodeEl, port: target.classList.contains('port'), handle: target.classList.contains('resize-handle'), collapse: !!target.closest('.collapse-btn'), add: !!target.closest('.add-btn') };
    const linkEl = target.closest?.('.link');
    if (linkEl) return { kind: 'link', id: linkEl.dataset.id, el: linkEl };
    const inkEl = target.closest?.('.ink-g');
    if (inkEl) return { kind: 'stroke', id: inkEl.dataset.id, el: inkEl };
    return null;
  }

  /** เริ่มลากย้ายสิ่งที่เลือก: โหนด (+สมาชิกของกรอบ) และลายมือที่เลือก */
  _startMove(w) {
    const g = this.app.graph;
    const ids = new Set([...this.app.selection].filter(id => g.nodes.has(id)));
    for (const id of [...ids]) {
      const n = g.getNode(id);
      if (n.type === 'group') for (const m of this.groupMembers(n)) ids.add(m);
    }
    const start = new Map();
    for (const id of ids) { const n = g.getNode(id); start.set(id, { x: n.x, y: n.y }); }
    const strokeStart = new Map();
    for (const s of g.strokes) if (this.app.selection.has(s.id)) strokeStart.set(s.id, s.points.map(p => [p[0], p[1]]));
    this.drag = { type: 'move', ids, start, strokeStart, x0: w.x, y0: w.y, snap: this.app.history.snapshot(g), moved: false };
  }
  _setStrokePath(s) {
    const ig = this.inkEls.get(s.id); if (!ig) return;
    const d = strokePath(s.points);
    for (const p of ig.children) p.setAttribute('d', d);
  }

  _snap(v) { return this.app.opts.snap ? Math.round(v / 20) * 20 : v; }

  _onDown(e) {
    if (e.button === 2) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'touch' && this.pointers.size === 2) {
      // สองนิ้ว = บีบซูม/เลื่อน ยกเลิกการลากที่ค้างอยู่
      this.cancelDrag();
      const [p1, p2] = [...this.pointers.values()];
      const r = this.svg.getBoundingClientRect();
      const mid = { x: (p1.x + p2.x) / 2 - r.left, y: (p1.y + p2.y) / 2 - r.top };
      const v = this.app.view;
      this.pinch = { d0: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, k0: v.k, world: { x: (mid.x - v.x) / v.k, y: (mid.y - v.y) / v.k } };
      try { this.svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      return;
    }
    if (this.pinch) return;
    this.app.hideContextMenu?.();
    this.app.closeInlineEditor?.(true);
    this.svg.focus({ preventScroll: true });
    const hit = this._hitTest(e.target);
    const w = this.screenToWorld(e.clientX, e.clientY);
    // ตรวจดับเบิลคลิกเอง (ทนทานกว่า event dblclick ในบางสภาพแวดล้อม/ทัชแพด)
    const now = performance.now();
    const last = this._lastDown;
    this._lastDown = { t: now, x: e.clientX, y: e.clientY, id: hit?.id ?? null };
    if (e.button === 0 && this.app.tool !== 'pen' && this.app.tool !== 'eraser' && this.app.tool !== 'lasso' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && last && now - last.t < 400 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 6 && last.id === (hit?.id ?? null)) {
      this._lastDown = null;
      this._dblHandled = now;
      e.preventDefault(); // กันเบราว์เซอร์ย้ายโฟกัสไปจากช่องพิมพ์ที่กำลังจะเปิด
      this._handleDouble(hit, w);
      return;
    }
    const tool = this.app.tool;
    const panMode = e.button === 1 || tool === 'pan' || this.app.spaceDown;
    if (panMode) {
      if (this.app.spaceDown) this.app._spaceDragged = true;
      this.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: this.app.view.x, vy: this.app.view.y };
      this.svg.classList.add('panning');
      try { this.svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      return;
    }
    if (e.button !== 0) return;
    try { this.svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    if (tool === 'pen' || tool === 'eraser') {
      if (e.pointerType === 'pen') this.app.penSeen = true;
      // เมื่อมีปากกาสไตลัส: นิ้วใช้เลื่อนผืนผ้าใบ ปากกาใช้เขียน (กันฝ่ามือ)
      if (e.pointerType === 'touch' && this.app.penSeen) {
        this.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: this.app.view.x, vy: this.app.view.y };
        this.svg.classList.add('panning');
        return;
      }
      e.preventDefault();
      if (tool === 'pen') {
        const pen = this.app.pen || { color: '#111827', width: 3 };
        const path = el('path', { class: 'ink live', stroke: pen.color, 'stroke-width': pen.width, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.gInk);
        this.drag = { type: 'ink', pts: [[w.x, w.y]], path, color: pen.color, width: pen.width };
        path.setAttribute('d', strokePath(this.drag.pts));
      } else {
        this.drag = { type: 'erase', snap: this.app.history.snapshot(this.app.graph), removed: 0, last: { x: w.x, y: w.y } };
        this._eraseAt(w);
      }
      return;
    }

    if (tool === 'lasso') {
      e.preventDefault();
      const path = el('path', { class: 'marquee lasso' }, this.gOverlay);
      this.drag = { type: 'lasso', pts: [[w.x, w.y]], path, add: e.shiftKey || e.ctrlKey || e.metaKey };
      return;
    }
    if (tool === 'node' && !hit) { this.app.createNodeAt(this._snap(w.x), this._snap(w.y)); return; }
    if (tool === 'note' && !hit) { this.app.createNote(this._snap(w.x), this._snap(w.y)); return; }
    if (tool === 'group' && !hit) {
      this.drag = { type: 'groupdraw', x0: w.x, y0: w.y, rect: el('rect', { class: 'marquee' }, this.gOverlay) };
      return;
    }
    if (tool === 'link') {
      if (hit && hit.kind === 'node') {
        this._startLinkDrag(hit.id, e);
      }
      return;
    }
    // ---- เครื่องมือเลือก ----
    if (!hit) {
      const addSel = e.shiftKey || e.ctrlKey || e.metaKey;
      this.drag = { type: 'marquee', x0: w.x, y0: w.y, add: addSel, rect: el('rect', { class: 'marquee' }, this.gOverlay) };
      if (!addSel) this.app.select([]);
      return;
    }
    if (hit.kind === 'link') {
      if (e.shiftKey || e.ctrlKey || e.metaKey) this.app.toggleSelect(hit.id); else this.app.select([hit.id]);
      return;
    }
    if (hit.kind === 'stroke') {
      if (e.shiftKey || e.ctrlKey || e.metaKey) { this.app.toggleSelect(hit.id); return; }
      if (!this.app.selection.has(hit.id)) this.app.select([hit.id]);
      this._startMove(w);
      return;
    }
    // โหนด
    if (hit.collapse) { this.app.toggleCollapse(hit.id); return; }
    if (hit.add) { e.preventDefault(); this.app.select([hit.id]); this.app.addTopic('child'); return; }
    if (hit.port || e.altKey) { this._startLinkDrag(hit.id, e); return; }
    if (hit.handle) {
      const n = this.app.graph.getNode(hit.id); const box = nodeBox(n);
      if (n.type === 'topic') {
        const tb = topicBox(n);
        if (!this.app.selection.has(n.id)) this.app.select([n.id]);
        this.drag = { type: 'imgresize', id: n.id, w0: tb.img ? tb.img.w : 100, x0: w.x, snap: this.app.history.snapshot(this.app.graph), moved: false };
        return;
      }
      this.drag = { type: 'resize', id: hit.id, w0: box.w, h0: box.h, cx0: n.x, cy0: n.y, x0: w.x, y0: w.y, snap: this.app.history.snapshot(this.app.graph), moved: false };
      return;
    }
    // Shift+คลิก = เลือกทั้งกิ่ง (หัวข้อ + ลูกหลานทั้งหมด) · Ctrl+คลิก = เลือกเพิ่ม/เอาออก · Ctrl+Shift = เพิ่มทั้งกิ่ง
    if (e.shiftKey) { this.app.selectBranch(hit.id, { add: e.ctrlKey || e.metaKey }); return; }
    if (e.ctrlKey || e.metaKey) { this.app.toggleSelect(hit.id); return; }
    if (!this.app.selection.has(hit.id)) this.app.select([hit.id]);
    // เริ่มลาก: โหนดที่เลือกทั้งหมด + สมาชิกของกรอบที่เลือก + ลายมือที่เลือก
    this._startMove(w);
  }

  groupMembers(group) {
    const box = nodeBox(group);
    const out = [];
    for (const n of this.app.graph.nodes.values()) {
      if (n.id === group.id || n.type === 'group') continue;
      if (Math.abs(n.x - group.x) <= box.w / 2 && Math.abs(n.y - group.y) <= box.h / 2) out.push(n.id);
    }
    return out;
  }

  _startLinkDrag(sourceId, e) {
    const path = el('path', { class: 'temp-link' }, this.gOverlay);
    this.drag = { type: 'link', source: sourceId, path, target: null };
    this.app.select([sourceId]);
    this.app.setHint('ปล่อยบนโหนดปลายทางเพื่อสร้างเส้นเชื่อม (Esc ยกเลิก)');
  }

  _onMove(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch) {
      if (this.pointers.size < 2) return;
      const [p1, p2] = [...this.pointers.values()];
      const r = this.svg.getBoundingClientRect();
      const mid = { x: (p1.x + p2.x) / 2 - r.left, y: (p1.y + p2.y) / 2 - r.top };
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
      const v = this.app.view;
      v.k = Math.min(8, Math.max(0.05, this.pinch.k0 * dist / this.pinch.d0));
      v.x = mid.x - this.pinch.world.x * v.k; v.y = mid.y - this.pinch.world.y * v.k;
      this.applyView();
      return;
    }
    const d = this.drag;
    if (!d) return;
    const w = this.screenToWorld(e.clientX, e.clientY);
    if (d.type === 'lasso') {
      const p = this.screenToWorld(e.clientX, e.clientY);
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(p.x - last[0], p.y - last[1]) >= 3 / this.app.view.k) d.pts.push([p.x, p.y]);
      d.path.setAttribute('d', 'M' + d.pts.map(q => `${q[0]},${q[1]}`).join(' L') + ' Z');
      return;
    }
    if (d.type === 'ink') {
      const evs = e.getCoalescedEvents?.() || [];
      const list = evs.length ? evs : [e];
      const minD = 1.2 / this.app.view.k;
      for (const ev of list) {
        const p = this.screenToWorld(ev.clientX, ev.clientY);
        const last = d.pts[d.pts.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) >= minD) d.pts.push([p.x, p.y]);
      }
      d.path.setAttribute('d', strokePath(d.pts));
      return;
    }
    if (d.type === 'erase') {
      // ลบตามแนวที่ลากผ่าน (แทรกจุดระหว่างตำแหน่งก่อนหน้า เผื่อปัดเร็ว)
      const p = this.screenToWorld(e.clientX, e.clientY);
      const from = d.last || p;
      const step = 6 / this.app.view.k;
      const n = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / step));
      for (let i = 1; i <= n; i++) this._eraseAt({ x: from.x + (p.x - from.x) * i / n, y: from.y + (p.y - from.y) * i / n });
      d.last = p;
      return;
    }
    if (d.type === 'imgresize') {
      const n = this.app.graph.getNode(d.id); if (!n) return;
      const p = this.screenToWorld(e.clientX, e.clientY);
      d.moved = true;
      n.imgW = Math.round(Math.max(40, Math.min(2400, d.w0 + (p.x - d.x0) * 2))); // โหนดยึดจุดกึ่งกลาง จึงขยาย 2 เท่าของระยะลาก
      this.render(); return;
    }
    if (d.type === 'pan') {
      this.app.view.x = d.vx + (e.clientX - d.sx); this.app.view.y = d.vy + (e.clientY - d.sy);
      this.applyView(); return;
    }
    if (d.type === 'marquee' || d.type === 'groupdraw') {
      const x = Math.min(d.x0, w.x), y = Math.min(d.y0, w.y), ww = Math.abs(w.x - d.x0), hh = Math.abs(w.y - d.y0);
      setAttrs(d.rect, { x, y, width: ww, height: hh });
      if (d.type === 'marquee') {
        const ids = [];
        for (const n of this.app.graph.nodes.values()) {
          if (this.app.isHidden(n.id)) continue;
          if (n.x >= x && n.x <= x + ww && n.y >= y && n.y <= y + hh) ids.push(n.id);
        }
        for (const s of this.app.graph.strokes) { // ลายมือ: นับเมื่อจุดเกินครึ่งอยู่ในกรอบ
          let inside = 0;
          for (const p of s.points) if (p[0] >= x && p[0] <= x + ww && p[1] >= y && p[1] <= y + hh) inside++;
          if (inside * 2 >= s.points.length) ids.push(s.id);
        }
        this.app.select(ids, { add: d.add, silentPanels: true });
      }
      return;
    }
    if (d.type === 'move') {
      let dx = w.x - d.x0, dy = w.y - d.y0;
      if (Math.abs(dx) + Math.abs(dy) < 0.5 && !d.moved) return;
      d.moved = true;
      if (this.app.opts.snap) { dx = Math.round(dx / 20) * 20; dy = Math.round(dy / 20) * 20; }
      for (const id of d.ids) {
        const s = d.start.get(id); const n = this.app.graph.getNode(id);
        if (n) { n.x = s.x + dx; n.y = s.y + dy; }
      }
      if (d.strokeStart?.size) {
        for (const s of this.app.graph.strokes) {
          const orig = d.strokeStart.get(s.id); if (!orig) continue;
          s.points = orig.map(p => [Math.round((p[0] + dx) * 10) / 10, Math.round((p[1] + dy) * 10) / 10]);
          this._setStrokePath(s);
        }
      }
      // ลากหัวข้อเดียวไปวางบนหัวข้ออื่น = ย้ายกิ่ง (reparent)
      if (d.ids.size === 1) {
        const [mid] = d.ids; const mn = this.app.graph.getNode(mid);
        let target = null;
        if (mn && mn.type === 'topic') {
          const hit = this._hitTest(document.elementFromPoint(e.clientX, e.clientY));
          if (hit && hit.kind === 'node' && hit.id !== mid) {
            const tn = this.app.graph.getNode(hit.id);
            if (tn && tn.type === 'topic' && !this.app.isDescendant?.(hit.id, mid) && this.app.tree?.parent?.get(mid) !== hit.id) target = hit.id;
          }
        }
        if (d.target !== target) {
          this.nodeEls.get(d.target)?.classList.remove('link-target');
          d.target = target;
          this.nodeEls.get(target)?.classList.add('link-target');
          this.app.setHint(target ? `ปล่อยเพื่อย้ายกิ่งไปอยู่ใต้ “${this.app.graph.getNode(target).label}”` : '');
        }
      }
      this.render(); return;
    }
    if (d.type === 'resize') {
      const n = this.app.graph.getNode(d.id);
      d.moved = true;
      // ยึดมุมซ้ายบนไว้: ขยายขนาดและเลื่อนจุดศูนย์กลางตามครึ่งหนึ่ง
      n.w = Math.max(60, d.w0 + (w.x - d.x0));
      n.h = Math.max(40, d.h0 + (w.y - d.y0));
      n.x = d.cx0 + (n.w - d.w0) / 2;
      n.y = d.cy0 + (n.h - d.h0) / 2;
      this.render(); return;
    }
    if (d.type === 'link') {
      const a = this.app.graph.getNode(d.source);
      const hit = this._hitTest(document.elementFromPoint(e.clientX, e.clientY));
      const target = hit && hit.kind === 'node' && hit.id !== d.source ? hit.id : null;
      if (d.target !== target) {
        this.nodeEls.get(d.target)?.classList.remove('link-target');
        d.target = target;
        this.nodeEls.get(target)?.classList.add('link-target');
      }
      const end = target ? this.app.graph.getNode(target) : w;
      setAttrs(d.path, { d: `M${a.x},${a.y} L${end.x},${end.y}` });
    }
  }

  _onUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) { this.pinch = null; this.pointers.clear(); }
      return;
    }
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.svg.classList.remove('panning');
    try { this.svg.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (d.type === 'lasso') {
      d.path.remove();
      const poly = d.pts;
      if (poly.length >= 3) {
        const inPoly = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi) c = !c; } return c; };
        const ids = [];
        for (const n of this.app.graph.nodes.values()) if (!this.app.isHidden(n.id) && n.type !== 'group' && inPoly(n.x, n.y)) ids.push(n.id);
        for (const s of this.app.graph.strokes) { let k = 0; for (const p of s.points) if (inPoly(p[0], p[1])) k++; if (k * 2 >= s.points.length) ids.push(s.id); }
        this.app.select(ids, { add: d.add });
        if (ids.length) { this.app.setTool('select'); this.app.toast(`เลือกแล้ว ${ids.length} รายการ — ลากเพื่อย้าย หรือกด Delete เพื่อลบ`); }
        else this.app.toast('ไม่มีอะไรอยู่ในวง');
      }
      return;
    }
    if (d.type === 'ink') {
      d.path.remove();
      this.app.addStroke({ color: d.color, width: d.width, points: d.pts });
      return;
    }
    if (d.type === 'erase') {
      if (d.removed) { this.app.history.pushSnapshot(d.snap); this.app.changed({ structural: false }); }
      return;
    }
    if (d.type === 'imgresize') {
      if (d.moved) { this.app.history.pushSnapshot(d.snap); this.app.changed({ structural: false }); }
      return;
    }
    if (d.type === 'marquee') { d.rect.remove(); this.app.select([...this.app.selection]); return; }
    if (d.type === 'groupdraw') {
      d.rect.remove();
      const w = this.screenToWorld(e.clientX, e.clientY);
      const x = Math.min(d.x0, w.x), y = Math.min(d.y0, w.y), ww = Math.abs(w.x - d.x0), hh = Math.abs(w.y - d.y0);
      if (ww > 30 && hh > 30) this.app.createGroup(x + ww / 2, y + hh / 2, ww, hh); else this.app.createGroup(w.x, w.y);
      return;
    }
    if (d.type === 'move' || d.type === 'resize') {
      if (d.target) {
        this.nodeEls.get(d.target)?.classList.remove('link-target');
        this.app.setHint('');
        const [mid] = d.ids;
        this.app.history.pushSnapshot(d.snap);
        this.app.reparent(mid, d.target);
        return;
      }
      if (d.moved && d.type === 'move' && d.ids.size === 1) {
        const [mid] = d.ids;
        if (this.app.dropInsert?.(mid, this.screenToWorld(e.clientX, e.clientY), d.snap)) return;
      }
      if (d.moved) { this.app.history.pushSnapshot(d.snap); this.app.changed({ structural: false }); }
      return;
    }
    if (d.type === 'link') {
      d.path.remove();
      this.nodeEls.get(d.target)?.classList.remove('link-target');
      this.app.setHint('');
      if (d.target) this.app.createLink(d.source, d.target);
      else if (this.app.tool === 'link') {
        // โหมดคลิกต้นทางแล้วคลิกปลายทาง
        const hit = this._hitTest(document.elementFromPoint(e.clientX, e.clientY));
        if (hit && hit.kind === 'node' && hit.id === d.source) {
          if (this.linkSource && this.linkSource !== d.source) { this.app.createLink(this.linkSource, d.source); this.linkSource = null; }
          else { this.linkSource = d.source; this.app.setHint('คลิกโหนดปลายทาง (Esc ยกเลิก)'); }
        }
      }
    }
  }

  _onDblClick(e) {
    if (this.app.tool === 'pen' || this.app.tool === 'eraser' || this.app.tool === 'lasso') return;
    if (this._dblHandled && performance.now() - this._dblHandled < 600) return; // จัดการไปแล้วใน pointerdown
    const hit = this._hitTest(e.target);
    this._handleDouble(hit, this.screenToWorld(e.clientX, e.clientY));
  }

  _handleDouble(hit, w) {
    if (this.drag) { if (this.drag.rect) this.drag.rect.remove(); if (this.drag.path) this.drag.path.remove(); this.drag = null; }
    if (hit && !hit.port) { this.app.editInline(hit.id); return; }
    if (hit) return;
    if (this.app.tool === 'pan') return;
    if (this.app.tool === 'note') this.app.createNote(this._snap(w.x), this._snap(w.y));
    else if (this.app.tool === 'group') this.app.createGroup(this._snap(w.x), this._snap(w.y));
    else this.app.createNodeAt(this._snap(w.x), this._snap(w.y));
  }

  cancelDrag() {
    const d = this.drag;
    if (!d) { this.linkSource = null; return; }
    this.drag = null;
    if (d.rect) d.rect.remove();
    if (d.path) d.path.remove();
    if (d.type === 'move') {
      for (const id of d.ids) { const s = d.start.get(id); const n = this.app.graph.getNode(id); if (n) { n.x = s.x; n.y = s.y; } }
      if (d.strokeStart?.size) for (const s of this.app.graph.strokes) { const o = d.strokeStart.get(s.id); if (o) { s.points = o; this._setStrokePath(s); } }
      this.render();
    }
    if (d.type === 'erase' && d.removed) { try { this.app.graph.strokes = JSON.parse(d.snap).strokes || []; } catch { /* ignore */ } this.render(); }
    this.nodeEls.get(d.target)?.classList.remove('link-target');
    this.linkSource = null;
    this.app.setHint('');
  }

  /** ยางลบ: ลบทั้งเส้นที่อยู่ใต้จุด w (รัศมีคงที่บนจอ) */
  _eraseAt(w) {
    const r = 12 / this.app.view.k;
    const strokes = this.app.graph.strokes;
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      const rr = r + s.width / 2;
      let hitIt = false;
      for (let j = 0; j < s.points.length && !hitIt; j++) {
        const a = s.points[j], b = s.points[j + 1] || a;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, ((w.x - a[0]) * dx + (w.y - a[1]) * dy) / len2)) : 0;
        if (Math.hypot(w.x - (a[0] + t * dx), w.y - (a[1] + t * dy)) <= rr) hitIt = true;
      }
      if (hitIt) { strokes.splice(i, 1); this.inkEls.get(s.id)?.remove(); this.inkEls.delete(s.id); if (this.drag) this.drag.removed++; }
    }
  }
}
