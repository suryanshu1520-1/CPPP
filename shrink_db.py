import sqlite3
import os

print("Creating dashboard_lite.db...")
if os.path.exists('dashboard_lite.db'):
    os.remove('dashboard_lite.db')

src = sqlite3.connect('dashboard.db')
dst = sqlite3.connect('dashboard_lite.db')

# Copy summary tables
print("Copying summary tables...")
for table in ['org_summary', 'vendor_summary', 'monthly_summary', 'subscriptions']:
    schema = src.execute(f"SELECT sql FROM sqlite_master WHERE name='{table}'").fetchone()[0]
    dst.execute(schema)
    rows = src.execute(f"SELECT * FROM {table}").fetchall()
    placeholders = ",".join(["?"] * len(rows[0])) if rows else ""
    if rows:
        dst.executemany(f"INSERT INTO {table} VALUES ({placeholders})", rows)

# Create macro_stats cache
print("Creating macro_stats cache...")
dst.execute('''CREATE TABLE macro_stats_cache (
    totalValue REAL,
    totalContracts INTEGER,
    totalSingleBid INTEGER,
    avgBids REAL
)''')
macro = src.execute('''
    SELECT 
        SUM(contract_value) as totalValue,
        COUNT(*) as totalContracts,
        SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END) as totalSingleBid,
        AVG(bids_received) as avgBids
    FROM aoc_clean
''').fetchone()
dst.execute('INSERT INTO macro_stats_cache VALUES (?,?,?,?)', macro)

dst.commit()
print("Size without search index:", os.path.getsize('dashboard_lite.db') / (1024*1024), "MB")

# Build FTS
print("Building self-contained search index...")
dst.execute('''
CREATE VIRTUAL TABLE aoc_fts USING fts5(
    tender_id, 
    title, 
    org_name, 
    vendor_name,
    contract_value UNINDEXED,
    closing_date UNINDEXED,
    bids_received UNINDEXED
)
''')
# Copy data in chunks to avoid memory issues
chunk_size = 100000
offset = 0
while True:
    print(f"Copying rows {offset} to {offset+chunk_size}...")
    rows = src.execute(f'''
        SELECT tender_id, title, org_name, vendor_name, contract_value, closing_date, bids_received 
        FROM aoc_clean LIMIT {chunk_size} OFFSET {offset}
    ''').fetchall()
    if not rows:
        break
    dst.executemany('INSERT INTO aoc_fts VALUES (?,?,?,?,?,?,?)', rows)
    dst.commit()
    offset += chunk_size

dst.execute("VACUUM")
dst.commit()
print("Final size:", os.path.getsize('dashboard_lite.db') / (1024*1024*1024), "GB")

dst.close()
src.close()
