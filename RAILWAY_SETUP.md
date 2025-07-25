# Railway Production Deployment Setup

## Required Environment Variables

To deploy SmartHeat Backend to Railway, you MUST configure these environment variables in the Railway dashboard:

### Critical (Required for deployment)
```bash
NODE_ENV=production
OPENWEATHER_API_KEY=your_actual_api_key
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/smartheat
JWT_SECRET=your_32_character_minimum_secret_here
```

### Recommended (for full functionality)
```bash
FRED_API_KEY=your_fred_api_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
EIA_API_KEY=your_eia_api_key
```

### Optional (for enhanced features)
```bash
EMAIL_USER=notifications@smartheat.app
EMAIL_PASS=your_app_password
LOG_LEVEL=info
```

## How to Set Environment Variables in Railway

1. Go to your Railway project dashboard
2. Click on your backend service
3. Go to the "Variables" tab
4. Add each environment variable above
5. Click "Deploy" to redeploy with new variables

## API Keys Setup Guide

### 1. OpenWeather API (Required)
- Sign up at: https://openweathermap.org/api
- Get free API key (1000 calls/day)
- Add to Railway as: `OPENWEATHER_API_KEY`

### 2. MongoDB Atlas (Required)
- Sign up at: https://www.mongodb.com/atlas
- Create free cluster
- Get connection string
- Add to Railway as: `MONGODB_URI`

### 3. FRED API (Market Data)
- Sign up at: https://fred.stlouisfed.org/docs/api/api_key.html
- Get free API key
- Add to Railway as: `FRED_API_KEY`

### 4. Alpha Vantage (Market Data)
- Sign up at: https://www.alphavantage.co/support/#api-key
- Get free API key (5 calls/minute)
- Add to Railway as: `ALPHA_VANTAGE_API_KEY`

## Deployment Status

Without proper environment variables, the deployment will fail with:
```
Missing required environment variables: OPENWEATHER, MONGODB_URI, JWT_SECRET
```

Once configured correctly, you'll see:
```
✅ All required API keys loaded successfully
✅ Connected to MongoDB
🚀 SmartHeat Backend API Server running on port 8080
```

## Testing the Deployment

After setting environment variables and redeploying:

1. Check health: `https://your-railway-url.railway.app/health`
2. View API docs: `https://your-railway-url.railway.app/api/docs`
3. Test weather API: `https://your-railway-url.railway.app/api/weather/current?zip=02101`

## Security Notes

- **Never commit .env files to git**
- **Use strong JWT secrets (32+ characters)**
- **Use app-specific passwords for email**
- **Regularly rotate API keys**