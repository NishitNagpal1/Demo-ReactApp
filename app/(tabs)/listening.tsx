import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { initDB, saveTranscript, getTranscripts } from '../utils/db';

const GEMINI_API_KEY = 'AIzaSyDV42isVd3ntMJvqjD_5U_-ApGVECullBI';
const TABS = ['Searches', 'Notes', 'Transcript'] as const;
type Tab = typeof TABS[number];

export default function ListeningScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('Searches');
  const [timer, setTimer] = useState(0);
  const [isRecording, setIsRecording] = useState(true);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [savedTranscripts, setSavedTranscripts] = useState<string[]>([]);
  const timerRef = useRef<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    initDB();
    getTranscripts(rows => setSavedTranscripts(rows.map(r => r.content)));
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    startRecording();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopRecording();
    };
  }, []);

  // Format timer as HH:MM:SS
  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600).toString().padStart(2, '0');
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  async function startRecording() {
    try {
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
    } catch (e) {
      setIsRecording(false);
      Alert.alert('Could not start recording');
    }
  }

  async function stopRecording() {
    if (!recording) return;
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    if (uri) {
      await transcribeAudio(uri);
    }
  }

  async function transcribeAudio(uri: string) {
    try {
      // Read audio as base64
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      // Gemini API expects text, so you need to use a speech-to-text API first.
      // For demo, we'll just add a fake transcript.
      // Replace this with your actual Gemini integration.
      const geminiResponse = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + GEMINI_API_KEY,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: "Transcribe this meeting audio: [audio omitted for demo, use speech-to-text first]"
              }]
            }]
          })
        }
      );
      const result = await geminiResponse.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || 'Transcription not available.';
      setTranscript([text]);
      saveTranscript(text);
      getTranscripts(rows => setSavedTranscripts(rows.map(r => r.content)));
    } catch (e) {
      setTranscript(['Transcription failed.']);
    }
  }

  function handleStop() {
    stopRecording();
    router.back();
  }

  function handleSave() {
    if (transcript.length > 0) {
      saveTranscript(transcript.join('\n'));
      getTranscripts(rows => setSavedTranscripts(rows.map(r => r.content)));
      Alert.alert('Saved', 'Transcript saved locally.');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.home}>Home</Text>
        <Text style={styles.timer}>🔴 {formatTime(timer)}</Text>
        <TouchableOpacity>
          <Text style={styles.share}>⤴️</Text>
        </TouchableOpacity>
      </View>
      {/* Title and Details */}
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>Here is a really, really long title</Text>
        <Text style={styles.details}>November 24, 2025  •  12:10PM  •  San Francisco</Text>
        <Text style={styles.participants}>👩‍💼👨‍💼 Bean +2</Text>
        <Text style={styles.link}>See details</Text>
      </View>
      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Tab Content */}
      <View style={styles.tabContent}>
        {activeTab === 'Searches' && (
          <View style={styles.centered}>
            <Text style={styles.pullDown}>↓ Pull down to get suggested searches</Text>
            <Text style={styles.listeningText}>
              TwinMind is listening in the background{'\n'}
              <Text style={styles.secondaryText}>Leave it on during your <Text style={styles.highlight}>meeting</Text> or conversations.</Text>
            </Text>
          </View>
        )}
        {activeTab === 'Notes' && (
          <View style={styles.centered}>
            <Text style={styles.placeholder}>Notes feature coming soon.</Text>
          </View>
        )}
        {activeTab === 'Transcript' && (
          <ScrollView style={{flex: 1}}>
            {transcript.length === 0 ? (
              <Text style={styles.placeholder}>Transcript will appear here after you stop recording.</Text>
            ) : (
              <>
                {transcript.map((line, idx) => (
                  <Text key={idx} style={styles.transcriptLine}>{line}</Text>
                ))}
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>💾 Save Transcript</Text>
                </TouchableOpacity>
                <Text style={styles.sectionTitle}>Saved Transcripts</Text>
                {savedTranscripts.map((t, i) => (
                  <Text key={i} style={styles.savedTranscript}>{t}</Text>
                ))}
              </>
            )}
          </ScrollView>
        )}
      </View>
      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.getAnswer}>
          <Text style={styles.getAnswerText}>Tap to Get Answer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chatBtn}>
          <Text style={styles.chatBtnText}>Chat with Transcript</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
          <Text style={styles.stopBtnText}>Stop</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  home: { color: '#007AFF', fontWeight: '600', fontSize: 16 },
  timer: { color: '#FF3B30', fontWeight: '700', fontSize: 16 },
  share: { fontSize: 18, color: '#007AFF' },
  titleBlock: { paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 2 },
  details: { color: '#888', fontSize: 13 },
  participants: { color: '#888', fontSize: 13, marginBottom: 2 },
  link: { color: '#007AFF', fontSize: 13, marginBottom: 8 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E0E0E0', marginHorizontal: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#007AFF' },
  tabText: { color: '#888', fontWeight: '500' },
  activeTabText: { color: '#007AFF', fontWeight: '700' },
  tabContent: { flex: 1, padding: 16 },
  centered: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  pullDown: { color: '#888', marginBottom: 20 },
  listeningText: { color: '#222', fontWeight: '600', textAlign: 'center', marginTop: 30 },
  secondaryText: { color: '#888', fontWeight: '400' },
  highlight: { backgroundColor: '#FFF59D', color: '#222' },
  placeholder: { color: '#888', textAlign: 'center', marginTop: 40 },
  transcriptLine: { color: '#333', marginBottom: 8, fontSize: 15 },
  saveBtn: { backgroundColor: '#E3EAFD', padding: 10, borderRadius: 20, alignItems: 'center', marginVertical: 10 },
  saveBtnText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#007AFF', marginTop: 20 },
  savedTranscript: { color: '#666', fontSize: 13, marginTop: 6 },
  bottomBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  getAnswer: { backgroundColor: '#E3EAFD', padding: 10, borderRadius: 20, flex: 1, marginRight: 6, alignItems: 'center' },
  getAnswerText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },
  chatBtn: { backgroundColor: '#F5F5F5', padding: 10, borderRadius: 20, flex: 1, marginRight: 6, alignItems: 'center' },
  chatBtnText: { color: '#222', fontWeight: '600', fontSize: 14 },
  stopBtn: { backgroundColor: '#FF3B30', padding: 10, borderRadius: 20, flex: 1, alignItems: 'center' },
  stopBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});