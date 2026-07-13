"""Verify EXPLAIN QUERY PLAN for key API queries to confirm index usage."""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'dashboard.db')

def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    queries = [
        ("FTS5 Search", """
            SELECT c.internal_id, c.tender_id, c.org_name, c.title, c.contract_value,
                   c.bids_received, c.vendor_name, c.contract_date
            FROM aoc_clean c
            JOIN aoc_fts f ON c.rowid = f.rowid
            WHERE aoc_fts MATCH 'road AND construction'
            AND c.contract_date != '9999-01-01 00:00:00'
            ORDER BY c.contract_date DESC LIMIT 20
        """),
        ("HHI by Org", """
            WITH dept_total AS (
                SELECT SUM(contract_value) as total_val
                FROM aoc_clean
                WHERE org_name = 'National Highways Authority of India'
                AND contract_value > 0 AND contract_date != '9999-01-01 00:00:00'
            ),
            vendor_shares AS (
                SELECT vendor_name, SUM(contract_value) as vendor_val,
                       (SUM(contract_value) * 100.0 / (SELECT total_val FROM dept_total)) as share
                FROM aoc_clean
                WHERE org_name = 'National Highways Authority of India'
                AND contract_value > 0 AND vendor_name IS NOT NULL
                AND contract_date != '9999-01-01 00:00:00'
                GROUP BY vendor_name
            )
            SELECT vendor_name, vendor_val, share,
                   (SELECT SUM(share * share) FROM vendor_shares) as hhi
            FROM vendor_shares ORDER BY share DESC LIMIT 10
        """),
        ("IRI by Org", """
            SELECT COUNT(*),
                   SUM(CASE WHEN bids_received = 1 THEN 1 ELSE 0 END),
                   SUM(CASE WHEN bid_window_days >= 0 AND bid_window_days < 7 THEN 1 ELSE 0 END),
                   SUM(CASE WHEN award_delay_days > 180 THEN 1 ELSE 0 END)
            FROM aoc_clean
            WHERE org_name = 'National Highways Authority of India'
            AND contract_date IS NOT NULL AND contract_date != '9999-01-01 00:00:00'
        """),
        ("Anomaly Scatterplot", """
            SELECT c.tender_id, c.org_name, c.vendor_name, c.contract_value,
                   c.bid_window_days, c.award_delay_days, c.bids_received
            FROM aoc_clean c
            WHERE c.contract_date != '9999-01-01 00:00:00'
            AND c.bid_window_days >= 0 AND c.bid_window_days <= 30
            AND c.award_delay_days >= 0 AND c.award_delay_days <= 365
            ORDER BY (c.award_delay_days / CAST(c.bid_window_days AS REAL)) DESC
            LIMIT 50
        """),
        ("Bids Distribution", """
            SELECT bids_received, COUNT(*) as cnt
            FROM aoc_clean
            WHERE contract_date != '9999-01-01 00:00:00'
            AND bids_received > 0 AND bids_received <= 10
            GROUP BY bids_received ORDER BY bids_received
        """),
    ]

    for name, sql in queries:
        print(f"\n{'='*60}")
        print(f"  QUERY: {name}")
        print(f"{'='*60}")
        cur.execute(f"EXPLAIN QUERY PLAN {sql}")
        plans = cur.fetchall()
        for p in plans:
            # Format: (id, parent, notused, detail)
            print(f"    {p[3]}")

    # Also test actual query timing for FTS search
    print(f"\n{'='*60}")
    print("  TIMING TEST: FTS5 Search")
    print(f"{'='*60}")
    import time
    start = time.time()
    cur.execute(queries[0][1])
    results = cur.fetchall()
    elapsed = (time.time() - start) * 1000
    print(f"    Results: {len(results)} rows")
    print(f"    Execution time: {elapsed:.2f}ms")

    conn.close()

if __name__ == '__main__':
    main()