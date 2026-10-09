// ตัวอย่าง: มายแมปจดเรียน (เนื้อหาสมมติ) ~30 หัวข้อ ภาษาไทย
import { Graph } from './graph.js';

export function sampleGraph() {
  const g = new Graph();
  g.meta.title = 'ตัวอย่าง: สรุปบทเรียน "พื้นฐานการตลาดดิจิทัล"';
  let i = 0;
  const T = (label, parent = null, extra = {}) => {
    const n = g.addNode({ id: 't' + (++i), label, type: 'topic', x: 0, y: 0, ...extra });
    if (parent) g.addLink({ from: parent.id, to: n.id, label: '', directed: false });
    return n;
  };
  const root = T('การตลาดดิจิทัล');
  const a = T('ความหมายและความสำคัญ', root);
  T('ใช้ช่องทางออนไลน์เข้าถึงลูกค้า', a);
  T('วัดผลได้แม่นยำกว่าสื่อเดิม', a);
  T('ปรับแคมเปญได้ทันที', a);
  const b = T('ช่องทางหลัก', root);
  const b1 = T('โซเชียลมีเดีย', b);
  T('Facebook / Instagram', b1);
  T('TikTok — วิดีโอสั้น', b1);
  const b2 = T('Search (SEO/SEM)', b);
  T('SEO = ติดอันดับแบบไม่เสียเงิน', b2);
  T('SEM = โฆษณาบนผลค้นหา', b2);
  T('อีเมล / LINE OA', b);
  const c = T('กลยุทธ์เนื้อหา (Content)', root);
  T('รู้จักกลุ่มเป้าหมาย (Persona)', c);
  T('ตารางเผยแพร่ (Content calendar)', c);
  T('เล่าเรื่อง (Storytelling)', c);
  const d = T('ตัวชี้วัด (KPI)', root);
  T('Reach / Impression', d);
  T('Engagement rate', d);
  T('Conversion / ROAS', d);
  const e = T('เครื่องมือ', root);
  T('Google Analytics', e);
  T('Meta Business Suite', e);
  T('Canva สำหรับกราฟิก', e);
  const f = T('ข้อควรระวัง', root);
  T('PDPA — ข้อมูลส่วนบุคคล', f);
  T('อย่าซื้อผู้ติดตามปลอม', f);
  g.addNode({ id: 'note1', label: 'สอบกลางภาค: เน้นบทช่องทางหลัก + KPI (อาจารย์ย้ำ 2 รอบ)', type: 'note', x: 0, y: 0, w: 240, h: 70 });
  return g;
}
