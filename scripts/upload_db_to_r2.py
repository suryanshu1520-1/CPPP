import boto3
import os
import sys
from botocore.client import Config
from dotenv import load_dotenv

# Reconfigure stdout to support utf-8 encoding for safety
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

env_path = r"c:\Users\bentn\OneDrive\Desktop\Tender Project\.env"
print(f"Loading env from: {env_path}")
load_dotenv(dotenv_path=env_path)

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

db_filename = "dashboard_lite.db"
if not os.path.exists(db_filename):
    print(f"Error: {db_filename} not found.")
    sys.exit(1)

file_size_gb = os.path.getsize(db_filename) / (1024**3)
print(f"\nUploading {db_filename} ({file_size_gb:.2f} GB) to Cloudflare R2 bucket '{bucket_name}'...")

# Helper to show progress
class ProgressPercentage(object):
    def __init__(self, filename):
        self._filename = filename
        self._size = float(os.path.getsize(filename))
        self._seen_so_far = 0

    def __call__(self, bytes_amount):
        self._seen_so_far += bytes_amount
        percentage = (self._seen_so_far / self._size) * 100
        sys.stdout.write(
            f"\rUploading: {self._seen_so_far / (1024*1024):.1f} MB / {self._size / (1024*1024):.1f} MB ({percentage:.1f}%)"
        )
        sys.stdout.flush()

try:
    s3.upload_file(
        Filename=db_filename,
        Bucket=bucket_name,
        Key="dashboard_lite.db",
        Callback=ProgressPercentage(db_filename)
    )
    print("\n\nDatabase uploaded successfully to R2!")
except Exception as e:
    print(f"\nError uploading to R2: {e}")
