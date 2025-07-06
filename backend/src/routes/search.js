const express = require('express');
const { query } = require('express-validator');
const { catchAsync } = require('../middleware/errorHandler');
const { docClient, TABLE_NAMES } = require('../config/aws');

const router = express.Router();

// Search facts
router.get('/',
  [
    query('q').isString().isLength({ min: 1 }).withMessage('Search query is required'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('category').optional().isString().withMessage('Category must be a string'),
    query('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty level'),
  ],
  catchAsync(async (req, res) => {
    const { q, limit = 10, category, difficulty } = req.query;

    let params = {
      TableName: TABLE_NAMES.FACTS,
      Limit: parseInt(limit)
    };

    // Build filter expression
    let FilterExpression = [];
    let ExpressionAttributeValues = {};

    // Search in title and content
    FilterExpression.push('(contains(title, :searchTerm) OR contains(content, :searchTerm))');
    ExpressionAttributeValues[':searchTerm'] = q;

    if (category) {
      FilterExpression.push('category = :category');
      ExpressionAttributeValues[':category'] = category;
    }

    if (difficulty) {
      FilterExpression.push('difficulty = :difficulty');
      ExpressionAttributeValues[':difficulty'] = difficulty;
    }

    params.FilterExpression = FilterExpression.join(' AND ');
    params.ExpressionAttributeValues = ExpressionAttributeValues;

    const result = await docClient.scan(params).promise();
    const facts = result.Items || [];

    res.json({
      status: 'success',
      results: facts.length,
      facts: facts,
      query: q
    });
  })
);

module.exports = router; 