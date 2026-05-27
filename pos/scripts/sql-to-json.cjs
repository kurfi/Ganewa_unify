const fs = require('fs');
const path = require('path');
const readline = require('readline');

const sqlFilePath = path.join(__dirname, '../seed_data.sql');
const outputDir = path.join(__dirname, '../migration-data');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

function parseSqlLine(line) {
    const match = line.match(/^INSERT INTO (\w+) \((.*?)\) VALUES \((.*)\);$/i);
    if (!match) return null;

    const tableName = match[1].toLowerCase();
    const columns = match[2].split(',').map(c => c.trim().toLowerCase());

    const valuesPart = match[3];
    const values = [];
    let current = '';
    let inQuote = false;
    let inFunction = false;

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

    const record = {};
    columns.forEach((col, idx) => {
        let val = values[idx];
        if (val === 'NULL') {
            record[col] = null;
        } else if (val && val.startsWith("'") && val.endsWith("'")) {
            record[col] = val.substring(1, val.length - 1).replace(/''/g, "'");
        } else if (val && val.startsWith("decode('")) {
            record[col] = "[BINARY DATA]";
        } else {
            // Clean up numeric values that might be quoted incorrectly or have extra chars
            if (val && !val.startsWith("'")) {
                val = val.replace(/^'|'$/g, '');
            }
            record[col] = val;
        }
    });

    return { tableName, record };
}

async function main() {
    const data = {
        products: [],
        customers: [],
        suppliers: [],
        sales: [],
        expenses: [],
        purchases: [],
        users: [],
        receipt_details: []
    };

    const fileStream = fs.createReadStream(sqlFilePath);
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

        switch (tableName) {
            case 'items':
                data.products.push(record);
                break;
            case 'customers':
                data.customers.push(record);
                break;
            case 'supplier':
                data.suppliers.push(record);
                break;
            case 'expense':
                data.expenses.push(record);
                break;
            case 'receipts':
                data.sales.push(record);
                break;
            case 'receiptdetails':
                data.receipt_details.push(record);
                break;
            case 'purchased':
                data.purchases.push(record);
                break;
            case 'users':
                data.users.push(record);
                break;
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
