import React, { useMemo, useState } from 'react';
import { expensesRepo } from '../repositories';
import { usePaginatedCollection } from '../hooks/usePaginatedCollection';
import { useToast } from '../contexts/ToastContext';
import { validateNumericField } from '../utils/validation';
import { computeBalances } from '../utils/computeBalances';
import { roundTo2 } from '../utils/math';
import { Expense, PaymentMethod } from '../types';
import { emitDashboardRefresh } from '../utils/dashboardRefreshSignal';

export function useExpenses() {
    const { showToast } = useToast();
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('Utilities');
    const [note, setNote] = useState('');
    const [status, setStatus] = useState<'PAID' | 'PENDING'>('PAID');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);

    const BANK_METHODS = [PaymentMethod.TRANSFER, PaymentMethod.CARD];

    const { data: rawExpenses, loading, hasMore, loadMore, loadingMore, refresh } = usePaginatedCollection<Expense>({
        collectionName: 'expenses',
        orderByField: 'date',
        orderDirection: 'desc',
        pageSize: 50
    });

    const expenses = rawExpenses;

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
            await expensesRepo.create({
                date: new Date(),
                category,
                amount: amountNum,
                note,
                status,
                paymentMethod: status === 'PAID' ? paymentMethod : undefined,
                // Pending expenses have no payment method — money hasn't left yet
            });
            emitDashboardRefresh();
            refresh();
            setAmount('');
            setNote('');
            setStatus('PAID');
            setPaymentMethod(PaymentMethod.CASH);
            showToast('Expense recorded successfully!', 'success');

        } catch (error) {
            console.error("Failed to add expense:", error);
            showToast('Failed to record expense.', 'error');
        }
    };

    const toggleStatus = async (id: string, currentStatus: 'PAID' | 'PENDING', targetMethod: PaymentMethod = PaymentMethod.CASH) => {
        const newStatus = currentStatus === 'PAID' ? 'PENDING' : 'PAID';

        if (newStatus === 'PAID') {
            const expense = await expensesRepo.getById(id);
            if (expense) {
                try {
                    const { cashAtHand, moneyInBank } = await computeBalances();
                    const isBank = BANK_METHODS.includes(targetMethod);
                    const availableBalance = isBank ? moneyInBank : cashAtHand;
                    const balanceLabel = isBank ? 'bank balance' : 'cash at hand';

                    if (expense.amount > availableBalance) {
                        const shortfall = roundTo2(expense.amount - availableBalance);
                        showToast(
                            `Insufficient ${balanceLabel} to mark as paid. Available: ₦${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — Shortfall: ₦${shortfall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                            'error'
                        );
                        return;
                    }
                } catch (err) {
                    console.warn('Balance check failed during toggle:', err);
                }
            }
            await expensesRepo.update(id, { status: 'PAID', paymentMethod: targetMethod });
        } else {
            await expensesRepo.update(id, { status: 'PENDING', paymentMethod: undefined });
        }
        emitDashboardRefresh();
        refresh();
    };

    return {
        amount, setAmount,
        category, setCategory,
        note, setNote,
        status, setStatus,
        paymentMethod, setPaymentMethod,
        expenses,
        loading, hasMore, loadMore, loadingMore,
        addExpense,
        toggleStatus
    };
}
