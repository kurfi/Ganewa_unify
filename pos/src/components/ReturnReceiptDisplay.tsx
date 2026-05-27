import React from "react";
import {
  Sale,
  SaleItem,
  PaymentMethod,
  Customer,
  ReturnReason,
  Return,
  ReturnedItem,
} from "../types";
import { format } from "date-fns";

// Props for the ReturnReceiptDisplay component
interface ReturnReceiptDisplayProps {
  originalSale: Sale;
  returnItems: (SaleItem & {
    returnedQuantity: number;
    restockStatus: "restocked" | "damaged";
    reason: ReturnReason | string;
  })[];
  totalRefundAmount: number;
  returnReason: ReturnReason | string;
  refundMethod: PaymentMethod;
  customer: Customer | null;
  cashierUsername: string;
  returnDate: Date;
  returnId: string | null; // Pass the newly created return ID
  paperSize?: "80mm" | "58mm"; // Optional: for receipt formatting
}

// This component will render the detailed return receipt
const ReturnReceiptDisplay = React.forwardRef<
  HTMLDivElement,
  ReturnReceiptDisplayProps
>(
  (
    {
      originalSale,
      returnItems,
      totalRefundAmount,
      returnReason,
      refundMethod,
      customer,
      cashierUsername,
      returnDate,
      returnId,
      paperSize = "80mm",
    },
    ref
  ) => {
    const itemsToDisplay = returnItems.filter(
      (item) => item.returnedQuantity > 0
    );

    return (
      <div
        id="return-receipt-content"
        ref={ref}
        className={`bg-white p-2 md:p-3 border border-slate-200 text-[10px] md:text-xs font-mono text-slate-800 leading-tight max-h-full overflow-y-auto ${
          paperSize === "80mm" ? "receipt-80mm" : "receipt-58mm"
        }`}
        style={{ minHeight: "400px" }} // Ensure visibility for image/pdf generation
      >
        <div className="text-center mb-3">
          <h2 className="text-sm md:text-base font-bold mb-1 uppercase">
            GANEWA SHOPPING MALL KURFI
          </h2>
          <p className="text-[9px] md:text-[10px] text-slate-500">
            Tashan Ladan, Mamman Na'antu Street, Kurfi
          </p>
          <p className="text-[9px] md:text-[10px] text-slate-500">
            Tel: 08031328041, 09121886883
          </p>
          <p className="text-[9px] md:text-[10px] text-slate-500">
            Email: ganewashoppingmallkurfi@gmail.com
          </p>
        </div>

        <div className="border-b border-dashed border-slate-300 pb-2 mb-2 space-y-1">
          <div className="flex justify-between">
            <span>Return ID:</span>
            <span>#{returnId || "N/A"}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>
              {format(
                (returnDate as any)?.toDate?.() ?? new Date(returnDate),
                "dd/MM/yyyy HH:mm"
              )}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Customer:</span>
            <span>
              {customer?.name ||
                originalSale.customerName ||
                "Walk-in Customer"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Cashier:</span>
            <span>{cashierUsername}</span>
          </div>
        </div>

        <div className="mb-2">
          <p className="font-medium text-slate-700 mb-1 text-[10px] md:text-xs uppercase tracking-wide">
            Original Sale Details:
          </p>
          <div className="border-b border-dashed border-slate-300 pb-2 mb-2 space-y-0.5 text-[9px] md:text-[10px]">
            <div className="flex justify-between">
              <span>Sale ID:</span>
              <span>#{originalSale.id}</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>
                {format(
                  (originalSale.date as any)?.toDate?.() ??
                    new Date(originalSale.date),
                  "dd/MM/yyyy HH:mm"
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Amount:</span>
              <span>
                ₦
                {(originalSale.finalAmount || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-2">
          <p className="font-medium text-slate-700 mb-1 text-[10px] md:text-xs uppercase tracking-wide">
            Returned Items:
          </p>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="pb-1">S/N</th>
                <th className="pb-1 pr-1 border-r border-dashed border-slate-300">
                  Item
                </th>
                <th className="pb-1 text-right border-r border-dashed border-slate-300 pr-2">
                  Qty
                </th>
                <th className="pb-1 text-right border-r border-dashed border-slate-300 pr-2">
                  Price
                </th>
                <th className="pb-1 text-right">Refund</th>
              </tr>
            </thead>
            <tbody>
              {itemsToDisplay.map((item, i) => (
                <tr key={i}>
                  <td className="pt-1 pr-1 border-r border-dashed border-slate-300">
                    {i + 1}
                  </td>
                  <td className="pt-1 px-1">
                    {item.productName} ({item.restockStatus})
                  </td>
                  <td className="pt-1 text-right border-r border-dashed border-slate-300 pr-2">
                    {item.returnedQuantity}
                  </td>
                  <td className="pt-1 text-right border-r border-dashed border-slate-300 pr-2">
                    ₦
                    {item.price.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="pt-1 text-right">
                    ₦
                    {(item.returnedQuantity * item.price).toLocaleString(
                      undefined,
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 mb-3">
          <div className="flex justify-between text-[9px] md:text-[10px]">
            <span>Return Reason:</span>
            <span>{returnReason}</span>
          </div>
          <div className="flex justify-between text-[9px] md:text-[10px]">
            <span>Refund Method:</span>
            <span>{refundMethod}</span>
          </div>
          <div className="flex justify-between font-bold text-sm md:text-base mt-2">
            <span>TOTAL REFUND</span>
            <span>
              ₦
              {totalRefundAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        <div className="text-center text-[9px] md:text-[10px] text-slate-500 mt-4">
          <p>Mun gode da kasuwancin ku!</p>
          <p>Thank you for your business!</p>
        </div>
      </div>
    );
  }
);

export default ReturnReceiptDisplay;
