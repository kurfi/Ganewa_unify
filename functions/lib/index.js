"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrder = exports.blockStaffDomainSelfSignup = exports.setStaffPassword = exports.completePasswordChange = exports.setUserRole = exports.syncUserCreditInfo = exports.syncShopUserCreditOnLink = exports.syncCustomerCreditOnWritten = exports.searchCustomerSalesPOS = exports.getCustomerSalesHistory = exports.handleBudgetAlert = exports.onProductChange = exports.reconcileCustomerDebt = exports.cleanupAuditLogs = exports.onProductStockChange = exports.recalculateRunningBalance = exports.generateReport = exports.rollupDailyStats = exports.getNextInvoiceNumber = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const pubsub_1 = require("firebase-functions/v2/pubsub");
const https_1 = require("firebase-functions/v2/https");
const identity_1 = require("firebase-functions/v2/identity");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_2 = require("firebase-admin/firestore");
const date_fns_1 = require("date-fns");
const date_fns_tz_1 = require("date-fns-tz");
const staffAuth_1 = require("./constants/staffAuth");
// ─────────────────────────────────────────────────────────────
//  Admin SDK initialisation (singleton)
// ─────────────────────────────────────────────────────────────
(0, v2_1.setGlobalOptions)({ region: 'us-central1' });
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_2.getFirestore)();
// ─────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────
const STORE_EMAIL = 'ganewashoppingmallkurfi@gmail.com';
const STORE_TZ = 'Africa/Lagos';
/** Pad a number to 6 digits and prefix with INV- */
function formatInvoiceNo(n) {
    return `INV-${n.toString().padStart(6, '0')}`;
}
// ─────────────────────────────────────────────────────────────
//  TASK 1: Atomic invoice / receipt numbering
// ─────────────────────────────────────────────────────────────
exports.getNextInvoiceNumber = (0, https_1.onCall)({ region: 'us-central1', cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in to call this function.');
    }
    if (request.auth.token.email !== STORE_EMAIL) {
        console.warn(`[getNextInvoiceNumber] Rejected call from unauthorised user: ${request.auth.token.email}`);
        throw new https_1.HttpsError('permission-denied', 'Only the store account is allowed to generate invoice numbers.');
    }
    const counterRef = db.doc('settings/invoiceCounter');
    const nextNumber = await db.runTransaction(async (tx) => {
        var _a, _b;
        const snap = await tx.get(counterRef);
        let current = 0;
        if (snap.exists) {
            current = (_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 0;
        }
        const next = current + 1;
        tx.set(counterRef, {
            value: next,
            key: 'invoiceCounter',
            updated_at: firestore_2.FieldValue.serverTimestamp(),
        }, { merge: true });
        return next;
    });
    const formatted = formatInvoiceNo(nextNumber);
    console.log(`[getNextInvoiceNumber] Issued invoice number: ${formatted}`);
    return { invoiceNo: formatted, number: nextNumber };
});
// ─────────────────────────────────────────────────────────────
//  TASK 2: Scheduled daily stats rollup
// ─────────────────────────────────────────────────────────────
exports.rollupDailyStats = (0, scheduler_1.onSchedule)({
    schedule: '5 0 * * *',
    timeZone: STORE_TZ,
    region: 'us-central1',
}, async () => {
    const nowUtc = new Date();
    const nowLocal = (0, date_fns_tz_1.toZonedTime)(nowUtc, STORE_TZ);
    const yesterdayLocal = (0, date_fns_1.subDays)(nowLocal, 1);
    const dateLabel = (0, date_fns_1.format)(yesterdayLocal, 'yyyy-MM-dd');
    const dayStartLocal = (0, date_fns_1.startOfDay)(yesterdayLocal);
    const dayEndLocal = (0, date_fns_1.endOfDay)(yesterdayLocal);
    const tzOffsetMs = (nowLocal.getTime() - nowUtc.getTime());
    const dayStartUtc = new Date(dayStartLocal.getTime() - tzOffsetMs);
    const dayEndUtc = new Date(dayEndLocal.getTime() - tzOffsetMs);
    console.log(`[rollupDailyStats] Rolling up stats for ${dateLabel} ` +
        `(UTC window: ${dayStartUtc.toISOString()} – ${dayEndUtc.toISOString()})`);
    try {
        const sumField = async (collectionPath, field, extraFilters = []) => {
            var _a;
            let q = db
                .collection(collectionPath)
                .where('deleted', '==', false)
                .where('date', '>=', dayStartUtc)
                .where('date', '<=', dayEndUtc);
            for (const [f, op, val] of extraFilters) {
                q = q.where(f, op, val);
            }
            const aggSnap = await q.aggregate({ total: firestore_2.AggregateField.sum(field) }).get();
            return (_a = aggSnap.data().total) !== null && _a !== void 0 ? _a : 0;
        };
        const sumFieldAlt = async (collectionPath, dateField, field, extraFilters = []) => {
            var _a;
            let q = db
                .collection(collectionPath)
                .where('deleted', '==', false)
                .where(dateField, '>=', dayStartUtc)
                .where(dateField, '<=', dayEndUtc);
            for (const [f, op, val] of extraFilters) {
                q = q.where(f, op, val);
            }
            const aggSnap = await q.aggregate({ total: firestore_2.AggregateField.sum(field) }).get();
            return (_a = aggSnap.data().total) !== null && _a !== void 0 ? _a : 0;
        };
        const countCollection = async (collectionPath, dateField, extraFilters = []) => {
            var _a;
            let q = db
                .collection(collectionPath)
                .where('deleted', '==', false)
                .where(dateField, '>=', dayStartUtc)
                .where(dateField, '<=', dayEndUtc);
            for (const [f, op, val] of extraFilters) {
                q = q.where(f, op, val);
            }
            const aggSnap = await q.aggregate({ cnt: firestore_2.AggregateField.count() }).get();
            return (_a = aggSnap.data().cnt) !== null && _a !== void 0 ? _a : 0;
        };
        const [grossSales, totalRefundAmount, numItemsReturned, totalValueDamaged, totalExpenses, numSales, numReturns, numWriteOffs, totalWriteOffValue,] = await Promise.all([
            sumField('sales', 'finalAmount', [['status', '==', 'COMPLETED']]),
            sumFieldAlt('returns', 'returnDate', 'totalRefundAmount'),
            sumFieldAlt('returnedItems', 'returnDate', 'quantity'),
            sumFieldAlt('returnedItems', 'returnDate', 'valueLost', [['restockStatus', '==', 'damaged']]),
            sumField('expenses', 'amount', [['status', '==', 'PAID']]),
            countCollection('sales', 'date', [['status', '==', 'COMPLETED']]),
            countCollection('returns', 'returnDate'),
            countCollection('stockWriteOffs', 'date'),
            sumField('stockWriteOffs', 'totalValue'),
        ]);
        const netSales = grossSales - totalRefundAmount;
        const returnRate = grossSales > 0
            ? Math.round((totalRefundAmount / grossSales) * 10000) / 100
            : 0;
        const rollupDoc = {
            date: dateLabel,
            grossSales,
            netSales,
            totalExpenses,
            totalRefundAmount,
            numItemsReturned,
            totalValueDamaged,
            numSales,
            numReturns,
            numWriteOffs,
            totalWriteOffValue,
            returnRate,
            rolledUpAt: firestore_2.FieldValue.serverTimestamp(),
            _queryWindowUtc: {
                start: dayStartUtc.toISOString(),
                end: dayEndUtc.toISOString(),
            },
        };
        await db.doc(`dailyStats/${dateLabel}`).set(rollupDoc);
        console.log(`[rollupDailyStats] ✓ Wrote dailyStats/${dateLabel}: ` +
            `grossSales=${grossSales}, netSales=${netSales}, expenses=${totalExpenses}`);
    }
    catch (err) {
        console.error(`[rollupDailyStats] Failed for ${dateLabel}:`, err);
        throw err;
    }
});
// ─────────────────────────────────────────────────────────────
//  OPTIMIZATION 1: Server-Side Report Generation (`generateReport`)
// ─────────────────────────────────────────────────────────────
exports.generateReport = (0, https_1.onCall)({ region: 'us-central1', cors: true }, async (request) => {
    if (!request.auth || request.auth.token.email !== STORE_EMAIL) {
        throw new https_1.HttpsError('permission-denied', 'Unauthorized store access.');
    }
    const data = request.data;
    if (!data.startDate || !data.endDate) {
        throw new https_1.HttpsError('invalid-argument', 'startDate and endDate are required.');
    }
    const startObj = new Date(data.startDate);
    startObj.setHours(0, 0, 0, 0);
    const endObj = new Date(data.endDate);
    endObj.setHours(23, 59, 59, 999);
    const startTimestamp = firestore_2.Timestamp.fromDate(startObj);
    const endTimestamp = firestore_2.Timestamp.fromDate(endObj);
    try {
        const [salesSnap, expensesSnap, returnsSnap, returnedItemsSnap, purchasesSnap, paymentsSnap, suppliersSnap, productsSnap,] = await Promise.all([
            db.collection('sales').where('deleted', '==', false).where('date', '>=', startTimestamp).where('date', '<=', endTimestamp).get(),
            db.collection('expenses').where('deleted', '==', false).where('date', '>=', startTimestamp).where('date', '<=', endTimestamp).get(),
            db.collection('returns').where('deleted', '==', false).where('returnDate', '>=', startTimestamp).where('returnDate', '<=', endTimestamp).get(),
            db.collection('returnedItems').where('deleted', '==', false).where('returnDate', '>=', startTimestamp).where('returnDate', '<=', endTimestamp).get(),
            db.collection('purchases').where('deleted', '==', false).where('date', '>=', startTimestamp).where('date', '<=', endTimestamp).get(),
            db.collection('customerPayments').where('deleted', '==', false).where('date', '>=', startTimestamp).where('date', '<=', endTimestamp).get(),
            db.collection('suppliers').where('deleted', '==', false).get(),
            db.collection('products').where('deleted', '==', false).get(),
        ]);
        const source = data.source || 'pos';
        const sales = salesSnap.docs.map(doc => (Object.assign(Object.assign({}, doc.data()), { id: doc.id }))).filter((s) => {
            if (source === 'pos')
                return !s.source || s.source === 'pos';
            if (source === 'online')
                return s.source === 'online';
            return true; // 'all'
        });
        const expenses = expensesSnap.docs.map(doc => (Object.assign(Object.assign({}, doc.data()), { id: doc.id })));
        const returns = returnsSnap.docs.map(doc => (Object.assign(Object.assign({}, doc.data()), { id: doc.id })));
        const returnedItems = returnedItemsSnap.docs.map(doc => (Object.assign(Object.assign({}, doc.data()), { id: doc.id })));
        const purchases = purchasesSnap.docs.map(doc => (Object.assign(Object.assign({}, doc.data()), { id: doc.id })));
        const customerPayments = paymentsSnap.docs.map(doc => (Object.assign(Object.assign({}, doc.data()), { id: doc.id })));
        const suppliers = suppliersSnap.docs.map(doc => (Object.assign(Object.assign({}, doc.data()), { id: doc.id })));
        const products = productsSnap.docs.map(doc => (Object.assign(Object.assign({}, doc.data()), { id: doc.id })));
        let totalRevenue = 0;
        let totalDiscounts = 0;
        let totalCOGS = 0;
        const productStats = {};
        const salesByDateMap = {};
        const salesByPaymentMap = {};
        sales.forEach((s) => {
            var _a;
            const finalAmt = Number(s.finalAmount || 0);
            totalRevenue += finalAmt;
            totalDiscounts += Number(s.discount || 0);
            const dStr = ((_a = s.date) === null || _a === void 0 ? void 0 : _a.toDate) ? (0, date_fns_1.format)(s.date.toDate(), 'MMM dd') : (0, date_fns_1.format)(new Date(s.date), 'MMM dd');
            salesByDateMap[dStr] = (salesByDateMap[dStr] || 0) + finalAmt;
            if (s.paymentMethod === 'MULTIPAY' && Array.isArray(s.paymentMethods)) {
                s.paymentMethods.forEach((pm) => {
                    salesByPaymentMap[pm.method] = (salesByPaymentMap[pm.method] || 0) + Number(pm.amount || 0);
                });
            }
            else {
                const method = s.paymentMethod || 'CASH';
                salesByPaymentMap[method] = (salesByPaymentMap[method] || 0) + finalAmt;
            }
            (s.items || []).forEach((item) => {
                const cost = Number(item.costPrice || item.price || 0);
                totalCOGS += (Number(item.quantity || 0) * cost);
                if (!productStats[item.productId]) {
                    productStats[item.productId] = { name: item.productName || 'Unknown', qty: 0, revenue: 0 };
                }
                productStats[item.productId].qty += Number(item.quantity || 0);
                productStats[item.productId].revenue += Number(item.total || 0);
            });
        });
        // BUG 1 FIX: Only count PAID expenses — PENDING expenses are future obligations, money has not left yet
        const totalExpenses = expenses.filter((e) => e.status === 'PAID').reduce((acc, e) => acc + Number(e.amount || 0), 0);
        const totalRefunds = returns.reduce((acc, r) => acc + Number(r.totalRefundAmount || 0), 0);
        const totalValueLost = returnedItems.reduce((acc, ri) => acc + Number(ri.valueLost || 0), 0);
        const totalCostOfGoodReturns = returnedItems.reduce((acc, ri) => {
            if (Number(ri.valueLost || 0) > 0)
                return acc;
            let cost = Number(ri.costPrice || 0);
            if (!cost) {
                const p = products.find((prod) => prod.id === ri.productId);
                cost = Number((p === null || p === void 0 ? void 0 : p.buyPrice) || 0);
            }
            return acc + (Number(ri.quantity || 0) * cost);
        }, 0);
        const totalSupplierDebt = suppliers.reduce((acc, sup) => acc + Number(sup.balance || 0), 0);
        const totalPurchases = purchases.reduce((acc, pur) => acc + Number(pur.totalAmount || 0), 0);
        const totalDebtPaid = customerPayments.reduce((acc, cp) => acc + Number(cp.amount || 0), 0);
        const grossProfit = totalRevenue - totalCOGS;
        const netProfit = grossProfit - totalExpenses - totalRefunds + totalCostOfGoodReturns;
        const salesByDate = Object.entries(salesByDateMap).map(([date, amount]) => ({ date, amount }));
        const salesByPayment = Object.entries(salesByPaymentMap).map(([name, value]) => ({ name, value }));
        const topProducts = Object.values(productStats).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
        // Serialize Firestore Timestamps → ISO strings so they survive JSON transport
        const serializedSales = sales.map((s) => {
            var _a;
            return (Object.assign(Object.assign({}, s), { date: ((_a = s.date) === null || _a === void 0 ? void 0 : _a.toDate) ? s.date.toDate().toISOString() : s.date }));
        });
        return {
            totalRevenue,
            totalDiscounts,
            totalTransactions: sales.length,
            avgOrderValue: sales.length > 0 ? totalRevenue / sales.length : 0,
            totalExpenses,
            totalRefunds,
            totalValueLost,
            totalCOGS,
            grossProfit,
            netProfit,
            totalSupplierDebt,
            totalPurchases,
            totalDebtPaid,
            salesByDate,
            salesByPayment,
            topProducts,
            salesCount: sales.length,
            sales: serializedSales,
        };
    }
    catch (err) {
        console.error('[generateReport] Error:', err);
        throw new https_1.HttpsError('internal', err.message || 'Failed to generate report.');
    }
});
// ─────────────────────────────────────────────────────────────
//  OPTIMIZATION 2: Fast Running Balance (`settings/runningBalance`)
// ─────────────────────────────────────────────────────────────
/**
 * Helper to compute full balance snapshot
 */
