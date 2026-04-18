#!/bin/bash
while true; do
  cd /home/z/my-project
  node node_modules/.bin/next dev -p 3000
  echo "[keep-alive] Server died at $(date), restarting in 3s..."
  sleep 3
done
