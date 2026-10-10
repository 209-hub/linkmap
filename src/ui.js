// แผงด้านขวา: คุณสมบัติ / รายการ / วิเคราะห์ / ตำนาน และกล่องนำเข้า CSV
import { ENTITY_TYPES, TYPE_ORDER, typeInfo, paletteColor, THEMES } from './types.js';
import { parseCSV, rowsToObjects, detectKind, importCSV } from './csv.js';
import { nodeBox } from './render.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : esc(v));

const ui = {
  table: { kind: 'nodes', q: '', type: '', sort: 'label', asc: true },
};

export function initPanels(app) {
  // แท็บ
  document.querySelectorAll('#side-panel .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#side-panel .tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('#side-panel .tab-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === btn.dataset.tab));
      refreshPanels(app);
    });
  });
  refreshPanels(app);
}

export function showTab(name) {
  document.querySelector(`#side-panel .tab[data-tab="${name}"]`)?.click();
}

export function refreshPanels(app) {
  const active = document.querySelector('#side-panel .tab.active')?.dataset.tab || 'inspector';
  if (active === 'inspector') renderInspector(app);
  else if (active === 'table') renderTable(app);
  else if (active === 'analysis') renderAnalysis(app);
  else if (active === 'legend') renderLegend(app);
}

// ---------------------------------------------------------------- คุณสมบัติ
function field(label, inner) { return `<div class="field"><label>${label}</label>${inner}</div>`; }
function typeOptions(current, includeBoxes = false) {
  const keys = includeBoxes ? Object.keys(ENTITY_TYPES) : TYPE_ORDER;
  return keys.map(k => `<option value="${k}" ${k === current ? 'selected' : ''}>${ENTITY_TYPES[k].icon} ${ENTITY_TYPES[k].label}</option>`).join('');
}
function attrsTable(attrs) {
  const rows = Object.entries(attrs || {}).map(([k, v]) => `<tr><td><input class="attr-k" value="${esc(k)}"></td><td><input class="attr-v" value="${esc(v)}"></td><td><button class="del" title="ลบ">✕</button></td></tr>`).join('');
  return `<div class="attrs"><table><tbody>${rows}</tbody></table><button class="btn small" data-act="add-attr">+ เพิ่มแอตทริบิวต์</button></div>`;
}

function renderInspector(app) {
  const pane = document.getElementById('inspector');
  const sel = [...app.selection];
  const nodes = sel.filter(id => app.graph.nodes.has(id));
  const links = sel.filter(id => app.graph.links.has(id));
  if (!sel.length) {
    const { nodes: nc, links: lc } = app.graph.size;
    pane.innerHTML = `
      <h2 class="panel-title">${esc(app.graph.meta.title)}</h2>
      <div class="info-box">โหนด ${nc} · เส้นเชื่อม ${lc}${app.hidden.size ? ` · ซ่อนอยู่ ${app.hidden.size}` : ''}</div>
      <div class="empty-pane">คลิกโหนดหรือเส้นเพื่อดู/แก้คุณสมบัติ<br>ดับเบิลคลิกพื้นว่างเพื่อสร้างโหนดใหม่<br>ลากจากจุดเล็กข้างโหนดเพื่อเชื่อมเส้น</div>
      <div class="btn-row">
        <button class="btn" data-cmd="import-csv">นำเข้า CSV…</button>
        <button class="btn" data-cmd="layout:force">จัดผังอัตโนมัติ</button>
        <button class="btn" data-cmd="help">วิธีใช้</button>
      </div>`;
    bindCmds(pane, app);
    return;
  }
  if (sel.length === 1 && nodes.length === 1) return renderNodeInspector(app, pane, app.graph.getNode(nodes[0]));
  if (sel.length === 1 && links.length === 1) return renderLinkInspector(app, pane, app.graph.getLink(links[0]));
  // หลายรายการ
  pane.innerHTML = `
    <h2 class="panel-title">เลือก ${nodes.length} โหนด · ${links.length} เส้น</h2>
    ${nodes.length ? field('เปลี่ยนประเภททั้งหมด', `<select id="bulk-type"><option value="">— ไม่เปลี่ยน —</option>${typeOptions('')}</select>`) : ''}
    ${field('เปลี่ยนสีทั้งหมด', `<div class="row" style="margin:0"><input type="color" id="bulk-color" value="#2563eb" style="width:60px"><button class="btn small" id="bulk-color-apply">ใช้สี</button><button class="btn small" id="bulk-color-reset">ล้างสี</button></div>`)}
    <div class="btn-row">
      <button class="btn" data-cmd="layout-selected">จัดผังเฉพาะที่เลือก</button>
      <button class="btn" data-cmd="add-group">สร้างกรอบรอบที่เลือก</button>
      <button class="btn" data-cmd="connect-selected">เชื่อมเป็นสาย</button>
      <button class="btn" data-cmd="expand">ขยายเพื่อนบ้าน</button>
      <button class="btn" data-cmd="focus">ซ่อนที่ไม่เกี่ยว</button>
      ${nodes.length === 2 ? '<button class="btn" data-cmd="analysis:path">เส้นทางสั้นสุด</button>' : ''}
      <button class="btn danger" data-cmd="delete">ลบที่เลือก</button>
    </div>`;
  bindCmds(pane, app);
  pane.querySelector('#bulk-type')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    app.mutate(g => nodes.forEach(id => { const n = g.getNode(id); if (n.type !== 'group' && n.type !== 'note') g.updateNode(id, { type: e.target.value }); }));
  });
  pane.querySelector('#bulk-color-apply')?.addEventListener('click', () => {
    const c = pane.querySelector('#bulk-color').value;
    app.mutate(g => { nodes.forEach(id => g.updateNode(id, { color: c })); links.forEach(id => g.updateLink(id, { color: c })); });
  });
  pane.querySelector('#bulk-color-reset')?.addEventListener('click', () => {
    app.mutate(g => { nodes.forEach(id => g.updateNode(id, { color: null })); links.forEach(id => g.updateLink(id, { color: null })); });
  });
}

