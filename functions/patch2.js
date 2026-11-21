const fs = require('fs');
let code = fs.readFileSync('src/index.ts', 'utf8');

code = code.replace(/import \{ getFirestore, FieldValue, AggregateField \} from 'firebase-admin\/firestore';\r?\n/g, "");
code = code.replace("import * as admin from 'firebase-admin';", "import * as admin from 'firebase-admin';\nimport { getFirestore, FieldValue, AggregateField, Timestamp } from 'firebase-admin/firestore';");

code = code.replace(/admin\.firestore\.Timestamp/g, "Timestamp");

fs.writeFileSync('src/index.ts', code);
