# SmartHeat ML Prediction Architecture

## Overview
SmartHeat's ML system predicts heating oil consumption using a hybrid approach combining traditional time-series analysis with machine learning models, optimized for deployment on Railway with PostgreSQL.

## Architecture Components

### 1. Data Collection Layer
```
iOS App → API → PostgreSQL → Feature Store
```

#### Data Points Collected:
- **Tank Readings**: Level %, timestamp, manual/automatic flag
- **Delivery History**: Date, gallons, price, supplier
- **Weather Data**: Temperature, degree days, forecast
- **User Profile**: Home size, tank size, heating system type
- **Usage Context**: Occupancy patterns, thermostat settings

### 2. Feature Engineering Pipeline

#### Temporal Features:
- Hour of day, day of week, month, season
- Days since last delivery
- Rolling averages (7-day, 30-day, seasonal)
- Lag features (t-1, t-7, t-30)

#### Weather Features:
- Heating Degree Days (HDD)
- Temperature differentials
- Wind chill factor
- Forecast-based adjustments

#### Consumption Features:
- Daily burn rate
- Gallons per degree day
- Usage volatility
- Trend indicators

#### External Features:
- Market prices (trends)
- Regional consumption patterns
- Holiday/event adjustments

### 3. Model Architecture

#### Ensemble Approach:
```
┌─────────────────┐
│   Input Data    │
└────────┬────────┘
         │
    ┌────▼────┐
    │Feature   │
    │Pipeline  │
    └────┬────┘
         │
    ┌────▼─────────────────────────┐
    │                               │
    ▼               ▼               ▼
┌────────┐    ┌────────┐    ┌────────┐
│Linear  │    │Random  │    │Neural  │
│Regress.│    │Forest  │    │Network │
└────┬───┘    └───┬────┘    └───┬────┘
     │            │              │
     └────────────┼──────────────┘
                  │
            ┌─────▼─────┐
            │ Ensemble  │
            │ Predictor │
            └─────┬─────┘
                  │
            ┌─────▼─────┐
            │  Output   │
            │Prediction │
            └───────────┘
```

#### Model Components:

**1. Linear Regression (Baseline)**
- Simple, interpretable
- Captures linear relationships
- Fast inference

**2. Random Forest**
- Handles non-linear patterns
- Feature importance analysis
- Robust to outliers

**3. LSTM Neural Network**
- Captures temporal dependencies
- Learns complex patterns
- Seasonal awareness

**4. Ensemble Weighting**
- Dynamic weight adjustment based on:
  - Recent accuracy
  - Data availability
  - Confidence scores

### 4. Training Pipeline

```python
# Pseudo-code for training pipeline
class MLTrainingPipeline:
    def train_models(self):
        # 1. Data preparation
        data = self.fetch_training_data()
        features = self.engineer_features(data)
        X_train, X_val, y_train, y_val = self.split_data(features)
        
        # 2. Train individual models
        linear_model = self.train_linear(X_train, y_train)
        rf_model = self.train_random_forest(X_train, y_train)
        lstm_model = self.train_lstm(X_train, y_train)
        
        # 3. Optimize ensemble weights
        weights = self.optimize_weights(
            [linear_model, rf_model, lstm_model],
            X_val, y_val
        )
        
        # 4. Save models
        self.save_models(linear_model, rf_model, lstm_model, weights)
```

### 5. Prediction API

#### Endpoints:

**POST /api/predictions/consumption**
```json
Request:
{
  "userId": "uuid",
  "currentTankLevel": 0.45,
  "includeWeather": true,
  "forecastDays": 30
}

Response:
{
  "prediction": {
    "daysUntilEmpty": 18,
    "dailyUsageGallons": 3.2,
    "confidenceScore": 0.85,
    "reorderDate": "2025-09-10",
    "optimalOrderQuantity": 150
  },
  "factors": {
    "weatherImpact": "High - cold front approaching",
    "usagePattern": "Increasing",
    "seasonalAdjustment": 1.15
  },
  "recommendations": [
    "Order soon - prices expected to rise",
    "Consider scheduling delivery for next week"
  ]
}
```

