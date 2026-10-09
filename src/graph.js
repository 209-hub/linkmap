// โมเดลกราฟ: โหนด เส้นเชื่อม แอตทริบิวต์ และประวัติ undo/redo

let _seq = 0;
export function uid(prefix = 'n') {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_seq.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export const DEFAULT_NODE = {
  label: 'โหนดใหม่', type: 'generic', x: 0, y: 0,
  color: null, attrs: {}, date: '', source: '', notes: '',
  w: null, h: null, // ใช้กับโน้ต/กรอบกลุ่ม
};

export const DEFAULT_LINK = {
  label: '', directed: true, weight: 1, color: null,
  attrs: {}, date: '', source: '', notes: '',
};

export class Graph {
  constructor() {
    this.nodes = new Map();
    this.links = new Map();
    this.meta = { title: 'ผังใหม่', created: new Date().toISOString() };
  }

  // ---------- โหนด ----------
  addNode(data = {}) {
    const node = { ...DEFAULT_NODE, ...data, id: data.id || uid('n') };
    node.attrs = { ...(data.attrs || {}) };
    if (this.nodes.has(node.id)) throw new Error(`ซ้ำ: โหนด ${node.id}`);
    this.nodes.set(node.id, node);
    return node;
  }

  updateNode(id, patch) {
    const n = this.nodes.get(id);
    if (!n) return null;
    Object.assign(n, patch);
    return n;
  }

  removeNode(id) {
    if (!this.nodes.delete(id)) return false;
    for (const [lid, l] of [...this.links]) {
      if (l.from === id || l.to === id) this.links.delete(lid);
    }
    return true;
  }

  getNode(id) { return this.nodes.get(id); }

  findNodeByLabel(label, type) {
    const key = String(label ?? '').trim().toLowerCase();
    for (const n of this.nodes.values()) {
      if (String(n.label).trim().toLowerCase() === key && (!type || n.type === type)) return n;
    }
    return null;
  }

  // ---------- เส้นเชื่อม ----------
  addLink(data) {
    if (!data || !this.nodes.has(data.from) || !this.nodes.has(data.to)) {
      throw new Error('เส้นเชื่อมต้องอ้างถึงโหนดที่มีอยู่');
    }
    const link = { ...DEFAULT_LINK, ...data, id: data.id || uid('l') };
    link.attrs = { ...(data.attrs || {}) };
    link.weight = Number(link.weight) || 1;
    if (this.links.has(link.id)) throw new Error(`ซ้ำ: เส้น ${link.id}`);
    this.links.set(link.id, link);
    return link;
  }

  updateLink(id, patch) {
    const l = this.links.get(id);
    if (!l) return null;
    Object.assign(l, patch);
    if ('weight' in patch) l.weight = Number(l.weight) || 1;
    return l;
  }

  removeLink(id) { return this.links.delete(id); }
  getLink(id) { return this.links.get(id); }

  linksOf(nodeId) {
    const out = [];
    for (const l of this.links.values()) if (l.from === nodeId || l.to === nodeId) out.push(l);
    return out;
  }

  linksBetween(a, b) {
    const out = [];
    for (const l of this.links.values()) {
      if ((l.from === a && l.to === b) || (l.from === b && l.to === a)) out.push(l);
    }
    return out;
  }

  neighbors(nodeId) {
    const s = new Set();
    for (const l of this.links.values()) {
      if (l.from === nodeId && l.to !== nodeId) s.add(l.to);
      else if (l.to === nodeId && l.from !== nodeId) s.add(l.from);
    }
    return s;
  }

  degree(nodeId) { return this.linksOf(nodeId).length; }

  /** โหนดที่เป็นเอนทิตีจริง (ไม่รวมโน้ต/กรอบกลุ่ม) */
  entityNodes() {
    return [...this.nodes.values()].filter(n => n.type !== 'group' && n.type !== 'note');
  }

  /** adjacency: Map<id, Map<neighborId, weightรวม>> (ไม่รวม group/note และ self-loop) */
  adjacency({ ids = null, directed = false } = {}) {
    const adj = new Map();
    const allowed = ids ? new Set(ids) : null;
    for (const n of this.entityNodes()) {
      if (allowed && !allowed.has(n.id)) continue;
      adj.set(n.id, new Map());
    }
    for (const l of this.links.values()) {
      if (!adj.has(l.from) || !adj.has(l.to) || l.from === l.to) continue;
      const w = Number(l.weight) || 1;
      adj.get(l.from).set(l.to, (adj.get(l.from).get(l.to) || 0) + w);
      if (!directed) adj.get(l.to).set(l.from, (adj.get(l.to).get(l.from) || 0) + w);
    }
    return adj;
  }

  // ---------- บันทึก/โหลด ----------
  toJSON() {
    return {
      format: 'linkmap', version: 1,
      meta: { ...this.meta, saved: new Date().toISOString() },
      nodes: [...this.nodes.values()].map(n => ({ ...n, attrs: { ...n.attrs } })),
      links: [...this.links.values()].map(l => ({ ...l, attrs: { ...l.attrs } })),
    };
  }

  static fromJSON(obj) {
    if (!obj || !Array.isArray(obj.nodes) || !Array.isArray(obj.links)) {
      throw new Error('รูปแบบไฟล์ไม่ถูกต้อง (ต้องมี nodes และ links)');
    }
    const g = new Graph();
    g.meta = { ...g.meta, ...(obj.meta || {}) };
    for (const n of obj.nodes) g.addNode(n);
    for (const l of obj.links) {
      if (g.nodes.has(l.from) && g.nodes.has(l.to)) g.addLink(l);
    }
    return g;
  }

  clone() { return Graph.fromJSON(JSON.parse(JSON.stringify(this.toJSON()))); }

  get size() { return { nodes: this.nodes.size, links: this.links.size }; }
}

/** ประวัติแบบ snapshot — เรียบง่ายและเร็วพอสำหรับผังระดับหลายพันโหนด */
export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.past = [];
    this.future = [];
  }
  snapshot(graph) { return JSON.stringify(graph.toJSON()); }
  push(graph) {
    this.past.push(this.snapshot(graph));
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
  }
  /** บันทึก snapshot ที่ถ่ายไว้ก่อนหน้า (ใช้กับการลากที่แก้กราฟตรง ๆ) */
  pushSnapshot(snap) {
    this.past.push(snap);
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
  }
  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }
  undo(current) {
    if (!this.canUndo()) return null;
    this.future.push(this.snapshot(current));
    return Graph.fromJSON(JSON.parse(this.past.pop()));
  }
  redo(current) {
    if (!this.canRedo()) return null;
    this.past.push(this.snapshot(current));
    return Graph.fromJSON(JSON.parse(this.future.pop()));
  }
}
