# Building Management System

واجهة عربية أولية لإدارة عمارة من 33 شقة باستخدام React + Vite.

## التشغيل
1. فك ضغط الملف وافتح المجلد في VS Code.
2. افتح Terminal من داخل المجلد.
3. شغّل:

```bash
npm install
npm run dev
```

4. افتح عنوان localhost الظاهر في الطرفية.

## Supabase
- انسخ `.env.example` إلى `.env.local`.
- أضف Project URL وPublishable Key من لوحة Supabase.
- أعد تشغيل `npm run dev`.

التطبيق الحالي واجهة تجريبية؛ التسجيلات داخلها لا تُحفظ في قاعدة بيانات Supabase بعد. ملف `supabase/schema.sql` نقطة بداية لمخطط البيانات، ويجب مراجعة سياسات الصلاحيات واختبارها قبل إدخال بيانات حقيقية.

لا تضع مطلقًا `service_role` أو Secret Key في ملفات الواجهة أو متغيرات `VITE_`.
