# คู่มือติดตั้ง Firebase

## 1. สิ่งที่ต้องสร้างใน Firebase Console

1. สร้าง Firebase project หนึ่งโครงการ
2. เพิ่ม Web app แล้วคัดลอก Firebase config
3. เปิด Cloud Firestore แบบ Standard และเลือก region ใกล้ผู้ใช้หลัก
4. เปิด Firebase Authentication > Sign-in method > Google และเลือกอีเมลสนับสนุนโครงการ
5. เปิด Firebase Hosting
6. สร้าง reCAPTCHA Enterprise website key สำหรับโดเมนจริง แล้วลงทะเบียน Web app ที่หน้า App Check
7. หลังทดสอบว่า App Check ส่ง token สำเร็จ ให้เปิด enforcement สำหรับ Cloud Firestore

## 2. ตั้งค่า environment

คัดลอกไฟล์ตัวอย่าง:

```bash
cp .env.firebase.example .env.local
```

กรอกค่าจาก Firebase Console > Project settings > Your apps > Web app:

| ตัวแปร | แหล่งที่มา |
|---|---|
| `VITE_DATA_PROVIDER` | ใช้ค่า `firestore` |
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |
| `VITE_FIREBASE_APPCHECK_SITE_KEY` | reCAPTCHA Enterprise site key — เว้นว่างได้เฉพาะรอบทดสอบแรก |

ค่า Firebase Web config ถูกส่งไปกับ JavaScript อยู่แล้ว จึงไม่ใช่รหัสผ่าน สิ่งที่ควบคุมสิทธิ์จริงคือ `firestore.rules` และ App Check ห้ามนำ service-account JSON มาใส่ในตัวแปร `VITE_*` หรือ commit ลง Git

## 3. Build และทดสอบ

```bash
npm ci
npm run firebase:build
npm run firebase:serve
```

ก่อนใช้ emulator ให้เปลี่ยน `VITE_FIREBASE_USE_EMULATORS=true` ใน `.env.local` ระบบจะข้าม App Check และเชื่อม Firestore ที่เครื่องแทน project จริง เมื่อจะ build production ต้องเปลี่ยนกลับเป็น `false` รอบทดสอบ Firebase Hosting ครั้งแรกสามารถเว้น App Check site key ได้ แต่ยังไม่ควรนำ URL ไปเผยแพร่ในวงกว้าง

## 4. ผูก project และ deploy

โครงการนี้ผูก `.firebaserc` ไว้กับ `tcc-safe-travel` แล้ว

Windows ใช้สคริปต์ที่ตรวจโค้ด Deploy และ Smoke test ต่อเนื่อง:

```powershell
.\scripts\deploy-firebase.ps1
```

หรือใช้คำสั่งมาตรฐาน:

```bash
firebase login
firebase use tcc-safe-travel
npm run firebase:release
```

คำสั่ง deploy จะทำสามอย่างพร้อมกัน:

1. ตรวจว่า `.env.local` ครบ ไม่มี placeholder และไม่ได้เปิด emulator mode
2. build เว็บ static ไปที่ `firebase-dist/`
3. deploy Firebase Hosting โดย rewrite ทุก route ไป `index.html` จึงเปิด `/dashboard` โดยตรงได้
4. deploy Firestore rules และ indexes

## 5. App Check ก่อนเปิดใช้จริง

1. ใส่โดเมน `web.app`, `firebaseapp.com` และ custom domain ใน reCAPTCHA Enterprise key
2. ใส่ site key ใน `VITE_FIREBASE_APPCHECK_SITE_KEY`
3. deploy เว็บและตรวจ metrics ที่ Firebase Console > App Check
4. เมื่อคำขอที่ถูกต้องขึ้นเป็น verified แล้วจึงเปิด enforcement สำหรับ Firestore

App Check ไม่มีหน้าให้ผู้ใช้แก้โจทย์ captcha แต่ทำงานเบื้องหลัง จึงเหมาะกับกลุ่มผู้ใช้ 40+

## 6. กฎการเข้าถึงข้อมูล

- หน้าแบบประเมินเปิดให้กรอกได้โดยไม่ต้องสมัครสมาชิกหรือล็อกอิน
- ผู้ใช้ต้องยืนยันให้นำข้อมูลสรุปไปใช้ใน Dashboard ของโครงการ
- หน้า `/dashboard` ต้องเข้าสู่ระบบด้วย Google และ Firestore rules ตรวจ provider ซ้ำอีกชั้น
- ชื่อผู้ประเมินเก็บแยกใน collection `submission_assessors` ซึ่ง client อ่านไม่ได้ และไม่แสดงบน Dashboard
- ไม่เก็บข้อมูลติดต่อ เลขทะเบียนรถ หรือข้อมูลส่วนบุคคลของนักเรียน
- Firestore เปิดอ่าน collection `submissions` เฉพาะคำขอที่มี Google ID token
- client สร้างเอกสารได้ครั้งเดียวตาม schema แต่แก้ไขหรือลบไม่ได้
- อย่าเปิดกฎ `allow read, write: if true` ทั้งฐานข้อมูล

Google Sign-In รุ่นนี้ใช้ยืนยันตัวตนแต่ยังไม่จำกัดรายชื่ออีเมล หากต้องให้เฉพาะเจ้าหน้าที่บางคนเข้าใช้ ให้เพิ่ม allowlist หรือ custom claims ภายหลัง

## 7. Deployment โดยไม่ใช้ GitHub Actions

GitHub ใช้เก็บ source code เท่านั้น การ Deploy ทำตรงจากเครื่องผู้พัฒนาหรือ Google Cloud Shell จึงไม่ใช้ Actions minutes

```bash
npm run firebase:release
```

ห้าม commit `.env.local`, service-account JSON หรือ token ลง GitHub

## 8. ตรวจหลัง Deploy

สคริปต์ `firebase:release` จะตรวจอัตโนมัติว่า:

1. หน้า `/` ตอบกลับ HTTP 200 และเป็น SPA ของระบบ
2. หน้า `/dashboard` เปิดตรงได้โดยไม่เป็น 404
3. Hosting ส่ง security header สำคัญ
4. Firebase init config ชี้ไป project `tcc-safe-travel`

จากนั้นทดสอบด้วยผู้ใช้จริงเพิ่มเติม:

1. เปิดหน้าแบบประเมินโดยไม่ล็อกอิน เลือกจังหวัดและค้นหาสถานศึกษา
2. เว้นช่องที่ระบุว่าไม่บังคับ ตอบแบบประเมินหนึ่งชุด และตรวจผล/คำแนะนำรายข้อ
3. ส่งผลและตรวจว่ามีเอกสารใหม่ใน `submissions` และ `submission_assessors`
4. เปิด `/dashboard` ใน Incognito ต้องเห็นหน้าขอ Google Login ก่อน
5. หลัง Login ต้องเห็นข้อมูลสรุป แต่ต้องไม่เห็นชื่อผู้ประเมิน
