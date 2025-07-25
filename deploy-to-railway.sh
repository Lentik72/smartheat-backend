#!/bin/bash
# SmartHeat Backend Railway Deployment Script

echo "🚂 SmartHeat Railway Deployment Guide"
echo "====================================="

# Step 1: Login and Connect
echo ""
echo "📋 Step 1: Login and Connect to Railway"
echo "---------------------------------------"
echo "Run these commands in your terminal:"
echo ""
echo "1. Login to Railway:"
echo "   railway login"
echo ""
echo "2. Connect to your project (or create new):"
echo "   railway init  # If creating new project"
echo "   # OR"
echo "   railway link  # If connecting to existing project"
echo ""

# Step 2: Environment Variables
echo "📋 Step 2: Set Environment Variables"
echo "-----------------------------------"
echo "Run these commands to set required environment variables:"
echo ""

# Required variables
echo "# REQUIRED VARIABLES"
echo "railway variables set ADMIN_EMAIL=your-admin-email@domain.com"
echo "railway variables set JWT_SECRET=\$(openssl rand -base64 32)"
echo "railway variables set NODE_ENV=production"

# Get API key from user
echo ""
echo "# Get your OpenWeather API key from: https://openweathermap.org/api"
echo "railway variables set OPENWEATHER_API_KEY=your-openweather-api-key"

echo ""
echo "# OPTIONAL VARIABLES (enhance functionality)"
echo "railway variables set FRED_API_KEY=your-fred-api-key"
echo "railway variables set ALPHA_VANTAGE_API_KEY=your-alpha-vantage-key"
echo "railway variables set EIA_API_KEY=your-eia-api-key"
echo "railway variables set EMAIL_USER=your-smtp-email@domain.com"
echo "railway variables set EMAIL_PASS=your-smtp-password"
echo "railway variables set LOG_LEVEL=info"

echo ""
echo "# Verify variables are set:"
echo "railway variables"

# Step 3: Database Setup
echo ""
echo "📋 Step 3: Add PostgreSQL Database"
echo "---------------------------------"
echo "1. Add PostgreSQL service:"
echo "   railway add postgresql"
echo ""
echo "2. DATABASE_URL will be automatically set by Railway"
echo ""

# Step 4: Deploy
echo "📋 Step 4: Deploy Application"
echo "----------------------------"
echo "1. Deploy from current directory:"
echo "   railway up"
echo ""
echo "2. Or connect to GitHub for auto-deployment:"
echo "   railway service connect"
echo ""

# Step 5: Verify
echo "📋 Step 5: Verify Deployment"
echo "----------------------------"
echo "1. Check deployment status:"
echo "   railway status"
echo ""
echo "2. View logs:"
echo "   railway logs"
echo ""
echo "3. Test health endpoint:"
echo "   curl https://your-app.railway.app/health"
echo ""
echo "4. Test API documentation:"
echo "   curl https://your-app.railway.app/api/docs"
echo ""

# Environment Check
echo "📋 Environment Variables Checklist"
echo "===================================="
echo "✅ ADMIN_EMAIL - Your admin email address"
echo "✅ JWT_SECRET - Secure random string (32+ chars)"
echo "✅ NODE_ENV - Set to 'production'"
echo "✅ OPENWEATHER_API_KEY - Weather data API key"
echo "✅ DATABASE_URL - Automatically set by Railway PostgreSQL"
echo ""
echo "Optional but recommended:"
echo "⭕ FRED_API_KEY - Economic data"
echo "⭕ ALPHA_VANTAGE_API_KEY - Market data"
echo "⭕ EIA_API_KEY - Energy data"
echo "⭕ EMAIL_USER/EMAIL_PASS - Email notifications"
echo ""

echo "🎉 Your SmartHeat backend is ready for Railway deployment!"
echo ""
echo "📖 For detailed instructions, see: backend/RAILWAY_ENV_VARS.md"
echo "🔗 Railway Dashboard: https://railway.app/dashboard"