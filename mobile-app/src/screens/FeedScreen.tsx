import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Share from 'react-native-share';

import { useApp } from '../context/AppContext';
import { Fact } from '../context/AppContext';
import FactCard from '../components/FactCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorBoundary from '../components/ErrorBoundary';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FeedScreenProps {
  navigation: any;
}

const FeedScreen: React.FC<FeedScreenProps> = React.memo(({ navigation }) => {
  const { state, loadFacts, loadMoreFacts, likeFact, dislikeFact, shareFact, markFactAsRead } = useApp();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Mark current fact as read after 3 seconds
    const timer = setTimeout(() => {
      if (state.facts[currentIndex]) {
        markFactAsRead(state.facts[currentIndex].id);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [currentIndex, state.facts, markFactAsRead]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadFacts(true);
    } finally {
      setRefreshing(false);
    }
  }, [loadFacts]);

  const handleLoadMore = useCallback(async () => {
    if (state.hasMore && !state.loading) {
      await loadMoreFacts();
    }
  }, [state.hasMore, state.loading, loadMoreFacts]);

  const handleLike = useCallback(async (factId: string) => {
    await likeFact(factId);
  }, [likeFact]);

  const scrollToNext = useCallback(() => {
    if (currentIndex < state.facts.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    }
  }, [currentIndex, state.facts.length]);

  const handleDislike = useCallback(async (factId: string) => {
    await dislikeFact(factId);
    // Auto-scroll to next fact
    scrollToNext();
  }, [dislikeFact, scrollToNext]);

  const handleShare = useCallback(async (fact: Fact) => {
    try {
      const options = {
        message: `${fact.title}\n\n${fact.content}\n\nShared from Cognition App`,
        title: 'Interesting Fact',
      };
      await Share.open(options);
      await shareFact(fact.id);
    } catch (error) {
      console.error('Error sharing fact:', error);
    }
  }, [shareFact]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const index = viewableItems[0].index;
      setCurrentIndex(index);
      
      // Load more facts when approaching the end
      if (index >= state.facts.length - 3) {
        handleLoadMore();
      }
    }
  }, [state.facts.length, handleLoadMore]);

  const viewabilityConfig = useMemo(() => ({
    itemVisiblePercentThreshold: 50,
  }), []);

  const renderFact = useCallback(({ item, index }: { item: Fact; index: number }) => (
    <View style={styles.factContainer}>
      <FactCard
        fact={item}
        isActive={index === currentIndex}
        onLike={() => handleLike(item.id)}
        onDislike={() => handleDislike(item.id)}
        onShare={() => handleShare(item)}
        isLiked={state.user?.interactions.liked.includes(item.id) || false}
        isDisliked={state.user?.interactions.disliked.includes(item.id) || false}
      />
    </View>
  ), [currentIndex, handleLike, handleDislike, handleShare, state.user?.interactions.liked, state.user?.interactions.disliked]);

  const navigateToSettings = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  const renderHeader = useCallback(() => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.headerTitle}>Cognition</Text>
        <Text style={styles.headerSubtitle}>Discover • Learn • Grow</Text>
      </View>
      <TouchableOpacity
        style={styles.settingsButton}
        onPress={navigateToSettings}
      >
        <Ionicons name="settings-outline" size={24} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  ), [navigateToSettings]);

  const renderFooter = useCallback(() => {
    if (!state.loading) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingText}>Loading more facts...</Text>
      </View>
    );
  }, [state.loading]);

  const refreshControl = useMemo(() => (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      tintColor="#FFFFFF"
      colors={['#FFFFFF']}
    />
  ), [refreshing, handleRefresh]);

  const getItemLayout = useCallback((data: any, index: number) => ({
    length: SCREEN_HEIGHT - 100,
    offset: (SCREEN_HEIGHT - 100) * index,
    index,
  }), []);

  const keyExtractor = useCallback((item: Fact) => item.id, []);

  const retryLoadFacts = useCallback(() => {
    loadFacts(true);
  }, [loadFacts]);

  if (state.loading && state.facts.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  if (state.error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={48} color="#FF6B6B" />
          <Text style={styles.errorText}>Something went wrong</Text>
          <Text style={styles.errorSubtext}>{state.error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={retryLoadFacts}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      <FlatList
        ref={flatListRef}
        data={state.facts}
        renderItem={renderFact}
        keyExtractor={keyExtractor}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        refreshControl={refreshControl}
        getItemLayout={getItemLayout}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={true}
      />
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#AAAAAA',
    fontSize: 12,
    marginTop: 2,
  },
  settingsButton: {
    padding: 8,
  },
  factContainer: {
    height: SCREEN_HEIGHT - 100,
    backgroundColor: '#000000',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    textAlign: 'center',
  },
  errorSubtext: {
    color: '#AAAAAA',
    fontSize: 16,
    marginTop: 10,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    marginTop: 30,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default FeedScreen; 