async function computeFullBalanceSnapshot() {
    var _a, _b;
    const sumColMethod = async (col, method, field = 'finalAmount', statusField, statusVal) => {
        var _a;
        let q = db.collection(col).where('deleted', '==', false).where('paymentMethod', '==', method);
        if (statusField && statusVal) {
            q = q.where(statusField, '==', statusVal);
        }
        const snap = await q.aggregate({ total: firestore_2.AggregateField.sum(field) }).get();
        return (_a = snap.data().total) !== null && _a !== void 0 ? _a : 0;
    };
    const sumColAmountMethod = async (col, method) => {
        var _a;
        const q = db.collection(col).where('deleted', '==', false).where('paymentMethod', '==', method);
        const snap = await q.aggregate({ total: firestore_2.AggregateField.sum('amount') }).get();
        return (_a = snap.data().total) !== null && _a !== void 0 ? _a : 0;
    };
    const sumColRefundMethod = async (col, method) => {
        var _a;
        const q = db.collection(col).where('deleted', '==', false).where('paymentMethod', '==', method);
        const snap = await q.aggregate({ total: firestore_2.AggregateField.sum('totalRefundAmount') }).get();
        return (_a = snap.data().total) !== null && _a !== void 0 ? _a : 0;
    };
    const [salesCash, salesCard, salesTransfer, repayCash, repayCard, repayTransfer, refundCash, refundCard, refundTransfer, suppPayCash, suppPayCard, suppPayTransfer, expCash, expCard, expTransfer, multiPayCashSnap, multiPayBankSnap,] = await Promise.all([
        sumColMethod('sales', 'CASH', 'finalAmount', 'status', 'COMPLETED'),
        sumColMethod('sales', 'CARD', 'finalAmount', 'status', 'COMPLETED'),
        sumColMethod('sales', 'TRANSFER', 'finalAmount', 'status', 'COMPLETED'),
        sumColAmountMethod('customerPayments', 'CASH'),
        sumColAmountMethod('customerPayments', 'CARD'),
        sumColAmountMethod('customerPayments', 'TRANSFER'),
        sumColRefundMethod('returns', 'CASH'),
        sumColRefundMethod('returns', 'CARD'),
        sumColRefundMethod('returns', 'TRANSFER'),
        sumColAmountMethod('supplierPayments', 'CASH'),
        sumColAmountMethod('supplierPayments', 'CARD'),
        sumColAmountMethod('supplierPayments', 'TRANSFER'),
        sumColMethod('expenses', 'CASH', 'amount', 'status', 'PAID'),
        sumColMethod('expenses', 'CARD', 'amount', 'status', 'PAID'),
        sumColMethod('expenses', 'TRANSFER', 'amount', 'status', 'PAID'),
        db.collection('sales').where('deleted', '==', false).where('paymentMethod', '==', 'MULTIPAY').where('status', '==', 'COMPLETED').aggregate({ total: firestore_2.AggregateField.sum('multipayCash') }).get(),
        db.collection('sales').where('deleted', '==', false).where('paymentMethod', '==', 'MULTIPAY').where('status', '==', 'COMPLETED').aggregate({ total: firestore_2.AggregateField.sum('multipayBank') }).get(),
    ]);
    const multiCash = (_a = multiPayCashSnap.data().total) !== null && _a !== void 0 ? _a : 0;
    const multiBank = (_b = multiPayBankSnap.data().total) !== null && _b !== void 0 ? _b : 0;
    const cashFromSales = salesCash + multiCash;
    const bankFromSales = salesCard + salesTransfer + multiBank;
    const cashAtHand = cashFromSales + repayCash - expCash - refundCash - suppPayCash;
    const moneyInBank = bankFromSales + repayCard + repayTransfer - expCard - expTransfer - refundCard - refundTransfer - suppPayCard - suppPayTransfer;
    return {
        cashAtHand: Math.round(cashAtHand * 100) / 100,
        moneyInBank: Math.round(moneyInBank * 100) / 100,
    };
}
/**
 * Callable function to explicitly re-seed / recalculate running balance doc
 */
