const express = require('express');
const { param, query } = require('express-validator');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const { docClient, TABLE_NAMES } = require('../config/aws');
const logger = require('../utils/logger');

const router = express.Router();

// Get personalized recommendations for a user
router.get('/:userId',
  [
    param('userId').isString().withMessage('User ID is required'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  ],
  catchAsync(async (req, res) => {
    const { userId } = req.params;
    const { limit = 10 } = req.query;

    // Get user preferences and interaction history
    const user = await getUserData(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Get user's interaction patterns
    const userInteractions = await getUserInteractions(userId);
    
    // Generate recommendations based on user preferences and behavior
    const recommendations = await generateRecommendations(user, userInteractions, parseInt(limit));

    res.json({
      status: 'success',
      results: recommendations.length,
      facts: recommendations,
      algorithm: 'collaborative_filtering_v1'
    });
  })
);

// Get similar facts to a specific fact
router.get('/similar/:factId',
  [
    param('factId').isString().withMessage('Fact ID is required'),
    query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20'),
  ],
  catchAsync(async (req, res) => {
    const { factId } = req.params;
    const { limit = 5 } = req.query;

    // Get the source fact
    const factParams = {
      TableName: TABLE_NAMES.FACTS,
      Key: { id: factId }
    };

    const factResult = await docClient.get(factParams).promise();
    if (!factResult.Item) {
      throw new AppError('Fact not found', 404);
    }

    const sourceFact = factResult.Item;
    
    // Find similar facts based on category, tags, and difficulty
    const similarFacts = await findSimilarFacts(sourceFact, parseInt(limit));

    res.json({
      status: 'success',
      results: similarFacts.length,
      facts: similarFacts,
      basedOn: sourceFact.id
    });
  })
);

// Helper function to get user data
async function getUserData(userId) {
  try {
    const params = {
      TableName: TABLE_NAMES.USERS,
      Key: { id: userId }
    };

    const result = await docClient.get(params).promise();
    return result.Item;
  } catch (error) {
    logger.error('Error getting user data:', error);
    return null;
  }
}

// Helper function to get user interactions
async function getUserInteractions(userId) {
  try {
    const params = {
      TableName: TABLE_NAMES.INTERACTIONS,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      ScanIndexForward: false,
      Limit: 100
    };

    const result = await docClient.query(params).promise();
    return result.Items || [];
  } catch (error) {
    logger.error('Error getting user interactions:', error);
    return [];
  }
}

// Helper function to generate personalized recommendations
async function generateRecommendations(user, interactions, limit) {
  try {
    // Analyze user preferences
    const preferences = user.preferences || {};
    const likedCategories = preferences.categories || [];
    const preferredDifficulty = preferences.difficulty || 'intermediate';
    const maxReadingTime = preferences.readingTime || 10;

    // Analyze interaction patterns
    const likedFacts = interactions.filter(i => i.type === 'like').map(i => i.factId);
    const dislikedFacts = interactions.filter(i => i.type === 'dislike').map(i => i.factId);
    const readFacts = interactions.filter(i => i.type === 'read').map(i => i.factId);

    // Get category preferences from interactions
    const categoryScores = await calculateCategoryScores(interactions);

    // Use efficient query strategy based on user preferences
    let allFacts = [];
    
    if (likedCategories.length > 0) {
      // Query each preferred category using GSI
      for (const category of likedCategories) {
        const params = {
          TableName: TABLE_NAMES.FACTS,
          IndexName: 'category-difficulty-index',
          KeyConditionExpression: 'category = :category AND difficulty = :difficulty',
          FilterExpression: 'readingTime <= :maxReadingTime',
          ExpressionAttributeValues: {
            ':category': category,
            ':difficulty': preferredDifficulty,
            ':maxReadingTime': maxReadingTime
          },
          Limit: Math.ceil(limit * 2 / likedCategories.length) // Distribute across categories
        };
        
        try {
          const result = await docClient.query(params).promise();
          allFacts = allFacts.concat(result.Items || []);
        } catch (error) {
          logger.error(`Error querying category ${category}:`, error);
        }
      }
    } else {
      // Use popularity-based query as fallback
      const params = {
        TableName: TABLE_NAMES.FACTS,
        IndexName: 'popularity-index',
        KeyConditionExpression: 'gsi1pk = :gsi1pk',
        FilterExpression: 'difficulty = :difficulty AND readingTime <= :maxReadingTime',
        ExpressionAttributeValues: {
          ':gsi1pk': 'FACT',
          ':difficulty': preferredDifficulty,
          ':maxReadingTime': maxReadingTime
        },
        Limit: limit * 2,
        ScanIndexForward: false // Descending order for popularity
      };
      
      const result = await docClient.query(params).promise();
      allFacts = result.Items || [];
    }
    
    let facts = allFacts;

    // Filter out already read facts
    facts = facts.filter(fact => !readFacts.includes(fact.id));

    // Score and sort facts
    facts = facts.map(fact => ({
      ...fact,
      recommendationScore: calculateRecommendationScore(fact, user, categoryScores, interactions)
    }));

    facts.sort((a, b) => b.recommendationScore - a.recommendationScore);

    // Return top recommendations
    return facts.slice(0, limit).map(fact => {
      const { recommendationScore, ...factData } = fact;
      return factData;
    });

  } catch (error) {
    logger.error('Error generating recommendations:', error);
    // Fallback to trending facts
    return await getFallbackRecommendations(limit);
  }
}

// Helper function to calculate category scores based on user interactions
async function calculateCategoryScores(interactions) {
  const categoryScores = {};
  
  if (interactions.length === 0) {
    return categoryScores;
  }
  
  // Get unique fact IDs to avoid duplicate API calls
  const uniqueFactIds = [...new Set(interactions.map(i => i.factId))];
  
  try {
    // Use batch get for efficient fact retrieval
    const { batchGetItems } = require('../config/aws');
    const factKeys = uniqueFactIds.map(id => ({ id }));
    const facts = await batchGetItems(TABLE_NAMES.FACTS, factKeys);
    
    // Create fact lookup map
    const factLookup = {};
    facts.forEach(fact => {
      factLookup[fact.id] = fact;
    });
    
    // Calculate category scores
    for (const interaction of interactions) {
      const fact = factLookup[interaction.factId];
      if (fact) {
        const category = fact.category;
        const weight = getInteractionWeight(interaction.type);
        
        categoryScores[category] = (categoryScores[category] || 0) + weight;
      }
    }
    
  } catch (error) {
    logger.error('Error calculating category scores:', error);
  }
  
  return categoryScores;
}

// Helper function to get interaction weights
function getInteractionWeight(type) {
  const weights = {
    'like': 3,
    'share': 5,
    'read': 1,
    'view': 0.5,
    'dislike': -2
  };
  return weights[type] || 0;
}

// Helper function to calculate recommendation score
function calculateRecommendationScore(fact, user, categoryScores, interactions) {
  let score = 0;
  
  // Base popularity score
  score += (fact.popularity || 0) * 0.3;
  
  // Category preference score
  const categoryScore = categoryScores[fact.category] || 0;
  score += categoryScore * 0.4;
  
  // Difficulty match score
  const preferredDifficulty = user.preferences?.difficulty || 'intermediate';
  if (fact.difficulty === preferredDifficulty) {
    score += 20;
  }
  
  // Reading time preference score
  const maxReadingTime = user.preferences?.readingTime || 10;
  if (fact.readingTime <= maxReadingTime) {
    score += 10;
  }
  
  // Recency bonus (newer content gets slight boost)
  const createdAt = new Date(fact.createdAt);
  const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCreation <= 7) {
    score += 5;
  }
  
  return Math.max(0, score);
}

// Helper function to find similar facts
async function findSimilarFacts(sourceFact, limit) {
  try {
    // Use category-difficulty GSI for efficient querying
    const params = {
      TableName: TABLE_NAMES.FACTS,
      IndexName: 'category-difficulty-index',
      KeyConditionExpression: 'category = :category AND difficulty = :difficulty',
      FilterExpression: 'id <> :excludeId',
      ExpressionAttributeValues: {
        ':category': sourceFact.category,
        ':difficulty': sourceFact.difficulty,
        ':excludeId': sourceFact.id
      },
      Limit: limit * 2
    };

    const result = await docClient.query(params).promise();
    let facts = result.Items || [];

    // Score facts based on similarity
    facts = facts.map(fact => ({
      ...fact,
      similarityScore: calculateSimilarityScore(sourceFact, fact)
    }));

    facts.sort((a, b) => b.similarityScore - a.similarityScore);

    return facts.slice(0, limit).map(fact => {
      const { similarityScore, ...factData } = fact;
      return factData;
    });

  } catch (error) {
    logger.error('Error finding similar facts:', error);
    return [];
  }
}

// Helper function to calculate similarity score
function calculateSimilarityScore(sourceFact, targetFact) {
  let score = 0;
  
  // Category match
  if (sourceFact.category === targetFact.category) {
    score += 50;
  }
  
  // Tag overlap
  const sourceTagsSet = new Set(sourceFact.tags || []);
  const targetTagsSet = new Set(targetFact.tags || []);
  const commonTags = [...sourceTagsSet].filter(tag => targetTagsSet.has(tag));
  score += commonTags.length * 10;
  
  // Similar reading time
  const timeDiff = Math.abs((sourceFact.readingTime || 0) - (targetFact.readingTime || 0));
  if (timeDiff <= 1) {
    score += 10;
  }
  
  // Similar popularity
  const popularityDiff = Math.abs((sourceFact.popularity || 0) - (targetFact.popularity || 0));
  if (popularityDiff <= 10) {
    score += 5;
  }
  
  return score;
}

// Helper function to get fallback recommendations
async function getFallbackRecommendations(limit) {
  try {
    const params = {
      TableName: TABLE_NAMES.FACTS,
      Limit: limit
    };

    const result = await docClient.scan(params).promise();
    let facts = result.Items || [];

    // Sort by popularity
    facts.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    return facts.slice(0, limit);
  } catch (error) {
    logger.error('Error getting fallback recommendations:', error);
    return [];
  }
}

module.exports = router; 