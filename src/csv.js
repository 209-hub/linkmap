// นำเข้า/ส่งออก CSV (RFC 4180 อย่างง่าย รองรับ BOM, CRLF, เครื่องหมายคำพูด, ตรวจตัวแบ่งอัตโนมัติ)

export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length) || '';
  const counts = { ',': 0, '\t': 0, ';': 0, '|': 0 };
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}

export function parseCSV(text, delimiter = null) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delim = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/** แปลงแถวเป็นอ็อบเจกต์ตามหัวตาราง (ชื่อคอลัมน์ตัดช่องว่าง เป็นตัวพิมพ์เล็ก) */
export function rowsToObjects(rows) {
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map(h => h.trim());
  const records = rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
  return { headers, records };
}

const ALIASES = {
  id: ['id', 'รหัส', 'node_id', 'nodeid'],
  label: ['label', 'name', 'ชื่อ', 'ป้าย', 'title', 'node', 'entity'],
  type: ['type', 'ประเภท', 'kind', 'category', 'entity_type'],
  from: ['from', 'source', 'src', 'ต้นทาง', 'จาก', 'a', 'node1', 'from_id', 'entity1'],
  to: ['to', 'target', 'dst', 'ปลายทาง', 'ถึง', 'b', 'node2', 'to_id', 'entity2'],
  linkLabel: ['label', 'relation', 'relationship', 'ความสัมพันธ์', 'ป้าย', 'rel', 'edge', 'link'],
  weight: ['weight', 'น้ำหนัก', 'w', 'count', 'strength', 'value'],
  date: ['date', 'วันที่', 'time', 'datetime', 'เวลา', 'when', 'timestamp'],
  source: ['source_ref', 'แหล่งที่มา', 'ref', 'reference', 'citation', 'origin', 'แหล่ง'],
  directed: ['directed', 'ทิศทาง', 'direction'],
  x: ['x'], y: ['y'],
  fromType: ['from_type', 'source_type', 'ประเภทต้นทาง', 'type1', 'a_type'],
  toType: ['to_type', 'target_type', 'ประเภทปลายทาง', 'type2', 'b_type'],
  color: ['color', 'สี'],
  notes: ['notes', 'note', 'หมายเหตุ', 'description', 'รายละเอียด'],
};

function pick(headers, key, exclude = new Set()) {
  const lower = headers.map(h => h.toLowerCase());
  for (const a of ALIASES[key]) {
    const i = lower.indexOf(a);
    if (i >= 0 && !exclude.has(headers[i])) return headers[i];
  }
  return null;
}

const TYPE_ALIASES = {
  person: ['person', 'people', 'บุคคล', 'คน', 'ผู้', 'human', 'บุคคล/คน'],
  org: ['org', 'organization', 'organisation', 'company', 'องค์กร', 'บริษัท', 'หน่วยงาน', 'นิติบุคคล'],
  place: ['place', 'location', 'สถานที่', 'ที่อยู่', 'address', 'site'],
  event: ['event', 'เหตุการณ์', 'incident', 'meeting'],
  phone: ['phone', 'tel', 'เบอร์โทร', 'โทรศัพท์', 'เบอร์', 'mobile', 'number'],
  account: ['account', 'บัญชี', 'bank', 'wallet', 'กระเป๋า'],
  vehicle: ['vehicle', 'car', 'ยานพาหนะ', 'รถ', 'ทะเบียน'],
  generic: ['generic', 'ทั่วไป', 'other', 'อื่น'],
  note: ['note', 'โน้ต'],
  group: ['group', 'กรอบ', 'กลุ่ม'],
};

export function normalizeType(s) {
  const k = String(s ?? '').trim().toLowerCase();
  if (!k) return 'generic';
  for (const [t, al] of Object.entries(TYPE_ALIASES)) if (al.includes(k)) return t;
  return 'generic';
}

function parseBool(v, dflt = true) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return dflt;
  return !['0', 'false', 'no', 'n', 'ไม่', 'undirected', 'ไม่มี', 'ไม่มีทิศทาง', '-'].includes(s);
}

/** เดาว่า CSV นี้คือรายการโหนด รายการเส้น หรือตารางความสัมพันธ์ */
export function detectKind(headers) {
  const hasFrom = pick(headers, 'from'), hasTo = pick(headers, 'to');
  if (hasFrom && hasTo) return 'links';
  if (pick(headers, 'label') || pick(headers, 'id')) return 'nodes';
  return 'unknown';
}

/**
 * นำเข้า CSV เข้า graph
 * mode: 'auto' | 'nodes' | 'links' (รายการเส้น from,to,label — สร้างโหนดอัตโนมัติถ้าไม่พบ)
 * คืน {nodesAdded, linksAdded, nodesUpdated, warnings}
 */
