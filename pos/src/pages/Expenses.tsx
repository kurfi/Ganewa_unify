import React from 'react';
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
        addExpense,
        toggleStatus
    } = useExpenses();

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <ExpenseForm
                amount={amount} setAmount={setAmount}
                category={category} setCategory={setCategory}
                note={note} setNote={setNote}
                status={status} setStatus={setStatus}
                paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
                addExpense={addExpense}
            />
            <ExpenseHistory
                expenses={expenses}
                toggleStatus={toggleStatus}
            />
        </div>
    );
};

export default Expenses;