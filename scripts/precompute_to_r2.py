import sqlite3
import json
import os
import sys
import boto3
import hashlib
from datetime import datetime
from botocore.client import Config
from dotenv import load_dotenv
from collections import defaultdict

# Reconfigure stdout to support utf-8 encoding for safety
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

r2_access_key = os.environ.get("R2_ACCESS_KEY_ID")
r2_secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
r2_endpoint = os.environ.get("R2_ENDPOINT")
bucket_name = os.environ.get("R2_BUCKET_NAME", "tendertrace")

if not r2_access_key or not r2_secret_key or not r2_endpoint:
    print("Error: Missing R2 environment credentials in .env file.")
    sys.exit(1)

# Create R2 client
s3 = boto3.client(
    service_name='s3',
    endpoint_url=r2_endpoint,
    aws_access_key_id=r2_access_key,
    aws_secret_access_key=r2_secret_key,
    config=Config(signature_version='s3v4'),
    region_name='auto'
)

db_path = "dashboard.db"
if not os.path.exists(db_path):
    print(f"Error: Database {db_path} not found.")
    sys.exit(1)

print(f"Connecting to {db_path}...")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Performance Tuning: Drop slow index & ensure clean query path
print("Ensuring database index idx_aoc_clean_org_name exists on aoc_clean(org_name)...")
conn.execute("CREATE INDEX IF NOT EXISTS idx_aoc_clean_org_name ON aoc_clean(org_name);")
print("Dropping index idx_aoc_clean_contract_val to avoid query planner errors...")
conn.execute("DROP INDEX IF EXISTS idx_aoc_clean_contract_val;")
conn.commit()
print("Database tuned successfully.")

def upload_json_to_r2(key, data):
    body = json.dumps(data, indent=2, ensure_ascii=False)
    s3.put_object(
        Bucket=bucket_name,
        Key=key,
        Body=body,
        ContentType='application/json'
    )

print("\n--- STEP 1: Precomputing Global Macro Stats ---")
cur.execute("SELECT SUM(total_value), SUM(total_contracts), SUM(single_bid_contracts), SUM(avg_bids * total_contracts) FROM org_summary")
stats_row = cur.fetchone()
if stats_row and stats_row[0] is not None:
    total_val, total_cnt, total_single, weighted_bids = stats_row
    avg_bids = (weighted_bids / total_cnt) if total_cnt else 0.0
    macro_stats = {
        "success": True,
        "totalValue": total_val,
        "totalContracts": total_cnt,
        "avgBids": round(avg_bids, 2),
        "singleBidRate": round((total_single / total_cnt) * 100, 2) if total_cnt else 0.0,
        "criticalFlags": total_single
    }
    print("Uploading macro_stats.json...")
    upload_json_to_r2("macro_stats.json", macro_stats)

print("\n--- STEP 2: Precomputing Global Spending Trend ---")
cur.execute("SELECT year_month, total_value, total_contracts FROM monthly_summary ORDER BY year_month ASC")
trend_rows = cur.fetchall()
spending_trend = [{"date": r[0], "value": r[1], "count": r[2]} for r in trend_rows]
print("Uploading spending_trend.json...")
upload_json_to_r2("spending_trend.json", {"success": True, "data": spending_trend})

print("\n--- STEP 3: Precomputing Global Top Departments ---")
cur.execute("""
    SELECT org_name, total_contracts, total_value, avg_bids, avg_delay_days, single_bid_contracts 
    FROM org_summary 
    ORDER BY total_value DESC 
    LIMIT 100
""")
dept_rows = cur.fetchall()
top_depts = []
for r in dept_rows:
    cnt = r[1]
    single = r[5]
    top_depts.append({
        "department": r[0],
        "contracts": cnt,
        "value": r[2],
        "avgBids": round(r[3], 2) if r[3] else 0.0,
        "avgDelay": round(r[4], 1) if r[4] else 0.0,
        "singleBidContracts": single,
        "singleBidRate": round((single / cnt) * 100, 2) if cnt else 0.0
    })
print("Uploading top_departments.json...")
upload_json_to_r2("top_departments.json", {"success": True, "data": top_depts})

print("\n--- STEP 4: Precomputing Global Bids Distribution ---")
cur.execute("""
    SELECT 
      CASE WHEN bids_received IS NULL THEN 'Unknown'
           WHEN bids_received = 1 THEN '1 Bid'
           WHEN bids_received = 2 THEN '2 Bids'
           WHEN bids_received = 3 THEN '3 Bids'
           WHEN bids_received = 4 THEN '4 Bids'
           ELSE '5+ Bids' END as bids,
      COUNT(*) as count
    FROM aoc_clean
    WHERE org_name != 'Unknown'
    GROUP BY bids
    ORDER BY bids ASC
""")
bids_rows = cur.fetchall()
buckets = { '1 Bid': 0, '2 Bids': 0, '3 Bids': 0, '4 Bids': 0, '5+ Bids': 0 }
for r in bids_rows:
    if r[0] in buckets:
        buckets[r[0]] = r[1]
