import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '../services/api';

export interface Fact {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  readingTime: number;
  createdAt: string;
  source: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  popularity: number;
}

export interface User {
  id: string;
  preferences: {
    categories: string[];
    difficulty: string;
    readingTime: number;
  };
  interactions: {
    liked: string[];
    disliked: string[];
    shared: string[];
    read: string[];
  };
}

interface AppState {
  facts: Fact[];
  currentFactIndex: number;
  user: User | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
}

type AppAction =
  | { type: 'SET_FACTS'; payload: Fact[] }
  | { type: 'ADD_FACTS'; payload: Fact[] }
  | { type: 'SET_CURRENT_FACT_INDEX'; payload: number }
  | { type: 'SET_USER'; payload: User }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_HAS_MORE'; payload: boolean }
  | { type: 'LIKE_FACT'; payload: string }
  | { type: 'DISLIKE_FACT'; payload: string }
  | { type: 'SHARE_FACT'; payload: string }
  | { type: 'READ_FACT'; payload: string };

const initialState: AppState = {
  facts: [],
  currentFactIndex: 0,
  user: null,
  loading: false,
  error: null,
  hasMore: true,
};

const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_FACTS':
      return { ...state, facts: action.payload };
    case 'ADD_FACTS':
      return { 
        ...state, 
        facts: [...state.facts, ...action.payload],
        hasMore: action.payload.length > 0
      };
    case 'SET_CURRENT_FACT_INDEX':
      return { ...state, currentFactIndex: action.payload };
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_HAS_MORE':
      return { ...state, hasMore: action.payload };
    case 'LIKE_FACT':
      return {
        ...state,
        user: state.user ? {
          ...state.user,
          interactions: {
            ...state.user.interactions,
            liked: [...state.user.interactions.liked, action.payload],
            disliked: state.user.interactions.disliked.filter(id => id !== action.payload)
          }
        } : null
      };
    case 'DISLIKE_FACT':
      return {
        ...state,
        user: state.user ? {
          ...state.user,
          interactions: {
            ...state.user.interactions,
            disliked: [...state.user.interactions.disliked, action.payload],
            liked: state.user.interactions.liked.filter(id => id !== action.payload)
          }
        } : null
      };
    case 'SHARE_FACT':
      return {
        ...state,
        user: state.user ? {
          ...state.user,
          interactions: {
            ...state.user.interactions,
            shared: [...state.user.interactions.shared, action.payload]
          }
        } : null
      };
    case 'READ_FACT':
      return {
        ...state,
        user: state.user ? {
          ...state.user,
          interactions: {
            ...state.user.interactions,
            read: [...state.user.interactions.read, action.payload]
          }
        } : null
      };
    default:
      return state;
  }
};

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  loadFacts: (refresh?: boolean) => Promise<void>;
  loadMoreFacts: () => Promise<void>;
  likeFact: (factId: string) => Promise<void>;
  dislikeFact: (factId: string) => Promise<void>;
  shareFact: (factId: string) => Promise<void>;
  markFactAsRead: (factId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      // Load user data from AsyncStorage
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        dispatch({ type: 'SET_USER', payload: user });
      } else {
        // Create default user
        const defaultUser: User = {
          id: `user_${Date.now()}`,
          preferences: {
            categories: ['history', 'science', 'culture', 'nature'],
            difficulty: 'intermediate',
            readingTime: 5
          },
          interactions: {
            liked: [],
            disliked: [],
            shared: [],
            read: []
          }
        };
        dispatch({ type: 'SET_USER', payload: defaultUser });
        await AsyncStorage.setItem('user', JSON.stringify(defaultUser));
      }

      // Load initial facts
      await loadFacts(true);
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to initialize app' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const loadFacts = async (refresh = false) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const facts = await apiService.getFacts({
        userId: state.user?.id,
        limit: 10,
        offset: refresh ? 0 : state.facts.length
      });

      if (refresh) {
        dispatch({ type: 'SET_FACTS', payload: facts });
      } else {
        dispatch({ type: 'ADD_FACTS', payload: facts });
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load facts' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const loadMoreFacts = async () => {
    if (!state.hasMore || state.loading) return;
    await loadFacts(false);
  };

  const likeFact = async (factId: string) => {
    try {
      dispatch({ type: 'LIKE_FACT', payload: factId });
      await apiService.recordInteraction(state.user?.id!, factId, 'like');
      
      // Update user data in AsyncStorage
      if (state.user) {
        await AsyncStorage.setItem('user', JSON.stringify(state.user));
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to like fact' });
    }
  };

  const dislikeFact = async (factId: string) => {
    try {
      dispatch({ type: 'DISLIKE_FACT', payload: factId });
      await apiService.recordInteraction(state.user?.id!, factId, 'dislike');
      
      if (state.user) {
        await AsyncStorage.setItem('user', JSON.stringify(state.user));
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to dislike fact' });
    }
  };

  const shareFact = async (factId: string) => {
    try {
      dispatch({ type: 'SHARE_FACT', payload: factId });
      await apiService.recordInteraction(state.user?.id!, factId, 'share');
      
      if (state.user) {
        await AsyncStorage.setItem('user', JSON.stringify(state.user));
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to share fact' });
    }
  };

  const markFactAsRead = async (factId: string) => {
    try {
      dispatch({ type: 'READ_FACT', payload: factId });
      await apiService.recordInteraction(state.user?.id!, factId, 'read');
      
      if (state.user) {
        await AsyncStorage.setItem('user', JSON.stringify(state.user));
      }
    } catch (error) {
      console.error('Failed to mark fact as read:', error);
    }
  };

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        loadFacts,
        loadMoreFacts,
        likeFact,
        dislikeFact,
        shareFact,
        markFactAsRead,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}; 