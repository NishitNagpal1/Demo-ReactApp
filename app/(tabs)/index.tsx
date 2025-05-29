import { View, Text, TouchableOpacity, ImageBackground, StyleSheet, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useEffect } from 'react';
import { signInWithCredential, GoogleAuthProvider } from '@firebase/auth';
import { auth } from '../../firebase/config';

WebBrowser.maybeCompleteAuthSession();

export default function LandingScreen() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: '71497753587-qutr5nqpbdvorm83furgav4vffi7bc0i.apps.googleusercontent.com',
    androidClientId: '71497753587-qutr5nqpbdvorm83furgav4vffi7bc0i.apps.googleusercontent.com',
    webClientId: '71497753587-qutr5nqpbdvorm83furgav4vffi7bc0i.apps.googleusercontent.com',
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { accessToken } = response.authentication!;
      const credential = GoogleAuthProvider.credential(null, accessToken);
      signInWithCredential(auth, credential)
        .then(() => Alert.alert('✅ Signed in with Google'))
        .catch((err) => Alert.alert('Login Error', err.message));
    }
  }, [response]);

  return (
    <ImageBackground source={require('../../assets/bg.png')} style={styles.container}>
      <Text style={styles.logoText}>
        twin<Text style={styles.orangeDot}>i</Text>mind
      </Text>
      <TouchableOpacity style={styles.googleButton} onPress={() => promptAsync()}>
        <Text style={styles.buttonText}>Continue with Google</Text>
      </TouchableOpacity>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Privacy Policy</Text>
        <Text style={styles.footerText}>Terms of Service</Text>
      </View>
    </ImageBackground>
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
    marginBottom: 80,
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
    marginBottom: 20,
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
});