const fs = require('fs');
let code = fs.readFileSync('src/index.ts', 'utf8');

// 1. Add imports at the top
code = code.replace("import * as admin from 'firebase-admin';", "import * as admin from 'firebase-admin';\nimport { getFirestore, FieldValue, AggregateField } from 'firebase-admin/firestore';");

// 2. Replace db initialization
code = code.replace("const db = admin.firestore();", "const db = getFirestore();");

// 3. Replace FieldValue usages
code = code.replace(/admin\.firestore\.FieldValue/g, "FieldValue");

// 4. Replace AggregateField usages
code = code.replace(/admin\.firestore\.AggregateField/g, "AggregateField");

fs.writeFileSync('src/index.ts', code);
