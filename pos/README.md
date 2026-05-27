<p align="center">
  <img src="public/pwa-192x192.png" alt="Ganewa Shopping Mall Logo" width="100" />
</p>

<h1 align="center">Ganewa Shopping Mall — POS & Inventory Management System</h1>

<p align="center">
  A modern, offline-first Point-of-Sale and inventory management system built for <strong>Ganewa Shopping Mall, Kurfi</strong>.<br/>
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
- Real-time stock deduction on sale
- Automatic receipt generation with print support (thermal / USB printers)
- Credit sales with per-customer debt tracking & credit limits
- Hold & resume transactions
- Discount application per transaction

### 📦 Inventory Management
- Full product catalog with categories, departments, and brands
- Buy / sell / wholesale price tracking
- Minimum stock level alerts
- Barcode support
- Product photo storage
- Complete stock-in / stock-out history

### 👥 Customer Management
- Customer database with contact details
- Credit limit enforcement & debt tracking
- Debt repayment recording (Cash / Bank)
- Full customer transaction history

### 🏪 Supplier & Purchasing
- Supplier directory with contact information
- Purchase order creation & tracking
- Supplier debt management with partial payments
- Purchase invoice history

### 💰 Expense Tracking
- Categorized expense recording
- Payment method tagging (Cash / Bank)
- Funds guardrails — prevents overspending beyond available balance
- Shift-based expense logging

### 📊 Reports & Analytics
- **Overview** — daily / weekly / monthly KPI cards (Sales, Profit, Expenses, Debt Collected)
- **Sales** — detailed sales breakdown with charts (Recharts)
- **Inventory** — stock valuation & movement reports
- **Financials** — cash book, bank transactions, P&L
- **PDF Export** — generate downloadable reports via jsPDF

### 🔁 Returns & Refunds
- Process returns against original receipts
- Multiple refund methods (Cash, Store Credit)
- Restock or mark items as damaged
- Return analytics dashboard

### 🔐 Authentication & Roles
| Role | Access |
|------|--------|
| **Super Admin** | Full system access, user management |
| **Admin** | All modules except user management |
| **Cashier** | POS, Customers, Settings (limited) |

### ⚙ Settings
- User management (create / edit / deactivate)
- Hardware configuration (printers)
- Security settings
- System logs & audit trail

### 🌐 Offline-First Architecture
- **Dexie.js (IndexedDB)** — all data persisted locally for instant access
- **Firestore Sync** — background queue-based sync when online
- **Offline Indicator** — real-time network status display
- Works seamlessly without an internet connection

---

## 🏗 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 19 + TypeScript 5.8 |
| **Build Tool** | Vite 6 |
| **Styling** | Tailwind CSS v4 (with semantic CSS variables for theming) |
| **Local Database** | Dexie.js (IndexedDB) |
| **Cloud Database** | Firebase Firestore |
| **Auth Backend** | Firebase Auth |
| **Hosting** | Firebase Hosting |
| **Charts** | Recharts |
| **PDF Generation** | jsPDF + jsPDF-AutoTable |
| **Icons** | Lucide React |
| **Routing** | React Router v7 (HashRouter) |
| **PWA** | vite-plugin-pwa (Workbox) |

---

## 📁 Project Structure

```
ganewa-pos/
├── public/                  # Static assets & PWA icons
├── src/
│   ├── auth/                # Authentication context & guards
│   ├── components/          # Reusable UI components
│   │   ├── dashboard/       # Dashboard widgets & quick actions
│   │   ├── pos/             # POS-specific components
│   │   ├── customers/       # Customer modals & forms
│   │   ├── inventory/       # Inventory management components
│   │   ├── suppliers/       # Supplier management components
│   │   ├── purchases/       # Purchase order components
│   │   ├── expenses/        # Expense recording components
│   │   ├── reports/         # Report tabs & charts
│   │   ├── returns/         # Return processing components
│   │   └── settings/        # Settings panels
│   ├── constants/           # App-wide constants
│   ├── contexts/            # React context providers (Toast, Dialog, Sync)
│   ├── db/                  # Dexie database schema & setup
│   ├── firebase/            # Firebase configuration
│   ├── hooks/               # Custom React hooks
│   ├── pages/               # Top-level route pages
│   ├── services/            # Business logic services
│   │   ├── syncService.ts       # Background Firestore sync
│   │   ├── pdfService.ts        # PDF report generation
│   │   ├── printerService.ts    # Thermal printer integration
│   ├── types/               # TypeScript type definitions
│   ├── utils/               # Utility functions & helpers
│   ├── App.tsx              # Root component with routing
│   ├── index.tsx            # Application entry point
│   └── index.css            # Global styles & design tokens
├── firebase.json            # Firebase Hosting configuration
├── vite.config.ts           # Vite build configuration
├── tailwind.config.js       # Tailwind CSS configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # Dependencies & scripts
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A **Firebase** project (for Firestore & Hosting)

### Installation

```bash
# Clone the repository
git clone https://github.com/kurfi/Ganewa-POs.git
cd Ganewa-POs

# Install dependencies
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key

VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

```

### Development

```bash
# Start the development server (http://localhost:3000)
npm run dev
```

### Production Build

```bash
# Build for production
npm run build

# Preview the production build locally
npm run preview
```

### Deploy to Firebase Hosting

```bash
# Build & deploy
npm run build
firebase deploy --only hosting
```

---

## 📱 PWA Installation

The app is a fully installable **Progressive Web App**. After deploying to Firebase Hosting:

1. Open the app URL in **Chrome**, **Edge**, or **Safari**
2. Click the **"Install"** prompt (or use the browser menu → *Install App*)
3. The app installs to your home screen / taskbar and runs like a native app
4. Works **fully offline** after the first load — all data is cached locally via IndexedDB

---

## 🔄 Data Sync Architecture

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   React UI   │ ◄───► │  Dexie.js    │ ◄───► │  Firestore   │
│  (Frontend)  │       │ (IndexedDB)  │       │   (Cloud)    │
└──────────────┘       └──────────────┘       └──────────────┘
                              │
                        Sync Queue
                     (pending → synced)
```

- All reads/writes hit the **local Dexie database** first for instant response
- A background **sync queue** pushes changes to Firestore when online
- The **OfflineIndicator** component shows real-time connectivity status
- Stale service worker caches are automatically cleaned up on app load

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is proprietary software developed for **Ganewa Shopping Mall, Kurfi**.

---

<p align="center">
  Built by Afrahab Solutions for <strong>Ganewa Shopping Mall, Kurfi</strong>
</p>
