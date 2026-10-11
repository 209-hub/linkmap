// ตัวประสานหลักของ LinkMap: สถานะ คำสั่ง คีย์ลัด เมนู autosave
import { Graph, History } from './graph.js';
import { Renderer, NOTE_DEFAULT, GROUP_DEFAULT, nodeBox, linkGeometry } from './render.js';
import { ENTITY_TYPES, TYPE_ORDER, typeInfo, paletteColor, heatColor, THEMES, setTheme, getTheme } from './types.js';
import { runLayout, buildTree } from './layout.js';
import * as A from './analysis.js';
import { sampleGraph } from './sample.js';
import { exportNodesCSV, exportLinksCSV } from './csv.js';
import { exportImage, exportPDF, exportSVG, downloadText, safeFilename } from './export.js';
import { IMAGE_MAX_W } from './render.js';
import { initPanels, refreshPanels, openCsvDialog, openOutlineDialog, openAiDialog, showTab } from './ui.js';
import { toOutline, importOutline, importTree, extractJSON, AI_PROMPT, AI_PROMPTS, buildExpandPrompt } from './outline.js';
import { APP_VERSION } from './version.js';

const STORAGE_KEY = 'linkmap.doc.v1';
const $ = (s) => document.querySelector(s);

const app = {
  graph: new Graph(),
  history: new History(100),
  selection: new Set(),
  hidden: new Set(),
  view: { x: 0, y: 0, k: 1 },
  tool: 'select',
  newType: 'topic',
  opts: { linkLabels: true, grid: true, snap: false, autoArrange: true, panel: false },
  visual: {},
  analysis: null,
  spaceDown: false,
  renderer: null,
  collapsedHidden: new Set(),
  tree: { roots: [], children: new Map(), parent: new Map() },
};
app.isHidden = (id) => app.hidden.has(id) || app.collapsedHidden.has(id);
app.isDescendant = (id, ancestorId) => { // id อยู่ใต้ ancestorId หรือไม่
  let cur = app.tree.parent.get(id);
  while (cur) { if (cur === ancestorId) return true; cur = app.tree.parent.get(cur); }
  return false;
};
app.descendantCount = (id) => { let c = 0; const st = [...(app.tree.children.get(id) || [])]; while (st.length) { const x = st.pop(); c++; st.push(...(app.tree.children.get(x) || [])); } return c; };
app.descendants = (id) => { const out = []; const st = [...(app.tree.children.get(id) || [])]; while (st.length) { const x = st.pop(); out.push(x); st.push(...(app.tree.children.get(x) || [])); } return out; };
window.linkmap = app; // สำหรับดีบัก

