# Worker หลังบ้านของหน้า /edit

Worker ตัวนี้คือ "ประตู" ของหน้า `/edit` ทำหน้าที่ตรวจรหัส PIN แล้วบันทึกเนื้อหาลง repo เป็น commit
ให้เอง **GitHub token เก็บอยู่ที่นี่ที่เดียว** ไม่อยู่ในหน้าเว็บและไม่อยู่ในไฟล์ใด ๆ ของ repo

ทำครั้งเดียวตามลำดับด้านล่าง ใช้เวลาประมาณ 15 นาที ไม่ต้องจ่ายเงิน (ใช้แพ็กเกจฟรีของ Cloudflare)

สิ่งที่ต้องมีก่อน: Node.js 20 ขึ้นไป และบัญชี Cloudflare (สมัครฟรีที่ https://dash.cloudflare.com/sign-up)

เปิด terminal แล้วเข้าโฟลเดอร์นี้ก่อนทำทุกข้อ

```
cd worker
npm install
```

## 1. สร้าง GitHub token (สิทธิ์เล็กที่สุดที่ใช้ได้)

1. เข้า GitHub แล้วล็อกอินบัญชี `Warayuth014`
2. คลิกรูปโปรไฟล์มุมขวาบน แล้วเลือก **Settings**
3. เลื่อนซ้ายมือลงล่างสุด คลิก **Developer settings**
4. คลิก **Personal access tokens** แล้วเลือก **Fine-grained tokens**
5. คลิกปุ่ม **Generate new token**
6. **Token name**: ตั้งชื่ออะไรก็ได้ เช่น `site-editor`
7. **Expiration**: เลือกตามสะดวก (แนะนำ 1 ปี และจดไว้ว่าต้องมาสร้างใหม่ตอนหมดอายุ)
8. **Repository access**: เลือก **Only select repositories** แล้วเลือก `Warayuth014/Warayuth014.github.io` อันเดียวเท่านั้น
9. **Permissions**: คลิก **Repository permissions** แล้วตั้งค่า
   - **Contents**: Read and write
   - **Metadata**: Read-only (GitHub ตั้งให้อัตโนมัติ)
   - สิทธิ์อื่นปล่อยเป็น No access ทั้งหมด
10. คลิก **Generate token** แล้วคัดลอกข้อความที่ขึ้นต้นด้วย `github_pat_...` เก็บไว้ชั่วคราว (หน้านี้จะแสดงครั้งเดียว)

## 2. เข้าสู่ระบบ Cloudflare

```
npx wrangler login
```

เบราว์เซอร์จะเปิดขึ้น กด **Allow** เมื่อกลับมาที่ terminal จะขึ้นว่า login สำเร็จ

## 3. สร้างที่เก็บข้อมูล (KV) แล้วใส่ id ลง wrangler.toml

```
npx wrangler kv namespace create STATE
```

terminal จะแสดงบรรทัดประมาณนี้

```
id = "0123456789abcdef0123456789abcdef"
```

เปิดไฟล์ `wrangler.toml` หาบรรทัด `id = "REPLACE_WITH_KV_ID"` แล้วแทนที่ข้อความ `REPLACE_WITH_KV_ID`
ด้วย id ที่ได้ (เก็บเครื่องหมายคำพูดไว้) บันทึกไฟล์ (id นี้ไม่ใช่ความลับ commit ได้)

## 4. ใส่ความลับ 2 ตัว

ตัวแรกคือ GitHub token จากข้อ 1

```
npx wrangler secret put GITHUB_TOKEN
```

วางข้อความ `github_pat_...` ตอนที่ถามแล้วกด Enter (ตอนวางจะไม่เห็นตัวอักษร เป็นเรื่องปกติ)

ตัวที่สองคือกุญแจสำหรับเซ็นชื่อ session ให้สุ่มขึ้นมาใหม่ด้วยคำสั่งนี้ แล้วคัดลอกผลลัพธ์

```
node -e "console.log(crypto.randomBytes(32).toString('base64'))"
```

```
npx wrangler secret put SESSION_SECRET
```

วางผลลัพธ์ที่คัดลอกมา แล้วกด Enter (ไม่ต้องจำค่านี้ ไม่มีใครต้องใช้อีก)

## 5. ตั้ง PIN ครั้งแรก

```
node scripts/set-password.mjs
```

พิมพ์ PIN ที่ต้องการ (6 ถึง 128 ตัวอักษร) แล้วกด Enter ระบบเก็บเฉพาะค่าที่แปลงแล้วแบบทางเดียว ไม่เก็บ PIN จริง

หมายเหตุ: ตอนพิมพ์จะมองเห็นตัวอักษร ให้ดูว่าไม่มีใครมองจอ

## 6. Deploy

```
npx wrangler deploy
```

เมื่อเสร็จจะแสดง URL ของ Worker เช่น `https://warayuth-site-editor.<ชื่อบัญชี>.workers.dev`
ลองเปิด `<URL>/health` ในเบราว์เซอร์ ต้องเห็น `{"ok":true}`

## 7. เอา URL ไปใส่ในหน้า /edit

1. เปิด `https://warayuth014.github.io/edit/`
2. ไปที่ **ตั้งค่า (Settings)** แล้วใส่ URL ของ Worker ในช่อง Worker URL
3. ใส่ PIN ที่ตั้งไว้ในข้อ 5 เพื่อเข้าสู่ระบบ

เมื่อบันทึกแต่ละครั้ง เว็บจริงจะอัปเดตภายในประมาณ 1 นาที (รอ GitHub Pages ทำงาน)

---

## ลืมรหัส / ถูกล็อก

**ถูกล็อก** เกิดเมื่อใส่ PIN ผิด 5 ครั้งจาก IP เดียวกัน (รอ 15 นาทีแล้วจะลองได้อีก)
หรือมีคนใส่ผิดรวมกันเกิน 50 ครั้งในชั่วโมงเดียว (ทุกคนต้องรอจนหมดชั่วโมงนั้น)
ไม่อยากรอ ให้ล้างตัวนับด้วยคำสั่งนี้

```
node scripts/set-password.mjs --reset-locks
```

คำสั่งนี้ล้างตัวนับรวมของชั่วโมงปัจจุบัน ถ้าต้องล้างของ IP ที่ถูกล็อกด้วย ให้ใส่ IP ต่อท้าย

```
node scripts/set-password.mjs --reset-locks --ip 203.0.113.7
```

(IP ของตัวเองดูได้ที่ https://api.ipify.org)

**ลืมรหัส** ตั้งใหม่ได้เลยโดยไม่ต้องรู้รหัสเดิม

```
node scripts/set-password.mjs
```

PIN ใหม่ใช้ได้ทันที แต่ถ้าสงสัยว่ามีคนอื่นเข้าอยู่ ให้เข้า `/edit` ด้วย PIN ใหม่แล้วใช้เมนูเปลี่ยนรหัสอีกรอบ
เพราะการเปลี่ยนรหัสจากในหน้า `/edit` จะทำให้ทุกเครื่องที่ล็อกอินอยู่หลุดออกทันที

## ทดสอบในเครื่อง (ไม่บังคับ)

```
npm test
node scripts/set-password.mjs --local
npx wrangler dev --local --var SESSION_SECRET:ใส่อะไรก็ได้ GITHUB_TOKEN:dummy
```

คำสั่งที่มี `--local` ใช้ที่เก็บข้อมูลจำลองในเครื่อง ไม่แตะของจริงบน Cloudflare
ถ้าไม่ใส่ `--local` คำสั่ง `set-password.mjs` จะเขียนลงของจริงเสมอ

## เมื่อ GitHub token หมดอายุหรือรั่ว

สร้าง token ใหม่ตามข้อ 1 แล้วรัน `npx wrangler secret put GITHUB_TOKEN` ใหม่ ไม่ต้อง deploy ซ้ำ
ถ้า token เก่ารั่ว ให้ไปที่หน้า Fine-grained tokens แล้วกด Delete ของเก่าด้วย
