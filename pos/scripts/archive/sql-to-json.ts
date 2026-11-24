import * as fs from 'fs';
import * as path from 'path';

const sqlFilePath = path.join(__dirname, '../seed_data.sql');
const outputDir = path.join(__dirname, '../migration-data');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

function parseSqlLine(line: string) {
    const match = line.match(/^INSERT INTO (\w+) \((.*?)\) VALUES \((.*)\);$/i);
    if (!match) return null;

    const tableName = match[1].toLowerCase();
    const columns = match[2].split(',').map(c => c.trim().toLowerCase());

    // Complex value splitting to handle quoted strings with commas and hex blobs
    const valuesPart = match[3];
    const values: string[] = [];
    let current = '';
    let inQuote = false;
    let inFunction = false; // To handle decode(..., 'hex')

    for (let i = 0; i < valuesPart.length; i++) {
        const char = valuesPart[i];
        if (char === "'" && valuesPart[i - 1] !== '\\') {
            inQuote = !inQuote;
            current += char;
        } else if (!inQuote && char === '(') {
            inFunction = true;
            current += char;
        } else if (!inQuote && char === ')') {
            inFunction = false;
            current += char;
        } else if (char === ',' && !inQuote && !inFunction) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());

    const record: any = {};
    columns.forEach((col, idx) => {
        let val = values[idx];
        if (val === 'NULL') {
            record[col] = null;
        } else if (val && val.startsWith("'") && val.endsWith("'")) {
            record[col] = val.substring(1, val.length - 1).replace(/''/g, "'");
        } else if (val && val.startsWith("decode('") && val.endsWith("', 'hex')")) {
            // Keep hex for now if needed, or skip photo
            record[col] = "[BINARY DATA]";
        } else {
            record[col] = val;
        }
    });

    return { tableName, record };
}

async function main() {
    const data: { [key: string]: any[] } = {
        products: [],
        customers: [],
        suppliers: [],
        sales: [],
        expenses: []
    };

    const fileStream = fs.createReadStream(sqlFilePath);
    const readline = require('readline');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    console.log('📖 Reading seed_data.sql...');
    let count = 0;

    for await (const line of rl) {
        if (!line.startsWith('INSERT INTO')) continue;

        const result = parseSqlLine(line);
        if (!result) continue;

        const { tableName, record } = result;

        if (tableName === 'items') {
            data.products.push(record);
        } else if (tableName === 'customers') {
            data.customers.push(record);
        } else if (tableName === 'supplier') {
            data.suppliers.push(record);
        } else if (tableName === 'expense') {
            data.expenses.push(record);
        }

        count++;
        if (count % 5000 === 0) console.log(`Processed ${count} lines...`);
    }

    console.log('💾 Writing JSON files...');
    for (const [key, records] of Object.entries(data)) {
        if (records.length > 0) {
            fs.writeFileSync(path.join(outputDir, `${key}.json`), JSON.stringify(records, null, 2));
            console.log(`✅ Exported ${records.length} ${key}`);
        }
    }
}

main().catch(err => console.error(err));
