#!/bin/bash
# Automated Railway Deployment Script
# Run this after: railway login && railway link

set -e  # Exit on any error

echo "🚀 Automated SmartHeat Railway Deployment"
echo "========================================"

# Check if logged in
if ! railway whoami >/dev/null 2>&1; then
    echo "❌ Not logged into Railway. Please run:"
    echo "   railway login"
    exit 1
fi

# Check if linked to project
if ! railway status >/dev/null 2>&1; then
    echo "❌ Not linked to Railway project. Please run:"
    echo "   railway link"
    exit 1
fi

echo "✅ Railway authentication verified"

# Set environment variables
echo ""
echo "📋 Setting environment variables..."

# Generate secure JWT secret
JWT_SECRET=$(openssl rand -base64 32)
railway variables set JWT_SECRET="$JWT_SECRET"
echo "✅ JWT_SECRET set (generated securely)"

# Set production environment
railway variables set NODE_ENV=production
echo "✅ NODE_ENV set to production"

# Set admin email (you can customize this)
read -p "Enter your admin email: " ADMIN_EMAIL
railway variables set ADMIN_EMAIL="$ADMIN_EMAIL"
echo "✅ ADMIN_EMAIL set to $ADMIN_EMAIL"

# Set OpenWeather API key
read -p "Enter your OpenWeather API key (or press enter to skip): " OPENWEATHER_KEY
if [ ! -z "$OPENWEATHER_KEY" ]; then
    railway variables set OPENWEATHER_API_KEY="$OPENWEATHER_KEY"
    echo "✅ OPENWEATHER_API_KEY set"
else
    echo "⚠️  OPENWEATHER_API_KEY skipped (required for full functionality)"
fi

# Optional: Set other API keys
read -p "Enter FRED API key (optional, press enter to skip): " FRED_KEY
if [ ! -z "$FRED_KEY" ]; then
    railway variables set FRED_API_KEY="$FRED_KEY"
    echo "✅ FRED_API_KEY set"
fi

# Add PostgreSQL if not already added
echo ""
echo "🗄️  Setting up database..."
if ! railway variables | grep -q DATABASE_URL; then
    echo "Adding PostgreSQL service..."
    railway add postgresql
    echo "✅ PostgreSQL added"
else
    echo "✅ PostgreSQL already configured"
fi

# Deploy
echo ""
echo "🚀 Deploying application..."
railway up

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Check deployment: railway status"
echo "2. View logs: railway logs"
echo "3. Test your app: ./test-production.sh"
echo "4. View dashboard: railway open"

# Show final status
echo ""
echo "📊 Final Status:"
railway status