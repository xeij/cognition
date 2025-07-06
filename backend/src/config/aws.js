const AWS = require('aws-sdk');
const logger = require('../utils/logger');

// Configure AWS SDK
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// DynamoDB configuration
const dynamoDBConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  apiVersion: '2012-08-10',
};

// For local development, use DynamoDB local if available
if (process.env.NODE_ENV === 'development' && process.env.DYNAMODB_LOCAL_ENDPOINT) {
  dynamoDBConfig.endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
}

const dynamoDB = new AWS.DynamoDB(dynamoDBConfig);
const docClient = new AWS.DynamoDB.DocumentClient(dynamoDBConfig);

// Table names
const TABLE_NAMES = {
  FACTS: process.env.FACTS_TABLE_NAME || 'cognition-facts',
  USERS: process.env.USERS_TABLE_NAME || 'cognition-users',
  INTERACTIONS: process.env.INTERACTIONS_TABLE_NAME || 'cognition-interactions',
  CATEGORIES: process.env.CATEGORIES_TABLE_NAME || 'cognition-categories',
};

// Test connection to AWS services
const connectToAWS = async () => {
  try {
    // Test DynamoDB connection
    await dynamoDB.listTables().promise();
    logger.info('Successfully connected to DynamoDB');
    
    // Create tables if they don't exist
    await createTablesIfNotExists();
    
    return true;
  } catch (error) {
    logger.error('Failed to connect to AWS services:', error);
    throw error;
  }
};

