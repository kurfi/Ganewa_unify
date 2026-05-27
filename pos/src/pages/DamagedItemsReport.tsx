import React from 'react';
// Hooks
import { useDamagedItemsReport } from '../hooks/useDamagedItemsReport';
// Components
import { DamagedItemsFilter } from '../components/reports/DamagedItemsFilter';
import { DamagedItemsTable } from '../components/reports/DamagedItemsTable';

const DamagedItemsReport: React.FC = () => {
  const {
    filters,
    dateRange,
    allProducts,
    allUsers,
    allReturns,
    filteredDamagedItems,
    handleFilterChange
  } = useDamagedItemsReport();

  return (
    <div className="space-y-4 md:space-y-6 pb-20">
      <h1 className="text-xl md:text-2xl font-bold text-slate-800">Damaged Items</h1>

      {/* Filters Section */}
      <DamagedItemsFilter
        filters={filters}
        dateRange={dateRange}
        allProducts={allProducts}
        allUsers={allUsers}
        handleFilterChange={handleFilterChange}
      />

      {/* Damaged Items Table */}
      <DamagedItemsTable
        items={filteredDamagedItems}
        returns={allReturns}
        users={allUsers}
      />
    </div>
  );
};

export default DamagedItemsReport;