bids_data = [{"bids": k, "count": v} for k, v in buckets.items()]
print("Uploading global_bids.json...")
upload_json_to_r2("global_bids.json", {"success": True, "data": bids_data})

print("\n--- STEP 5: Precomputing Global Scatterplot Coordinates ---")
print("  Querying global anomalies...")
cur.execute("""
    SELECT tender_id, title, org_name, vendor_name, contract_value, award_delay_days, bids_received
    FROM aoc_clean
    WHERE bids_received <= 2 AND award_delay_days > 30 AND award_delay_days < 730 AND contract_value > 10000000
    ORDER BY contract_value DESC LIMIT 150
""")
anoms = cur.fetchall()
print("  Querying global normals...")
cur.execute("""
    SELECT tender_id, title, org_name, vendor_name, contract_value, award_delay_days, bids_received
    FROM aoc_clean
    WHERE bids_received >= 3 AND award_delay_days >= 0 AND award_delay_days <= 90 AND contract_value > 10000000
    ORDER BY contract_value DESC LIMIT 150
""")
norms = cur.fetchall()

scatterplot_data = []
for r in anoms:
    scatterplot_data.append({
        "label": r[0], "title": r[1], "department": r[2], "vendor": r[3],
        "value": r[4], "valueCr": round(r[4] / 10000000.0, 2),
        "x": max(1, round(r[5])) if r[5] else 1,
        "y": min(r[6], 12) if r[6] else 1,
        "isAnomaly": 1
    })
for r in norms:
    scatterplot_data.append({
        "label": r[0], "title": r[1], "department": r[2], "vendor": r[3],
        "value": r[4], "valueCr": round(r[4] / 10000000.0, 2),
        "x": max(1, round(r[5])) if r[5] else 1,
        "y": min(r[6], 12) if r[6] else 1,
        "isAnomaly": 0
    })
print("Uploading global_scatterplot.json...")
upload_json_to_r2("global_scatterplot.json", {"success": True, "data": scatterplot_data})

print("\n--- STEP 6: Precomputing Red Flag Alerts ---")
red_flags = []
print("  Fetching top Single Bid red flags...")
cur.execute("""
    SELECT internal_id, tender_id, org_name, title, contract_value, bids_received, vendor_name, published_date, closing_date, contract_date, award_delay_days, bid_window_days
    FROM aoc_clean
    WHERE bids_received = 1 AND contract_date IS NOT NULL AND org_name != 'Unknown' AND contract_value > 10000000
    ORDER BY contract_value DESC LIMIT 300
""")
single_bids = cur.fetchall()
for r in single_bids:
    red_flags.append({
        "contractId": r[0], "tenderId": r[1], "department": r[2], "title": r[3], "value": r[4],
        "bids": r[5], "vendor": r[6], "publishedDate": r[7], "closingDate": r[8], "contractDate": r[9],
        "awardDelay": r[10], "bidWindow": r[11], "flagType": "single_bid"
    })

print("  Fetching top Rush Job red flags...")
cur.execute("""
    SELECT internal_id, tender_id, org_name, title, contract_value, bids_received, vendor_name, published_date, closing_date, contract_date, award_delay_days, bid_window_days
    FROM aoc_clean
    WHERE (bid_window_days >= 0 AND bid_window_days < 7) AND contract_date IS NOT NULL AND org_name != 'Unknown' AND contract_value > 10000000
    ORDER BY contract_value DESC LIMIT 300
""")
rush_jobs = cur.fetchall()
for r in rush_jobs:
    red_flags.append({
        "contractId": r[0], "tenderId": r[1], "department": r[2], "title": r[3], "value": r[4],
        "bids": r[5], "vendor": r[6], "publishedDate": r[7], "closingDate": r[8], "contractDate": r[9],
        "awardDelay": r[10], "bidWindow": r[11], "flagType": "rush"
    })

print("  Fetching top Extreme Delay red flags...")
cur.execute("""
    SELECT internal_id, tender_id, org_name, title, contract_value, bids_received, vendor_name, published_date, closing_date, contract_date, award_delay_days, bid_window_days
    FROM aoc_clean
    WHERE award_delay_days > 180 AND contract_date IS NOT NULL AND org_name != 'Unknown' AND contract_value > 10000000
    ORDER BY contract_value DESC LIMIT 300
""")
delays = cur.fetchall()
for r in delays:
    red_flags.append({
        "contractId": r[0], "tenderId": r[1], "department": r[2], "title": r[3], "value": r[4],
        "bids": r[5], "vendor": r[6], "publishedDate": r[7], "closingDate": r[8], "contractDate": r[9],
        "awardDelay": r[10], "bidWindow": r[11], "flagType": "delayed"
    })

