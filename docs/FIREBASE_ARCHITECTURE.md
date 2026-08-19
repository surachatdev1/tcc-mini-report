# Firebase architecture

## เส้นทางข้อมูล

```text
ผู้ประเมินสาธารณะ
  └─ Firebase Hosting (/)
       ├─ localStorage: ร่างที่ยังไม่ยืนยัน
       └─ Firestore atomic batch
            ├─ submissions/{UUID}: คำตอบดิบและบริบทแบบประเมิน
            └─ submission_assessors/{UUID}: ชื่อ บทบาท ตำแหน่ง และเบอร์โทร

เจ้าหน้าที่ที่ได้รับอนุญาต
  └─ /dashboard → Google Sign-In → Firestore Rules
       ├─ Admin: อีเมลเจ้าของโครงการ 2 บัญชี
       └─ Viewer: dashboard_members/{email}.active == true

Admin เจ้าของโครงการ
  └─ /admin
       ├─ เพิ่ม ค้นหา และลบ dashboard_members รายอีเมล
       └─ ค้นหาและลบความคิดเห็นรายรายการหรือทั้งหมด โดยคงคะแนนเดิม
```

## เหตุผลที่เลือก Firestore

รุ่นนี้เก็บผลประเมินหนึ่งเอกสารต่อการส่ง ตัวกรองหลักคือจังหวัดและประเภทแบบประเมิน จึงยังไม่ต้องใช้ relational join หรือดูแล Cloud SQL เพิ่ม Firestore ทำให้ Hosting, Authentication, Security Rules และฐานข้อมูลอยู่ใน Firebase project เดียวกัน

หากภายหลังต้องทำ BI ข้ามหลายตารางหรือมีข้อมูลอ้างอิงเชิงสัมพันธ์จำนวนมาก ค่อยประเมิน PostgreSQL/SQL Connect อีกครั้ง

## Collections

### `submissions/{idempotencyKey}`

- เก็บ consent, สถานศึกษา, จังหวัด, วันที่, ประเภทแบบประเมิน และคำตอบดิบ
- ไม่เชื่อคะแนนรวมจาก client; Dashboard คำนวณใหม่จาก rubric ใน source code
- public create ตาม schema; บุคคลทั่วไปและ Viewer แก้ไข/ลบไม่ได้
- Admin แก้ไขได้เฉพาะ `explanation` จากข้อความเดิมเป็นค่าว่าง โดย Rules ยืนยันว่าคะแนนและข้อมูลส่วนอื่นไม่เปลี่ยน
- การลบทั้งหมดยังแบ่ง Firestore batch ครั้งละไม่เกิน 400 เอกสาร

### `submission_assessors/{idempotencyKey}`

- เก็บชื่อผู้ประเมิน เบอร์โทร บทบาท และตำแหน่ง
- สร้างใน atomic batch เดียวกับ `submissions`
- อ่านได้เฉพาะ Admin/Viewer ที่ยืนยันอีเมลแล้ว

### `dashboard_members/{email}`

- ใช้อีเมลตัวพิมพ์เล็กเป็น document ID
- เก็บ `displayName`, `active`, `createdAt`, `createdBy` และ `authMethod: google`
- Viewer อ่านได้เฉพาะ policy ของตนเอง
- Admin สองบัญชีเท่านั้นที่ list/create/update/delete ได้

### `benchmarks/{topic--agency--scope}`

- เก็บจำนวนผลประเมิน ค่าเฉลี่ย ค่ามัธยฐาน จำนวนระดับ A–D และค่ามัธยฐานรายหมวด
- ไม่มีชื่อ เบอร์โทร สถานศึกษา หรือคำตอบรายบุคคล
- เปิดอ่านสาธารณะเพื่อแสดงกราฟหลังส่งแบบประเมิน
- Admin อัปเดตจาก Dashboard และเผยแพร่เฉพาะกลุ่มที่มีอย่างน้อย 10 รายการ

## สิทธิ์ที่ Freeze

| บทบาท | แบบประเมิน | Dashboard | จัดการ Viewer | ลบความคิดเห็น | อัปเดตค่ากลาง |
|---|---:|---:|---:|---:|---:|
| บุคคลทั่วไป | ส่งได้ | ไม่ได้ | ไม่ได้ | ไม่ได้ | ไม่ได้ |
| Viewer รายอีเมล | ส่งได้ | ดู/Export ได้ | ไม่ได้ | ไม่ได้ | ไม่ได้ |
| Admin เจ้าของโครงการ | ส่งได้ | ดู/Export ได้ | ได้ | ได้ | ได้ |

ไม่มี Email/Password, สิทธิ์ระดับโดเมน, การสร้างบัญชี หรือ Admin หลายชั้นในรุ่นนี้

## ขอบเขตด้านประสิทธิภาพ

Dashboard รวมข้อมูลที่ Firestore ส่งกลับใน browser เหมาะกับรุ่นนำร่อง เมื่อจำนวนผลประเมินสูงมากหรือจำเป็นต้องมีรายงาน authoritative ให้เพิ่ม server-side aggregate ผ่าน Cloud Functions โดยยังคงใช้ Firebase ได้
