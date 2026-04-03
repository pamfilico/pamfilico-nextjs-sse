#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Starting test stack..."
docker compose -f docker-compose.test.yml up -d --build

echo "Waiting for Redis..."
for i in {1..30}; do
  if docker compose -f docker-compose.test.yml exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "Redis ready."
    break
  fi
  [ $i -eq 30 ] && { echo "Redis failed."; docker compose -f docker-compose.test.yml down; exit 1; }
  sleep 1
done

echo "Waiting for Next.js..."
for i in {1..60}; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3099 2>/dev/null | grep -q 200; then
    echo "Next.js ready."
    break
  fi
  [ $i -eq 60 ] && { echo "Next.js failed to start."; docker compose -f docker-compose.test.yml logs; docker compose -f docker-compose.test.yml down; exit 1; }
  sleep 1
done

cd tests
npm install

echo "Running SSE flow tests (HTTP)..."
node test-sse-flow.mjs http://localhost:3099
HTTP_EXIT=$?

echo "Running SSE Redis flow tests..."
node test-sse-redis-flow.mjs http://localhost:3099 redis://localhost:6399
REDIS_EXIT=$?

cd ..

docker compose -f docker-compose.test.yml down
echo "Done."

if [ $HTTP_EXIT -ne 0 ] || [ $REDIS_EXIT -ne 0 ]; then
  exit 1
fi
exit 0
