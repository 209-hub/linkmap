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
export function importTree(graph, tree, { parentId = null, mergeRoot = true } = {}) {
  let root = normalizeTree(tree);
  if (!root) return [];
  const base = parentId && graph.getNode(parentId) ? graph.getNode(parentId) : null;
  // ถ้าต่อใต้หัวข้อที่เลือกและรากของผลลัพธ์คือหัวข้อเดียวกัน → นำเฉพาะลูกมาต่อ (ไม่สร้างซ้ำ)
  const norm = (t) => String(t ?? '').replace(/\s+/g, '').toLowerCase();
  if (base && mergeRoot && root.text && norm(root.text) === norm(base.label)) {
    if (root.notes && !base.notes) graph.updateNode(base.id, { notes: root.notes });
    root = { text: '', notes: '', children: root.children };
  }
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

/** โครงสร้าง JSON ที่ขอให้เอไอตอบ */
const AI_SCHEMA = `{
  "title": "ชื่อเรื่อง",
  "root": {
    "text": "หัวข้อหลัก",
    "children": [
      { "text": "ประเด็นสำคัญ", "notes": "รายละเอียดที่ต้องจำ (ถ้ามี)", "children": [
        { "text": "หัวข้อย่อย", "children": [
          { "text": "รายละเอียด/ตัวอย่าง/ตัวเลข", "children": [] }
        ]}
      ]}
    ]
  }
}`;

const AI_RULES_COMMON = `- ตอบเป็น JSON ในบล็อกโค้ด \`\`\`json เท่านั้น ห้ามมีคำอธิบายอื่น
- ภาษาไทย (คงศัพท์เทคนิค/ชื่อเฉพาะภาษาอังกฤษไว้ได้) ข้อความแต่ละหัวข้อกระชับไม่เกิน 45 ตัวอักษร
- "notes" ใช้เก็บรายละเอียดที่ยาวกว่านั้น เช่น นิยาม สูตร ตัวเลข เงื่อนไข ข้อยกเว้น
- เรียงตามลำดับที่ปรากฏในเอกสาร ห้ามแต่งเนื้อหาที่ไม่มีในเอกสาร`;

export const AI_PROMPTS = {
  brief: {
    name: 'ย่อ (2–3 ชั้น)',
    text: `ช่วยสรุปเอกสารที่แนบมา (หรือข้อความด้านล่าง) เป็นมายแมปแบบย่อสำหรับทบทวนก่อนสอบ ใช้โครงสร้างนี้:

${AI_SCHEMA}

กติกา:
${AI_RULES_COMMON}
- กิ่งหลัก 4–8 กิ่ง แต่ละกิ่งมีหัวข้อย่อย 2–6 ข้อ ลึกไม่เกิน 3 ชั้น เลือกเฉพาะสาระสำคัญ`,
  },
  detailed: {
    name: 'ละเอียด (3–5 ชั้น ครบทุกหัวข้อย่อย)',
    text: `ช่วยอ่านเอกสารที่แนบมา (หรือข้อความด้านล่าง) อย่างละเอียดทั้งฉบับ แล้วแปลงเป็นมายแมปที่ครบถ้วน ใช้โครงสร้างนี้:

${AI_SCHEMA}

กติกา:
${AI_RULES_COMMON}
- ต้องลึกอย่างน้อย 3 ชั้นและได้ถึง 5 ชั้น: บท/ส่วน → หัวข้อ → หัวข้อย่อย → ประเด็น/ขั้นตอน/ตัวอย่าง → รายละเอียด
- ทุกหัวข้อย่อย ทุกรายการข้อ (1., 2., ก., ข., bullet) ทุกตาราง และทุกนิยามในเอกสารต้องมีโหนดของตัวเอง ห้ามรวบหลายข้อไว้ในโหนดเดียว ห้ามข้ามส่วนใด
- ถ้าเอกสารมีขั้นตอน ให้แตกเป็นลูกทีละขั้นตามลำดับ ถ้ามีเงื่อนไข/ข้อยกเว้น/ตัวเลข ให้เป็นโหนดใบหรือใส่ใน notes
- จำนวนโหนดรวมควรมากกว่า 40 ถ้าเอกสารยาวเกิน 5 หน้า ควรมากกว่า 80
- ถ้าคำตอบยาวจนส่งไม่หมดในครั้งเดียว ให้ส่งกิ่งหลักทีละกิ่งเป็น JSON แยกชิ้น (root = ชื่อกิ่งนั้น) แล้วบอกว่ายังมีกิ่งต่อไป`,
  },
  exhaustive: {
    name: 'ละเอียดมาก (ทุกย่อหน้า ทุกข้อ)',
    text: `ช่วยอ่านเอกสารที่แนบมาแบบครบทุกย่อหน้า แล้วแปลงเป็นมายแมปที่เก็บเนื้อหาไว้ให้มากที่สุดเพื่อใช้แทนการอ่านเอกสาร ใช้โครงสร้างนี้:

${AI_SCHEMA}

กติกา:
${AI_RULES_COMMON}
- ทำทีละส่วนของเอกสารตามลำดับ ไม่ข้ามหน้าใด ทุกย่อหน้าต้องสะท้อนเป็นอย่างน้อย 1 โหนด
- ลึก 4–6 ชั้น: บท → หัวข้อ → หัวข้อย่อย → ข้อ/ขั้นตอน → รายละเอียด → ตัวอย่าง/ตัวเลข
- ตาราง: แตกเป็นโหนดตามแถว ใส่ค่าของแต่ละคอลัมน์ใน notes
- รายการ ก./ข./1./2. ทุกรายการต้องมีโหนดของตัวเอง นิยาม สูตร ตัวเลข ข้อยกเว้น ใส่ใน notes ให้ครบ
- ส่งทีละกิ่งหลัก (JSON ชิ้นละกิ่ง root = ชื่อกิ่ง) จนครบทุกกิ่ง แล้วบอกว่า "ครบแล้ว"`,
  },
};
export const AI_PROMPT = AI_PROMPTS.detailed.text;

/** คำสั่งให้เอไอขยายเฉพาะหัวข้อที่เลือก (ส่งชื่อหัวข้อ + ลูกที่มีอยู่ไปเป็นบริบท) */
export function buildExpandPrompt(label, existingChildren = [], contextTitle = '') {
  const have = existingChildren.length ? `
หัวข้อนี้มีลูกอยู่แล้ว: ${existingChildren.map(c => `"${c}"`).join(', ')} — ให้ลงรายละเอียดใต้แต่ละข้อเหล่านี้ และเพิ่มข้อที่ยังขาด` : '';
  return `จากเอกสารที่แนบมา${contextTitle ? ` (เรื่อง "${contextTitle}")` : ''} ช่วยขยายเฉพาะหัวข้อ "${label}" ให้ละเอียดที่สุด เก็บทุกประเด็น ขั้นตอน เงื่อนไข ตัวอย่าง และตัวเลขที่เกี่ยวข้องกับหัวข้อนี้ในเอกสาร${have}

ตอบเป็น JSON ในบล็อกโค้ดเท่านั้น โดย root.text ต้องเป็น "${label}" พอดี:

${AI_SCHEMA}

กติกา:
${AI_RULES_COMMON}
- ลึก 3–5 ชั้นใต้หัวข้อนี้ ทุกรายการข้อในเอกสารต้องมีโหนดของตัวเอง`;
}
