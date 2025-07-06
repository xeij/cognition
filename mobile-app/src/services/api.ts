import axios from 'axios';
import { Fact } from '../context/AppContext';

const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3000/api' 
  : 'https://your-api-domain.com/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Cache configuration
interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxItems?: number;
}

class ApiCache {
  private cache = new Map<string, CacheItem<any>>();
  private defaultConfig: CacheConfig = {
    ttl: 5 * 60 * 1000, // 5 minutes default
    maxItems: 100
  };

  private configs: { [key: string]: CacheConfig } = {
    facts: { ttl: 10 * 60 * 1000, maxItems: 200 }, // 10 minutes for facts
    recommendations: { ttl: 5 * 60 * 1000, maxItems: 50 }, // 5 minutes for recommendations
    categories: { ttl: 60 * 60 * 1000, maxItems: 10 }, // 1 hour for categories
    user: { ttl: 30 * 60 * 1000, maxItems: 20 }, // 30 minutes for user data
    search: { ttl: 3 * 60 * 1000, maxItems: 50 }, // 3 minutes for search results
  };

  private getConfig(namespace: string): CacheConfig {
    return this.configs[namespace] || this.defaultConfig;
  }

  private generateKey(namespace: string, params?: any): string {
    if (!params) return namespace;
    
    // Sort params to ensure consistent keys
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((result, key) => {
        result[key] = params[key];
        return result;
      }, {} as any);
    
    return `${namespace}:${JSON.stringify(sortedParams)}`;
  }

  set<T>(namespace: string, data: T, params?: any): void {
    const config = this.getConfig(namespace);
    const key = this.generateKey(namespace, params);
    const now = Date.now();
    
    // Clean up expired items and enforce max items limit
    this.cleanup(namespace);
    
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + config.ttl
    });
  }

  get<T>(namespace: string, params?: any): T | null {
    const key = this.generateKey(namespace, params);
    const item = this.cache.get(key);
    
    if (!item) return null;
    
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data as T;
  }

  invalidate(namespace: string, params?: any): void {
    if (params) {
      const key = this.generateKey(namespace, params);
      this.cache.delete(key);
    } else {
      // Invalidate all items in namespace
      const prefix = `${namespace}:`;
      for (const [key] of this.cache) {
        if (key.startsWith(prefix) || key === namespace) {
          this.cache.delete(key);
        }
      }
    }
  }

  private cleanup(namespace: string): void {
    const config = this.getConfig(namespace);
    const now = Date.now();
    
    // Remove expired items
    for (const [key, item] of this.cache) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
      }
    }
    
    // Enforce max items limit for namespace
    if (config.maxItems) {
      const namespaceItems = Array.from(this.cache.entries())
        .filter(([key]) => key.startsWith(namespace))
        .sort(([, a], [, b]) => b.timestamp - a.timestamp); // Sort by newest first
      
      if (namespaceItems.length > config.maxItems) {
        const itemsToRemove = namespaceItems.slice(config.maxItems);
        itemsToRemove.forEach(([key]) => this.cache.delete(key));
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; namespaces: { [key: string]: number } } {
    const namespaces: { [key: string]: number } = {};
    
    for (const [key] of this.cache) {
      const namespace = key.split(':')[0];
      namespaces[namespace] = (namespaces[namespace] || 0) + 1;
    }
    
    return {
      size: this.cache.size,
      namespaces
    };
  }
}

// Global cache instance
const cache = new ApiCache();

// Request interceptor for adding auth tokens
api.interceptors.request.use((config) => {
  // Add any authentication tokens here
  return config;
});

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export interface GetFactsParams {
  userId?: string;
  limit?: number;
  offset?: number;
  categories?: string[];
  difficulty?: string;
  excludeRead?: boolean;
}

export interface InteractionType {
  type: 'like' | 'dislike' | 'share' | 'read';
  factId: string;
  userId: string;
  timestamp: string;
}

