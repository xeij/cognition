import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';

interface SettingsScreenProps {
  navigation: any;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const { state } = useApp();
  const [preferences, setPreferences] = useState(state.user?.preferences || {
    categories: ['history', 'science', 'culture', 'nature'],
    difficulty: 'intermediate',
    readingTime: 5,
  });

  const categories = [
    { name: 'History', key: 'history', icon: '🏛️' },
    { name: 'Science', key: 'science', icon: '🔬' },
    { name: 'Culture', key: 'culture', icon: '🎭' },
    { name: 'Nature', key: 'nature', icon: '🌿' },
    { name: 'Technology', key: 'technology', icon: '💻' },
    { name: 'Art', key: 'art', icon: '🎨' },
    { name: 'Philosophy', key: 'philosophy', icon: '🤔' },
    { name: 'Politics', key: 'politics', icon: '🏛️' },
    { name: 'Sports', key: 'sports', icon: '⚽' },
    { name: 'Entertainment', key: 'entertainment', icon: '🎬' },
  ];

  const difficultyLevels = [
    { name: 'Beginner', key: 'beginner', icon: '🟢', description: 'Easy to understand' },
    { name: 'Intermediate', key: 'intermediate', icon: '🟡', description: 'Moderate complexity' },
    { name: 'Advanced', key: 'advanced', icon: '🔴', description: 'Complex topics' },
  ];

  const readingTimes = [
    { name: '2-3 minutes', value: 3 },
    { name: '4-5 minutes', value: 5 },
    { name: '6-8 minutes', value: 8 },
    { name: '9+ minutes', value: 10 },
  ];

  const toggleCategory = (category: string) => {
    const newCategories = preferences.categories.includes(category)
      ? preferences.categories.filter(c => c !== category)
      : [...preferences.categories, category];
    
    setPreferences({
      ...preferences,
      categories: newCategories,
    });
  };

  const setDifficulty = (difficulty: string) => {
    setPreferences({
      ...preferences,
      difficulty,
    });
  };

  const setReadingTime = (readingTime: number) => {
    setPreferences({
      ...preferences,
      readingTime,
    });
  };

  const savePreferences = () => {
    // Here you would save to backend and update context
    Alert.alert('Preferences Saved', 'Your preferences have been updated successfully!');
    navigation.goBack();
  };

  const resetPreferences = () => {
    Alert.alert(
      'Reset Preferences',
      'Are you sure you want to reset all preferences to default?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setPreferences({
              categories: ['history', 'science', 'culture', 'nature'],
              difficulty: 'intermediate',
              readingTime: 5,
            });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity style={styles.saveButton} onPress={savePreferences}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Categories Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Interests</Text>
          <Text style={styles.sectionDescription}>
            Choose topics you're interested in learning about
          </Text>
          <View style={styles.categoriesGrid}>
            {categories.map((category) => (
              <TouchableOpacity
                key={category.key}
                style={[
                  styles.categoryItem,
                  preferences.categories.includes(category.key) && styles.categoryItemActive,
                ]}
                onPress={() => toggleCategory(category.key)}
              >
                <Text style={styles.categoryIcon}>{category.icon}</Text>
                <Text
                  style={[
                    styles.categoryText,
                    preferences.categories.includes(category.key) && styles.categoryTextActive,
                  ]}
                >
                  {category.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Difficulty Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Difficulty Level</Text>
          <Text style={styles.sectionDescription}>
            Choose your preferred content complexity
          </Text>
          {difficultyLevels.map((level) => (
            <TouchableOpacity
              key={level.key}
              style={[
                styles.difficultyItem,
                preferences.difficulty === level.key && styles.difficultyItemActive,
              ]}
              onPress={() => setDifficulty(level.key)}
            >
              <View style={styles.difficultyLeft}>
                <Text style={styles.difficultyIcon}>{level.icon}</Text>
                <View>
                  <Text style={styles.difficultyName}>{level.name}</Text>
                  <Text style={styles.difficultyDescription}>{level.description}</Text>
                </View>
              </View>
              <View style={styles.radioButton}>
                {preferences.difficulty === level.key && (
                  <View style={styles.radioButtonInner} />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Reading Time Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reading Time</Text>
          <Text style={styles.sectionDescription}>
            Preferred length of facts to read
          </Text>
          {readingTimes.map((time) => (
            <TouchableOpacity
              key={time.value}
              style={[
                styles.readingTimeItem,
                preferences.readingTime === time.value && styles.readingTimeItemActive,
              ]}
              onPress={() => setReadingTime(time.value)}
            >
              <Text style={styles.readingTimeName}>{time.name}</Text>
              <View style={styles.radioButton}>
                {preferences.readingTime === time.value && (
                  <View style={styles.radioButtonInner} />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* App Stats Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Stats</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{state.user?.interactions.read.length || 0}</Text>
              <Text style={styles.statLabel}>Facts Read</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{state.user?.interactions.liked.length || 0}</Text>
              <Text style={styles.statLabel}>Liked</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{state.user?.interactions.shared.length || 0}</Text>
              <Text style={styles.statLabel}>Shared</Text>
            </View>
          </View>
        </View>

        {/* Reset Button */}
        <TouchableOpacity style={styles.resetButton} onPress={resetPreferences}>
          <Text style={styles.resetButtonText}>Reset to Default</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 16,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginVertical: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  sectionDescription: {
    color: '#AAAAAA',
    fontSize: 16,
    marginBottom: 20,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryItemActive: {
    backgroundColor: '#4A90E2',
    borderColor: '#4A90E2',
  },
  categoryIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  categoryText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  categoryTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  difficultyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#333333',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  difficultyItemActive: {
    backgroundColor: '#4A90E2',
    borderColor: '#4A90E2',
  },
  difficultyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  difficultyIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  difficultyName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  difficultyDescription: {
    color: '#AAAAAA',
    fontSize: 14,
  },
  readingTimeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#333333',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  readingTimeItemActive: {
    backgroundColor: '#4A90E2',
    borderColor: '#4A90E2',
  },
  readingTimeName: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#AAAAAA',
    fontSize: 14,
    marginTop: 5,
  },
  resetButton: {
    backgroundColor: '#FF6B6B',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginVertical: 20,
  },
  resetButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SettingsScreen; 