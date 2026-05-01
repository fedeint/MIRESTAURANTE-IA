#!/bin/bash
echo "=== Security Check ==="
echo ""
echo "--- npm audit ---"
npm audit --production 2>&1 | tail -20
echo ""
echo "--- .env in git? ---"
git ls-files .env 2>/dev/null && echo "WARNING: .env is tracked by git!" || echo "OK: .env is not tracked"
echo ""
echo "--- Checking for hardcoded secrets ---"
grep -rn "password\|secret\|api_key\|apikey" --include="*.js" routes/ server.js | grep -v "node_modules" | grep -v "process.env" | grep -v "password_hash" | grep -v "// " | grep -v "req.body" | head -10
echo ""
echo "=== Done ==="