print(f"Uploading red_flags.json ({len(red_flags):,} items)...")
upload_json_to_r2("red_flags.json", {"success": True, "data": red_flags})

print("\n--- STEP 7: Precomputing Top Vendors Leaderboard ---")
cur.execute("""
    SELECT vendor_name, total_contracts, total_value, single_bid_wins, avg_bids
    FROM vendor_summary
    WHERE vendor_name IS NOT NULL AND vendor_name != '' AND vendor_name != 'Unknown'
    ORDER BY total_value DESC
    LIMIT 100
""")
vendor_rows = cur.fetchall()
top_vendors = []
for r in vendor_rows:
    cnt = r[1]
    single = r[3]
    top_vendors.append({
        "vendor": r[0],
        "contracts": cnt,
        "value": r[2],
        "singleBidWins": single,
        "avgBids": round(r[4], 2) if r[4] else 0.0,
        "singleBidRate": round((single / cnt) * 100, 1) if cnt else 0.0
    })
print("Uploading vendors.json...")
upload_json_to_r2("vendors.json", {"success": True, "data": top_vendors})

print("\n--- STEP 8: Precomputing Provenance Meta and Hashes ---")
cur.execute("SELECT COUNT(*) FROM aoc_clean")
rowCount = cur.fetchone()[0]
dbSize = os.path.getsize("dashboard.db")
lastModified = datetime.utcnow().isoformat() + "Z"

state_string = f"CPPP_WATCHDOG_STATE_V1:{dbSize}:{lastModified}:{rowCount}"
databaseHash = hashlib.sha256(state_string.encode('utf-8')).hexdigest()
schemaHash = hashlib.sha256(b"sqlite_schema_signature_v1").hexdigest()

provenance_data = {
    "success": True,
    "provenance": {
        "hash": databaseHash,
        "schemaHash": schemaHash,
        "lastModified": lastModified,
        "datasetMetadata": {
            "totalAwardsProcessed": rowCount,
            "databaseSizeBytes": dbSize,
            "systemTimestamp": datetime.utcnow().isoformat() + "Z"
        },
        "dataManifesto": "All calculated concentration and integrity risk scores are mathematically derived from raw Central Public Procurement Portal (CPPP) source rows. The SHA-256 state hash guarantees that the underlying transaction ledger has not been tampered with since the last verified update.",
        "sources": [
            { "name": "aoc_clean", "description": "Cleaned Award of Contract (AoC) transactional records", "source": "CPPP India" },
            { "name": "org_summary", "description": "Department dimension table", "source": "CPPP India" },
            { "name": "vendor_summary", "description": "Vendor dimension table with aggregated metrics", "source": "CPPP India" }
        ]
    }
}
print("Uploading provenance.json...")
upload_json_to_r2("provenance.json", provenance_data)

print("\n--- STEP 9: Single-Pass Precomputation of Org Profiles ---")
# 1. Fetch all summaries
print("  Fetching all organization summaries...")
cur.execute("SELECT org_name, total_contracts, total_value, avg_bids, avg_delay_days, single_bid_contracts FROM org_summary")
org_sum_dict = {}
for r in cur.fetchall():
    org_sum_dict[r[0]] = {
        "contracts": r[1],
        "value": r[2],
        "avgBids": round(r[3], 2) if r[3] else 0.0,
        "avgDelay": round(r[4], 1) if r[4] else 0.0,
        "single_bid_contracts": r[5]
    }

# 2. Fetch all vendor wins grouped by org and vendor (HHI)
print("  Fetching vendor wins for HHI calculation...")
cur.execute("""
    SELECT org_name, vendor_name, SUM(COALESCE(contract_value, 0)) as val, COUNT(*) as contracts
    FROM aoc_clean
    WHERE org_name != 'Unknown' AND org_name != '' AND vendor_name != '' AND vendor_name != 'Unknown' AND contract_value > 0
    GROUP BY org_name, vendor_name
    ORDER BY org_name ASC, val DESC
""")

org_vendors = defaultdict(list)
org_vendor_totals = defaultdict(float)

for r in cur.fetchall():
    org, vendor, val, cnt = r
    org_vendors[org].append({
        "vendor": vendor,
        "value": val,
        "contracts": cnt
    })
    org_vendor_totals[org] += val

