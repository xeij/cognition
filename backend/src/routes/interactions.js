const express = require('express');
const { body, query, param } = require('express-validator');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const { docClient, TABLE_NAMES } = require('../config/aws');
const logger = require('../utils/logger');

const router = express.Router();

// Record a user interaction
router.post('/',
  [
    body('userId').isString().withMessage('User ID is required'),
    body('factId').isString().withMessage('Fact ID is required'),
    body('type').isIn(['like', 'dislike', 'share', 'read', 'view']).withMessage('Invalid interaction type'),
    body('timestamp').optional().isISO8601().withMessage('Invalid timestamp format'),
  ],
  catchAsync(async (req, res) => {
    const { userId, factId, type, timestamp } = req.body;
    
    const interactionId = `${userId}_${factId}_${type}_${Date.now()}`;
    const interactionTimestamp = timestamp || new Date().toISOString();

    // Check if fact exists
    const factParams = {
      TableName: TABLE_NAMES.FACTS,
      Key: { id: factId }
    };
    
    const factResult = await docClient.get(factParams).promise();
    if (!factResult.Item) {
      throw new AppError('Fact not found', 404);
    }

    // For like/dislike, remove any existing opposite interaction
    if (type === 'like' || type === 'dislike') {
      await removeOppositeInteraction(userId, factId, type);
    }

    // Record the interaction
    const interaction = {
      id: interactionId,
      userId,
      factId,
      type,
      timestamp: interactionTimestamp,
      createdAt: new Date().toISOString()
    };

    const params = {
      TableName: TABLE_NAMES.INTERACTIONS,
      Item: interaction
    };

    await docClient.put(params).promise();

    // Update fact metrics
    await updateFactMetrics(factId, type, 1);

    res.status(201).json({
      status: 'success',
      interaction
    });
  })
);

// Remove an interaction (e.g., unlike)
router.delete('/:userId/:factId/:type',
  [
    param('userId').isString().withMessage('User ID is required'),
    param('factId').isString().withMessage('Fact ID is required'),
    param('type').isIn(['like', 'dislike', 'share', 'read', 'view']).withMessage('Invalid interaction type'),
  ],
  catchAsync(async (req, res) => {
    const { userId, factId, type } = req.params;

    // Find and remove the interaction
    const queryParams = {
      TableName: TABLE_NAMES.INTERACTIONS,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'factId = :factId AND #type = :type',
      ExpressionAttributeNames: {
        '#type': 'type'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':factId': factId,
        ':type': type
      }
    };

    const queryResult = await docClient.query(queryParams).promise();
    
    if (queryResult.Items.length === 0) {
      throw new AppError('Interaction not found', 404);
    }

    // Delete the most recent interaction of this type
    const latestInteraction = queryResult.Items.sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    )[0];

    const deleteParams = {
      TableName: TABLE_NAMES.INTERACTIONS,
      Key: {
        userId: latestInteraction.userId,
        timestamp: latestInteraction.timestamp
      }
    };

    await docClient.delete(deleteParams).promise();

    // Update fact metrics (decrement)
    await updateFactMetrics(factId, type, -1);

    res.status(204).json({
      status: 'success',
      message: 'Interaction removed successfully'
    });
  })
);

