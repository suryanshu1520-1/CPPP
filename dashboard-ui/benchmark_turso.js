const { createClient } = require('@libsql/client');
const Database = require('better-sqlite3');

const client = createClient({
  url: 'libsql://tendertrace-suryanshu1520-1.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI5MDk3NjEsImlkIjoiMDE5ZjFkYjItYTkwMS03NWM2LTllOTQtNjBmZjYwNmM0OTEyIiwia2lkIjoiSVgxQnB4YzN2cHVld09GU2RTTWp3RTlyLTU3RW5xS0JzaGUtZkZJMC1IVSIsInJpZCI6IjIyNTc1Yjg4LWJlMDItNGIyNC04Yjc3LTRjOTk1M2I2MzgzYiJ9.V4fvLLV0CIF3JNur-gcyUZqRcyUGn_XZhIuEQ0vRD4o-XZvSsd2uhV_eArfgDtvjCZgERqvv3X9e0-mwUdHiAw'
});
const db = new Database('../dashboard.db');

async function testUpload() {
    console.log("Creating table...");
    await client.execute(`CREATE TABLE IF NOT EXISTS test_upload (
        id TEXT PRIMARY KEY,
        title TEXT,
        val REAL
    )`);

    console.log("Fetching 5000 rows...");
    const rows = db.prepare("SELECT internal_id, title, contract_value FROM aoc_clean LIMIT 5000").all();

    console.log("Starting batch upload benchmark...");
    const start = Date.now();
    
    // Convert to batch
    const stmts = rows.map(r => ({
        sql: "INSERT OR IGNORE INTO test_upload (id, title, val) VALUES (?, ?, ?)",
        args: [r.internal_id, r.title, r.contract_value]
    }));

    try {
        await client.batch(stmts, 'write');
        const end = Date.now();
        console.log(`Uploaded 5000 rows in ${(end-start)/1000} seconds.`);
        console.log(`Estimated time for 4.5M rows: ${((4500000 / 5000) * (end-start)/1000) / 60} minutes.`);
    } catch (e) {
        console.error("Batch failed:", e.message);
    }
}
testUpload();
