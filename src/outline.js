// แปลงมายแมป ⇄ โครงร่างข้อความ (Markdown outline: บรรทัดเยื้องด้วย "- " หรือแท็บ/ช่องว่าง)
import { buildTree } from './layout.js';

/** ส่งออกเป็น Markdown: รากเป็น "# หัวข้อ" ลูกเป็น "- " เยื้อง 2 ช่องต่อชั้น */
export function toOutline(graph, { rootId = null } = {}) {
  const nodes = graph.entityNodes();
  const { roots, children } = buildTree(nodes, [...graph.links.values()], rootId);
  const lines = [];
  const walk = (id, depth) => {
    const n = graph.getNode(id);
    const text = String(n.label ?? '').replace(/\r?\n/g, ' ').trim();
    const mark = n.mark ? n.mark + ' ' : '';
    if (depth === 0) lines.push(`# ${mark}${text}`);
    else lines.push(`${'  '.repeat(depth - 1)}- ${mark}${text}`);
    if (n.notes) lines.push(`${'  '.repeat(Math.max(0, depth))}  > ${String(n.notes).replace(/\r?\n/g, ' ')}`);
    for (const c of children.get(id)) walk(c, depth + 1);
  };
  roots.forEach((r, i) => { if (i) lines.push(''); walk(r, 0); });
  return lines.join('\n') + '\n';
}

/**
 * อ่านโครงร่างข้อความ → รายการ {label, depth, notes}
 * รองรับ: "# หัวข้อ" (ราก), "- ", "* ", "1. ", เยื้องด้วยช่องว่าง 2/4 หรือแท็บ, และ "> โน้ต" ใต้หัวข้อ
 */
export function parseOutline(text) {
  const items = [];
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  let indentUnit = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const m = raw.match(/^(\s*)(.*)$/);
    const ws = m[1].replace(/\t/g, '    ');
    let body = m[2].trim();
    const quote = body.match(/^>\s?(.*)$/);
    if (quote && items.length) { items[items.length - 1].notes = (items[items.length - 1].notes ? items[items.length - 1].notes + '\n' : '') + quote[1]; continue; }
    const heading = body.match(/^(#+)\s+(.*)$/);
    let depth;
    if (heading) { depth = heading[1].length - 1; body = heading[2]; }
    else {
      body = body.replace(/^([-*+•]|\d+[.)])\s+/, '');
      if (indentUnit == null && ws.length > 0) indentUnit = ws.length;
      const lvl = indentUnit ? Math.round(ws.length / indentUnit) : (ws.length ? 1 : 0);
      depth = lvl + 1; // รายการย่อยอยู่ใต้หัวข้อ # เสมอ
    }
    items.push({ label: body.trim(), depth, notes: '' });
  }
  // ถ้าไม่มี # เลย ให้ลดความลึกลงเพื่อให้บรรทัดแรกเป็นราก
  if (items.length && !items.some(i => i.depth === 0)) {
    const min = Math.min(...items.map(i => i.depth));
    for (const i of items) i.depth -= min;
  }
  return items;
}

/** นำโครงร่างเข้า graph: parentId = ต่อใต้หัวข้อที่เลือก (ถ้ามี) คืน id ของโหนดที่สร้าง */
export function importOutline(graph, text, { parentId = null } = {}) {
  const items = parseOutline(text);
  const created = [];
  const stack = []; // [depth, id]
  const base = parentId && graph.getNode(parentId) ? graph.getNode(parentId) : null;
  for (const it of items) {
    while (stack.length && stack[stack.length - 1][0] >= it.depth) stack.pop();
    const parent = stack.length ? graph.getNode(stack[stack.length - 1][1]) : base;
    const mm = it.label.match(/^([⭐❗✅❓💡🔥📌⚠️🎯]|\d️⃣)\s+(.*)$/u);
    const n = graph.addNode({ label: mm ? mm[2] : it.label, type: 'topic', x: parent ? parent.x + 160 : 0, y: parent ? parent.y + 40 : 0, notes: it.notes, mark: mm ? mm[1] : '' });
    if (parent) graph.addLink({ from: parent.id, to: n.id, label: '', directed: false });
    stack.push([it.depth, n.id]);
    created.push(n.id);
  }
  return created;
}

