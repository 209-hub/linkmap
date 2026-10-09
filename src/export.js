// ส่งออก SVG/PNG/ไฟล์ข้อความ (ทำงานในเบราว์เซอร์ล้วน ไม่ส่งข้อมูลออกนอกเครื่อง)

// สไตล์ที่จำเป็นสำหรับภาพส่งออก (ชุดย่อยของ styles.css เพื่อให้ไฟล์ SVG เปิดเดี่ยว ๆ ได้)
const EXPORT_CSS = `
  text { font-family: "Segoe UI", "Sarabun", "Noto Sans Thai", "Leelawadee UI", system-ui, sans-serif; }
  .node .shape { stroke-width: 2.5; fill: #fff; }
  .node .icon { font-size: 18px; text-anchor: middle; dominant-baseline: central; }
  .node .label { font-size: 13px; text-anchor: middle; fill: #0f172a; paint-order: stroke; stroke: #ffffff; stroke-width: 4px; stroke-linejoin: round; font-weight: 600; }
  .node .sublabel { font-size: 11px; text-anchor: middle; fill: #64748b; paint-order: stroke; stroke: #ffffff; stroke-width: 3px; }
  .node .badge { font-size: 10px; font-weight: 700; text-anchor: middle; dominant-baseline: central; fill: #fff; }
  .node.dimmed, .link.dimmed, .group.dimmed { opacity: .15; }
  .node.topic .topic-text { text-anchor: middle; }
  .collapse-btn .collapse-bg { stroke-width: 1.5; }
  .collapse-btn .collapse-txt { font-size: 11px; font-weight: 700; text-anchor: middle; dominant-baseline: central; }
  .node .notes-ind { font-size: 10px; }
  .node.note .shape { fill: #fef08a; stroke: #eab308; stroke-width: 1; rx: 4; }
  .node.note .note-text { font-size: 13px; fill: #422006; }
  .group .shape { fill: rgba(148, 163, 184, .10); stroke: #94a3b8; stroke-width: 1.5; stroke-dasharray: 6 4; rx: 12; }
  .group .title { font-size: 13px; font-weight: 700; fill: #475569; }
  .link .hit { fill: none; stroke: transparent; }
  .link .line { fill: none; stroke-linecap: round; }
  .link .label { font-size: 11px; fill: #334155; text-anchor: middle; dominant-baseline: central; paint-order: stroke; stroke: #ffffff; stroke-width: 4px; stroke-linejoin: round; }
  .link.highlight .line { stroke: #f59e0b !important; stroke-width: 6 !important; }
  .link.highlight .arrow { fill: #f59e0b !important; }
`;

export function buildExportSVG(renderer, { pad = 40, background = '#ffffff' } = {}) {
  const b = renderer.contentBounds();
  if (!b) throw new Error('ไม่มีอะไรให้ส่งออก');
  const src = renderer.svg;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const x = b.minX - pad, y = b.minY - pad, w = b.w + pad * 2, h = b.h + pad * 2;
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  svg.setAttribute('width', Math.ceil(w)); svg.setAttribute('height', Math.ceil(h));
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = EXPORT_CSS;
  svg.appendChild(style);
  // คัดลอก defs (filter เงา)
  svg.appendChild(src.querySelector('defs').cloneNode(true));
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', x); bg.setAttribute('y', y); bg.setAttribute('width', w); bg.setAttribute('height', h); bg.setAttribute('fill', background);
  svg.appendChild(bg);
  for (const layerId of ['layer-groups', 'layer-links', 'layer-nodes']) {
    const layer = src.querySelector('#' + layerId).cloneNode(true);
    layer.querySelectorAll('.port, .resize-handle, .sel-ring, .sel-ring-rect, .hit').forEach(e => e.remove());
    layer.querySelectorAll('.selected').forEach(e => e.classList.remove('selected'));
    layer.querySelectorAll('.link-target').forEach(e => e.classList.remove('link-target'));
    svg.appendChild(layer);
  }
  return new XMLSerializer().serializeToString(svg);
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  downloadBlob(filename, new Blob([text], { type }));
}

export function exportSVG(renderer, filename) {
  downloadText(filename, buildExportSVG(renderer), 'image/svg+xml;charset=utf-8');
}

export function exportPNG(renderer, filename, { scale = 2 } = {}) {
  return new Promise((resolve, reject) => {
    const svgText = buildExportSVG(renderer);
    const b = renderer.contentBounds();
    const w = Math.ceil(b.w + 80), h = Math.ceil(b.h + 80);
    const maxDim = 8000;
    const s = Math.min(scale, maxDim / Math.max(w, h));
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * s); canvas.height = Math.round(h * s);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => { URL.revokeObjectURL(url); if (!blob) return reject(new Error('สร้าง PNG ไม่สำเร็จ')); downloadBlob(filename, blob); resolve(); }, 'image/png');
      } catch (err) { URL.revokeObjectURL(url); reject(err); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เรนเดอร์ภาพไม่สำเร็จ')); };
    img.src = url;
  });
}

export function safeFilename(name, ext) {
  const base = String(name || 'linkmap').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'linkmap';
  return `${base}.${ext}`;
}
