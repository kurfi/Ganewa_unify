import React, { useState, useEffect } from 'react';
import { Tag, X, Printer, Loader2, CheckCircle2, Scissors, Layers, FileDown, FileText } from 'lucide-react';
import { Product } from '../../types';
import { printProductLabel } from '../../services/printerService';
import { getSavedLabelMediaType, setSavedLabelMediaType, LabelMediaType } from '../../services/webPrintService';
import { generateA4BarcodePdf, printA4BarcodesWindowsDialog, A4GridLayout } from '../../services/barcodeA4Service';
import { useToast } from '../../contexts/ToastContext';

interface PrintLabelModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
}

export function PrintLabelModal({ isOpen, onClose, product }: PrintLabelModalProps) {
    const { showToast } = useToast();
    const [quantity, setQuantity] = useState<number>(4);
    const [paperFormat, setPaperFormat] = useState<'thermal' | 'a4'>('thermal');
    const [mediaType, setMediaType] = useState<LabelMediaType>('plain');
    const [layout, setLayout] = useState<'4-up' | '2-up'>('4-up');
    const [a4Layout, setA4Layout] = useState<A4GridLayout>('40');
    const [a4CutLines, setA4CutLines] = useState<boolean>(true);
    const [isPrinting, setIsPrinting] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [progress, setProgress] = useState<{ printed: number; total: number } | null>(null);

    // Sync media type from localStorage whenever modal opens or product changes
    useEffect(() => {
        if (isOpen && product) {
            const savedMedia = getSavedLabelMediaType();
            setMediaType(savedMedia);
            setLayout(savedMedia === 'plain' ? '4-up' : '2-up');
            setPaperFormat('thermal');
            setA4Layout('40');
            setA4CutLines(true);
            setIsExportingPdf(false);
            // Default to product stock quantity if available and > 0, otherwise default to 4
            const defaultQty = product.quantity && product.quantity > 0 ? Math.min(product.quantity, 100) : 4;
            setQuantity(defaultQty);
            setProgress(null);
            setIsPrinting(false);
        }
    }, [isOpen, product]);

    if (!isOpen || !product) return null;

    const handleMediaTypeChange = (type: LabelMediaType) => {
        setMediaType(type);
        setSavedLabelMediaType(type);
        // Automatically suggest 4-up for plain receipt paper (to eliminate blank upper space), 2-up for adhesive roll
        setLayout(type === 'plain' ? '4-up' : '2-up');
    };

    const handlePrint = async () => {
        const count = Math.max(1, Math.min(1000, Number(quantity) || 1));
        setIsPrinting(true);
        setProgress({ printed: 0, total: count });

        try {
            const ok = await printProductLabel(product, count, mediaType, {
                layout,
                onProgress: (printed, total) => {
                    setProgress({ printed, total });
                }
            });

            if (ok) {
                showToast(`Successfully printed ${count} barcode labels for "${product.name}"!`, 'success');
                onClose();
            } else {
                showToast('Printing failed. Please verify printer connection in Hardware Settings.', 'error');
            }
        } catch (err: any) {
            console.error('Error printing labels:', err);
            showToast(`Print error: ${err?.message || 'Failed to print'}`, 'error');
        } finally {
            setIsPrinting(false);
            setProgress(null);
        }
    };

    const handleExportA4Pdf = async () => {
        const count = Math.max(1, Math.min(1000, Number(quantity) || 1));
        setIsExportingPdf(true);
        try {
            await generateA4BarcodePdf(product, count, {
                layout: a4Layout,
                showCutLines: a4CutLines,
            });
            showToast(`Downloaded A4 PDF with ${count} barcode labels!`, 'success');
        } catch (err: any) {
            console.error('Error generating PDF:', err);
            showToast(`PDF error: ${err?.message || 'Failed to generate PDF'}`, 'error');
        } finally {
            setIsExportingPdf(false);
        }
    };

    const handlePrintA4WindowsDialog = async () => {
        const count = Math.max(1, Math.min(1000, Number(quantity) || 1));
        setIsPrinting(true);
        try {
            const ok = await printA4BarcodesWindowsDialog(product, count, {
                layout: a4Layout,
                showCutLines: a4CutLines,
            });
            if (ok) {
                showToast(`Opened Windows print dialog for ${count} A4 barcode labels!`, 'success');
            } else {
                showToast('Unable to open print dialog.', 'error');
            }
        } catch (err: any) {
            console.error('Error opening Windows print dialog:', err);
            showToast(`Print error: ${err?.message || 'Failed to print'}`, 'error');
        } finally {
            setIsPrinting(false);
        }
    };

    // Calculate pieces (strips of 4 or 2 labels) for thermal, and sheets for A4
    const validQty = Math.max(1, Number(quantity) || 1);
    const labelsPerStrip = layout === '4-up' ? 4 : 2;
    const piecesCount = Math.ceil(validQty / labelsPerStrip);

    const a4PerSheet = a4Layout === '24' ? 24 : 40;
    const a4SheetsCount = Math.ceil(validQty / a4PerSheet);

    const barcodeDisplay = product.barcode?.trim() || product.id?.slice(0, 10).toUpperCase() || 'AUTO-ID';

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <span className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                            <Tag className="w-5 h-5" />
                        </span>
                        <div>
                            <h2 className="font-bold text-base text-slate-800">Print Barcode Labels</h2>
                            <p className="text-xs text-slate-500">
                                {paperFormat === 'thermal'
                                    ? `${layout === '4-up' ? '4 labels per strip (2×2 grid)' : '2 labels per strip (side-by-side)'} • 80mm XP-80`
                                    : `A4 Sheet (${a4Layout === '40' ? '40 labels/sheet (4×10)' : '24 labels/sheet (3×8)'}) • Desktop / PDF`
                                }
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        disabled={isPrinting || isExportingPdf}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    {/* Paper / Printer Format Selector */}
                    <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200">
                        <button
                            type="button"
                            onClick={() => setPaperFormat('thermal')}
                            disabled={isPrinting || isExportingPdf}
                            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                paperFormat === 'thermal'
                                    ? 'bg-white text-emerald-800 shadow-sm border border-slate-200/80'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Printer className="w-3.5 h-3.5 text-emerald-600" />
                            <span>80mm Thermal (XP-80)</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setPaperFormat('a4')}
                            disabled={isPrinting || isExportingPdf}
                            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                paperFormat === 'a4'
                                    ? 'bg-white text-blue-800 shadow-sm border border-slate-200/80'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <FileText className="w-3.5 h-3.5 text-blue-600" />
                            <span>A4 Paper Sheet / PDF</span>
                        </button>
                    </div>

                    {/* Product Summary Card */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-slate-900 text-sm">{product.name}</h3>
                                <p className="text-xs text-slate-500">{product.category}</p>
                            </div>
                            <div className="text-right">
                                <span className="font-bold text-emerald-600 text-sm">
                                    ₦{(product.sellPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                                <p className="text-[11px] text-slate-400">
                                    Stock: <strong className="text-slate-700">{product.quantity ?? 0}</strong>
                                </p>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-600">
                            <span>Barcode: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-800 font-semibold">{barcodeDisplay}</code></span>
                            <span className="text-[11px] text-slate-400">
                                Code 128 ({paperFormat === 'thermal' ? `${labelsPerStrip} per strip` : `${a4PerSheet} per sheet`})
                            </span>
                        </div>
                    </div>

                    {/* Quantity Input Section */}
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                Total Labels to Print
                            </label>
                            <span className="text-xs text-slate-500">
                                {paperFormat === 'thermal' ? (
                                    <>
                                        = <strong className="text-emerald-700">{piecesCount} {piecesCount === 1 ? 'strip' : 'strips'}</strong> ({validQty} stickers, {labelsPerStrip}/strip)
                                    </>
                                ) : (
                                    <>
                                        = <strong className="text-blue-700">{a4SheetsCount} {a4SheetsCount === 1 ? 'sheet' : 'sheets'}</strong> ({validQty} stickers, {a4PerSheet}/sheet)
                                    </>
                                )}
                            </span>
                        </div>

                        <div className="flex gap-2">
                            <input
                                type="number"
                                min={1}
                                max={1000}
                                value={quantity}
                                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                disabled={isPrinting || isExportingPdf}
                                className="flex-1 p-2.5 text-base font-bold text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow"
                                placeholder="e.g. 50, 78, 100"
                                autoFocus
                            />
                        </div>

                        {/* Quick Presets Chips */}
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                            {product.quantity > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setQuantity(product.quantity)}
                                    disabled={isPrinting || isExportingPdf}
                                    className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 transition-colors"
                                >
                                    Stock ({product.quantity})
                                </button>
                            )}
                            {[4, 10, 20, 50, 78, 100].map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setQuantity(preset)}
                                    disabled={isPrinting || isExportingPdf}
                                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                                        quantity === preset
                                            ? 'bg-slate-800 text-white border-slate-800'
                                            : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 80mm Thermal-Specific Options */}
                    {paperFormat === 'thermal' && (
                        <>
                            {/* Layout Selector: 4-up vs 2-up */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <Layers className="w-3.5 h-3.5 text-emerald-600" />
                                        Labels Per Paper Strip:
                                    </span>
                                    <span className="text-[11px] font-semibold text-emerald-700">
                                        {layout === '4-up' ? '4 per strip (2×2)' : '2 per strip (1×2)'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setLayout('4-up')}
                                        disabled={isPrinting}
                                        className={`py-2 px-2 rounded-lg text-xs font-medium border text-center transition-colors flex flex-col items-center justify-center gap-0.5 ${
                                            layout === '4-up'
                                                ? 'bg-emerald-600 text-white border-emerald-700 font-bold shadow-sm'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className="font-bold flex items-center gap-1">4 Labels (2×2 Grid)</span>
                                        <span className={`text-[10px] ${layout === '4-up' ? 'text-emerald-100' : 'text-slate-400'}`}>
                                            Fills top & bottom (No wasted space)
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLayout('2-up')}
                                        disabled={isPrinting}
                                        className={`py-2 px-2 rounded-lg text-xs font-medium border text-center transition-colors flex flex-col items-center justify-center gap-0.5 ${
                                            layout === '2-up'
                                                ? 'bg-emerald-600 text-white border-emerald-700 font-bold shadow-sm'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className="font-bold flex items-center gap-1">2 Labels (1 Row)</span>
                                        <span className={`text-[10px] ${layout === '2-up' ? 'text-emerald-100' : 'text-slate-400'}`}>
                                            Side-by-side single row
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Paper Media Mode Toggle */}
                            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <Tag className="w-3.5 h-3.5 text-amber-600" />
                                        Label Media Type:
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-500 uppercase">
                                        {mediaType === 'plain' ? 'Plain Paper' : 'Adhesive Roll'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleMediaTypeChange('plain')}
                                        disabled={isPrinting}
                                        className={`py-1.5 px-2.5 rounded-lg text-xs font-medium border text-center transition-colors flex items-center justify-center gap-1.5 ${
                                            mediaType === 'plain'
                                                ? 'bg-amber-700 text-white border-amber-800 font-bold shadow-sm'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        <Scissors className="w-3 h-3" /> Plain Paper
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleMediaTypeChange('adhesive')}
                                        disabled={isPrinting}
                                        className={`py-1.5 px-2.5 rounded-lg text-xs font-medium border text-center transition-colors flex items-center justify-center gap-1.5 ${
                                            mediaType === 'adhesive'
                                                ? 'bg-amber-700 text-white border-amber-800 font-bold shadow-sm'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        <Tag className="w-3 h-3" /> Adhesive Roll
                                    </button>
                                </div>
                                <p className="text-[10px] text-slate-500 leading-tight">
                                    {mediaType === 'plain'
                                        ? '• Plain paper: Cuts after every strip (each strip prints 4 labels with dashed cut lines).'
                                        : '• Adhesive roll: Die-cut stickers auto-advance; cuts only after the final label.'}
                                </p>
                            </div>
                        </>
                    )}

                    {/* A4 Sheet Specific Options */}
                    {paperFormat === 'a4' && (
                        <div className="space-y-3">
                            {/* A4 Grid Layout Selector */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                        <Layers className="w-3.5 h-3.5 text-blue-600" />
                                        Labels Per A4 Sheet:
                                    </span>
                                    <span className="text-[11px] font-semibold text-blue-700">
                                        {a4Layout === '40' ? '40 Labels (4×10 Grid)' : '24 Labels (3×8 Grid)'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setA4Layout('40')}
                                        disabled={isPrinting || isExportingPdf}
                                        className={`py-2 px-2 rounded-lg text-xs font-medium border text-center transition-colors flex flex-col items-center justify-center gap-0.5 ${
                                            a4Layout === '40'
                                                ? 'bg-blue-600 text-white border-blue-700 font-bold shadow-sm'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className="font-bold flex items-center gap-1">40 Labels (4×10)</span>
                                        <span className={`text-[10px] ${a4Layout === '40' ? 'text-blue-100' : 'text-slate-400'}`}>
                                            Standard (~47×25mm)
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setA4Layout('24')}
                                        disabled={isPrinting || isExportingPdf}
                                        className={`py-2 px-2 rounded-lg text-xs font-medium border text-center transition-colors flex flex-col items-center justify-center gap-0.5 ${
                                            a4Layout === '24'
                                                ? 'bg-blue-600 text-white border-blue-700 font-bold shadow-sm'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className="font-bold flex items-center gap-1">24 Labels (3×8)</span>
                                        <span className={`text-[10px] ${a4Layout === '24' ? 'text-blue-100' : 'text-slate-400'}`}>
                                            Larger (~63×32mm)
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Cutting Guides Option */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Scissors className="w-4 h-4 text-slate-500" />
                                    <div>
                                        <p className="text-xs font-bold text-slate-800">Dashed Cutting Guides</p>
                                        <p className="text-[10px] text-slate-500">
                                            Draws guide borders around stickers for easy scissors cutting
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setA4CutLines(!a4CutLines)}
                                    disabled={isPrinting || isExportingPdf}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        a4CutLines ? 'bg-blue-600' : 'bg-slate-300'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            a4CutLines ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Progress Indicator when Thermal Printing */}
                    {isPrinting && progress && paperFormat === 'thermal' && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5 text-center">
                            <div className="flex items-center justify-center gap-2 text-emerald-800 font-bold text-xs">
                                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                                <span>Sending labels to printer: {progress.printed} / {progress.total}</span>
                            </div>
                            <div className="w-full bg-emerald-200 rounded-full h-1.5 overflow-hidden">
                                <div 
                                    className="bg-emerald-600 h-full transition-all duration-200" 
                                    style={{ width: `${Math.round((progress.printed / progress.total) * 100)}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2 shrink-0">
                    {paperFormat === 'thermal' ? (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isPrinting}
                                className="flex-1 py-2.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-lg border border-slate-300 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handlePrint}
                                disabled={isPrinting || validQty <= 0}
                                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-50"
                            >
                                {isPrinting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Printing {validQty} Labels...
                                    </>
                                ) : (
                                    <>
                                        <Printer className="w-4 h-4" />
                                        Print {validQty} Labels ({piecesCount} {piecesCount === 1 ? 'strip' : 'strips'})
                                    </>
                                )}
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isPrinting || isExportingPdf}
                                className="py-2.5 px-3 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-lg border border-slate-300 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleExportA4Pdf}
                                disabled={isPrinting || isExportingPdf || validQty <= 0}
                                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                                title="Download vector A4 PDF file"
                            >
                                {isExportingPdf ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Exporting PDF...
                                    </>
                                ) : (
                                    <>
                                        <FileDown className="w-4 h-4" />
                                        Download PDF
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={handlePrintA4WindowsDialog}
                                disabled={isPrinting || isExportingPdf || validQty <= 0}
                                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                                title="Open Windows print dialogue"
                            >
                                {isPrinting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Opening Dialog...
                                    </>
                                ) : (
                                    <>
                                        <Printer className="w-4 h-4" />
                                        Print (Windows Dialog)
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
