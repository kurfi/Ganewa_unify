import React from 'react';
// Hooks
import { useReturnsReport } from '../hooks/useReturnsReport';
// Components
import { ReturnsFilter } from '../components/reports/ReturnsFilter';
import { ReturnsTable } from '../components/reports/ReturnsTable';

const ReturnsReport: React.FC = () => {
  const {
    filters,
    dateRange,
    allCustomers,
    allUsers,
    filteredReturns,
    handleFilterChange
  } = useReturnsReport();

  return (
    <div className="space-y-4 md:space-y-6 pb-20">
      <h1 className="text-xl md:text-2xl font-bold text-slate-800">Returns Report</h1>

      {/* Filters Section */}
      <ReturnsFilter
        filters={filters}
        dateRange={dateRange}
        allCustomers={allCustomers}
        allUsers={allUsers}
        handleFilterChange={handleFilterChange}
      />

      {/* Returns Table */}
      <ReturnsTable returns={filteredReturns} />
    </div>
  );
};

export default ReturnsReport;