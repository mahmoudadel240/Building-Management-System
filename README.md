# إدارة العمارات — Building Management System

واجهة React + Vite عربية (RTL) لإدارة العمارات، الشقق والسكان، التحصيلات، المصروفات والخزنة. البيانات والمصادقة على Supabase، والنشر على Vercel.

## التشغيل المحلي
- Node.js 20 أو أحدث
- `npm install`
- انسخ `.env.example` إلى `.env.local` وضع `VITE_SUPABASE_PUBLISHABLE_KEY`
- `npm run dev` للتشغيل، `npm run build` للبناء

## النشر على Vercel
- Framework: Vite — Build: `npm run build` — Output: `dist`
- متغيرات البيئة: `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY`
- أي push على `main` بيتنشر تلقائيًا.

## Supabase
- المشروع: `vebrbzqzjuqpsgcznbba` — قاعدة البيانات الحية هي المرجع للـ schema.
- `supabase/migrations/` التعديلات اللي اتطبقت على القاعدة.
- `supabase/functions/` كود الـ Edge Functions:
  - `login-with-username` — دخول باسم المستخدم **أو** البريد، مع حد للمحاولات.
  - `request-password-reset` — رابط إعادة تعيين كلمة المرور، مع حد للطلبات.
  - `invite-building-user` — إنشاء مستخدم وربطه بعمارة.

## المستحقات الشهرية
- كل شقة ليها مستحق شهري بقيمة اشتراك العمارة، بيتعمل تلقائي (`generate_monthly_dues`) لما مدير أو المالك يفتح النظام.
- لما المالك يعتمد دفعة، بتتخصم من أقدم شهور غير مسددة على الشقة، وبتدخل الخزنة.
- `apartment_balances` بيوضح كل شقة عليها كام.
- كل عملية بتتسجل في `audit_logs` وبتظهر في «سجل النشاط».

## الصلاحيات
- **Owner / Superuser**: كل العمارات، اعتماد التحصيلات والمصروفات.
- **Admin**: العمارة اللي هو مديرها (من `building_members`) — بيسجل تحصيلات ومصروفات ويضيف سكان، والاعتماد للمالك.
- **Resident**: الشقة المعتمدة له (من `apartment_residents`).
- كل الجداول عليها RLS، والمستخدم غير المسجل ملوش أي صلاحية على الجداول.
