# Firebase architecture

## เส้นทางข้อมูล

```text
ผู้ประเมินสาธารณะ
  └─ Firebase Hosting (/, /dashboard)
       ├─ localStorage: ร่างที่ยังไม่ยืนยัน
       └─ Firebase Web SDK + App Check
            ├─ Firestore /submissions/{UUID}
            │    ├─ ผลประเมินและคำตอบ: read public
            │    ├─ create: schema + consent + server timestamp
            │    └─ update/delete: denied
            └─ Firestore /submission_assessors/{UUID}
                 ├─ ชื่อผู้ประเมิน: create only
                 └─ read/update/delete จาก client: denied

/dashboard
  └─ อ่านสูงสุด 500 รายการล่าสุด
       └─ ตรวจรูปแบบคำตอบ + คำนวณคะแนนใหม่จาก rubric ใน source code
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

## ขอบเขตของรุ่นนี้

- Dashboard รวมข้อมูลใน browser สูงสุด 500 รายการล่าสุด
- การตรวจคำอธิบายเชิงลึกทำใน UI; rules ตรวจ schema ชั้นนอกและขนาดข้อมูล
- App Check ลด abuse แต่ไม่เท่ากับการพิสูจน์ตัวบุคคล

เมื่อปริมาณข้อมูลเกิน 500 รายการหรือจำเป็นต้องรับรองความถูกต้องแบบ authoritative ให้เพิ่ม Cloud Functions สำหรับ validate/aggregate โดยยังคงอยู่ในระบบ Firebase ได้
