const express = require('express');
const { body, param } = require('express-validator');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const { docClient, TABLE_NAMES } = require('../config/aws');

const router = express.Router();

// Get user by ID
router.get('/:id',
  [
    param('id').isString().withMessage('User ID is required'),
  ],
  catchAsync(async (req, res) => {
    const { id } = req.params;

    const params = {
      TableName: TABLE_NAMES.USERS,
      Key: { id }
    };

    const result = await docClient.get(params).promise();
    
    if (!result.Item) {
      throw new AppError('User not found', 404);
    }

    res.json({
      status: 'success',
      user: result.Item
    });
  })
);

// Create or update user
router.post('/',
  [
    body('id').isString().withMessage('User ID is required'),
    body('preferences').optional().isObject().withMessage('Preferences must be an object'),
  ],
  catchAsync(async (req, res) => {
    const { id, preferences } = req.body;

    const user = {
      id,
      preferences: preferences || {
        categories: ['history', 'science', 'culture', 'nature'],
        difficulty: 'intermediate',
        readingTime: 5
      },
      interactions: {
        liked: [],
        disliked: [],
        shared: [],
        read: []
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const params = {
      TableName: TABLE_NAMES.USERS,
      Item: user
    };

    await docClient.put(params).promise();

    res.status(201).json({
      status: 'success',
      user
    });
  })
);

// Update user preferences
router.put('/:id/preferences',
  [
    param('id').isString().withMessage('User ID is required'),
    body('categories').optional().isArray().withMessage('Categories must be an array'),
    body('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty level'),
    body('readingTime').optional().isInt({ min: 1, max: 30 }).withMessage('Reading time must be between 1 and 30 minutes'),
  ],
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Check if user exists
    const getParams = {
      TableName: TABLE_NAMES.USERS,
      Key: { id }
    };

    const existingUser = await docClient.get(getParams).promise();
    if (!existingUser.Item) {
      throw new AppError('User not found', 404);
    }

    // Build update expression
    let UpdateExpression = 'SET updatedAt = :updatedAt';
    let ExpressionAttributeValues = {
      ':updatedAt': new Date().toISOString()
    };

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        UpdateExpression += `, preferences.${key} = :${key}`;
        ExpressionAttributeValues[`:${key}`] = updates[key];
      }
    });

    const updateParams = {
      TableName: TABLE_NAMES.USERS,
      Key: { id },
      UpdateExpression,
      ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    const result = await docClient.update(updateParams).promise();

    res.json({
      status: 'success',
      user: result.Attributes
    });
  })
);

module.exports = router; 