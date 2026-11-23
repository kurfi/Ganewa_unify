import React, { useState, useEffect } from 'react';
import {
    Printer,
    CheckCircle,
    XCircle,
    RefreshCw,
    Send,
    Usb,
    Bluetooth,
    Radio,
    Trash2,
    Info,
    Check
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { getPrintBridgeUrl, printDirectToThermalPrinter } from '../../services/printerService';
import {
    isWebUsbSupported,
    isWebBluetoothSupported,
    isWebSerialSupported,
    requestUsbPrinter,
    requestBluetoothPrinter,
    requestSerialPrinter,
    getDirectHardwareStatus,
    clearSavedHardware,
    DirectHardwareInfo,
    getSavedLabelMediaType,
    setSavedLabelMediaType,
    LabelMediaType
} from '../../services/webPrintService';

export function HardwareConfig() {
    const [printerTarget, setPrinterTarget] = useState('');
    const [isChecking, setIsChecking] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [statusInfo, setStatusInfo] = useState<{ ok: boolean; message: string; printer?: string } | null>(null);

    // Direct Web Hardware State
    const [hardwareInfo, setHardwareInfo] = useState<DirectHardwareInfo>({
        type: 'none',
        name: '',
        isSupported: false,
        connected: false
    });
    const [isConnectingHardware, setIsConnectingHardware] = useState(false);

    // Label media type — read once from localStorage; saved immediately on toggle
    const [labelMediaType, setLabelMediaType] = useState<LabelMediaType>(() => getSavedLabelMediaType());

    const { showToast } = useToast();

    useEffect(() => {
        const pt = localStorage.getItem('printerTarget') || '';
        setPrinterTarget(pt);
        checkBridge(pt || getPrintBridgeUrl());
        refreshHardwareStatus();
    }, []);

    const refreshHardwareStatus = async () => {
        try {
            const status = await getDirectHardwareStatus();
            setHardwareInfo(status);
        } catch (e) {
            console.warn('Failed to get direct hardware status:', e);
        }
    };

    const checkBridge = async (urlToCheck?: string) => {
        setIsChecking(true);
        const url = (urlToCheck || getPrintBridgeUrl()).replace(/\/+$/, '');
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const res = await fetch(`${url}/status`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                setStatusInfo({ ok: true, message: `Connected to ${data.printer || 'Thermal Printer'}`, printer: data.printer });
            } else {
                setStatusInfo({ ok: false, message: `Bridge returned status ${res.status}` });
            }
        } catch {
            setStatusInfo({ ok: false, message: 'Print bridge offline or unreachable' });
        } finally {
            setIsChecking(false);
        }
    };

    const handlePairUsb = async () => {
        setIsConnectingHardware(true);
        try {
            const name = await requestUsbPrinter();
            showToast(`Paired with USB printer: ${name}`, 'success');
            await refreshHardwareStatus();
        } catch (err: any) {
            if (err.name !== 'NotFoundError' && !err.message?.includes('No device selected')) {
                showToast(`USB connection failed: ${err.message}`, 'error');
            }
        } finally {
            setIsConnectingHardware(false);
        }
    };

    const handlePairBluetooth = async () => {
        setIsConnectingHardware(true);
        try {
            const name = await requestBluetoothPrinter();
            showToast(`Paired with Bluetooth printer: ${name}`, 'success');
            await refreshHardwareStatus();
        } catch (err: any) {
            if (err.name !== 'NotFoundError' && !err.message?.includes('User cancelled')) {
                showToast(`Bluetooth connection failed: ${err.message}`, 'error');
            }
        } finally {
            setIsConnectingHardware(false);
        }
    };

    const handlePairSerial = async () => {
        setIsConnectingHardware(true);
        try {
            const name = await requestSerialPrinter();
            showToast(`Paired with Serial printer: ${name}`, 'success');
            await refreshHardwareStatus();
        } catch (err: any) {
            if (err.name !== 'NotFoundError' && !err.message?.includes('No port selected')) {
                showToast(`Serial connection failed: ${err.message}`, 'error');
            }
        } finally {
            setIsConnectingHardware(false);
        }
    };

    const handleDisconnectHardware = async () => {
        await clearSavedHardware();
        await refreshHardwareStatus();
        showToast('Direct hardware printer disconnected', 'info');
    };

    const savePrinterTarget = async () => {
        try {
            const clean = printerTarget.trim();
            if (clean) {
                localStorage.setItem('printerTarget', clean);
            } else {
                localStorage.removeItem('printerTarget');
            }
            showToast('Printer bridge address saved!', 'success');
            checkBridge(clean || 'http://127.0.0.1:9123');
        } catch (error) {
            console.error(error);
            showToast('Failed to save printer settings.', 'error');
        }
    };

    const handleTestPrint = async () => {
        setIsTesting(true);
        try {
            const encoder = new TextEncoder();
            const chunks = [
                new Uint8Array([0x1b, 0x40]), // Init
                new Uint8Array([0x1b, 0x61, 0x01]), // Center
                encoder.encode("Ganewa Shopping Mall Kurfi\n"),
                encoder.encode("Thermal Printer Test\n"),
                encoder.encode("--------------------------------\n"),
                new Uint8Array([0x1b, 0x61, 0x00]), // Left
                encoder.encode("Status: DIRECT SILENT PRINT OK\n"),
                encoder.encode(`Channel: ${hardwareInfo.type !== 'none' ? hardwareInfo.type.toUpperCase() : 'PRINT BRIDGE'}\n`),
                encoder.encode(`Date: ${new Date().toLocaleString()}\n`),
                encoder.encode("--------------------------------\n"),
                new Uint8Array([0x1b, 0x61, 0x01]), // Center
                encoder.encode("Mun gode da kasuwancin ku!\n\n\n\n"),
                new Uint8Array([0x1d, 0x56, 0x00]) // Cut paper
            ];
            const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
            const buffer = new Uint8Array(totalLen);
            let offset = 0;
            for (const c of chunks) {
                buffer.set(c, offset);
                offset += c.length;
            }

            const ok = await printDirectToThermalPrinter(buffer);
            if (ok) {
                showToast('Test receipt printed directly without dialog!', 'success');
            } else {
                showToast('Direct print failed. Falling back to browser print...', 'warning');
                window.print();
            }
        } catch (err: any) {
            showToast(`Test print failed: ${err?.message || 'Error'}`, 'error');
        } finally {
            setIsTesting(false);
        }
    };

    const handleLabelMediaChange = (type: LabelMediaType) => {
        setLabelMediaType(type);
        setSavedLabelMediaType(type);
        showToast(
            type === 'plain'
                ? 'Label media set to Plain receipt paper'
                : 'Label media set to Adhesive die-cut roll',
            'success'
        );
    };

    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
                <div className="p-2.5 md:p-3 bg-emerald-100 rounded-full">
                    <Printer className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />
                </div>
                <div>
                    <h2 className="text-base md:text-lg font-bold text-slate-900">Thermal Printer (Xprinter XP-80)</h2>
                    <p className="text-slate-500 text-xs md:text-sm">Direct silent printing via WebUSB / Bluetooth (Chromebook, Android, PC) or Local Bridge.</p>
                </div>
            </div>

            <div className="space-y-5">
                {/* SECTION 1: Direct Web Hardware Printing (No Dialog, No Server) */}
                <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                                    <Usb className="w-4 h-4" />
                                </span>
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-800">Direct Browser Printing (WebUSB / Bluetooth)</h3>
                                    <p className="text-xs text-slate-500">Zero-dialog, zero-server direct printing for Chrome on Chromebook, Android, and PC.</p>
                                </div>
                            </div>
                            {hardwareInfo.type !== 'none' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    <Check className="w-3.5 h-3.5" />
                                    {hardwareInfo.type === 'webusb' ? 'WebUSB Paired' : hardwareInfo.type === 'webbluetooth' ? 'Bluetooth Paired' : 'Serial Paired'}
                                </span>
                            )}
                        </div>

                        {/* Paired Device Info or Action Buttons */}
                        {hardwareInfo.type !== 'none' ? (
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-emerald-200">
                                <div>
                                    <p className="text-xs font-semibold text-slate-800">{hardwareInfo.name || 'Connected Printer'}</p>
                                    <p className="text-[11px] text-slate-500">
                                        Type: <span className="uppercase font-medium">{hardwareInfo.type}</span> &bull; Silent direct print active (no browser print dialog)
                                    </p>
                                </div>
                                <button
                                    onClick={handleDisconnectHardware}
                                    className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded border border-red-200 transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Disconnect
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {isWebUsbSupported() && (
                                        <button
                                            onClick={handlePairUsb}
                                            disabled={isConnectingHardware}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
                                        >
                                            <Usb className="w-4 h-4" />
                                            Pair USB Printer (Chromebook/Android/PC)
                                        </button>
                                    )}
                                    {isWebBluetoothSupported() && (
                                        <button
                                            onClick={handlePairBluetooth}
                                            disabled={isConnectingHardware}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
                                        >
                                            <Bluetooth className="w-4 h-4" />
                                            Pair Bluetooth Printer
                                        </button>
                                    )}
                                    {isWebSerialSupported() && (
                                        <button
                                            onClick={handlePairSerial}
                                            disabled={isConnectingHardware}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
                                        >
                                            <Radio className="w-4 h-4" />
                                            Pair Serial / COM Port
                                        </button>
                                    )}
                                </div>

                            </div>
                        )}
                    </div>

                {/* SECTION 2: Label Media Type */}
                <div className="border border-amber-200 bg-amber-50/40 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                            <Printer className="w-4 h-4" />
                        </span>
                        <div>
                            <h3 className="text-sm font-semibold text-slate-800">Label Media Type</h3>
                            <p className="text-xs text-slate-500">
                                Controls how product barcode labels are cut and spaced. Change this once when you switch paper stock — not per print.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={() => handleLabelMediaChange('plain')}
                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                                labelMediaType === 'plain'
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                                    : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400 hover:text-emerald-700'
                            }`}
                        >
                            ✂️ Plain Receipt Paper
                            <span className={`block font-normal mt-0.5 ${labelMediaType === 'plain' ? 'text-emerald-100' : 'text-slate-400'}`}>
                                Cut after every copy
                            </span>
                        </button>
                        <button
                            onClick={() => handleLabelMediaChange('adhesive')}
                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                                labelMediaType === 'adhesive'
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                                    : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400 hover:text-emerald-700'
                            }`}
                        >
                            🏷️ Adhesive Label Roll
                            <span className={`block font-normal mt-0.5 ${labelMediaType === 'adhesive' ? 'text-emerald-100' : 'text-slate-400'}`}>
                                Cut only after last copy
                            </span>
                        </button>
                    </div>

                    <p className="text-[11px] text-slate-500 flex items-start gap-1">
                        <Info className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                        <span>
                            <strong>Plain:</strong> each label is cut as a separate strip — tape it onto the product.&nbsp;
                            <strong>Adhesive:</strong> die-cut roll advances automatically; single cut at end of batch only.
                        </span>
                    </p>
                </div>

                {/* SECTION 3: Network / Local Print Bridge (Fallback & Multi-device Wi-Fi) */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-800">Alternative: Local / Network Print Bridge</h3>
                            <p className="text-xs text-slate-500">Useful if sharing a printer over store Wi-Fi via a host Windows PC.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                                statusInfo?.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                                {statusInfo?.ok ? <CheckCircle className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-slate-400" />}
                                {statusInfo ? statusInfo.message : 'Checking...'}
                            </span>
                            <button
                                onClick={() => checkBridge()}
                                disabled={isChecking}
                                className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                                title="Refresh Bridge"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-slate-700">
                            Printer Bridge Address
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="http://127.0.0.1:9123"
                                value={printerTarget}
                                onChange={(e) => setPrinterTarget(e.target.value)}
                                className="flex-1 p-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                            <button
                                onClick={savePrinterTarget}
                                className="px-3 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 font-medium text-xs"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>

                {/* Test Print Action */}
                <div className="pt-2 flex gap-3 items-center">
                    <button
                        onClick={handleTestPrint}
                        disabled={isTesting}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs md:text-sm rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                    >
                        <Send className="w-3.5 h-3.5" />
                        {isTesting ? 'Sending to Printer...' : 'Test Direct Print (XP-80)'}
                    </button>
                    <span className="text-[11px] text-slate-500">
                        {hardwareInfo.type !== 'none'
                            ? `Will test via direct ${hardwareInfo.type.toUpperCase()}`
                            : 'Will test via Bridge / fallback'}
                    </span>
                </div>
            </div>

            {/* Hidden on screen, visible during browser print fallback */}
            <div id="printable-receipt" className="hidden" aria-hidden="true">
                <div id="receipt-content" className="p-4 bg-white font-mono text-xs text-black">
                    <div className="text-center font-bold text-sm mb-1">Ganewa Shopping Mall Kurfi</div>
                    <div className="text-center text-[10px] text-slate-600 mb-2">Tashan Ladan, Mamman Na'antu Street</div>
                    <div className="border-t border-b border-dashed border-black py-2 my-2 space-y-1">
                        <div className="font-bold text-center">*** TEST PRINT OK ***</div>
                        <div>Printer: Xprinter XP-T80Q (203 DPI)</div>
                        <div>Date: {new Date().toLocaleString()}</div>
                        <div>Mode: Browser Thermal Print</div>
                    </div>
                    <div className="text-center text-xs mt-3 font-medium">Mun gode da kasuwancin ku!</div>
                </div>
            </div>
        </div>
    );
}
