import React from 'react';
import { useAuth } from '../auth/AuthContext';
import { useReturns } from '../hooks/useReturns';

// Components
import { ReturnSearchStep } from '../components/returns/ReturnSearchStep';
import { ReturnItemsStep } from '../components/returns/ReturnItemsStep';
import { ReturnRefundDetailsStep } from '../components/returns/ReturnRefundDetailsStep';
import { ReturnReviewStep } from '../components/returns/ReturnReviewStep';
import { ReturnSuccessStep } from '../components/returns/ReturnSuccessStep';

const Returns: React.FC = () => {
  const { state, actions } = useReturns();

  return (
    <div data-scanner-disabled="true" className="space-y-4 md:space-y-6 pb-10">
      <h1 className="text-xl md:text-2xl font-bold text-slate-800">Process Returns</h1>

      {/* Step 1: Search Sale */}
      {state.step === 1 && (
        <ReturnSearchStep
          searchQuery={state.searchQuery}
          setSearchQuery={actions.setSearchQuery}
          handleSearchSale={actions.handleSearchSale}
          searchResults={state.searchResults}
          handleSelectSale={actions.handleSelectSale}
        />
      )}

      {/* Step 2: Select Items */}
      {state.step === 2 && state.originalSale && (
        <ReturnItemsStep
          originalSale={state.originalSale}
          returnableItems={state.returnableItems}
          handleReturnAllItems={actions.handleReturnAllItems}
          handleReturnAllOfThisItem={actions.handleReturnAllOfThisItem}
          handleQuantityChange={actions.handleQuantityChange}
          handleRestockStatusChange={actions.handleRestockStatusChange}
          startNewReturn={actions.startNewReturn}
          setStep={actions.setStep}
        />
      )}

      {/* Step 3: Choose Refund Method & Reason */}
      {state.step === 3 && state.originalSale && (
        <ReturnRefundDetailsStep
          returnReason={state.returnReason}
          refundMethod={state.refundMethod}
          totalRefundAmount={state.totalRefundAmount}
          originalSale={state.originalSale}
          customer={state.customer}
          setReturnReason={actions.setReturnReason}
          setRefundMethod={actions.setRefundMethod}
          setStep={actions.setStep}
        />
      )}

      {/* Step 4: Review & Confirm */}
      {state.step === 4 && state.originalSale && (
        <ReturnReviewStep
          originalSale={state.originalSale}
          refundMethod={state.refundMethod}
          returnReason={state.returnReason}
          returnableItems={state.returnableItems}
          totalRefundAmount={state.totalRefundAmount}
          setStep={actions.setStep}
          handleProcessReturn={actions.handleProcessReturn}
          isSubmitting={state.isSubmitting}
        />
      )}

      {/* Step 5: Print Return Receipt */}
      {state.step === 5 && state.originalSale && (
        <ReturnSuccessStep
          originalSale={state.originalSale}
          totalRefundAmount={state.totalRefundAmount}
          returnableItems={state.returnableItems}
          returnReason={state.returnReason}
          refundMethod={state.refundMethod}
          customer={state.customer}
          currentUser={state.currentUser}
          returnId={state.returnId}
          receiptRef={state.receiptRef}
          handleDownloadReturnPdf={actions.handleDownloadReturnPdf}
          handleDownloadReturnImage={actions.handleDownloadReturnImage}
          startNewReturn={actions.startNewReturn}
        />
      )}

      {/* Fallback for when no sale is found and search was performed */}
      {state.step === 1 && state.searchQuery && !state.originalSale && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-center text-slate-500">
          <p>No sale found matching "{state.searchQuery}". Please try again.</p>
        </div>
      )}
    </div>
  );
};

export default Returns;