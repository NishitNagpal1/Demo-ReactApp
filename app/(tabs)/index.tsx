import { View, Text, TouchableOpacity, ImageBackground, StyleSheet, Alert, Image, ScrollView, PermissionsAndroid, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import React, { useEffect, useState, useRef } from 'react';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import { initDB, saveTranscript, getTranscripts } from '../utils/db';

WebBrowser.maybeCompleteAuthSession();

export default function LandingScreen() {
  const [showMainApp, setShowMainApp] = useState(false);

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: '71497753587-qutr5nqpbdvorm83furgav4vffi7bc0i.apps.googleusercontent.com',
    androidClientId: '71497753587-qutr5nqpbdvorm83furgav4vffi7bc0i.apps.googleusercontent.com',
    webClientId: '71497753587-qutr5nqpbdvorm83furgav4vffi7bc0i.apps.googleusercontent.com',
    scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { accessToken } = response.authentication!;
      const credential = GoogleAuthProvider.credential(null, accessToken);
      signInWithCredential(auth, credential)
        .then(() => {
          Alert.alert('✅ Signed in with Google');
          AsyncStorage.setItem('googleAccessToken', accessToken);
          setShowMainApp(true);
        })
        .catch((err) => Alert.alert('Login Error', err.message));
    }
  }, [response]);

  const handleContinueAsGuest = () => {
    setShowMainApp(true);
  };

  if (showMainApp) {
    return <MainAppScreen />;
  }

  return (
    <ImageBackground
      source={require('../../assets/bg.png')}
      style={landingStyles.background}
      imageStyle={landingStyles.image}
      resizeMode="cover"
    >
      <View style={landingStyles.logoContainer}>
        <Text style={landingStyles.logoText}>TwinMind</Text>
      </View>
      <View style={landingStyles.spacer} />
      <View style={landingStyles.buttonContainer}>
        <TouchableOpacity style={landingStyles.googleButton} onPress={() => promptAsync()}>
          <Text style={landingStyles.buttonText}>Continue with Google</Text>
        </TouchableOpacity>
        <TouchableOpacity style={landingStyles.guestButton} onPress={handleContinueAsGuest}>
          <Text style={landingStyles.guestButtonText}>Continue as Guest</Text>
        </TouchableOpacity>
      </View>
      <View style={landingStyles.footer}>
        <Text style={landingStyles.footerText}>Privacy Policy</Text>
        <Text style={landingStyles.footerText}>Terms of Service</Text>
      </View>
    </ImageBackground>
  );
}

const landingStyles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  logoContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 80,
  },
  logoText: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 6,
  },
  spacer: {
    flex: 1,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 120,
  },
  googleButton: {
    backgroundColor: 'white',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    elevation: 2,
    marginBottom: 15,
    width: '85%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 16,
  },
  guestButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'white',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    marginBottom: 20,
    width: '85%',
    alignItems: 'center',
  },
  guestButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '80%',
  },
  footerText: {
    color: 'white',
    fontSize: 12,
  },
});

