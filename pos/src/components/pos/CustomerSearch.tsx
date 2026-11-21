import React, { useState, useEffect, useRef } from 'react';
import { Search, User, X } from 'lucide-react';
import { Customer } from '../../types';

interface CustomerSearchProps {
    customers: Customer[] | undefined;
    selectedCustomer: Customer | null;
    setSelectedCustomer: (customer: Customer | null) => void;
}

const getCustomerDisplayName = (customer: Customer | null | undefined): string => {
    if (!customer) return '';
    const trimmed = customer.name?.trim();
    if (trimmed) return trimmed;
    if (customer.phone?.trim()) return `Customer (${customer.phone.trim()})`;
    if (customer.email?.trim()) return customer.email.trim();
    return 'Unnamed Customer';
};

export function CustomerSearch({
    customers,
    selectedCustomer,
    setSelectedCustomer
}: CustomerSearchProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Filter customers based on search query
    const filteredCustomers = customers?.filter(c => {
        if (!c.name || c.name.trim() === '') return false;
        const queryLower = (searchQuery || '').toLowerCase().trim();
        if (!queryLower) return true;
        const nameMatch = c.name.toLowerCase().includes(queryLower);
        const phoneMatch = (c.phone || '').includes(queryLower);
        const emailMatch = (c.email || '').toLowerCase().includes(queryLower);
        return nameMatch || phoneMatch || emailMatch;
    }).sort((a, b) => {
        return (a.name || '').localeCompare(b.name || '');
    }) || [];

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Synchronize searchQuery with selectedCustomer when dropdown is closed
    useEffect(() => {
        if (!isOpen) {
            setSearchQuery(selectedCustomer ? getCustomerDisplayName(selectedCustomer) : '');
        }
    }, [isOpen, selectedCustomer]);

    const handleSelect = (customer: Customer | null) => {
        setSelectedCustomer(customer);
        setSearchQuery(customer ? getCustomerDisplayName(customer) : '');
        setIsOpen(false);
    };

    const clearSelection = (e: React.MouseEvent) => {
        e.stopPropagation();
        handleSelect(null);
    };

    return (
        <div className="relative" ref={containerRef}>
            <div className="flex items-center gap-2 text-slate-600 mb-1">
                <User className="w-3 h-3" />
                <span className="text-xs font-medium uppercase tracking-wide">Customer</span>
            </div>
            
            <div 
                className="relative group cursor-text"
                onClick={() => {
                    setIsOpen(true);
                    inputRef.current?.focus();
                }}
            >
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                    <Search className="w-4 h-4" />
                </div>
                
                <input
                    ref={inputRef}
                    type="text"
                    className="w-full pl-10 pr-10 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-400"
                    placeholder="Search customer..."
                    value={isOpen ? searchQuery : (selectedCustomer ? getCustomerDisplayName(selectedCustomer) : 'Walk-in Customer')}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsOpen(true)}
                />

                {(selectedCustomer || (isOpen && searchQuery)) && (
                    <button 
                        onClick={clearSelection}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                        title="Clear selection"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Results Dropdown */}
            {isOpen && (
                <div className="absolute z-[100] left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 min-w-[250px]">
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar overflow-x-hidden">
                        {/* Default Walk-in Option */}
                        <button
                            onClick={() => handleSelect(null)}
                            className={`w-full px-4 py-2.5 text-left text-sm transition-colors border-b border-slate-50 flex items-center justify-between
                                ${selectedCustomer === null ? 'bg-emerald-50 text-emerald-700 font-medium' : 'hover:bg-slate-50 text-slate-700'}`}
                        >
                            <span>Walk-in Customer</span>
                            {selectedCustomer === null && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                        </button>

                        {filteredCustomers.length > 0 ? (
                            filteredCustomers.map(customer => (
                                <button
                                    key={customer.id}
                                    onClick={() => handleSelect(customer)}
                                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex flex-col gap-0.5 border-b border-slate-50 last:border-0
                                        ${selectedCustomer?.id === customer.id ? 'bg-emerald-50 text-emerald-700 font-medium' : 'hover:bg-slate-50 text-slate-700'}`}
                                >
                                    <div className="flex justify-between items-center w-full min-w-0">
                                        <span className="truncate">{getCustomerDisplayName(customer)}</span>
                                        {selectedCustomer?.id === customer.id && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 ml-2" />}
                                    </div>
                                    {customer.currentDebt > 0 && (
                                        <span className="text-[10px] text-red-500 font-semibold bg-red-50 px-1.5 py-0.5 rounded-md inline-block w-fit">
                                            Debt: ₦{customer.currentDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    )}
                                    {customer.phone && (
                                        <span className="text-[10px] text-slate-400">{customer.phone}</span>
                                    )}
                                </button>
                            ))
                        ) : searchQuery.length > 0 && (
                            <div className="px-4 py-6 text-center text-slate-500 text-sm italic">
                                No customers found matching "{searchQuery}"
                            </div>
                        )}
                    </div>
                    
                    {/* Footer / Mobile Help */}
                    <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex justify-between items-center">
                        <span>{filteredCustomers.length} customers found</span>
                        <span className="hidden sm:inline">Press Esc to close</span>
                    </div>
                </div>
            )}
        </div>
    );
}
