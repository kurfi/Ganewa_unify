import { useState } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useToast } from '../contexts/ToastContext';
import { syncData } from '../services/syncService';
import { validateNumericField } from '../utils/validation';
import { computeBalances } from '../utils/computeBalances';
import { roundTo2 } from '../utils/math';
import { PaymentMethod } from '../types';

export function useExpenses() {
    const { showToast } = useToast();
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('Utilities');
    const [note, setNote] = useState('');
    const [status, setStatus] = useState<'PAID' | 'PENDING'>('PAID');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);

    const BANK_METHODS = [PaymentMethod.TRANSFER, PaymentMethod.CARD];

    const expenses = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray());

    const addExpense = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!category) {
            showToast('Category is required', 'error');
            return;
        }

        if (!validateNumericField(parseFloat(amount), 'Amount', 0.01, showToast)) {
            return;
        }

        const amountNum = parseFloat(amount);

        // Guardrail — only for PAID expenses; PENDING = future obligation, no funds leave now
        if (status === 'PAID') {
            try {
                const { cashAtHand, moneyInBank } = await computeBalances();
                const availableBalance = BANK_METHODS.includes(paymentMethod) ? moneyInBank : cashAtHand;
                const balanceLabel = BANK_METHODS.includes(paymentMethod) ? 'bank balance' : 'cash at hand';

                if (amountNum > availableBalance) {
                    const shortfall = roundTo2(amountNum - availableBalance);
                    showToast(
                        `Insufficient ${balanceLabel}. Available: ₦${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — Shortfall: ₦${shortfall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        'error'
                    );
                    return;
                }
            } catch (err) {
                console.warn('Balance check failed:', err);
                // Fail open — do not block if check throws
            }
        }

        try {
            await db.expenses.add({
                date: new Date(),
                category,
                amount: amountNum,
                note,
                status,
                paymentMethod: status === 'PAID' ? paymentMethod : undefined,
                // Pending expenses have no payment method — money hasn't left yet
            });
            setAmount('');
            setNote('');
            setStatus('PAID');
            setPaymentMethod(PaymentMethod.CASH);
            showToast('Expense recorded successfully!', 'success');

            syncData();
        } catch (error) {
            console.error("Failed to add expense:", error);
            showToast('Failed to record expense locally.', 'error');
        }
    };

    const toggleStatus = async (id: string, currentStatus: 'PAID' | 'PENDING') => {
        const newStatus = currentStatus === 'PAID' ? 'PENDING' : 'PAID';

        if (newStatus === 'PAID') {
            const expense = await db.expenses.get(id);
            if (expense) {
                try {
                    const { cashAtHand } = await computeBalances();
                    if (expense.amount > cashAtHand) {
                        const shortfall = roundTo2(expense.amount - cashAtHand);
                        showToast(
                            `Insufficient cash to mark as paid. Available: ₦${cashAtHand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — Shortfall: ₦${shortfall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                            'error'
                        );
                        return;
                    }
                } catch (err) {
                    console.warn('Balance check failed during toggle:', err);
                }
            }
            await db.expenses.update(id, { status: 'PAID', paymentMethod: PaymentMethod.CASH });
        } else {
            await db.expenses.update(id, { status: 'PENDING', paymentMethod: undefined });
        }
    };

    return {
        amount, setAmount,
        category, setCategory,
        note, setNote,
        status, setStatus,
        paymentMethod, setPaymentMethod,
        expenses,
        addExpense,
        toggleStatus
    };
}
