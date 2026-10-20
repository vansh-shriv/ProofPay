import { AllCommunityModule, ModuleRegistry, colorSchemeDark, themeQuartz, type ColDef } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useEffect, useMemo, useState } from 'react';
import { api, type AuditEvent, type Job } from '../api';
import { describeEvent } from '../events';
import { STATUS_LABEL, usd } from '../format';
import { useToast } from '../ui';

ModuleRegistry.registerModules([AllCommunityModule]);

function useGridTheme() {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setDark(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return useMemo(() => (dark ? themeQuartz.withPart(colorSchemeDark) : themeQuartz).withParams({ accentColor: '#0b5fff', borderRadius: 10, fontSize: 14 }), [dark]);
}

const fmtTime = (iso: string) => new Date(iso).toLocaleString();

export function Ledger() {
  const [tab, setTab] = useState<'payments' | 'audit'>('payments');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState('');
  const theme = useGridTheme();
  const toast = useToast();

  useEffect(() => {
    let live = true;
    const load = () => Promise.all([api.jobs(), api.events()]).then(([j, e]) => { if (live) { setJobs(j); setEvents(e); } }).catch((e) => toast(e.message, true));
    load();
    const t = setInterval(load, 5000);
    return () => { live = false; clearInterval(t); };
  }, [toast]);

  const jobCols = useMemo<ColDef<Job>[]>(() => [
    { headerName: 'Created', valueGetter: (p) => p.data!.createdAt, valueFormatter: (p) => fmtTime(p.value), width: 175, sort: 'desc' },
    { headerName: 'Job', field: 'contract.title', flex: 1.4, minWidth: 180, cellRenderer: (p: { data?: Job }) => p.data ? <a href={`#/jobs/${p.data.id}`}>{p.data.contract.title}</a> : null },
    { headerName: 'Type', valueGetter: (p) => (p.data!.contract.kind === 'code' ? 'Code' : 'Written'), width: 100 },
    { headerName: 'Amount', valueGetter: (p) => parseFloat(p.data!.amount.value), valueFormatter: (p) => usd(Math.round(p.value * 100)), width: 115, type: 'rightAligned' },
    { headerName: 'Status', valueGetter: (p) => STATUS_LABEL[p.data!.status], width: 190 },
    { headerName: 'Attempts', valueGetter: (p) => `${p.data!.attempts}/${p.data!.contract.maxAttempts}`, width: 105 },
    { headerName: 'To worker', valueGetter: (p) => (p.data!.settlement ? parseFloat(p.data!.settlement.workerAmount.value) : null), valueFormatter: (p) => (p.value == null ? '' : usd(Math.round(p.value * 100))), width: 125, type: 'rightAligned' },
    { headerName: 'Back to client', valueGetter: (p) => (p.data!.settlement ? parseFloat(p.data!.settlement.clientAmount.value) : null), valueFormatter: (p) => (p.value == null ? '' : usd(Math.round(p.value * 100))), width: 140, type: 'rightAligned' },
    { headerName: 'PayPal capture', field: 'captureId', width: 190 },
    { headerName: 'Payout batch', field: 'payoutBatchId', width: 170 },
  ], []);

  const eventCols = useMemo<ColDef<AuditEvent>[]>(() => [
    { headerName: '#', field: 'seq', width: 80 },
    { headerName: 'Time', valueGetter: (p) => p.data!.ts, valueFormatter: (p) => fmtTime(p.value), width: 175, sort: 'desc' },
    { headerName: 'Job', field: 'jobId', width: 110, valueFormatter: (p) => p.value.slice(0, 8), cellRenderer: (p: { data?: AuditEvent }) => p.data ? <a href={`#/jobs/${p.data.jobId}`}>{p.data.jobId.slice(0, 8)}</a> : null },
    { headerName: 'Actor', field: 'actor', width: 110 },
    { headerName: 'Event', field: 'type', width: 190 },
    { headerName: 'What happened', valueGetter: (p) => describeEvent(p.data!).text, flex: 1, minWidth: 300, tooltipValueGetter: (p) => String(p.value) },
  ], []);

  return (
    <main className="page">
      <div className="row between">
        <div><h1>Ledger</h1><p className="muted">Every payment and every decision, sortable and filterable. Nothing is hidden.</p></div>
        <div className="row">
          <div className="tabs" role="tablist">
            <button className="tab" role="tab" aria-selected={tab === 'payments'} onClick={() => setTab('payments')}>Payments</button>
            <button className="tab" role="tab" aria-selected={tab === 'audit'} onClick={() => setTab('audit')}>Audit log</button>
          </div>
          <input style={{ width: 220 }} placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter rows" />
        </div>
      </div>
      <div className="card gridwrap" style={{ padding: 8 }}>
        {tab === 'payments' ? (
          <AgGridReact<Job> key="payments" theme={theme} rowData={jobs} columnDefs={jobCols} quickFilterText={filter} getRowId={(p) => p.data.id} defaultColDef={{ sortable: true, resizable: true }} overlayNoRowsTemplate="No payments yet" />
        ) : (
          <AgGridReact<AuditEvent> key="audit" theme={theme} rowData={events} columnDefs={eventCols} quickFilterText={filter} getRowId={(p) => String(p.data.seq)} defaultColDef={{ sortable: true, resizable: true }} overlayNoRowsTemplate="No events yet" />
        )}
      </div>
    </main>
  );
}
