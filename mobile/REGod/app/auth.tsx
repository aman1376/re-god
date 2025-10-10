import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import TeacherCodeInput from '../components/TeacherCodeInput';
import { useAuth as useAuthContext } from '../src/contexts/AuthContext';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  Image,
  Animated,
  Easing,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { VideoView, useVideoPlayer, VideoSource } from 'expo-video';
import { setAudioModeAsync } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSignIn, useSignUp, isClerkAPIResponseError, useSSO, useUser, useClerk } from '@clerk/clerk-expo';
import { useAuth } from '../src/contexts/AuthContext';
import Logo from '../assets/images/logo.png';
import ApiService from '../src/services/api';
import GoogleLogo from '../components/GoogleLogo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import VideoCacheService from '../src/services/videoCache';

const { width, height } = Dimensions.get('window');

type AuthStage = 'splash' | 'login' | 'onboarding1' | 'onboarding2' | 'onboarding3' | 'signup' | 'forgot-password' | 'reset-password';

export default function AuthScreen() {
  const [teacherCode, setTeacherCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [stage, setStage] = useState<AuthStage>('splash');
  const [isLoading, setIsLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [hasFaded, setHasFaded] = useState(false);
  const [showClerkVerify, setShowClerkVerify] = useState(false);
  const [clerkCode, setClerkCode] = useState('');
  const [emailForClerk, setEmailForClerk] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showTeacherCodeInput, setShowTeacherCodeInput] = useState(false);
  const [teacherCodeUserEmail, setTeacherCodeUserEmail] = useState('');
  
  // Video caching states
  const [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoDownloadProgress, setVideoDownloadProgress] = useState(0);

  const { login, register, error, clearError, isAuthenticated, socialLogin } = useAuth();
  const signUpCtx = useSignUp();
  const signInCtx = useSignIn();
  const { user: clerkUser } = useUser();
  const router = useRouter();
  const clerk = useClerk();
  
  // Get user from AuthContext to check for teacher code requirement
  const { user: authContextUser } = useAuthContext();
  
  // SSO hooks for social login
  const { startSSOFlow } = useSSO();

  // Initialize video player with cached video or fallback to bundled video
  const player = useVideoPlayer(videoSource || require('@/assets/videos/Re-God video h264.mov'), (player) => {
    player.loop = true;
    player.muted = false;
    player.volume = 1;
  });

  // Load cached video on mount
  useEffect(() => {
    const loadVideo = async () => {
      try {
        setVideoLoading(true);
        console.log('[Auth] Loading cached video...');
        
        const videoUri = await VideoCacheService.getCachedVideoUri((progress) => {
          setVideoDownloadProgress(progress);
        });
        
        console.log('[Auth] Video loaded:', videoUri);
        setVideoSource({ uri: videoUri });
        setVideoLoading(false);
      } catch (error) {
        console.error('[Auth] Failed to load video:', error);
        console.log('[Auth] Using bundled video as fallback');
        setVideoLoading(false);
        // Continue with bundled video - no need to show error to user
      }
    };

    loadVideo();
  }, []);

  // Check if AuthContext user needs teacher code
  useEffect(() => {
    if (authContextUser && authContextUser.requiresTeacherCode && authContextUser.email) {
      console.log('AuthContext detected teacher code requirement for:', authContextUser.email);
      setTeacherCodeUserEmail(authContextUser.email);
      setShowTeacherCodeInput(true);
    }
  }, [authContextUser]);

  // Video player setup (only runs when videoSource is available or after video loads)
  useEffect(() => {
    if (!player || videoLoading) return;

    let timer: any;
      const statusListener = player.addListener('statusChange', (status) => {
        if (!hasFaded) {
          setHasFaded(true);
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }
      });

      setAudioModeAsync({
        allowsRecording: false,
        shouldPlayInBackground: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        interruptionModeAndroid: 'doNotMix',
        shouldRouteThroughEarpiece: false,
      }).catch(() => {});

      timer = setTimeout(() => {
        try {
          player.play();
        } catch (error) {
          console.log('Error playing video:', error);
        }
        if (!hasFaded) {
          setTimeout(() => {
            if (!hasFaded) {
              setHasFaded(true);
              Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 600,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }).start();
            }
          }, 700);
        }
      }, 400);

      return () => {
        statusListener?.remove();
        if (timer) clearTimeout(timer);
      };
  }, [player, videoLoading]);

  // Note: Navigation is handled by the main index.tsx file

  // Clear error when stage changes
  useEffect(() => {
    clearError();
  }, [stage]);

  // Splash -> Login transition
  useEffect(() => {
    if (stage === 'splash') {
      const t = setTimeout(() => setStage('login'), 2000);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const handleSocialLogin = async (provider: 'google' | 'apple' | 'facebook') => {
    try {
      setIsLoading(true);
      
      // Check if we're on signup stage and validate teacher code
      if (stage === 'signup') {
        if (!teacherCode.trim()) {
          Alert.alert('Teacher Code Required', 'Please enter a teacher code to create an account');
          setIsLoading(false);
          return;
        }
        
        if (!name.trim()) {
          Alert.alert('Name Required', 'Please enter your full name to create an account');
          setIsLoading(false);
          return;
        }
      }
      
      console.log(`Starting ${provider} OAuth flow...`);
      console.log(`Current stage: ${stage}, teacherCode: "${teacherCode}", name: "${name}"`);
      
      // Start SSO flow with strategy
      const { createdSessionId, signIn, signUp, setActive } = await startSSOFlow({
        strategy: `oauth_${provider}`,
      });
      
      console.log(`${provider} SSO flow result:`, { 
        createdSessionId, 
        hasSignIn: !!signIn, 
        hasSignUp: !!signUp,
        signInIdentifier: signIn?.identifier,
        signUpEmail: signUp?.emailAddress,
        signInFirstVerification: signIn?.firstFactorVerification,
        signUpStatus: signUp?.status
      });
      
      if (createdSessionId) {
        // Set the active session in Clerk
        await setActive?.({ session: createdSessionId });
        
        // Wait a moment for Clerk to fully set the session and user data to be available
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Force reload the Clerk session to get the latest user data
        await clerk.session?.reload();
        
        // Get and store the Clerk session token
        try {
          const clerkToken = await clerk.session?.getToken();
          if (clerkToken) {
            await ApiService.setClerkToken(clerkToken);
            console.log('Clerk token obtained and stored');
          } else {
            console.warn('No Clerk token available from getToken');
          }
        } catch (tokenError) {
          console.error('Error getting Clerk token:', tokenError);
        }
        
        // Get user email from multiple possible sources
        let userEmail = signIn?.identifier || 
                        signUp?.emailAddress || 
                        (signIn as any)?.emailAddress ||
                        (signUp as any)?.identifier;
        
        // If still no email, try to get it from the verification
        if (!userEmail && signIn?.firstFactorVerification?.verifiedFromTheSameClient) {
          userEmail = (signIn as any).emailAddress;
        }
        
        // For Apple, the email might be in a different location
        if (!userEmail && signUp) {
          // Check if there's an email address in the email addresses array
          const emailAddresses = (signUp as any).emailAddresses;
          if (emailAddresses && emailAddresses.length > 0) {
            userEmail = emailAddresses[0].emailAddress;
          }
        }
        
        // Try to get email from the authenticated Clerk user (works for Apple and other providers)
        if (!userEmail && clerk.user) {
          userEmail = clerk.user.primaryEmailAddress?.emailAddress || 
                      clerk.user.emailAddresses?.[0]?.emailAddress;
          console.log(`Got email from Clerk user: ${userEmail}`);
        }
        
        console.log(`Extracted email: ${userEmail} from ${provider} OAuth`);
        
        if (userEmail) {
          console.log(`${provider} OAuth successful, exchanging token...`);
          
          // For signup flow, we need to register the user with teacher code
          if (stage === 'signup') {
            console.log(`Taking SIGNUP path for ${provider} - registering with teacher code: ${teacherCode}`);
            try {
              // Register user with teacher code using our backend
              await register(userEmail, '', name.trim(), teacherCode.trim());
              console.log(`${provider} signup with teacher code complete`);
            } catch (registerError) {
              console.error('Registration with teacher code failed:', registerError);
              Alert.alert('Registration Failed', 'Failed to register with teacher code. Please try again.');
              setIsLoading(false);
              return;
            }
          } else {
            console.log(`Taking LOGIN path for ${provider} - exchanging Clerk token`);
            // For login flow, exchange Clerk token for backend token
            const authResponse = await ApiService.clerkExchange(userEmail);
            
            // Check if user needs a teacher code
            if (authResponse.requires_teacher_code) {
              console.log('User needs teacher code:', authResponse.message);
              setTeacherCodeUserEmail(userEmail);
              setShowTeacherCodeInput(true);
              setIsLoading(false);
              return;
            }
            
            // Store tokens in AsyncStorage (only if they exist)
            if (authResponse.auth_token) {
              await AsyncStorage.setItem('regod_access_token', authResponse.auth_token);
            }
            if (authResponse.refresh_token) {
              await AsyncStorage.setItem('regod_refresh_token', authResponse.refresh_token);
            }
            
            if (authResponse.user_data) {
              await AsyncStorage.setItem('regod_user_data', JSON.stringify(authResponse.user_data));
            }
            
            console.log(`${provider} login complete, user authenticated`);
          }
          
          // Navigation will happen automatically via useEffect when isAuthenticated becomes true
        } else {
          console.error('No email found in OAuth response. Available data:', { signIn, signUp });
          throw new Error(`Unable to retrieve email from ${provider}. Please try a different sign-in method or ensure your ${provider} account has an email address.`);
        }
      } else {
        // User cancelled authentication - this is normal behavior, not an error
        console.log(`${provider} authentication cancelled by user`);
        return;
      }
    } catch (err: any) {
      console.error(`${provider} login error:`, err);
      const errorMessage = err?.message || `${provider} login failed`;
      Alert.alert(`${provider} Login Failed`, errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    
    if (!teacherCode.trim()) {
      Alert.alert('Error', 'Please enter a teacher code');
      return;
    }
    
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    try {
      setIsLoading(true);
      await register(email.trim(), password, name.trim(), teacherCode.trim() || undefined);
      // Navigation will happen automatically via useEffect when isAuthenticated becomes true
    } catch (err) {
      Alert.alert('Registration Failed', error || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  // Clerk email verification flow (email code)
  const handleClerkEmailSignup = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    
    if (!teacherCode.trim()) {
      Alert.alert('Error', 'Please enter a teacher code');
      return;
    }
    
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    
    try {
      setIsLoading(true);
      setEmailForClerk(email.trim());
      // Split full name into first and last (best-effort)
      const full = (name || '').trim();
      const [firstName, ...rest] = full.split(/\s+/);
      const lastName = rest.join(' ');

      await signUpCtx?.signUp?.create({
        emailAddress: email.trim(),
        password: password || undefined,
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
      });
      await signUpCtx?.signUp?.prepareEmailAddressVerification({ strategy: 'email_code' });
      setShowClerkVerify(true);
    } catch (e: any) {
      const msg = isClerkAPIResponseError(e) ? e.errors?.[0]?.message || 'Verification error' : 'Verification error';
      Alert.alert('Clerk Sign up', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyClerkCode = async () => {
    try {
      setIsLoading(true);
      const res = await signUpCtx?.signUp?.attemptEmailAddressVerification({ code: clerkCode });
      if (res && res.status === 'complete' && res.createdSessionId) {
        await signUpCtx?.setActive?.({ session: res.createdSessionId });
        
        // Register user with teacher code using our backend
        try {
          await register(emailForClerk || email.trim(), '', name.trim(), teacherCode.trim());
          console.log('Clerk signup with teacher code complete');
        } catch (registerError) {
          console.error('Registration with teacher code failed:', registerError);
          Alert.alert('Registration Failed', 'Failed to register with teacher code. Please try again.');
          setIsLoading(false);
          return;
        }
        
        setShowClerkVerify(false);
        // Navigation will be handled by index.tsx
      }
    } catch (e: any) {
      const msg = isClerkAPIResponseError(e) ? e.errors?.[0]?.message || 'Invalid code' : 'Invalid code';
      Alert.alert('Verification', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    try {
      setIsLoading(true);
      // Clerk password sign-in
      const res: any = await signInCtx?.signIn?.create({ identifier: email.trim(), password });
      if (res && res.status === 'complete' && res.createdSessionId) {
        await signInCtx?.setActive?.({ session: res.createdSessionId });
        
        // Only attempt clerk exchange if we don't already have valid tokens
        const existingToken = await AsyncStorage.getItem('regod_access_token');
        if (!existingToken) {
          try {
            await ApiService.clerkExchange(email.trim());
            console.log('Clerk exchange successful for sign in');
          } catch (exchangeError) {
            console.error('Clerk exchange failed for sign in:', exchangeError);
            // Don't fail the sign in process, but log the error
          }
        } else {
          console.log('User already has valid tokens, skipping clerk exchange');
        }
        // Navigation will be handled by index.tsx
        return;
      }
      Alert.alert('Login', 'Unable to complete sign in');
    } catch (e: any) {
      const msg = isClerkAPIResponseError(e) ? e.errors?.[0]?.message || 'Invalid credentials' : 'Invalid credentials';
      Alert.alert('Login Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Email Required', 'Please enter your email address first');
      return;
    }

    try {
      setIsLoading(true);
      // Use Clerk's password reset functionality
      if (signInCtx?.signIn) {
        await signInCtx.signIn.create({ strategy: 'reset_password_email_code', identifier: email.trim() });
        // Navigate to reset password screen instead of showing alert
        setStage('reset-password');
      } else {
        Alert.alert('Error', 'Password reset is not available at the moment');
      }
    } catch (e: any) {
      const msg = isClerkAPIResponseError(e) ? e.errors?.[0]?.message || 'Failed to send reset email' : 'Failed to send reset email';
      Alert.alert('Reset Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetCode.trim()) {
      Alert.alert('Reset Code Required', 'Please enter the reset code from your email');
      return;
    }

    if (!newPassword.trim()) {
      Alert.alert('Password Required', 'Please enter a new password');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Password Too Short', 'Password must be at least 6 characters long');
      return;
    }

    try {
      setIsLoading(true);
      // Use Clerk's password reset with code
      if (signInCtx?.signIn) {
        const result = await signInCtx.signIn.attemptFirstFactor({
          strategy: 'reset_password_email_code',
          code: resetCode.trim(),
          password: newPassword.trim(),
        });

        if (result.status === 'complete') {
          Alert.alert(
            'Password Reset Successful',
            'Your password has been reset successfully. You can now sign in with your new password.',
            [
              {
                text: 'OK',
                onPress: () => {
                  setStage('login');
                  setResetCode('');
                  setNewPassword('');
                  setConfirmPassword('');
                }
              }
            ]
          );
        } else {
          Alert.alert('Reset Failed', 'Invalid reset code or password reset failed');
        }
      } else {
        Alert.alert('Error', 'Password reset is not available at the moment');
      }
    } catch (e: any) {
      const msg = isClerkAPIResponseError(e) ? e.errors?.[0]?.message || 'Password reset failed' : 'Password reset failed';
      Alert.alert('Reset Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Your existing render logic remains mostly the same, just update the buttons:
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Fallback background */}
      <View style={styles.fallbackBackground} />
      
      {/* Video background with loading state */}
      {videoLoading ? (
        <View style={styles.videoLoadingContainer}>
          <ActivityIndicator size="large" color="#B4B454" />
          <Text style={styles.videoLoadingText}>
            {videoDownloadProgress > 0 
              ? `Loading video... ${Math.round(videoDownloadProgress * 100)}%`
              : 'Preparing video...'}
          </Text>
        </View>
      ) : (
        <VideoView
          player={player}
          style={styles.videoBackground}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          contentFit="cover"
          nativeControls={false}
          showsTimecodes={false}
        />
      )}
      
      <View style={styles.overlay} />
      <Animated.View style={[styles.fadeOverlay, { opacity: fadeAnim }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Your existing splash screen remains the same */}
            {stage === 'splash' && (
              <View style={[styles.splashContainer, { paddingTop: Math.round(height * 0.18) }]}>
                <Image source={Logo} style={styles.logoSplash} />
              </View>
            )}

            {/* Teacher Code Input Screen */}
            {showTeacherCodeInput && (
              <TeacherCodeInput
                userEmail={teacherCodeUserEmail}
                onSuccess={() => {
                  setShowTeacherCodeInput(false);
                  // Navigate to the main app
                  router.replace('/(tabs)');
                }}
                onCancel={() => {
                  setShowTeacherCodeInput(false);
                  // Sign out from Clerk
                  if (clerk?.signOut) {
                    clerk.signOut();
                  }
                }}
              />
            )}

            {/* Updated login screen */}
            {stage === 'login' && !showTeacherCodeInput && (
              <>
                <View style={styles.logoContainer}>
                  <Image source={Logo} style={styles.logo}  />
                </View>
                <View style={styles.formContainer}>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="Email"
                      placeholderTextColor="rgba(128, 128, 128, 0.7)"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="Password"
                      placeholderTextColor="rgba(128, 128, 128, 0.7)"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.eyeIcon}
                      onPress={() => setShowPassword(!showPassword)}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off' : 'eye'}
                        size={20}
                        color="rgba(128, 128, 128, 0.7)"
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.rememberForgotContainer}>
                    {/* <TouchableOpacity
                      style={styles.rememberMeContainer}
                      onPress={() => setRememberMe(!rememberMe)}
                    >
                      <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                        {rememberMe && <View style={styles.checkmark} />}
                      </View>
                      <Text style={styles.rememberMeText}>Remember me</Text>
                    </TouchableOpacity> */}
                    <TouchableOpacity onPress={handleForgotPassword}>
                      <Text style={styles.forgotPasswordText}>Forgot password</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity 
                    style={[styles.primaryButton, isLoading && { opacity: 0.7 }]} 
                    onPress={handleSignIn}
                    disabled={isLoading}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isLoading ? 'Signing in...' : 'Sign in'}
                    </Text>
                  </TouchableOpacity>

                  {/* Social Sign-in Buttons */}
                  <View style={styles.socialButtonsContainer}>
                    <TouchableOpacity
                      style={styles.socialButton}
                      onPress={() => handleSocialLogin('google')}
                      disabled={isLoading}
                    >
                      <GoogleLogo size={20} />
                      <Text style={styles.socialButtonText}>Sign in with Google</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.socialButton}
                      onPress={() => handleSocialLogin('apple')}
                      disabled={isLoading}
                    >
                      <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                      <Text style={styles.socialButtonText}>Sign in with Apple</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.socialButton}
                      onPress={() => handleSocialLogin('facebook')}
                      disabled={isLoading}
                    >
                      <Ionicons name="logo-facebook" size={20} color="#1877F2" />
                      <Text style={styles.socialButtonText}>Sign in with Facebook</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity onPress={() => setStage('onboarding1')}>
                    <Text style={styles.linkButtonText}>Create account</Text>
                  </TouchableOpacity>
                  <View style={styles.musicCreditContainer}>
                    <Text style={[styles.musicCreditText, { fontWeight: 'bold', color: '#FFFFFF' }]}>Music</Text>
                    <Text style={styles.musicCreditText}>&quot;Eliza&apos;s Morning Wander&quot; by Matt Minikus</Text>
                  </View>
                </View>
              </>
            )}

            {/* Your existing onboarding screens remain the same */}
            {(stage === 'onboarding1' || stage === 'onboarding2' || stage === 'onboarding3') && (
              <View style={[styles.formContainer, { justifyContent: 'center', flex: 1 }]}>
                <View>
                  <Text style={styles.headline}>
                    {stage === 'onboarding1' ? 'Interesting &\nInexhaustible' : stage === 'onboarding2' ? 'Deep & Diverse' : 'Purposeful &\nPersonalized'}
                  </Text>
                  <Text style={styles.subtext}>
                    {stage === 'onboarding1'
                      ? 'An exploration of the character of God, based on current and Biblical accounts of His interaction with people like us.'
                      : stage === 'onboarding2'
                      ? 'Each 10-15 minute lesson tackles real-life situations, providing valid reasons to hope. Discover more peace and joy as you gain fresh perspectives for navigating life.'
                      : 'While you can ask questions and connect with a real person through the app, the lessons are designed primarily for your personal discovery of God.'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => setStage(stage === 'onboarding1' ? 'onboarding2' : stage === 'onboarding2' ? 'onboarding3' : 'signup')}
                >
                  <Text style={styles.primaryButtonText}>Next</Text>
                </TouchableOpacity>
                <View style={styles.musicCreditContainer}>
                  <Text style={[styles.musicCreditText, { fontWeight: 'bold', color: '#FFFFFF' }]}>Music</Text>
                  <Text style={styles.musicCreditText}>&quot;Eliza&apos;s Morning Wander&quot; by Matt Minikus</Text>
                </View>
              </View>
            )}

            {/* Updated signup screen */}
            {stage === 'signup' && (
              <View style={styles.formContainer}>
                <View style={[styles.logoContainer, { marginTop: 18, marginBottom: 12 }]}>
                  <Image source={Logo} style={styles.logo}  />
                </View>

                <View style={styles.formContainer}>
                  {/* Add name input */}
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="Full Name"
                      placeholderTextColor="rgba(128, 128, 128, 0.7)"
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="Teacher's Code (Required)"
                      placeholderTextColor="rgba(128, 128, 128, 0.7)"
                      value={teacherCode}
                      onChangeText={setTeacherCode}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="Email"
                      placeholderTextColor="rgba(128, 128, 128, 0.7)"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="Password"
                      placeholderTextColor="rgba(128, 128, 128, 0.7)"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.eyeIcon}
                      onPress={() => setShowPassword(!showPassword)}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off' : 'eye'}
                        size={20}
                        color="rgba(128, 128, 128, 0.7)"
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.socialButtonsContainer}>
                    <TouchableOpacity
                      style={styles.socialButton}
                      onPress={() => handleSocialLogin('google')}
                      disabled={isLoading}
                    >
                      <GoogleLogo size={20} />
                      <Text style={styles.socialButtonText}>Sign up with Google</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.socialButton}
                      onPress={() => handleSocialLogin('apple')}
                      disabled={isLoading}
                    >
                      <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                      <Text style={styles.socialButtonText}>Sign up with Apple</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.socialButton}
                      onPress={() => handleSocialLogin('facebook')}
                      disabled={isLoading}
                    >
                      <Ionicons name="logo-facebook" size={20} color="#1877F2" />
                      <Text style={styles.socialButtonText}>Sign up with Facebook</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Clerk hosted email verification flow */}
                  {!showClerkVerify && (
                    <TouchableOpacity
                      style={[styles.createAccountButton, (isLoading || !name.trim() || !teacherCode.trim()) && { opacity: 0.7 }]}
                      onPress={handleClerkEmailSignup}
                      disabled={isLoading || !name.trim() || !teacherCode.trim()}
                    >
                      <Text style={styles.createAccountButtonText}>
                        {isLoading ? 'Sending code...' : 'Create account'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {showClerkVerify && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={{ color: 'white', marginBottom: 6 }}>Enter verification code sent to {emailForClerk}</Text>
                      <View style={styles.inputContainer}>
                        <TextInput
                          style={styles.input}
                          placeholder="6-digit code"
                          placeholderTextColor="rgba(128, 128, 128, 0.7)"
                          value={clerkCode}
                          onChangeText={setClerkCode}
                          keyboardType="number-pad"
                        />
                      </View>
                      <TouchableOpacity
                        style={[styles.primaryButton, isLoading && { opacity: 0.7 }]}
                        onPress={handleVerifyClerkCode}
                        disabled={isLoading}
                      >
                        <Text style={styles.primaryButtonText}>{isLoading ? 'Verifying...' : 'Verify & Continue'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <View style={styles.switchRow}>
                    <Text style={styles.switchText}>Already have an account? </Text>
                    <TouchableOpacity onPress={() => setStage('login')}>
                      <Text style={styles.linkButtonText}>Sign in</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.musicCreditContainer}>
                    <Text style={[styles.musicCreditText, { fontWeight: 'bold', color: '#FFFFFF' }]}>Music</Text>
                    <Text style={styles.musicCreditText}>&quot;Eliza&apos;s Morning Wander&quot; by Matt Minikus</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Reset Password Screen */}
            {stage === 'reset-password' && (
              <View style={styles.formContainer}>
                <View style={[styles.logoContainer, { marginTop: 18, marginBottom: 12 }]}>
                  <Image source={Logo} style={styles.logo} />
                </View>

                <View style={styles.formContainer}>
                  <Text style={styles.resetPasswordTitle}>Reset Your Password</Text>
                  <Text style={styles.resetPasswordSubtitle}>
                    We've sent a reset code to {email}. Please enter the code and your new password below.
                  </Text>

                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="Reset Code"
                      placeholderTextColor="rgba(128, 128, 128, 0.7)"
                      value={resetCode}
                      onChangeText={setResetCode}
                      keyboardType="number-pad"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="New Password"
                      placeholderTextColor="rgba(128, 128, 128, 0.7)"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={styles.eyeIcon}
                      onPress={() => setShowPassword(!showPassword)}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off' : 'eye'}
                        size={20}
                        color="rgba(128, 128, 128, 0.7)"
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="Confirm New Password"
                      placeholderTextColor="rgba(128, 128, 128, 0.7)"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButton, isLoading && { opacity: 0.7 }]}
                    onPress={handleResetPassword}
                    disabled={isLoading}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isLoading ? 'Resetting...' : 'Reset Password'}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.switchRow}>
                    <Text style={styles.switchText}>Remember your password? </Text>
                    <TouchableOpacity onPress={() => setStage('login')}>
                      <Text style={styles.linkButtonText}>Sign in</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.switchRow}>
                    <Text style={styles.switchText}>Didn't receive the code? </Text>
                    <TouchableOpacity onPress={handleForgotPassword}>
                      <Text style={styles.linkButtonText}>Resend</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fallbackBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    zIndex: 0,
    backgroundColor: '#000000',
  },
  videoBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    zIndex: 1,
  },
  videoLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  videoLoadingText: {
    marginTop: 16,
    color: '#B4B454',
    fontSize: 16,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 2,
  },
  fadeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    backgroundColor: '#000000',
    zIndex: 3,
  },
  safeArea: {
    flex: 1,
    zIndex: 4,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  splashContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoSplash: {
    width: Math.min(340, Math.round(width * 0.75)),
    height: Math.min(170, Math.round(width * 0.375)),
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  logo: {
    width: Math.min(320, Math.round(width * 0.72)),
    height: Math.min(160, Math.round(width * 0.36)),
  },
  logoSmall: {
    width: Math.min(220, Math.round(width * 0.5)),
    height: Math.min(110, Math.round(width * 0.25)),
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
    width: '90%',
    alignSelf: 'center',
    paddingBottom: 24,
  },
  inputContainer: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: 'rgba(244, 245, 235, 0.9)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#808080',
    borderWidth: 0,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 16,
    padding: 4,
  },
  rememberForgotContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'gray',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: 'white',
  },
  checkmark: {
    width: 10,
    height: 10,
    backgroundColor: 'black',
    borderRadius: 1,
  },
  rememberMeText: {
    color: 'white',
    fontSize: 14,
  },
  forgotPasswordText: {
    color: 'white',
    fontSize: 14,
  },
  socialButtonsContainer: {
    marginBottom: 12,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  socialButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
  },
  createAccountButton: {
    backgroundColor: '#B4B454',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  createAccountButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#B4B454',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButtonText: {
    color: '#B4B454',
    fontSize: 16,
    textAlign: 'center',
    // marginTop: 10,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  switchText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
  },
  headline: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'left',
    marginBottom: 10,
  },
  subtext: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'left',
    marginBottom: 20,
  },
  musicCreditContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    // paddingTop: 36,
    alignItems: 'center',
  },
  musicCreditText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    textAlign: 'center',
  },
  resetPasswordTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 8,
  },
  resetPasswordSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
});