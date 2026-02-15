#!/bin/bash

# Test script to verify the export endpoint works

echo "🧪 Testing export endpoint..."
echo ""

# Get the first model ID from library
MODEL_ID=$(cat server/library/models.json | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$MODEL_ID" ]; then
  echo "❌ No models found in library"
  exit 1
fi

echo "📋 Testing with model ID: $MODEL_ID"
echo ""

# Test the endpoint
RESPONSE=$(curl -s -X POST "http://localhost:3001/api/library/export-for-git/$MODEL_ID" \
  -H "Content-Type: application/json" \
  -d '{"author":"Test User","version":"1.0.0","visibility":"public"}' \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Export endpoint is working!"
  echo "Response size: $(echo "$BODY" | wc -c) bytes"
  echo ""
  echo "🎉 The server has been updated successfully!"
  echo ""
  echo "📝 Next steps:"
  echo "   1. Restart your browser (Ctrl+Shift+R to hard refresh)"
  echo "   2. Go to Libraries tab"
  echo "   3. Click '📤 Share Model'"
  echo "   4. Try exporting again"
elif [ "$HTTP_CODE" = "404" ]; then
  echo "⚠️  Endpoint not found (404)"
  echo ""
  echo "The server needs to be restarted to pick up the code changes."
  echo ""
  echo "To restart the server:"
  echo "   1. Stop the current server (Ctrl+C in the terminal running it)"
  echo "   2. Run: npm start"
  echo "   3. Try this test again"
elif [ "$HTTP_CODE" = "500" ]; then
  echo "❌ Server error (500)"
  echo ""
  echo "Response:"
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
else
  echo "❓ Unexpected status: $HTTP_CODE"
  echo ""
  echo "Response:"
  echo "$BODY"
fi
