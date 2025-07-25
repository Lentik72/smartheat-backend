// server.js - Entry point for SmartHeat Backend API
// This file maintains backwards compatibility while using the new modular structure

// Load environment variables
require('dotenv').config();

// Import the new modular server
const app = require('./src/server.js');

// Use environment PORT or default to 8080 for Railway
const PORT = process.env.PORT || 8080;

// The actual server is started in src/server.js
// This file exists for deployment compatibility

console.log('🚀 SmartHeat Backend API v2.0.0');
console.log('📍 Entry point: server.js -> src/server.js');
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📡 Port: ${PORT}`);

// Export for testing purposes
module.exports = app;