// ---------------------------------------------------------------- สถานะ/การเปลี่ยนแปลง
app.mutate = (fn) => {
  app.history.push(app.graph);
  fn(app.graph);
  app.changed();
};
app.changed = ({ structural = true } = {}) => {
  // ตัดการเลือกที่หายไป
  for (const id of [...app.selection]) if (!app.graph.nodes.has(id) && !app.graph.links.has(id)) app.selection.delete(id);
  for (const id of [...app.hidden]) if (!app.graph.nodes.has(id)) app.hidden.delete(id);
  if (structural) { app.computeTree(); if (app.analysis?.recompute) app.analysis.recompute(); }
  app.renderer.render();
  refreshPanels(app);
  updateStatus();
  scheduleAutosave();
  $('#empty-hint').classList.toggle('hidden', app.graph.nodes.size > 0);
};
/** คำนวณระดับชั้น (level) และสีกิ่งของหัวข้อแบบมายแมป */
app.computeTree = () => {
  const nodes = app.graph.entityNodes();
  const links = [...app.graph.links.values()];
  const { roots, children, parent } = buildTree(nodes, links);
  app.tree = { roots, children, parent };
  app.collapsedHidden = new Set();
  for (const n of nodes) if (n.collapsed) for (const d of app.descendants(n.id)) app.collapsedHidden.add(d);
  for (const r of roots) {
    const rn = app.graph.getNode(r); rn.level = 0; rn.branchColor = null;
    children.get(r).forEach((c, i) => {
      const stack = [[c, 1, paletteColor(i)]];
      while (stack.length) {
        const [id, lv, col] = stack.pop();
        const n = app.graph.getNode(id); n.level = lv; n.branchColor = col;
        for (const k of children.get(id)) stack.push([k, lv + 1, col]);
      }
    });
  }
};
app.select = (ids, { add = false, silentPanels = false } = {}) => {
  if (!add) app.selection.clear();
  for (const id of ids) app.selection.add(id);
  app.renderer.render();
  if (!silentPanels) refreshPanels(app);
  updateStatus();
};
app.toggleSelect = (id) => { if (app.selection.has(id)) app.selection.delete(id); else app.selection.add(id); app.renderer.render(); refreshPanels(app); updateStatus(); };
app.setHint = (t) => { $('#status-hint').textContent = t; };
app.toast = (msg, isError = false) => {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('error', isError); t.classList.remove('hidden');
  clearTimeout(app._toastTimer); app._toastTimer = setTimeout(() => t.classList.add('hidden'), isError ? 5000 : 3000);
};
/** กล่องยืนยันของแอปเอง (window.confirm ถูกบล็อกในหน้า Artifact/iframe) */
app.confirm = (message, { ok = 'ตกลง', cancel = 'ยกเลิก' } = {}) => new Promise((resolve) => {
  const dlg = $('#dlg-confirm');
  dlg.querySelector('#confirm-msg').textContent = message;
  const okBtn = dlg.querySelector('#confirm-ok'), cBtn = dlg.querySelector('#confirm-cancel');
  okBtn.textContent = ok; cBtn.textContent = cancel;
  const done = (v) => { dlg.close(); resolve(v); };
  okBtn.onclick = () => done(true); cBtn.onclick = () => done(false);
  dlg.oncancel = (e) => { e.preventDefault(); done(false); };
  dlg.showModal(); okBtn.focus();
});
const saved = (r, what) => { if (r === 'declined') app.toast('ยกเลิกการบันทึก'); else app.toast(`${what}แล้ว${r === 'browser' ? ' (ดูในโฟลเดอร์ดาวน์โหลด)' : ''}`); };
const OPTS_KEY = 'linkmap.opts.v1';
app.saveOpts = () => { try { localStorage.setItem(OPTS_KEY, JSON.stringify({ ...app.opts, aiLevel: app.aiLevel })); } catch { /* ignore */ } };
app.loadOpts = () => { try { const o = JSON.parse(localStorage.getItem(OPTS_KEY) || '{}'); if (o.aiLevel) app.aiLevel = o.aiLevel; delete o.aiLevel; Object.assign(app.opts, o); } catch { /* ignore */ } };
app.setAutoArrange = (on) => {
  app.opts.autoArrange = !!on; app.saveOpts();
  const cb1 = $('#opt-auto-arrange'), cb2 = $('#tb-auto-arrange');
  if (cb1) cb1.checked = app.opts.autoArrange;
  if (cb2) { cb2.checked = app.opts.autoArrange; cb2.closest('.tool-check').classList.toggle('on', app.opts.autoArrange); }
};
app.setPanel = (show) => {
  app.opts.panel = !!show; app.saveOpts();
  $('#workspace').classList.toggle('panel-hidden', !app.opts.panel);
  $('#btn-panel')?.classList.toggle('on', app.opts.panel);
  $('#tb-panel')?.classList.toggle('active', app.opts.panel);
  if (app.opts.panel) refreshPanels(app);
  app.renderer?.applyView();
};
/** หาตำแหน่งว่างสำหรับหัวข้อใหม่ข้างพ่อ (ใช้เมื่อปิดจัดผังอัตโนมัติ) ไม่ขยับโหนดอื่น */
app.freeSpotNear = (parent, relation, sel) => {
  const g = app.graph;
  const pbox = nodeBox(parent) || { w: 60, h: 44 };
  const gp = app.tree.parent.get(parent.id);
  const gpn = gp ? g.getNode(gp) : null;
  const side = gpn ? (Math.sign(parent.x - gpn.x) || 1) : 1;
  const kids = (app.tree.children.get(parent.id) || []).map(id => g.getNode(id)).filter(Boolean);
  let x, y;
  if (relation === 'sibling' && sel && sel.id !== parent.id) { x = sel.x; y = sel.y + (nodeBox(sel)?.h || 40) + 26; }
  else if (kids.length) { const last = kids.reduce((m, k) => (k.y > m.y ? k : m), kids[0]); x = last.x; y = last.y + (nodeBox(last)?.h || 40) + 26; }
  else { x = parent.x + side * (pbox.w / 2 + 120); y = parent.y; }
  // เลื่อนลงจนกว่าจะไม่ทับโหนดอื่น
  const overlaps = (px, py) => [...g.nodes.values()].some(n => { if (n.type === 'group') return false; const b = nodeBox(n) || { w: 60, h: 50 }; return Math.abs(n.x - px) < (b.w / 2 + 70) && Math.abs(n.y - py) < (b.h / 2 + 22); });
  // ลองที่เดิม → ขยับออกด้านนอก 1 ช่วง → แล้วค่อยเลื่อนลงทีละแถว (ให้เส้นไม่ลากข้ามกิ่งอื่น)
  const x0 = x;
  for (let i = 0; i < 40; i++) {
    if (!overlaps(x0, y)) { x = x0; break; }
    if (!overlaps(x0 + side * 180, y)) { x = x0 + side * 180; break; }
    y += 44;
  }
  return { x: Math.round(x), y: Math.round(y) };
};
app.setTool = (tool) => {
  app.tool = tool;
  document.querySelectorAll('#toolbar .tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  const svg = $('#canvas');
  svg.className.baseVal = `tool-${tool}`;
  app.renderer.linkSource = null;
  const hints = { select: '', pan: 'ลากเพื่อเลื่อนผืนผ้าใบ', node: 'คลิกบนพื้นว่างเพื่อสร้างโหนด', link: 'คลิกโหนดต้นทาง แล้วคลิกโหนดปลายทาง (หรือลากจากโหนดไปโหนด)', note: 'คลิกเพื่อวางโน้ต', group: 'ลากเพื่อวาดกรอบจัดกลุ่ม' };
  app.setHint(hints[tool] || '');
};
app.revealId = (id) => {
  const n = app.graph.getNode(id);
  if (n) { if (app.hidden.has(id)) { app.hidden.delete(id); app.renderer.render(); } app.renderer.centerOn(id); return; }
  const l = app.graph.getLink(id);
  if (l) { const a = app.graph.getNode(l.from), b = app.graph.getNode(l.to); app.hidden.delete(a.id); app.hidden.delete(b.id); app.renderer.render(); app.renderer.centerOn(a.id); }
};

// ---------------------------------------------------------------- สร้างสิ่งต่าง ๆ
app.createNodeAt = (x, y, type = app.newType) => {
  let node;
  app.mutate(g => { node = g.addNode({ label: type === 'topic' ? 'หัวข้อใหม่' : typeInfo(type).label + 'ใหม่', type, x, y }); });
  app.select([node.id]);
  app.editInline(node.id, true);
};
/** โหมดจดเรียน: เพิ่มหัวข้อย่อย (child) หรือหัวข้อพี่น้อง (sibling) ของโหนดที่เลือก แล้วจัดผังอัตโนมัติ */
app.addTopic = (relation = 'child') => {
  const selId = [...app.selection].find(id => app.graph.nodes.has(id));
  const sel = selId ? app.graph.getNode(selId) : null;
  if (!sel) { const c = centerWorld(); app.createNodeAt(c.x, c.y, 'topic'); return; } // ไม่มีอะไรเลือก → สร้างหัวข้อหลักใหม่
  let parentId = sel.id;
  if (relation === 'sibling') {
    const incoming = app.graph.linksOf(sel.id).find(l => l.to === sel.id) || app.graph.linksOf(sel.id).find(l => l.from !== sel.id);
    const p = incoming ? (incoming.to === sel.id ? incoming.from : incoming.to) : null;
    if (p) parentId = p; // รากไม่มีพี่น้อง → ทำเป็นลูกแทน
  }
  const parent = app.graph.getNode(parentId);
  const type = sel.type === 'topic' || sel.type === 'note' || sel.type === 'group' ? 'topic' : app.newType;
  const spot = app.opts.autoArrange ? { x: parent.x + 160, y: parent.y + 40 } : app.freeSpotNear(parent, relation, sel);
  let node;
  app.mutate(g => {
    node = g.addNode({ label: '', type, x: spot.x, y: spot.y });
    g.addLink({ from: parent.id, to: node.id, label: '', directed: false });
  });
  if (app.opts.autoArrange) app.arrangeMindmap({ keepView: true });
  app.select([node.id]);
  app.revealIfOffscreen(node.id);
  app.editInline(node.id, true);
};
/**
 * จัดผังแบบต้นไม้ (มายแมป/ผังองค์กร) ทั้งผังหรือเฉพาะชุดโหนด (ids)
 * รักษาตำแหน่งรากของชุดไว้ ผังจึงไม่กระโดด
 */
app.arrangeMindmap = ({ keepView = false, ids = null, algo = 'mindmap', direction = 'TB' } = {}) => {
  app.computeTree();
  let nodes = app.graph.entityNodes().filter(n => !app.isHidden(n.id));
  const subset = ids && ids.size >= 2;
  if (subset) nodes = nodes.filter(n => ids.has(n.id));
  if (!nodes.length) return;
  const inSet = new Set(nodes.map(n => n.id));
  // รากของชุด = โหนดที่พ่อไม่อยู่ในชุด (ถ้าเลือกรากจริงอยู่ให้ใช้ตัวนั้น)
  const roots = app.tree?.roots || [];
  const selRoot = [...app.selection].find(id => roots.includes(id) && inSet.has(id));
  const subRoots = nodes.filter(n => !inSet.has(app.tree.parent.get(n.id))).map(n => n.id);
  const rootId = selRoot || subRoots[0] || roots[0] || null;
  const links = [...app.graph.links.values()].filter(l => inSet.has(l.from) && inSet.has(l.to));
  const pos = runLayout(algo, nodes, links, { rootId, direction, sizeFn: (n) => nodeBox(n) || { w: 60, h: 44 } });
  const r0 = rootId ? app.graph.getNode(rootId) : null;
  const p0 = r0 ? pos.get(r0.id) : null;
  const dx = r0 && p0 ? r0.x - p0.x : 0, dy = r0 && p0 ? r0.y - p0.y : 0;
  for (const [id, p] of pos) app.graph.updateNode(id, { x: Math.round(p.x + dx), y: Math.round(p.y + dy) });
  app.renderer.render();
  scheduleAutosave();
  if (!keepView && !subset) app.renderer.fit();
};
app.revealIfOffscreen = (id) => app.renderer.ensureVisible(id, 100);
app.createNote = (x, y) => {
  let node;
  app.mutate(g => { node = g.addNode({ label: 'โน้ต…', type: 'note', x, y, w: NOTE_DEFAULT.w, h: NOTE_DEFAULT.h }); });
  app.select([node.id]);
  app.editInline(node.id, true);
};
app.createGroup = (x, y, w = GROUP_DEFAULT.w, h = GROUP_DEFAULT.h) => {
  let node;
  app.mutate(g => { node = g.addNode({ label: 'กลุ่ม', type: 'group', x, y, w, h }); });
  app.select([node.id]);
  app.editInline(node.id, true);
};
app.createGroupAroundSelection = () => {
  const ids = [...app.selection].filter(id => app.graph.nodes.has(id));
  if (ids.length < 1) { app.setTool('group'); app.toast('ลากบนผืนผ้าใบเพื่อวาดกรอบ หรือเลือกโหนดก่อนแล้วกด G'); return; }
  const b = app.renderer.contentBounds(new Set(ids));
  app.createGroup(b.minX + b.w / 2, b.minY + b.h / 2 + 10, b.w + 60, b.h + 80);
};
app.createLink = (from, to) => {
  let link;
  app.mutate(g => { link = g.addLink({ from, to, label: '' }); });
  app.select([link.id]);
  app.editInline(link.id, true);
};

// ---------------------------------------------------------------- ฟังก์ชันมายแมป: ยุบ/ขยาย ย้ายกิ่ง เรียงลำดับ เดินด้วยลูกศร
app.toggleCollapse = (id) => {
  const n = app.graph.getNode(id); if (!n) return;
  if (!n.collapsed && !(app.tree.children.get(id) || []).length) return;
  app.mutate(g => g.updateNode(id, { collapsed: !n.collapsed }));
  for (const d of app.descendants(id)) app.selection.delete(d);
  if (app.opts.autoArrange) app.arrangeMindmap({ keepView: true });
  app.select([id]);
};
app.reparent = (id, newParentId) => {
  if (!id || !newParentId || id === newParentId || app.isDescendant(newParentId, id)) return;
  const g = app.graph;
  for (const l of g.linksOf(id)) if (l.to === id || (l.from === id && l.to === app.tree.parent.get(id))) g.removeLink(l.id);
  g.addLink({ from: newParentId, to: id, label: '', directed: false });
  g.updateNode(id, { order: null });
  app.changed();
  if (app.opts.autoArrange) app.arrangeMindmap({ keepView: true });
  app.select([id]);
  app.toast(`ย้ายกิ่ง “${g.getNode(id).label}” ไปใต้ “${g.getNode(newParentId).label}” แล้ว`);
};
app.moveSibling = (id, delta) => {
  const p = app.tree.parent.get(id); if (!p) return;
  const sibs = [...app.tree.children.get(p)];
  const i = sibs.indexOf(id); const j = i + delta;
  if (i < 0 || j < 0 || j >= sibs.length) return;
  [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
  app.mutate(g => sibs.forEach((sid, k) => g.updateNode(sid, { order: k })));
  if (app.opts.autoArrange) app.arrangeMindmap({ keepView: true });
  app.select([id]);
};
app.deleteBranch = (ids) => {
  const all = new Set();
  for (const id of ids) { all.add(id); for (const d of app.descendants(id)) all.add(d); }
  app.mutate(g => { for (const id of all) g.removeNode(id); });
  if (app.opts.autoArrange) app.arrangeMindmap({ keepView: true });
  app.toast(`ลบ ${all.size} หัวข้อ`);
};
app.deleteNodeKeepChildren = (id) => {
  const p = app.tree.parent.get(id); const kids = app.tree.children.get(id) || [];
  app.mutate(g => {
    if (p) for (const k of kids) g.addLink({ from: p, to: k, label: '', directed: false });
    g.removeNode(id);
  });
  if (app.opts.autoArrange) app.arrangeMindmap({ keepView: true });
  if (p) app.select([p]);
};
// ---------------------------------------------------------------- ธีม รูปทรง ตัวหนา รูปภาพ แทรกตำแหน่งด้วยการลาก
app.applyTheme = (name) => {
  const t = setTheme(name);
  app.graph.meta.theme = THEMES[name] ? name : 'classic';
  document.body.classList.toggle('dark', !!t.dark);
  document.querySelectorAll('.theme-chip').forEach(c => c.classList.toggle('active', c.dataset.theme === app.graph.meta.theme));
  app.changed({ structural: true });
};
app.setTopicStyle = (patch, { wholeBranch = false } = {}) => {
  let ids = [...app.selection].filter(id => app.graph.getNode(id)?.type === 'topic');
  if (!ids.length) { app.toast('เลือกหัวข้อก่อน', true); return; }
  if (wholeBranch) ids = [...new Set(ids.flatMap(id => [id, ...app.descendants(id)]))];
  app.mutate(g => ids.forEach(id => g.updateNode(id, patch)));
  if (app.opts.autoArrange) app.arrangeMindmap({ keepView: true });
};
app.toggleStyle = (key) => {
  const id = [...app.selection].find(i => app.graph.getNode(i)?.type === 'topic'); if (!id) return;
  app.setTopicStyle({ [key]: !app.graph.getNode(id)[key] });
};
/** ย่อรูปแล้วใส่ในหัวข้อที่เลือก (รับ File/Blob) */
app.setImageFromFile = async (file, targetId = null) => {
  const id = targetId || [...app.selection].find(i => app.graph.getNode(i)?.type === 'topic');
  if (!id) { app.toast('เลือกหัวข้อที่จะใส่รูปก่อน', true); return; }
  if (!file || !file.type.startsWith('image/')) { app.toast('ไฟล์ไม่ใช่รูปภาพ', true); return; }
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('อ่านรูปไม่ได้')); im.src = bitmapUrl; });
    const maxW = IMAGE_MAX_W * 2; // เก็บความละเอียด 2 เท่าของที่แสดง
    const s = Math.min(1, maxW / img.naturalWidth);
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const isPhoto = file.type === 'image/jpeg';
    const dataUrl = isPhoto ? c.toDataURL('image/jpeg', 0.85) : c.toDataURL('image/png');
    app.mutate(g => g.updateNode(id, { image: dataUrl, imageW: c.width, imageH: c.height }));
    if (app.opts.autoArrange) app.arrangeMindmap({ keepView: true });
    app.toast('ใส่รูปแล้ว');
  } catch (err) { app.toast(err.message, true); }
  finally { URL.revokeObjectURL(bitmapUrl); }
};
app.removeImage = () => app.setTopicStyle({ image: null, imageW: 0, imageH: 0 });
/** ปล่อยหัวข้อที่ลากใกล้พี่น้อง → แทรกตำแหน่ง/ย้ายไปกิ่งนั้นตามแนวตั้ง (คืน true ถ้าจัดการแล้ว) */
app.dropInsert = (id, pt, snap) => {
  const n = app.graph.getNode(id);
  if (!n || n.type !== 'topic' || !app.opts.autoArrange) return false;
  let nearest = null, best = 150;
  for (const m of app.graph.entityNodes()) {
    if (m.id === id || m.type !== 'topic' || app.isHidden(m.id) || app.isDescendant(m.id, id)) continue;
    const box = nodeBox(m);
    const dx = Math.max(0, Math.abs(pt.x - m.x) - box.w / 2), dy = Math.max(0, Math.abs(pt.y - m.y) - box.h / 2);
    const d = Math.hypot(dx, dy);
    if (d < best) { best = d; nearest = m; }
  }
  if (!nearest) return false;
  const newParent = app.tree.parent.get(nearest.id);
  if (!newParent) return false; // ใกล้รากเฉย ๆ → ไม่ทำอะไร (ปล่อยให้ย้ายตำแหน่งธรรมดา)
  const oldParent = app.tree.parent.get(id);
  const g = app.graph;
  if (oldParent === newParent) {
    // พี่น้องเดิม: ทำเฉพาะเมื่อปล่อยในตำแหน่งที่ทำให้ลำดับเปลี่ยนจริง ไม่งั้นปล่อยให้ย้ายตำแหน่งอิสระ
    const cur = (app.tree.children.get(newParent) || []);
    const others = cur.filter(s => s !== id).map(s => g.getNode(s)).sort((a, b) => a.y - b.y);
    let idx = others.findIndex(s => pt.y < s.y); if (idx < 0) idx = others.length;
    if (idx === cur.indexOf(id)) return false;
    if (best > 40) return false; // ต้องปล่อยใกล้พี่น้องจริง ๆ
  }
  app.history.pushSnapshot(snap);
  if (oldParent !== newParent) {
    for (const l of g.linksOf(id)) if (l.to === id) g.removeLink(l.id);
    g.addLink({ from: newParent, to: id, label: '', directed: false });
  }
  // เรียงพี่น้องตาม y ปัจจุบัน แล้วแทรกตัวที่ลากตาม y ที่ปล่อย
  const sibs = (app.tree.children.get(newParent) || []).filter(s => s !== id).map(s => g.getNode(s)).sort((a, b) => a.y - b.y);
  let idx = sibs.findIndex(s => pt.y < s.y);
  if (idx < 0) idx = sibs.length;
  sibs.splice(idx, 0, n);
  sibs.forEach((s, k) => g.updateNode(s.id, { order: k }));
  app.changed();
  app.arrangeMindmap({ keepView: true });
  app.select([id]);
  app.toast(oldParent !== newParent ? `ย้ายไปใต้ “${g.getNode(newParent).label}” แล้ว` : 'จัดลำดับใหม่แล้ว');
  return true;
};
document.addEventListener('paste', (e) => {
  const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const items = [...(e.clipboardData?.items || [])];
  const imgItem = items.find(i => i.type.startsWith('image/'));
  if (imgItem) { e.preventDefault(); app.setImageFromFile(imgItem.getAsFile()); return; }
  const text = e.clipboardData?.getData('text/plain');
  if (!text) return;
  if (/^\s*(```|\{|\[)/.test(text) && extractJSON(text)) { e.preventDefault(); app.importAiText(text, { underSelected: true }); return; }
  if (text.includes('\n') && /^\s*([-*#]|\d+[.)])\s/m.test(text)) { e.preventDefault(); app.importOutlineText(text, { underSelected: true }); }
});
$('#file-image')?.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) app.setImageFromFile(f); e.target.value = ''; });

app.setMark = (mark) => {
  const ids = [...app.selection].filter(id => app.graph.nodes.has(id));
  if (!ids.length) return;
  app.mutate(g => ids.forEach(id => g.updateNode(id, { mark })));
  if (app.opts.autoArrange) app.arrangeMindmap({ keepView: true });
};
/** เดินในผังด้วยลูกศร: เลือกโหนดข้างเคียง (พ่อ/ลูก/พี่น้อง) ที่อยู่ในทิศนั้นมากที่สุด */
app.navigate = (dir) => {
  const cur = [...app.selection].find(id => app.graph.nodes.has(id));
  if (!cur) { const r = app.tree.roots[0]; if (r) { app.select([r]); app.revealIfOffscreen(r); } return; }
  const n = app.graph.getNode(cur);
  const vec = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
  const cands = new Set(app.tree.children.get(cur) || []);
  const p = app.tree.parent.get(cur); if (p) { cands.add(p); for (const s of app.tree.children.get(p) || []) if (s !== cur) cands.add(s); }
  let best = null, bestScore = -Infinity;
  for (const id of cands) {
    if (app.isHidden(id)) continue;
    const m = app.graph.getNode(id); const dx = m.x - n.x, dy = m.y - n.y; const d = Math.hypot(dx, dy) || 1;
    const cos = (dx * vec[0] + dy * vec[1]) / d;
    if (cos < 0.3) continue;
    const score = cos * 2 - d / 600;
    if (score > bestScore) { bestScore = score; best = id; }
  }
  if (best) { app.select([best]); app.revealIfOffscreen(best); }
};

// ---------------------------------------------------------------- แก้ข้อความในที่
const editor = $('#inline-editor');
app.editInline = (id, isNew = false) => {
  const r = app.renderer;
  const n = app.graph.getNode(id), l = app.graph.getLink(id);
  if (!n && !l) return;
  let pos, text, width;
  if (n) {
    const box = nodeBox(n);
    if (box) { pos = r.worldToLocal(n.x, n.y); width = Math.max(140, box.w * app.view.k); }
    else { pos = r.worldToLocal(n.x, n.y + r.nodeRadius(n) + 14); width = 180; }
    text = n.label;
  } else {
    const a = app.graph.getNode(l.from), b = app.graph.getNode(l.to);
    const geo = linkGeometry(l, a, b, r.nodeRadius(a), r.nodeRadius(b), 0);
    pos = r.worldToLocal(geo.label.x, geo.label.y); text = l.label; width = 160;
  }
  editor.value = text; editor.dataset.id = id; editor.dataset.isNew = isNew ? '1' : '';
  editor.style.width = width + 'px';
  editor.style.left = (pos.x - width / 2) + 'px'; editor.style.top = (pos.y - 14) + 'px';
  editor.placeholder = l ? 'ป้ายกำกับเส้น' : 'ชื่อ';
  editor.classList.remove('hidden');
  const focusIt = () => { if (!editor.classList.contains('hidden')) { editor.focus({ preventScroll: true }); editor.select(); } };
  focusIt(); setTimeout(focusIt, 0); setTimeout(focusIt, 60); // เผื่อเบราว์เซอร์ย้ายโฟกัสหลังคลิก/แตะ
};
app.closeInlineEditor = (commit, { reason = 'commit' } = {}) => {
  if (editor.classList.contains('hidden')) return;
  const id = editor.dataset.id; const val = editor.value;
  editor.classList.add('hidden');
  if (!commit) return;
  const n = app.graph.getNode(id), l = app.graph.getLink(id);
  const isNew = editor.dataset.isNew === '1';
  if (n && isNew && !val.trim() && n.type === 'topic') {
    // หัวข้อใหม่ที่ยังว่าง: ถ้าผู้ใช้กด Enter/Esc เอง → เอาออก; ถ้าโฟกัสหลุดเอง (แตะที่อื่น/เบราว์เซอร์ย้ายโฟกัส) → ใส่ชื่อเริ่มต้นไว้ก่อน
    if (reason === 'blur') { app.mutate(g => g.updateNode(id, { label: 'หัวข้อใหม่' })); return; }
    app.mutate(g => g.removeNode(id)); return;
  }
  if (n && n.label !== val && (val.trim() || n.type === 'note')) app.mutate(g => g.updateNode(id, { label: val }));
  else if (l && l.label !== val) app.mutate(g => g.updateLink(id, { label: val }));
};
editor.addEventListener('keydown', (e) => {
  e.stopPropagation();
  const id = editor.dataset.id; const n = app.graph.getNode(id);
  if (e.key === 'Tab') {
    e.preventDefault();
    if (!editor.value.trim()) return;
    app.closeInlineEditor(true);
    if (n && app.graph.nodes.has(id)) { app.select([id]); app.addTopic('child'); } else $('#canvas').focus();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const wasNew = editor.dataset.isNew === '1';
    const empty = !editor.value.trim();
    app.closeInlineEditor(true);
    // โหมดจดเรียน: Enter หลังพิมพ์หัวข้อใหม่ = ต่อหัวข้อพี่น้องทันที, Enter บนหัวข้อว่าง = หยุด
    if (n && n.type === 'topic' && wasNew && !empty && app.graph.nodes.has(id) && app.opts.autoArrange) { app.select([id]); app.addTopic('sibling'); return; }
    $('#canvas').focus();
  }
  if (e.key === 'Escape') { app.closeInlineEditor(false); $('#canvas').focus(); }
});
editor.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== editor) app.closeInlineEditor(true, { reason: 'blur' }); }, 0));

// ---------------------------------------------------------------- เมนูคลิกขวา
const cmenu = $('#context-menu');
app.showContextMenu = (sx, sy, hit) => {
  const items = [];
  const selNodes = [...app.selection].filter(id => app.graph.nodes.has(id));
  if (hit?.kind === 'node') {
    const n = app.graph.getNode(hit.id);
    items.push({ title: n.label });
    items.push({ label: '✎ แก้ชื่อ/ข้อความ', cmd: () => app.editInline(hit.id) });
    if (n.type !== 'group' && n.type !== 'note') {
      items.push({ label: '⟶ เริ่มเส้นเชื่อมจากโหนดนี้', cmd: () => { app.setTool('link'); app.renderer.linkSource = hit.id; app.setHint('คลิกโหนดปลายทาง'); } });
      items.push({ label: '⊕ ขยายเพื่อนบ้าน', cmd: () => app.run('expand') });
      items.push({ label: '◎ ซ่อนที่ไม่เกี่ยว', cmd: () => app.run('focus') });
      items.push({ sep: true });
      items.push({ label: 'ประเภท ▸', sub: TYPE_ORDER.map(t => ({ label: `${ENTITY_TYPES[t].icon} ${ENTITY_TYPES[t].label}`, cmd: () => app.mutate(g => selNodes.forEach(id => { const x = g.getNode(id); if (x.type !== 'group' && x.type !== 'note') g.updateNode(id, { type: t }); })) })) });
    }
    if (selNodes.length >= 2) items.push({ label: '▢ สร้างกรอบรอบที่เลือก', cmd: () => app.createGroupAroundSelection() });
    if (selNodes.length === 2) items.push({ label: '⇝ เส้นทางสั้นสุดระหว่าง 2 โหนด', cmd: () => app.run('analysis:path') });
    if (selNodes.length >= 2) items.push({ label: '⌗ จัดผังเฉพาะที่เลือก (force)', cmd: () => app.applyLayout('force', { onlySelected: true }) });
    items.push({ label: '⧉ ทำสำเนา', cmd: () => app.run('duplicate') });
    items.push({ label: '◌ ซ่อน', cmd: () => app.run('hide-selected') });
    items.push({ sep: true });
    items.push({ label: '🗑 ลบ', cmd: () => app.run('delete'), danger: true });
  } else if (hit?.kind === 'link') {
    const l = app.graph.getLink(hit.id);
    items.push({ title: l.label || '(เส้นไม่มีป้าย)' });
    items.push({ label: '✎ แก้ป้ายกำกับ', cmd: () => app.editInline(hit.id) });
    items.push({ label: l.directed ? '— เปลี่ยนเป็นไม่มีทิศทาง' : '→ เปลี่ยนเป็นมีทิศทาง', cmd: () => app.mutate(g => g.updateLink(hit.id, { directed: !l.directed })) });
    items.push({ label: '⇄ สลับทิศ', cmd: () => app.mutate(g => g.updateLink(hit.id, { from: l.to, to: l.from })) });
    items.push({ sep: true });
    items.push({ label: '🗑 ลบเส้น', cmd: () => app.run('delete'), danger: true });
  } else {
    const w = app.renderer.screenToWorld(sx, sy);
    items.push({ label: '● สร้างโหนดที่นี่', cmd: () => app.createNodeAt(w.x, w.y) });
    items.push({ label: '🗒 วางโน้ตที่นี่', cmd: () => app.createNote(w.x, w.y) });
    items.push({ label: '▢ วางกรอบที่นี่', cmd: () => app.createGroup(w.x, w.y) });
    items.push({ sep: true });
    items.push({ label: '⤢ ฟิตให้พอดีจอ', cmd: () => app.renderer.fit() });
    items.push({ label: '👁 แสดงทั้งหมด', cmd: () => app.run('show-all') });
    if (app.history.canUndo()) items.push({ label: '↶ เลิกทำ', cmd: () => app.run('undo') });
  }
  cmenu.innerHTML = '';
  for (const it of items) {
    if (it.title) { const d = document.createElement('div'); d.className = 'cm-title'; d.textContent = it.title; cmenu.appendChild(d); continue; }
    if (it.sep) { cmenu.appendChild(document.createElement('hr')); continue; }
    if (it.sub) {
      const d = document.createElement('div'); d.className = 'cm-title'; d.textContent = it.label.replace(' ▸', ''); cmenu.appendChild(d);
      const wrap = document.createElement('div'); wrap.style.display = 'grid'; wrap.style.gridTemplateColumns = '1fr 1fr';
      for (const s of it.sub) { const b = document.createElement('button'); b.textContent = s.label; b.style.padding = '4px 8px'; b.addEventListener('click', () => { app.hideContextMenu(); s.cmd(); }); wrap.appendChild(b); }
      cmenu.appendChild(wrap); continue;
    }
    const b = document.createElement('button'); b.textContent = it.label; if (it.danger) b.classList.add('danger');
    b.addEventListener('click', () => { app.hideContextMenu(); it.cmd(); });
    cmenu.appendChild(b);
  }
  const wrapRect = $('#canvas-wrap').getBoundingClientRect();
  cmenu.classList.remove('hidden');
  const mw = cmenu.offsetWidth, mh = cmenu.offsetHeight;
  cmenu.style.left = Math.min(sx - wrapRect.left, wrapRect.width - mw - 4) + 'px';
  cmenu.style.top = Math.min(sy - wrapRect.top, wrapRect.height - mh - 4) + 'px';
};
app.hideContextMenu = () => cmenu.classList.add('hidden');
document.addEventListener('pointerdown', (e) => { if (!cmenu.contains(e.target)) app.hideContextMenu(); });

// ---------------------------------------------------------------- เลย์เอาต์
function layoutTargets(onlySelected) {
  const all = app.graph.entityNodes().filter(n => !app.isHidden(n.id));
  if (onlySelected) {
    const sel = all.filter(n => app.selection.has(n.id));
    if (sel.length >= 2) return { nodes: sel, subset: true };
  }
  return { nodes: all, subset: false };
}
app.applyLayout = (name, { onlySelected = null, ...opts } = {}) => {
  // เลือกโหนดไว้ตั้งแต่ 2 ตัวขึ้นไป = จัดเฉพาะที่เลือก (ที่เหลืออยู่กับที่)
  const selCount = [...app.selection].filter(id => app.graph.nodes.has(id)).length;
  if (onlySelected == null) onlySelected = selCount >= 2;
  const { nodes, subset } = layoutTargets(onlySelected);
  if (!nodes.length) { app.toast('ไม่มีโหนดให้จัด', true); return; }
  let algo = name, extra = {};
  if (name === 'mindmap' || name === 'orgchart' || name === 'orgchart-lr') {
    app.history.push(app.graph);
    app.arrangeMindmap({ ids: subset ? new Set(nodes.map(n => n.id)) : null, algo: name === 'mindmap' ? 'mindmap' : 'orgchart', direction: name === 'orgchart-lr' ? 'LR' : 'TB', keepView: subset });
    app.changed({ structural: false });
    if (subset) app.renderer.fit(new Set(nodes.map(n => n.id)), 140);
    const nm = { mindmap: 'มายแมป', orgchart: 'ผังองค์กร บน→ล่าง', 'orgchart-lr': 'ผังองค์กร ซ้าย→ขวา' }[name];
    app.toast(`จัดผังแบบ${nm}${subset ? ' เฉพาะที่เลือก' : ''} — ${nodes.length} หัวข้อ`);
    return;
  }
  if (name === 'hierarchical-lr') { algo = 'hierarchical'; extra.direction = 'LR'; }
  if (name === 'grouped') extra.keyFn = (n) => n.type;
  if (name === 'grouped-community') {
    algo = 'grouped';
    let membership = app.analysis?.membership;
    if (!membership) { membership = A.louvainCommunities(app.graph.adjacency({ ids: nodes.map(n => n.id) })).membership; }
    extra.keyFn = (n) => membership.get(n.id) ?? 'x';
  }
  if (name === 'force') extra.randomizeZero = true;
  const links = [...app.graph.links.values()];
  let pos;
  try { pos = runLayout(algo, nodes, links, { ...extra, ...opts }); }
  catch (err) { app.toast('จัดผังไม่สำเร็จ: ' + err.message, true); return; }
  app.mutate(g => { for (const [id, p] of pos) g.updateNode(id, { x: Math.round(p.x), y: Math.round(p.y) }); });
  if (!subset) app.renderer.fit(); else app.renderer.fit(new Set(nodes.map(n => n.id)), 120);
  const names = { mindmap: 'มายแมป', orgchart: 'ผังองค์กร', force: 'กระจายแรง', hierarchical: 'ลำดับชั้น', 'hierarchical-lr': 'ลำดับชั้น ซ้าย→ขวา', circular: 'วงกลม', grouped: 'จัดกลุ่มตามประเภท', 'grouped-community': 'จัดกลุ่มตามชุมชน', timeline: 'ไทม์ไลน์', grid: 'ตาราง' };
  app.toast(`จัดผังแบบ${names[name] || name}${subset ? ' (เฉพาะที่เลือก)' : ''} — ${nodes.length} โหนด`);
};
/** วางโหนดที่นำเข้ามาใหม่ (อยู่ที่ 0,0) ด้วย force โดยไม่ขยับของเดิมมาก */
app.layoutNewNodes = (newIds) => {
  const all = app.graph.entityNodes();
  const links = [...app.graph.links.values()];
  const hasOld = all.some(n => !newIds.includes(n.id));
  const pos = runLayout('force', all, links, { randomizeZero: true, iterations: hasOld ? 150 : 300 });
  const set = new Set(newIds);
  app.history.push(app.graph);
  for (const [id, p] of pos) if (set.has(id) || !hasOld) app.graph.updateNode(id, { x: Math.round(p.x), y: Math.round(p.y) });
  app.changed();
  app.renderer.fit();
};

// ---------------------------------------------------------------- วิเคราะห์
function visibleAdj() {
  const ids = app.graph.entityNodes().filter(n => !app.isHidden(n.id)).map(n => n.id);
  return app.graph.adjacency({ ids });
}
app.clearAnalysis = () => { app.analysis = null; app.visual = {}; app.renderer.render(); refreshPanels(app); };
app.runCentrality = (kind) => {
  const C = A.CENTRALITIES[kind];
  const compute = () => {
    const adj = visibleAdj();
    const scores = C.fn(adj);
    const norm = A.normalizeScores(scores);
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const rank = new Map(ranked.map(([id], i) => [id, i + 1]));
    app.analysis = { kind, title: C.name, scores, rank, recompute: compute };
    app.visual = {
      size: norm, color: new Map([...norm].map(([id, t]) => [id, heatColor(t)])),
      subLabel: new Map([...scores].map(([id, v]) => [id, Number.isInteger(v) ? String(v) : v.toFixed(3)])),
    };
  };
  compute();
  app.renderer.render(); showTab('analysis');
  app.toast(`${C.name} — คำนวณ ${app.analysis.scores.size} โหนด`);
};
app.runCommunities = (method) => {
  const compute = () => {
    const adj = visibleAdj();
    const res = method === 'components' ? A.connectedComponents(adj) : method === 'lpa' ? A.labelPropagation(adj) : A.louvainCommunities(adj);
    const title = { components: 'คอมโพเนนต์ที่เชื่อมกัน', lpa: 'ชุมชน (Label propagation)', louvain: 'ชุมชน (Louvain)' }[method];
    app.analysis = { kind: method, title, membership: res.membership, groups: res.groups, modularity: method === 'components' ? null : A.modularity(adj, res.membership), recompute: compute };
    app.visual = {
      badge: res.membership,
      color: new Map([...res.membership].map(([id, c]) => [id, paletteColor(c)])),
      fill: new Map([...res.membership].map(([id, c]) => [id, paletteColor(c) + '22'])),
    };
  };
  compute();
  app.renderer.render(); showTab('analysis');
  app.toast(`${app.analysis.title}: พบ ${app.analysis.groups.length} กลุ่ม`);
};
app.runShortestPath = (from, to, weighted = false) => {
  if (!from || !to || from === to) { app.toast('เลือกโหนดต้นทางและปลายทางที่ต่างกัน', true); return; }
  const adj = visibleAdj();
  const r = A.shortestPath(adj, from, to, { weighted });
  if (!r) { app.analysis = { kind: 'path', error: 'ไม่พบเส้นทางเชื่อมระหว่างสองโหนดนี้' }; app.visual = {}; app.renderer.render(); showTab('analysis'); app.toast('ไม่พบเส้นทาง', true); return; }
  const pathLinks = new Set();
  for (let i = 0; i < r.path.length - 1; i++) {
    const ls = app.graph.linksBetween(r.path[i], r.path[i + 1]);
    ls.sort((a, b) => b.weight - a.weight);
    if (ls[0]) pathLinks.add(ls[0].id);
  }
  const onPath = new Set(r.path);
  const dimmed = new Set(app.graph.entityNodes().filter(n => !onPath.has(n.id)).map(n => n.id));
  app.analysis = { kind: 'path', title: 'เส้นทางสั้นสุด', path: r.path };
  app.visual = { pathLinks, dimmed, color: new Map(r.path.map(id => [id, '#f59e0b'])) };
  app.select(r.path);
  showTab('analysis');
  app.toast(`เส้นทางสั้นสุด ${r.path.length - 1} ก้าว`);
};

// ---------------------------------------------------------------- มุมมอง (ซ่อน/แสดง)
app.toggleHideType = (type) => {
  const ids = [...app.graph.nodes.values()].filter(n => n.type === type).map(n => n.id);
  const allHidden = ids.every(id => app.hidden.has(id));
  for (const id of ids) { if (allHidden) app.hidden.delete(id); else app.hidden.add(id); }
  app.changed({ structural: true });
};

// ---------------------------------------------------------------- คำสั่ง
app.run = async (cmd) => {
  const selNodes = () => [...app.selection].filter(id => app.graph.nodes.has(id));
  if (cmd.startsWith('layout:')) return app.applyLayout(cmd.slice(7));
  if (cmd.startsWith('theme:')) return app.applyTheme(cmd.slice(6));
  if (cmd === 'ai:dialog') return openAiDialog(app);
  if (cmd === 'ai:expand') return app.aiExpandSelected();
  if (cmd === 'ai:paste') return openAiDialog(app);
  if (cmd === 'ai:file') { $('#file-ai').value = ''; $('#file-ai').click(); return; }
  if (cmd === 'ai:gemini' || cmd === 'ai:chatgpt' || cmd === 'ai:claude') return app.openAiSite(cmd.slice(3));
  if (cmd.startsWith('shape:')) return app.setTopicStyle({ shape: cmd.slice(6) === 'auto' ? null : cmd.slice(6) });
  if (cmd.startsWith('shape-branch:')) return app.setTopicStyle({ shape: cmd.slice(13) === 'auto' ? null : cmd.slice(13) }, { wholeBranch: true });
  if (cmd === 'layout-selected') return app.applyLayout('force', { onlySelected: true });
  if (cmd.startsWith('analysis:')) {
    const k = cmd.slice(9);
    if (k in A.CENTRALITIES) return app.runCentrality(k);
    if (k === 'louvain' || k === 'lpa' || k === 'components') return app.runCommunities(k);
    if (k === 'clear') return app.clearAnalysis();
    if (k === 'path') {
      const s = selNodes();
      if (s.length !== 2) { showTab('analysis'); app.toast('เลือกโหนด 2 โหนด (Shift+คลิก) แล้วกด P หรือเลือกจากแผงวิเคราะห์'); return; }
      return app.runShortestPath(s[0], s[1]);
    }
  }
  switch (cmd) {
    case 'new':
      if (app.graph.nodes.size && !(await app.confirm('เริ่มผังใหม่? ผังปัจจุบันจะถูกแทนที่ (ถ้ายังไม่ได้บันทึกเป็นไฟล์ JSON ให้กดยกเลิกแล้ว Ctrl+S ก่อน)', { ok: 'เริ่มผังใหม่' }))) return;
      loadGraph(new Graph()); app.toast('เริ่มผังใหม่'); break;
    case 'open': $('#file-json').value = ''; $('#file-json').click(); break;
    case 'save': {
      const json = JSON.stringify({ ...app.graph.toJSON(), view: app.view, hidden: [...app.hidden] }, null, 2);
      try { saved(await downloadText(safeFilename(app.graph.meta.title, 'linkmap.json'), json, 'application/json'), 'บันทึกไฟล์ JSON'); } catch (err) { app.toast(err.message, true); }
      break;
    }
    case 'import-csv': openCsvDialog(app); break;
    case 'export-nodes-csv': try { saved(await downloadText(safeFilename(app.graph.meta.title + '_nodes', 'csv'), exportNodesCSV(app.graph), 'text/csv;charset=utf-8'), 'ส่งออก CSV'); } catch (err) { app.toast(err.message, true); } break;
    case 'export-links-csv': try { saved(await downloadText(safeFilename(app.graph.meta.title + '_links', 'csv'), exportLinksCSV(app.graph), 'text/csv;charset=utf-8'), 'ส่งออก CSV'); } catch (err) { app.toast(err.message, true); } break;
    case 'export-png':
      try { saved(await exportImage(app.renderer, safeFilename(app.graph.meta.title, 'png'), { format: 'png' }), 'ส่งออก PNG'); } catch (err) { app.toast(err.message, true); } break;
    case 'export-svg':
      try { saved(await exportSVG(app.renderer, safeFilename(app.graph.meta.title, 'svg')), 'ส่งออก SVG'); } catch (err) { app.toast(err.message, true); } break;
    case 'load-sample':
      if (app.graph.nodes.size && !(await app.confirm('โหลดตัวอย่างแทนผังปัจจุบัน?', { ok: 'โหลดตัวอย่าง' }))) return;
      loadSample(); break;
    case 'undo': { const g = app.history.undo(app.graph); if (g) { app.graph = g; app.changed(); } break; }
    case 'redo': { const g = app.history.redo(app.graph); if (g) { app.graph = g; app.changed(); } break; }
    case 'select-all': app.select([...app.graph.nodes.keys()].filter(id => !app.isHidden(id))); break;
    case 'delete': {
      if (!app.selection.size) return;
      const ids = [...app.selection];
      const topicWithKids = ids.filter(id => app.graph.getNode(id)?.type === 'topic' && (app.tree.children.get(id) || []).length);
      if (topicWithKids.length && ids.every(id => app.graph.nodes.has(id))) { app.deleteBranch(ids); break; }
      app.mutate(g => { for (const id of ids) { if (!g.removeNode(id)) g.removeLink(id); } });
      if (app.opts.autoArrange && ids.some(id => !app.graph.nodes.has(id))) app.arrangeMindmap({ keepView: true });
      app.toast(`ลบ ${ids.length} รายการ`); break;
    }
    case 'duplicate': {
      const ids = selNodes(); if (!ids.length) return;
      const map = new Map(); const newIds = [];
      app.mutate(g => {
        for (const id of ids) { const n = g.getNode(id); const c = g.addNode({ ...n, id: undefined, x: n.x + 40, y: n.y + 40, attrs: { ...n.attrs } }); map.set(id, c.id); newIds.push(c.id); }
        for (const l of [...g.links.values()]) if (map.has(l.from) && map.has(l.to)) g.addLink({ ...l, id: undefined, from: map.get(l.from), to: map.get(l.to), attrs: { ...l.attrs } });
      });
      app.select(newIds); break;
    }
    case 'add-node': { const c = centerWorld(); app.createNodeAt(c.x, c.y); break; }
    case 'add-sibling': app.addTopic('sibling'); break;
    case 'bold': app.toggleStyle('bold'); break;
    case 'italic': app.toggleStyle('italic'); break;
    case 'image-add': $('#file-image').click(); break;
    case 'image-remove': app.removeImage(); break;
    case 'export-jpeg':
      try { saved(await exportImage(app.renderer, safeFilename(app.graph.meta.title, 'jpg'), { format: 'jpeg' }), 'ส่งออก JPEG'); } catch (err) { app.toast(err.message, true); } break;
    case 'export-pdf': case 'export-pdf-a4': case 'export-pdf-a3':
      try {
        const page = cmd === 'export-pdf-a4' ? 'a4landscape' : cmd === 'export-pdf-a3' ? 'a3landscape' : 'fit';
        saved(await exportPDF(app.renderer, safeFilename(app.graph.meta.title, 'pdf'), { page, title: app.graph.meta.title }), 'ส่งออก PDF');
      } catch (err) { app.toast(err.message, true); } break;
    case 'toggle-collapse': { const id = selNodes()[0]; if (id) app.toggleCollapse(id); break; }
    case 'expand-all': app.mutate(g => { for (const n of g.nodes.values()) if (n.collapsed) g.updateNode(n.id, { collapsed: false }); }); if (app.opts.autoArrange) app.arrangeMindmap(); break;
    case 'delete-branch': { const ids = selNodes(); if (ids.length) app.deleteBranch(ids); break; }
    case 'delete-keep-children': { const id = selNodes()[0]; if (id) app.deleteNodeKeepChildren(id); break; }
    case 'move-up': { const id = selNodes()[0]; if (id) app.moveSibling(id, -1); break; }
    case 'move-down': { const id = selNodes()[0]; if (id) app.moveSibling(id, 1); break; }
    case 'go-root': { const r = app.tree.roots[0]; if (r) { app.select([r]); app.renderer.centerOn(r); } break; }
    case 'export-outline': try { saved(await downloadText(safeFilename(app.graph.meta.title, 'md'), toOutline(app.graph), 'text/markdown;charset=utf-8'), 'ส่งออกโครงร่าง Markdown'); } catch (err) { app.toast(err.message, true); } break;
    case 'copy-outline': {
      const md = toOutline(app.graph);
      try { await navigator.clipboard.writeText(md); app.toast('คัดลอกโครงร่างไปคลิปบอร์ดแล้ว'); } catch { try { saved(await downloadText(safeFilename(app.graph.meta.title, 'md'), md, 'text/markdown;charset=utf-8'), 'บันทึกโครงร่าง'); } catch (err) { app.toast(err.message, true); } }
      break;
    }
    case 'import-outline': openOutlineDialog(app); break;
    case 'add-child': app.addTopic('child'); break;
    case 'add-note': { const c = centerWorld(); app.createNote(c.x, c.y); break; }
    case 'add-group': app.createGroupAroundSelection(); break;
    case 'connect-selected': {
      const ids = selNodes().filter(id => !nodeBox(app.graph.getNode(id)));
      if (ids.length < 2) { app.toast('เลือกอย่างน้อย 2 โหนด', true); return; }
      app.mutate(g => { for (let i = 0; i < ids.length - 1; i++) g.addLink({ from: ids[i], to: ids[i + 1], label: '' }); });
      break;
    }
    case 'fit': app.renderer.fit(); break;
    case 'zoom-100': { const r = $('#canvas').getBoundingClientRect(); app.renderer.zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / app.view.k); break; }
    case 'expand': {
      const ids = selNodes(); if (!ids.length) { app.toast('เลือกโหนดก่อน', true); return; }
      const adj = app.graph.adjacency();
      const nb = A.neighborhood(adj, ids, 1);
      let unhidden = 0;
      for (const id of nb) if (app.hidden.has(id)) { app.hidden.delete(id); unhidden++; }
      app.select([...nb]);
      app.changed({ structural: unhidden > 0 });
      app.toast(unhidden ? `แสดงเพื่อนบ้านเพิ่ม ${unhidden} โหนด` : `เลือกเพื่อนบ้านแล้ว ${nb.size} โหนด`); break;
    }
    case 'focus': {
      const ids = selNodes(); if (!ids.length) { app.toast('เลือกโหนดก่อน', true); return; }
      const adj = app.graph.adjacency();
      const keep = A.neighborhood(adj, ids, 1);
      for (const id of ids) keep.add(id);
      for (const n of app.graph.nodes.values()) if (!keep.has(n.id) && n.type !== 'group' && n.type !== 'note') app.hidden.add(n.id);
      app.changed(); app.renderer.fit();
      app.toast(`แสดงเฉพาะที่เกี่ยวข้อง ${keep.size} โหนด (Shift+H แสดงทั้งหมด)`); break;
    }
    case 'hide-selected': { for (const id of selNodes()) app.hidden.add(id); app.selection.clear(); app.changed(); break; }
    case 'show-all': { const n = app.hidden.size; app.hidden.clear(); app.changed(); if (n) app.toast(`แสดงทั้งหมดแล้ว (${n} โหนด)`); break; }
    case 'toggle-panel': app.setPanel(!app.opts.panel); break;
    case 'help': $('#dlg-help').showModal(); break;
    default: console.warn('ไม่รู้จักคำสั่ง', cmd);
  }
};
// ---------------------------------------------------------------- เอไอ (ผ่านเว็บของผู้ให้บริการ ไม่ใช้ API)
const AI_SITES = { gemini: 'https://gemini.google.com/app', chatgpt: 'https://chatgpt.com/', claude: 'https://claude.ai/new' };
app.aiLevel = 'detailed';
app.aiPromptFor = (level) => (AI_PROMPTS[level] || AI_PROMPTS.detailed).text;
app.aiPrompt = () => { const t = $('#ai-prompt'); return (t && t.value.trim()) || app.aiPromptFor(app.aiLevel); };
/** ขยายกิ่งที่เลือก: สร้างคำสั่งเฉพาะหัวข้อ คัดลอก เปิดกล่องเอไอโดยติ๊ก "ต่อใต้หัวข้อที่เลือก" ไว้ให้ */
app.aiExpandSelected = async () => {
  const id = [...app.selection].find(i => app.graph.getNode(i)?.type === 'topic');
  if (!id) { app.toast('เลือกหัวข้อที่ต้องการขยายก่อน', true); return; }
  const n = app.graph.getNode(id);
  const kids = (app.tree.children.get(id) || []).map(k => app.graph.getNode(k)?.label).filter(Boolean);
  const prompt = buildExpandPrompt(n.label, kids, app.graph.meta.title !== 'ผังใหม่' ? app.graph.meta.title : '');
  const t = $('#ai-prompt'); if (t) { t.value = prompt; t.dataset.custom = '1'; }
  try { await navigator.clipboard.writeText(prompt); app.toast(`คัดลอกคำสั่งขยาย “${n.label}” แล้ว — วางใน Gemini (แนบเอกสารเดิม) แล้วนำ JSON กลับมาวางในขั้นที่ 2`); }
  catch { app.toast('คัดลอกอัตโนมัติไม่ได้ เปิด "ดู/แก้คำสั่ง" แล้วคัดลอกเอง', true); }
  if (!$('#dlg-ai').open) openAiDialog(app);
  $('#ai-under').checked = true;
};
app.copyAiPrompt = async () => {
  try { await navigator.clipboard.writeText(app.aiPrompt()); app.toast('คัดลอกคำสั่งแล้ว — ไปวางในช่องแชทของเอไอ (Ctrl+V) แล้วแนบ PDF'); return true; }
  catch { app.toast('คัดลอกอัตโนมัติไม่ได้ เปิด "ดู/แก้คำสั่ง" แล้วคัดลอกเอง', true); return false; }
};
app.openAiSite = async (site) => {
  await app.copyAiPrompt();
  const w = window.open(AI_SITES[site], '_blank', 'noopener');
  if (!w) app.toast('เบราว์เซอร์บล็อกการเปิดแท็บใหม่ — เปิด ' + AI_SITES[site] + ' เอง', true);
};
/** นำคำตอบของเอไอเข้า: JSON ต้นไม้ / ไฟล์ LinkMap / โครงร่างข้อความ  คืน true เมื่อสำเร็จ */
app.importAiText = (text, { underSelected = false } = {}) => {
  const parentId = underSelected ? [...app.selection].find(id => app.graph.getNode(id)?.type === 'topic') : null;
  const obj = extractJSON(text);
  if (obj && obj.format === 'linkmap' && Array.isArray(obj.nodes)) {
    try { loadGraph(Graph.fromJSON(obj), { view: obj.view, hidden: obj.hidden || [] }); app.toast('เปิดไฟล์ LinkMap แล้ว'); return true; }
    catch (err) { app.toast('ไฟล์ LinkMap ไม่ถูกต้อง: ' + err.message, true); return false; }
  }
  let ids = [];
  if (obj) {
    app.mutate(g => { ids = importTree(g, obj, { parentId: parentId || null }); });
    if (!ids.length) { app.toast('อ่าน JSON ได้ แต่ไม่พบโครงหัวข้อ (ต้องมี text/children)', true); return false; }
    if (obj.title && !parentId && app.graph.meta.title === 'ผังใหม่') { app.graph.meta.title = String(obj.title); $('#doc-title').value = app.graph.meta.title; }
  } else {
    app.mutate(g => { ids = importOutline(g, text, { parentId: parentId || null }); });
    if (!ids.length) { app.toast('ไม่พบหัวข้อในข้อความ — ต้องเป็น JSON หรือรายการแบบ - ข้อ', true); return false; }
  }
  app.history.push(app.graph);
  app.arrangeMindmap({ keepView: !!parentId });
  app.select([ids[0]]);
  if (!parentId) app.renderer.fit();
  app.toast(`สร้างมายแมปจากเอไอแล้ว ${ids.length} หัวข้อ`);
  return true;
};
$('#file-ai')?.addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const text = await f.text();
  const under = $('#dlg-ai')?.open ? $('#ai-under').checked : false;
  if (app.importAiText(text, { underSelected: under })) $('#dlg-ai')?.close();
  e.target.value = '';
});
app.importOutlineText = (text, { underSelected = false } = {}) => {
  const parentId = underSelected ? [...app.selection].find(id => app.graph.getNode(id)?.type === 'topic') : null;
  let ids = [];
  app.mutate(g => { ids = importOutline(g, text, { parentId: parentId || null }); });
  if (!ids.length) { app.toast('ไม่พบหัวข้อในข้อความ', true); return; }
  app.history.push(app.graph);
  app.arrangeMindmap({ keepView: !!parentId });
  app.select([ids[0]]);
  app.toast(`นำเข้า ${ids.length} หัวข้อแล้ว`);
};
function centerWorld() {
  const r = $('#canvas').getBoundingClientRect();
  const w = app.renderer.screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
  return { x: w.x + (Math.random() - 0.5) * 60, y: w.y + (Math.random() - 0.5) * 60 };
}

// ---------------------------------------------------------------- โหลด/บันทึก
function loadGraph(g, { view = null, hidden = [] } = {}) {
  app.graph = g; app.history = new History(100); app.selection.clear(); app.hidden = new Set(hidden);
  app.analysis = null; app.visual = {};
  $('#doc-title').value = g.meta.title || 'ผังใหม่';
  const t = setTheme(g.meta.theme || 'classic'); g.meta.theme = g.meta.theme || 'classic';
  document.body.classList.toggle('dark', !!t.dark);
  document.querySelectorAll('.theme-chip').forEach(c => c.classList.toggle('active', c.dataset.theme === g.meta.theme));
  app.changed();
  if (view) { app.view = view; app.renderer.applyView(); } else app.renderer.fit();
}
function loadSample() {
  const g = sampleGraph();
  loadGraph(g);
  app.arrangeMindmap();
  const b = app.renderer.contentBounds();
  const note = app.graph.getNode('note1'); if (note && b) { note.x = b.minX + 140; note.y = b.maxY + 60; }
  app.changed(); app.renderer.fit();
  app.toast('โหลดตัวอย่างแล้ว — เลือกหัวข้อแล้วกด Enter/Tab เพื่อจดต่อ');
}
let autosaveTimer = null;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...app.graph.toJSON(), view: app.view, hidden: [...app.hidden] }));
      $('#status-saved').textContent = 'บันทึกอัตโนมัติ ' + new Date().toLocaleTimeString('th-TH');
    } catch (err) { $('#status-saved').textContent = 'บันทึกอัตโนมัติไม่สำเร็จ'; }
  }, 600);
}
function restoreAutosave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    if (!obj.nodes?.length) return false;
    loadGraph(Graph.fromJSON(obj), { view: obj.view, hidden: obj.hidden || [] });
    return true;
  } catch (err) { console.warn('restore failed', err); return false; }
}
$('#file-json').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    loadGraph(Graph.fromJSON(obj), { view: obj.view, hidden: obj.hidden || [] });
    app.toast(`เปิด ${f.name} แล้ว (${app.graph.size.nodes} โหนด, ${app.graph.size.links} เส้น)`);
  } catch (err) { app.toast('เปิดไฟล์ไม่สำเร็จ: ' + err.message, true); }
});
$('#doc-title').addEventListener('change', (e) => { app.graph.meta.title = e.target.value.trim() || 'ผังใหม่'; app.changed({ structural: false }); });

// ---------------------------------------------------------------- สถานะ
function updateStatus() {
  const { nodes, links } = app.graph.size;
  $('#status-counts').textContent = `โหนด ${nodes} · เส้น ${links}${app.hidden.size ? ` · ซ่อน ${app.hidden.size}` : ''}`;
  const sn = [...app.selection].filter(id => app.graph.nodes.has(id)).length, sl = app.selection.size - sn;
  $('#status-selection').textContent = app.selection.size ? `เลือก: ${sn} โหนด ${sl} เส้น` : '';
  $('#btn-undo').disabled = !app.history.canUndo(); $('#btn-redo').disabled = !app.history.canRedo();
}
app.onViewChanged = () => { $('#zoom-label').textContent = Math.round(app.view.k * 100) + '%'; app.closeInlineEditor(true); scheduleAutosave(); };

// ---------------------------------------------------------------- เมนู/แถบเครื่องมือ/ค้นหา
function initMenus() {
  const menus = [...document.querySelectorAll('#menubar .menu')];
  const closeAll = () => menus.forEach(m => { m.classList.remove('open'); const l = m.querySelector('.menu-list'); l.style.position = ''; l.style.left = ''; l.style.top = ''; l.style.maxHeight = ''; });
  // วางรายการเมนูแบบ fixed เพื่อไม่ให้ถูกแถบบนที่เลื่อนได้ (จอแคบ/มือถือ) ตัดออก และไม่หลุดขอบจอ
  const openMenu = (m) => {
    closeAll(); m.classList.add('open');
    const btn = m.querySelector('.menu-btn'), list = m.querySelector('.menu-list');
    const r = btn.getBoundingClientRect();
    list.style.position = 'fixed'; list.style.top = `${r.bottom + 2}px`;
    list.style.maxHeight = `${window.innerHeight - r.bottom - 12}px`; list.style.overflowY = 'auto';
    const w = list.offsetWidth;
    list.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - w - 4))}px`;
  };
  menus.forEach(m => {
    m.querySelector('.menu-btn').addEventListener('click', (e) => { e.stopPropagation(); const open = m.classList.contains('open'); if (open) closeAll(); else openMenu(m); });
    m.querySelector('.menu-btn').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && menus.some(x => x.classList.contains('open')) && !m.classList.contains('open')) openMenu(m); });
    m.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => { closeAll(); app.run(b.dataset.cmd); }));
  });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.menu')) closeAll(); });
  $('#opt-link-labels').addEventListener('change', (e) => { app.opts.linkLabels = e.target.checked; app.saveOpts(); app.renderer.render(); });
  $('#opt-grid').addEventListener('change', (e) => { app.opts.grid = e.target.checked; app.saveOpts(); app.renderer.applyView(); });
  $('#opt-snap').addEventListener('change', (e) => { app.opts.snap = e.target.checked; app.saveOpts(); });
  $('#opt-auto-arrange')?.addEventListener('change', (e) => app.setAutoArrange(e.target.checked));
  $('#tb-auto-arrange')?.addEventListener('change', (e) => { app.setAutoArrange(e.target.checked); app.toast(e.target.checked ? 'เปิดจัดผังอัตโนมัติ: จัดใหม่ทุกครั้งที่เพิ่มหัวข้อ' : 'ปิดจัดผังอัตโนมัติ: หัวข้อใหม่จะวางข้างพ่อโดยไม่ขยับของเดิม (กดปุ่ม "จัดผัง" เมื่อต้องการ)'); });
  $('#btn-panel')?.addEventListener('click', () => app.setPanel(!app.opts.panel));
  $('#tb-panel')?.addEventListener('click', () => app.setPanel(!app.opts.panel));
  document.querySelectorAll('#toolbar .tool-action').forEach(b => b.addEventListener('click', () => app.run(b.dataset.cmd)));
  const themeRow = $('#theme-row');
  if (themeRow) for (const [key, t] of Object.entries(THEMES)) {
    const b = document.createElement('button'); b.className = 'theme-chip'; b.dataset.theme = key; b.title = t.name;
    b.style.background = `linear-gradient(135deg, ${t.palette[0]} 0 50%, ${t.palette[1]} 50% 100%)`; b.style.boxShadow = `inset 0 0 0 3px ${t.bg}`;
    b.addEventListener('click', (e) => { e.stopPropagation(); app.applyTheme(key); });
    themeRow.appendChild(b);
  }
  $('#btn-undo').addEventListener('click', () => app.run('undo'));
  $('#btn-redo').addEventListener('click', () => app.run('redo'));
  $('#zoom-label').addEventListener('click', () => app.renderer.fit());
  document.querySelectorAll('#toolbar .tool[data-tool]').forEach(b => b.addEventListener('click', () => app.setTool(b.dataset.tool)));
  const pal = $('#type-palette');
  for (const t of TYPE_ORDER) {
    const b = document.createElement('button');
    b.textContent = ENTITY_TYPES[t].icon; b.title = `โหนดใหม่เป็น: ${ENTITY_TYPES[t].label}`; b.style.borderColor = t === app.newType ? '#0f172a' : ENTITY_TYPES[t].color + '55';
    b.dataset.type = t; b.classList.toggle('active', t === app.newType);
    b.addEventListener('click', () => {
      app.newType = t;
      pal.querySelectorAll('button').forEach(x => { x.classList.toggle('active', x.dataset.type === t); x.style.borderColor = x.dataset.type === t ? '#0f172a' : ENTITY_TYPES[x.dataset.type].color + '55'; });
      const ids = [...app.selection].filter(id => app.graph.nodes.has(id) && !nodeBox(app.graph.getNode(id)));
      if (ids.length) app.mutate(g => ids.forEach(id => g.updateNode(id, { type: t })));
      else if (app.tool !== 'node') app.setTool('node');
    });
    pal.appendChild(b);
  }
}
function initSearch() {
  const inp = $('#search'), box = $('#search-results');
  let items = [], active = -1;
  const render = () => {
    box.innerHTML = items.map((it, i) => `<div class="${i === active ? 'active' : ''}" data-i="${i}"><span class="dot" style="background:${it.color}"></span><span>${it.text}</span><span class="badge">${it.kind}</span></div>`).join('');
    box.classList.toggle('hidden', !items.length);
    box.querySelectorAll('div[data-i]').forEach(d => d.addEventListener('click', () => pick(Number(d.dataset.i))));
  };
  const pick = (i) => { const it = items[i]; if (!it) return; app.select([it.id]); app.revealId(it.id); box.classList.add('hidden'); };
  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase(); items = []; active = -1;
    if (!q) { render(); return; }
    for (const n of app.graph.nodes.values()) {
      const hay = `${n.label} ${n.source} ${n.notes} ${Object.entries(n.attrs || {}).map(([k, v]) => k + ' ' + v).join(' ')}`.toLowerCase();
      if (hay.includes(q)) items.push({ id: n.id, text: n.label, kind: typeInfo(n.type).label, color: n.color || typeInfo(n.type).color });
    }
    for (const l of app.graph.links.values()) {
      if (l.label.toLowerCase().includes(q)) items.push({ id: l.id, text: `${app.graph.getNode(l.from)?.label} → ${app.graph.getNode(l.to)?.label}: ${l.label}`, kind: 'เส้น', color: l.color || '#94a3b8' });
    }
    items = items.slice(0, 30); render();
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(active < 0 ? 0 : active); if (items.length > 1 && active < 0) app.select(items.map(i => i.id)); }
    else if (e.key === 'Escape') { box.classList.add('hidden'); inp.blur(); $('#canvas').focus(); }
  });
  inp.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 150));
  inp.addEventListener('focus', () => { if (items.length) box.classList.remove('hidden'); });
}

