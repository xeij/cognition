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
    try {
      const response = await api.get('/facts', { params });
      return response.data.facts || [];
    } catch (error) {
      console.error('Error fetching facts:', error);
      // Return mock data for development
      return this.getMockFacts();
    }
  }

  async getRecommendedFacts(userId: string, limit = 10): Promise<Fact[]> {
    try {
      const response = await api.get(`/recommendations/${userId}`, {
        params: { limit }
      });
      return response.data.facts || [];
    } catch (error) {
      console.error('Error fetching recommended facts:', error);
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
    } catch (error) {
      console.error('Error recording interaction:', error);
    }
  }

  async updateUserPreferences(userId: string, preferences: any): Promise<void> {
    try {
      await api.put(`/users/${userId}/preferences`, preferences);
    } catch (error) {
      console.error('Error updating user preferences:', error);
    }
  }

  async getFactById(factId: string): Promise<Fact | null> {
    try {
      const response = await api.get(`/facts/${factId}`);
      return response.data.fact || null;
    } catch (error) {
      console.error('Error fetching fact:', error);
      return null;
    }
  }

  async searchFacts(query: string, limit = 10): Promise<Fact[]> {
    try {
      const response = await api.get('/search', {
        params: { q: query, limit }
      });
      return response.data.facts || [];
    } catch (error) {
      console.error('Error searching facts:', error);
      return [];
    }
  }

  async getCategories(): Promise<string[]> {
    try {
      const response = await api.get('/categories');
      return response.data.categories || [];
    } catch (error) {
      console.error('Error fetching categories:', error);
      return ['history', 'science', 'culture', 'nature', 'technology', 'art'];
    }
  }

  async getUserStats(userId: string): Promise<any> {
    try {
      const response = await api.get(`/users/${userId}/stats`);
      return response.data || {};
    } catch (error) {
      console.error('Error fetching user stats:', error);
      return {};
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