class ApiService {
  async getFacts(params: GetFactsParams): Promise<Fact[]> {
    // Check cache first
    const cacheKey = params;
    const cachedFacts = cache.get<Fact[]>('facts', cacheKey);
    
    if (cachedFacts) {
      console.log('Returning cached facts');
      return cachedFacts;
    }

    try {
      const response = await api.get('/facts', { params });
      const facts = response.data.facts || [];
      
      // Cache the results
      cache.set('facts', facts, cacheKey);
      
      return facts;
    } catch (error) {
      console.error('Error fetching facts:', error);
      
      // Try to return stale cache data as fallback
      const staleData = cache.get<Fact[]>('facts', cacheKey);
      if (staleData) {
        console.log('Returning stale cached facts as fallback');
        return staleData;
      }
      
      // Return mock data for development
      return this.getMockFacts();
    }
  }

  async getRecommendedFacts(userId: string, limit = 10): Promise<Fact[]> {
    const cacheKey = { userId, limit };
    const cached = cache.get<Fact[]>('recommendations', cacheKey);
    
    if (cached) {
      console.log('Returning cached recommendations');
      return cached;
    }

    try {
      const response = await api.get(`/recommendations/${userId}`, {
        params: { limit }
      });
      const facts = response.data.facts || [];
      
      cache.set('recommendations', facts, cacheKey);
      return facts;
    } catch (error) {
      console.error('Error fetching recommended facts:', error);
      
      // Try stale cache as fallback
      const staleData = cache.get<Fact[]>('recommendations', cacheKey);
      if (staleData) {
        return staleData;
      }
      
      return this.getMockFacts();
    }
  }

  async recordInteraction(userId: string, factId: string, type: 'like' | 'dislike' | 'share' | 'read'): Promise<void> {
    try {
      await api.post('/interactions', {
        userId,
        factId,
        type,
        timestamp: new Date().toISOString()
      });
      
      // Invalidate relevant caches after recording interaction
      cache.invalidate('recommendations', { userId });
      cache.invalidate('user', { userId });
      
      // For like/dislike, also invalidate facts cache as it may affect popularity
      if (type === 'like' || type === 'dislike') {
        cache.invalidate('facts');
      }
      
    } catch (error) {
      console.error('Error recording interaction:', error);
    }
  }

  async updateUserPreferences(userId: string, preferences: any): Promise<void> {
    try {
      await api.put(`/users/${userId}/preferences`, preferences);
      
      // Invalidate user-related caches
      cache.invalidate('user', { userId });
      cache.invalidate('recommendations', { userId });
      
    } catch (error) {
      console.error('Error updating user preferences:', error);
    }
  }

  async getFactById(factId: string): Promise<Fact | null> {
    const cacheKey = { factId };
    const cached = cache.get<Fact>('fact', cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await api.get(`/facts/${factId}`);
      const fact = response.data.fact || null;
      
      if (fact) {
        cache.set('fact', fact, cacheKey);
      }
      
      return fact;
    } catch (error) {
      console.error('Error fetching fact:', error);
      
      // Try stale cache
      const staleData = cache.get<Fact>('fact', cacheKey);
      return staleData || null;
    }
  }

  async searchFacts(query: string, limit = 10): Promise<Fact[]> {
    // Don't cache empty queries
    if (!query.trim()) return [];
    
    const cacheKey = { query: query.toLowerCase().trim(), limit };
    const cached = cache.get<Fact[]>('search', cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await api.get('/search', {
        params: { q: query, limit }
      });
      const facts = response.data.facts || [];
      
      cache.set('search', facts, cacheKey);
      return facts;
    } catch (error) {
      console.error('Error searching facts:', error);
      return [];
    }
  }

  async getCategories(): Promise<string[]> {
    const cached = cache.get<string[]>('categories');
    
    if (cached) {
      return cached;
    }

    try {
      const response = await api.get('/categories');
      const categories = response.data.categories || [];
      
      cache.set('categories', categories);
      return categories;
    } catch (error) {
      console.error('Error fetching categories:', error);
      
      // Try stale cache or return defaults
      const staleData = cache.get<string[]>('categories');
      return staleData || ['history', 'science', 'culture', 'nature', 'technology', 'art'];
    }
  }

