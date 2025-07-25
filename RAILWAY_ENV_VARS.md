# Railway Environment Variables Setup

## 🔴 **REQUIRED Variables**
These must be set for the app to function:

```bash
# Admin System
ADMIN_EMAIL=your-admin-email@domain.com
ADMIN_EMAIL_2=optional-second-admin@domain.com

# Security
JWT_SECRET=your-jwt-secret-key-min-32-chars
NODE_ENV=production

# External APIs
OPENWEATHER_API_KEY=your-openweather-api-key

# Database (Auto-provided by Railway PostgreSQL service)
DATABASE_URL=postgresql://... (automatically set by Railway)
```

## 🟡 **OPTIONAL Variables**
These enhance functionality but aren't required:

```bash
# Market Data APIs
FRED_API_KEY=your-fred-api-key
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-key
EIA_API_KEY=your-eia-api-key

# Email Notifications
EMAIL_USER=your-smtp-email@domain.com
EMAIL_PASS=your-smtp-password

# Logging
LOG_LEVEL=info
```

## 🚀 **Quick Setup Commands**

```bash
# Essential setup (minimum viable deployment)
railway variables set ADMIN_EMAIL=admin@yourdomain.com
railway variables set JWT_SECRET=$(openssl rand -base64 32)
railway variables set OPENWEATHER_API_KEY=your-key-here
railway variables set NODE_ENV=production

# Verify setup
railway variables list

# Deploy
railway up
```

## ✅ **Verification Steps**

After deployment, verify:

1. **Health Check**: `https://your-app.railway.app/health`
2. **API Docs**: `https://your-app.railway.app/api/docs`
3. **Admin Routes**: `https://your-app.railway.app/api/admin/health`
4. **Database**: Check logs for "✅ Connected to PostgreSQL database"

## 🔧 **Troubleshooting**

**If deployment fails:**
```bash
# Check logs
railway logs

# Check environment
railway variables

# Test locally first
railway run npm start
```