# TCC Safe Travel Assessment

ระบบประเมินตนเองด้านการเดินทางที่ปลอดภัยของเด็กนักเรียน ตามร่างเกณฑ์วันที่ 22 มิถุนายน 2569 รองรับแบบประเมินสถานศึกษา 3 ชุด แบบประเมินหน่วยงานกำกับ 4 ประเภท และ Dashboard สำหรับเจ้าหน้าที่

เอกสารประกอบ: [การตั้งค่า Firebase](docs/FIREBASE_SETUP.md) · [สถาปัตยกรรม Firebase](docs/FIREBASE_ARCHITECTURE.md) · [ที่มารายชื่อสถานศึกษา](docs/SCHOOL_DIRECTORY.md) · [BA traceability](docs/BA-TRACEABILITY.md) · [ที่มาตราสัญลักษณ์](docs/BRAND_ASSETS.md)

## Production target

- Firebase Hosting: เว็บหลักและ `/dashboard`
- Cloud Firestore: เก็บผลประเมินที่ผู้ใช้ยินยอมให้เผยแพร่
- Firebase App Check: ลดการส่งข้อมูลจากสคริปต์หรือเว็บไซต์ปลอม
- Firebase Authentication: ใช้ Google Sign-In ก่อนเข้าดู `/dashboard`
- ชื่อและเบอร์โทรผู้ประเมินจัดเก็บแยก และเปิดอ่านเฉพาะผู้ดูแลหรืออีเมลที่อนุญาตรายบุคคล
- ไม่ใช้ SQL Connect ในรุ่นนำร่อง

## เริ่มใช้งานบน Firebase

อ่านขั้นตอนทั้งหมดที่ [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)

```bash
cp .env.firebase.example .env.local
npm run firebase:build
firebase login
npm run firebase:deploy
```

## คำสั่งสำคัญ

- `npm run firebase:build` สร้าง static SPA ใน `firebase-dist/`
- `npm run firebase:serve` เปิด Firebase Hosting และ Firestore Emulator
- `npm run firebase:deploy` build และ deploy Hosting พร้อม Firestore rules/indexes
- `npm run firebase:smoke` ตรวจหน้าเว็บและ route สำคัญหลัง deploy
- `npm run firebase:release` ตรวจโค้ด ทดสอบ Deploy และ Smoke test ครบในคำสั่งเดียว
- `npm run schools:import` อัปเดตรายชื่อสถานศึกษา 12 จังหวัดจากข้อมูลภาครัฐ
- `npm test` ตรวจ Firebase build สูตรคะแนน ความครบถ้วนของเกณฑ์ และข้อมูลสถานศึกษา
- `npm run test:sites` ตรวจ build ของ Sites เฉพาะใน checkout ที่มี `.openai/hosting.json`

## หลักการข้อมูล

- ร่างที่ยังไม่ยืนยันอยู่ใน `localStorage` ของอุปกรณ์
- ผลที่ยืนยันเก็บแบบสร้างครั้งเดียวใน `submissions/{idempotencyKey}`
- ชื่อ บทบาท ตำแหน่ง และเบอร์โทรผู้ประเมินเก็บแยกใน `submission_assessors/{idempotencyKey}` และเปิดอ่านเฉพาะ Admin หรือ Viewer รายอีเมล
- ไม่เก็บคะแนนรวมจาก client; Dashboard คำนวณใหม่จากคำตอบดิบตามเกณฑ์ในโค้ด
- Firestore rules เปิดอ่านผลประเมินเฉพาะบัญชีที่ยืนยันและตรงกับ policy ส่วนข้อมูลติดต่ออ่านได้เฉพาะ admin/member รายบุคคลและแก้ไขหรือลบจาก client ไม่ได้
- หน้าผลลัพธ์ใช้ `benchmarks` เปรียบเทียบกับค่ากลางเฉพาะกลุ่มที่มีอย่างน้อย 10 ผลประเมิน; หากไม่ถึงจะแสดงเทียบขั้นมาตรฐาน
- หน้าแบบประเมินยังเปิดให้ประชาชนกรอกได้โดยไม่ต้องล็อกอิน

รายละเอียดโครงสร้างอยู่ที่ [docs/FIREBASE_ARCHITECTURE.md](docs/FIREBASE_ARCHITECTURE.md)
