<p align="center">
  <img src="public/pwa-192x192.png" alt="Ganewa Shopping Mall Logo" width="100" />
</p>

<h1 align="center">Ganewa Shopping Mall — POS & Inventory Management System</h1>

<p align="center">
  A modern Point-of-Sale and inventory management system built for <strong>Ganewa Shopping Mall, Kurfi</strong>.<br/>
  Installable as a <strong>Progressive Web App (PWA)</strong> on any device — desktop, tablet, or mobile.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Firebase-Hosting-FFCA28?logo=firebase&logoColor=black" alt="Firebase" />
  <img src="https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white" alt="PWA" />
</p>

---

## ✨ Features

### 🛒 Point of Sale (POS)
- Fast product search with barcode / name lookup
- Multi-payment support — **Cash**, **Card**, **Bank Transfer**, **Credit (Debt)**, and **Multi-Pay**
- Real-time stock deduction on sale via atomic Firestore transactions
- Automatic receipt generation with thermal / WebUSB print support
- Credit sales with per-customer debt tracking & credit limits
- Hold & resume transactions (persisted in Firestore)
- Discount application per transaction

### 📦 Inventory Management
- Full product catalog with categories, departments, and brands
- Buy / sell / wholesale price tracking
- Stock adjustment logs and write-offs
- Role-based edit restrictions (Cashiers update quantities only; Pricing & catalog managed by Admins)
- Minimum stock level alerts
- Barcode generation & lookup

### 👥 Customer Management
- Customer directory with contact details
- Credit limit enforcement & debt tracking
- Debt repayment recording (Cash / Bank)
- Link physical store customer accounts with online ecommerce profiles

### 🏪 Supplier & Purchasing
- Supplier directory with contact information
- Purchase order creation & tracking
- Supplier debt management with partial payments

### 💰 Expense Tracking & Cash Book
- Categorized expense recording
- Funds guardrails — prevents overspending beyond available balance
- Shift-based logging

### 📊 Reports & Analytics
- **Overview** — daily / weekly / monthly KPI cards (Sales, Profit, Expenses, Debt Collected)
- **Sales** — detailed breakdown with charts (Recharts)
- **Top Customers** — revenue and visit analytics
- **PDF Export** — generate downloadable reports via jsPDF

### 🔁 Returns & Refunds
- Process returns against original receipts
- Restock or mark items as damaged
- Return analytics dashboard

### 🔐 Authentication & Roles (Firebase Auth + Custom Claims)
| Role | Access |
|------|--------|
| **Super Admin** | Full system access, staff account management, role assignment |
| **Admin** | All modules, price updates, inventory management, reports |
| **Cashier** | POS checkout, customer lookup, stock count updates |

---

## 🏗 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 19 + TypeScript 5.8 |
| **Build Tool** | Vite 6 |
| **Styling** | Tailwind CSS v4 |
| **Database & Cache** | Firebase Firestore (Single Source of Truth, persistentLocalCache) |
| **Auth Backend** | Firebase Auth (Custom Claims: SUPER_ADMIN, ADMIN, CASHIER) |
| **Cloud Functions** | Firebase Functions v2 (Admin SDK) |
| **Hosting** | Firebase Hosting |
| **PWA** | vite-plugin-pwa (Workbox with NetworkOnly API strategy) |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- Firebase project with Firestore, Auth, and Functions enabled

### Installation

```bash
# Clone the repository
git clone https://github.com/kurfi/Ganewa-POs.git
cd Ganewa-POs/pos

# Install dependencies
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and provide your Firebase project details:

```bash
cp .env.example .env.local
```

### Development Server

```bash
npm run dev
```

---

## 📄 License

Proprietary software developed for **Ganewa Shopping Mall, Kurfi**.
