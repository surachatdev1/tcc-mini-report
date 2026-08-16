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
                 ├─ ชื่อ บทบาท ตำแหน่ง และเบอร์โทรผู้ประเมิน: create only
                 ├─ read: เฉพาะ admin/member รายบุคคล
                 └─ update/delete จาก client: denied

/dashboard
  └─ อ่านผลประเมินจริงหลัง Firestore Rules ตรวจสิทธิ์
       ├─ ตรวจรูปแบบคำตอบ + คำนวณคะแนนใหม่จาก rubric ใน source code
       └─ join ข้อมูลติดต่อใน browser เฉพาะผู้มีสิทธิ์รายบุคคล

/admin
  └─ จัดการ dashboard_admins, dashboard_members และ dashboard_domains
       ├─ อ่าน/เขียนได้เฉพาะ admin ที่ยืนยันอีเมลแล้ว
       └─ สร้าง /benchmarks จากผลจริง โดยเผยแพร่เมื่อกลุ่มมีอย่างน้อย 10 รายการ
```

## เหตุผลที่เลือก Firestore แทน SQL Connect

รุ่นนำร่องมีข้อมูลเป็นผลประเมินหนึ่งเอกสารต่อการส่ง และตัวกรองหลักมีจังหวัด/ประเภทแบบประเมิน จึงไม่ต้องใช้ join หรือ relational transaction ที่ซับซ้อน Firestore ทำให้ deploy แบบ Hosting + database ได้ตรงไปตรงมา และรองรับ transaction สำหรับป้องกันการส่งซ้ำ

ยังไม่เลือก SQL Connect เพราะเพิ่ม Cloud SQL/PostgreSQL และงานดูแล schema/connection โดยประโยชน์ยังไม่ชัดในขนาดนี้ หากภายหลังต้องทำรายงานข้ามหลายตาราง งาน BI จำนวนมาก หรือข้อมูลอ้างอิงหน่วยงานแบบ relational ค่อยประเมิน SQL Connect อีกครั้ง

## Schema: `submissions/{idempotencyKey}`

- `schemaVersion`: `2` (`1` เป็นข้อมูลเดิมที่ระบบยังอ่านได้)
- `publicConsent`: `true`
- `institution`, `province`
- `assessmentDate`
- `topicId`, `topicLabel`, `agencyType`
- `rubricVersion`
- `answers`: map ของ `{ score, explanation }`
- `verificationStatus`: `self_reported`
- `createdAt`: server timestamp

จงใจไม่เก็บ `assessorName`, `assessorPhone`, `respondentRole`, `position`, `score`, `grade` และ aggregate ในเอกสารผลประเมิน เพื่อแยกข้อมูลผู้ให้ข้อมูลและไม่เชื่อค่าคำนวณจาก client

## Schema: `submission_assessors/{idempotencyKey}`

- `schemaVersion`: `3` (`1–2` เป็นข้อมูลเดิมที่ระบบยังอ่านได้)
- `submissionId`: UUID เดียวกับผลประเมิน
- `assessorName`: ชื่อ–นามสกุลสำหรับอ้างอิงภายใน
- `assessorPhone`: เบอร์โทรศัพท์ (ไม่บังคับ)
- `respondentRole`: บทบาทผู้ให้ข้อมูล
- `position`: หน้าที่หรือตำแหน่ง (ไม่บังคับ)
- `createdAt`: server timestamp

collection นี้เปิดอ่านผ่าน Firebase Web SDK เฉพาะ admin หรือ `dashboard_members` รายบุคคล จึงแสดงชื่อและเบอร์โทรใน Dashboard/Excel ได้ตาม feedback แต่บัญชีที่ได้สิทธิ์จากทั้งโดเมนจะอ่านไม่ได้
Rules บังคับให้สร้างเอกสารนี้ใน atomic batch เดียวกับผลประเมิน และไม่อนุญาตให้เติมหรือแก้ข้อมูลย้อนหลังจาก client

## Schema: `benchmarks/{topic--agency--scope}`

- เก็บจำนวนผลประเมิน ค่าเฉลี่ย ค่ามัธยฐาน จำนวนระดับ A–D และค่ามัธยฐานรายหมวด
- ไม่มีชื่อ เบอร์โทร ชื่อสถานศึกษา หรือคำตอบรายบุคคล
- เปิดอ่านสาธารณะเพื่อให้ผู้ตอบเห็นกราฟหลังส่งผลโดยไม่ต้องล็อกอิน
- admin เป็นผู้คำนวณใหม่จากหน้า `/admin`; ระบบเผยแพร่เฉพาะกลุ่มแบบประเมิน/จังหวัดที่มีอย่างน้อย 10 รายการ
- ถ้ายังไม่ถึงเกณฑ์ หน้าเว็บเปรียบเทียบผลกับขั้นมาตรฐาน 66.67% แทน

## ระบบสิทธิ์ Dashboard และ Admin

- `dashboard_admins/{email}` — ผู้จัดการสิทธิ์และผู้ดู Dashboard
- `dashboard_members/{email}` — อีเมล Google หรือ Email/Password ที่ได้รับอนุญาตรายบุคคล
- `dashboard_domains/{domain}` — โดเมนอีเมลที่ได้รับอนุญาต
- `/dashboard` ตรวจ policy ผ่าน Firestore Rules ก่อนอ่าน `submissions`
- admin/member รายบุคคลอ่าน `submission_assessors` และส่งออกข้อมูลติดต่อได้ ส่วน domain อ่านไม่ได้
- `/admin` อ่านและแก้ policy ได้เฉพาะ admin ที่อีเมลยืนยันแล้ว
- รหัสผ่านอยู่ใน Firebase Authentication เท่านั้นและไม่ถูกเขียนลง Firestore

## ขอบเขตของรุ่นนี้

- Dashboard รวมข้อมูลที่ Firestore ส่งกลับใน browser จึงควรเพิ่ม server-side aggregate เมื่อข้อมูลมีปริมาณสูง
- การตรวจคำอธิบายเชิงลึกทำใน UI; rules ตรวจ schema ชั้นนอกและขนาดข้อมูล
- App Check ลด abuse แต่ไม่เท่ากับการพิสูจน์ตัวบุคคล

เมื่อปริมาณข้อมูลเกิน 500 รายการหรือจำเป็นต้องรับรองความถูกต้องแบบ authoritative ให้เพิ่ม Cloud Functions สำหรับ validate/aggregate โดยยังคงอยู่ในระบบ Firebase ได้