function renderNodeInspector(app, pane, n) {
  const t = typeInfo(n.type);
  const isBoxNode = n.type === 'note' || n.type === 'group';
  const box = nodeBox(n);
  const linkRows = app.graph.linksOf(n.id).map(l => {
    const other = l.from === n.id ? l.to : l.from;
    const on = app.graph.getNode(other);
    const dir = l.from === n.id ? '→' : '←';
    return `<tr data-id="${l.id}"><td>${dir}</td><td title="${esc(on?.label)}">${esc(on?.label)}</td><td class="muted">${esc(l.label)}</td></tr>`;
  }).join('');
  const score = app.analysis?.scores?.get(n.id);
  pane.innerHTML = `
    <h2 class="panel-title"><span class="chip" style="background:${n.color || t.color}">${t.icon} ${t.label}</span><span class="muted" style="font-size:11px">${esc(n.id)}</span></h2>
    ${field(isBoxNode ? (n.type === 'note' ? 'ข้อความโน้ต' : 'ชื่อกรอบ') : 'ชื่อ', n.type === 'note' ? `<textarea rows="4" data-prop="label">${esc(n.label)}</textarea>` : `<input data-prop="label" value="${esc(n.label)}">`)}
    ${n.type === 'topic' ? field('เครื่องหมายเน้น', `<div class="mark-row">${MARKS.map(m => `<button class="btn small ${n.mark === m ? 'primary' : ''}" data-mark="${m}">${m || 'ไม่มี'}</button>`).join('')}</div>`) : ''}
    ${n.type === 'topic' ? `<div class="field-row">
      ${field('รูปทรง', `<select data-shape><option value="auto" ${!n.shape ? 'selected' : ''}>อัตโนมัติ</option><option value="rounded" ${n.shape === 'rounded' ? 'selected' : ''}>มุมโค้ง</option><option value="pill" ${n.shape === 'pill' ? 'selected' : ''}>แคปซูล</option><option value="rect" ${n.shape === 'rect' ? 'selected' : ''}>สี่เหลี่ยม</option><option value="underline" ${n.shape === 'underline' ? 'selected' : ''}>ขีดเส้นใต้</option></select>`)}
      ${field('ตัวอักษร', `<div class="row" style="margin:0;gap:4px"><button class="btn small ${n.bold ? 'primary' : ''}" data-cmd="bold" title="Ctrl+B"><b>B</b></button><button class="btn small ${n.italic ? 'primary' : ''}" data-cmd="italic" title="Ctrl+I"><i>I</i></button><button class="btn small" data-act="shape-branch" title="ใช้รูปทรงนี้กับทั้งกิ่ง">ทั้งกิ่ง</button></div>`)}
    </div>
    ${field('รูปภาพ', `${n.image ? `<img class="img-thumb" src="${n.image}" alt="">` : ''}<div class="row" style="margin:0"><button class="btn small" data-cmd="image-add">${n.image ? 'เปลี่ยนรูป…' : 'เพิ่มรูป…'}</button>${n.image ? '<button class="btn small" data-cmd="image-remove">ลบรูป</button>' : ''}<span class="muted" style="font-size:11px">หรือกด Ctrl+V วางรูปจากคลิปบอร์ด</span></div>`)}` : ''}
    ${isBoxNode ? '' : field('ประเภท', `<select data-prop="type">${typeOptions(n.type)}</select>`)}
    <div class="field-row">
      ${field('สี', `<div class="row" style="margin:0"><input type="color" data-prop="color" value="${n.color || t.color}"><button class="btn small" data-act="reset-color" title="ใช้สีตามประเภท">ล้าง</button></div>`)}
      ${field('วันเวลา', `<input data-prop="date" value="${esc(n.date)}" placeholder="2025-02-10 หรือ 10/02/2568">`)}
    </div>
    ${field('แหล่งที่มา', `<input data-prop="source" value="${esc(n.source)}" placeholder="เช่น บันทึกคำให้การ, CDR, เอกสาร…">`)}
    ${isBoxNode ? '' : field('หมายเหตุ', `<textarea rows="2" data-prop="notes">${esc(n.notes)}</textarea>`)}
    ${field('แอตทริบิวต์ (key / value)', attrsTable(n.attrs))}
    ${isBoxNode ? `<div class="field-row">${field('กว้าง', `<input type="number" data-prop="w" value="${box.w}">`)}${field('สูง', `<input type="number" data-prop="h" value="${box.h}">`)}</div>` : ''}
    ${score != null ? `<div class="info-box">${esc(app.analysis.title)}: <b>${fmt(score)}</b>${app.analysis.rank?.get(n.id) ? ` (อันดับ ${app.analysis.rank.get(n.id)})` : ''}</div>` : ''}
    ${isBoxNode ? '' : `<h3 style="font-size:13px;margin:12px 0 4px">เส้นเชื่อม (${app.graph.degree(n.id)})</h3>
      <table class="data-table link-list"><tbody>${linkRows || '<tr><td class="muted">ยังไม่มี</td></tr>'}</tbody></table>`}
    <div class="btn-row">
      ${n.type === 'topic' ? `<button class="btn" data-cmd="add-child">+ หัวข้อย่อย (Tab)</button><button class="btn" data-cmd="add-sibling">+ หัวข้อถัดไป (Enter)</button>${(app.tree.children.get(n.id) || []).length || n.collapsed ? `<button class="btn" data-cmd="toggle-collapse">${n.collapsed ? 'ขยายกิ่ง' : 'ยุบกิ่ง'} (/)</button>` : ''}` : ''}
      ${isBoxNode ? '' : '<button class="btn" data-cmd="expand">ขยายเพื่อนบ้าน</button><button class="btn" data-cmd="focus">ซ่อนที่ไม่เกี่ยว</button>'}
      <button class="btn" data-cmd="hide-selected">ซ่อน</button>
      ${n.type === 'topic' && (app.tree.children.get(n.id) || []).length ? '<button class="btn danger" data-cmd="delete-branch">ลบทั้งกิ่ง</button><button class="btn" data-cmd="delete-keep-children">ลบเฉพาะหัวข้อนี้</button>' : '<button class="btn danger" data-cmd="delete">ลบ</button>'}
    </div>`;
  bindCmds(pane, app);
  bindProps(pane, app, (patch) => app.mutate(g => g.updateNode(n.id, patch)), n);
  pane.querySelector('[data-act="reset-color"]').addEventListener('click', () => app.mutate(g => g.updateNode(n.id, { color: null })));
  pane.querySelectorAll('[data-mark]').forEach(b => b.addEventListener('click', () => app.setMark(b.dataset.mark)));
  pane.querySelector('[data-shape]')?.addEventListener('change', (e) => app.run('shape:' + e.target.value));
  pane.querySelector('[data-act="shape-branch"]')?.addEventListener('click', () => app.run('shape-branch:' + (pane.querySelector('[data-shape]').value)));
  pane.querySelectorAll('.link-list tr[data-id]').forEach(tr => tr.addEventListener('click', () => app.select([tr.dataset.id])));
}

