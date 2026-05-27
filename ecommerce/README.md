# 🛒 Ganewa Shopping Mall — Ecommerce

A modern, real-time ecommerce storefront for **Ganewa Shopping Mall** (Kurfi, Nigeria). Built with React 19, TypeScript, and Firebase — designed to work seamlessly alongside the in-store POS system, sharing a single inventory and order pipeline.

> **Live Site:** [ganewamall-shop.web.app](https://ganewamall-shop.web.app)

---

## ✨ Features

### Shopping Experience
- **Real-time product catalog** — Products and stock levels update live from the store's inventory via Firestore `onSnapshot` listeners
- **Smart cart** — Persistent cart (survives page refresh via `localStorage`) with real-time stock validation warnings
- **3-step checkout** — Cart → Shipping Details → Payment, with delivery or in-store pickup options
- **Multiple payment methods** — Pay on Delivery, Bank Transfer (with proof of payment upload), or In-Store Pickup
- **Collision-proof order IDs** — Date-prefixed base-36 encoded IDs (e.g., `GW-260523-M1A2B3XY`)

### User Accounts
- **Firebase Authentication** — Email/password and Google Sign-In
- **Customer profiles** — Stored in Firestore `shopUsers` collection (separate from POS staff)
- **Order history** — View past orders with status tracking (Pending → Processing → Completed)
- **Address book** — Save and manage delivery addresses
- **Security settings** — Password change and account management

### Technical
- **PWA-ready** — Installable on mobile and desktop with offline caching via `vite-plugin-pwa`
- **Atomic stock deduction** — Firestore transactions prevent overselling across online and in-store channels
- **Code splitting** — Lazy-loaded pages with React Suspense for fast initial load
- **Persistent Firestore cache** — Multi-tab offline support via `persistentLocalCache`
- **Responsive design** — Mobile-first Tailwind CSS with premium UI (glassmorphism, micro-animations)

---

## 🏗️ Architecture

```
ecommerce/
├── public/                  # Static assets, PWA icons
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── AuthModal.tsx        # Login / Register modal
│   │   ├── FeaturedProducts.tsx # Homepage product grid
│   │   ├── Footer.tsx           # Site footer
│   │   ├── Hero.tsx             # Landing page hero section
│   │   ├── HowItWorksModal.tsx  # Onboarding flow modal
│   │   ├── Navbar.tsx           # Top navigation bar + cart icon
│   │   ├── ProductCard.tsx      # Individual product card
│   │   └── ProtectedRoute.tsx   # Auth guard wrapper
│   ├── contexts/
│   │   ├── AuthContext.tsx      # Firebase Auth state + user profile
│   │   └── CartContext.tsx      # Cart state + localStorage persistence
│   ├── firebase/
│   │   └── config.ts           # Firebase app + Firestore + Auth + Storage init
│   ├── pages/
│   │   ├── Home.tsx            # Landing page with hero + product catalog
│   │   ├── Cart.tsx            # Cart, checkout flow, and order placement
│   │   └── Account.tsx         # User profile, orders, addresses, security
│   ├── utils/
│   │   └── cloudinary.ts      # Cloudinary image upload helper
│   ├── types.ts                # Shared TypeScript interfaces & enums
│   ├── App.tsx                 # Router + context providers
│   ├── main.tsx                # React DOM entry point
│   └── index.css               # Global styles + Tailwind directives
├── .env                        # Environment variables (see below)
├── firebase.json               # Firebase Hosting config
├── tailwind.config.js          # Tailwind CSS configuration
├── vite.config.ts              # Vite + PWA plugin config
└── tsconfig.json               # TypeScript configuration
```

---

## 🔗 POS Integration

This ecommerce app shares the same **Firebase project** (`ganewa-provision-pos`) and **Firestore database** as the in-store POS system. This enables:

```
┌─────────────────────┐        ┌──────────────────────┐
│   POS Application   │        │  Ecommerce (This)    │
│                     │        │                      │
│  Dexie.js (local)  ◄──sync──► Firestore (cloud)    │
│                     │        │                      │
│  • Manages products │        │  • Reads products    │
│  • Fulfills orders  │        │  • Places orders     │
│  • Deducts stock    │        │  • Deducts stock     │
│  • Records sales    │        │  • Uploads payments  │
└─────────────────────┘        └──────────────────────┘
          │                              │
          └──────── Shared Firestore ────┘
                   collections:
                   • products
                   • orders
                   • shopUsers
```

| Collection   | POS Access         | Ecommerce Access              |
|-------------|--------------------|---------------------------------|
| `products`  | Read + Write       | Read only                       |
| `orders`    | Full access        | Create + Read/Update own orders |
| `shopUsers` | Read only          | Own profile only                |
| `sales`     | Full access        | No access                       |

### Order Lifecycle

1. **Customer places order** → Ecommerce creates an `orders` document with status `pending` and atomically deducts stock
2. **POS staff accepts** → Status transitions to `processing` (visible in POS Online Orders page)
3. **POS staff completes** → Status becomes `completed`, a sale record is generated in POS
4. **If cancelled** → POS restores stock quantities via Firestore transaction

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A Firebase project with Firestore, Authentication, and Storage enabled

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd ganewa/ecommerce

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Environment Variables

Create a `.env` file in the project root (or copy the existing one):

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Cloudinary (for proof-of-payment image uploads)
VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
VITE_CLOUDINARY_UPLOAD_PRESET=your_upload_preset
```

> [!NOTE]
> `VITE_` prefixed variables are embedded in the client bundle at build time. Firebase client API keys are safe to expose (they are restricted by Firestore Security Rules), but never place server-side secrets here.

---

## 📦 Scripts

| Command             | Description                                   |
|---------------------|-----------------------------------------------|
| `npm run dev`       | Start Vite dev server with HMR                |
| `npm run build`     | Type-check with `tsc` and build for production |
| `npm run preview`   | Preview the production build locally           |
| `npm run lint`      | Run ESLint across the project                  |

---

## 🚢 Deployment

The app is configured for **Firebase Hosting** (site: `ganewamall-shop`).

```bash
# Build the production bundle
npm run build

# Deploy to Firebase Hosting
npx firebase deploy --only hosting
```

The `firebase.json` is preconfigured with:
- **SPA rewrites** — All routes redirect to `index.html` for client-side routing
- **Build directory** — Serves from `dist/`

---

## 🛠️ Tech Stack

| Layer          | Technology                                        |
|----------------|---------------------------------------------------|
| **Framework**  | React 19 + TypeScript 5.7                         |
| **Build Tool** | Vite 6                                            |
| **Styling**    | Tailwind CSS 3.4                                  |
| **Routing**    | React Router DOM 7                                |
| **Backend**    | Firebase (Firestore, Auth, Storage)               |
| **SDK**        | Firebase JS SDK 12.9                              |
| **Images**     | Cloudinary (proof of payment uploads)             |
| **Icons**      | Lucide React                                      |
| **PWA**        | vite-plugin-pwa (Workbox)                         |
| **Utilities**  | clsx, tailwind-merge                              |

---

## 🔒 Security

- **Firestore Security Rules** enforce collection-level access control — ecommerce users cannot read POS-internal data (sales, expenses, customers, audit logs)
- **Atomic transactions** prevent race conditions during stock deduction at checkout
- **Authentication** is required for placing orders and accessing account pages
- **No server secrets** are stored in `VITE_` environment variables

---

## 📄 License

Private — Ganewa Shopping Mall, Kurfi. All rights reserved.
