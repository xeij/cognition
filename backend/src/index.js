const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const factsRoutes = require('./routes/facts');
const usersRoutes = require('./routes/users');
const recommendationsRoutes = require('./routes/recommendations');
const interactionsRoutes = require('./routes/interactions');
const searchRoutes = require('./routes/search');
const categoriesRoutes = require('./routes/categories');

const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { connectToAWS } = require('./config/aws');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // Default 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Default 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting conditionally based on environment
if (process.env.ENABLE_RATE_LIMITING !== 'false') {
  app.use('/api/', limiter);
  logger.info(`Rate limiting enabled: ${limiter.max} requests per ${limiter.windowMs}ms`);
} else {
  logger.info('Rate limiting disabled');
}

// Body parsing middleware
const maxRequestSize = process.env.MAX_REQUEST_SIZE || '10mb';
app.use(express.json({ limit: maxRequestSize }));
app.use(express.urlencoded({ extended: true, limit: maxRequestSize }));

// Compression
app.use(compression());

// CORS
const corsOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : (process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.com'] 
    : ['http://localhost:19006', 'http://localhost:3000']);

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// Logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/facts', factsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/interactions', interactionsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/categories', categoriesRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use(errorHandler);

// Initialize AWS connection
connectToAWS()
  .then(() => {
    logger.info('AWS services connected successfully');
  })
  .catch((error) => {
    logger.error('Failed to connect to AWS services:', error);
  });

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app; 