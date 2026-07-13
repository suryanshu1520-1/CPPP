import time
import urllib.request
import json

endpoints = [
    "http://localhost:3000/api/macro-stats",
    "http://localhost:3000/api/vendors",
    "http://localhost:3000/api/top-departments",
    "http://localhost:3000/api/spending-trend"
]

for url in endpoints:
    start = time.time()
    try:
        req = urllib.request.urlopen(url)
        data = json.loads(req.read())
        end = time.time()
        print(f"[{url}] Time: {(end-start)*1000:.2f}ms | Success: {data.get('success', True)}")
    except Exception as e:
        print(f"[{url}] Failed: {e}")
