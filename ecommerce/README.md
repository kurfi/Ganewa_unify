# Ganewa Shopping Mall — Ecommerce Storefront

Modern online shopping storefront for **Ganewa Shopping Mall, Kurfi**, built with React 19, Vite, Tailwind CSS, and Firebase.

---

## 🔒 Security & Order Lifecycle
- **Zero Client Price Trust**: Product pricing, discounts, and delivery fees are calculated strictly server-side by the `createOrder` Cloud Function using Firebase Admin SDK.
- **Stock Integrity**: Stock deductions occur atomically inside Firestore transactions during server order creation.
- **Direct Order Writes Forbidden**: Client apps cannot write directly to `/orders` or `/products` collections in Firestore.
- **Account-Bound Orders**: Customers can read only orders matching their authenticated Firebase User ID (`request.auth.uid`).

---

## 🛠 Local Setup

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

---

## 🚀 Deployment
Refer to the monorepo root [DEPLOY_CHECKLIST.md](../DEPLOY_CHECKLIST.md) for full deployment instructions.
