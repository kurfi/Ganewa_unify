# Ganewa Shopping Mall — Monorepo

Enterprise Point-of-Sale (POS) and Online Storefront platform for **Ganewa Shopping Mall, Kurfi**.

---

## 🏛 Repository Architecture

- `pos/`: Progressive Web App (PWA) for in-store tills, cashiers, stock management, and administrative reporting.
- `ecommerce/`: Public ecommerce storefront PWA for customers.
- `functions/`: Secure Cloud Functions v2 (Admin SDK) handling server-side order calculation, atomic stock deductions, sequential invoice numbers, and custom role assignments.
- `pos/firestore.rules`: Single canonical Firestore security rules configuration deployed to the unified project.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or v20 LTS recommended)
- npm or yarn

### Initial Setup
```bash
# Install POS dependencies
cd pos
npm install

# Install Ecommerce dependencies
cd ../ecommerce
npm install

# Install Cloud Functions dependencies
cd ../functions
npm install
```

### Environment Configuration
Copy `.env.example` in both `pos/` and `ecommerce/`:
```bash
cp pos/.env.example pos/.env.local
cp ecommerce/.env.example ecommerce/.env.local
```
Fill in your Firebase project credentials. Neither app requires or stores master store passwords in `.env` files anymore.

---

## 📖 Deployment & Release
See [DEPLOY_CHECKLIST.md](file:///C:/Users/WIN11/Desktop/ganewa/ganewa/DEPLOY_CHECKLIST.md) for detailed deployment steps, role setup, and rollback instructions.
