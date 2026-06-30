"""Inspect dashboard.db schema: tables, indexes, triggers, views."""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'dashboard.db')

def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("""
        SELECT name, type, sql
        FROM sqlite_master
        WHERE type IN ('table','index','trigger','view')
        ORDER BY type, name
    """)
    rows = cur.fetchall()

    current_type = None
    for name, typ, sql in rows:
        if typ != current_type:
            current_type = typ
            print(f"\n{'='*60}")
            print(f"  {typ.upper()}S")
            print(f"{'='*60}")
        print(f"\n  {name}")
        if sql and typ in ('table', 'view', 'trigger'):
            # Print first few lines of SQL for context
            for line in sql.split('\n')[:8]:
                print(f"    {line}")
            if len(sql.split('\n')) > 8:
                print(f"    ... ({len(sql.split(chr(10)))} lines total)")

    # Also show row counts for key tables
    print(f"\n{'='*60}")
    print("  ROW COUNTS (key tables)")
    print(f"{'='*60}")
    for tbl in ['aoc_clean', 'tenders_clean', 'vendor_summary', 'org_summary', 'monthly_summary']:
        try:
            cur.execute(f"SELECT COUNT(*) FROM {tbl}")
            count = cur.fetchone()[0]
            print(f"    {tbl:25s} {count:>12,}")
        except Exception as e:
            print(f"    {tbl:25s} ERROR: {e}")

    # Check if FTS5 table exists
    print(f"\n{'='*60}")
    print("  FTS5 CHECK")
    print(f"{'='*60}")
    try:
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%fts%'")
        fts_tables = cur.fetchall()
        if fts_tables:
            for ft in fts_tables:
                print(f"    FTS table found: {ft[0]}")
                # Try a sample query
                try:
                    cur.execute(f"SELECT COUNT(*) FROM {ft[0]}")
                    print(f"      Row count: {cur.fetchone()[0]:,}")
                except Exception as e:
                    print(f"      Count error: {e}")
        else:
            print("    No FTS5 tables found.")
    except Exception as e:
        print(f"    FTS check error: {e}")

    conn.close()

if __name__ == '__main__':
    main()