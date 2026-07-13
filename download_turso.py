import urllib.request
import json
import zipfile
import os

print("Fetching Turso latest release...")
req = urllib.request.Request("https://api.github.com/repos/tursodatabase/turso-cli/releases/latest", headers={'User-Agent': 'Mozilla/5.0'})
response = urllib.request.urlopen(req)
data = json.loads(response.read().decode('utf-8'))

download_url = None
for asset in data.get('assets', []):
    if 'windows' in asset['name'].lower() and 'x86_64' in asset['name'].lower():
        download_url = asset['browser_download_url']
        break

if not download_url:
    print("Could not find Windows asset.")
    exit(1)

print(f"Downloading from {download_url}...")
urllib.request.urlretrieve(download_url, 'turso.zip')

print("Extracting...")
with zipfile.ZipFile('turso.zip', 'r') as zip_ref:
    zip_ref.extractall('.')

print("Done. turso.exe should now be in the folder.")
