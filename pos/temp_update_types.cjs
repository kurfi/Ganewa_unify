const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');

const fieldsToAdd = '\n  version?: number;\n  deviceId?: string;\n  deleted?: boolean;';

code = code.replace(/(updated_at\?: string;)/g, '$1' + fieldsToAdd);

const syncEntryRegex = /export interface SyncEntry \{[\s\S]*?\}/;
const newSyncEntry = `export interface SyncEntry {
  id?: number;
  table: string;
  recordId: string;
  operation: 'create' | 'update' | 'delete';
  status: 'pending' | 'processing' | 'failed';
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  deviceId: string;
}`;

code = code.replace(syncEntryRegex, newSyncEntry);

fs.writeFileSync('src/types.ts', code);
