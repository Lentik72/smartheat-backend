#!/bin/bash
# SmartHeat Production Testing Script

# Set your Railway app URL here
RAILWAY_URL="https://your-app.railway.app"

echo "🧪 SmartHeat Production Testing"
echo "==============================="
echo "Testing URL: $RAILWAY_URL"
echo ""

# Test 1: Health Check
echo "🏥 Test 1: Health Check"
echo "----------------------"
curl -s "$RAILWAY_URL/health" | jq '.' 2>/dev/null || curl -s "$RAILWAY_URL/health"
echo ""

# Test 2: API Documentation
echo "📖 Test 2: API Documentation"
echo "---------------------------"
curl -s "$RAILWAY_URL/api/docs" | jq '.name, .version, .endpoints' 2>/dev/null || curl -s "$RAILWAY_URL/api/docs"
echo ""

# Test 3: Admin Health Check
echo "👑 Test 3: Admin System Health (requires admin auth)"
echo "---------------------------------------------------"
echo "This test requires authentication. Manual test:"
echo "curl -H 'Authorization: Bearer YOUR_ADMIN_JWT_TOKEN' $RAILWAY_URL/api/admin/health"
echo ""

# Test 4: Database Connection
echo "🗄️  Test 4: Database Connection Test"
echo "-----------------------------------"
HEALTH_RESPONSE=$(curl -s "$RAILWAY_URL/health")
DB_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.services.database' 2>/dev/null || echo "unknown")
echo "Database Status: $DB_STATUS"
echo ""

# Test 5: Environment Variables Check
echo "🔧 Test 5: Environment Configuration"
echo "-----------------------------------"
SERVICES=$(echo "$HEALTH_RESPONSE" | jq '.services' 2>/dev/null || echo "Could not parse services")
echo "Available Services:"
echo "$SERVICES"
echo ""

# Test 6: Admin Routes Availability
echo "🛡️  Test 6: Admin Routes (publicly accessible endpoints)"
echo "------------------------------------------------------"
echo "Testing supplier registration endpoint..."
curl -s -o /dev/null -w "Status: %{http_code}" "$RAILWAY_URL/api/admin/supplier-requests"
echo ""
echo ""

# Summary
echo "📊 Test Summary"
echo "==============="
echo "1. Health Check: $(curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL/health")"
echo "2. API Docs: $(curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL/api/docs")"
echo "3. Database: $DB_STATUS"
echo ""

# Next Steps
echo "🎯 Next Steps for Full Testing"
echo "=============================="
echo "1. Test admin authentication:"
echo "   POST $RAILWAY_URL/api/auth/admin-login"
echo "   Body: {\"email\":\"your-admin@domain.com\",\"deviceId\":\"test\",\"appVersion\":\"1.0\"}"
echo ""
echo "2. Test supplier registration:"
echo "   POST $RAILWAY_URL/api/admin/supplier-requests"
echo "   Body: {\"companyName\":\"Test Co\",\"email\":\"test@test.com\",\"servicesOffered\":[\"heating_oil_delivery\"]}"
echo ""
echo "3. Test admin dashboard:"
echo "   GET $RAILWAY_URL/api/admin/dashboard"
echo "   Header: Authorization: Bearer YOUR_JWT_TOKEN"
echo ""

echo "✅ Basic production tests complete!"
echo "🔗 View full API: $RAILWAY_URL/api/docs"
echo "📊 Admin Dashboard: Open your iOS app and login as admin"