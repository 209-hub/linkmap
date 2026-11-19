// คลังผัง (เวิร์กสเปซ): เก็บหลายผังไว้ใน IndexedDB ของเบราว์เซอร์นี้ — ไม่มีข้อมูลออกนอกเครื่อง
// แยก store "meta" (ข้อมูลย่อสำหรับแสดงรายการ) กับ "data" (เนื้อหาผังเต็ม) เพื่อเปิดหน้ารายการได้เร็ว

const DB = 'linkmap-library', VER = 1;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    try { result = fn(t); } catch (err) { db.close(); reject(err); return; }
    t.oncomplete = () => { db.close(); resolve(typeof IDBRequest !== 'undefined' && result instanceof IDBRequest ? result.result : result); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error || new Error('ยกเลิกการบันทึก')); };
  });
}

export function newDocId() { return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

/** รายการผังทั้งหมด (เฉพาะข้อมูลย่อ) เรียงจากแก้ไขล่าสุด */
export async function listDocs() {
  const metas = await tx(['meta'], 'readonly', t => t.objectStore('meta').getAll());
  return (metas || []).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
export async function getDoc(id) { return (await tx(['data'], 'readonly', t => t.objectStore('data').get(id))) || null; }
export async function saveDoc(id, json, meta) {
  await tx(['meta', 'data'], 'readwrite', t => { t.objectStore('data').put(json, id); t.objectStore('meta').put({ ...meta, id }); });
}
export async function deleteDoc(id) {
  await tx(['meta', 'data'], 'readwrite', t => { t.objectStore('data').delete(id); t.objectStore('meta').delete(id); });
}
export async function getMeta(id) { return (await tx(['meta'], 'readonly', t => t.objectStore('meta').get(id))) || null; }
export async function renameDoc(id, title) {
  const [json, meta] = await Promise.all([getDoc(id), getMeta(id)]);
  if (!json || !meta) return false;
  json.meta = { ...(json.meta || {}), title };
  await saveDoc(id, json, { ...meta, title, updated: Date.now() });
  return true;
}
export async function duplicateDoc(id) {
  const [json, meta] = await Promise.all([getDoc(id), getMeta(id)]);
  if (!json || !meta) return null;
  const nid = newDocId();
  const title = `${meta.title || 'ผัง'} (สำเนา)`;
  const copy = JSON.parse(JSON.stringify(json));
  copy.meta = { ...(copy.meta || {}), title };
  await saveDoc(nid, copy, { ...meta, id: nid, title, updated: Date.now(), created: Date.now() });
  return nid;
}
