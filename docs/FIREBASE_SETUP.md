# คู่มือติดตั้ง Firebase

## ขอบเขตระบบที่ Freeze

- `/` เป็นแบบประเมินสาธารณะ ไม่ต้องล็อกอิน
- `/dashboard` ใช้ Google Sign-In และเปิดเฉพาะ Admin หรืออีเมลที่ Admin เพิ่มไว้
- `/admin` เปิดเฉพาะ Admin เจ้าของโครงการ ใช้จัดการอีเมลผู้มีสิทธิ์ดู Dashboard และลบความคิดเห็น/เหตุผลประกอบจากผลประเมิน
- ไม่ใช้ Email/Password, การสมัครสมาชิก, สิทธิ์ระดับโดเมน หรือ Admin หลายชั้น

Admin เจ้าของโครงการถูกกำหนดถาวรในโค้ดและ Firestore Rules เพื่อป้องกันระบบไม่มีผู้ดูแล:

- `surachat.dev1@gmail.com`
- `nuonnaka@gmail.com`

## 1. ตั้งค่า Firebase Console

1. เปิด Cloud Firestore แบบ Standard และเลือก region ใกล้ผู้ใช้หลัก
2. เปิด Firebase Authentication > Sign-in method > Google และเลือกอีเมลสนับสนุนโครงการ
3. ตรวจว่า `tcc-safe-travel.web.app` และ `tcc-safe-travel.firebaseapp.com` อยู่ใน Authentication > Settings > Authorized domains
4. เปิด Firebase Hosting
5. ก่อนเผยแพร่ในวงกว้าง ให้ตั้ง Firebase App Check ด้วย reCAPTCHA Enterprise แล้วค่อยเปิด enforcement สำหรับ Firestore

ไม่ต้องเปิด Email/Password เพราะระบบใช้ Google Sign-In เพียงวิธีเดียว

## 2. ตั้งค่า environment

```bash
cp .env.firebase.example .env.local
```

กรอกค่าจาก Firebase Console > Project settings > Your apps > Web app:

| ตัวแปร | ค่า |
|---|---|
| `VITE_DATA_PROVIDER` | `firestore` |
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `tcc-safe-travel.web.app` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |
| `VITE_FIREBASE_APPCHECK_SITE_KEY` | reCAPTCHA Enterprise site key; เว้นว่างได้เฉพาะรอบทดสอบ |

Firebase Web config ไม่ใช่รหัสผ่าน สิ่งที่ควบคุมสิทธิ์จริงคือ `firestore.rules` และ App Check ห้ามใส่ service-account JSON ในตัวแปร `VITE_*` หรือ commit ลง Git

## 3. Build, test และ deploy

โครงการผูก `.firebaserc` ไว้กับ `tcc-safe-travel` แล้ว ให้รันจากโฟลเดอร์ที่มี `firebase.json`:

```bash
npm ci
firebase login
firebase use tcc-safe-travel
npm run firebase:release
```

`firebase:release` จะตรวจ environment, lint, tests, build, deploy Hosting/Rules/Indexes และ smoke test `/`, `/dashboard`, `/admin`

หาก Hosting upload ขาดช่วง ให้รันใหม่เฉพาะ Hosting ได้โดยไม่เสียข้อมูล:

```bash
firebase deploy --only hosting --project tcc-safe-travel
npm run firebase:smoke
```

## 4. กฎการเข้าถึง

- ผู้ประเมินสร้างผลใหม่ได้ตาม schema แต่แก้ไขหรือลบจาก client ไม่ได้
- Admin สองบัญชีอ่าน Dashboard, จัดการ `dashboard_members`, ลบเฉพาะข้อความประกอบ และอัปเดตค่ากลางได้
- การลบความคิดเห็นตั้งค่า `answers.{questionId}.explanation` เป็นข้อความว่าง โดย Rules บังคับให้คะแนนและข้อมูลผลประเมินส่วนอื่นคงเดิม
- Viewer ต้องยืนยัน Google email และมีเอกสาร `dashboard_members/{email}` ที่ `active: true`
- การมี Firebase Auth account อย่างเดียวไม่ทำให้เห็น Dashboard
- ชื่อ บทบาท ตำแหน่ง และเบอร์โทรเก็บแยกใน `submission_assessors` และเปิดอ่านเฉพาะ Admin/Viewer
- อย่าใช้กฎ `allow read, write: if true`

หน้า `/admin` ซ่อนจากเมนูสาธารณะ เข้าโดย URL โดยตรง หรือจากปุ่ม “จัดการผู้มีสิทธิ์” ซึ่งแสดงหลัง Admin เข้าสู่ Dashboard แล้วเท่านั้น

## 5. Google Sign-In และ redirect URI

ระบบใช้ redirect บนมือถือและ popup บนเดสก์ท็อป เบราว์เซอร์ใน Messenger, Facebook, LINE หรือ Instagram อาจปิดกั้น OAuth ระบบจึงแนะนำให้คัดลอกลิงก์ไปเปิดใน Safari/Chrome

หากพบ `redirect_uri_mismatch` ให้เพิ่มค่าต่อไปนี้ใน Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs ของ Firebase Web Client

**Authorized JavaScript origins**

```text
https://tcc-safe-travel.web.app
https://tcc-safe-travel.firebaseapp.com
```

**Authorized redirect URIs**

```text
https://tcc-safe-travel.web.app/__/auth/handler
https://tcc-safe-travel.firebaseapp.com/__/auth/handler
```

การตั้งค่านี้แก้ด้วยการ Deploy Hosting ไม่ได้ หลังบันทึกอาจต้องรอประมาณ 5 นาทีแล้วทดสอบใหม่ในหน้าต่าง Incognito

## 6. Checklist หลัง Deploy

1. เปิด `/` โดยไม่ล็อกอินและส่งแบบประเมินหนึ่งชุด
2. ตรวจเอกสารใหม่ใน `submissions` และ `submission_assessors`
3. เปิด `/dashboard` ด้วยบัญชีที่ไม่อนุญาต ต้องเห็นข้อความว่าไม่มีสิทธิ์
4. เปิด `/admin` ด้วย Admin แล้วเพิ่มอีเมล Viewer
5. ล็อกอิน `/dashboard` ด้วย Viewer ที่เพิ่มไว้ ต้องเห็นข้อมูลจริง ชื่อผู้ประเมิน และส่งออก Excel ได้
6. ลบ Viewer จาก `/admin` แล้วตรวจว่าบัญชีนั้นอ่าน Dashboard ไม่ได้ทันที
7. เปิด Dashboard ด้วย Admin แล้วกด “อัปเดตค่ากลาง” เพื่อเผยแพร่ benchmark เฉพาะกลุ่มที่มีอย่างน้อย 10 ผลประเมิน
8. เปิดส่วน “จัดการความคิดเห็นและเหตุผลประกอบ” ใน `/admin` ทดสอบลบหนึ่งรายการและยกเลิกในหน้าต่างยืนยัน
9. ยืนยันว่าข้อความหายจาก Admin/Dashboard แต่คะแนนและผลสรุปของแบบประเมินเดิมไม่เปลี่ยน
10. ตรวจ Desktop/Mobile และทดสอบลิงก์จาก Messenger ว่ามีคำแนะนำให้เปิด Safari/Chrome