exports.recalculateRunningBalance = (0, https_1.onCall)({ region: 'us-central1', cors: true }, async (request) => {
    if (!request.auth || request.auth.token.email !== STORE_EMAIL) {
        throw new https_1.HttpsError('permission-denied', 'Unauthorized store access.');
    }
    const snapshot = await computeFullBalanceSnapshot();
    await db.doc('settings/runningBalance').set({
        cashAtHand: snapshot.cashAtHand,
        moneyInBank: snapshot.moneyInBank,
        updated_at: firestore_2.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log('[recalculateRunningBalance] Updated running balance:', snapshot);
    return snapshot;
});
// ─────────────────────────────────────────────────────────────
//  OPTIMIZATION 4: Real-time Low Stock Alert Trigger
// ─────────────────────────────────────────────────────────────
exports.onProductStockChange = (0, firestore_1.onDocumentWritten)({ document: 'products/{productId}', region: 'us-central1' }, async (event) => {
    var _a, _b;
    if (!event.data)
        return;
    const afterData = event.data.after.exists ? event.data.after.data() : null;
    if (!afterData || afterData.deleted)
        return;
    const quantity = Number((_a = afterData.quantity) !== null && _a !== void 0 ? _a : 0);
    const minStockLevel = Number((_b = afterData.minStockLevel) !== null && _b !== void 0 ? _b : 10);
    const productName = afterData.name || 'Unnamed Product';
    const productId = event.params.productId;
    if (quantity <= minStockLevel) {
        try {
            // Check if unread alert already exists for this product
            const existing = await db.collection('stockAlerts')
                .where('productId', '==', productId)
                .where('status', '==', 'UNREAD')
                .limit(1)
                .get();
            if (existing.empty) {
                await db.collection('stockAlerts').add({
                    productId,
                    productName,
                    quantity,
                    minStockLevel,
                    status: 'UNREAD',
                    created_at: firestore_2.FieldValue.serverTimestamp(),
                });
                console.log(`[stockAlert] Created alert for "${productName}" (qty: ${quantity} <= min: ${minStockLevel})`);
            }
        }
        catch (err) {
            console.error('[stockAlert] Error writing alert:', err);
        }
    }
});
// ─────────────────────────────────────────────────────────────
//  OPTIMIZATION 5: Audit Log TTL Cleanup (Weekly)
// ─────────────────────────────────────────────────────────────
exports.cleanupAuditLogs = (0, scheduler_1.onSchedule)({
    schedule: '0 3 * * 0', // Every Sunday at 03:00 WAT
    timeZone: STORE_TZ,
    region: 'us-central1',
}, async () => {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    console.log(`[cleanupAuditLogs] Deleting audit logs prior to ${ninetyDaysAgo.toISOString()}`);
    const oldLogsSnap = await db.collection('auditLogs')
        .where('created_at', '<', ninetyDaysAgo.toISOString())
        .limit(400)
        .get();
    if (oldLogsSnap.empty) {
        console.log('[cleanupAuditLogs] No expired audit logs found.');
        return;
    }
    const batch = db.batch();
    oldLogsSnap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`[cleanupAuditLogs] Deleted ${oldLogsSnap.size} old audit log entries.`);
});
// ─────────────────────────────────────────────────────────────
//  OPTIMIZATION 6: Customer Debt Drift Reconciliation (Weekly)
// ─────────────────────────────────────────────────────────────
exports.reconcileCustomerDebt = (0, scheduler_1.onSchedule)({
    schedule: '0 4 * * 0', // Every Sunday at 04:00 WAT
    timeZone: STORE_TZ,
    region: 'us-central1',
}, async () => {
    console.log('[reconcileCustomerDebt] Starting weekly customer debt reconciliation...');
    try {
        const customersSnap = await db.collection('customers').where('deleted', '==', false).get();
        for (const custDoc of customersSnap.docs) {
            const customerId = custDoc.id;
            const custData = custDoc.data();
            const storedDebt = Number(custData.currentDebt || 0);
            // Sum all credit sales for customer
            const salesSnap = await db.collection('sales')
                .where('deleted', '==', false)
                .where('customerId', '==', customerId)
                .get();
            let totalSalesDebt = 0;
            salesSnap.docs.forEach(sDoc => {
                const s = sDoc.data();
                if (s.paymentMethod === 'CREDIT') {
                    totalSalesDebt += Number(s.finalAmount || 0);
                }
                else if (Array.isArray(s.paymentMethods)) {
                    s.paymentMethods.forEach((pm) => {
                        if (pm.method === 'CREDIT') {
                            totalSalesDebt += Number(pm.amount || 0);
                        }
                    });
                }
            });
            // Sum all customer payments
            const paymentsSnap = await db.collection('customerPayments')
                .where('deleted', '==', false)
                .where('customerId', '==', customerId)
                .get();
            const totalRepayments = paymentsSnap.docs.reduce((sum, pDoc) => sum + Number(pDoc.data().amount || 0), 0);
            const expectedDebt = Math.max(0, Math.round((totalSalesDebt - totalRepayments) * 100) / 100);
            if (Math.abs(expectedDebt - storedDebt) > 0.01) {
                console.warn(`[reconcileCustomerDebt] Discrepancy for customer ${custData.name} (${customerId}): ` +
                    `Stored = ${storedDebt}, Expected = ${expectedDebt}`);
                await db.doc(`debtDiscrepancies/${customerId}`).set({
                    customerId,
                    customerName: custData.name || 'Unknown',
                    storedDebt,
                    expectedDebt,
                    difference: Math.round((storedDebt - expectedDebt) * 100) / 100,
                    reconciledAt: firestore_2.FieldValue.serverTimestamp(),
                });
            }
        }
        console.log('[reconcileCustomerDebt] Reconciliation finished.');
    }
    catch (err) {
        console.error('[reconcileCustomerDebt] Error during reconciliation:', err);
    }
});
// ─────────────────────────────────────────────────────────────
//  Existing functions (preserved)
// ─────────────────────────────────────────────────────────────
exports.onProductChange = (0, firestore_1.onDocumentWritten)({ document: 'products/{id}', region: 'us-central1' }, async () => {
    try {
        await db.collection('meta').doc('catalogVersion').set({ updatedAt: firestore_2.FieldValue.serverTimestamp() }, { merge: true });
        console.log('[onProductChange] Bumped meta/catalogVersion');
    }
    catch (err) {
        console.error('[onProductChange] Failed to bump meta/catalogVersion:', err);
    }
});
exports.handleBudgetAlert = (0, pubsub_1.onMessagePublished)({ topic: 'billing-budget-alerts', region: 'us-central1' }, async (event) => {
    var _a, _b, _c;
    try {
        const pubsubData = event.data.message.json;
        const costAmount = (_a = pubsubData.costAmount) !== null && _a !== void 0 ? _a : 0;
        const budgetAmount = (_b = pubsubData.budgetAmount) !== null && _b !== void 0 ? _b : 0;
        const currencyCode = (_c = pubsubData.currencyCode) !== null && _c !== void 0 ? _c : 'USD';
        console.warn(`[BUDGET ALERT] Spend update: ${currencyCode} ${costAmount} / Budget: ${currencyCode} ${budgetAmount}`);
        if (budgetAmount > 0 && costAmount >= budgetAmount) {
            console.error(`[BUDGET CRITICAL] HARD SPEND CEILING REACHED OR EXCEEDED! ` +
                `${currencyCode} ${costAmount} >= ${budgetAmount}`);
        }
    }
    catch (err) {
        console.error('[BUDGET ALERT] Error processing budget alert payload:', err);
    }
});
// ─────────────────────────────────────────────────────────────
//  FEATURE: Customer Sales History (for Customer History Modal)
// ─────────────────────────────────────────────────────────────
/**
 * getCustomerSalesHistory
 *
 * Callable function invoked by the Customer History Modal.
 * Returns:
 *  - sales[]       : up to 50 most-recent completed/non-deleted sales for the customer
 *  - payments[]    : up to 50 most-recent debt-repayment records for the customer
 *  - aggregates    : totalSpent, totalRepaid, salesCount, paymentsCount
 *
 * Auth: store account only (STORE_EMAIL).
 * Input: { customerId: string }
 */
exports.getCustomerSalesHistory = (0, https_1.onCall)({ region: 'us-central1', cors: true }, async (request) => {
    var _a, _b, _c, _d;
    if (!request.auth || request.auth.token.email !== STORE_EMAIL) {
        throw new https_1.HttpsError('permission-denied', 'Unauthorized store access.');
    }
    const { customerId } = request.data;
    if (!customerId || typeof customerId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', '`customerId` is required.');
    }
    console.log(`[getCustomerSalesHistory] Fetching history for customer: ${customerId}`);
    try {
        const salesBase = db.collection('sales')
            .where('deleted', '==', false)
            .where('customerId', '==', customerId);
        const paymentsBase = db.collection('customerPayments')
            .where('deleted', '==', false)
            .where('customerId', '==', customerId);
        // Run list queries + aggregate queries in parallel
        const [salesSnap, paymentsSnap, salesAgg, paymentsAgg,] = await Promise.all([
            salesBase.orderBy('date', 'desc').limit(50).get(),
            paymentsBase.orderBy('date', 'desc').limit(50).get(),
            salesBase.aggregate({
                totalSpent: firestore_2.AggregateField.sum('finalAmount'),
                salesCount: firestore_2.AggregateField.count(),
            }).get(),
            paymentsBase.aggregate({
                totalRepaid: firestore_2.AggregateField.sum('amount'),
                paymentsCount: firestore_2.AggregateField.count(),
            }).get(),
        ]);
        // Serialise Firestore Timestamps → ISO strings for JSON transport
        const serializeDate = (d) => {
            if (d === null || d === void 0 ? void 0 : d.toDate)
                return d.toDate().toISOString();
            if (d instanceof Date)
                return d.toISOString();
            return String(d !== null && d !== void 0 ? d : '');
        };
        const sales = salesSnap.docs.map(doc => {
            const data = doc.data();
            return Object.assign(Object.assign({}, data), { id: doc.id, date: serializeDate(data.date) });
        });
        const payments = paymentsSnap.docs.map(doc => {
            const data = doc.data();
            return Object.assign(Object.assign({}, data), { id: doc.id, date: serializeDate(data.date) });
        });
        const aggData = salesAgg.data();
        const payAggData = paymentsAgg.data();
        const result = {
            sales,
            payments,
            aggregates: {
                totalSpent: (_a = aggData.totalSpent) !== null && _a !== void 0 ? _a : 0,
                salesCount: (_b = aggData.salesCount) !== null && _b !== void 0 ? _b : 0,
                totalRepaid: (_c = payAggData.totalRepaid) !== null && _c !== void 0 ? _c : 0,
                paymentsCount: (_d = payAggData.paymentsCount) !== null && _d !== void 0 ? _d : 0,
            },
        };
        console.log(`[getCustomerSalesHistory] ✓ customer=${customerId} ` +
            `sales=${sales.length} payments=${payments.length} ` +
            `totalSpent=${result.aggregates.totalSpent} totalRepaid=${result.aggregates.totalRepaid}`);
        return result;
    }
    catch (err) {
        console.error('[getCustomerSalesHistory] Error:', err);
        throw new https_1.HttpsError('internal', err.message || 'Failed to fetch customer history.');
    }
});
// ─────────────────────────────────────────────────────────────
//  FEATURE: POS History Tab — Customer Sales Search
// ─────────────────────────────────────────────────────────────
/**
 * searchCustomerSalesPOS
 *
 * Callable function used by the POS History tab when the operator
 * types a customer name into the search box.
 *
 * Steps:
 *  1. Find customers whose `nameLower` starts with / contains the query.
 *  2. For each matched customer (up to 5), fetch their 50 most recent sales.
 *  3. Merge, de-duplicate, sort descending by date, and return the first 50.
 *  4. Return per-customer aggregates (total spent, sale count).
 *
 * Auth: store account only (STORE_EMAIL).
 * Input: { query: string }
 * Output: { sales[], customerAggregates: { [customerId]: { totalSpent, salesCount, customerName } } }
 */
exports.searchCustomerSalesPOS = (0, https_1.onCall)({ region: 'us-central1', cors: true }, async (request) => {
    var _a, _b;
    if (!request.auth || request.auth.token.email !== STORE_EMAIL) {
        throw new https_1.HttpsError('permission-denied', 'Unauthorized store access.');
    }
    const { query: rawQuery } = request.data;
    if (!rawQuery || typeof rawQuery !== 'string' || rawQuery.trim().length < 2) {
        throw new https_1.HttpsError('invalid-argument', '`query` must be at least 2 characters.');
    }
    const queryLower = rawQuery.trim().toLowerCase();
    console.log(`[searchCustomerSalesPOS] Searching for customers matching: "${queryLower}"`);
    try {
        // Step 1: Find matching customers using nameLower prefix range query
        // (Firestore range query trick: "name" <= query < "name\uf8ff" gives prefix match)
        const customersSnap = await db.collection('customers')
            .where('deleted', '==', false)
            .where('nameLower', '>=', queryLower)
            .where('nameLower', '<=', queryLower + '\uf8ff')
            .limit(5)
            .get();
        if (customersSnap.empty) {
            console.log(`[searchCustomerSalesPOS] No customers matched "${queryLower}"`);
            return { sales: [], customerAggregates: {} };
        }
        const matchedCustomers = customersSnap.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
        }));
        console.log(`[searchCustomerSalesPOS] Matched ${matchedCustomers.length} customer(s): ` +
            matchedCustomers.map(c => c.name).join(', '));
        // Step 2: Fetch sales + aggregates for each matched customer in parallel
        const salesBase = (customerId) => db.collection('sales')
            .where('deleted', '==', false)
            .where('customerId', '==', customerId);
        const perCustomerResults = await Promise.all(matchedCustomers.map(async (c) => {
            const base = salesBase(c.id);
            const [snap, agg] = await Promise.all([
                base.orderBy('date', 'desc').limit(50).get(),
                base.aggregate({
                    totalSpent: firestore_2.AggregateField.sum('finalAmount'),
                    salesCount: firestore_2.AggregateField.count(),
                }).get(),
            ]);
            return { customer: c, snap, agg };
        }));
        // Step 3: Merge, de-duplicate, sort and slice to 50
        const serializeDate = (d) => {
            if (d === null || d === void 0 ? void 0 : d.toDate)
                return d.toDate().toISOString();
            if (d instanceof Date)
                return d.toISOString();
            return String(d !== null && d !== void 0 ? d : '');
        };
        const salesMap = new Map();
        const customerAggregates = {};
        for (const { customer, snap, agg } of perCustomerResults) {
            const aggData = agg.data();
            customerAggregates[customer.id] = {
                totalSpent: (_a = aggData.totalSpent) !== null && _a !== void 0 ? _a : 0,
                salesCount: (_b = aggData.salesCount) !== null && _b !== void 0 ? _b : 0,
                customerName: customer.name,
            };
            snap.docs.forEach(doc => {
                if (!salesMap.has(doc.id)) {
                    const data = doc.data();
                    salesMap.set(doc.id, Object.assign(Object.assign({}, data), { id: doc.id, date: serializeDate(data.date) }));
                }
            });
        }
        const sortedSales = Array.from(salesMap.values())
            .sort((a, b) => {
            const tA = a.date ? new Date(a.date).getTime() : 0;
            const tB = b.date ? new Date(b.date).getTime() : 0;
            return tB - tA;
        })
            .slice(0, 50);
        console.log(`[searchCustomerSalesPOS] ✓ query="${queryLower}" → ` +
            `${sortedSales.length} sales from ${matchedCustomers.length} customer(s)`);
        return { sales: sortedSales, customerAggregates };
    }
    catch (err) {
        console.error('[searchCustomerSalesPOS] Error:', err);
        throw new https_1.HttpsError('internal', err.message || 'Failed to search customer sales.');
    }
});
// ─────────────────────────────────────────────────────────────
//  TASK 5: Automated & Fail-Safe Credit Info Synchronization
// ─────────────────────────────────────────────────────────────
/**
 * Triggered automatically whenever a POS customer document is created, updated, or deleted.
 * Admin SDK updates shopUsers documents linked to this POS customer.
 */