function renderLinkInspector(app, pane, l) {
  const a = app.graph.getNode(l.from), b = app.graph.getNode(l.to);
  pane.innerHTML = `
    <h2 class="panel-title"><span class="chip" style="background:${l.color || '#64748b'}">เส้นเชื่อม</span></h2>
    <div class="info-box"><b>${esc(a?.label)}</b> ${l.directed ? '→' : '—'} <b>${esc(b?.label)}</b> <button class="btn small" data-act="swap" title="สลับทิศ">⇄ สลับ</button></div>
    ${field('ป้ายกำกับ', `<input data-prop="label" value="${esc(l.label)}" placeholder="เช่น โทรหา, กรรมการ, โอนเงิน">`)}
    <div class="field-row">
      ${field('น้ำหนัก (1–10)', `<input type="number" min="0.1" max="10" step="0.5" data-prop="weight" value="${l.weight}">`)}
      ${field('ทิศทาง', `<select data-prop="directed"><option value="true" ${l.directed ? 'selected' : ''}>มีทิศทาง →</option><option value="false" ${!l.directed ? 'selected' : ''}>ไม่มีทิศทาง —</option></select>`)}
    </div>
    <div class="field-row">
      ${field('สี', `<div class="row" style="margin:0"><input type="color" data-prop="color" value="${l.color || '#94a3b8'}"><button class="btn small" data-act="reset-color">ล้าง</button></div>`)}
      ${field('วันเวลา', `<input data-prop="date" value="${esc(l.date)}">`)}
    </div>
    ${field('แหล่งที่มา', `<input data-prop="source" value="${esc(l.source)}">`)}
    ${field('หมายเหตุ', `<textarea rows="2" data-prop="notes">${esc(l.notes)}</textarea>`)}
    ${field('แอตทริบิวต์ (key / value)', attrsTable(l.attrs))}
    <div class="btn-row"><button class="btn danger" data-cmd="delete">ลบเส้น</button></div>`;
  bindCmds(pane, app);
  bindProps(pane, app, (patch) => app.mutate(g => g.updateLink(l.id, patch)), l);
  pane.querySelector('[data-act="reset-color"]').addEventListener('click', () => app.mutate(g => g.updateLink(l.id, { color: null })));
  pane.querySelector('[data-act="swap"]').addEventListener('click', () => app.mutate(g => g.updateLink(l.id, { from: l.to, to: l.from })));
}

