#!/bin/bash
# Wrapper for fetch-data.js — sets env vars before running

export UPSTASH_REDIS_REST_URL="https://relevant-mole-108874.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="gQAAAAAAAalKAAIgcDEwZGVkYWYxNzhlMjA0MmY0YjA4MzQzNWE4ZDhiZGNiNw"

cd /root/top-traders
node scripts/fetch-data.js >> /var/log/fetch-data.log 2>&1
