// ตรวจหัวข้อที่ชื่อซ้ำกัน แล้วเชื่อมเส้นหรือรวม (เมิร์จ) เป็นโหนดเดียว

/** ทำชื่อให้เทียบกันได้: ตัดช่องว่างซ้ำ/หัวท้าย ไม่สนตัวพิมพ์เล็กใหญ่ ไม่สนวรรคตอนท้ายคำ */
export function normLabel(s) {
  return String(s ?? '').normalize('NFC').replace(/[\s​]+/g, ' ').trim().replace(/[.:;,]+$/u, '').toLowerCase();
}

/** หากลุ่มโหนดที่ชื่อซ้ำกัน → [{ key, label, ids }] เรียงจากกลุ่มใหญ่ไปเล็ก (ไม่รวมโน้ต/กรอบ และชื่อว่าง) */
export function findDuplicates(graph) {
  const map = new Map();
  for (const n of graph.entityNodes()) {
    const key = normLabel(n.label);
    if (!key) continue;
    (map.get(key) || map.set(key, []).get(key)).push(n);
  }
  const out = [];
  for (const [key, nodes] of map) if (nodes.length >= 2) out.push({ key, label: nodes[0].label, ids: nodes.map(n => n.id) });
  out.sort((a, b) => b.ids.length - a.ids.length || a.key.localeCompare(b.key, 'th'));
  return out;
}

/**
 * รวมโหนด otherIds เข้ากับ keepId: ย้ายเส้นทั้งหมดมาที่ตัวที่เก็บไว้ ตัดเส้นวนตัวเองและเส้นซ้ำ
 * รวมหมายเหตุ/แอตทริบิวต์/รูป/เครื่องหมายที่ตัวหลักยังไม่มี คืนจำนวนโหนดที่ถูกรวม
 */
export function mergeNodes(graph, keepId, otherIds) {
  const keep = graph.getNode(keepId);
  if (!keep) return 0;
  let merged = 0;
  for (const oid of otherIds) {
    if (oid === keepId) continue;
    const o = graph.getNode(oid);
    if (!o) continue;
    for (const l of graph.linksOf(oid)) {
      const from = l.from === oid ? keepId : l.from, to = l.to === oid ? keepId : l.to;
      if (from === to) { graph.removeLink(l.id); continue; }
      const dup = graph.linksBetween(from, to).some(x => x.id !== l.id && x.from !== oid && x.to !== oid && (x.label || '') === (l.label || ''));
      if (dup) graph.removeLink(l.id); else graph.updateLink(l.id, { from, to });
    }
    const patch = {};
    if (o.notes && o.notes !== keep.notes) patch.notes = keep.notes ? `${keep.notes}\n${o.notes}` : o.notes;
    if (!keep.image && o.image) { patch.image = o.image; patch.imageW = o.imageW; patch.imageH = o.imageH; }
    if (!keep.mark && o.mark) patch.mark = o.mark;
    if (!keep.date && o.date) patch.date = o.date;
    if (!keep.source && o.source) patch.source = o.source;
    patch.attrs = { ...(o.attrs || {}), ...(keep.attrs || {}) };
    graph.updateNode(keepId, patch);
    graph.removeNode(oid);
    merged++;
  }
  return merged;
}

/** เชื่อมเส้นระหว่างโหนดชื่อซ้ำ (ต่อเป็นสาย) ข้ามคู่ที่มีเส้นอยู่แล้ว คืนจำนวนเส้นที่เพิ่ม */
export function linkDuplicates(graph, ids, label = 'คำเดียวกัน') {
  let added = 0;
  for (let i = 0; i < ids.length - 1; i++) {
    const a = ids[i], b = ids[i + 1];
    if (!graph.getNode(a) || !graph.getNode(b) || graph.linksBetween(a, b).length) continue;
    graph.addLink({ from: a, to: b, label, directed: false, color: '#f59e0b' });
    added++;
  }
  return added;
}
