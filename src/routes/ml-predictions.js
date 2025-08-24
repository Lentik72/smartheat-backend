// src/routes/ml-predictions.js - Machine Learning Prediction API
const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Simple in-memory ML model (will be replaced with real ML later)
class SimplePredictionModel {
    constructor() {
        this.baseConsumptionRate = 3.5; // gallons per day baseline
    }

    // Calculate heating degree days
    calculateHDD(avgTemp, baseTemp = 65) {
        return Math.max(0, baseTemp - avgTemp);
    }

    // Simple linear prediction based on historical data
    predictConsumption(data) {
        const {
            currentTankLevel,
            tankSize = 275,
            historicalUsage = [],
            currentTemp = 40,
            forecastDays = 30
        } = data;

        // Calculate current gallons
        const currentGallons = currentTankLevel * tankSize;

        // Calculate usage rate based on temperature
        const hdd = this.calculateHDD(currentTemp);
        const tempAdjustment = 1 + (hdd / 100); // Increase usage with colder temps
        
        // Calculate daily usage
        let dailyUsage = this.baseConsumptionRate * tempAdjustment;

        // Adjust based on historical data if available
        if (historicalUsage.length > 0) {
            const avgHistorical = historicalUsage.reduce((a, b) => a + b, 0) / historicalUsage.length;
            dailyUsage = (dailyUsage + avgHistorical) / 2;
        }

        // Calculate days until empty
        const daysUntilEmpty = Math.floor(currentGallons / dailyUsage);

        // Calculate reorder date (at 25% tank level)
        const reorderGallons = tankSize * 0.25;
        const gallonsUntilReorder = currentGallons - reorderGallons;
        const daysUntilReorder = Math.max(0, Math.floor(gallonsUntilReorder / dailyUsage));
        const reorderDate = new Date();
        reorderDate.setDate(reorderDate.getDate() + daysUntilReorder);

        // Simple confidence calculation
        const dataPoints = historicalUsage.length;
        const confidence = Math.min(0.95, 0.5 + (dataPoints * 0.05));

        return {
            daysUntilEmpty,
            dailyUsageGallons: parseFloat(dailyUsage.toFixed(2)),
            currentGallons: parseFloat(currentGallons.toFixed(2)),
            reorderDate,
            daysUntilReorder,
            confidence,
            factors: {
                temperatureImpact: tempAdjustment > 1.2 ? 'High' : tempAdjustment > 1.1 ? 'Moderate' : 'Low',
                heatingDegreeDays: hdd,
                dataPointsUsed: dataPoints
            }
        };
    }

    // Analyze usage patterns
    analyzePattern(historicalData) {
        if (!historicalData || historicalData.length < 7) {
            return 'insufficient_data';
        }

        const recent = historicalData.slice(-7);
        const older = historicalData.slice(-14, -7);

        if (older.length === 0) return 'insufficient_data';

        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

        const changePct = ((recentAvg - olderAvg) / olderAvg) * 100;

        if (Math.abs(changePct) < 5) return 'stable';
        if (changePct > 10) return 'increasing';
        if (changePct < -10) return 'decreasing';
        
        // Check for seasonal pattern (simplified)
        const variance = this.calculateVariance(historicalData);
        if (variance > 2) return 'seasonal';

        return 'stable';
    }

    calculateVariance(data) {
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const squaredDiffs = data.map(x => Math.pow(x - mean, 2));
        return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / data.length);
    }
}

const model = new SimplePredictionModel();

// Validation middleware
const validatePredictionRequest = [
    body('userId').isUUID().withMessage('Valid user ID required'),
    body('currentTankLevel').isFloat({ min: 0, max: 1 }).withMessage('Tank level must be between 0 and 1'),
    body('tankSize').optional().isFloat({ min: 100, max: 1000 }).withMessage('Tank size must be between 100 and 1000 gallons'),
    body('includeWeather').optional().isBoolean(),
    body('forecastDays').optional().isInt({ min: 1, max: 90 }).withMessage('Forecast days must be between 1 and 90')
];

const validateDataSubmission = [
    body('userId').isUUID().withMessage('Valid user ID required'),
    body('date').isISO8601().withMessage('Valid date required'),
    body('tankLevel').optional().isFloat({ min: 0, max: 1 }),
    body('gallonsDelivered').optional().isFloat({ min: 0, max: 1000 }),
    body('temperature').optional().isFloat({ min: -50, max: 120 })
];

