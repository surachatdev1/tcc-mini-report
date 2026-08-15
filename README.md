# TCC Safe Travel Assessment

ระบบประเมินตนเองด้านการเดินทางที่ปลอดภัยของเด็กนักเรียน ตามร่างเกณฑ์วันที่ 22 มิถุนายน 2569 รองรับแบบประเมินสถานศึกษา 3 ชุด แบบประเมินหน่วยงานกำกับ 4 ประเภท และ Dashboard สำหรับเจ้าหน้าที่

เอกสารประกอบ: [การตั้งค่า Firebase](docs/FIREBASE_SETUP.md) · [สถาปัตยกรรม Firebase](docs/FIREBASE_ARCHITECTURE.md) · [ที่มารายชื่อสถานศึกษา](docs/SCHOOL_DIRECTORY.md) · [BA traceability](docs/BA-TRACEABILITY.md)

## Production target

- Firebase Hosting: เว็บหลักและ `/dashboard`
- Cloud Firestore: เก็บผลประเมินที่ผู้ใช้ยินยอมให้เผยแพร่
- Firebase App Check: ลดการส่งข้อมูลจากสคริปต์หรือเว็บไซต์ปลอม
- Firebase Authentication: ใช้ Google Sign-In ก่อนเข้าดู `/dashboard`
- ชื่อผู้ประเมินจัดเก็บแยกใน collection ที่ client อ่านไม่ได้
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
- ชื่อผู้ประเมินเก็บแยกใน `submission_assessors/{idempotencyKey}` และไม่แสดงบน Dashboard
- ไม่เก็บคะแนนรวมจาก client; Dashboard คำนวณใหม่จากคำตอบดิบตามเกณฑ์ในโค้ด
- Firestore rules เปิดอ่านผลประเมินเฉพาะบัญชีที่ยืนยันผ่าน Google ส่วนชื่อผู้ประเมิน client อ่าน แก้ไข หรือลบไม่ได้
- หน้าแบบประเมินยังเปิดให้ประชาชนกรอกได้โดยไม่ต้องล็อกอิน

รายละเอียดโครงสร้างอยู่ที่ [docs/FIREBASE_ARCHITECTURE.md](docs/FIREBASE_ARCHITECTURE.md)
