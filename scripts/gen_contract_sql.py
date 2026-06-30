#!/usr/bin/env python3
"""Generate contract SQL files with 1000 rows each for Supabase CLI ingestion."""
import uuid, sqlite3, time
from pathlib import Path
from datetime import datetime

NS = uuid.UUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
SQL_DIR = Path(__file__).resolve().parent / 'sql_output'
SQL_DIR.mkdir(parents=True, exist_ok=True)
CHUNK = 1000

def esc(s):
    if s is None: return 'NULL'
    return "'" + str(s).replace("'", "''").replace('\\', '\\\\') + "'"

def fmt(v):
    if v is None: return 'NULL'
    if isinstance(v, (int, float)):
        if v != v: return 'NULL'
        return str(v)
    return esc(str(v))

def parse_date(s):
    if not s or s.strip() == '': return None
    for f in ('%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%d-%m-%Y', '%d/%m/%Y'):
        try: return datetime.strptime(s.strip(), f).strftime('%Y-%m-%d %H:%M:%S')
        except: continue
    return None

TM = {'CPPP':'open','GEM':'open','STATE':'open','open':'open','limited':'limited','single_bid':'single_bid','global':'global','eoi':'eoi'}

conn = sqlite3.connect(str(Path(__file__).resolve().parent.parent / 'dashboard.db'))
conn.execute('PRAGMA cache_size=-64000')
cur = conn.cursor()
cur.execute("""SELECT internal_id,tender_id,org_name,portal_type,title,
    contract_value,bids_received,vendor_name,published_date,closing_date,
    contract_date,award_delay_days,bid_window_days FROM aoc_clean""")

files = []; batch = []; fn = 0; total = 0; skipped = 0; start = time.time()

while True:
    rows = cur.fetchmany(50000)
    if not rows: break
    for r in rows:
        iid, tid, org, pt, title, cv, br, vendor, pub, close, cont, delay, window = r
        if not tid or not org or not vendor: skipped += 1; continue
        try:
            cv = float(cv) if cv else 0.0
            if cv <= 0: skipped += 1; continue
        except: skipped += 1; continue

        cid = str(uuid.uuid5(NS, f"contract:{iid}"))
        oid = str(uuid.uuid5(NS, f"org:{org.strip()}"))
        vid = str(uuid.uuid5(NS, f"vendor:{vendor.strip()}"))
        try: br = int(br) if br else 0
        except: br = 0
        pd_ = parse_date(pub); cd_ = parse_date(close); ctd_ = parse_date(cont)
        try:
            delay = int(float(delay)) if delay else None
            if delay is not None and delay < 0: delay = None  # Clamp: constraint requires >= 0
        except: delay = None
        try:
            window = int(float(window)) if window else None
            if window is not None and window < 0: window = None  # Clamp: constraint requires >= 0
        except: window = None
        tt = TM.get((pt or '').strip(), 'open')
        tid_s = tid.replace("'", "''")

        batch.append(
            f"('{cid}','{tid_s}','{oid}','{vid}',{cv},"
            f"{fmt(ctd_)},{fmt(ctd_)},{fmt(pd_)},{fmt(cd_)},"
            f"{br},{fmt(window)},{fmt(delay)},'{tt}','awarded',"
            f"{fmt(title)},{fmt(tid)},{esc(org.strip())},{esc(vendor.strip())})"
        )

        if len(batch) >= CHUNK:
            fn += 1
            p = SQL_DIR / f'03c_{fn:05d}.sql'
            sql = "INSERT INTO aoc_clean (contract_id,tender_id,org_id,vendor_id,contract_value,award_date,contract_date,published_date,closing_date,bids_received,bid_window_days,award_delay_days,tender_type,contract_status,tender_title,tender_ref_no,org_name,vendor_name) VALUES\n"
            sql += ",\n".join(batch) + "\nON CONFLICT (contract_id) DO NOTHING;\n"
            p.write_text(sql, encoding='utf-8')
            files.append(p)
            total += len(batch)
            batch = []
            if fn % 100 == 0:
                elapsed = time.time() - start
                print(f"  {fn} files, {total:,} rows ({elapsed:.0f}s)")

if batch:
    fn += 1
    p = SQL_DIR / f'03c_{fn:05d}.sql'
    sql = "INSERT INTO aoc_clean (contract_id,tender_id,org_id,vendor_id,contract_value,award_date,contract_date,published_date,closing_date,bids_received,bid_window_days,award_delay_days,tender_type,contract_status,tender_title,tender_ref_no,org_name,vendor_name) VALUES\n"
    sql += ",\n".join(batch) + "\nON CONFLICT (contract_id) DO NOTHING;\n"
    p.write_text(sql, encoding='utf-8')
    files.append(p)
    total += len(batch)

elapsed = time.time() - start
print(f"Done: {total:,} rows in {fn} files, {skipped:,} skipped ({elapsed:.0f}s)")
if files:
    print(f"First file size: {files[0].stat().st_size / 1024:.0f}KB")
conn.close()