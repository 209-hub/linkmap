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