// ---------------------------------------------------------------- คีย์ลัด
function isTyping(e) {
  const t = e.target; const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isTyping(e)) return;
    app.renderer.cancelDrag(); app.hideContextMenu();
    if (app.tool !== 'select') app.setTool('select'); else app.select([]);
    return;
  }
  if (isTyping(e)) return;
  if (document.querySelector('dialog[open]')) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.code === 'Space') {
    // แตะ Space สั้น ๆ = สลับเครื่องมือ เลือก ⇄ เลื่อน · กดค้างแล้วลาก = เลื่อนชั่วคราว
    if (!e.repeat) { app._spaceAt = performance.now(); app._spaceDragged = false; }
    app.spaceDown = true; $('#canvas').classList.add('tool-pan'); e.preventDefault(); return;
  }
  if (ctrl) {
    const k = e.key.toLowerCase();
    const map = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', a: 'select-all', d: 'duplicate', s: 'save', o: 'open', l: 'layout:mindmap', e: 'export-png', b: 'bold', i: 'italic', p: 'export-pdf' };
    if (k === 'f') { e.preventDefault(); $('#search').focus(); return; }
    if (k === 'm') { e.preventDefault(); app.run(e.shiftKey ? 'copy-outline' : 'import-outline'); return; }
    if (k === 'j') { e.preventDefault(); app.run('ai:dialog'); return; }
    if (k === '/') { e.preventDefault(); app.run('toggle-collapse'); return; }
    if (map[k]) { e.preventDefault(); app.run(map[k]); }
    return;
  }
  const key = e.key;
  if (key === 'Delete' || key === 'Backspace') { e.preventDefault(); app.run(e.shiftKey ? 'delete-keep-children' : 'delete'); return; }
  if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
    e.preventDefault();
    const dir = key.slice(5).toLowerCase();
    if (ctrl && (dir === 'up' || dir === 'down')) { app.run(dir === 'up' ? 'move-up' : 'move-down'); return; }
    app.navigate(dir); return;
  }
  if (key === 'Home') { app.run('go-root'); return; }
  if (key === '/' || (ctrl && key === '/')) { e.preventDefault(); app.run('toggle-collapse'); return; }
  if (key === '?') { app.run('help'); return; }
  if (key === '\\') { app.run('toggle-panel'); return; }
  if (key === '+' || key === '=') { const r = $('#canvas').getBoundingClientRect(); app.renderer.zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2); return; }
  if (key === '-') { const r = $('#canvas').getBoundingClientRect(); app.renderer.zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2); return; }
  const lower = key.toLowerCase();
  const tools = { v: 'select', n: 'node', l: 'link', t: 'note' };
  if (lower === 'h') { if (e.shiftKey) app.run('show-all'); else if (app.selection.size) app.run('focus'); else app.setTool('pan'); return; }
  if (lower === 'g') { app.run('add-group'); return; }
  if (tools[lower]) { app.setTool(tools[lower]); return; }
  if (key === 'Enter') { e.preventDefault(); app.addTopic(e.shiftKey ? 'child' : 'sibling'); return; }
  if (key === 'Tab' || key === 'Insert') { e.preventDefault(); app.addTopic('child'); return; }
  const layouts = { 1: 'mindmap', 2: 'orgchart', 3: 'force', 4: 'circular', 5: 'grouped', 6: 'timeline' };
  if (layouts[key]) { app.run('layout:' + layouts[key]); return; }
  if (key === '0') { app.run('zoom-100'); return; }
  if (lower === 'f') { app.run('fit'); return; }
  if (lower === 'e') { app.run('expand'); return; }
  if (lower === 'p') { app.run('analysis:path'); return; }
  if (key === 'F2' && app.selection.size === 1) { app.editInline([...app.selection][0]); return; }
  // พิมพ์อักษร (เช่นภาษาไทย) ขณะเลือกหัวข้อเดียว → เริ่มแก้ข้อความทันทีด้วยตัวอักษรนั้น
  if (key.length === 1 && !ctrl && !e.altKey && app.selection.size === 1 && app.graph.nodes.has([...app.selection][0])) {
    const id = [...app.selection][0];
    app.editInline(id, false);
    editor.value = key; e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code !== 'Space') return;
  app.spaceDown = false;
  const tapped = app._spaceAt && performance.now() - app._spaceAt < 350 && !app._spaceDragged && !isTyping(e);
  if (tapped) { app.setTool(app.tool === 'pan' ? 'select' : 'pan'); app.toast(app.tool === 'pan' ? 'โหมดเลื่อน (Space สลับกลับ)' : 'โหมดเลือก'); }
  else if (app.tool !== 'pan') $('#canvas').classList.remove('tool-pan');
  app._spaceAt = 0;
});

