const express = require('express');
const { catchAsync } = require('../middleware/errorHandler');
const { docClient, TABLE_NAMES } = require('../config/aws');

const router = express.Router();

// Get all categories
router.get('/',
  catchAsync(async (req, res) => {
    // For now, return static categories
    // In production, you might want to dynamically generate this from the facts table
    const categories = [
      'history',
      'science',
      'culture',
      'nature',
      'technology',
      'art',
      'philosophy',
      'politics',
      'sports',
      'entertainment'
    ];

    res.json({
      status: 'success',
      results: categories.length,
      categories: categories
    });
  })
);

module.exports = router; 