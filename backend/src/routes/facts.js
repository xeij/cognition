const express = require('express');
const { body, query, param } = require('express-validator');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const { docClient, TABLE_NAMES } = require('../config/aws');
const logger = require('../utils/logger');

const router = express.Router();

// Get all facts with pagination and filtering
router.get('/', 
  [
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('lastKey').optional().isString().withMessage('LastKey must be a string'),
    query('category').optional().isString().withMessage('Category must be a string'),
    query('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty level'),
    query('userId').optional().isString().withMessage('User ID must be a string'),
    query('excludeRead').optional().isBoolean().withMessage('ExcludeRead must be a boolean'),
    query('sortBy').optional().isIn(['popularity', 'recent', 'trending']).withMessage('Invalid sort option'),
  ],
  catchAsync(async (req, res) => {
    const {
      limit = 10,
      lastKey,
      category,
      difficulty,
      userId,
      excludeRead = false,
      sortBy = 'popularity'
    } = req.query;

    let params;
    let result;

    // Use different query strategies based on filters
    if (category && difficulty) {
      // Use category-difficulty GSI for efficient querying
      params = {
        TableName: TABLE_NAMES.FACTS,
        IndexName: 'category-difficulty-index',
        KeyConditionExpression: 'category = :category AND difficulty = :difficulty',
        ExpressionAttributeValues: {
          ':category': category.toLowerCase(),
          ':difficulty': difficulty
        },
        Limit: parseInt(limit),
        ScanIndexForward: sortBy === 'recent' ? false : true,
      };
    } else if (category) {
      // Use category GSI
      params = {
        TableName: TABLE_NAMES.FACTS,
        IndexName: 'category-createdAt-index',
        KeyConditionExpression: 'category = :category',
        ExpressionAttributeValues: {
          ':category': category.toLowerCase()
        },
        Limit: parseInt(limit),
        ScanIndexForward: sortBy === 'recent' ? false : true,
      };
      
      if (difficulty) {
        params.FilterExpression = 'difficulty = :difficulty';
        params.ExpressionAttributeValues[':difficulty'] = difficulty;
      }
    } else if (sortBy === 'popularity') {
      // Use popularity GSI for efficient popular facts query
      params = {
        TableName: TABLE_NAMES.FACTS,
        IndexName: 'popularity-index',
        KeyConditionExpression: 'gsi1pk = :gsi1pk',
        ExpressionAttributeValues: {
          ':gsi1pk': 'FACT'
        },
        Limit: parseInt(limit),
        ScanIndexForward: false, // Descending order for popularity
      };
    } else {
      // Use recent facts GSI for efficient recent facts query
      params = {
        TableName: TABLE_NAMES.FACTS,
        IndexName: 'createdAt-index',
        KeyConditionExpression: 'gsi2pk = :gsi2pk',
        ExpressionAttributeValues: {
          ':gsi2pk': 'FACT'
        },
        Limit: parseInt(limit),
        ScanIndexForward: false, // Descending order for recent
      };
    }

    // Add pagination
    if (lastKey) {
      try {
        params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
      } catch (error) {
        logger.error('Invalid lastKey format:', error);
        throw new AppError('Invalid pagination token', 400);
      }
    }

    // Execute query
    if (params.IndexName) {
      result = await docClient.query(params).promise();
    } else {
      result = await docClient.scan(params).promise();
    }

    let facts = result.Items || [];

    // If user ID is provided and excludeRead is true, filter out read facts
    if (userId && excludeRead) {
      const readFacts = await getReadFactsForUser(userId);
      facts = facts.filter(fact => !readFacts.includes(fact.id));
    }

    // Apply difficulty filter if not used in query
    if (difficulty && !params.KeyConditionExpression?.includes('difficulty')) {
      facts = facts.filter(fact => fact.difficulty === difficulty);
    }

    // Sort facts based on sortBy parameter if not handled by GSI
    if (sortBy === 'trending') {
      facts.sort((a, b) => {
        const aScore = calculateTrendingScore(a);
        const bScore = calculateTrendingScore(b);
        return bScore - aScore;
      });
    } else if (sortBy === 'popularity' && !params.IndexName?.includes('popularity')) {
      facts.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    } else if (sortBy === 'recent' && !params.IndexName?.includes('createdAt')) {
      facts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const nextKey = result.LastEvaluatedKey 
      ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey))
      : null;

    res.json({
      status: 'success',
      results: facts.length,
      facts: facts,
      pagination: {
        limit: parseInt(limit),
        hasMore: !!result.LastEvaluatedKey,
        nextKey: nextKey
      }
    });
  })
);

// Get a specific fact by ID
router.get('/:id',
  [
    param('id').isString().withMessage('Fact ID must be a string'),
  ],
  catchAsync(async (req, res) => {
    const { id } = req.params;

    const params = {
      TableName: TABLE_NAMES.FACTS,
      Key: { id }
    };

    const result = await docClient.get(params).promise();
    
    if (!result.Item) {
      throw new AppError('Fact not found', 404);
    }

    res.json({
      status: 'success',
      fact: result.Item
    });
  })
);