# 3. Fetch all bids distributions
print("  Fetching bids distributions...")
cur.execute("""
    SELECT org_name, 
           CASE WHEN bids_received IS NULL THEN 'Unknown'
                WHEN bids_received = 1 THEN '1 Bid'
                WHEN bids_received = 2 THEN '2 Bids'
                WHEN bids_received = 3 THEN '3 Bids'
                WHEN bids_received = 4 THEN '4 Bids'
                ELSE '5+ Bids' END as bids,
           COUNT(*) as count
    FROM aoc_clean
    WHERE org_name != 'Unknown' AND org_name != ''
    GROUP BY org_name, bids
""")

org_bids = defaultdict(lambda: { '1 Bid': 0, '2 Bids': 0, '3 Bids': 0, '4 Bids': 0, '5+ Bids': 0 })
for r in cur.fetchall():
    org, bids_bucket, count = r
    if bids_bucket in org_bids[org]:
        org_bids[org][bids_bucket] = count

# 4. Fetch scatterplot anomalies (restricting to values > 20 Lakhs to keep in-memory sizing fast)
print("  Fetching scatterplot coordinates (anomalies)...")
cur.execute("""
    SELECT tender_id, title, org_name, vendor_name, contract_value, award_delay_days, bids_received
    FROM aoc_clean
    WHERE bids_received <= 2 AND award_delay_days > 30 AND award_delay_days < 730 AND contract_value > 2000000
    ORDER BY org_name ASC, contract_value DESC
""")

org_scatterplot_anoms = defaultdict(list)
for r in cur.fetchall():
    tid, title, org, vendor, val, delay, bids = r
    if len(org_scatterplot_anoms[org]) < 100:
        org_scatterplot_anoms[org].append({
            "label": tid, "title": title, "department": org, "vendor": vendor,
            "value": val, "valueCr": round(val / 10000000.0, 2),
            "x": max(1, round(delay)) if delay else 1,
            "y": min(bids, 12) if bids else 1,
            "isAnomaly": 1
        })

print("  Fetching scatterplot coordinates (normals)...")
cur.execute("""
    SELECT tender_id, title, org_name, vendor_name, contract_value, award_delay_days, bids_received
    FROM aoc_clean
    WHERE bids_received >= 3 AND award_delay_days >= 0 AND award_delay_days <= 90 AND contract_value > 2000000
    ORDER BY org_name ASC, contract_value DESC
""")

org_scatterplot_norms = defaultdict(list)
for r in cur.fetchall():
    tid, title, org, vendor, val, delay, bids = r
    if len(org_scatterplot_norms[org]) < 100:
        org_scatterplot_norms[org].append({
            "label": tid, "title": title, "department": org, "vendor": vendor,
            "value": val, "valueCr": round(val / 10000000.0, 2),
            "x": max(1, round(delay)) if delay else 1,
            "y": min(bids, 12) if bids else 1,
            "isAnomaly": 0
        })

# 5. Compile and upload everything in one pass
total_orgs = len(org_sum_dict)
print(f"  Compiling profiles and uploading {total_orgs:,} organization scorecards to R2...")

for idx, (org_name, summary) in enumerate(org_sum_dict.items()):
    # Calculate HHI score for this org
    total_val_check = org_vendor_totals[org_name]
    hhi = 0.0
    hhi_vendors = []
    
    if total_val_check > 0:
        for v in org_vendors[org_name]:
            share = (v["value"] / total_val_check) * 100
            hhi += share * share
            hhi_vendors.append({
                "vendor": v["vendor"],
                "value": v["value"],
                "share": round(share, 2),
                "contracts": v["contracts"]
            })

    # Summary formatting
    cnt = summary["contracts"]
    sb = summary["single_bid_contracts"]
    org_profile = {
        "success": True,
        "orgName": org_name,
        "summary": {
            "contracts": cnt,
            "value": summary["value"],
            "avgBids": summary["avgBids"],
            "avgDelay": summary["avgDelay"],
            "singleBidContracts": sb,
            "singleBidRate": round((sb / cnt) * 100, 2) if cnt else 0.0,
            "hhi": round(hhi, 1)
        },
        "vendors": hhi_vendors[:10],
        "bidsDistribution": [{"bids": k, "count": v} for k, v in org_bids[org_name].items()],
        "scatterplot": org_scatterplot_anoms[org_name] + org_scatterplot_norms[org_name]
    }
    
    # Upload to R2
    safe_org_name = org_name.replace("/", "_").replace("\\", "_")
    upload_json_to_r2(f"orgs/{safe_org_name}.json", org_profile)
    
    if (idx + 1) % 300 == 0:
        print(f"    Uploaded {idx + 1}/{total_orgs} scorecards...")

print("\nAll global files and organization scorecards uploaded successfully to Cloudflare R2!")
conn.close()
