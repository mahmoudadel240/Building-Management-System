import React from 'react';
import { PageHead, Panel, Table } from '../components/ui';
import { money, dateTime, personName, ROLE_LABEL } from '../lib/format';

const ENTITY = {
  buildings: 'عمارة', apartments: 'شقة', building_members: 'صلاحية', apartment_residents: 'ربط ساكن',
  payments: 'تحصيل', expenses: 'مصروف', subscription_settings: 'اشتراك شهري',
};

// Turns one audit row into a short Arabic sentence.
function describe(r) {
  const n = r.new_data || {}, o = r.old_data || {};
  const statusChange = r.action === 'update' && n.status && n.status !== o.status;
  if (r.entity_table === 'payments') {
    if (r.action === 'insert') return `سجّل تحصيل ${money(n.amount)}`;
    if (statusChange) return `${n.status === 'approved' ? 'اعتمد' : 'رفض'} تحصيل ${money(n.amount)}`;
  }
  if (r.entity_table === 'expenses') {
    if (r.action === 'insert') return `سجّل مصروف «${n.title}» ${money(n.amount)}`;
    if (statusChange) return `${n.status === 'approved' ? 'اعتمد' : 'رفض'} مصروف «${n.title}»`;
  }
  if (r.entity_table === 'apartment_residents') {
    if (r.action === 'insert') return n.status === 'approved' ? 'ربط ساكن بشقة' : 'طلب ربط بشقة';
    if (statusChange) return { approved: 'وافق على ربط ساكن', rejected: 'رفض طلب ربط', voided: 'فك ربط ساكن' }[n.status] || 'عدّل ربط ساكن';
  }
  if (r.entity_table === 'building_members') {
    if (r.action === 'insert') return `أضاف ${ROLE_LABEL[n.member_role] || 'عضو'}`;
    if (r.action === 'delete') return 'شال مستخدم من العمارة';
    if (n.member_role !== o.member_role) return `غيّر الصلاحية إلى ${ROLE_LABEL[n.member_role]}`;
  }
  if (r.entity_table === 'subscription_settings' && r.action === 'update') return `غيّر الاشتراك من ${money(o.monthly_amount)} إلى ${money(n.monthly_amount)}`;
  if (r.entity_table === 'apartments' && r.action === 'insert') return `أضاف شقة ${n.unit_number}`;
  if (r.entity_table === 'buildings' && r.action === 'insert') return `أضاف عمارة «${n.name}»`;
  const verb = { insert: 'أضاف', update: 'عدّل', delete: 'حذف' }[r.action] || r.action;
  return `${verb} ${ENTITY[r.entity_table] || r.entity_table}`;
}

export default function Activity({ data, scoped }) {
  const rows = data.audit.filter((r) => !r.building_id || scoped.ids.has(r.building_id));
  const bName = (id) => data.buildings.find((b) => b.id === id)?.name || '—';
  const who = (id) => (id ? personName(data.profiles.find((p) => p.id === id)) : 'النظام');

  return (
    <>
      <PageHead title="سجل النشاط" subtitle="آخر العمليات اللي حصلت — مين عمل إيه وإمتى" />
      <Panel>
        <Table empty="مفيش نشاط مسجل لسه" headers={['الوقت', 'المستخدم', 'العملية', 'العمارة']} rows={rows.map((r) => (
          <tr key={r.id}>
            <td>{dateTime(r.created_at)}</td>
            <td><b>{who(r.actor_id)}</b></td>
            <td>{describe(r)}</td>
            <td>{bName(r.building_id)}</td>
          </tr>
        ))} />
      </Panel>
    </>
  );
}
