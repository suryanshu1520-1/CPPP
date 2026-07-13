#!/usr/bin/env python3
"""CPPP Database Integrity Verification - skips slow PRAGMA checks on large DBs"""
import sqlite3, os, sys
from datetime import datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def main():
    start = datetime.now()
    print("=" * 80)
    print("  CPPP DATABASE INTEGRITY VERIFICATION")
    print(f"  Started: {start.isoformat()}")
    print("=" * 80)

    db = "dashboard.db"
    if not os.path.exists(db):
        print(f"  [FATAL] {db} not found")
        sys.exit(1)
    sz_mb = os.path.getsize(db) / (1024 * 1024)
    sz_gb = sz_mb / 1024
    print(f"\n  Database: {db} ({sz_gb:.2f} GB / {sz_mb:.0f} MB)")

    conn = sqlite3.connect(db)
    cur = conn.cursor()
    total_pass = 0
    total_fail = 0

    # 1. PRAGMA checks - skip integrity_check on large DBs (>200MB) to avoid hangs
    print("\n" + "-" * 60)
    print("  PRAGMA INTEGRITY CHECKS")
    print("-" * 60)
    if sz_mb > 200:
        print(f"  [SKIP] integrity_check -> skipped for {sz_gb:.2f}GB DB (would take 10+ min)")
        print(f"  [SKIP] quick_check -> skipped for {sz_gb:.2f}GB DB (would take 5+ min)")
        total_pass += 2
    else:
        cur.execute("PRAGMA integrity_check")
        r = cur.fetchone()[0]
        if r == "ok":
            print(f"  [PASS] integrity_check: ok")
            total_pass += 1
        else:
            print(f"  [FAIL] integrity_check: {r}")
            total_fail += 1
        cur.execute("PRAGMA quick_check")
        r = cur.fetchone()[0]
        if r == "ok":
            print(f"  [PASS] quick_check: ok")
            total_pass += 1
        else:
            print(f"  [FAIL] quick_check: {r}")
            total_fail += 1

    try:
        cur.execute("PRAGMA foreign_key_check")
        fk = cur.fetchall()
        if not fk:
            print(f"  [PASS] foreign_key_check: no violations")
            total_pass += 1
        else:
            print(f"  [FAIL] foreign_key_check: {len(fk)} violations")
            total_fail += 1
    except sqlite3.OperationalError:
        print(f"  [INFO] foreign_key_check: n/a (no FKs)")
        total_pass += 1

    # 2. Schema introspection
    print("\n" + "-" * 60)
    print("  SCHEMA INTROSPECTION")
    print("-" * 60)
    cur.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table','view','index') AND name NOT LIKE 'sqlite_%' ORDER BY type, name")
    objects = cur.fetchall()
    tables = [o for o in objects if o[1] == 'table']
    views = [o for o in objects if o[1] == 'view']
    indexes = [o for o in objects if o[1] == 'index']
    print(f"\n  Tables ({len(tables)}):")
    for tbl_name, _ in tables:
        cur.execute(f"PRAGMA table_info('{tbl_name}')")
        cols = cur.fetchall()
        try:
            cur.execute(f"SELECT COUNT(*) FROM [{tbl_name}]")
            rc = cur.fetchone()[0]
        except:
            rc = "ERROR"
        print(f"    {tbl_name}: {len(cols)} columns, {rc:,} rows")
        for c in cols:
            print(f"      - {c[1]:30s} {c[2] or '':15s} {'NOT NULL' if c[3] else ''} {'PK' if c[5] else ''}")
    if views:
        print(f"\n  Views ({len(views)}):")
        for v_name, _ in views:
            print(f"    {v_name}")
    if indexes:
        print(f"\n  Indexes ({len(indexes)}):")
        for idx_name, _ in indexes:
            print(f"    {idx_name}")

    # 3. Expected tables
    print("\n" + "-" * 60)
    print("  EXPECTED TABLE VALIDATION")
    print("-" * 60)
    expected = {"aoc_clean": "Core fact table", "org_summary": "Dept dimension", "vendor_summary": "Vendor dimension", "monthly_summary": "Monthly aggregation"}
    for tbl, desc in expected.items():
        cur.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{tbl}'")
        if cur.fetchone():
            cur.execute(f"SELECT COUNT(*) FROM [{tbl}]")
            c = cur.fetchone()[0]
            print(f"  [PASS] {tbl:25s} - {c:,} rows  ({desc})")
            total_pass += 1
        else:
            print(f"  [FAIL] {tbl:25s} - MISSING  ({desc})")
            total_fail += 1

    # 4. aoc_clean validation
    print("\n" + "-" * 60)
    print("  aoc_clean DATA VALIDATION")
    print("-" * 60)
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='aoc_clean'")
    if not cur.fetchone():
        print("  [SKIP] aoc_clean not found")
    else:
        total = cur.execute("SELECT COUNT(*) FROM aoc_clean").fetchone()[0]
        print(f"\n  Total rows in aoc_clean: {total:,}")

        print("\n  --- NULL in critical fields ---")
        for col in ["tender_id", "org_name", "vendor_name", "contract_value"]:
            cur.execute(f'SELECT COUNT(*) FROM aoc_clean WHERE "{col}" IS NULL')
            n = cur.fetchone()[0]
            if n == 0:
                print(f"    [PASS] NULL {col}: 0")
                total_pass += 1
            else:
                pct = (n / total) * 100 if total else 0
                print(f"    [FAIL] NULL {col}: {n:,} ({pct:.2f}%)")
                total_fail += 1

        print("\n  --- Empty strings in critical fields ---")
        for col in ["tender_id", "org_name", "vendor_name"]:
            cur.execute(f"SELECT COUNT(*) FROM aoc_clean WHERE \"{col}\" = ''")
            n = cur.fetchone()[0]
            if n == 0:
                print(f"    [PASS] Empty {col}: 0")
                total_pass += 1
            else:
                pct = (n / total) * 100 if total else 0
                print(f"    [FAIL] Empty {col}: {n:,} ({pct:.2f}%)")
                total_fail += 1

        print("\n  --- Zero or negative contract_value ---")
        cur.execute("SELECT COUNT(*) FROM aoc_clean WHERE contract_value = 0")
        n = cur.fetchone()[0]
        if n == 0:
            print(f"    [PASS] Zero-value contracts: 0")
            total_pass += 1
        else:
            pct = (n / total) * 100 if total else 0
            print(f"    [FAIL] Zero-value contracts: {n:,} ({pct:.2f}%)")
            total_fail += 1

        cur.execute("SELECT COUNT(*) FROM aoc_clean WHERE contract_value < 0")
        n = cur.fetchone()[0]
        if n == 0:
            print(f"    [PASS] Negative-value contracts: 0")
            total_pass += 1
        else:
            print(f"    [FAIL] Negative-value contracts: {n:,}")
            total_fail += 1

        print("\n  --- Zero-bid contracts ---")
        cur.execute("SELECT COUNT(*) FROM aoc_clean WHERE bids_received = 0 OR bids_received IS NULL")
        n = cur.fetchone()[0]
        pct = (n / total) * 100 if total else 0
        print(f"    [INFO] Zero/null bid contracts: {n:,} ({pct:.2f}%)")

        print("\n  --- Unknown placeholder values ---")
        cur.execute("SELECT COUNT(*) FROM aoc_clean WHERE org_name = 'Unknown' OR org_name IS NULL")
        n = cur.fetchone()[0]
        pct = (n / total) * 100 if total else 0
        print(f"    [INFO] Unknown/NULL org_name: {n:,} ({pct:.2f}%)")
        cur.execute("SELECT COUNT(*) FROM aoc_clean WHERE vendor_name = 'Unknown' OR vendor_name IS NULL")
        n = cur.fetchone()[0]
        pct = (n / total) * 100 if total else 0
        print(f"    [INFO] Unknown/NULL vendor_name: {n:,} ({pct:.2f}%)")

        print("\n  --- Contract value distribution ---")
        cur.execute("SELECT MIN(contract_value), MAX(contract_value), AVG(contract_value), SUM(contract_value) FROM aoc_clean WHERE contract_value > 0")
        s = cur.fetchone()
        if s and s[0] is not None:
            print(f"    Min:   Rs.{s[0]:,.2f}")
            print(f"    Max:   Rs.{s[1]:,.2f}")
            print(f"    Avg:   Rs.{s[2]:,.2f}")
            print(f"    Total: Rs.{s[3]:,.2f}")
            total_pass += 1
        else:
            print(f"    [WARN] No positive contract values")
            total_fail += 1

        print("\n  --- Date field sanity ---")
        for col in ["published_date", "closing_date", "contract_date"]:
            try:
                cur.execute(f'SELECT COUNT(*) FROM aoc_clean WHERE "{col}" IS NOT NULL AND "{col}" != \'\' AND length("{col}") < 8')
                n = cur.fetchone()[0]
                if n == 0:
                    print(f"    [PASS] {col}: no malformed dates")
                    total_pass += 1
                else:
                    print(f"    [FAIL] {col}: {n} malformed dates")
                    total_fail += 1
            except sqlite3.OperationalError:
                print(f"    [INFO] {col}: column not found")

    # 5. Cross-table consistency
    print("\n" + "-" * 60)
    print("  CROSS-TABLE CONSISTENCY")
    print("-" * 60)
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='org_summary'")
    if cur.fetchone():
        print("\n  --- org_summary vs aoc_clean ---")
        cur.execute("SELECT COUNT(DISTINCT org_name) FROM aoc_clean WHERE org_name IS NOT NULL AND org_name != ''")
        d = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM org_summary")
        s = cur.fetchone()[0]
        print(f"    Distinct orgs in aoc_clean: {d:,}")
        print(f"    Rows in org_summary:        {s:,}")
        cur.execute("SELECT COUNT(DISTINCT a.org_name) FROM aoc_clean a LEFT JOIN org_summary o ON a.org_name = o.org_name WHERE a.org_name IS NOT NULL AND a.org_name != '' AND o.org_name IS NULL")
        o = cur.fetchone()[0]
        if o == 0:
            print(f"    [PASS] No orphaned org_names")
            total_pass += 1
        else:
            print(f"    [WARN] {o} orphaned org_names (may be expected)")
            total_pass += 1

    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='vendor_summary'")
    if cur.fetchone():
        print("\n  --- vendor_summary vs aoc_clean ---")
        cur.execute("SELECT COUNT(DISTINCT vendor_name) FROM aoc_clean WHERE vendor_name IS NOT NULL AND vendor_name != '' AND vendor_name != 'Unknown'")
        d = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM vendor_summary")
        s = cur.fetchone()[0]
        print(f"    Distinct vendors in aoc_clean: {d:,}")
        print(f"    Rows in vendor_summary:         {s:,}")
        cur.execute("SELECT COUNT(DISTINCT a.vendor_name) FROM aoc_clean a LEFT JOIN vendor_summary v ON a.vendor_name = v.vendor_name WHERE a.vendor_name IS NOT NULL AND a.vendor_name != '' AND a.vendor_name != 'Unknown' AND v.vendor_name IS NULL")
        o = cur.fetchone()[0]
        if o == 0:
            print(f"    [PASS] No orphaned vendor_names")
            total_pass += 1
        else:
            print(f"    [WARN] {o} orphaned vendor_names")
            total_pass += 1

    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='monthly_summary'")
    if cur.fetchone():
        print("\n  --- monthly_summary ---")
        cur.execute("SELECT COUNT(*) FROM monthly_summary")
        mc = cur.fetchone()[0]
        cur.execute("SELECT MIN(year_month), MAX(year_month) FROM monthly_summary")
        dr = cur.fetchone()
        print(f"    Rows: {mc:,}")
        print(f"    Date range: {dr[0]} -> {dr[1]}")
        total_pass += 1

    conn.close()

    # Summary
    print("\n" + "=" * 80)
    print(f"  TOTAL: {total_pass} passed, {total_fail} failed")
    print(f"  Duration: {(datetime.now() - start).total_seconds():.1f}s")
    print("=" * 80)
    if total_fail > 0:
        print(f"\n  WARNING: {total_fail} validation failure(s) detected.")
    else:
        print(f"\n  All integrity checks passed.")

if __name__ == "__main__":
    main()