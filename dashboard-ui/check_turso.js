const { createClient } = require('@libsql/client');

const client = createClient({
  url: 'libsql://tendertrace-suryanshu1520-1.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODI5MDk3NjEsImlkIjoiMDE5ZjFkYjItYTkwMS03NWM2LTllOTQtNjBmZjYwNmM0OTEyIiwia2lkIjoiSVgxQnB4YzN2cHVld09GU2RTTWp3RTlyLTU3RW5xS0JzaGUtZkZJMC1IVSIsInJpZCI6IjIyNTc1Yjg4LWJlMDItNGIyNC04Yjc3LTRjOTk1M2I2MzgzYiJ9.V4fvLLV0CIF3JNur-gcyUZqRcyUGn_XZhIuEQ0vRD4o-XZvSsd2uhV_eArfgDtvjCZgERqvv3X9e0-mwUdHiAw'
});

async function checkData() {
  try {
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
    console.log("Tables in Turso:", tables.rows.map(r => r.name).join(', '));
  } catch(e) {
    console.error(e);
  }
}
checkData();
