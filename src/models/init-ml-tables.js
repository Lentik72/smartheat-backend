// Initialize ML database tables
const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

async function initializeMLTables(sequelize) {
    if (!sequelize) {
        console.log('No database connection available for ML tables');
        return false;
    }

    try {
        // Read the SQL schema file
        const schemaPath = path.join(__dirname, 'ml-schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Execute the schema
        await sequelize.query(schema);
        
        console.log('✅ ML database tables initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize ML tables:', error);
        
        // If tables already exist, that's fine
        if (error.message.includes('already exists')) {
            console.log('ℹ️  ML tables already exist');
            return true;
        }
        
        return false;
    }
}

// Function to seed initial ML data
async function seedMLData(sequelize) {
    if (!sequelize) return false;

    try {
        // Check if we already have model deployments
        const [results] = await sequelize.query(
            'SELECT COUNT(*) as count FROM model_deployments'
        );
        
        if (results[0].count > 0) {
            console.log('ℹ️  ML seed data already exists');
            return true;
        }

        // Insert initial model deployment record
        await sequelize.query(`
            INSERT INTO model_deployments (
                model_version,
                model_type,
                deployment_date,
                is_active,
                model_path,
                model_size_mb,
                training_metrics,
                validation_metrics,
                hyperparameters
            ) VALUES (
                '1.0.0-simple',
                'linear_regression',
                NOW(),
                true,
                'memory',
                0.1,
                '{"mae": 2.1, "rmse": 3.2, "r2": 0.82}',
                '{"mae": 2.3, "rmse": 3.5, "r2": 0.79}',
                '{"learning_rate": 0.01, "features": 5}'
            )
        `);

        console.log('✅ ML seed data inserted successfully');
        return true;
    } catch (error) {
        console.error('❌ Failed to seed ML data:', error);
        return false;
    }
}

module.exports = {
    initializeMLTables,
    seedMLData
};