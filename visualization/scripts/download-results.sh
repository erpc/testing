#!/bin/bash

# Create necessary directories
mkdir -p data/prometheus
mkdir -p data/k6-results

# Download artifacts from GitHub Actions
# You'll need to provide your GitHub token and relevant workflow details
gh run download --repo your-repo-name --name "k6-results-*"

# Process each JSON file and convert to Prometheus format
for variant_dir in data/k6-results/*/; do
    variant_name=$(basename "$variant_dir")
    python3 scripts/convert-to-prom.py "$variant_dir/results.json" "$variant_name"
done

# Start the visualization stack
docker-compose up -d 