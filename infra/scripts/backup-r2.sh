#!/usr/bin/env bash
# ==============================================================================
# RepoDojo Automated Encrypted MongoDB Backup to Cloudflare R2
# Architecture Decision: ADR 14.2 ($0/mo Disaster Recovery Automation)
# Runs via cron: 0 3 * * * (Daily at 03:00 UTC)
# ==============================================================================

set -euo pipefail

# Configuration with fallback environment variables
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_TEMP_DIR:-/tmp/repodojo-backups}"
BACKUP_NAME="repodojo_backup_${TIMESTAMP}.dump.gz"
ENCRYPTED_BACKUP="${BACKUP_NAME}.gpg"
R2_BUCKET="${R2_BUCKET:-repodojo-backups}"
R2_ENDPOINT="${R2_ENDPOINT_URL:-https://${CLOUDFLARE_ACCOUNT_ID:-account_id}.r2.cloudflarestorage.com}"
RETENTION_DAYS=30

echo "================================================================================"
echo " RepoDojo Automated Disaster Recovery Backup — ${TIMESTAMP}"
echo " Target Bucket: s3://${R2_BUCKET}/mongodb-backups/"
echo "================================================================================"

# Verify required environment secrets
if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "[-] ERROR: MONGODB_URI environment variable is required." >&2
  exit 1
fi

if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "[-] ERROR: BACKUP_PASSPHRASE environment variable is required for client-side encryption." >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
cd "${BACKUP_DIR}"

# 1. Run point-in-time mongodump with oplog consistency
echo "[+] Step 1/4: Running mongodump with oplog..."
mongodump --uri="${MONGODB_URI}" --oplog --gzip --archive="${BACKUP_NAME}"

BACKUP_SIZE=$(du -h "${BACKUP_NAME}" | cut -f1)
echo "[+] Raw dump created successfully: ${BACKUP_NAME} (${BACKUP_SIZE})"

# 2. Client-Side Encryption with GPG AES-256 (Zero unencrypted data stored in cloud)
echo "[+] Step 2/4: Encrypting backup archive with GPG (AES-256)..."
gpg --batch --yes --passphrase "${BACKUP_PASSPHRASE}" \
    --symmetric --cipher-algo AES256 \
    -o "${ENCRYPTED_BACKUP}" "${BACKUP_NAME}"

# Clean up raw unencrypted dump immediately
rm -f "${BACKUP_NAME}"

ENCRYPTED_SIZE=$(du -h "${ENCRYPTED_BACKUP}" | cut -f1)
echo "[+] Encrypted archive generated: ${ENCRYPTED_BACKUP} (${ENCRYPTED_SIZE})"

# 3. Stream encrypted backup to Cloudflare R2 via S3-compatible API
echo "[+] Step 3/4: Uploading encrypted backup to Cloudflare R2..."
aws s3 cp "${ENCRYPTED_BACKUP}" "s3://${R2_BUCKET}/mongodb-backups/${ENCRYPTED_BACKUP}" \
    --endpoint-url "${R2_ENDPOINT}" \
    --storage-class STANDARD

# 4. Enforce 30-Day Backup Retention Policy (PRD §14.4)
echo "[+] Step 4/4: Enforcing ${RETENTION_DAYS}-day backup retention prune..."
CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +"%Y%m%d" 2>/dev/null || date -v-${RETENTION_DAYS}d +"%Y%m%d")

aws s3 ls "s3://${R2_BUCKET}/mongodb-backups/" --endpoint-url "${R2_ENDPOINT}" | while read -r line; do
  BACKUP_FILE=$(echo "${line}" | awk '{print $4}')
  if [[ "${BACKUP_FILE}" =~ repodojo_backup_([0-9]{8})_ ]]; then
    FILE_DATE="${BASH_REMATCH[1]}"
    if [[ "${FILE_DATE}" < "${CUTOFF_DATE}" ]]; then
      echo "[*] Pruning expired backup older than ${RETENTION_DAYS} days: ${BACKUP_FILE}"
      aws s3 rm "s3://${R2_BUCKET}/mongodb-backups/${BACKUP_FILE}" --endpoint-url "${R2_ENDPOINT}"
    fi
  fi
done

# Cleanup local temporary directory
rm -f "${ENCRYPTED_BACKUP}"
echo "[✓] Backup and replication completed successfully at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
