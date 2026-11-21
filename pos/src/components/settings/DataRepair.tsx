import React, { useState } from 'react';
import { runDataIntegrityMigration, MigrationReport } from '../../utils/migrateDataIntegrity';
import { runBackfillMigration, BackfillReport } from '../../utils/backfillStockValue';
import { Database, UploadCloud, FileEdit } from 'lucide-react';

type RunState = 'idle' | 'running' | 'done' | 'error';

export const DataRepair: React.FC = () => {
  const [integrityState, setIntegrityState] = useState<RunState>('idle');
  const [integrityReport, setIntegrityReport] = useState<MigrationReport | null>(null);

  const [backfillState, setBackfillState] = useState<RunState>('idle');
  const [backfillReport, setBackfillReport] = useState<BackfillReport | null>(null);

  const handleRunIntegrityRepair = async () => {
    setIntegrityState('running');
    setIntegrityReport(null);
    try {
      const result = await runDataIntegrityMigration();
      setIntegrityReport(result);
      setIntegrityState(result.errors.length > 0 ? 'error' : 'done');
    } catch (err: any) {
      setIntegrityReport({ salesFixed: 0, expensesFixed: 0, customerPaymentsFixed: 0, supplierPaymentsFixed: 0, errors: [String(err)] });
      setIntegrityState('error');
    }
  };

  const handleRunBackfill = async () => {
    setBackfillState('running');
    setBackfillReport(null);
    try {
      const result = await runBackfillMigration();
      setBackfillReport(result);
      setBackfillState(result.errors.length > 0 ? 'error' : 'done');
    } catch (err: any) {
      setBackfillReport({ productsUpdated: 0, returnedItemsUpdated: 0, errors: [String(err)] });
      setBackfillState('error');
    }
  };

  const totalFixed = integrityReport
    ? integrityReport.salesFixed + integrityReport.expensesFixed + integrityReport.customerPaymentsFixed + integrityReport.supplierPaymentsFixed
    : 0;

  return (
    <div className="space-y-6">
      {/* Data Integrity Repair Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600" />
              Data Integrity Repair
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Fixes legacy records with missing or incorrect payment methods and status values that
              cause negative balances on the dashboard. Safe to run multiple times.
            </p>
          </div>
        </div>

        <ul className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 space-y-1 mb-4 border border-slate-100">
          <li>✅ Sales with missing or lowercase status → normalized to COMPLETED/HELD/CANCELLED</li>
          <li>✅ Sales with missing payment method → defaulted to CASH</li>
          <li>✅ Paid expenses with no payment method → defaulted to CASH</li>
          <li>✅ Legacy expenses with no status → set to PAID</li>
          <li>✅ Customer payments with missing payment method → defaulted to CASH</li>
          <li>✅ Supplier payments with missing payment method → defaulted to CASH</li>
        </ul>

        <button
          onClick={handleRunIntegrityRepair}
          disabled={integrityState === 'running'}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            integrityState === 'running'
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
          }`}
        >
          {integrityState === 'running' ? '⏳ Running repair…' : integrityState === 'done' || integrityState === 'error' ? '🔄 Run Again' : '▶ Run Data Repair'}
        </button>

        {integrityReport && (
          <div className={`mt-4 rounded-lg p-4 text-sm border ${
            integrityState === 'error' ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
          }`}>
            <p className={`font-semibold mb-2 ${integrityState === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>
              {integrityState === 'error' ? '⚠️ Completed with errors' : `✅ Repair complete — ${totalFixed} record(s) updated`}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-slate-700">
              <span>Sales fixed:</span>              <span className="font-medium">{integrityReport.salesFixed}</span>
              <span>Expenses fixed:</span>           <span className="font-medium">{integrityReport.expensesFixed}</span>
              <span>Customer payments fixed:</span>  <span className="font-medium">{integrityReport.customerPaymentsFixed}</span>
              <span>Supplier payments fixed:</span>  <span className="font-medium">{integrityReport.supplierPaymentsFixed}</span>
            </div>
            {integrityReport.errors.length > 0 && (
              <ul className="mt-3 text-red-600 text-xs space-y-1">
                {integrityReport.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Backfill Data Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <FileEdit className="w-5 h-5 text-indigo-600" />
              Backfill Data for Fast Aggregation
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Computes and writes `stockValue` on all products and `returnDate` on all returnedItems. Required for new dashboard aggregation queries to work. Safe to run multiple times.
            </p>
          </div>
        </div>

        <button
          onClick={handleRunBackfill}
          disabled={backfillState === 'running'}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            backfillState === 'running'
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
          }`}
        >
          {backfillState === 'running' ? '⏳ Running backfill…' : backfillState === 'done' || backfillState === 'error' ? '🔄 Run Again' : '▶ Run Data Backfill'}
        </button>

        {backfillReport && (
          <div className={`mt-4 rounded-lg p-4 text-sm border ${
            backfillState === 'error' ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
          }`}>
            <p className={`font-semibold mb-2 ${backfillState === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>
              {backfillState === 'error' ? '⚠️ Completed with errors' : `✅ Backfill complete`}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-slate-700">
              <span>Products updated:</span>           <span className="font-medium">{backfillReport.productsUpdated}</span>
              <span>Returned Items updated:</span>     <span className="font-medium">{backfillReport.returnedItemsUpdated}</span>
            </div>
            {backfillReport.errors.length > 0 && (
              <ul className="mt-3 text-red-600 text-xs space-y-1">
                {backfillReport.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