// ---------------------------------------------------------------- เริ่มต้น
function checkVersion() {
  // index.html กับ main.js ต้องเป็นเวอร์ชันเดียวกัน ถ้าไม่ตรง (แคชเก่าค้าง) ให้โหลดใหม่แบบข้ามแคชหนึ่งครั้ง
  const htmlVer = document.querySelector('meta[name="app-version"]')?.content || '0';
  const hv = $('#help-version'); if (hv) hv.textContent = APP_VERSION;
  if (htmlVer !== APP_VERSION) {
    const key = 'linkmap.reloaded.' + APP_VERSION + '.' + htmlVer;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      caches?.keys?.().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
      setTimeout(() => location.reload(), 300);
      return false;
    }
    console.warn('เวอร์ชันไฟล์ไม่ตรงกัน', htmlVer, APP_VERSION);
  }
  return true;
}
const safe = (label, fn) => { try { fn(); } catch (err) { console.error('เริ่ม ' + label + ' ไม่สำเร็จ', err); } };
function boot() {
  checkVersion();
  app.renderer = new Renderer(app, $('#canvas'));
  safe('ตัวเลือก', () => app.loadOpts());
  safe('เมนู', initMenus); safe('ค้นหา', initSearch); safe('แผงขวา', () => initPanels(app));
  safe('ออโต้จัดผัง', () => app.setAutoArrange(app.opts.autoArrange));
  safe('แผงขวา', () => app.setPanel(app.opts.panel));
  safe('ตัวเลือกมุมมอง', () => { $('#opt-link-labels').checked = app.opts.linkLabels; $('#opt-grid').checked = app.opts.grid; $('#opt-snap').checked = app.opts.snap; });
  app.setTool('select');
  if (!restoreAutosave()) loadSample();
  app.renderer.applyView();
  window.addEventListener('beforeunload', () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...app.graph.toJSON(), view: app.view, hidden: [...app.hidden] })); } catch { /* ignore */ } });
}
boot();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* ไม่รองรับ/ไม่จำเป็น */ }));
}
