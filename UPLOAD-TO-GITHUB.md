# رفع المشروع على GitHub

1. أنشئ Repository فارغًا باسم `Building-Management-System` أو افتح المستودع الحالي.
2. فك ضغط الملف ثم ارفع **محتويات** المجلد إلى جذر المستودع (بما فيها `src/` و`public/` و`supabase/` و`package.json`).
3. لا ترفع `.env` أو أي مفاتيح سرية. ملف `.env.example` للتوضيح فقط.
4. إعداد Vercel: Framework = Vite، Build command = `npm run build`، Output directory = `dist`.
5. أضف في Vercel Environment Variables: `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY`.

## حالة هذا التسليم
هذا أرشيف مصدر الواجهة الحالية وملفات إعداد Supabase الأولية. **الواجهة الحالية ما زالت Demo**: تستخدم بيانات ثابتة و`localStorage` ولا تنفذ Auth أو CRUD حقيقي عبر Supabase. لا تستخدمها لإدارة أموال أو بيانات سكان فعلية ولا تعتبر نجاح Build دليلًا على اكتمال النظام.

ملف `supabase-schema.sql` هو مخطط تأسيسي لمشروع Supabase جديد، وليس ترحيلًا مضمونًا لقاعدة البيانات الحية الحالية. لا تشغله على قاعدة البيانات الحالية قبل مطابقة أسماء الأعمدة والسياسات مع الـ schema الحي ومراجعة migration.

المطلوب قبل الإنتاج: مواءمة الواجهة مع الـ schema الحي، تنفيذ Auth وعمليات CRUD، اختبار RLS بحسابات Owner/Admin/Resident، اعتماد مالي ذري يرحّل للخزنة، audit log وتصحيح مالي دون حذف، ثم اختبار النشر النهائي.
