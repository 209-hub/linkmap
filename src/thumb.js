// ภาพย่อของผัง (SVG เล็ก ๆ) สำหรับหน้าเวิร์กสเปซ — วาดจากตำแหน่งโหนด/เส้น/ลายมือเท่านั้น ไม่ฝังรูปหรือข้อความ

const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;
const safeColor = (c, d) => (typeof c === 'string' && SAFE_COLOR.test(c) ? c : d);

/**
 * @param {{nodes: Array, links: Array, strokes?: Array}} doc  ข้อมูลผัง (รูปแบบ toJSON หรือ Graph ที่แปลงแล้ว)
 * @returns {string} SVG
 */
export function miniThumb(doc, { width = 240, height = 140, dark = false } = {}) {
  const nodes = (doc.nodes || []).filter(n => n && Number.isFinite(n.x) && Number.isFinite(n.y)).slice(0, 400);
  const strokes = (doc.strokes || []).slice(0, 200);
  const bg = dark ? '#0f172a' : '#f8fafc';
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${bg}"/>`;
  if (!nodes.length && !strokes.length) return `${open}<text x="${width / 2}" y="${height / 2 + 4}" text-anchor="middle" font-size="12" fill="#94a3b8">ผังว่าง</text></svg>`;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x, y) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
  for (const n of nodes) grow(n.x, n.y);
  for (const s of strokes) for (const p of s.points || []) grow(p[0], p[1]);
  const pad = 14;
  const sw = Math.max(1, maxX - minX), sh = Math.max(1, maxY - minY);
  const k = Math.min((width - pad * 2) / sw, (height - pad * 2) / sh, 0.5);
  const ox = (width - sw * k) / 2 - minX * k, oy = (height - sh * k) / 2 - minY * k;
  const X = (x) => (x * k + ox).toFixed(1), Y = (y) => (y * k + oy).toFixed(1);
  const byId = new Map(nodes.map(n => [n.id, n]));
  let out = open;
  for (const l of (doc.links || []).slice(0, 800)) {
    const a = byId.get(l.from), b = byId.get(l.to);
    if (a && b) out += `<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="${dark ? '#475569' : '#cbd5e1'}" stroke-width="1"/>`;
  }
  for (const s of strokes) {
    const pts = (s.points || []).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 30)) === 0);
    if (pts.length > 1) out += `<polyline points="${pts.map(p => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="none" stroke="${safeColor(s.color, '#111827')}" stroke-width="1"/>`;
  }
  for (const n of nodes) {
    if (n.type === 'group') continue;
    const c = safeColor(n.color, n.type === 'note' ? '#facc15' : (n.image ? '#0ea5e9' : '#64748b'));
    const w = n.type === 'note' ? 12 : 9, h = n.type === 'note' ? 8 : 5;
    out += `<rect x="${(n.x * k + ox - w / 2).toFixed(1)}" y="${(n.y * k + oy - h / 2).toFixed(1)}" width="${w}" height="${h}" rx="2" fill="${c}"/>`;
  }
  return out + '</svg>';
}
