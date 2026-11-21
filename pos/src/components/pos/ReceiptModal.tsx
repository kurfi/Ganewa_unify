import React from "react";
import { X, MessageCircle, Share2, Printer, Download } from "lucide-react";
import { format } from "date-fns";
import { Sale, PaymentMethod } from "../../types";

interface ReceiptModalProps {
  receiptSale: Sale | null;
  setReceiptSale: (sale: Sale | null) => void;
  paperSize: "80mm" | "58mm";
  setPaperSize: (size: "80mm" | "58mm") => void;
  receiptRef: React.RefObject<HTMLDivElement>;
  receiptCustomerDebt: {
    previousDebt: number;
    thisSaleDebt: number;
    newDebt: number;
    creditLimit: number;
  } | null;
  handleShareWhatsAppWeb: () => void;
  handleShareImage: () => void;
  handlePrintRaw: () => void;
  handleDownloadImage: () => void;
  handleDownloadReceipt: () => void;
}

export function ReceiptModal({
  receiptSale,
  setReceiptSale,
  paperSize,
  setPaperSize,
  receiptRef,
  receiptCustomerDebt,
  handleShareWhatsAppWeb,
  handleShareImage,
  handlePrintRaw,
  handleDownloadImage,
  handleDownloadReceipt,
}: ReceiptModalProps) {
  if (!receiptSale) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-2 md:p-4 overflow-y-auto"
      id="printable-receipt"
    >
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-lg min-h-fit my-4 md:my-8">
        <div className="p-3 md:p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 no-print shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaperSize("80mm")}
              className={`px-2 py-1 text-[10px] md:text-xs rounded ${
                paperSize === "80mm"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              80mm
            </button>
            <button
              onClick={() => setPaperSize("58mm")}
              className={`px-2 py-1 text-[10px] md:text-xs rounded ${
                paperSize === "58mm"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              58mm
            </button>
          </div>
          <button
            onClick={() => setReceiptSale(null)}
            className="p-1.5 md:p-2 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-4 h-4 md:w-5 md:h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-4 md:p-6 bg-slate-100 flex justify-center">
          <div
            id="receipt-content"
            ref={receiptRef}
            className={`bg-white p-2 md:p-4 border border-slate-200 font-mono text-slate-800 leading-tight ${
              paperSize === "80mm" ? "receipt-80mm" : "receipt-58mm"
            }`}
            style={{ 
              minHeight: "400px",
              fontSize: paperSize === "80mm" ? "11px" : "9px"
            }}
          >
            {/* Header */}
            <div className="text-center mb-4">
              <h1 className="text-base md:text-lg font-bold mb-1 uppercase tracking-wide">
                GANEWA SHOPPING MALL KURFI
              </h1>
              <p className="text-[10px] md:text-xs text-slate-600">
                Tashan Ladan, Mamman Na'antu Street, Kurfi
              </p>
              <p className="text-[10px] md:text-xs text-slate-600">
                Tel: 08031328041, 09121886883
              </p>
              <p className="text-[10px] md:text-xs text-slate-600">
                Email: ganewashoppingmallkurfi@gmail.com
              </p>
            </div>

            {/* Meta Data */}
            <div className="border-b border-dashed border-slate-300 pb-2 mb-3 space-y-1">
              <div className="flex justify-between">
                <span>Sale ID:</span>
                <span>#{receiptSale.invoiceNo || receiptSale.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>
                  {format(
                    (receiptSale.date as any)?.toDate?.() ??
                      new Date(receiptSale.date),
                    "dd/MM/yyyy HH:mm"
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Customer:</span>
                <span className="uppercase">{receiptSale.customerName || "Walk-in"}</span>
              </div>
              {receiptSale.cashier && (
                <div className="flex justify-between">
                  <span>Cashier:</span>
                  <span>{receiptSale.cashier}</span>
                </div>
              )}
            </div>

            {/* Table */}
            <div className="border-y border-dashed border-slate-400 py-1 mb-3">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-dashed border-slate-400">
                    <th className="py-1 text-left font-bold pr-1 border-r border-dashed border-slate-400">S/N</th>
                    <th className="py-1 text-left font-bold px-1 border-r border-dashed border-slate-400">Item</th>
                    <th className="py-1 text-center font-bold px-1 border-r border-dashed border-slate-400">Qty</th>
                    <th className="py-1 text-right font-bold px-1 border-r border-dashed border-slate-400">Price</th>
                    <th className="py-1 text-right font-bold pl-1">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(receiptSale.items || []).map((item, i) => (
                    <tr key={i} className={i !== receiptSale.items.length - 1 ? "" : ""}>
                      <td className="py-1 pr-1 border-r border-dashed border-slate-400 align-top">{i + 1}</td>
                      <td className="py-1 px-1 border-r border-dashed border-slate-400 align-top uppercase">{item.productName}</td>
                      <td className="py-1 px-1 border-r border-dashed border-slate-400 text-center align-top">{item.quantity}</td>
                      <td className="py-1 px-1 border-r border-dashed border-slate-400 text-right align-top">
                        {(item.price || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-1 pl-1 text-right align-top">
                        {(item.total || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Section */}
            <div className="space-y-2 mb-4">
              {(receiptSale.discount || 0) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>
                    ₦
                    {(receiptSale.totalAmount || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              {(receiptSale.discount || 0) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Discount:</span>
                  <span>
                    -₦
                    {(receiptSale.discount || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              
              <div className="flex justify-between items-center py-1">
                <span className="text-lg md:text-xl font-black">TOTAL</span>
                <span className="text-lg md:text-xl font-black">
                  ₦{(receiptSale.finalAmount || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="flex justify-between text-[11px] md:text-xs">
                <span>Payment Method:</span>
                <span className="font-bold uppercase">
                  {receiptSale.paymentMethod === PaymentMethod.MULTIPAY 
                    ? receiptSale.paymentMethods?.map(m => m.method).join(' + ')
                    : receiptSale.paymentMethod}
                </span>
              </div>
            </div>

            {/* Debt/Balance Section */}
            {(() => {
              const debtInfo = receiptSale.debtInfo || receiptCustomerDebt;
              if (!debtInfo) return null;

              const isLimitExceeded = debtInfo.newDebt > (debtInfo.creditLimit || 0) && (debtInfo.creditLimit || 0) > 0;

              return (
                <div className="mt-4 pt-3 border-t border-dashed border-slate-400 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="text-center mb-2 font-black text-orange-700 uppercase tracking-tighter">
                    {debtInfo.thisSaleDebt > 0 ? "CREDIT SALE - DEBT ACCOUNT" : "DEBT ACCOUNT STATUS"}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Previous Balance:</span>
                      <span className="font-bold">
                        ₦{(debtInfo.previousDebt || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">This Sale:</span>
                      <span className="font-bold">
                        {(() => {
                          const saleDebt = debtInfo.thisSaleDebt !== undefined 
                            ? debtInfo.thisSaleDebt 
                            : ((debtInfo.newDebt || 0) - (debtInfo.previousDebt || 0));
                          
                          return (
                            <>
                              {saleDebt > 0 ? "+" : ""}₦
                              {(saleDebt || 0).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </>
                          );
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-300 pt-1.5">
                      <span className="font-black text-slate-900">New Balance:</span>
                      <span className="font-black text-orange-700 text-base">
                        ₦{(debtInfo.newDebt || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-500 text-[10px] md:text-xs">
                      <span>Credit Limit:</span>
                      <span>
                        ₦{(debtInfo.creditLimit || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    {isLimitExceeded && (
                      <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center gap-2">
                        <span className="text-red-700 font-black text-[10px] md:text-[11px] animate-pulse">
                          ⚠️ CREDIT LIMIT EXCEEDED
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Footer */}
            <div className="text-center text-slate-500 mt-8 pt-4 border-t border-slate-100">
              <p className="italic">Mun gode da kasuwancin ku!</p>
            </div>
          </div>
        </div>

        <div className="p-3 md:p-4 border-t border-slate-200 flex flex-wrap gap-2 md:gap-3 justify-center md:justify-end bg-white no-print">
          <button
            onClick={handleShareWhatsAppWeb}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-[#25D366] text-white rounded-lg hover:bg-[#128C7E] transition-colors text-xs md:text-sm font-bold"
            style={{ backgroundColor: 'var(--whatsapp-green, #25D366)' }}
          >
            <MessageCircle className="w-3.5 h-3.5 md:w-4 md:h-4" /> WhatsApp
          </button>
          <button
            onClick={handleShareImage}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-xs md:text-sm font-bold"
          >
            <Share2 className="w-3.5 h-3.5 md:w-4 md:h-4" /> Others
          </button>
          <button
            onClick={handlePrintRaw}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-xs md:text-sm"
          >
            <Printer className="w-3.5 h-3.5 md:w-4 md:h-4" /> Thermal Print
          </button>
          <button
            onClick={handleDownloadImage}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs md:text-sm"
          >
            <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> Image
          </button>
          <button
            onClick={handleDownloadReceipt}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs md:text-sm"
          >
            <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> PDF
          </button>
        </div>
      </div>
    </div>
  );
}
