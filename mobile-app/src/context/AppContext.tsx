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
      
      // Load user data from AsyncStorage with error handling
      const userData = await safelyGetFromStorage('user');
      if (userData) {
        try {
          const user = JSON.parse(userData);
          dispatch({ type: 'SET_USER', payload: user });
        } catch (parseError) {
          console.error('Failed to parse user data from storage:', parseError);
          // Create default user if parsing fails
          await createDefaultUser();
        }
      } else {
        // Create default user
        await createDefaultUser();
      }

      // Load initial facts
      await loadFacts(true);
    } catch (error) {
      console.error('Failed to initialize app:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to initialize app' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const createDefaultUser = async () => {
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
    await safelySaveToStorage('user', JSON.stringify(defaultUser));
  };

  const safelyGetFromStorage = async (key: string, retries = 3): Promise<string | null> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const value = await AsyncStorage.getItem(key);
        return value;
      } catch (error) {
        console.error(`AsyncStorage getItem attempt ${attempt + 1} failed:`, error);
        if (attempt === retries - 1) {
          // Last attempt failed, throw error
          throw error;
        }
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
    return null;
  };

  const safelySaveToStorage = async (key: string, value: string, retries = 3): Promise<boolean> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await AsyncStorage.setItem(key, value);
        return true;
      } catch (error) {
        console.error(`AsyncStorage setItem attempt ${attempt + 1} failed:`, error);
        if (attempt === retries - 1) {
          // Last attempt failed, log error but don't throw
          console.error('Failed to save to storage after all retries:', error);
          return false;
        }
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
    return false;
  };

  const updateUserInStorage = async (updatedUser: User): Promise<boolean> => {
    try {
      const success = await safelySaveToStorage('user', JSON.stringify(updatedUser));
      if (!success) {
        console.error('Failed to save user data to storage');
        dispatch({ type: 'SET_ERROR', payload: 'Failed to save user preferences' });
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error updating user in storage:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to save user preferences' });
      return false;
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
      console.error('Failed to load facts:', error);
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
    if (!state.user) {
      dispatch({ type: 'SET_ERROR', payload: 'User not found' });
      return;
    }

    // Create updated user object
    const updatedUser: User = {
      ...state.user,
      interactions: {
        ...state.user.interactions,
        liked: [...state.user.interactions.liked, factId],
        disliked: state.user.interactions.disliked.filter(id => id !== factId)
      }
    };

    try {
      // First update the API
      await apiService.recordInteraction(state.user.id, factId, 'like');
      
      // Then update local state
      dispatch({ type: 'LIKE_FACT', payload: factId });
      
      // Finally update storage
      await updateUserInStorage(updatedUser);
    } catch (error) {
      console.error('Failed to like fact:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to like fact' });
    }
  };

  const dislikeFact = async (factId: string) => {
    if (!state.user) {
      dispatch({ type: 'SET_ERROR', payload: 'User not found' });
      return;
    }

    const updatedUser: User = {
      ...state.user,
      interactions: {
        ...state.user.interactions,
        disliked: [...state.user.interactions.disliked, factId],
        liked: state.user.interactions.liked.filter(id => id !== factId)
      }
    };

    try {
      await apiService.recordInteraction(state.user.id, factId, 'dislike');
      dispatch({ type: 'DISLIKE_FACT', payload: factId });
      await updateUserInStorage(updatedUser);
    } catch (error) {
      console.error('Failed to dislike fact:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to dislike fact' });
    }
  };

  const shareFact = async (factId: string) => {
    if (!state.user) {
      dispatch({ type: 'SET_ERROR', payload: 'User not found' });
      return;
    }

    const updatedUser: User = {
      ...state.user,
      interactions: {
        ...state.user.interactions,
        shared: [...state.user.interactions.shared, factId]
      }
    };

    try {
      await apiService.recordInteraction(state.user.id, factId, 'share');
      dispatch({ type: 'SHARE_FACT', payload: factId });
      await updateUserInStorage(updatedUser);
    } catch (error) {
      console.error('Failed to share fact:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to share fact' });
    }
  };

  const markFactAsRead = async (factId: string) => {
    if (!state.user) {
      return; // Silently fail for read tracking
    }

    // Check if already read to avoid duplicates
    if (state.user.interactions.read.includes(factId)) {
      return;
    }

    const updatedUser: User = {
      ...state.user,
      interactions: {
        ...state.user.interactions,
        read: [...state.user.interactions.read, factId]
      }
    };

    try {
      await apiService.recordInteraction(state.user.id, factId, 'read');
      dispatch({ type: 'READ_FACT', payload: factId });
      await updateUserInStorage(updatedUser);
    } catch (error) {
      console.error('Failed to mark fact as read:', error);
      // Don't show error to user for read tracking failures
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