**GET /api/predictions/analytics**
```json
Response:
{
  "historicalAccuracy": 0.88,
  "avgPredictionError": 2.3,
  "usagePatterns": {
    "weekly": [3.1, 3.2, 3.0, 2.9, 3.3, 3.5, 3.2],
    "monthly": [95, 88, 72, 45, 31, 28, 30, 38, 55, 78, 92, 98]
  },
  "insights": [
    "Your usage is 15% lower than similar homes",
    "Weekend usage is 10% higher than weekdays"
  ]
}
```

### 6. Database Schema

```sql
-- Historical consumption data
CREATE TABLE consumption_history (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    date DATE NOT NULL,
    gallons_used DECIMAL(10,2),
    tank_level_start DECIMAL(5,2),
    tank_level_end DECIMAL(5,2),
    avg_temperature DECIMAL(5,2),
    heating_degree_days DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ML model predictions
CREATE TABLE predictions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    prediction_date TIMESTAMP NOT NULL,
    predicted_days_left INTEGER,
    predicted_daily_usage DECIMAL(10,2),
    confidence_score DECIMAL(3,2),
    model_version VARCHAR(20),
    actual_days_left INTEGER, -- for accuracy tracking
    actual_usage DECIMAL(10,2), -- for accuracy tracking
    created_at TIMESTAMP DEFAULT NOW()
);

-- Feature store for ML
CREATE TABLE ml_features (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    feature_date DATE NOT NULL,
    feature_set JSONB NOT NULL, -- Stores all engineered features
    created_at TIMESTAMP DEFAULT NOW()
);

-- Model performance metrics
CREATE TABLE model_metrics (
    id UUID PRIMARY KEY,
    model_version VARCHAR(20),
    metric_type VARCHAR(50), -- 'mae', 'rmse', 'r2', etc.
    metric_value DECIMAL(10,4),
    evaluation_date TIMESTAMP,
    data_points INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 7. Implementation Phases

#### Phase 1: Foundation (Week 1)
- [ ] Set up database schema
- [ ] Create data collection endpoints
- [ ] Implement basic feature engineering
- [ ] Deploy simple linear regression model

#### Phase 2: ML Enhancement (Week 2)
- [ ] Add Random Forest model
- [ ] Implement ensemble prediction
- [ ] Create prediction API endpoints
- [ ] Add confidence scoring

#### Phase 3: Advanced Features (Week 3)
- [ ] Implement LSTM for time-series
- [ ] Add weather integration
- [ ] Create analytics dashboard
- [ ] Implement alert system

#### Phase 4: Optimization (Week 4)
- [ ] A/B testing framework
- [ ] Model retraining pipeline
- [ ] Performance monitoring
- [ ] User feedback integration

### 8. Technology Stack

**Backend:**
- Node.js (API server)
- Python microservice (ML models)
- PostgreSQL (data storage)
- Redis (caching)

**ML Libraries:**
- TensorFlow.js (for Node.js integration)
- OR Python service with:
  - scikit-learn
  - TensorFlow/PyTorch
  - pandas/numpy

**Deployment:**
- Railway (hosting)
- Docker (containerization)
- GitHub Actions (CI/CD)

### 9. Performance Metrics

**Model Metrics:**
- Mean Absolute Error (MAE) < 2 days
- R² Score > 0.85
- Prediction confidence > 80%

**System Metrics:**
- Prediction latency < 500ms
- Training time < 5 minutes
- Model size < 50MB

### 10. Privacy & Security

- All data anonymized for model training
- User consent required for data usage
- Encrypted model storage
- No PII in prediction logs
- GDPR/CCPA compliant

## Next Steps

1. Review and approve architecture
2. Set up Python ML microservice
3. Implement Phase 1 features
4. Deploy to Railway
5. Begin collecting training data