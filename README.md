# SmartHeat Backend API

Privacy-compliant backend API for the SmartHeat iOS app - a community-driven heating oil management platform.

## 🚀 Features

### Core APIs
- **Weather Intelligence**: Enhanced weather data with heating-specific insights
- **Market Intelligence**: Real-time oil prices with regional analysis
- **Community Suppliers**: Privacy-compliant supplier sharing platform
- **Analytics**: Anonymous consumption analytics and benchmarking
- **Authentication**: Anonymous user management with JWT tokens

### Privacy & Compliance
- **GDPR/CCPA Compliant**: Explicit consent for all data collection
- **Anonymous by Design**: No personal identifiers stored
- **Regional Aggregation**: ZIP code prefixes only for privacy
- **Data Minimization**: Only essential data collected
- **Right to Deletion**: Complete data removal on request

### Production Features
- **Security**: Helmet.js, CORS, rate limiting, input validation
- **Performance**: Multi-level caching, compression, optimized queries
- **Monitoring**: Winston logging, health checks, metrics
- **Scalability**: Modular architecture, environment-based configuration

## 📋 API Endpoints

### Weather API
```
GET /api/weather/current/:zipCode     - Enhanced current weather with heating intelligence
GET /api/weather/forecast/:zipCode    - Forecast with heating consumption predictions
```

### Market Intelligence API
```
GET /api/market/oil-prices           - Current oil prices with market context
GET /api/market/regional-pricing/:zipCode - Regional pricing analysis
GET /api/market/trends               - Market trends and recommendations
```

### Community Suppliers API
```
GET /api/community/suppliers         - Get community suppliers (privacy-filtered)
POST /api/community/suppliers        - Add supplier (requires consent)
POST /api/community/suppliers/invite - Send supplier invitation
GET /api/community/stats             - Community statistics
POST /api/community/report           - Report supplier issues
GET /api/community/activity          - Recent community activity
```

### Analytics API
```
POST /api/analytics/consumption      - Submit anonymous consumption data
GET /api/analytics/insights/:zipCode - Regional market insights
GET /api/analytics/benchmarks/:zipCode - Consumption benchmarks
GET /api/analytics/efficiency-tips/:zipCode - Personalized efficiency tips
```

### Authentication API
```
POST /api/auth/register              - Register anonymous user device
POST /api/auth/verify                - Verify and refresh token
POST /api/auth/privacy-settings      - Update privacy settings
DELETE /api/auth/account             - Delete anonymous account
```

### System API
```
GET /health                          - System health check
GET /api/docs                        - API documentation
```

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 18+ 
- npm 9+
- MongoDB (for production)
- API keys for external services

### Local Development
```bash
# Clone and install dependencies
cd backend
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env

# Create logs directory
mkdir logs

# Start development server
npm run dev
```

### Environment Variables

**Required:**
- `OPENWEATHER_API_KEY` - OpenWeather API key
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret (32+ characters)

**Optional:**
- `FRED_API_KEY` - Federal Reserve Economic Data API
- `ALPHA_VANTAGE_API_KEY` - Alpha Vantage API
- `EMAIL_USER` / `EMAIL_PASS` - For supplier invitations
- `ADMIN_KEY` - Admin access key

### API Keys Setup

1. **OpenWeather API** (Required)
   - Sign up at https://openweathermap.org/api
   - Get free API key
   - Add to `OPENWEATHER_API_KEY`

2. **FRED API** (Recommended)
   - Register at https://fred.stlouisfed.org/docs/api/
   - Free API key for economic data
   - Add to `FRED_API_KEY`

3. **Alpha Vantage** (Fallback)
   - Get key at https://www.alphavantage.co/support/#api-key
   - Free tier available
   - Add to `ALPHA_VANTAGE_API_KEY`

## 🚀 Deployment

### Railway Deployment (Recommended)

1. **Prepare for deployment:**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init
```

2. **Configure environment variables:**
```bash
# Set required variables
railway variables set OPENWEATHER_API_KEY=your_key_here
railway variables set MONGODB_URI=your_mongodb_uri
railway variables set JWT_SECRET=your_super_secure_secret_32_chars_plus
railway variables set NODE_ENV=production

# Set optional variables
railway variables set FRED_API_KEY=your_fred_key
railway variables set EMAIL_USER=your_email@gmail.com
railway variables set EMAIL_PASS=your_app_password
```

3. **Deploy:**
```bash
railway up
```

### Manual Deployment

1. **Prepare production build:**
```bash
npm install --production
```

2. **Set environment variables on your server**

3. **Start production server:**
```bash
npm start
```

## 🔒 Privacy & Security

### Data Protection
- **No Personal Data**: Only anonymous device IDs and regional data
- **Consent-Based**: All data collection requires explicit user consent
- **Encrypted Storage**: Sensitive data encrypted at rest
- **Secure Transit**: HTTPS-only communication
- **Rate Limited**: Protection against abuse

### Compliance Features
- **GDPR Article 7**: Explicit consent mechanism
- **GDPR Article 17**: Right to deletion (account deletion)
- **GDPR Article 20**: Data portability (JSON export)
- **Privacy by Design**: Minimal data collection
- **Data Retention**: Automatic cleanup of inactive accounts

### Security Headers
```javascript
Content-Security-Policy: default-src 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

## 📊 Monitoring & Logging

### Health Monitoring
- **Health Endpoint**: `/health` with detailed system status
- **Service Checks**: API connectivity, database status
- **Performance Metrics**: Cache hit rates, response times
- **Error Tracking**: Structured error logging

### Logging Levels
- **Error**: System errors, API failures
- **Warn**: Rate limiting, invalid requests
- **Info**: Successful operations, user actions
- **Debug**: Detailed request/response data

### Log Files
```
logs/error.log     - Error-level logs only
logs/combined.log  - All log levels
```

## 🧪 Testing

### Run Tests
```bash
npm test
```

### API Testing
```bash
# Health check
curl https://your-api-url/health

# Weather API
curl https://your-api-url/api/weather/current/10001

# Market data
curl https://your-api-url/api/market/oil-prices
```

## 📈 Performance

### Caching Strategy
- **Weather Data**: 10-minute cache
- **Market Prices**: 30-minute cache
- **Regional Data**: 1-hour cache
- **Analytics**: 4-hour cache

### Rate Limiting
- **Authentication**: 5 requests/15 minutes
- **Community APIs**: 100 requests/15 minutes
- **General APIs**: 200 requests/15 minutes

### Database Optimization
- **Indexed Queries**: Optimized for common access patterns
- **Connection Pooling**: Efficient database connections
- **Data Aggregation**: Pre-computed analytics

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Make changes and test
4. Commit with clear messages
5. Push and create pull request

### Code Style
- ESLint configuration included
- Prettier for formatting
- JSDoc comments for functions
- Error handling for all async operations

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

### Common Issues

**API Key Errors:**
- Verify all required environment variables are set
- Check API key validity and quotas
- Ensure proper format (no extra spaces/quotes)

**CORS Errors:**
- Update `ALLOWED_ORIGINS` in environment
- Check frontend URL matches exactly

**Database Connection:**
- Verify MongoDB URI format
- Check network connectivity
- Ensure IP whitelist includes deployment server

### Getting Help
- Check logs in `logs/` directory
- Use health endpoint for system status
- Review environment variable configuration

---

**SmartHeat Backend API v2.0.0**  
Privacy-compliant heating oil management platform  
Built with Express.js, MongoDB, and lots of ❤️