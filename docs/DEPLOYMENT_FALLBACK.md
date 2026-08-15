# แผนสำรองการ Deploy และฐานข้อมูล

## ทางเลือกหลัก: Firebase

- Static SPA บน Firebase Hosting
- Cloud Firestore เก็บผลประเมิน
- Google Authentication ป้องกัน `/dashboard`
- App Check ลดการส่งข้อมูลจากเว็บไซต์หรือสคริปต์ที่ไม่ได้รับอนุญาต
- Deploy ตรงด้วย Firebase CLI โดยไม่ใช้ GitHub Actions

ให้ใช้ Firebase ต่อเมื่อ Hosting, Authentication, Firestore rules และการส่งแบบประเมินผ่านการทดสอบปลายทางครบ

## เงื่อนไขที่ค่อยเปลี่ยนเป็น Vercel + PostgreSQL

เปลี่ยนเมื่อพบข้อจำกัดที่แก้ไม่ได้หรือไม่เหมาะสมจริง เช่น นโยบายองค์กรบังคับ relational database, ต้องทำรายงานเชิงสัมพันธ์ซับซ้อนมาก หรือ Firebase deployment/สิทธิ์โครงการไม่สามารถใช้งานได้หลังตรวจการตั้งค่าครบแล้ว

สถาปัตยกรรมปัจจุบันแยก UI, scoring และ repository connector ออกจากกัน จึงคงหน้าประเมิน สูตรคะแนน และ Dashboard เดิม แล้วเปลี่ยนเฉพาะชั้นข้อมูลเป็น:

- Vercel Hosting
- PostgreSQL
- API สำหรับ public submission
- Google OAuth สำหรับ Dashboard
- Row-level authorization และ migration schema

ไม่ควรเปิดใช้ Firebase และ PostgreSQL รับข้อมูลจริงพร้อมกัน เพราะจะเกิดข้อมูลซ้ำและต้องแก้ปัญหา reconciliation โดยไม่จำเป็น
