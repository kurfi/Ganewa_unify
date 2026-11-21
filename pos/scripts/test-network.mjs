// Quick test: can we reach Firebase endpoints?
async function test() {
    console.log("Testing network connectivity to Firebase...\n");

    const endpoints = [
        { name: "Firestore REST API", url: "https://firestore.googleapis.com/" },
        { name: "Firebase Auth", url: "https://identitytoolkit.googleapis.com/" },
        { name: "Google APIs", url: "https://www.googleapis.com/" },
    ];

    for (const ep of endpoints) {
        try {
            const res = await fetch(ep.url, { signal: AbortSignal.timeout(10000) });
            console.log(`✅ ${ep.name}: reachable (HTTP ${res.status})`);
        } catch (e) {
            console.log(`❌ ${ep.name}: FAILED - ${e.message}`);
        }
    }
}

test();
