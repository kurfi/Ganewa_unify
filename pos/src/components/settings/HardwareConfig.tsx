import React, { useState, useEffect } from 'react';
import { Printer } from 'lucide-react';
import { db } from '../../db/db';
import { useToast } from '../../contexts/ToastContext';
import { isTauri } from '../../services/directoryService';

export function HardwareConfig() {
    const [printerTarget, setPrinterTarget] = useState('');
    const { showToast } = useToast();

    useEffect(() => {
        const loadSettings = async () => {
            const pt = await db.settings.get('printerTarget');
            if (pt) setPrinterTarget(pt.value);
        };
        loadSettings();
    }, []);

    const savePrinterTarget = async () => {
        try {
            await db.settings.put({ key: 'printerTarget', value: printerTarget });
            showToast('Printer target saved successfully!', 'success');
        } catch (error) {
            console.error(error);
            showToast('Failed to save printer target.', 'error');
        }
    };

    if (!isTauri()) return null;

    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
                <div className="p-2.5 md:p-3 bg-blue-100 rounded-full">
                    <Printer className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                </div>
                <div>
                    <h2 className="text-base md:text-lg font-bold text-slate-900">Hardware Configuration</h2>
                    <p className="text-slate-500 text-xs md:text-sm">Setup printers and devices.</p>
                </div>
            </div>
            <div className="space-y-4">
                <div className="flex flex-col gap-1">
                    <label className="text-xs md:text-sm font-medium text-slate-700">Printer Target</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="tcp://192.168.1.100:9100"
                            value={printerTarget}
                            onChange={(e) => setPrinterTarget(e.target.value)}
                            className="flex-1 p-1.5 md:p-2 bg-white border border-slate-300 rounded-lg text-xs md:text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <button
                            onClick={savePrinterTarget}
                            className="px-3 md:px-4 py-1.5 md:py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 font-medium text-xs md:text-sm"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
