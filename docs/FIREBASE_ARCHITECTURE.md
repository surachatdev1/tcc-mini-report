# Firebase architecture

## เส้นทางข้อมูล

```text
ผู้ประเมินสาธารณะ
  └─ Firebase Hosting (/, /dashboard, /admin)
       ├─ localStorage: ร่างที่ยังไม่ยืนยัน
       └─ Firebase Web SDK + App Check
            ├─ Firestore /submissions/{UUID}
            │    ├─ ผลประเมินและคำตอบ: read เฉพาะบัญชีที่ admin อนุญาต
            │    ├─ create: schema + consent + server timestamp
            │    └─ update/delete: denied
            └─ Firestore /submission_assessors/{UUID}
                 ├─ ชื่อผู้ประเมิน: create only
                 └─ read/update/delete จาก client: denied

/dashboard
  └─ อ่านผลประเมินจริงหลัง Firestore Rules ตรวจสิทธิ์
       └─ ตรวจรูปแบบคำตอบ + คำนวณคะแนนใหม่จาก rubric ใน source code

/admin
  └─ จัดการ dashboard_admins, dashboard_members และ dashboard_domains
       └─ อ่าน/เขียนได้เฉพาะ admin ที่ยืนยันอีเมลแล้ว
```

## เหตุผลที่เลือก Firestore แทน SQL Connect

รุ่นนำร่องมีข้อมูลเป็นผลประเมินหนึ่งเอกสารต่อการส่ง และตัวกรองหลักมีจังหวัด/ประเภทแบบประเมิน จึงไม่ต้องใช้ join หรือ relational transaction ที่ซับซ้อน Firestore ทำให้ deploy แบบ Hosting + database ได้ตรงไปตรงมา และรองรับ transaction สำหรับป้องกันการส่งซ้ำ

ยังไม่เลือก SQL Connect เพราะเพิ่ม Cloud SQL/PostgreSQL และงานดูแล schema/connection โดยประโยชน์ยังไม่ชัดในขนาดนี้ หากภายหลังต้องทำรายงานข้ามหลายตาราง งาน BI จำนวนมาก หรือข้อมูลอ้างอิงหน่วยงานแบบ relational ค่อยประเมิน SQL Connect อีกครั้ง

## Schema: `submissions/{idempotencyKey}`

- `schemaVersion`: `1`
- `publicConsent`: `true`
- `institution`, `province`
- `respondentRole`, `position`
- `assessmentDate`
- `topicId`, `topicLabel`, `agencyType`
- `rubricVersion`
- `answers`: map ของ `{ score, explanation }`
- `verificationStatus`: `self_reported`
- `createdAt`: server timestamp

จงใจไม่เก็บ `assessorName`, `score`, `grade` และ aggregate ในเอกสารสาธารณะ เพื่อไม่เปิดเผยข้อมูลส่วนบุคคลและไม่เชื่อค่าคำนวณจาก client

## Schema: `submission_assessors/{idempotencyKey}`

- `schemaVersion`: `1`
- `submissionId`: UUID เดียวกับผลประเมิน
- `assessorName`: ชื่อ–นามสกุลสำหรับอ้างอิงภายใน
- `createdAt`: server timestamp

collection นี้ไม่เปิดอ่านจาก Firebase Web SDK การตรวจสอบชื่อภายหลังต้องใช้ Firebase Console หรือ Admin SDK/Cloud Functions ที่มีสิทธิ์เท่านั้น จึงไม่ทำให้ Dashboard สาธารณะเปิดเผยชื่อผู้ประเมิน
Rules บังคับให้สร้างเอกสารชื่อนี้ใน transaction เดียวกับผลประเมินสาธารณะ และไม่อนุญาตให้เติมชื่อย้อนหลังจาก client

## ระบบสิทธิ์ Dashboard และ Admin

- `dashboard_admins/{email}` — ผู้จัดการสิทธิ์และผู้ดู Dashboard
- `dashboard_members/{email}` — อีเมล Google หรือ Email/Password ที่ได้รับอนุญาตรายบุคคล
- `dashboard_domains/{domain}` — โดเมนอีเมลที่ได้รับอนุญาต
- `/dashboard` ตรวจ policy ผ่าน Firestore Rules ก่อนอ่าน `submissions`
- `/admin` อ่านและแก้ policy ได้เฉพาะ admin ที่อีเมลยืนยันแล้ว
- รหัสผ่านอยู่ใน Firebase Authentication เท่านั้นและไม่ถูกเขียนลง Firestore

## ขอบเขตของรุ่นนี้

- Dashboard รวมข้อมูลที่ Firestore ส่งกลับใน browser จึงควรเพิ่ม server-side aggregate เมื่อข้อมูลมีปริมาณสูง
- การตรวจคำอธิบายเชิงลึกทำใน UI; rules ตรวจ schema ชั้นนอกและขนาดข้อมูล
- App Check ลด abuse แต่ไม่เท่ากับการพิสูจน์ตัวบุคคล

เมื่อปริมาณข้อมูลเกิน 500 รายการหรือจำเป็นต้องรับรองความถูกต้องแบบ authoritative ให้เพิ่ม Cloud Functions สำหรับ validate/aggregate โดยยังคงอยู่ในระบบ Firebase ได้