// Get user interactions
router.get('/user/:userId',
  [
    param('userId').isString().withMessage('User ID is required'),
    query('type').optional().isIn(['like', 'dislike', 'share', 'read', 'view']).withMessage('Invalid interaction type'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
  ],
  catchAsync(async (req, res) => {
    const { userId } = req.params;
    const { type, limit = 50, startDate, endDate } = req.query;

    let params = {
      TableName: TABLE_NAMES.INTERACTIONS,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      Limit: parseInt(limit),
      ScanIndexForward: false // Get most recent first
    };

    // Add filters
    let FilterExpression = [];
    
    if (type) {
      FilterExpression.push('#type = :type');
      params.ExpressionAttributeNames = { '#type': 'type' };
      params.ExpressionAttributeValues[':type'] = type;
    }

    if (startDate) {
      FilterExpression.push('#timestamp >= :startDate');
      params.ExpressionAttributeNames = { 
        ...params.ExpressionAttributeNames, 
        '#timestamp': 'timestamp' 
      };
      params.ExpressionAttributeValues[':startDate'] = startDate;
    }

    if (endDate) {
      FilterExpression.push('#timestamp <= :endDate');
      params.ExpressionAttributeNames = { 
        ...params.ExpressionAttributeNames, 
        '#timestamp': 'timestamp' 
      };
      params.ExpressionAttributeValues[':endDate'] = endDate;
    }

    if (FilterExpression.length > 0) {
      params.FilterExpression = FilterExpression.join(' AND ');
    }

    const result = await docClient.query(params).promise();

    res.json({
      status: 'success',
      results: result.Items.length,
      interactions: result.Items
    });
  })
);

// Get fact interactions
router.get('/fact/:factId',
  [
    param('factId').isString().withMessage('Fact ID is required'),
    query('type').optional().isIn(['like', 'dislike', 'share', 'read', 'view']).withMessage('Invalid interaction type'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  ],
  catchAsync(async (req, res) => {
    const { factId } = req.params;
    const { type, limit = 50 } = req.query;

    let params = {
      TableName: TABLE_NAMES.INTERACTIONS,
      IndexName: 'factId-timestamp-index',
      KeyConditionExpression: 'factId = :factId',
      ExpressionAttributeValues: {
        ':factId': factId
      },
      Limit: parseInt(limit),
      ScanIndexForward: false
    };

    if (type) {
      params.FilterExpression = '#type = :type';
      params.ExpressionAttributeNames = { '#type': 'type' };
      params.ExpressionAttributeValues[':type'] = type;
    }

    const result = await docClient.query(params).promise();

    res.json({
      status: 'success',
      results: result.Items.length,
      interactions: result.Items
    });
  })
);

// Get interaction statistics
router.get('/stats/:factId',
  [
    param('factId').isString().withMessage('Fact ID is required'),
  ],
  catchAsync(async (req, res) => {
    const { factId } = req.params;

    const params = {
      TableName: TABLE_NAMES.INTERACTIONS,
      IndexName: 'factId-timestamp-index',
      KeyConditionExpression: 'factId = :factId',
      ExpressionAttributeValues: {
        ':factId': factId
      }
    };

    const result = await docClient.query(params).promise();
    const interactions = result.Items || [];

    // Calculate statistics
    const stats = interactions.reduce((acc, interaction) => {
      acc[interaction.type] = (acc[interaction.type] || 0) + 1;
      return acc;
    }, {});

    // Add engagement score
    const engagementScore = 
      (stats.like || 0) * 3 +
      (stats.share || 0) * 5 +
      (stats.read || 0) * 1 +
      (stats.view || 0) * 0.5 -
      (stats.dislike || 0) * 2;

    res.json({
      status: 'success',
      factId,
      stats: {
        ...stats,
        total: interactions.length,
        engagementScore: Math.max(0, engagementScore)
      }
    });
  })
);

// Get user engagement patterns
router.get('/patterns/:userId',
  [
    param('userId').isString().withMessage('User ID is required'),
    query('period').optional().isIn(['day', 'week', 'month']).withMessage('Period must be day, week, or month'),
  ],
  catchAsync(async (req, res) => {
    const { userId } = req.params;
    const { period = 'week' } = req.query;

    // Calculate date range
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
      TableName: TABLE_NAMES.INTERACTIONS,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#timestamp >= :startDate',
      ExpressionAttributeNames: {
        '#timestamp': 'timestamp'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':startDate': startDate.toISOString()
      }
    };

    const result = await docClient.query(params).promise();
    const interactions = result.Items || [];

    // Analyze patterns
    const patterns = analyzeEngagementPatterns(interactions);

    res.json({
      status: 'success',
      userId,
      period,
      patterns
    });
  })
);

// Helper function to remove opposite interactions (like/dislike)
async function removeOppositeInteraction(userId, factId, type) {
  const oppositeType = type === 'like' ? 'dislike' : 'like';
  
  try {
    const params = {
      TableName: TABLE_NAMES.INTERACTIONS,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'factId = :factId AND #type = :type',
      ExpressionAttributeNames: {
        '#type': 'type'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':factId': factId,
        ':type': oppositeType
      }
    };

    const result = await docClient.query(params).promise();
    
    // Delete any existing opposite interactions
    for (const interaction of result.Items) {
      const deleteParams = {
        TableName: TABLE_NAMES.INTERACTIONS,
        Key: {
          userId: interaction.userId,
          timestamp: interaction.timestamp
        }
      };
      
      await docClient.delete(deleteParams).promise();
      
      // Update fact metrics (decrement opposite)
      await updateFactMetrics(factId, oppositeType, -1);
    }
  } catch (error) {
    logger.error('Error removing opposite interaction:', error);
  }
}

// Helper function to update fact metrics
async function updateFactMetrics(factId, interactionType, delta) {
  try {
    const metricMap = {
      'like': 'likes',
      'dislike': 'dislikes',
      'share': 'shares',
      'read': 'reads',
      'view': 'views'
    };

    const metricField = metricMap[interactionType];
    if (!metricField) return;

    const params = {
      TableName: TABLE_NAMES.FACTS,
      Key: { id: factId },
      UpdateExpression: `ADD ${metricField} :delta`,
      ExpressionAttributeValues: {
        ':delta': delta
      }
    };

    await docClient.update(params).promise();

    // Update popularity score
    await updatePopularityScore(factId);
  } catch (error) {
    logger.error('Error updating fact metrics:', error);
  }
}

// Helper function to update popularity score
async function updatePopularityScore(factId) {
  try {
    const params = {
      TableName: TABLE_NAMES.FACTS,
      Key: { id: factId }
    };

    const result = await docClient.get(params).promise();
    if (!result.Item) return;

    const fact = result.Item;
    const likes = fact.likes || 0;
    const shares = fact.shares || 0;
    const reads = fact.reads || 0;
    const views = fact.views || 0;
    const dislikes = fact.dislikes || 0;

    // Calculate popularity score (0-100)
    const rawScore = (likes * 3) + (shares * 5) + (reads * 1) + (views * 0.5) - (dislikes * 2);
    const popularity = Math.min(100, Math.max(0, rawScore));

    const updateParams = {
      TableName: TABLE_NAMES.FACTS,
      Key: { id: factId },
      UpdateExpression: 'SET popularity = :popularity',
      ExpressionAttributeValues: {
        ':popularity': popularity
      }
    };

    await docClient.update(updateParams).promise();
  } catch (error) {
    logger.error('Error updating popularity score:', error);
  }
}

// Helper function to analyze engagement patterns
function analyzeEngagementPatterns(interactions) {
  const patterns = {
    totalInteractions: interactions.length,
    byType: {},
    byHour: {},
    byDay: {},
    streakDays: 0,
    averageSessionLength: 0,
    preferredCategories: {}
  };

  // Group by type
  interactions.forEach(interaction => {
    patterns.byType[interaction.type] = (patterns.byType[interaction.type] || 0) + 1;
  });

  // Group by hour
  interactions.forEach(interaction => {
    const hour = new Date(interaction.timestamp).getHours();
    patterns.byHour[hour] = (patterns.byHour[hour] || 0) + 1;
  });

  // Group by day
  interactions.forEach(interaction => {
    const day = new Date(interaction.timestamp).toDateString();
    patterns.byDay[day] = (patterns.byDay[day] || 0) + 1;
  });

  // Calculate streak days
  const sortedDays = Object.keys(patterns.byDay).sort((a, b) => new Date(b) - new Date(a));
  let currentStreak = 0;
  let previousDate = new Date();

  for (const day of sortedDays) {
    const dayDate = new Date(day);
    const daysDiff = Math.floor((previousDate - dayDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 1) {
      currentStreak++;
      previousDate = dayDate;
    } else {
      break;
    }
  }
  
  patterns.streakDays = currentStreak;

  return patterns;
}

module.exports = router; 