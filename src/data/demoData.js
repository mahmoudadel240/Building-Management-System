const names = ['أحمد محمد','مريم علي','محمد حسن','سارة محمود','كريم إبراهيم','منى خالد','يوسف أحمد','نور سمير','هاني عادل','داليا طارق','عمر شريف','ندى أحمد']
export const initialApartments = Array.from({ length: 33 }, (_, i) => ({
  id: i + 1, number: i + 1, floor: Math.ceil((i + 1) / 3),
  owner: names[i % names.length], resident: names[(i + 3) % names.length],
  monthlyFee: 500, extraFee: (i + 1) % 7 === 0 ? 100 : 0,
  arrears: (i + 1) % 5 === 0 ? 1000 : (i + 1) % 4 === 0 ? 250 : 0
}))
export const initialPayments = [
  { id: 1, apartment: 1, date: '2026-10-02', amount: 500, method: 'نقدي', status: 'معتمد', note: 'اشتراك أكتوبر' },
  { id: 2, apartment: 2, date: '2026-10-04', amount: 500, method: 'تحويل بنكي', status: 'معتمد', note: 'اشتراك أكتوبر' },
  { id: 3, apartment: 4, date: '2026-10-05', amount: 250, method: 'محفظة إلكترونية', status: 'قيد المراجعة', note: 'دفعة جزئية' },
  { id: 4, apartment: 7, date: '2026-10-07', amount: 600, method: 'نقدي', status: 'معتمد', note: 'اشتراك + إضافة' }
]
export const initialExpenses = [
  { id: 1, date: '2026-10-03', category: 'صيانة الأسانسير', description: 'الصيانة الدورية', amount: 1800, paidTo: 'شركة الصيانة', method: 'تحويل بنكي' },
  { id: 2, date: '2026-10-06', category: 'النظافة', description: 'مستلزمات نظافة', amount: 450, paidTo: 'مورد مستلزمات', method: 'نقدي' },
  { id: 3, date: '2026-10-10', category: 'كهرباء مشتركة', description: 'فاتورة كهرباء المدخل', amount: 720, paidTo: 'شركة الكهرباء', method: 'نقدي' }
]
