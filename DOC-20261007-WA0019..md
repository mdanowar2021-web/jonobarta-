# JonoBarta News CMS v2

পূর্ণাঙ্গ নিউজ পোর্টাল + Admin CMS।

## Features
- Admin Login / session
- PostgreSQL/Supabase online database support
- Live news publish/draft
- Cloudinary image hosting
- Public SEO-friendly news URLs: `/news/<slug>`
- News Edit/Delete
- Reporter Management
- Category, Featured, Breaking News
- Search, view counter, responsive mobile UI

## Local run
1. Node.js 18+ install করুন
2. `npm install`
3. `.env.example` কপি করে `.env` বানান
4. PostgreSQL/Supabase `DATABASE_URL` দিন
5. Cloudinary credentials দিন
6. `npm start`
7. Chrome: `http://localhost:3000`

## Default admin
Username: `admin`
Password: `ChangeMe123!` (শুধু fallback; production-এ অবশ্যই ADMIN_PASSWORD সেট করুন)

## Online deployment
Render / Railway / VPS / অন্য Node.js hosting-এ deploy করা যাবে। Environment variables-এ `.env`-এর values দিন। Supabase PostgreSQL database এবং Cloudinary image hosting ব্যবহার করলে database ও images online থাকবে।

### Important
এই ZIP নিজে থেকে public internet URL তৈরি করে না। Hosting + database + Cloudinary credentials বসানোর পর deployment করতে হবে।