  async getUserStats(userId: string): Promise<any> {
    const cacheKey = { userId };
    const cached = cache.get<any>('user', cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await api.get(`/users/${userId}/stats`);
      const stats = response.data || {};
      
      cache.set('user', stats, cacheKey);
      return stats;
    } catch (error) {
      console.error('Error fetching user stats:', error);
      
      const staleData = cache.get<any>('user', cacheKey);
      return staleData || {};
    }
  }

  // Cache management methods
  clearCache(): void {
    cache.clear();
  }

  getCacheStats(): { size: number; namespaces: { [key: string]: number } } {
    return cache.getStats();
  }

  invalidateCache(namespace?: string, params?: any): void {
    if (namespace) {
      cache.invalidate(namespace, params);
    } else {
      cache.clear();
    }
  }

  // Mock data for development
  private getMockFacts(): Fact[] {
    return [
      {
        id: '1',
        title: 'The Great Wall of China',
        content: 'Contrary to popular belief, the Great Wall of China is not visible from space with the naked eye. This myth has been perpetuated for decades, but astronauts have confirmed that while the wall is massive, it\'s too narrow to be seen from such a distance without aid. The wall stretches over 13,000 miles and took over 2,000 years to complete, involving millions of workers throughout different dynasties.',
        category: 'history',
        tags: ['china', 'architecture', 'myths', 'space'],
        readingTime: 3,
        createdAt: new Date().toISOString(),
        source: 'Wikipedia',
        difficulty: 'beginner',
        popularity: 95
      },
      {
        id: '2',
        title: 'Octopus Intelligence',
        content: 'Octopuses have three hearts and blue blood, but what\'s even more fascinating is their intelligence. They can solve complex puzzles, use tools, and even exhibit what appears to be playful behavior. Each of their eight arms has its own mini-brain with about 300 chemoreceptors, allowing them to taste and smell what they touch. Some species can change not just their color, but also their skin texture to perfectly mimic their surroundings.',
        category: 'science',
        tags: ['marine biology', 'intelligence', 'adaptation', 'ocean'],
        readingTime: 4,
        createdAt: new Date().toISOString(),
        source: 'Wikipedia',
        difficulty: 'intermediate',
        popularity: 88
      },
      {
        id: '3',
        title: 'The Lost City of Atlantis',
        content: 'Plato\'s account of Atlantis in his dialogues "Timaeus" and "Critias" around 360 BCE was likely intended as a philosophical allegory about the ideal state and the dangers of hubris, not as a historical record. The detailed description of a advanced civilization that vanished in a single day has inspired countless searches and theories, but most scholars agree it was a fictional device to illustrate moral and political points about Athens and society.',
        category: 'culture',
        tags: ['mythology', 'philosophy', 'plato', 'civilization'],
        readingTime: 5,
        createdAt: new Date().toISOString(),
        source: 'Wikipedia',
        difficulty: 'advanced',
        popularity: 72
      },
      {
        id: '4',
        title: 'Trees and Forest Communication',
        content: 'Trees in a forest communicate with each other through an underground network of fungal threads called mycorrhizae, often referred to as the "wood wide web." Through this network, trees can share nutrients, send warning signals about insect attacks, and even help support younger or weaker trees. Mother trees, typically the oldest and largest, play a crucial role in this network by nurturing their offspring and maintaining forest health.',
        category: 'nature',
        tags: ['forests', 'communication', 'fungi', 'ecosystems'],
        readingTime: 4,
        createdAt: new Date().toISOString(),
        source: 'Wikipedia',
        difficulty: 'intermediate',
        popularity: 91
      },
      {
        id: '5',
        title: 'The Antikythera Mechanism',
        content: 'Discovered in a shipwreck off the Greek island of Antikythera in 1901, this ancient Greek device is considered the world\'s first analog computer. Dating to around 100 BCE, it was used to predict astronomical positions and eclipses decades in advance. The mechanism\'s complexity wasn\'t matched again until astronomical clocks appeared in Europe over 1,000 years later, showing that ancient Greek technology was far more advanced than previously thought.',
        category: 'technology',
        tags: ['ancient greece', 'astronomy', 'engineering', 'archaeology'],
        readingTime: 4,
        createdAt: new Date().toISOString(),
        source: 'Wikipedia',
        difficulty: 'advanced',
        popularity: 78
      }
    ];
  }
}

export const apiService = new ApiService(); 