# Ganewa Project

This repository contains two separate applications:

1.  **Ecommerce**: An online shopping platform.
2.  **POS (Point of Sale)**: A point of sale system for business operations.

## Getting Started

### Prerequisites

- Node.js (Latest LTS recommended)
- npm or yarn

### Installation

To set up the projects, navigate into each directory and install the dependencies:

#### Ecommerce App
```bash
cd ecommerce
npm install
```

#### POS App
```bash
cd pos
npm install
```

## Environment Setup

Each application may require a `.env` file for configuration (Firebase, Cloudinary, etc.). Since these files are excluded from Git for security, you will need to create them based on the application requirements.

## Deployment

Both apps are configured for Firebase hosting.
- See `ecommerce/firebase.json`
- See `pos/firebase.json`
