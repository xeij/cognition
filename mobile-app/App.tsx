import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';

import FeedScreen from './src/screens/FeedScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { AppProvider } from './src/context/AppContext';
import ErrorBoundary from './src/components/ErrorBoundary';

const Stack = createStackNavigator();

const AppContent = () => (
  <NavigationContainer>
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#000000" />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: '#000000' },
          animationEnabled: true,
          gestureEnabled: true,
        }}
      >
        <Stack.Screen 
          name="Feed" 
          component={FeedScreen}
          options={{
            // Add error boundary at screen level
            cardStyleInterpolator: ({ current }) => ({
              cardStyle: {
                opacity: current.progress,
              },
            }),
          }}
        />
        <Stack.Screen 
          name="Settings" 
          component={SettingsScreen}
          options={{
            // Add error boundary at screen level
            cardStyleInterpolator: ({ current }) => ({
              cardStyle: {
                opacity: current.progress,
              },
            }),
          }}
        />
      </Stack.Navigator>
    </View>
  </NavigationContainer>
);

export default function App() {
  const handleGlobalError = (error: Error, errorInfo: any) => {
    // Log to crash reporting service (e.g., Sentry, Crashlytics)
    console.error('Global app error:', error, errorInfo);
    
    // You could send to analytics service here
    // Analytics.recordError(error, errorInfo);
  };

  return (
    <ErrorBoundary 
      onError={handleGlobalError}
      resetOnPropsChange={true}
    >
      <SafeAreaProvider>
        <ErrorBoundary
          onError={handleGlobalError}
          resetKeys={['app-context']}
        >
          <AppProvider>
            <ErrorBoundary
              onError={handleGlobalError}
              resetKeys={['navigation']}
            >
              <AppContent />
            </ErrorBoundary>
          </AppProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
}); 