// Create a new fact (admin only - would need auth middleware)
router.post('/',
  [
    body('title').isString().isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters'),
    body('content').isString().isLength({ min: 1, max: 2000 }).withMessage('Content must be between 1 and 2000 characters'),
    body('category').isString().isLength({ min: 1, max: 50 }).withMessage('Category is required'),
    body('tags').isArray().withMessage('Tags must be an array'),
    body('difficulty').isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty level'),
    body('readingTime').isInt({ min: 1, max: 30 }).withMessage('Reading time must be between 1 and 30 minutes'),
    body('source').isString().isLength({ min: 1, max: 100 }).withMessage('Source is required'),
  ],
  catchAsync(async (req, res) => {
    const {
      title,
      content,
      category,
      tags,
      difficulty,
      readingTime,
      source
    } = req.body;

    const factId = `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const fact = {
      id: factId,
      title,
      content,
      category: category.toLowerCase(),
      tags: tags.map(tag => tag.toLowerCase()),
      difficulty,
      readingTime,
      source,
      createdAt: now,
      updatedAt: now,
      popularity: 0,
      views: 0,
      likes: 0,
      shares: 0,
      // GSI partition keys for efficient querying
      gsi1pk: 'FACT', // For popularity-based queries
      gsi2pk: 'FACT'  // For time-based queries
    };

    const params = {
      TableName: TABLE_NAMES.FACTS,
      Item: fact
    };

    await docClient.put(params).promise();

    res.status(201).json({
      status: 'success',
      fact
    });
  })
);

// Update a fact (admin only - would need auth middleware)
router.put('/:id',
  [
    param('id').isString().withMessage('Fact ID must be a string'),
    body('title').optional().isString().isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters'),
    body('content').optional().isString().isLength({ min: 1, max: 2000 }).withMessage('Content must be between 1 and 2000 characters'),
    body('category').optional().isString().isLength({ min: 1, max: 50 }).withMessage('Category is required'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty level'),
    body('readingTime').optional().isInt({ min: 1, max: 30 }).withMessage('Reading time must be between 1 and 30 minutes'),
    body('source').optional().isString().isLength({ min: 1, max: 100 }).withMessage('Source is required'),
  ],
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Check if fact exists
    const getParams = {
      TableName: TABLE_NAMES.FACTS,
      Key: { id }
    };

    const existingFact = await docClient.get(getParams).promise();
    if (!existingFact.Item) {
      throw new AppError('Fact not found', 404);
    }

    // Build update expression
    let UpdateExpression = 'SET updatedAt = :updatedAt';
    let ExpressionAttributeValues = {
      ':updatedAt': new Date().toISOString()
    };

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        UpdateExpression += `, ${key} = :${key}`;
        ExpressionAttributeValues[`:${key}`] = updates[key];
      }
    });

    const updateParams = {
      TableName: TABLE_NAMES.FACTS,
      Key: { id },
      UpdateExpression,
      ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    const result = await docClient.update(updateParams).promise();

    res.json({
      status: 'success',
      fact: result.Attributes
    });
  })
);

// Delete a fact (admin only - would need auth middleware)
router.delete('/:id',
  [
    param('id').isString().withMessage('Fact ID must be a string'),
  ],
  catchAsync(async (req, res) => {
    const { id } = req.params;

    const params = {
      TableName: TABLE_NAMES.FACTS,
      Key: { id }
    };

    await docClient.delete(params).promise();

    res.status(204).json({
      status: 'success',
      message: 'Fact deleted successfully'
    });
  })
);

// Get trending facts
router.get('/trending/all',
  [
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('period').optional().isIn(['day', 'week', 'month']).withMessage('Period must be day, week, or month'),
  ],
  catchAsync(async (req, res) => {
    const { limit = 10, period = 'week' } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let startDate;
    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const params = {
      TableName: TABLE_NAMES.FACTS,
      FilterExpression: 'createdAt >= :startDate',
      ExpressionAttributeValues: {
        ':startDate': startDate.toISOString()
      },
      Limit: parseInt(limit)
    };

    const result = await docClient.scan(params).promise();
    let facts = result.Items || [];

    // Sort by popularity (likes + shares + views)
    facts.sort((a, b) => {
      const scoreA = (a.likes || 0) + (a.shares || 0) + (a.views || 0);
      const scoreB = (b.likes || 0) + (b.shares || 0) + (b.views || 0);
      return scoreB - scoreA;
    });

    res.json({
      status: 'success',
      results: facts.length,
      facts: facts,
      period
    });
  })
);

// Helper function to calculate trending score
function calculateTrendingScore(fact) {
  const now = new Date();
  const createdAt = new Date(fact.createdAt);
  const ageInHours = (now - createdAt) / (1000 * 60 * 60);
  
  // Trending score based on engagement and recency
  const popularityScore = (fact.popularity || 0) * 0.4;
  const likesScore = (fact.likes || 0) * 0.3;
  const sharesScore = (fact.shares || 0) * 0.2;
  const viewsScore = (fact.views || 0) * 0.1;
  
  // Apply time decay (newer facts get higher scores)
  const timeDecay = Math.exp(-ageInHours / 24); // Decay over 24 hours
  
  return (popularityScore + likesScore + sharesScore + viewsScore) * timeDecay;
}

// Optimized helper function to get read facts for user
async function getReadFactsForUser(userId) {
  try {
    const params = {
      TableName: TABLE_NAMES.INTERACTIONS,
      IndexName: 'userId-timestamp-index',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#type = :type',
      ExpressionAttributeNames: {
        '#type': 'type'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':type': 'read'
      },
      ProjectionExpression: 'factId'
    };

    const result = await docClient.query(params).promise();
    return result.Items?.map(item => item.factId) || [];
  } catch (error) {
    logger.error('Error getting read facts for user:', error);
    return [];
  }
}

module.exports = router; 