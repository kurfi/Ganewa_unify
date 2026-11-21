import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useExpenses } from '../hooks/useExpenses';
import { ExpenseForm } from '../components/expenses/ExpenseForm';
import { ExpenseHistory } from '../components/expenses/ExpenseHistory';

const Expenses: React.FC = () => {
    const {
        amount, setAmount,
        category, setCategory,
        note, setNote,
        status, setStatus,
        paymentMethod, setPaymentMethod,
        expenses,
        loading, hasMore, loadMore, loadingMore,
        addExpense,
        toggleStatus
    } = useExpenses();

    // BUG 2 FIX: increment after each successful submission so ExpenseForm re-fetches the live balance
    const [submitCount, setSubmitCount] = useState(0);

    const handleAddExpense = async (e: React.FormEvent) => {
        await addExpense(e);
        setSubmitCount(c => c + 1);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <ExpenseForm
                amount={amount} setAmount={setAmount}
                category={category} setCategory={setCategory}
                note={note} setNote={setNote}
                status={status} setStatus={setStatus}
                paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
                addExpense={handleAddExpense}
                refreshKey={submitCount}
            />
            <ExpenseHistory
                expenses={expenses}
                loading={loading}
                hasMore={hasMore}
                loadMore={loadMore}
                loadingMore={loadingMore}
                toggleStatus={toggleStatus}
            />
        </div>
    );
};

export default Expenses;