// Create DynamoDB tables if they don't exist
const createTablesIfNotExists = async () => {
  const tableSchemas = [
    {
      TableName: TABLE_NAMES.FACTS,
      KeySchema: [
        { AttributeName: 'id', KeyType: 'HASH' }
      ],
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' },
        { AttributeName: 'category', AttributeType: 'S' },
        { AttributeName: 'difficulty', AttributeType: 'S' },
        { AttributeName: 'createdAt', AttributeType: 'S' },
        { AttributeName: 'popularity', AttributeType: 'N' },
        { AttributeName: 'gsi1pk', AttributeType: 'S' },
        { AttributeName: 'gsi2pk', AttributeType: 'S' }
      ],
      BillingMode: 'PAY_PER_REQUEST',
      GlobalSecondaryIndexes: [
        {
          IndexName: 'category-createdAt-index',
          KeySchema: [
            { AttributeName: 'category', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' }
        },
        {
          IndexName: 'category-difficulty-index',
          KeySchema: [
            { AttributeName: 'category', KeyType: 'HASH' },
            { AttributeName: 'difficulty', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' }
        },
        {
          IndexName: 'popularity-index',
          KeySchema: [
            { AttributeName: 'gsi1pk', KeyType: 'HASH' },
            { AttributeName: 'popularity', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' }
        },
        {
          IndexName: 'createdAt-index',
          KeySchema: [
            { AttributeName: 'gsi2pk', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' }
        }
      ]
    },
    {
      TableName: TABLE_NAMES.USERS,
      KeySchema: [
        { AttributeName: 'id', KeyType: 'HASH' }
      ],
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' }
      ],
      BillingMode: 'PAY_PER_REQUEST'
    },
    {
      TableName: TABLE_NAMES.INTERACTIONS,
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' },
        { AttributeName: 'timestamp', KeyType: 'RANGE' }
      ],
      AttributeDefinitions: [
        { AttributeName: 'userId', AttributeType: 'S' },
        { AttributeName: 'timestamp', AttributeType: 'S' },
        { AttributeName: 'factId', AttributeType: 'S' },
        { AttributeName: 'type', AttributeType: 'S' }
      ],
      BillingMode: 'PAY_PER_REQUEST',
      GlobalSecondaryIndexes: [
        {
          IndexName: 'factId-timestamp-index',
          KeySchema: [
            { AttributeName: 'factId', KeyType: 'HASH' },
            { AttributeName: 'timestamp', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' }
        },
        {
          IndexName: 'type-timestamp-index',
          KeySchema: [
            { AttributeName: 'type', KeyType: 'HASH' },
            { AttributeName: 'timestamp', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' }
        }
      ]
    },
    {
      TableName: TABLE_NAMES.CATEGORIES,
      KeySchema: [
        { AttributeName: 'name', KeyType: 'HASH' }
      ],
      AttributeDefinitions: [
        { AttributeName: 'name', AttributeType: 'S' }
      ],
      BillingMode: 'PAY_PER_REQUEST'
    }
  ];

  for (const schema of tableSchemas) {
    try {
      await dynamoDB.describeTable({ TableName: schema.TableName }).promise();
      logger.info(`Table ${schema.TableName} already exists`);
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        try {
          await dynamoDB.createTable(schema).promise();
          logger.info(`Created table ${schema.TableName}`);
          
          // Wait for table to be active
          await dynamoDB.waitFor('tableExists', { TableName: schema.TableName }).promise();
          logger.info(`Table ${schema.TableName} is now active`);
        } catch (createError) {
          logger.error(`Failed to create table ${schema.TableName}:`, createError);
        }
      } else {
        logger.error(`Error checking table ${schema.TableName}:`, error);
      }
    }
  }
};

// Helper function to format DynamoDB items
const formatDynamoDBItem = (item) => {
  if (!item) return null;
  
  // Convert DynamoDB item to regular JavaScript object
  const formatted = {};
  for (const [key, value] of Object.entries(item)) {
    formatted[key] = value;
  }
  
  return formatted;
};

// Helper function to batch get items with retry and unprocessed keys handling
const batchGetItems = async (tableName, keys, maxRetries = 3) => {
  if (!keys || keys.length === 0) return [];
  
  const batchSize = 100; // DynamoDB batch get limit
  const allResults = [];
  
  // Process keys in batches
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    let remainingKeys = batch;
    let attempt = 0;
    
    while (remainingKeys.length > 0 && attempt < maxRetries) {
      try {
        const params = {
          RequestItems: {
            [tableName]: {
              Keys: remainingKeys
            }
          }
        };
        
        const result = await docClient.batchGet(params).promise();
        
        // Add retrieved items to results
        if (result.Responses && result.Responses[tableName]) {
          allResults.push(...result.Responses[tableName]);
        }
        
        // Handle unprocessed keys (throttling)
        if (result.UnprocessedKeys && result.UnprocessedKeys[tableName]) {
          remainingKeys = result.UnprocessedKeys[tableName].Keys || [];
          if (remainingKeys.length > 0) {
            // Exponential backoff for retries
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));
            logger.warn(`Retrying ${remainingKeys.length} unprocessed keys after ${delay}ms delay`);
          }
        } else {
          remainingKeys = [];
        }
        
        attempt++;
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) {
          logger.error(`Error in batchGetItems for ${tableName} after ${maxRetries} attempts:`, error);
          throw error;
        }
        
        // Exponential backoff for retries
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        logger.warn(`Retrying batchGetItems attempt ${attempt + 1} after error`);
      }
    }
  }
  
  return allResults;
};

// Helper function to batch write items with retry and unprocessed items handling
const batchWriteItems = async (tableName, items, operation = 'put', maxRetries = 3) => {
  if (!items || items.length === 0) return;
  
  const batchSize = 25; // DynamoDB batch write limit
  const batches = [];
  
  // Split items into batches
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  
  for (const batch of batches) {
    let remainingItems = batch;
    let attempt = 0;
    
    while (remainingItems.length > 0 && attempt < maxRetries) {
      try {
        const requestItems = remainingItems.map(item => {
          if (operation === 'delete') {
            return {
              DeleteRequest: {
                Key: item
              }
            };
          } else {
            return {
              PutRequest: {
                Item: item
              }
            };
          }
        });
        
        const params = {
          RequestItems: {
            [tableName]: requestItems
          }
        };
        
        const result = await docClient.batchWrite(params).promise();
        
        // Handle unprocessed items (throttling)
        if (result.UnprocessedItems && result.UnprocessedItems[tableName]) {
          const unprocessedRequests = result.UnprocessedItems[tableName];
          remainingItems = unprocessedRequests.map(request => {
            return request.PutRequest ? request.PutRequest.Item : request.DeleteRequest.Key;
          });
          
          if (remainingItems.length > 0) {
            // Exponential backoff for retries
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));
            logger.warn(`Retrying ${remainingItems.length} unprocessed items after ${delay}ms delay`);
          }
        } else {
          remainingItems = [];
        }
        
        attempt++;
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) {
          logger.error(`Error in batchWriteItems for ${tableName} after ${maxRetries} attempts:`, error);
          throw error;
        }
        
        // Exponential backoff for retries
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        logger.warn(`Retrying batchWriteItems attempt ${attempt + 1} after error`);
      }
    }
  }
};

// Enhanced batch delete items
const batchDeleteItems = async (tableName, keys, maxRetries = 3) => {
  return batchWriteItems(tableName, keys, 'delete', maxRetries);
};

// Optimized batch query for multiple categories/difficulties
const batchQueryMultipleGSI = async (indexName, keyConditions, maxRetries = 3) => {
  const allResults = [];
  const promises = [];
  
  for (const condition of keyConditions) {
    const promise = (async () => {
      let attempt = 0;
      while (attempt < maxRetries) {
        try {
          const params = {
            TableName: condition.tableName,
            IndexName: indexName,
            KeyConditionExpression: condition.keyConditionExpression,
            ExpressionAttributeValues: condition.expressionAttributeValues,
            ...(condition.filterExpression && { FilterExpression: condition.filterExpression }),
            ...(condition.limit && { Limit: condition.limit }),
            ...(condition.scanIndexForward !== undefined && { ScanIndexForward: condition.scanIndexForward })
          };
          
          const result = await docClient.query(params).promise();
          return result.Items || [];
        } catch (error) {
          attempt++;
          if (attempt >= maxRetries) {
            logger.error(`Error in batchQueryMultipleGSI after ${maxRetries} attempts:`, error);
            return [];
          }
          
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      return [];
    })();
    
    promises.push(promise);
  }
  
  const results = await Promise.allSettled(promises);
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    } else {
      logger.error(`Query ${index} failed:`, result.reason);
    }
  });
  
  return allResults;
};

