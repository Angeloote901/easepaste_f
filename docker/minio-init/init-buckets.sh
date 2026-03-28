#!/bin/sh
set -e

echo "Waiting for MinIO to be ready..."
mc alias set local http://minio:9000 minioadmin minioadmin

echo "Creating bucket easepaste-documents..."
mc mb local/easepaste-documents --ignore-existing

echo "Setting bucket to private..."
mc anonymous set none local/easepaste-documents

echo "Setting lifecycle policy..."
mc ilm import local/easepaste-documents << 'EOF'
{
  "Rules": [
    {
      "ID": "expire-uploads",
      "Status": "Enabled",
      "Filter": { "Prefix": "users/" },
      "Expiration": { "Days": 7 }
    }
  ]
}
EOF

echo "MinIO initialization complete."
