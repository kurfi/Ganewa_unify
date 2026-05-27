import React, { useState, useEffect } from 'react';
import { Folder, FolderOpen } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { getAppDirectory, setAppDirectory, DirectoryType, isTauri } from '../../services/directoryService';

export function FilePathConfig() {
    const [paths, setPaths] = useState({
        receipts: '', reports: '', exports: '', backups: ''
    });

    useEffect(() => {
        const loadPaths = async () => {
            if (isTauri()) {
                setPaths({
                    receipts: await getAppDirectory('receipts'),
                    reports: await getAppDirectory('reports'),
                    exports: await getAppDirectory('exports'),
                    backups: await getAppDirectory('backups')
                });
            }
        };
        loadPaths();
    }, []);

    const changePath = async (type: DirectoryType) => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                defaultPath: paths[type]
            });

            if (selected && typeof selected === 'string') {
                await setAppDirectory(type, selected);
                setPaths(prev => ({ ...prev, [type]: selected }));
            }
        } catch (err) {
            console.error("Failed to change path", err);
        }
    };

    if (!isTauri()) return null;

    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
                <div className="p-2.5 md:p-3 bg-emerald-100 rounded-full">
                    <Folder className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />
                </div>
                <div>
                    <h2 className="text-base md:text-lg font-bold text-slate-900">File Save Locations</h2>
                    <p className="text-slate-500 text-xs md:text-sm">Configure where files are saved.</p>
                </div>
            </div>
            <div className="space-y-3 md:space-y-4">
                {(['receipts', 'reports', 'exports', 'backups'] as DirectoryType[]).map(type => (
                    <div key={type} className="flex flex-col gap-1">
                        <label className="text-xs md:text-sm font-medium text-slate-700 capitalize">{type} Folder</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={paths[type]}
                                readOnly
                                className="flex-1 p-1.5 md:p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] md:text-sm text-slate-600 font-mono truncate"
                            />
                            <button
                                onClick={() => changePath(type)}
                                className="p-1.5 md:p-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700"
                                title="Change Folder"
                            >
                                <FolderOpen className="w-4 h-4 md:w-5 md:h-5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
