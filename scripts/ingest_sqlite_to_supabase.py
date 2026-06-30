#!/usr/bin/env python3
"""
Fast Data Ingestion: SQLite → Supabase PostgreSQL
==================================================
Generates large SQL files and executes them via Supabase CLI in bulk.
Uses UUID v5 deterministic generation — no mapping queries needed.

Usage:
    python scripts/ingest_sqlite_to_supabase.py [--skip-orgs] [--skip-vendors] [--skip-contracts]
"""

import argparse
import os
import subprocess
import sys
import tempfile
import time
import uuid
import sqlite3
from datetime import datetime
from pathlib import Path

NAMESPACE_TENDER = uuid.UUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SQLITE_DB_PATH = PROJECT_ROOT / 'dashboard.db'
SQL_DIR = PROJECT_ROOT / 'scripts' / 'sql_output'

def get_org_uuid(name): return str(uuid.uuid5(NAMESPACE_TENDER, f"org:{name.strip()}"))
def get_vendor_uuid(name): return str(uuid.uuid5(NAMESPACE_TENDER, f"vendor:{name.strip()}"))

def run_sql(sql, timeout=300):
    """Execute SQL via Supabase CLI using temp file."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False, dir=str(PROJECT_ROOT), encoding='utf-8') as f:
        f.write(sql)
        tmp = f.name
    try:
        r = subprocess.run(
            f'npx supabase db query --linked -f "{tmp}"',
            capture_output=True, text=True, timeout=timeout,
            cwd=str(PROJECT_ROOT), shell=True, encoding='utf-8', errors='replace'
        )
        if r.returncode != 0:
            raise Exception(f"SQL Error: {r.stderr.strip()[:200]}")
        return r.stdout
    finally:
        try: os.unlink(tmp)
        except: pass

def run_sql_file(path, timeout=600):
    """Execute a SQL file via Supabase CLI."""
    r = subprocess.run(
        f'npx supabase db query --linked -f "{path}"',
        capture_output=True, text=True, timeout=timeout,
        cwd=str(PROJECT_ROOT), shell=True, encoding='utf-8', errors='replace'
    )
    if r.returncode != 0:
        raise Exception(f"SQL File Error: {r.stderr.strip()[:200]}")
    return r.stdout

def esc(s):
    if s is None: return 'NULL'
    return "'" + str(s).replace("'", "''").replace('\\', '\\\\') + "'"

def fmt(v):
    if v is None: return 'NULL'
    if isinstance(v, (int, float)):
        if v != v: return 'NULL'  # NaN check
        return str(v)
    return esc(str(v))

def parse_date(s):
    if not s or s.strip() == '': return None
    s = s.strip()
    for f in ('%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%d-%m-%Y', '%d/%m/%Y'):
        try: return datetime.strptime(s, f).strftime('%Y-%m-%d %H:%M:%S')
        except: continue
    return None

TENDER_MAP = {'CPPP':'open','GEM':'open','STATE':'open','open':'open','limited':'limited','single_bid':'single_bid','global':'global','eoi':'eoi'}

# ============================================================================
# STEP 1: Generate SQL files from SQLite
# ============================================================================

def generate_org_sql(sqlite_conn):
    """Generate INSERT SQL for orgs."""
    print("\n" + "="*60)
    print("STEP 1: Generating org SQL")
    print("="*60)
    cur = sqlite_conn.cursor()
    cur.execute("SELECT org_name FROM org_summary")
    rows = cur.fetchall()
    print(f"  {len(rows):,} organizations in SQLite")

    vals = []
    for r in rows:
        n = r[0]
        if not n or n.strip() in ('', 'Unknown'): continue
        vals.append(f"('{get_org_uuid(n)}',{esc(n.strip())},'central',true)")

    sql = f"INSERT INTO org_summary (org_id,org_name,org_type,is_active) VALUES\n"
    sql += ",\n".join(vals)
    sql += "\nON CONFLICT (org_name) DO NOTHING;\n"

    path = SQL_DIR / '01_orgs.sql'
    path.write_text(sql, encoding='utf-8')
    print(f"  ✓ Generated {path.name} ({len(vals):,} rows, {len(sql)//1024}KB)")
    return path

def generate_vendor_sql(sqlite_conn):
    """Generate INSERT SQL for vendors in multiple files."""
    print("\n" + "="*60)
    print("STEP 2: Generating vendor SQL files")
    print("="*60)
    cur = sqlite_conn.cursor()
    cur.execute("SELECT vendor_name, total_contracts, total_value, single_bid_wins, avg_bids FROM vendor_summary")
    rows = cur.fetchall()
    print(f"  {len(rows):,} vendors in SQLite")

    CHUNK = 25000  # rows per SQL file
    files = []
    batch = []
    file_num = 0

    for r in rows:
        n = r[0]
        if not n or n.strip() in ('', 'Unknown'): continue
        vid = get_vendor_uuid(n)
        tc = int(r[1]) if r[1] else 0
        tv = float(r[2]) if r[2] else 0.0
        sw = int(r[3]) if r[3] else 0
        ab = min(float(r[4]), 999.99) if r[4] else None
        batch.append(f"('{vid}',{esc(n.strip())},true,{tc},{tv},{sw},{fmt(ab)})")

        if len(batch) >= CHUNK:
            file_num += 1
            path = SQL_DIR / f'02_vendors_{file_num:03d}.sql'
            sql = f"INSERT INTO vendor_summary (vendor_id,vendor_name,active_status,total_contracts_won,total_value_won,single_bid_wins,avg_bids_per_tender) VALUES\n"
            sql += ",\n".join(batch) + "\nON CONFLICT (vendor_name) DO NOTHING;\n"
            path.write_text(sql, encoding='utf-8')
            files.append(path)
            print(f"  ✓ {path.name} ({len(batch):,} rows, {len(sql)//1024}KB)")
            batch = []

    if batch:
        file_num += 1
        path = SQL_DIR / f'02_vendors_{file_num:03d}.sql'
        sql = f"INSERT INTO vendor_summary (vendor_id,vendor_name,active_status,total_contracts_won,total_value_won,single_bid_wins,avg_bids_per_tender) VALUES\n"
        sql += ",\n".join(batch) + "\nON CONFLICT (vendor_name) DO NOTHING;\n"
        path.write_text(sql, encoding='utf-8')
        files.append(path)
        print(f"  ✓ {path.name} ({len(batch):,} rows, {len(sql)//1024}KB)")

    return files

def generate_contract_sql(sqlite_conn):
    """Generate INSERT SQL for contracts in multiple files."""
    print("\n" + "="*60)
    print("STEP 3: Generating contract SQL files")
    print("="*60)
    cur = sqlite_conn.cursor()
    cur.execute("""SELECT internal_id, tender_id, org_name, portal_type, title,
                   contract_value, bids_received, vendor_name,
                   published_date, closing_date, contract_date,
                   award_delay_days, bid_window_days FROM aoc_clean""")

    CHUNK = 10000
    files = []
    batch = []
    file_num = 0
    total = 0
    skipped = 0
    start = time.time()

    while True:
        rows = cur.fetchmany(50000)
        if not rows: break

        for r in rows:
            iid, tid, org, pt, title, cv, br, vendor, pub, close, cont, delay, window = r
            if not tid or not org or not vendor:
                skipped += 1; continue
            try:
                cv = float(cv) if cv else 0.0
                if cv <= 0: skipped += 1; continue
            except: skipped += 1; continue

            cid = str(uuid.uuid5(NAMESPACE_TENDER, f"contract:{iid}"))
            oid = get_org_uuid(org)
            vid = get_vendor_uuid(vendor)
            try: br = int(br) if br else 0
            except: br = 0
            pd = parse_date(pub)
            cd = parse_date(close)
            ctd = parse_date(cont)
            try: delay = int(float(delay)) if delay else None
            except: delay = None
            try: window = int(float(window)) if window else None
            except: window = None
            tt = TENDER_MAP.get((pt or '').strip(), 'open')

            # Escape single quotes in tender_id
            tid_safe = tid.replace("'", "''")
            batch.append(
                f"('{cid}','{tid_safe}','{oid}','{vid}',{cv},"
                f"{fmt(ctd)},{fmt(ctd)},{fmt(pd)},{fmt(cd)},"
                f"{br},{fmt(window)},{fmt(delay)},'{tt}','awarded',"
                f"{fmt(title)},{fmt(tid)},{esc(org.strip())},{esc(vendor.strip())})"
            )

            if len(batch) >= CHUNK:
                file_num += 1
                path = SQL_DIR / f'03_contracts_{file_num:04d}.sql'
                sql = f"INSERT INTO aoc_clean (contract_id,tender_id,org_id,vendor_id,contract_value,award_date,contract_date,published_date,closing_date,bids_received,bid_window_days,award_delay_days,tender_type,contract_status,tender_title,tender_ref_no,org_name,vendor_name) VALUES\n"
                sql += ",\n".join(batch) + "\nON CONFLICT (contract_id) DO NOTHING;\n"
                path.write_text(sql, encoding='utf-8')
                files.append(path)
                total += len(batch)
                elapsed = time.time() - start
                rate = total / elapsed if elapsed > 0 else 0
                print(f"  ✓ {path.name} ({len(batch):,} rows, {total:,} total, {rate:,.0f} gen/sec)")
                batch = []

    if batch:
        file_num += 1
        path = SQL_DIR / f'03_contracts_{file_num:04d}.sql'
        sql = f"INSERT INTO aoc_clean (contract_id,tender_id,org_id,vendor_id,contract_value,award_date,contract_date,published_date,closing_date,bids_received,bid_window_days,award_delay_days,tender_type,contract_status,tender_title,tender_ref_no,org_name,vendor_name) VALUES\n"
        sql += ",\n".join(batch) + "\nON CONFLICT (contract_id) DO NOTHING;\n"
        path.write_text(sql, encoding='utf-8')
        files.append(path)
        total += len(batch)
        print(f"  ✓ {path.name} ({len(batch):,} rows, {total:,} total)")

    print(f"  Total: {total:,} contracts in {len(files)} files, {skipped:,} skipped")
    return files

# ============================================================================
# STEP 2: Execute SQL files via Supabase CLI
# ============================================================================

def execute_sql_files(files, label=""):
    """Execute a list of SQL files via Supabase CLI."""
    print(f"\n  Executing {len(files)} {label} SQL files...")
    start = time.time()
    done = 0
    errors = 0

    for i, f in enumerate(files):
        try:
            run_sql_file(str(f), timeout=600)
            done += 1
        except Exception as e:
            errors += 1
            print(f"  ⚠ Error on {f.name}: {str(e)[:100]}")
            # Try splitting the file in half
            try:
                content = f.read_text(encoding='utf-8')
                lines = content.split('\n')
                # Find the midpoint VALUES row
                mid = len(lines) // 2
                # Split into two files and retry
                for half_idx, half in enumerate([lines[:mid], lines[mid:]]):
                    half_sql = '\n'.join(half)
                    if 'VALUES' not in half_sql: continue
                    half_path = SQL_DIR / f'retry_{f.stem}_{half_idx}.sql'
                    half_path.write_text(half_sql, encoding='utf-8')
                    try:
                        run_sql_file(str(half_path), timeout=600)
                        done += 1
                    except Exception as e2:
                        print(f"    ⚠ Retry also failed: {str(e2)[:80]}")
                    finally:
                        try: half_path.unlink()
                        except: pass
            except:
                pass

        elapsed = time.time() - start
        rate = (i+1) / elapsed * 60 if elapsed > 0 else 0
        if (i+1) % 5 == 0 or i+1 == len(files):
            print(f"  Progress: {i+1}/{len(files)} files ({rate:.1f} files/min, {elapsed:.0f}s elapsed)")

    elapsed = time.time() - start
    print(f"  ✓ Completed: {done}/{len(files)} files in {elapsed:.0f}s ({errors} errors)")

# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Generate SQL files without executing')
    parser.add_argument('--skip-orgs', action='store_true')
    parser.add_argument('--skip-vendors', action='store_true')
    parser.add_argument('--skip-contracts', action='store_true')
    parser.add_argument('--execute-only', action='store_true', help='Execute existing SQL files without regenerating')
    parser.add_argument('--sqlite-path', type=str, default=str(SQLITE_DB_PATH))
    args = parser.parse_args()

    print("="*60)
    print("FAST DATA INGESTION: SQLite → Supabase")
    print("="*60)
    print(f"  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    SQL_DIR.mkdir(parents=True, exist_ok=True)

    # Verify CLI
    print("\nVerifying Supabase CLI...")
    try:
        run_sql("SELECT 1;", timeout=30)
        print("  ✓ Connected")
    except Exception as e:
        print(f"  ✗ Cannot connect: {e}")
        sys.exit(1)

    if not args.execute_only:
        # Generate SQL files
        sqlite_conn = sqlite3.connect(args.sqlite_path)
        sqlite_conn.execute("PRAGMA cache_size=-64000")

        if not args.skip_orgs:
            p = generate_org_sql(sqlite_conn)
            if not args.dry_run:
                execute_sql_files([p], "orgs")

        if not args.skip_vendors:
            files = generate_vendor_sql(sqlite_conn)
            if not args.dry_run:
                execute_sql_files(files, "vendors")

        if not args.skip_contracts:
            files = generate_contract_sql(sqlite_conn)
            if not args.dry_run:
                execute_sql_files(files, "contracts")

        sqlite_conn.close()
    else:
        # Execute existing SQL files
        if not args.skip_orgs:
            org_files = sorted(SQL_DIR.glob('01_orgs*.sql'))
            if org_files: execute_sql_files(org_files, "orgs")

        if not args.skip_vendors:
            vendor_files = sorted(SQL_DIR.glob('02_vendors*.sql'))
            if vendor_files: execute_sql_files(vendor_files, "vendors")

        if not args.skip_contracts:
            contract_files = sorted(SQL_DIR.glob('03_contracts*.sql'))
            if contract_files: execute_sql_files(contract_files, "contracts")

    # Verify
    print("\n" + "="*60)
    print("VERIFICATION")
    print("="*60)
    for table, expected in [('org_summary',1793),('vendor_summary',947183),('aoc_clean',4540739)]:
        try:
            out = run_sql(f"SELECT COUNT(*) FROM {table};", timeout=30)
            for line in out.strip().split('\n'):
                line = line.strip().replace('│','').strip()
                if line.isdigit():
                    c = int(line)
                    print(f"  {'✓' if c>0 else '✗'} {table}: {c:,} / {expected:,} ({c/expected*100:.1f}%)")
                    break
        except Exception as e:
            print(f"  ✗ {table}: {e}")

    print(f"\nFinished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == '__main__':
    main()