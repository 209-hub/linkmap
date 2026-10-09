// ประเภทเอนทิตี สี และไอคอน (ไม่มี dependency ภายนอก)
export const ENTITY_TYPES = {
  person:  { label: 'บุคคล',     color: '#2563eb', icon: '👤' },
  org:     { label: 'องค์กร',    color: '#7c3aed', icon: '🏢' },
  place:   { label: 'สถานที่',   color: '#059669', icon: '📍' },
  event:   { label: 'เหตุการณ์', color: '#ea580c', icon: '📅' },
  phone:   { label: 'เบอร์โทร',  color: '#0891b2', icon: '📞' },
  account: { label: 'บัญชี',     color: '#ca8a04', icon: '💳' },
  vehicle: { label: 'ยานพาหนะ',  color: '#64748b', icon: '🚗' },
  generic: { label: 'ทั่วไป',    color: '#475569', icon: '⬢' },
  note:    { label: 'โน้ต',      color: '#facc15', icon: '🗒' },
  group:   { label: 'กรอบกลุ่ม', color: '#94a3b8', icon: '▢' },
};

export const TYPE_ORDER = ['person', 'org', 'place', 'event', 'phone', 'account', 'vehicle', 'generic'];

export function typeInfo(type) {
  return ENTITY_TYPES[type] || ENTITY_TYPES.generic;
}

export const PALETTE = [
  '#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777',
  '#0891b2', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea',
];

export function paletteColor(i) {
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

// สีไล่ระดับสำหรับค่าคะแนน 0..1 (ฟ้าอ่อน → เหลือง → แดงเข้ม)
export function heatColor(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  const stops = [
    [0.0, [219, 234, 254]],
    [0.5, [251, 191, 36]],
    [1.0, [185, 28, 28]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (x - t0) / (t1 - t0);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(185,28,28)';
}