exports.syncCustomerCreditOnWritten = (0, firestore_1.onDocumentWritten)({ document: 'customers/{customerId}', region: 'us-central1' }, async (event) => {
    var _a;
    const customerId = event.params.customerId;
    const afterSnap = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    try {
        const shopUsersQuery = await db.collection('shopUsers')
            .where('linkedPosCustomerId', '==', customerId)
            .get();
        if (shopUsersQuery.empty) {
            return;
        }
        if (!afterSnap || !afterSnap.exists) {
            // Customer deleted -> clear creditInfo on linked accounts
            const batch = db.batch();
            shopUsersQuery.docs.forEach(doc => {
                batch.update(doc.ref, { creditInfo: null, updatedAt: firestore_2.FieldValue.serverTimestamp() });
            });
            await batch.commit();
            console.log(`[syncCustomerCreditOnWritten] Cleared creditInfo for customer ${customerId} (deleted)`);
            return;
        }
        const customerData = afterSnap.data();
        if (!customerData)
            return;
        const creditLimit = Number(customerData.creditLimit) || 0;
        const currentDebt = Number(customerData.currentDebt) || 0;
        const availableCredit = Math.max(0, creditLimit - currentDebt);
        const creditInfo = {
            creditLimit,
            currentDebt,
            availableCredit,
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
        };
        const batch = db.batch();
        shopUsersQuery.docs.forEach(doc => {
            batch.update(doc.ref, { creditInfo });
        });
        await batch.commit();
        console.log(`[syncCustomerCreditOnWritten] Synced creditInfo for customer ${customerId} (${customerData.name}) to ` +
            `${shopUsersQuery.docs.length} shopUser(s): limit=${creditLimit}, debt=${currentDebt}, avail=${availableCredit}`);
    }
    catch (err) {
        console.error(`[syncCustomerCreditOnWritten] Error syncing customer ${customerId}:`, err);
    }
});
/**
 * Triggered automatically whenever a shopUser profile document is created or updated.
 * Ensures creditInfo is immediately populated when an online user account is linked to a POS customer ID.
 */
