// หน้าเวิร์กสเปซ: รายการผังทั้งหมดในเครื่องนี้ สร้างใหม่ เปิด เปลี่ยนชื่อ ทำสำเนา ลบ
import { listDocs, deleteDoc, renameDoc, duplicateDoc } from './library.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function timeAgo(ts) {
  if (!ts) return '';
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'เมื่อสักครู่';
  if (d < 3600) return `${Math.floor(d / 60)} นาทีที่แล้ว`;
  if (d < 86400) return `${Math.floor(d / 3600)} ชั่วโมงที่แล้ว`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} วันที่แล้ว`;
  return new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

let state = { q: '' };

export function isWorkspaceOpen() { return !document.getElementById('home')?.classList.contains('hidden'); }
export function hideWorkspace() { document.getElementById('home')?.classList.add('hidden'); }

export async function showWorkspace(app) {
  const home = document.getElementById('home');
  if (!home) return;
  home.classList.remove('hidden');
  const grid = home.querySelector('#home-grid');
  grid.innerHTML = '<div class="home-empty">กำลังโหลด…</div>';
  try { await app.saveDocNow(); } catch { /* ignore */ }
  const search = home.querySelector('#home-search');
  search.value = state.q;
  search.oninput = () => { state.q = search.value; render(); };
  home.querySelector('#home-new').onclick = () => app.newDoc();
  home.querySelector('#home-import').onclick = () => app.run('open');
  home.querySelector('#home-sample').onclick = () => app.run('load-sample');
  home.querySelector('#home-back').onclick = () => hideWorkspace();

  let metas = [];
  const load = async () => { try { metas = await listDocs(); } catch (err) { metas = []; grid.innerHTML = `<div class="home-empty">เปิดคลังผังไม่ได้: ${esc(err?.message || err)}</div>`; } };
  const render = () => {
    const q = state.q.trim().toLowerCase();
    const list = q ? metas.filter(m => String(m.title || '').toLowerCase().includes(q)) : metas;
    home.querySelector('#home-count').textContent = metas.length ? `${metas.length} ผัง` : '';
    const newCard = q ? '' : '<button class="home-card home-card-new" data-act="new"><span class="plus">＋</span><span>ผังใหม่</span></button>';
    if (!list.length && q) { grid.innerHTML = `<div class="home-empty">ไม่พบผังที่ชื่อมีคำว่า “${esc(state.q)}”</div>`; return; }
    grid.innerHTML = newCard + list.map(m => `
      <div class="home-card ${m.id === app.docId ? 'current' : ''}" data-id="${esc(m.id)}" tabindex="0">
        <div class="thumb">${m.thumb || ''}</div>
        <div class="info">
          <div class="title" title="${esc(m.title)}">${esc(m.title || 'ไม่มีชื่อ')}</div>
          <div class="sub">${timeAgo(m.updated)} · ${m.nodes || 0} หัวข้อ${m.strokes ? ' · ✏️' : ''}${m.id === app.docId ? ' · <b>เปิดอยู่</b>' : ''}</div>
        </div>
        <div class="acts">
          <button data-act="rename" title="เปลี่ยนชื่อ">✎</button>
          <button data-act="dup" title="ทำสำเนา">⧉</button>
          <button data-act="del" title="ลบ" class="danger">🗑</button>
        </div>
      </div>`).join('');
    grid.querySelector('[data-act="new"]')?.addEventListener('click', () => app.newDoc());
    grid.querySelectorAll('.home-card[data-id]').forEach(card => {
      const id = card.dataset.id;
      const meta = metas.find(m => m.id === id);
      const openIt = () => (id === app.docId ? hideWorkspace() : app.openDoc(id));
      card.addEventListener('click', (e) => { if (e.target.closest('.acts') || e.target.closest('input')) return; openIt(); });
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === card) openIt(); });
      card.querySelector('[data-act="rename"]').onclick = () => {
        const t = card.querySelector('.title');
        const inp = document.createElement('input');
        inp.className = 'rename'; inp.value = meta.title || '';
        t.replaceWith(inp); inp.focus(); inp.select();
        let done = false;
        const commit = async (save) => {
          if (done) return; done = true;
          const v = inp.value.trim();
          if (save && v && v !== meta.title) {
            if (id === app.docId) app.setTitle(v); else await renameDoc(id, v);
            await app.saveDocNow();
          }
          await load(); render();
        };
        inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') commit(true); if (e.key === 'Escape') commit(false); };
        inp.onblur = () => commit(true);
      };
      card.querySelector('[data-act="dup"]').onclick = async () => { await duplicateDoc(id); await load(); render(); app.toast('ทำสำเนาแล้ว'); };
      card.querySelector('[data-act="del"]').onclick = async () => {
        if (!(await app.confirm(`ลบผัง “${meta.title || 'ไม่มีชื่อ'}” ถาวร? (ไฟล์ที่บันทึกลงโฟลเดอร์ในเครื่องจะไม่ถูกลบ)`, { ok: 'ลบ' }))) return;
        await deleteDoc(id);
        if (id === app.docId) await app.afterCurrentDeleted();
        await load(); render(); app.toast('ลบแล้ว');
      };
    });
  };
  await load();
  render();
}
