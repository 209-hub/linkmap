// บันทึกอัตโนมัติลงโฟลเดอร์ในเครื่อง ด้วย File System Access API (Chrome/Edge บนคอม)
// ผู้ใช้เลือกโฟลเดอร์ครั้งเดียว แอปจำ handle ไว้ใน IndexedDB แล้วขอสิทธิ์ซ้ำเมื่อเปิดครั้งถัดไป
// ไม่มีข้อมูลออกนอกเครื่อง

const DB = 'linkmap-fs', STORE = 'handles', KEY = 'dir';

export const fsSupported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbOp(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const r = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(r?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** ให้ผู้ใช้เลือกโฟลเดอร์ (ต้องเรียกจากการคลิก) แล้วจำไว้ */
export async function pickFolder() {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'linkmap' });
  await idbOp('readwrite', s => s.put(handle, KEY));
  return handle;
}
/** โฟลเดอร์ที่เคยเลือกไว้ (หรือ null) */
export async function restoreFolder() {
  if (!fsSupported) return null;
  try { return (await idbOp('readonly', s => s.get(KEY))) || null; } catch { return null; }
}
export async function forgetFolder() { try { await idbOp('readwrite', s => s.delete(KEY)); } catch { /* ignore */ } }

/** ตรวจ/ขอสิทธิ์เขียน: request=true ต้องเรียกจากการคลิกของผู้ใช้ */
export async function ensurePermission(handle, request = false) {
  const opts = { mode: 'readwrite' };
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (request && (await handle.requestPermission(opts)) === 'granted') return true;
  } catch { /* ignore */ }
  return false;
}

export async function writeTextFile(handle, name, text) {
  const fh = await handle.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}
export async function readTextFile(handle, name) {
  const fh = await handle.getFileHandle(name);
  return (await fh.getFile()).text();
}
/** รายชื่อไฟล์ผังในโฟลเดอร์ เรียงจากแก้ไขล่าสุด */
export async function listMapFiles(handle) {
  const out = [];
  for await (const [name, h] of handle.entries()) {
    if (h.kind !== 'file' || !/\.(linkmap\.)?json$/i.test(name)) continue;
    try { const f = await h.getFile(); out.push({ name, modified: f.lastModified, size: f.size }); } catch { /* ข้าม */ }
  }
  return out.sort((a, b) => b.modified - a.modified);
}