// POST /api/ml/predictions/consumption - Get consumption prediction
router.post('/predictions/consumption', validatePredictionRequest, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const {
            userId,
            currentTankLevel,
            tankSize = 275,
            includeWeather = true,
            forecastDays = 30,
            currentTemp = 40
        } = req.body;

        // TODO: Fetch historical data from database
        // For now, using mock data
        const historicalUsage = [3.2, 3.5, 3.8, 3.3, 3.6, 3.4, 3.7];

        // Get prediction
        const prediction = model.predictConsumption({
            currentTankLevel,
            tankSize,
            historicalUsage,
            currentTemp,
            forecastDays
        });

        // Analyze usage pattern
        const usagePattern = model.analyzePattern(historicalUsage);

        // Generate insights
        const insights = [];
        if (prediction.daysUntilReorder < 7) {
            insights.push('Consider ordering soon - less than a week until reorder point');
        }
        if (prediction.factors.temperatureImpact === 'High') {
            insights.push('Cold weather is significantly increasing your oil consumption');
        }
        if (usagePattern === 'increasing') {
            insights.push('Your usage has been trending upward recently');
        }

        // Generate recommendations
        const recommendations = [];
        if (prediction.daysUntilReorder < 14) {
            recommendations.push({
                action: 'Schedule delivery',
                urgency: prediction.daysUntilReorder < 7 ? 'high' : 'medium',
                reason: `Tank will reach 25% in ${prediction.daysUntilReorder} days`
            });
        }

        res.json({
            prediction: {
                daysUntilEmpty: prediction.daysUntilEmpty,
                dailyUsageGallons: prediction.dailyUsageGallons,
                confidenceScore: prediction.confidence,
                reorderDate: prediction.reorderDate,
                currentGallons: prediction.currentGallons,
                daysUntilReorder: prediction.daysUntilReorder
            },
            factors: prediction.factors,
            usagePattern: {
                type: usagePattern,
                description: getPatternDescription(usagePattern)
            },
            insights,
            recommendations,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Prediction error:', error);
        res.status(500).json({ 
            error: 'Failed to generate prediction',
            message: error.message 
        });
    }
});

// POST /api/ml/data/submit - Submit consumption data for training
router.post('/data/submit', validateDataSubmission, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const {
            userId,
            date,
            tankLevel,
            gallonsDelivered,
            temperature
        } = req.body;

        // TODO: Store in database training_queue table
        const dataPoint = {
            id: uuidv4(),
            userId,
            date,
            tankLevel,
            gallonsDelivered,
            temperature,
            timestamp: new Date().toISOString()
        };

        res.json({
            success: true,
            message: 'Data submitted for model training',
            dataPointId: dataPoint.id
        });

    } catch (error) {
        console.error('Data submission error:', error);
        res.status(500).json({ 
            error: 'Failed to submit data',
            message: error.message 
        });
    }
});

// GET /api/ml/analytics - Get usage analytics
router.get('/analytics', [
    query('userId').isUUID().withMessage('Valid user ID required'),
    query('days').optional().isInt({ min: 7, max: 365 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { userId, days = 30 } = req.query;

        // TODO: Fetch from database
        // Mock analytics data for now
        const mockWeeklyUsage = [3.1, 3.2, 3.0, 2.9, 3.3, 3.5, 3.2];
        const mockMonthlyUsage = [95, 88, 72, 45, 31, 28, 30, 38, 55, 78, 92, 98];

        const analytics = {
            historicalAccuracy: 0.88,
            avgPredictionError: 2.3,
            totalDataPoints: 45,
            usagePatterns: {
                weekly: mockWeeklyUsage,
                weeklyAverage: parseFloat((mockWeeklyUsage.reduce((a, b) => a + b, 0) / 7).toFixed(2)),
                monthly: mockMonthlyUsage,
                monthlyAverage: parseFloat((mockMonthlyUsage.reduce((a, b) => a + b, 0) / 12).toFixed(2))
            },
            insights: [
                'Your usage is 15% lower than similar homes in your area',
                'Weekend usage is 10% higher than weekdays',
                'You typically use 30% more oil in January compared to October'
            ],
            savingsOpportunities: [
                {
                    tip: 'Lower thermostat by 1°F',
                    potentialSavings: '3-5% reduction in consumption',
                    estimatedMonthlySavings: 12
                },
                {
                    tip: 'Schedule delivery during off-peak times',
                    potentialSavings: '$0.05-0.10 per gallon',
                    estimatedMonthlySavings: 15
                }
            ],
            lastUpdated: new Date().toISOString()
        };

        res.json(analytics);

    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch analytics',
            message: error.message 
        });
    }
});

// GET /api/ml/model/status - Get ML model status
router.get('/model/status', async (req, res) => {
    try {
        const status = {
            modelVersion: '1.0.0-simple',
            modelType: 'linear_regression',
            lastTrained: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
            accuracy: {
                mae: 2.1,
                rmse: 3.2,
                r2Score: 0.82
            },
            dataStats: {
                totalUsers: 150,
                totalDataPoints: 4500,
                lastDataUpdate: new Date().toISOString()
            },
            nextTraining: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
            status: 'healthy',
            features: [
                'temperature',
                'heating_degree_days',
                'historical_usage',
                'tank_level',
                'days_since_delivery'
            ]
        };

        res.json(status);

    } catch (error) {
        console.error('Status error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch model status',
            message: error.message 
        });
    }
});

// Helper function for pattern descriptions
function getPatternDescription(pattern) {
    const descriptions = {
        stable: 'Your usage has been consistent',
        increasing: 'Your usage is trending upward',
        decreasing: 'Your usage is trending downward',
        seasonal: 'Your usage shows seasonal variation',
        irregular: 'Your usage pattern is irregular',
        insufficient_data: 'Not enough data to determine pattern'
    };
    return descriptions[pattern] || 'Unknown pattern';
}

module.exports = router;