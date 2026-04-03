#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Starting test stack..."
docker compose -f docker-compose.test.yml up -d --build

echo "Waiting for Next.js..."
for i in {1..60}; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3099 2>/dev/null | grep -q 200; then
    echo "Next.js ready."
    break
  fi
  [ $i -eq 60 ] && { echo "Next.js failed to start."; docker compose -f docker-compose.test.yml logs; docker compose -f docker-compose.test.yml down; exit 1; }
  sleep 1
done

echo "Running SSE flow tests..."
cd tests
npm install
node test-sse-flow.mjs http://localhost:3099
EXIT_CODE=$?
cd ..

docker compose -f docker-compose.test.yml down
echo "Done."
exit $EXIT_CODE