// Parallel transaction operations for complex writes
const performTransactionWrite = async (transactItems, maxRetries = 3) => {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      const params = {
        TransactItems: transactItems
      };
      
      await docClient.transactWrite(params).promise();
      return;
    } catch (error) {
      attempt++;
      
      if (error.code === 'TransactionCanceledException') {
        logger.error('Transaction cancelled due to conditional check failure');
        throw error;
      }
      
      if (attempt >= maxRetries) {
        logger.error(`Transaction failed after ${maxRetries} attempts:`, error);
        throw error;
      }
      
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
      logger.warn(`Retrying transaction attempt ${attempt + 1}`);
    }
  }
};

// Optimized bulk operation for fact metrics updates
const batchUpdateFactMetrics = async (factUpdates) => {
  if (!factUpdates || factUpdates.length === 0) return;
  
  const batchSize = 25;
  const batches = [];
  
  for (let i = 0; i < factUpdates.length; i += batchSize) {
    batches.push(factUpdates.slice(i, i + batchSize));
  }
  
  const promises = batches.map(async (batch) => {
    const transactItems = batch.map(update => ({
      Update: {
        TableName: TABLE_NAMES.FACTS,
        Key: { id: update.factId },
        UpdateExpression: 'ADD #likes :likeIncrement, #shares :shareIncrement, #views :viewIncrement SET #popularity = #popularity + :popularityIncrement',
        ExpressionAttributeNames: {
          '#likes': 'likes',
          '#shares': 'shares',
          '#views': 'views',
          '#popularity': 'popularity'
        },
        ExpressionAttributeValues: {
          ':likeIncrement': update.likeIncrement || 0,
          ':shareIncrement': update.shareIncrement || 0,
          ':viewIncrement': update.viewIncrement || 0,
          ':popularityIncrement': update.popularityIncrement || 0
        }
      }
    }));
    
    return performTransactionWrite(transactItems);
  });
  
  await Promise.allSettled(promises);
};

// Memory-efficient paginated query for large datasets
const paginatedQuery = async (params, pageSize = 100, maxResults = 1000) => {
  const allResults = [];
  let lastEvaluatedKey = null;
  let totalScanned = 0;
  
  do {
    const queryParams = {
      ...params,
      Limit: Math.min(pageSize, maxResults - totalScanned),
      ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey })
    };
    
    try {
      const result = await docClient.query(queryParams).promise();
      
      if (result.Items) {
        allResults.push(...result.Items);
        totalScanned += result.Items.length;
      }
      
      lastEvaluatedKey = result.LastEvaluatedKey;
      
      // Prevent infinite loops and respect limits
      if (totalScanned >= maxResults) {
        break;
      }
      
    } catch (error) {
      logger.error('Error in paginatedQuery:', error);
      break;
    }
  } while (lastEvaluatedKey);
  
  return allResults;
};

module.exports = {
  AWS,
  dynamoDB,
  docClient,
  TABLE_NAMES,
  connectToAWS,
  formatDynamoDBItem,
  batchGetItems,
  batchWriteItems,
  batchDeleteItems,
  batchQueryMultipleGSI,
  performTransactionWrite,
  batchUpdateFactMetrics,
  paginatedQuery,
}; 