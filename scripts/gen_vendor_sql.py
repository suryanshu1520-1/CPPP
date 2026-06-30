#!/usr/bin/env python3
"""Generate vendor SQL files with 500 rows each."""
import uuid, sqlite3, time
from pathlib import Path

NS = uuid.UUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
SQL_DIR = Path(__file__).resolve().parent / 'sql_output'
SQL_DIR.mkdir(parents=True, exist_ok=True)
CHUNK = 500

def esc(s):
    if s is None: return 'NULL'
    return "'" + str(s).replace("'", "''").replace('\\', '\\\\') + "'"

conn = sqlite3.connect(str(Path(__file__).resolve().parent.parent / 'dashboard.db'))
cur = conn.cursor()
cur.execute("SELECT vendor_name, total_contracts, total_value, single_bid_wins, avg_bids FROM vendor_summary")
rows = cur.fetchall()
print(f"  {len(rows):,} vendors in SQLite")

files = []; batch = []; fn = 0; total = 0; start = time.time()

for r in rows:
    n = r[0]
    if not n or n.strip() in ('', 'Unknown'): continue
    vid = str(uuid.uuid5(NS, f"vendor:{n.strip()}"))
    tc = int(r[1]) if r[1] else 0
    tv = float(r[2]) if r[2] else 0.0
    sw = int(r[3]) if r[3] else 0
    ab = min(float(r[4]), 999.99) if r[4] else None
    ab_s = str(ab) if ab is not None else 'NULL'
    batch.append(f"('{vid}',{esc(n.strip())},true,{tc},{tv},{sw},{ab_s})")

    if len(batch) >= CHUNK:
        fn += 1
        p = SQL_DIR / f'02v_{fn:04d}.sql'
        sql = "INSERT INTO vendor_summary (vendor_id,vendor_name,active_status,total_contracts_won,total_value_won,single_bid_wins,avg_bids_per_tender) VALUES\n"
        sql += ",\n".join(batch) + "\nON CONFLICT (vendor_name) DO NOTHING;\n"
        p.write_text(sql, encoding='utf-8')
        files.append(p)
        total += len(batch)
        batch = []
        if fn % 100 == 0:
            print(f"  {fn} files, {total:,} rows ({time.time()-start:.0f}s)")

if batch:
    fn += 1
    p = SQL_DIR / f'02v_{fn:04d}.sql'
    sql = "INSERT INTO vendor_summary (vendor_id,vendor_name,active_status,total_contracts_won,total_value_won,single_bid_wins,avg_bids_per_tender) VALUES\n"
    sql += ",\n".join(batch) + "\nON CONFLICT (vendor_name) DO NOTHING;\n"
    p.write_text(sql, encoding='utf-8')
    files.append(p)
    total += len(batch)

print(f"Done: {total:,} vendors in {fn} files ({time.time()-start:.0f}s)")
conn.close()