import { AllCommunityModule, ModuleRegistry, colorSchemeDark, themeQuartz, type ColDef } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useEffect, useMemo, useState } from 'react';
import { api, type AuditEvent, type Job } from '../api';
import { useApp } from '../data';
import { describeEvent } from '../events';
import { STATUS_LABEL, usd } from '../format';
import { useTheme } from '../theme';
import { useToast } from '../ui';

ModuleRegistry.registerModules([AllCommunityModule]);

// Grid skinned to match the app in both themes (colours mirror the CSS tokens).
const shared = { fontFamily: 'inherit', fontSize: 14, borderRadius: 10, wrapperBorderRadius: 12, spacing: 9, headerFontWeight: 700 };
const lightGrid = themeQuartz.withParams({ ...shared, accentColor: '#0c7566', backgroundColor: '#ffffff', foregroundColor: '#14202b', headerBackgroundColor: '#faf9f6', headerTextColor: '#4b5967', borderColor: '#e6e3db', rowHoverColor: '#faf9f6' });
const darkGrid = themeQuartz.withPart(colorSchemeDark).withParams({ ...shared, accentColor: '#3cc4aa', backgroundColor: '#131a21', foregroundColor: '#e9eff4', headerBackgroundColor: '#10161c', headerTextColor: '#aab7c3', borderColor: '#222c36', rowHoverColor: '#10161c' });

const fmtTime = (iso: string) => new Date(iso).toLocaleString();
const link = { fontWeight: 650, textDecoration: 'underline', textUnderlineOffset: 3 } as const;

export function Ledger() {
  const [tab, setTab] = useState<'payments' | 'audit'>('payments');
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const { jobs, query } = useApp();
  const { theme: mode } = useTheme();
  const theme = mode === 'dark' ? darkGrid : lightGrid;
  const toast = useToast();

  useEffect(() => {
    let live = true;
    const load = () => api.events().then((e) => live && setEvents(e)).catch((e) => toast(e.message, true));
    load();
    const t = setInterval(load, 5000);
    return () => { live = false; clearInterval(t); };
  }, [toast]);

  const jobCols = useMemo<ColDef<Job>[]>(() => [
    { headerName: 'Created', valueGetter: (p) => p.data!.createdAt, valueFormatter: (p) => fmtTime(p.value), width: 180, sort: 'desc' },
    { headerName: 'Job', field: 'contract.title', flex: 1.4, minWidth: 190, cellRenderer: (p: { data?: Job }) => p.data ? <a href={`#/jobs/${p.data.id}`} style={link}>{p.data.contract.title}</a> : null },
    { headerName: 'Type', valueGetter: (p) => (p.data!.contract.kind === 'code' ? 'Code' : 'Written'), width: 100 },
    { headerName: 'Amount', valueGetter: (p) => parseFloat(p.data!.amount.value), valueFormatter: (p) => usd(Math.round(p.value * 100)), width: 115, type: 'rightAligned' },
    { headerName: 'Status', valueGetter: (p) => STATUS_LABEL[p.data!.status], width: 190 },
    { headerName: 'Attempts', valueGetter: (p) => `${p.data!.attempts}/${p.data!.contract.maxAttempts}`, width: 105 },
    { headerName: 'To worker', valueGetter: (p) => (p.data!.settlement ? parseFloat(p.data!.settlement.workerAmount.value) : null), valueFormatter: (p) => (p.value == null ? '' : usd(Math.round(p.value * 100))), width: 125, type: 'rightAligned' },
    { headerName: 'Back to client', valueGetter: (p) => (p.data!.settlement ? parseFloat(p.data!.settlement.clientAmount.value) : null), valueFormatter: (p) => (p.value == null ? '' : usd(Math.round(p.value * 100))), width: 140, type: 'rightAligned' },
    { headerName: 'PayPal capture', field: 'captureId', width: 190 },
    { headerName: 'Payout batch', field: 'payoutBatchId', width: 170 },
    { headerName: 'Payout status', field: 'payoutStatus', width: 140 },
  ], []);

  const eventCols = useMemo<ColDef<AuditEvent>[]>(() => [
    { headerName: '#', field: 'seq', width: 80 },
    { headerName: 'Time', valueGetter: (p) => p.data!.ts, valueFormatter: (p) => fmtTime(p.value), width: 180, sort: 'desc' },
    { headerName: 'Job', field: 'jobId', width: 110, valueFormatter: (p) => p.value.slice(0, 8), cellRenderer: (p: { data?: AuditEvent }) => p.data ? <a href={`#/jobs/${p.data.jobId}`} style={link}>{p.data.jobId.slice(0, 8)}</a> : null },
    { headerName: 'Actor', field: 'actor', width: 110 },
    { headerName: 'Event', field: 'type', width: 190 },
    { headerName: 'What happened', valueGetter: (p) => describeEvent(p.data!).text, flex: 1, minWidth: 320, tooltipValueGetter: (p) => String(p.value) },
  ], []);

  return (
    <>
      <div className="row between">
        <p className="muted" style={{ maxWidth: '60ch' }}>Every payment and every decision, sortable and filterable. Use the search box above to filter rows. Nothing is hidden.</p>
        <div className="tabs" role="tablist">
          <button className="tab" role="tab" aria-selected={tab === 'payments'} onClick={() => setTab('payments')}>Payments</button>
          <button className="tab" role="tab" aria-selected={tab === 'audit'} onClick={() => setTab('audit')}>Audit log</button>
        </div>
      </div>
      <div className="card gridwrap" style={{ padding: 8 }}>
        {tab === 'payments' ? (
          <AgGridReact<Job> key="payments" theme={theme} rowData={jobs ?? []} columnDefs={jobCols} quickFilterText={query} getRowId={(p) => p.data.id} defaultColDef={{ sortable: true, resizable: true }} overlayNoRowsTemplate="No payments yet" />
        ) : (
          <AgGridReact<AuditEvent> key="audit" theme={theme} rowData={events} columnDefs={eventCols} quickFilterText={query} getRowId={(p) => String(p.data.seq)} defaultColDef={{ sortable: true, resizable: true }} overlayNoRowsTemplate="No events yet" />
        )}
      </div>
    </>
  );
}