function bindProps(pane, app, commit, obj) {
  pane.querySelectorAll('[data-prop]').forEach(inp => {
    inp.addEventListener('change', () => {
      const k = inp.dataset.prop;
      let v = inp.value;
      if (k === 'weight' || k === 'w' || k === 'h') v = Number(v);
      if (k === 'directed') v = v === 'true';
      commit({ [k]: v });
    });
  });
  const attrs = pane.querySelector('.attrs');
  const commitAttrs = () => {
    const out = {};
    attrs.querySelectorAll('tbody tr').forEach(tr => {
      const k = tr.querySelector('.attr-k').value.trim(), v = tr.querySelector('.attr-v').value;
      if (k) out[k] = v;
    });
    commit({ attrs: out });
  };
  attrs.querySelectorAll('.attr-k, .attr-v').forEach(i => i.addEventListener('change', commitAttrs));
  attrs.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => { b.closest('tr').remove(); commitAttrs(); }));
  attrs.querySelector('[data-act="add-attr"]').addEventListener('click', () => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><input class="attr-k" placeholder="ชื่อ"></td><td><input class="attr-v" placeholder="ค่า"></td><td><button class="del">✕</button></td>';
    attrs.querySelector('tbody').appendChild(tr);
    tr.querySelectorAll('input').forEach(i => i.addEventListener('change', commitAttrs));
    tr.querySelector('.del').addEventListener('click', () => { tr.remove(); commitAttrs(); });
    tr.querySelector('.attr-k').focus();
  });
}

/** เลือกสมาชิกของกลุ่ม: คลิก = เลือกกลุ่มนี้, Ctrl/Shift+คลิก = เลือกเพิ่ม (คลิกซ้ำกลุ่มที่เลือกครบแล้ว = เอาออก) */
function selectGroup(app, members, e) {
  const add = e && (e.ctrlKey || e.metaKey || e.shiftKey);
  const allIn = members.length && members.every(id => app.selection.has(id));
  if (add && allIn) { for (const id of members) app.selection.delete(id); app.select([...app.selection]); }
  else app.select(members, { add });
}

function bindCmds(root, app) {
  root.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => app.run(b.dataset.cmd)));
}

