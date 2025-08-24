-- SmartHeat ML Prediction Database Schema
-- PostgreSQL schema for machine learning features

-- Historical consumption data
CREATE TABLE IF NOT EXISTS consumption_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    date DATE NOT NULL,
    gallons_used DECIMAL(10,2),
    tank_level_start DECIMAL(5,2),
    tank_level_end DECIMAL(5,2),
    avg_temperature DECIMAL(5,2),
    heating_degree_days DECIMAL(5,2),
    occupancy_hours DECIMAL(5,2),
    thermostat_setting DECIMAL(4,1),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- ML model predictions
CREATE TABLE IF NOT EXISTS predictions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    prediction_date TIMESTAMP NOT NULL,
    predicted_days_left INTEGER,
    predicted_daily_usage DECIMAL(10,2),
    predicted_runout_date DATE,
    confidence_score DECIMAL(3,2),
    model_version VARCHAR(20),
    model_type VARCHAR(50), -- 'linear', 'rf', 'lstm', 'ensemble'
    actual_days_left INTEGER, -- for accuracy tracking
    actual_usage DECIMAL(10,2), -- for accuracy tracking
    accuracy_score DECIMAL(3,2), -- calculated after validation
    factors JSONB, -- stores contributing factors
    created_at TIMESTAMP DEFAULT NOW()
);

-- Feature store for ML
CREATE TABLE IF NOT EXISTS ml_features (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    feature_date DATE NOT NULL,
    feature_set JSONB NOT NULL, -- Stores all engineered features
    feature_version VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, feature_date, feature_version)
);

-- Model performance metrics
CREATE TABLE IF NOT EXISTS model_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    model_version VARCHAR(20),
    model_type VARCHAR(50),
    metric_type VARCHAR(50), -- 'mae', 'rmse', 'r2', 'mape'
    metric_value DECIMAL(10,4),
    evaluation_date TIMESTAMP,
    data_points INTEGER,
    training_duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- User consumption patterns
CREATE TABLE IF NOT EXISTS consumption_patterns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    pattern_type VARCHAR(50), -- 'stable', 'increasing', 'decreasing', 'seasonal'
    avg_daily_usage DECIMAL(10,2),
    usage_variance DECIMAL(10,4),
    seasonal_factor JSONB, -- monthly adjustment factors
    weekend_factor DECIMAL(5,3),
    holiday_factor DECIMAL(5,3),
    last_calculated TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Training data queue
CREATE TABLE IF NOT EXISTS training_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    data_type VARCHAR(50), -- 'tank_reading', 'delivery', 'weather'
    data_payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Model deployment history
CREATE TABLE IF NOT EXISTS model_deployments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    model_version VARCHAR(20) UNIQUE,
    model_type VARCHAR(50),
    deployment_date TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    model_path VARCHAR(255),
    model_size_mb DECIMAL(10,2),
    training_metrics JSONB,
    validation_metrics JSONB,
    hyperparameters JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Prediction feedback (for model improvement)
CREATE TABLE IF NOT EXISTS prediction_feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    prediction_id UUID REFERENCES predictions(id),
    user_id UUID NOT NULL,
    feedback_type VARCHAR(50), -- 'accurate', 'too_high', 'too_low'
    actual_outcome DECIMAL(10,2),
    user_comments TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_consumption_history_user_date ON consumption_history(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_user_date ON predictions(user_id, prediction_date DESC);
CREATE INDEX IF NOT EXISTS idx_ml_features_user_date ON ml_features(user_id, feature_date DESC);
CREATE INDEX IF NOT EXISTS idx_training_queue_processed ON training_queue(processed, created_at);
CREATE INDEX IF NOT EXISTS idx_model_metrics_version ON model_metrics(model_version, metric_type);
CREATE INDEX IF NOT EXISTS idx_consumption_patterns_user ON consumption_patterns(user_id);

-- Create update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_consumption_history_updated_at BEFORE UPDATE ON consumption_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_consumption_patterns_updated_at BEFORE UPDATE ON consumption_patterns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();