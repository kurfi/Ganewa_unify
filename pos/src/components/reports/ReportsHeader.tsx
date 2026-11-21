import React from 'react';
import { FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { savePdf } from '../../services/pdfService';
import { useToast } from '../../contexts/ToastContext';
import { format } from 'date-fns';

interface ReportsHeaderProps {
    startDate: string;
    endDate: string;
    totalRevenue: number;
    totalRefunds: number;
    totalValueLost: number;
    totalCOGS: number;
    totalExpenses: number;
    totalDiscounts: number;
    grossProfit: number;
    netProfit: number;
    salesByPayment: any[];
    sales: any[];
}

export function ReportsHeader({
    startDate, endDate, totalRevenue, totalRefunds, totalValueLost,
    totalCOGS, totalExpenses, totalDiscounts, grossProfit, netProfit,
    salesByPayment, sales
}: ReportsHeaderProps) {
    const { showToast } = useToast();

    const generatePDF = async () => {
        const doc = new jsPDF();

        // Title
        doc.setFontSize(18);
        doc.text("Ganewa Shopping Mall Kurfi Business Report", 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Period: ${startDate} to ${endDate}`, 14, 30);

        let yPos = 40;

        // Summary Table
        autoTable(doc, {
            startY: yPos,
            head: [['Metric', 'Value']],
            body: [
                ['Total Sales', `N${(totalRevenue || 0).toLocaleString()}`],
                ['Total Expenses', `N${(totalExpenses || 0).toLocaleString()}`],
                ['Total Refunds', `N${(totalRefunds || 0).toLocaleString()}`],
                ['Remaining Balance', `N${((totalRevenue || 0) - (totalExpenses || 0) - (totalRefunds || 0)).toLocaleString()}`],
                ['Cost of Goods Sold', `N${(totalCOGS || 0).toLocaleString()}`],
                ['Value Lost (Damaged)', `N${(totalValueLost || 0).toLocaleString()}`],
                ['Total Discounts', `N${(totalDiscounts || 0).toLocaleString()}`],
                ['Gross Profit', `N${(grossProfit || 0).toLocaleString()}`],
                ['Net Profit', `N${(netProfit || 0).toLocaleString()}`],
            ],
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] },
            didParseCell: function (data) {
                if (data.section === 'body' && data.column.index === 1) {
                    const metricName = data.row.cells[0].text[0];
                    if (['Total Sales', 'Gross Profit', 'Remaining Balance'].includes(metricName)) {
                        data.cell.styles.textColor = [34, 139, 34];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (['Total Refunds', 'Cost of Goods Sold', 'Total Expenses', 'Total Discounts', 'Value Lost (Damaged)'].includes(metricName)) {
                        data.cell.styles.textColor = [220, 20, 60];
                    } else if (metricName.includes('Net Profit')) {
                        data.cell.styles.textColor = [0, 0, 0];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;

        // Sales by Payment Method
        doc.text("Sales by Payment Method", 14, yPos);
        yPos += 5;
        autoTable(doc, {
            startY: yPos,
            head: [['Method', 'Amount']],
            body: salesByPayment.map(p => [p.name, `N${(p.value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]),
            styles: { fontSize: 8 }
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;

        // Sales Breakdown
        doc.text("Sales History (Top 50)", 14, yPos);
        yPos += 5;
        autoTable(doc, {
            startY: yPos,
            head: [['Date', 'Customer', 'Payment', 'Items', 'Profit', 'Discount', 'Total']],
            body: sales.slice(0, 50).map(s => {
                const saleCost = (s.items || []).reduce((itemSum: number, item: any) => {
                    return itemSum + (item.quantity * (item.costPrice || 0));
                }, 0);
                const saleProfit = s.finalAmount - saleCost;
                return [
                    format((s.date as any)?.toDate?.() ?? new Date(s.date), 'yyyy-MM-dd HH:mm'),
                    s.customerName || 'Walk-in',
                    s.paymentMethod,
                    (s.items?.length || 0).toString(),
                    saleProfit.toFixed(2),
                    (s.discount || 0).toFixed(2),
                    s.finalAmount.toFixed(2)
                ];
            }),
            styles: { fontSize: 8 }
        });

        const defaultFileName = `Ganewa_Shopping_Mall_Kurfi_Report_${startDate}_${endDate}.pdf`;
        try {
            await savePdf(doc, defaultFileName, 'reports');
            showToast('PDF report saved successfully!', 'success');
        } catch (error) {
            console.error("PDF generation/saving failed:", error);
            showToast('Failed to save PDF report.', 'error');
        }
    };

    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">Business Intelligence</h1>
            <div className="flex gap-2">
                <button
                    onClick={generatePDF}
                    className="flex-1 md:flex-none bg-slate-800 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg hover:bg-slate-700 flex items-center justify-center gap-2 shadow-sm text-xs md:text-sm"
                >
                    <FileText className="w-3.5 h-3.5 md:w-4 md:h-4" /> PDF Report
                </button>
            </div>
        </div>
    );
}
