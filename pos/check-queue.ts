import { db } from './src/db/db';

async function checkQueue() {
    try {
        const count = await db.syncQueue.count();
        console.log('--- SYNC QUEUE STATUS ---');
        console.log('Total items in queue:', count);

        const pending = await db.syncQueue.where('status').equals('pending').count();
        console.log('Pending items:', pending);

        const failed = await db.syncQueue.where('status').equals('failed').count();
        console.log('Failed items:', failed);

        if (count > 0) {
            const sample = await db.syncQueue.limit(5).toArray();
            console.log('Sample entries:', JSON.stringify(sample, null, 2));
        }
    } catch (e) {
        console.error('Failed to check queue:', e);
    }
}

checkQueue();
