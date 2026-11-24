/**
 * deploy-hosting.mjs
 *
 * Deploys the pos/dist folder directly to Firebase Hosting via the official
 * Firebase Hosting REST API v1beta1.
 *
 * Steps:
 * 1. Read OAuth token from ~/.config/configstore/firebase-tools.json
 * 2. Hash all files in ./dist (SHA256)
 * 3. Create a new version on site "ganewa-provision-pos"
 * 4. Populate files to find which hashes need uploading
 * 5. Upload required files (gzip compressed as required by Firebase)
 * 6. Finalize the version
 * 7. Release the version to live traffic
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';

const SITE_ID = 'ganewa-provision-pos';
const DIST_DIR = path.resolve('dist');

async function main() {
    console.log('🚀 Starting direct Firebase Hosting deployment for site:', SITE_ID);

    // 1. Get access token
    const configPath = path.join(process.env.USERPROFILE || process.env.HOME, '.config/configstore/firebase-tools.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('Firebase credentials not found at ' + configPath);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    let token = config.tokens?.access_token;
    const expiresAt = config.tokens?.expires_at || 0;

    // Check if token needs refresh
    if (Date.now() > expiresAt - 60000 && config.tokens?.refresh_token) {
        console.log('🔄 Access token expired or expiring soon, refreshing...');
        const params = new URLSearchParams({
            client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
            grant_type: 'refresh_token',
            refresh_token: config.tokens.refresh_token
        });
        const refreshRes = await fetch('https://www.googleapis.com/oauth2/v3/token', {
            method: 'POST',
            body: params
        });
        const refreshData = await refreshRes.json();
        if (!refreshData.access_token) {
            throw new Error('Failed to refresh token: ' + JSON.stringify(refreshData));
        }
        token = refreshData.access_token;
        config.tokens.access_token = token;
        config.tokens.expires_at = Date.now() + (refreshData.expires_in * 1000);
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('✅ Token refreshed successfully.');
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    // 2. Scan and hash all files in dist
    console.log('📁 Scanning files in', DIST_DIR);
    const files = {};
    const fileBuffers = {};

    function scan(dir, base = '') {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relPath = path.posix.join(base, entry.name);
            if (entry.isDirectory()) {
                scan(fullPath, relPath);
            } else if (entry.isFile()) {
                const content = fs.readFileSync(fullPath);
                // Firebase Hosting requires all uploaded files to be gzipped, and the hash must match the gzipped payload
                const gzipped = zlib.gzipSync(content, { level: 9 });
                const hash = crypto.createHash('sha256').update(gzipped).digest('hex');
                const urlPath = '/' + relPath;
                files[urlPath] = hash;
                fileBuffers[hash] = gzipped;
            }
        }
    }
    scan(DIST_DIR);
    console.log(`📦 Found ${Object.keys(files).length} files to deploy.`);

    // 3. Create new version
    console.log('⚙️  Creating new version...');
    const createVersionRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/sites/${SITE_ID}/versions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            config: {
                rewrites: [
                    {
                        glob: '**',
                        path: '/index.html'
                    }
                ]
            }
        })
    });
    const versionData = await createVersionRes.json();
    if (!createVersionRes.ok) {
        throw new Error('Failed to create version: ' + JSON.stringify(versionData));
    }
    const versionName = versionData.name;
    console.log('✅ Created version:', versionName);

    // 4. Populate files
    console.log('📤 Populating file manifest...');
    const populateRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/${versionName}:populateFiles`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ files })
    });
    const populateData = await populateRes.json();
    if (!populateRes.ok) {
        throw new Error('Failed to populate files: ' + JSON.stringify(populateData));
    }

    const uploadRequiredHashes = populateData.uploadRequiredHashes || [];
    const uploadUrl = populateData.uploadUrl;
    console.log(`ℹ️  ${uploadRequiredHashes.length} files need uploading (${Object.keys(files).length - uploadRequiredHashes.length} already cached).`);

    // 5. Upload files
    for (let i = 0; i < uploadRequiredHashes.length; i++) {
        const hash = uploadRequiredHashes[i];
        const gzipped = fileBuffers[hash];
        console.log(`  ↑ Uploading [${i + 1}/${uploadRequiredHashes.length}] hash: ${hash.slice(0, 12)}...`);
        const uploadRes = await fetch(`${uploadUrl}/${hash}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/octet-stream'
            },
            body: gzipped
        });
        if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            throw new Error(`Failed to upload ${hash}: ${uploadRes.status} ${errText}`);
        }
    }
    console.log('✅ All files uploaded successfully.');

    // 6. Finalize version
    console.log('🔒 Finalizing version...');
    const finalizeRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/${versionName}?update_mask=status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'FINALIZED' })
    });
    const finalizeData = await finalizeRes.json();
    if (!finalizeRes.ok) {
        throw new Error('Failed to finalize version: ' + JSON.stringify(finalizeData));
    }
    console.log('✅ Version finalized.');

    // 7. Release version
    console.log('🎉 Releasing to live hosting...');
    const releaseRes = await fetch(`https://firebasehosting.googleapis.com/v1beta1/sites/${SITE_ID}/releases?versionName=${versionName}`, {
        method: 'POST',
        headers
    });
    const releaseData = await releaseRes.json();
    if (!releaseRes.ok) {
        throw new Error('Failed to release version: ' + JSON.stringify(releaseData));
    }
    console.log('✨ Release complete! Release ID:', releaseData.name);
    console.log(`\n🌐 Hosting URL: https://${SITE_ID}.web.app`);
    console.log(`🌐 Custom/Alt URL: https://${SITE_ID}.firebaseapp.com`);
}

main().catch(err => {
    console.error('\n❌ Deployment failed:', err.message || err);
    process.exit(1);
});
