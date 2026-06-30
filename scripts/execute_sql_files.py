#!/usr/bin/env python3
"""Execute all generated SQL files via Supabase CLI. Vendors first, then contracts.
Uses parallel execution for speed."""
import subprocess, sys, time, os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

SQL_DIR = Path(__file__).resolve().parent / 'sql_output'
PROJECT_ROOT = Path(__file__).resolve().parent.parent
PARALLEL = 8  # Number of concurrent CLI invocations

def run_file(path, timeout=120):
    r = subprocess.run(
        f'npx supabase db query --linked -f "{path}"',
        capture_output=True, text=True, timeout=timeout,
        cwd=str(PROJECT_ROOT),
        shell=True, encoding='utf-8', errors='replace'
    )
    return path, r.returncode, r.stderr.strip()[:200] if r.stderr else ''

def execute_files(pattern, label):
    files = sorted(SQL_DIR.glob(pattern))
    print(f"\n{'='*60}")
    print(f"Executing {len(files)} {label} files ({PARALLEL} parallel)...")
    print(f"{'='*60}")
    
    start = time.time()
    done = 0; errors = 0; processed = 0
    
    with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
        futures = {pool.submit(run_file, str(f)): f for f in files}
        
        for future in as_completed(futures):
            processed += 1
            path, code, err = future.result()
            if code == 0:
                done += 1
            else:
                errors += 1
                if errors <= 10:
                    fname = Path(path).name
                    print(f"  ⚠ {fname}: {err[:100]}")
            
            if processed % 100 == 0 or processed == len(files):
                elapsed = time.time() - start
                rate = processed / elapsed * 60 if elapsed > 0 else 0
                remaining = len(files) - processed
                eta = remaining / (rate / 60) if rate > 0 else 0
                print(f"  [{processed}/{len(files)}] {done} ok, {errors} err | {rate:.0f} files/min | ETA: {eta/60:.1f} min")
    
    elapsed = time.time() - start
    print(f"\n  ✓ {label}: {done}/{len(files)} files in {elapsed/60:.1f} min ({errors} errors)")
    return done, errors

def main():
    print("="*60)
    print("BATCH SQL EXECUTOR — Supabase CLI")
    print("="*60)
    print(f"  Started: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Verify connection
    print("\nVerifying connection...")
    try:
        r = subprocess.run(
            'npx supabase db query --linked "SELECT 1"',
            capture_output=True, text=True, timeout=30,
            cwd=str(Path(__file__).resolve().parent.parent),
            shell=True, encoding='utf-8', errors='replace'
        )
        if r.returncode != 0:
            print(f"  ✗ Connection failed: {r.stderr[:100]}")
            sys.exit(1)
        print("  ✓ Connected")
    except:
        print("  ✗ Connection failed")
        sys.exit(1)
    
    total_start = time.time()
    
    # Phase 1: Vendors
    v_done, v_err = execute_files('02v_*.sql', 'vendors')
    
    # Phase 2: Contracts
    c_done, c_err = execute_files('03c_*.sql', 'contracts')
    
    total_elapsed = time.time() - total_start
    
    # Verify
    print(f"\n{'='*60}")
    print("VERIFICATION")
    print(f"{'='*60}")
    for table, expected in [('org_summary',1793),('vendor_summary',947183),('aoc_clean',4540739)]:
        try:
            r = subprocess.run(
                f'npx supabase db query --linked "SELECT COUNT(*) FROM {table};"',
                capture_output=True, text=True, timeout=30,
                cwd=str(Path(__file__).resolve().parent.parent),
                shell=True, encoding='utf-8', errors='replace'
            )
            for line in r.stdout.strip().split('\n'):
                line = line.strip().replace('│','').strip()
                if line.isdigit():
                    c = int(line)
                    print(f"  {'✓' if c>0 else '✗'} {table}: {c:,} / {expected:,} ({c/expected*100:.1f}%)")
                    break
        except Exception as e:
            print(f"  ✗ {table}: {e}")
    
    print(f"\nTotal time: {total_elapsed/60:.1f} min")
    print(f"Finished: {time.strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == '__main__':
    main()