// ---------------------------------------------------------------- นำเข้าจากเอไอ (JSON ต้นไม้ / Markdown)
/** ดึง JSON ออกจากข้อความที่อาจมี ```json ... ``` หรือคำอธิบายปน */
export function extractJSON(text) {
  const t = String(text ?? '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cand = fence ? fence[1] : t;
  try { return JSON.parse(cand); } catch { /* ลองตัดหัวท้าย */ }
  const a = cand.indexOf('{'), b = cand.lastIndexOf('}');
  const a2 = cand.indexOf('['), b2 = cand.lastIndexOf(']');
  const start = (a >= 0 && (a2 < 0 || a < a2)) ? a : a2, end = start === a ? b : b2;
  if (start >= 0 && end > start) { try { return JSON.parse(cand.slice(start, end + 1)); } catch { /* ไม่ใช่ JSON */ } }
  return null;
}

/** แปลงอ็อบเจกต์หลายรูปแบบจากเอไอให้เป็นต้นไม้มาตรฐาน {text, notes, children[]} (หรือ null) */
export function normalizeTree(obj) {
  if (obj == null) return null;
  if (Array.isArray(obj)) { const kids = obj.map(normalizeTree).filter(Boolean); return kids.length ? { text: '', children: kids } : null; }
  if (typeof obj === 'string') return { text: obj, notes: '', children: [] };
  if (typeof obj !== 'object') return { text: String(obj), notes: '', children: [] };
  if (obj.root) { const r = normalizeTree(obj.root); if (r && !r.text && obj.title) r.text = String(obj.title); return r; }
  const text = obj.text ?? obj.label ?? obj.name ?? obj.title ?? obj.topic ?? obj.heading ?? obj.node ?? '';
  const notes = obj.notes ?? obj.note ?? obj.detail ?? obj.details ?? obj.description ?? obj.summary ?? '';
  let kids = obj.children ?? obj.subtopics ?? obj.items ?? obj.nodes ?? obj.branches ?? obj.sub ?? obj.topics ?? null;
  if (kids && !Array.isArray(kids) && typeof kids === 'object') kids = Object.entries(kids).map(([k, v]) => (typeof v === 'object' ? { text: k, children: Array.isArray(v) ? v : [v] } : { text: `${k}: ${v}` }));
  if (!text && !kids) {
    // อ็อบเจกต์แบบ {หัวข้อ: [ลูก...]} หรือ {หัวข้อ: "รายละเอียด"}
    const entries = Object.entries(obj);
    if (!entries.length) return null;
    if (entries.length === 1) { const [k, v] = entries[0]; const t = normalizeTree(v); return { text: k, notes: t && !t.children.length ? t.text : '', children: t && t.children.length ? t.children : (t && t.text && typeof v !== 'string' ? [t] : []) }; }
    return { text: '', notes: '', children: entries.map(([k, v]) => normalizeTree({ [k]: v })).filter(Boolean) };
  }
  const children = Array.isArray(kids) ? kids.map(normalizeTree).filter(Boolean) : [];
  return { text: String(text), notes: typeof notes === 'string' ? notes : JSON.stringify(notes), children };
}

/** นำต้นไม้ (จาก JSON ของเอไอ) เข้า graph คืน id ที่สร้าง; parentId = ต่อใต้หัวข้อที่เลือก */
export function importTree(graph, tree, { parentId = null } = {}) {
  const root = normalizeTree(tree);
  if (!root) return [];
  const base = parentId && graph.getNode(parentId) ? graph.getNode(parentId) : null;
  const created = [];
  const add = (node, parent) => {
    let n = null;
    if (node.text || !parent) {
      n = graph.addNode({ label: node.text || 'หัวข้อ', type: 'topic', notes: node.notes || '', x: parent ? parent.x + 160 : 0, y: parent ? parent.y + 40 : 0 });
      if (parent) graph.addLink({ from: parent.id, to: n.id, label: '', directed: false });
      created.push(n.id);
    }
    for (const c of node.children) add(c, n || parent);
  };
  add(root, base);
  return created;
}

/** คำสั่งสำเร็จรูปสำหรับให้เอไอสรุปเอกสารเป็นมายแมป (ผู้ใช้วางใน Gemini/ChatGPT/Claude) */
export const AI_PROMPT = `ช่วยสรุปเอกสารที่แนบมา (หรือข้อความด้านล่าง) เป็นมายแมปสำหรับทบทวนบทเรียน โดยตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอกบล็อกโค้ด ใช้โครงสร้างนี้:

{
  "title": "ชื่อเรื่อง",
  "root": {
    "text": "หัวข้อหลัก",
    "children": [
      { "text": "ประเด็นสำคัญ 1", "notes": "รายละเอียดสั้น ๆ ถ้ามี", "children": [
        { "text": "หัวข้อย่อย", "children": [] }
      ]}
    ]
  }
}

กติกา:
- ภาษาไทย (คงศัพท์เทคนิคภาษาอังกฤษไว้ได้) ข้อความแต่ละหัวข้อสั้นกระชับไม่เกิน 40 ตัวอักษร
- กิ่งหลัก 4–8 กิ่ง แต่ละกิ่งมีหัวข้อย่อย 2–6 ข้อ ลึกได้ไม่เกิน 4 ชั้น
- ใส่ "notes" เฉพาะจุดที่ต้องจำ เช่น นิยาม สูตร ตัวเลข ข้อสอบมักออก
- ครอบคลุมเนื้อหาทั้งเอกสาร เรียงตามลำดับในเอกสาร`;