exports.syncShopUserCreditOnLink = (0, firestore_1.onDocumentWritten)({ document: 'shopUsers/{userId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c;
    const userId = event.params.userId;
    const beforeData = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
    const afterSnap = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after;
    if (!afterSnap || !afterSnap.exists)
        return;
    const afterData = afterSnap.data();
    if (!afterData)
        return;
    const linkedPosCustomerId = afterData.linkedPosCustomerId;
    const prevLinkedPosCustomerId = beforeData === null || beforeData === void 0 ? void 0 : beforeData.linkedPosCustomerId;
    // Only run if linkedPosCustomerId changed or if creditInfo is missing despite having a link
    if (linkedPosCustomerId === prevLinkedPosCustomerId && afterData.creditInfo) {
        return;
    }
    try {
        if (!linkedPosCustomerId) {
            if (afterData.creditInfo !== null) {
                await afterSnap.ref.update({ creditInfo: null });
            }
            return;
        }
        const customerDoc = await db.collection('customers').doc(linkedPosCustomerId).get();
        if (!customerDoc.exists) {
            console.warn(`[syncShopUserCreditOnLink] Customer doc ${linkedPosCustomerId} not found for user ${userId}`);
            return;
        }
        const customerData = customerDoc.data();
        const creditLimit = Number(customerData.creditLimit) || 0;
        const currentDebt = Number(customerData.currentDebt) || 0;
        const availableCredit = Math.max(0, creditLimit - currentDebt);
        const creditInfo = {
            creditLimit,
            currentDebt,
            availableCredit,
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
        };
        await afterSnap.ref.update({ creditInfo });
        console.log(`[syncShopUserCreditOnLink] Initialized creditInfo for user ${userId} linked to POS customer ${linkedPosCustomerId}`);
    }
    catch (err) {
        console.error(`[syncShopUserCreditOnLink] Error initializing creditInfo for user ${userId}:`, err);
    }
});
/**
 * On-demand Callable Cloud Function for ecommerce clients to request a fresh credit sync.
 */
