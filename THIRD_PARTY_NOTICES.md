# Third-party notices

LinkMap **ไม่ใช้ไลบรารีของบุคคลที่สามเลย** — ทั้งตอนรันในเบราว์เซอร์และตอนทดสอบ

- รันไทม์: HTML/CSS/JavaScript มาตรฐานของเบราว์เซอร์ (SVG, localStorage, Canvas 2D) ไม่โหลดสคริปต์จาก CDN หรือเครือข่ายใด ๆ
- เซิร์ฟเวอร์เปิดแอป: `http.server` ที่มากับ Python 3 (PSF License) หรือ `node:http` ที่มากับ Node.js (MIT) — เป็นส่วนหนึ่งของรันไทม์ที่ผู้ใช้ติดตั้งเอง ไม่ได้แจกไปกับแอป
- เทสต์: `node:test` / `node:assert` ที่มากับ Node.js
- อัลกอริทึมทั้งหมด (force-directed แบบ Fruchterman–Reingold, การจัดชั้นแบบ longest-path + barycenter, มายแมป, betweenness ของ Brandes, Louvain, label propagation, Dijkstra, CSV parser) เขียนขึ้นใหม่ในโปรเจกต์นี้จากคำอธิบายอัลกอริทึมที่เผยแพร่ทั่วไป ไม่ได้คัดลอกโค้ดจากไลบรารีใด

ไอคอนประเภทเอนทิตีเป็นอักขระอีโมจิมาตรฐาน Unicode เรนเดอร์ด้วยฟอนต์ของระบบผู้ใช้ และฟอนต์ตัวอักษรใช้ฟอนต์ระบบ (Segoe UI / Sarabun / Noto Sans Thai / Leelawadee UI ตามที่มีในเครื่อง) ไม่มีฟอนต์ฝังมาด้วย

หากในอนาคตเพิ่มไลบรารีใด ให้บันทึกชื่อ เวอร์ชัน สัญญาอนุญาต และที่มาไว้ในไฟล์นี้ และใช้เฉพาะสัญญาอนุญาตแบบ permissive (MIT / BSD / Apache-2.0 / ISC) เท่านั้น
