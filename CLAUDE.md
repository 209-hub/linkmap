# LinkMap

มายแมปจดเรียน + จัดผังอัตโนมัติ (และ link analysis แบบ i2 เป็นส่วนเสริม) — static web app, ไม่มี build step, ไม่มี dependency

- เจ้าของพูดไทย: ตอบและเขียน UI/เอกสาร/คอมเมนต์เป็นภาษาไทย
- local-first: ห้ามเรียกบริการออนไลน์ ห้ามโหลดสคริปต์จาก CDN
- สัญญาอนุญาต: ถ้าจะเพิ่มไลบรารี ใช้ได้เฉพาะ MIT/BSD/Apache/ISC และต้องจดใน `THIRD_PARTY_NOTICES.md` (ห้าม GPL)
- เปิดแอป: `python serve.py` (พอร์ต 8781) หรือดับเบิลคลิก `เปิดLinkMap.cmd`; ไฟล์ `.cmd` ต้องเป็น ASCII ล้วน (CRLF) เพราะ cmd.exe ไม่อ่าน UTF-8
- เทสต์: `npm test` (`node --test tests/*.test.js`) — โมดูลใน `src/` ที่ไม่แตะ DOM (graph/layout/analysis/csv) ต้องมีเทสต์
- โครง: `src/main.js` ประสานงาน+คีย์ลัด, `render.js` SVG+การโต้ตอบ (ระวัง: ระหว่างลากมี pointer capture ต้องใช้ `document.elementFromPoint` ในการ hit-test), `ui.js` แผงขวา, `layout.js`/`analysis.js` อัลกอริทึมล้วน
- สไตล์ SVG: CSS ใน `styles.css` ชนะ presentation attribute — ถ้าต้องกำหนด fill/stroke-width ต่อโหนด ให้ตั้งผ่าน `element.style.*`
- ภาพส่งออก (PNG/SVG) ใช้ CSS ชุดย่อยใน `src/export.js` — เพิ่มสไตล์ใหม่ที่มีผลกับภาพต้องเพิ่มที่นั่นด้วย