exports.syncUserCreditInfo = (0, https_1.onCall)({ region: 'us-central1', cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in to request credit sync.');
    }
    const uid = request.auth.uid;
    const userRef = db.collection('shopUsers').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        throw new https_1.HttpsError('not-found', 'User profile not found.');
    }
    const userData = userSnap.data();
    const linkedPosCustomerId = userData.linkedPosCustomerId;
    if (!linkedPosCustomerId) {
        return { success: false, reason: 'NOT_LINKED', creditInfo: null };
    }
    const customerDoc = await db.collection('customers').doc(linkedPosCustomerId).get();
    if (!customerDoc.exists) {
        return { success: false, reason: 'CUSTOMER_NOT_FOUND', creditInfo: null };
    }
    const customerData = customerDoc.data();
    const creditLimit = Number(customerData.creditLimit) || 0;
    const currentDebt = Number(customerData.currentDebt) || 0;
    const availableCredit = Math.max(0, creditLimit - currentDebt);
    const creditInfo = {
        creditLimit,
        currentDebt,
        availableCredit,
        updatedAt: firestore_2.FieldValue.serverTimestamp(),
    };
    await userRef.update({ creditInfo });
    console.log(`[syncUserCreditInfo] Explicit sync completed for user ${uid}`);
    return {
        success: true,
        creditInfo: {
            creditLimit,
            currentDebt,
            availableCredit,
        }
    };
});
// ─────────────────────────────────────────────────────────────
//  TASK 9: Admin Role Management (Custom Claims)
// ─────────────────────────────────────────────────────────────
exports.setUserRole = (0, https_1.onCall)({ region: 'us-central1', cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in to manage user roles.');
    }
    const callerRole = request.auth.token.role;
    // Strictly restricted to authenticated SUPER_ADMIN callers only (no email exceptions)
    if (callerRole !== 'SUPER_ADMIN') {
        throw new https_1.HttpsError('permission-denied', 'Only a verified SUPER_ADMIN can assign or change user roles.');
    }
    const { targetUid, role } = request.data;
    if (!targetUid || !role) {
        throw new https_1.HttpsError('invalid-argument', 'targetUid and role are required.');
    }
    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'USER'];
    if (!validRoles.includes(role)) {
        throw new https_1.HttpsError('invalid-argument', `Invalid role: ${role}`);
    }
    const authAdmin = (0, auth_1.getAuth)();
    await authAdmin.setCustomUserClaims(targetUid, { role });
    // Update role in Firestore users collection
    await db.collection('users').doc(targetUid).set({
        role,
        updatedAt: firestore_2.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[setUserRole] User ${targetUid} role set to ${role}`);
    return { success: true, targetUid, role };
});
// ─────────────────────────────────────────────────────────────
//  TASK 9.6: Clear mustChangePassword Claim After Password Update
// ─────────────────────────────────────────────────────────────
exports.completePasswordChange = (0, https_1.onCall)({ region: 'us-central1', cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in to complete password update.');
    }
    const uid = request.auth.uid;
    const currentRole = request.auth.token.role || 'CASHIER';
    const authAdmin = (0, auth_1.getAuth)();
    // Clear mustChangePassword while preserving role
    await authAdmin.setCustomUserClaims(uid, { role: currentRole, mustChangePassword: false });
    await db.collection('users').doc(uid).set({
        mustChangePassword: false,
        passwordChangedAt: firestore_2.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[completePasswordChange] User ${uid} successfully cleared mustChangePassword flag.`);
    return { success: true };
});
// ─────────────────────────────────────────────────────────────
//  SUPER_ADMIN-only: Reset a staff member's password
//  (Email password reset links cannot be delivered to @staff.ganewa.invalid)
// ─────────────────────────────────────────────────────────────
exports.setStaffPassword = (0, https_1.onCall)({ region: 'us-central1', cors: true }, async (request) => {
    var _a, _b;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in to reset a staff password.');
    }
    const callerRole = request.auth.token.role;
    if (callerRole !== 'SUPER_ADMIN') {
        throw new https_1.HttpsError('permission-denied', 'Only a verified SUPER_ADMIN can reset a staff member password.');
    }
    const { targetUid, newPassword, requirePasswordChange = true } = (request.data || {});
    if (!targetUid || typeof targetUid !== 'string' || !targetUid.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'targetUid is required.');
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new https_1.HttpsError('invalid-argument', 'newPassword must be at least 8 characters long.');
    }
    const trimmedUid = targetUid.trim();
    const authAdmin = (0, auth_1.getAuth)();
    let targetUser;
    try {
        targetUser = await authAdmin.getUser(trimmedUid);
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) === 'auth/user-not-found') {
            throw new https_1.HttpsError('not-found', `Staff user ${trimmedUid} not found.`);
        }
        throw err;
    }
    const targetRole = ((_a = targetUser.customClaims) === null || _a === void 0 ? void 0 : _a.role) || '';
    const isStaffEmail = (targetUser.email || '').toLowerCase().endsWith(staffAuth_1.STAFF_EMAIL_SUFFIX);
    const userDocSnap = await db.collection('users').doc(trimmedUid).get();
    if (!isStaffEmail && !userDocSnap.exists && !['SUPER_ADMIN', 'ADMIN', 'CASHIER'].includes(targetRole)) {
        throw new https_1.HttpsError('failed-precondition', 'Target user is not a staff account.');
    }
    await authAdmin.updateUser(trimmedUid, { password: newPassword });
    await authAdmin.revokeRefreshTokens(trimmedUid);
    const resolvedRole = targetRole || ((_b = userDocSnap.data()) === null || _b === void 0 ? void 0 : _b.role) || 'CASHIER';
    const mustChange = requirePasswordChange !== false;
    await authAdmin.setCustomUserClaims(trimmedUid, {
        role: resolvedRole,
        mustChangePassword: mustChange
    });
    await db.collection('users').doc(trimmedUid).set({
        mustChangePassword: mustChange,
        passwordResetAt: firestore_2.FieldValue.serverTimestamp(),
        passwordResetBy: request.auth.uid
    }, { merge: true });
    console.log(`[setStaffPassword] SUPER_ADMIN ${request.auth.uid} reset password for staff ${trimmedUid} (mustChangePassword=${mustChange})`);
    return { success: true, targetUid: trimmedUid, mustChangePassword: mustChange };
});
exports.blockStaffDomainSelfSignup = (0, identity_1.beforeUserCreated)(async (event) => {
    var _a;
    const user = event.data;
    const email = ((_a = user === null || user === void 0 ? void 0 : user.email) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
    // Block any public self-registration attempting to register with the staff domain or store email
    if (email.endsWith(staffAuth_1.STAFF_EMAIL_SUFFIX) || email === STORE_EMAIL) {
        console.warn(`[blockStaffDomainSelfSignup] Rejected public self-signup attempt for staff email: ${email}`);
        throw new identity_1.HttpsError('permission-denied', 'Staff accounts cannot be self-registered publicly. Contact your system administrator.');
    }
});
const DEFAULT_DELIVERY_FEE = 1500;
exports.createOrder = (0, https_1.onCall)({ region: 'us-central1', cors: true, enforceAppCheck: true }, async (request) => {
    var _a, _b;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in to place an order.');
    }
    const userId = request.auth.uid;
    const { items, customer, method, notes, amountPaidNow = 0, proofUrl = null, idempotencyKey } = request.data;
    // Idempotency key is strictly required
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'idempotencyKey is required for safe checkout.');
    }
    if (!items || !Array.isArray(items) || items.length === 0 || items.length > 50) {
        throw new https_1.HttpsError('invalid-argument', 'Order must contain between 1 and 50 item types.');
    }
    if (!customer || !((_a = customer.name) === null || _a === void 0 ? void 0 : _a.trim()) || !((_b = customer.phone) === null || _b === void 0 ? void 0 : _b.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'Customer name and phone are required.');
    }
    // 1. Merge duplicate product IDs and validate integer quantities
    const mergedQuantities = new Map();
    for (const item of items) {
        if (!item.id || typeof item.id !== 'string') {
            throw new https_1.HttpsError('invalid-argument', 'Valid product ID is required.');
        }
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 500) {
            throw new https_1.HttpsError('invalid-argument', `Invalid quantity for item ${item.id}. Must be an integer between 1 and 500.`);
        }
        const existing = mergedQuantities.get(item.id) || 0;
        const updated = existing + item.quantity;
        if (updated > 500) {
            throw new https_1.HttpsError('invalid-argument', `Total quantity for product ${item.id} exceeds maximum allowable limit of 500.`);
        }
        mergedQuantities.set(item.id, updated);
    }
    // Document ID for idempotency record: keyed by uid + idempotencyKey to prevent race conditions
    const idempotencyDocId = `${userId}_${idempotencyKey.trim()}`;
    const idempotencyRef = db.collection('orderIdempotency').doc(idempotencyDocId);
    const orderDocRef = db.collection('orders').doc();
    const now = firestore_2.Timestamp.now();
    const result = await db.runTransaction(async (transaction) => {
        var _a, _b, _c, _d;
        // Check idempotency record inside transaction first
        const idempSnap = await transaction.get(idempotencyRef);
        if (idempSnap.exists) {
            const idempData = idempSnap.data() || {};
            console.log(`[createOrder] Duplicate request caught by idempotencyKey document: ${idempotencyKey}`);
            return {
                orderId: idempData.orderId,
                id: idempData.orderDocId,
                total: idempData.total,
                idempotentReplay: true
            };
        }
        // Fetch dynamic delivery fee from settings document
        let deliveryFee = 0;
        if (method === 'delivery') {
            const settingsSnap = await transaction.get(db.doc('settings/storeConfig'));
            deliveryFee = settingsSnap.exists && Number.isFinite((_a = settingsSnap.data()) === null || _a === void 0 ? void 0 : _a.deliveryFee)
                ? Number((_b = settingsSnap.data()) === null || _b === void 0 ? void 0 : _b.deliveryFee)
                : DEFAULT_DELIVERY_FEE;
        }
        else {
            // Pickup and other non-delivery methods are strictly free
            deliveryFee = 0;
        }
        // Check user profile for linked customer
        const userRef = db.collection('shopUsers').doc(userId);
        const userSnap = await transaction.get(userRef);
        let resolvedLinkedPosCustomerId = null;
        if (userSnap.exists) {
            const userData = userSnap.data() || {};
            resolvedLinkedPosCustomerId = userData.linkedPosCustomerId || null;
        }
        // Read all product documents first
        let computedSubtotal = 0;
        const orderItems = [];
        const productUpdates = [];
        for (const [productId, quantity] of mergedQuantities.entries()) {
            const productRef = db.collection('products').doc(productId);
            const productSnap = await transaction.get(productRef);
            if (!productSnap.exists) {
                throw new https_1.HttpsError('not-found', `Product ${productId} not found.`);
            }
            const prodData = productSnap.data() || {};
            // Reject inactive or deleted products
            if (prodData.active === false || prodData.deleted === true) {
                throw new https_1.HttpsError('failed-precondition', `Product ${prodData.name || productId} is no longer available.`);
            }
            const currentStock = Number(prodData.quantity) || 0;
            if (currentStock < quantity) {
                throw new https_1.HttpsError('failed-precondition', `Insufficient stock for "${prodData.name || productId}". Available: ${currentStock}, requested: ${quantity}`);
            }
            const serverSellPrice = Number(prodData.sellPrice) || 0;
            const wholesalePrice = Number(prodData.wholesalePrice) || 0;
            const wholesaleThreshold = Number(prodData.wholesaleThreshold) || 0;
            // Server-calculated pricing
            const itemPrice = (wholesaleThreshold > 0 && wholesalePrice > 0 && quantity >= wholesaleThreshold)
                ? wholesalePrice
                : serverSellPrice;
            computedSubtotal += itemPrice * quantity;
            orderItems.push({
                id: productId,
                name: prodData.name || 'Unknown Item',
                price: itemPrice,
                originalPrice: serverSellPrice,
                quantity: quantity,
                photo: prodData.photo || null
            });
            productUpdates.push({
                ref: productRef,
                newQty: currentStock - quantity
            });
        }
        const computedTotal = computedSubtotal + deliveryFee;
        // Deduct stock atomically
        for (const update of productUpdates) {
            transaction.update(update.ref, {
                quantity: update.newQty,
                updated_at: firestore_2.FieldValue.serverTimestamp()
            });
        }
        const newOrderId = `ORD-${Date.now().toString().slice(-6)}`;
        const orderData = {
            orderId: newOrderId,
            idempotencyKey: idempotencyKey.trim(),
            userId,
            linkedPosCustomerId: resolvedLinkedPosCustomerId,
            items: orderItems,
            originalSubtotal: computedSubtotal,
            subtotal: computedSubtotal,
            deliveryFee,
            discountApplied: 0,
            total: computedTotal,
            customer: {
                name: customer.name.trim(),
                phone: customer.phone.trim(),
                address: method === 'pickup' ? 'PICKUP' : ((_c = customer.address) === null || _c === void 0 ? void 0 : _c.trim()) || '',
                email: ((_d = customer.email) === null || _d === void 0 ? void 0 : _d.trim()) || null
            },
            method,
            status: 'pending',
            notes: notes || '',
            createdAt: now,
            updatedAt: now,
            balanceRemaining: Math.max(0, computedTotal - amountPaidNow),
            payments: amountPaidNow > 0 ? [{
                    amount: amountPaidNow,
                    method: 'transfer',
                    proofUrl: proofUrl || null,
                    recordedBy: 'customer',
                    status: 'pending',
                    createdAt: now
                }] : []
        };
        transaction.set(orderDocRef, orderData);
        // Record idempotency lock in transaction with 24-hour TTL expiry
        const expiresAt = new firestore_2.Timestamp(now.seconds + 86400, now.nanoseconds);
        transaction.set(idempotencyRef, {
            userId,
            orderId: newOrderId,
            orderDocId: orderDocRef.id,
            total: computedTotal,
            createdAt: now,
            expiresAt
        });
        return { orderId: newOrderId, id: orderDocRef.id, total: computedTotal, idempotentReplay: false };
    });
    console.log(`[createOrder] Order created server-side: ${result.orderId} (Total: ${result.total}) for user ${userId}`);
    return Object.assign({ success: true }, result);
});
//# sourceMappingURL=index.js.map