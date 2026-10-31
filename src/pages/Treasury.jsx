import React from 'react';
import { PageHead, Panel, Table, Stat } from '../components/ui';
import { money, dateTime } from '../lib/format';
import { treasuryBalance } from '../lib/stats';

export default function Treasury({ data, scoped }) {
  const rows = data.transactions.filter(scoped.has);
  const inSum = rows.filter((t) => t.direction === 'in').reduce((s, t) => s + Number(t.amount), 0);
  const outSum = rows.filter((t) => t.direction === 'out').reduce((s, t) => s + Number(t.amount), 0);
  const bName = (id) => data.buildings.find((b) => b.id === id)?.name;

  return (
    <>
      <PageHead title="الخزنة" subtitle="الحركات المعتمدة بس هي اللي بتأثر على الرصيد" />
      <div className="stats">
        <Stat big label="الرصيد الحالي" value={money(treasuryBalance(data, scoped.has))} />
        <Stat label="إجمالي الوارد" value={money(inSum)} tone="good" />
        <Stat label="إجمالي المنصرف" value={money(outSum)} tone="warn" />
      </div>
      {scoped.buildings.length > 1 && (
        <Panel title="رصيد كل عمارة">
          <Table headers={['العمارة', 'الرصيد']} rows={scoped.buildings.map((b) => (
            <tr key={b.id}><td>{b.name}</td><td><b>{money(treasuryBalance(data, (r) => r.building_id === b.id))}</b></td></tr>
          ))} />
        </Panel>
      )}
      <Panel title="الحركات">
        <Table empty="مفيش حركات لسه" headers={['التاريخ', 'العمارة', 'البيان', 'وارد', 'منصرف']} rows={rows.map((t) => (
          <tr key={t.id}>
            <td>{dateTime(t.created_at)}</td>
            <td>{bName(t.building_id)}</td>
            <td>{t.description}</td>
            <td className="in">{t.direction === 'in' ? money(t.amount) : ''}</td>
            <td className="out">{t.direction === 'out' ? money(t.amount) : ''}</td>
          </tr>
        ))} />
      </Panel>
    </>
  );
}