export function importCSV(graph, text, { mode = 'auto', delimiter = null, matchBy = 'label', defaultType = 'generic' } = {}) {
  const rows = parseCSV(text, delimiter);
  const { headers, records } = rowsToObjects(rows);
  const result = { nodesAdded: 0, linksAdded: 0, nodesUpdated: 0, warnings: [], kind: null };
  if (!headers.length) { result.warnings.push('ไฟล์ว่าง'); return result; }
  const kind = mode === 'auto' ? detectKind(headers) : mode;
  result.kind = kind;
  if (kind === 'unknown') {
    result.warnings.push('ไม่พบคอลัมน์ที่รู้จัก (ต้องมี label/ชื่อ หรือ from,to)');
    return result;
  }
  const used = new Set();
  const col = (key) => { const h = pick(headers, key, used); if (h) used.add(h); return h; };

  if (kind === 'nodes') {
    const cId = col('id'), cLabel = col('label'), cType = col('type'), cDate = col('date'),
      cSource = col('source'), cX = col('x'), cY = col('y'), cColor = col('color'), cNotes = col('notes');
    const extra = headers.filter(h => !used.has(h));
    let i = 0;
    for (const r of records) {
      i++;
      const label = r[cLabel] ?? r[cId] ?? '';
      if (!label && !r[cId]) { result.warnings.push(`แถว ${i + 1}: ไม่มีชื่อ ข้าม`); continue; }
      const attrs = {};
      for (const h of extra) if (r[h] !== '') attrs[h] = r[h];
      const patch = {
        label: label || r[cId],
        type: cType && r[cType] ? normalizeType(r[cType]) : defaultType,
        date: cDate ? r[cDate] : '', source: cSource ? r[cSource] : '',
        color: cColor && r[cColor] ? r[cColor] : null,
        notes: cNotes ? r[cNotes] : '',
      };
      if (cX && cY && r[cX] !== '' && r[cY] !== '') { patch.x = Number(r[cX]); patch.y = Number(r[cY]); }
      let existing = cId && r[cId] ? graph.getNode(r[cId]) : null;
      if (!existing && matchBy === 'label') existing = graph.findNodeByLabel(patch.label);
      if (existing) {
        graph.updateNode(existing.id, { ...patch, attrs: { ...existing.attrs, ...attrs } });
        result.nodesUpdated++;
      } else {
        graph.addNode({ ...patch, attrs, id: cId && r[cId] ? r[cId] : undefined, x: patch.x ?? 0, y: patch.y ?? 0 });
        result.nodesAdded++;
      }
    }
    return result;
  }

  // links / ตารางความสัมพันธ์
  const cFrom = col('from'), cTo = col('to');
  const cLabel = col('linkLabel'), cWeight = col('weight'), cDate = col('date'), cSource = col('source'),
    cDirected = col('directed'), cFromType = col('fromType'), cToType = col('toType'), cColor = col('color'), cNotes = col('notes');
  const extra = headers.filter(h => !used.has(h));
  const resolve = (name, typeHint) => {
    const key = String(name ?? '').trim();
    if (!key) return null;
    let n = graph.getNode(key) || graph.findNodeByLabel(key);
    if (!n) {
      n = graph.addNode({ label: key, type: typeHint ? normalizeType(typeHint) : defaultType, x: 0, y: 0 });
      result.nodesAdded++;
    } else if (typeHint && n.type === 'generic') {
      const t = normalizeType(typeHint);
      if (t !== 'generic') graph.updateNode(n.id, { type: t });
    }
    return n;
  };
  let i = 0;
  for (const r of records) {
    i++;
    const a = resolve(r[cFrom], cFromType ? r[cFromType] : null);
    const b = resolve(r[cTo], cToType ? r[cToType] : null);
    if (!a || !b) { result.warnings.push(`แถว ${i + 1}: from/to ว่าง ข้าม`); continue; }
    const attrs = {};
    for (const h of extra) if (r[h] !== '') attrs[h] = r[h];
    graph.addLink({
      from: a.id, to: b.id,
      label: cLabel ? r[cLabel] : '',
      weight: cWeight && r[cWeight] !== '' ? Number(r[cWeight]) || 1 : 1,
      date: cDate ? r[cDate] : '', source: cSource ? r[cSource] : '',
      directed: cDirected ? parseBool(r[cDirected]) : true,
      color: cColor && r[cColor] ? r[cColor] : null,
      notes: cNotes ? r[cNotes] : '',
      attrs,
    });
    result.linksAdded++;
  }
  return result;
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportNodesCSV(graph) {
  const attrKeys = new Set();
  for (const n of graph.nodes.values()) Object.keys(n.attrs || {}).forEach(k => attrKeys.add(k));
  const headers = ['id', 'label', 'type', 'date', 'source', 'notes', 'x', 'y', ...attrKeys];
  const lines = [headers.map(csvEscape).join(',')];
  for (const n of graph.nodes.values()) {
    lines.push([n.id, n.label, n.type, n.date, n.source, n.notes, n.x, n.y, ...[...attrKeys].map(k => n.attrs?.[k] ?? '')].map(csvEscape).join(','));
  }
  return '﻿' + lines.join('\r\n');
}

export function exportLinksCSV(graph) {
  const attrKeys = new Set();
  for (const l of graph.links.values()) Object.keys(l.attrs || {}).forEach(k => attrKeys.add(k));
  const headers = ['from', 'to', 'label', 'weight', 'directed', 'date', 'source', 'notes', ...attrKeys];
  const lines = [headers.map(csvEscape).join(',')];
  for (const l of graph.links.values()) {
    const a = graph.getNode(l.from)?.label ?? l.from, b = graph.getNode(l.to)?.label ?? l.to;
    lines.push([a, b, l.label, l.weight, l.directed ? 'true' : 'false', l.date, l.source, l.notes, ...[...attrKeys].map(k => l.attrs?.[k] ?? '')].map(csvEscape).join(','));
  }
  return '﻿' + lines.join('\r\n');
}