// ---------------------------------------------------------------- รายการ
function renderTable(app) {
  const pane = document.getElementById('table-pane');
  const st = ui.table;
  const g = app.graph;
  const q = st.q.trim().toLowerCase();
  let rows, cols;
  if (st.kind === 'nodes') {
    cols = [['label', 'ชื่อ'], ['type', 'ประเภท'], ['degree', 'เส้น', 'num']];
    if (app.analysis?.scores) cols.push(['score', 'คะแนน', 'num']);
    if (app.analysis?.membership) cols.push(['community', app.analysis.kind === 'components' ? 'คอมโพเนนต์' : 'ชุมชน', 'num']);
    rows = [...g.nodes.values()].filter(n => n.type !== 'group').map(n => ({
      id: n.id, label: n.label, type: typeInfo(n.type).label, typeKey: n.type, color: n.color || typeInfo(n.type).color,
      degree: g.degree(n.id), score: app.analysis?.scores?.get(n.id) ?? '', community: app.analysis?.membership?.get(n.id) ?? '',
      hay: `${n.label} ${n.source} ${n.notes} ${Object.values(n.attrs || {}).join(' ')}`.toLowerCase(),
    }));
    if (st.type) rows = rows.filter(r => r.typeKey === st.type);
  } else {
    cols = [['from', 'จาก'], ['to', 'ถึง'], ['label', 'ป้าย'], ['weight', 'น้ำหนัก', 'num'], ['date', 'วันที่']];
    rows = [...g.links.values()].map(l => ({
      id: l.id, from: g.getNode(l.from)?.label ?? '', to: g.getNode(l.to)?.label ?? '', label: l.label, weight: l.weight, date: l.date, color: l.color || '#94a3b8',
      hay: `${g.getNode(l.from)?.label} ${g.getNode(l.to)?.label} ${l.label} ${l.source} ${Object.values(l.attrs || {}).join(' ')}`.toLowerCase(),
    }));
  }
  if (q) rows = rows.filter(r => r.hay.includes(q));
  const dir = st.asc ? 1 : -1;
  rows.sort((a, b) => {
    const x = a[st.sort], y = b[st.sort];
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    if (x === '' && y !== '') return 1; if (y === '' && x !== '') return -1;
    return String(x).localeCompare(String(y), 'th') * dir;
  });
  const typeFilter = `<select id="tbl-type"><option value="">ทุกประเภท</option>${TYPE_ORDER.map(k => `<option value="${k}" ${st.type === k ? 'selected' : ''}>${ENTITY_TYPES[k].label}</option>`).join('')}<option value="note" ${st.type === 'note' ? 'selected' : ''}>โน้ต</option></select>`;
  pane.innerHTML = `
    <div class="table-controls">
      <div class="seg"><button data-kind="nodes" class="${st.kind === 'nodes' ? 'active' : ''}">โหนด (${g.nodes.size})</button><button data-kind="links" class="${st.kind === 'links' ? 'active' : ''}">เส้น (${g.links.size})</button></div>
      <input id="tbl-q" placeholder="กรอง…" value="${esc(st.q)}">
      ${st.kind === 'nodes' ? typeFilter : ''}
    </div>
    <div class="muted" style="font-size:11px;margin-bottom:4px">${rows.length} รายการ · คลิกเพื่อเลือกและเลื่อนไปหา · Ctrl+คลิก เลือกเพิ่ม</div>
    <table class="data-table"><thead><tr>${cols.map(([k, name, cls]) => `<th data-sort="${k}" class="${cls || ''} ${st.sort === k ? 'sorted ' + (st.asc ? 'asc' : '') : ''}">${name}</th>`).join('')}</tr></thead>
    <tbody>${rows.slice(0, 1000).map(r => `<tr data-id="${r.id}" class="${app.selection.has(r.id) ? 'selected' : ''}">${cols.map(([k, , cls], i) => `<td class="${cls || ''}" title="${esc(r[k])}">${i === 0 ? `<span class="dot" style="background:${r.color}"></span>` : ''}${fmt(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  pane.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { st.kind = b.dataset.kind; st.sort = st.kind === 'nodes' ? 'label' : 'from'; renderTable(app); }));
  const qi = pane.querySelector('#tbl-q');
  qi.addEventListener('input', () => { st.q = qi.value; const pos = qi.selectionStart; renderTable(app); const q2 = pane.querySelector('#tbl-q'); q2.focus(); q2.setSelectionRange(pos, pos); });
  pane.querySelector('#tbl-type')?.addEventListener('change', (e) => { st.type = e.target.value; renderTable(app); });
  pane.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
    if (st.sort === th.dataset.sort) st.asc = !st.asc; else { st.sort = th.dataset.sort; st.asc = !th.classList.contains('num'); }
    renderTable(app);
  }));
  pane.querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('click', (e) => {
    const id = tr.dataset.id;
    if (e.ctrlKey || e.metaKey) app.toggleSelect(id); else { app.select([id]); app.revealId(id); }
  }));
}

// ---------------------------------------------------------------- วิเคราะห์
function renderAnalysis(app) {
  const pane = document.getElementById('analysis-pane');
  const an = app.analysis;
  const nodes = app.graph.entityNodes().filter(n => !app.hidden.has(n.id)).sort((a, b) => String(a.label).localeCompare(String(b.label), 'th'));
  const sel = [...app.selection].filter(id => app.graph.nodes.has(id));
  const opt = (selId) => nodes.map(n => `<option value="${n.id}" ${n.id === selId ? 'selected' : ''}>${esc(n.label)}</option>`).join('');
  let result = '<div class="empty-pane">เลือกการวิเคราะห์ด้านบน ผลจะแสดงเป็นขนาด/สีของโหนดบนผัง และตารางอันดับที่นี่</div>';
  if (an?.scores) {
    const ranked = [...an.scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50);
    const max = ranked[0]?.[1] || 1;
    result = `<div class="analysis-result"><h3>${esc(an.title)} — อันดับสูงสุด</h3>
      <table class="data-table"><thead><tr><th>#</th><th>โหนด</th><th class="num">คะแนน</th><th></th></tr></thead><tbody>
      ${ranked.map(([id, v], i) => { const n = app.graph.getNode(id); return `<tr data-id="${id}" class="${app.selection.has(id) ? 'selected' : ''}"><td class="num">${i + 1}</td><td title="${esc(n?.label)}"><span class="dot" style="background:${n?.color || typeInfo(n?.type).color}"></span>${esc(n?.label)}</td><td class="num">${fmt(v)}</td><td style="width:70px"><span class="bar" style="width:${Math.max(2, 60 * v / max)}px"></span></td></tr>`; }).join('')}
      </tbody></table></div>`;
  } else if (an?.groups) {
    result = `<div class="analysis-result"><h3>${esc(an.title)} — ${an.groups.length} กลุ่ม${an.modularity != null ? ` · modularity ${an.modularity.toFixed(3)}` : ''}</h3>
      <div>${an.groups.map((members, i) => `<span class="community-chip ${members.every(id => app.selection.has(id)) ? 'on' : ''}" data-idx="${i}"><span class="dot" style="background:${paletteColor(i)};margin:0"></span>กลุ่ม ${i} · ${members.length} โหนด</span>`).join('')}</div>
      <div class="muted" style="font-size:11px;margin-top:6px">คลิกกลุ่ม = เลือกสมาชิก · <b>Ctrl/Shift+คลิก</b> = เลือกเพิ่มหลายกลุ่ม (คลิกซ้ำ = เอาออก) · เมนู “จัดผัง › จัดกลุ่มตามชุมชน” เพื่อวางแยกกลุ่ม</div></div>`;
  } else if (an?.path) {
    result = `<div class="analysis-result"><h3>เส้นทางสั้นสุด (${an.path.length - 1} ก้าว)</h3><div class="info-box">${an.path.map(id => esc(app.graph.getNode(id)?.label)).join(' → ')}</div></div>`;
  } else if (an?.error) {
    result = `<div class="info-box" style="color:#b91c1c">${esc(an.error)}</div>`;
  }
  pane.innerHTML = `
    <h3 style="margin:0 0 6px;font-size:13px">ความเป็นศูนย์กลาง (centrality)</h3>
    <div class="btn-row">
      <button class="btn small" data-cmd="analysis:degree">Degree</button>
      <button class="btn small" data-cmd="analysis:weighted">Weighted</button>
      <button class="btn small" data-cmd="analysis:betweenness">Betweenness</button>
      <button class="btn small" data-cmd="analysis:closeness">Closeness</button>
    </div>
    <h3 style="margin:8px 0 6px;font-size:13px">โครงสร้างกลุ่ม</h3>
    <div class="btn-row">
      <button class="btn small" data-cmd="analysis:louvain">ชุมชน (Louvain)</button>
      <button class="btn small" data-cmd="analysis:lpa">ชุมชน (Label prop.)</button>
      <button class="btn small" data-cmd="analysis:components">คอมโพเนนต์</button>
    </div>
    <h3 style="margin:8px 0 6px;font-size:13px">เส้นทางสั้นสุด</h3>
    <div class="field-row">
      <div class="field"><label>จาก</label><select id="sp-from">${opt(sel[0])}</select></div>
      <div class="field"><label>ถึง</label><select id="sp-to">${opt(sel[1] || sel[0])}</select></div>
    </div>
    <div class="row" style="margin-top:0"><label><input type="checkbox" id="sp-weighted"> ถ่วงน้ำหนัก (เส้นหนัก = ใกล้)</label><span class="spacer"></span><button class="btn small primary" id="sp-run">หาเส้นทาง</button></div>
    <div class="row"><button class="btn small" data-cmd="analysis:clear">ล้างผลบนผัง</button><span class="muted" style="font-size:11px">วิเคราะห์เฉพาะโหนดที่แสดงอยู่ (${nodes.length})</span></div>
    ${result}`;
  bindCmds(pane, app);
  pane.querySelector('#sp-run').addEventListener('click', () => {
    app.runShortestPath(pane.querySelector('#sp-from').value, pane.querySelector('#sp-to').value, pane.querySelector('#sp-weighted').checked);
  });
  pane.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => { app.select([tr.dataset.id]); app.revealId(tr.dataset.id); }));
  pane.querySelectorAll('.community-chip').forEach(ch => ch.addEventListener('click', (e) => selectGroup(app, an.groups[Number(ch.dataset.idx)], e)));
}

// ---------------------------------------------------------------- ตำนาน
function renderLegend(app) {
  const pane = document.getElementById('legend-pane');
  const counts = {};
  for (const n of app.graph.nodes.values()) counts[n.type] = (counts[n.type] || 0) + 1;
  const hiddenByType = {};
  for (const id of app.hidden) { const n = app.graph.getNode(id); if (n) hiddenByType[n.type] = (hiddenByType[n.type] || 0) + 1; }
  const items = Object.keys(ENTITY_TYPES).filter(k => counts[k]).map(k => {
    const t = ENTITY_TYPES[k];
    const allHidden = hiddenByType[k] === counts[k];
    return `<div class="legend-item"><span class="icon" style="border-color:${t.color}">${t.icon}</span><span>${t.label}</span><span class="count">${counts[k]}${hiddenByType[k] ? ` (ซ่อน ${hiddenByType[k]})` : ''}</span>
      <button data-sel="${k}" title="เลือกทั้งหมดของประเภทนี้">เลือก</button><button data-hide="${k}" title="ซ่อน/แสดงประเภทนี้">${allHidden ? 'แสดง' : 'ซ่อน'}</button></div>`;
  }).join('');
  const an = app.analysis;
  let comm = '';
  if (an?.groups) {
    comm = `<h3 style="font-size:13px;margin:14px 0 6px">${esc(an.title)}</h3><div class="muted" style="font-size:11px;margin-bottom:4px">คลิก = เลือกกลุ่ม · Ctrl/Shift+คลิก = เลือกเพิ่มหลายกลุ่ม</div>${an.groups.map((m, i) => `<div class="legend-item ${m.every(id => app.selection.has(id)) ? 'on' : ''}" data-comm="${i}" style="cursor:pointer"><span class="dot" style="background:${paletteColor(i)}"></span>กลุ่ม ${i}<span class="count">${m.length}</span></div>`).join('')}`;
  }
  if (an?.scores) {
    comm = `<h3 style="font-size:13px;margin:14px 0 6px">${esc(an.title)}</h3><div class="info-box">โหนดใหญ่/สีแดงเข้ม = คะแนนสูง · ฟ้าอ่อน = คะแนนต่ำ</div>`;
  }
  pane.innerHTML = `<h3 style="font-size:13px;margin:0 0 6px">ประเภทเอนทิตี</h3>${items || '<div class="empty-pane">ยังไม่มีโหนด</div>'}
    <div class="info-box" style="margin-top:10px">ความหนาของเส้น = น้ำหนัก · หัวลูกศร = ทิศทาง · เส้นหลายเส้นระหว่างคู่เดียวกันโค้งแยกกัน</div>${comm}`;
  pane.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', (e) => selectGroup(app, [...app.graph.nodes.values()].filter(n => n.type === b.dataset.sel).map(n => n.id), e)));
  pane.querySelectorAll('[data-hide]').forEach(b => b.addEventListener('click', () => app.toggleHideType(b.dataset.hide)));
  pane.querySelectorAll('[data-comm]').forEach(d => d.addEventListener('click', (e) => selectGroup(app, an.groups[Number(d.dataset.comm)], e)));
}

// ---------------------------------------------------------------- AI dialog
export function openAiDialog(app, { prefill = '' } = {}) {
  const dlg = document.getElementById('dlg-ai');
  const prompt = dlg.querySelector('#ai-prompt');
  dlg.querySelectorAll('input[name="ai-level"]').forEach(r => { r.onchange = () => { app.aiLevel = r.value; prompt.value = app.aiPromptFor(r.value); app.saveOpts(); }; r.checked = r.value === (app.aiLevel || 'detailed'); });
  if (!prompt.dataset.custom) prompt.value = app.aiPromptFor(app.aiLevel || 'detailed');
  prompt.oninput = () => { prompt.dataset.custom = '1'; };
  const selTopic = [...app.selection].find(id => app.graph.getNode(id)?.type === 'topic');
  const expBtn = dlg.querySelector('#ai-expand');
  expBtn.disabled = !selTopic;
  dlg.querySelector('#ai-expand-hint').textContent = selTopic ? `จะขยาย “${app.graph.getNode(selTopic).label}” แล้วต่อใต้หัวข้อนี้` : 'เลือกหัวข้อบนผังก่อน แล้วกดปุ่มนี้';
  expBtn.onclick = () => app.run('ai:expand');
  const res = dlg.querySelector('#ai-result');
  if (prefill) res.value = prefill;
  const sel = [...app.selection].find(id => app.graph.getNode(id)?.type === 'topic');
  const chk = dlg.querySelector('#ai-under');
  chk.disabled = !sel; chk.checked = !!sel;
  dlg.querySelector('#ai-under-label').textContent = sel ? `ต่อใต้หัวข้อ “${app.graph.getNode(sel).label}”` : 'ต่อใต้หัวข้อที่เลือก (ยังไม่ได้เลือก → สร้างเป็นผังใหม่/ต้นใหม่)';
  dlg.querySelectorAll('[data-cmd]').forEach(b => { b.onclick = () => app.run(b.dataset.cmd); });
  dlg.querySelector('#ai-copy-only').onclick = () => app.copyAiPrompt();
  dlg.querySelector('#ai-pick-file').onclick = () => { const f = document.getElementById('file-ai'); f.value = ''; f.click(); };
  dlg.querySelector('#ai-cancel').onclick = () => dlg.close();
  dlg.querySelector('#ai-import').onclick = () => { const t = res.value; if (!t.trim()) { app.toast('ยังไม่ได้วางคำตอบของเอไอ', true); return; } if (app.importAiText(t, { underSelected: chk.checked })) { res.value = ''; dlg.close(); } };
  dlg.showModal();
}

// ---------------------------------------------------------------- Outline dialog
export function openOutlineDialog(app) {
  const dlg = document.getElementById('dlg-outline');
  const txt = dlg.querySelector('#outline-text');
  txt.value = '';
  const sel = [...app.selection].find(id => app.graph.getNode(id)?.type === 'topic');
  const chk = dlg.querySelector('#outline-under');
  chk.disabled = !sel; chk.checked = !!sel;
  dlg.querySelector('#outline-under-label').textContent = sel ? `ต่อใต้หัวข้อ “${app.graph.getNode(sel).label}”` : 'ต่อใต้หัวข้อที่เลือก (ยังไม่ได้เลือก)';
  dlg.querySelector('#outline-cancel').onclick = () => dlg.close();
  dlg.querySelector('#outline-import').onclick = () => { const t = txt.value; if (!t.trim()) { app.toast('ยังไม่มีข้อความ', true); return; } dlg.close(); app.importOutlineText(t, { underSelected: chk.checked }); };
  dlg.showModal(); txt.focus();
}

const MARKS = ['', '⭐', '❗', '✅', '❓', '💡', '🔥', '📌', '⚠️', '🎯', '1️⃣', '2️⃣', '3️⃣'];

// ---------------------------------------------------------------- CSV dialog
export function openCsvDialog(app) {
  const dlg = document.getElementById('dlg-csv');
  const txt = dlg.querySelector('#csv-text');
  const preview = dlg.querySelector('#csv-preview');
  const fileInput = document.getElementById('file-csv');
  const nameEl = dlg.querySelector('#csv-filename');
  txt.value = ''; preview.innerHTML = ''; nameEl.textContent = '';
  const updatePreview = () => {
    const text = txt.value;
    if (!text.trim()) { preview.innerHTML = ''; return; }
    try {
      const rows = parseCSV(text);
      const { headers } = rowsToObjects(rows);
      const mode = dlg.querySelector('#csv-mode').value;
      const kind = mode === 'auto' ? detectKind(headers) : mode;
      const kindName = { nodes: 'รายการโหนด', links: 'รายการเส้น / ตารางความสัมพันธ์', unknown: 'ไม่รู้จัก — ต้องมีคอลัมน์ ชื่อ/label หรือ from,to' }[kind];
      preview.innerHTML = `<div class="kind">ตรวจพบ: <b>${kindName}</b> · ${rows.length - 1} แถว</div><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1, 6).map(r => `<tr>${headers.map((_, i) => `<td>${esc(r[i])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    } catch (err) { preview.innerHTML = `<div style="color:#b91c1c">${esc(err.message)}</div>`; }
  };
  txt.oninput = updatePreview;
  dlg.querySelector('#csv-mode').onchange = updatePreview;
  dlg.querySelector('#csv-pick').onclick = () => { fileInput.value = ''; fileInput.click(); };
  fileInput.onchange = async () => {
    const f = fileInput.files[0]; if (!f) return;
    nameEl.textContent = f.name;
    txt.value = await readTextSmart(f);
    updatePreview();
  };
  dlg.querySelector('#csv-cancel').onclick = () => dlg.close();
  dlg.querySelector('#csv-import').onclick = () => {
    const text = txt.value;
    if (!text.trim()) { app.toast('ยังไม่มีข้อมูล CSV', true); return; }
    const mode = dlg.querySelector('#csv-mode').value;
    let res;
    const before = new Set(app.graph.nodes.keys());
    try {
      app.mutate(g => { res = importCSV(g, text, { mode, defaultType: 'topic' }); });
    } catch (err) { app.toast('นำเข้าไม่สำเร็จ: ' + err.message, true); return; }
    if (res.kind === 'unknown') { app.toast(res.warnings[0] || 'ไม่รู้จักรูปแบบ', true); return; }
    const newIds = [...app.graph.nodes.keys()].filter(id => !before.has(id));
    if (dlg.querySelector('#csv-layout-after').checked && newIds.length) { if (app.opts.autoArrange) { app.history.push(app.graph); app.arrangeMindmap(); } else app.layoutNewNodes(newIds); }
    dlg.close();
    app.toast(`นำเข้าแล้ว: โหนดใหม่ ${res.nodesAdded} · อัปเดต ${res.nodesUpdated} · เส้น ${res.linksAdded}${res.warnings.length ? ` · คำเตือน ${res.warnings.length}` : ''}`);
    if (res.warnings.length) console.warn('CSV warnings', res.warnings);
  };
  dlg.showModal();
}

/** อ่านไฟล์เป็นข้อความ: ลอง UTF-8 ก่อน ถ้ามีอักขระเพี้ยนมากให้ลอง windows-874 (ไทย) */
async function readTextSmart(file) {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  const bad = (utf8.match(/\uFFFD/g) || []).length;
  if (bad > 0) {
    try { return new TextDecoder('windows-874').decode(buf); } catch { /* ไม่รองรับ */ }
  }
  return utf8;
}