// Main App Component with enhanced audio capture
function MainAppScreen() {
  const [activeTab, setActiveTab] = useState('Memories');
  const [hoursCompleted] = useState(159);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  type TranscriptionSegment = { id: number; timestamp: number; text: string; duration: string };
  const [transcriptionSegments, setTranscriptionSegments] = useState<TranscriptionSegment[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  type AudioChunk = { uri: string | null; timestamp: number; processed: boolean };
  const [pendingAudioChunks, setPendingAudioChunks] = useState<AudioChunk[]>([]);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle, syncing, complete
  
  const recordingRef = useRef<Audio.Recording | null>(null);
  const segmentTimerRef = useRef<NodeJS.Timeout | number | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Monitor network connectivity
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
      if (state.isConnected && pendingAudioChunks.length > 0) {
        processPendingAudioChunks();
      }
    });

    return () => unsubscribe();
  }, [pendingAudioChunks]);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'This app needs access to your microphone to record audio for transcription.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  };

  const startRecording = async () => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        Alert.alert('Permission Required', 'Microphone permission is required for transcription.');
        return;
      }

      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(recording);
      setIsRecording(true);
      recordingRef.current = recording;

      // Start 30-second segment timer
      segmentTimerRef.current = setInterval(() => {
        processAudioSegment();
      }, 30000);

    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Recording Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      setIsRecording(false);
      setRecording(null);
      recordingRef.current = null;

      if (segmentTimerRef.current) {
        clearInterval(segmentTimerRef.current);
        segmentTimerRef.current = null;
      }

      // Process final segment
      await processAudioSegment(true);
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  };

  const processAudioSegment = async (isFinal = false) => {
    if (!recordingRef.current) return;

    try {
      // Create a new recording for the next segment if not final
      if (!isFinal) {
        const uri = recordingRef.current.getURI();
        const audioChunk = {
          uri,
          timestamp: Date.now(),
          processed: false
        };

        if (isOnline) {
          await transcribeAudioChunk(audioChunk);
        } else {
          // Buffer audio chunk for offline processing
          setPendingAudioChunks(prev => [...prev, audioChunk]);
          await AsyncStorage.setItem('pendingAudioChunks', JSON.stringify([...pendingAudioChunks, audioChunk]));
        }

        // Start new recording for next segment
        await recordingRef.current.stopAndUnloadAsync();
        const { recording: newRecording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        setRecording(newRecording);
        recordingRef.current = newRecording;
      }
    } catch (err) {
      console.error('Failed to process audio segment', err);
    }
  };

  const transcribeAudioChunk = async (audioChunk: { uri: string | null; timestamp: number; processed: boolean }, retryCount = 0) => {
    try {
      // Convert audio to Blob and append to FormData
      const formData = new FormData();
      if (audioChunk.uri) {
        // @ts-ignore: React Native FormData supports { uri, type, name }
        formData.append('audio', {
          uri: audioChunk.uri,
          type: 'audio/wav',
          name: 'audio.wav',
        } as any);
      }

      // Call Google Gemini 2.0 Flash API
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await AsyncStorage.getItem('googleAccessToken')}`,
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: "Please transcribe this audio segment accurately."
            }]
          }]
        })
      });

      if (response.ok) {
        const result = await response.json();
        const transcribedText = result.candidates[0]?.content?.parts[0]?.text || '';
        
        const newSegment = {
          id: Date.now() + Math.random(),
          timestamp: audioChunk.timestamp,
          text: transcribedText,
          duration: '30s'
        };

        setTranscriptionSegments(prev => [...prev, newSegment]);
        
        // Mark audio chunk as processed
        audioChunk.processed = true;
      } else {
        throw new Error('Transcription API error');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      
      // Implement exponential backoff retry
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000;
        setTimeout(() => {
          transcribeAudioChunk(audioChunk, retryCount + 1);
        }, delay);
      } else {
        // Add to pending chunks if all retries failed
        setPendingAudioChunks(prev => [...prev, audioChunk]);
      }
    }
  };

  const processPendingAudioChunks = async () => {
    if (pendingAudioChunks.length === 0) return;

    setSyncStatus('syncing');
    
    let chunksToProcess: AudioChunk[] = [];
    try {
      chunksToProcess = [...pendingAudioChunks];
      setPendingAudioChunks([]);

      for (const chunk of chunksToProcess) {
        if (!chunk.processed) {
          await transcribeAudioChunk(chunk);
        }
      }

      setSyncStatus('complete');
      setTimeout(() => setSyncStatus('idle'), 2000);
      
      // Clear from storage
      await AsyncStorage.removeItem('pendingAudioChunks');
    } catch (error) {
      console.error('Failed to process pending chunks:', error);
      setPendingAudioChunks(chunksToProcess);
      setSyncStatus('idle');
    }
  };

  const handleCapturePress = () => {
    router.push('/listening');
  };

  return (
    <View style={mainAppStyles.container}>
      {/* Header */}
      <View style={mainAppStyles.headerWrapper}>
        <View style={mainAppStyles.topBar}>
          <Image
            source={{ uri: 'https://i.pravatar.cc/300' }}
            style={mainAppStyles.avatar}
          />
          <View style={mainAppStyles.titleWithBadge}>
            <Text style={mainAppStyles.appTitle}>TwinMind</Text>
            <Text style={mainAppStyles.proBadge}>PRO</Text>
          </View>
          <TouchableOpacity>
            <Text style={mainAppStyles.helpText}>Help</Text>
          </TouchableOpacity>
        </View>

        <View style={mainAppStyles.progressCard}>
          <Text style={mainAppStyles.progressSub}>Capture 100 Hours to Unlock Features</Text>
          <Text style={mainAppStyles.progressTitle}>Building Your Second Brain</Text>
          <View style={mainAppStyles.progressBarBackground}>
            <View style={[mainAppStyles.progressBarFill, { width: `${Math.min((hoursCompleted / 100) * 100, 100)}%` }]} />
          </View>
          <Text style={mainAppStyles.progressValue}>{hoursCompleted} / 100 hours</Text>
        </View>

        {/* Sync Status Indicator */}
        {syncStatus !== 'idle' && (
          <View style={mainAppStyles.syncStatusContainer}>
            <Text style={mainAppStyles.syncStatusText}>
              {syncStatus === 'syncing' ? '🔄 Syncing pending...' : '✅ Syncing complete'}
            </Text>
          </View>
        )}
      </View>

      {/* Tab Navigation - Now perfectly aligned */}
      <View style={mainAppStyles.tabContainer}>
        {['Memories', 'Calendar', 'Questions'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              mainAppStyles.tab,
              activeTab === tab && mainAppStyles.activeTab
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[
              mainAppStyles.tabText,
              activeTab === tab && mainAppStyles.activeTabText
            ]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content Area */}
      <View style={mainAppStyles.contentContainer}>
        {activeTab === 'Memories' && <MemoriesTab transcriptionSegments={transcriptionSegments} />}
        {activeTab === 'Calendar' && <CalendarTab />}
        {activeTab === 'Questions' && <QuestionsTab />}
      </View>

      {/* Recording Status */}
      {isRecording && (
        <View style={mainAppStyles.recordingStatus}>
          <Text style={mainAppStyles.recordingText}>🔴 Recording... {!isOnline ? '(Offline)' : ''}</Text>
        </View>
      )}

      {/* Bottom Actions */}
      <View style={mainAppStyles.bottomActions}>
        <TouchableOpacity style={mainAppStyles.askButton}>
          <Text style={mainAppStyles.askButtonText}>🔍 Ask All Memories</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            mainAppStyles.captureButton,
            isRecording && mainAppStyles.captureButtonActive
          ]}
          onPress={handleCapturePress}
        >
          <Text style={mainAppStyles.captureButtonText}>
            {isRecording ? '⏹️ Stop' : '🎤 Capture'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Enhanced Memories Tab with transcription segments
type TranscriptionSegment = { id: number; timestamp: number; text: string; duration: string };

function MemoriesTab({ transcriptionSegments }: { transcriptionSegments: TranscriptionSegment[] }) {
  const memories = [
    {
      id: 1,
      date: 'Mon, May 12',
      time: '3:21',
      title: 'TwinMind App Development Discussion and Public Speaking Practice',
      duration: '1h 43m'
    },
    {
      id: 2,
      date: 'Sat, May 10',
      time: '9:49',
      title: 'TwinMind AI App Overview, Founder\'s Conversation and Goal Planning',
      duration: '2h 14m'
    },
    {
      id: 3,
      date: 'Fri, May 9',
      time: '4:50',
      title: 'TwinMind Features Discussion, Audio Saving Options, UI Simplification, and Co...',
      duration: '1h 38m'
    },
    {
      id: 4,
      date: 'Thu, May 8',
      time: '2:30',
      title: 'TwinMind Product Strategy and UX Improvement Discussion with Rita, Da...',
      duration: '45m'
    }
  ];

  return (
    <ScrollView style={mainAppStyles.memoriesContainer} showsVerticalScrollIndicator={false}>
      {/* Live Transcription Section */}
      {transcriptionSegments.length > 0 && (
        <View style={mainAppStyles.liveTranscriptionSection}>
          <Text style={mainAppStyles.sectionTitle}>Live Transcription</Text>
          {transcriptionSegments.map((segment) => (
            <View key={segment.id} style={mainAppStyles.transcriptionCard}>
              <View style={mainAppStyles.transcriptionHeader}>
                <Text style={mainAppStyles.transcriptionTime}>
                  {new Date(segment.timestamp).toLocaleTimeString()}
                </Text>
                <Text style={mainAppStyles.transcriptionDuration}>{segment.duration}</Text>
              </View>
              <Text style={mainAppStyles.transcriptionText}>{segment.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Existing Memories */}
      <Text style={mainAppStyles.sectionTitle}>Past Memories</Text>
      {memories.map((memory) => (
        <View key={memory.id} style={mainAppStyles.memoryCard}>
          <View style={mainAppStyles.memoryHeader}>
            <Text style={mainAppStyles.memoryDate}>{memory.date}</Text>
            <Text style={mainAppStyles.memoryDuration}>{memory.duration}</Text>
          </View>
          <View style={mainAppStyles.memoryContent}>
            <Text style={mainAppStyles.memoryTime}>{memory.time}</Text>
            <Text style={mainAppStyles.memoryTitle}>{memory.title}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// Enhanced Calendar Tab with Google Calendar Integration
type CalendarEvent = {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  description?: string;
  [key: string]: any;
};

function CalendarTab() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    checkCalendarConnection();
  }, []);

  const checkCalendarConnection = async () => {
    const token = await AsyncStorage.getItem('googleAccessToken');
    setIsConnected(!!token);
    if (token) {
      fetchCalendarEvents();
    }
  };

  const connectGoogleCalendar = async () => {
    // This would trigger the OAuth flow again with calendar permissions
    Alert.alert(
      'Connect Google Calendar',
      'Please sign in again to grant calendar access permissions.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Connect', onPress: () => {
          // Trigger OAuth flow with calendar scopes
          console.log('Triggering calendar OAuth flow...');
        }}
      ]
    );
  };

  const fetchCalendarEvents = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('googleAccessToken');
      const now = new Date().toISOString();
      const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // Next 7 days

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setEvents(data.items || []);
      } else {
        throw new Error('Failed to fetch calendar events');
      }
    } catch (error) {
      console.error('Calendar fetch error:', error);
      Alert.alert('Error', 'Failed to fetch calendar events. Please try reconnecting.');
    } finally {
      setLoading(false);
    }
  };

  const refreshEvents = () => {
    fetchCalendarEvents();
  };

  if (!isConnected) {
    return (
      <View style={mainAppStyles.calendarConnectContainer}>
        <Text style={mainAppStyles.connectTitle}>Connect Your Google Calendar</Text>
        <Text style={mainAppStyles.connectDescription}>
          View your upcoming events and meetings directly in TwinMind
        </Text>
        <TouchableOpacity style={mainAppStyles.connectButton} onPress={connectGoogleCalendar}>
          <Text style={mainAppStyles.connectButtonText}>📅 Connect Google Calendar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={mainAppStyles.calendarContainer} showsVerticalScrollIndicator={false}>
      <View style={mainAppStyles.calendarHeader}>
        <Text style={mainAppStyles.sectionTitle}>Upcoming Events</Text>
        <TouchableOpacity onPress={refreshEvents} disabled={loading}>
          <Text style={mainAppStyles.refreshText}>{loading ? '⏳' : '🔄'} Refresh</Text>
        </TouchableOpacity>
      </View>

      {events.length === 0 ? (
        <View style={mainAppStyles.placeholderContainer}>
          <Text style={mainAppStyles.placeholderText}>
            {loading ? 'Loading events...' : 'No upcoming events'}
          </Text>
        </View>
      ) : (
        events.map((event, index) => (
          <View key={event.id || index} style={mainAppStyles.eventCard}>
            <View style={mainAppStyles.eventHeader}>
              <Text style={mainAppStyles.eventTitle}>{event.summary || 'Untitled Event'}</Text>
              <Text style={mainAppStyles.eventDate}>
                {event.start?.dateTime ? 
                  new Date(event.start.dateTime).toLocaleDateString() :
                  new Date(event.start?.date ?? '').toLocaleDateString()
                }
              </Text>
            </View>
            <View style={mainAppStyles.eventDetails}>
              <Text style={mainAppStyles.eventTime}>
                {event.start?.dateTime ? 
                  (() => {
                    const startTime = new Date(event.start.dateTime).toLocaleTimeString();
                    const endTime = event.end?.dateTime ? new Date(event.end.dateTime).toLocaleTimeString() : '';
                    return endTime ? `${startTime} - ${endTime}` : startTime;
                  })() :
                  'All day'
                }
              </Text>
              {event.location && (
                <Text style={mainAppStyles.eventLocation}>📍 {event.location}</Text>
              )}
              {event.description && (
                <Text style={mainAppStyles.eventDescription} numberOfLines={2}>
                  {event.description}
                </Text>
              )}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

// Questions Tab Component
function QuestionsTab() {
  return (
    <View style={mainAppStyles.placeholderContainer}>
      <Text style={mainAppStyles.placeholderText}>Questions view coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    resizeMode: 'cover',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  logoText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 60,
  },
  orangeDot: {
    color: 'orange',
  },
  googleButton: {
    backgroundColor: 'white',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    elevation: 2,
    marginBottom: 15,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#000',
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '80%',
  },
  footerText: {
    color: 'white',
    fontSize: 12,
  },
  guestButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'white',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
  },
  guestButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});

const mainAppStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  connectTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  headerWrapper: {
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginRight: 6,
    color: '#000',
  },
  proBadge: {
    backgroundColor: '#007AFF',
    color: '#fff',
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: 'bold',
  },
  helpText: {
    color: '#007AFF',
    fontWeight: '500',
    fontSize: 16,
  },
  progressCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
  },
  progressSub: {
    fontSize: 12,
    color: '#FF6B35',
    fontWeight: '500',
    marginBottom: 2,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  progressBarBackground: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E0E0E0',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    backgroundColor: '#FF6B35',
    borderRadius: 3,
  },
  progressValue: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'right',
  },
  syncStatusContainer: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
  },
  syncStatusText: {
    fontSize: 12,
    color: '#007AFF',
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  activeTab: {
    backgroundColor: '#FF6B35',
  },
  tabText: {
    color: '#666',
    fontWeight: '500',
    fontSize: 14,
  },
  activeTabText: {
    color: '#fff',
    fontWeight: '600',
  },
  contentContainer: {
    flex: 1,
  },
  memoriesContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  liveTranscriptionSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginHorizontal: 20,
    marginVertical: 16,
  },
  transcriptionCard: {
    backgroundColor: '#E8F4FD',
    marginHorizontal: 20,
    marginVertical: 4,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  transcriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  transcriptionTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  transcriptionDuration: {
    fontSize: 12,
    color: '#666',
  },
  transcriptionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  memoryCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginVertical: 6,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  memoryDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  memoryDuration: {
    fontSize: 12,
    color: '#666',
  },
  memoryContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  memoryTime: {
    fontSize: 12,
    color: '#999',
    marginRight: 12,
    marginTop: 2,
    minWidth: 30,
  },
  memoryTitle: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    flex: 1,
  },
  calendarConnectContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  connectButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 25,
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  connectButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  calendarContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  refreshText: {
    color: '#007AFF',
    fontWeight: '500',
    fontSize: 14,
  },
  eventCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginVertical: 6,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    marginRight: 12,
  },
  eventDate: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
  eventDetails: {
    marginTop: 4,
  },
  eventTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  eventLocation: {
    fontSize: 13,
    color: '#FF6B35',
    marginBottom: 4,
  },
  eventDescription: {
    fontSize: 13,
    color: '#999',
    lineHeight: 18,
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    color: '#666',
  },
  recordingStatus: {
    position: 'absolute',
    top: 100,
    right: 20,
    backgroundColor: 'rgba(255, 0, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 1000,
  },
  recordingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  askButton: {
    backgroundColor: '#F5F5F5',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  askButtonText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 14,
  },
  captureButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 25,
    alignItems: 'center',
  },
  captureButtonActive: {
    backgroundColor: '#FF3B30',
  },
  captureButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  connectDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
});

// Call initDB() once, e.g. in useEffect in your main/root component
useEffect(() => {
  initDB();
}, []);