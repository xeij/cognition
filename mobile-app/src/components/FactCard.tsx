import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Fact } from '../context/AppContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FactCardProps {
  fact: Fact;
  isActive: boolean;
  onLike: () => void;
  onDislike: () => void;
  onShare: () => void;
  isLiked: boolean;
  isDisliked: boolean;
}

const FactCard: React.FC<FactCardProps> = ({
  fact,
  isActive,
  onLike,
  onDislike,
  onShare,
  isLiked,
  isDisliked,
}) => {
  const [likeAnimation] = useState(new Animated.Value(1));
  const [dislikeAnimation] = useState(new Animated.Value(1));
  const [shareAnimation] = useState(new Animated.Value(1));
  const [fadeAnimation] = useState(new Animated.Value(0));

  useEffect(() => {
    if (isActive) {
      Animated.timing(fadeAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnimation.setValue(0);
    }
  }, [isActive]);

  const animateButton = (animation: Animated.Value, callback: () => void) => {
    Animated.sequence([
      Animated.timing(animation, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(animation, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
    callback();
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      history: '#FFD700',
      science: '#4A90E2',
      culture: '#FF6B6B',
      nature: '#4CAF50',
      technology: '#9C27B0',
      art: '#FF9800',
      philosophy: '#795548',
      politics: '#607D8B',
      sports: '#2196F3',
      entertainment: '#E91E63',
    };
    return colors[category.toLowerCase()] || '#FFFFFF';
  };

  const getDifficultyIcon = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return '🟢';
      case 'intermediate':
        return '🟡';
      case 'advanced':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const formatReadingTime = (minutes: number) => {
    return `${minutes} min read`;
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnimation }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.categoryContainer}>
            <View
              style={[
                styles.categoryTag,
                { backgroundColor: getCategoryColor(fact.category) },
              ]}
            >
              <Text style={styles.categoryText}>{fact.category.toUpperCase()}</Text>
            </View>
            <Text style={styles.difficultyText}>
              {getDifficultyIcon(fact.difficulty)} {fact.difficulty}
            </Text>
          </View>
          <View style={styles.metaContainer}>
            <Text style={styles.readingTime}>{formatReadingTime(fact.readingTime)}</Text>
            <Text style={styles.popularity}>⭐ {fact.popularity}/100</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{fact.title}</Text>

        {/* Content */}
        <Text style={styles.content}>{fact.content}</Text>

        {/* Tags */}
        <View style={styles.tagsContainer}>
          {fact.tags.map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>#{tag}</Text>
            </View>
          ))}
        </View>

        {/* Source */}
        <View style={styles.sourceContainer}>
          <Text style={styles.sourceText}>Source: {fact.source}</Text>
          <Text style={styles.dateText}>
            {new Date(fact.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        <Animated.View style={{ transform: [{ scale: dislikeAnimation }] }}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.dislikeButton,
              isDisliked && styles.dislikedButton,
            ]}
            onPress={() => animateButton(dislikeAnimation, onDislike)}
          >
            <Ionicons
              name={isDisliked ? 'thumbs-down' : 'thumbs-down-outline'}
              size={24}
              color={isDisliked ? '#FF6B6B' : '#AAAAAA'}
            />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ transform: [{ scale: likeAnimation }] }}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.likeButton,
              isLiked && styles.likedButton,
            ]}
            onPress={() => animateButton(likeAnimation, onLike)}
          >
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={28}
              color={isLiked ? '#FF6B6B' : '#FFFFFF'}
            />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ transform: [{ scale: shareAnimation }] }}>
          <TouchableOpacity
            style={[styles.actionButton, styles.shareButton]}
            onPress={() => animateButton(shareAnimation, onShare)}
          >
            <Ionicons name="share-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  categoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 10,
  },
  categoryText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  difficultyText: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  metaContainer: {
    alignItems: 'flex-end',
  },
  readingTime: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  popularity: {
    color: '#AAAAAA',
    fontSize: 12,
    marginTop: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    lineHeight: 36,
    marginBottom: 20,
  },
  content: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 28,
    marginBottom: 30,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  tag: {
    backgroundColor: '#333333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  sourceContainer: {
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  sourceText: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  dateText: {
    color: '#666666',
    fontSize: 10,
    marginTop: 4,
  },
  actionContainer: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    alignItems: 'center',
  },
  actionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  likeButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
  },
  likedButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    borderColor: '#FF6B6B',
  },
  dislikeButton: {
    backgroundColor: 'rgba(170, 170, 170, 0.1)',
  },
  dislikedButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderColor: '#FF6B6B',
  },
  shareButton: {
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
  },
});

export default FactCard; 