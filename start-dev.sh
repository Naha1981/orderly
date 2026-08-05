#!/bin/bash
# Orderly — dev server startup script (loads .env explicitly)
cd /home/z/my-project
set -a
source .env
set +a
exec bun run dev
