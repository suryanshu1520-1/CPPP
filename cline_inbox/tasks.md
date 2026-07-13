# Cline Task Inbox: Heavy Lifting Tasks

Please take over the following heavy-lifting verification and data uploading tasks:

---

## Task 1: CPPP Database Integrity Verification
Verify the integrity, record count, and schema consistency of the newly translated SQLite databases.

### Action Items:
1. Run the integrity script:
   ```bash
   python scratch/verify_integrity.py
   ```
2. Inspect the output to verify row counts, column counts, and database schemas.
3. Validate that there are no empty fields, null values, or anomalous zero-value contracts in the `aoc_clean` table.
4. Report any validation failures or schema discrepancies.

---

## Task 2: Cloudflare R2 Precomputation & Upload
Recompile the global dashboard statistics and organization scorecards, and upload all files (including the 1.89 GB `dashboard_lite.db` database) to Cloudflare R2 storage.

### R2 Credentials:
- **S3 Jurisdiction-Specific Endpoint**: `https://3d705866c73b85338f235ec768a71a07.r2.cloudflarestorage.com`
- **Access Key ID**: `0f263cbf32e7d9815baf9b3be3311644`
- **Secret Access Key**: `9cb5137c753b8663e02f0fe7bd0166807169d3b5d105cf42cee47e7e3b30784f`
- **Bucket Name**: `tendertrace`

### Action Items:
1. Run the single-pass precomputation and upload script:
   ```bash
   python scripts/precompute_to_r2.py
   ```
   *This compiles and uploads global stats, spending trends, leaderboards, provenance data, red flags, and all 1,791 organization scorecards.*
2. Upload the SQLite database for full-text search:
   ```bash
   python scripts/upload_db_to_r2.py
   ```
   *This uploads the 1.89 GB `dashboard_lite.db` database file.*
