import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Text,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  BackHandler,
  Keyboard,
  Image,
  Alert,
  Switch,
} from 'react-native';
import { GestureHandlerRootView, Gesture, GestureDetector, Pressable, ScrollView } from 'react-native-gesture-handler';
import Reanimated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  Easing,
  interpolate,
  cancelAnimation
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { StreamdownRN } from './src/lib/streamdown';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image as ImageIcon, FileText, Camera, Pencil, Trash2, LucideAtom, Bot, Sparkles, LineSquiggle, LucideCombine } from 'lucide-react-native';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import ChatScreen from './src/screens/ChatScreen';
import PersonalizationScreen from './src/screens/PersonalizationScreen';
import ModelsListScreen from './src/screens/ModelsListScreen';
import SessionList from './src/components/SessionList';
import SlideUpModal from './src/components/SlideUpModal';
import SlideLeftModal from './src/components/SlideLeftModal';
import ContextMenuFixed from './src/components/ContextMenuFixed';
import InputModal from './src/components/InputModal';
import LoadingScreen from './src/components/LoadingScreen';
import ImageViewerModal from './src/components/ImageViewerModal';
import { SvgXml } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import { COLORS } from './src/constants/colors';
import { fontAssets, FONTS } from './src/constants/fonts';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { PENCIL, LOGO_SVG, DIAMOND_LOGO_HTML_LOADER } from './src/constants/strings';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { setupNotificationChannel } from './src/services/notifications';
import AlertModal from './src/components/AlertModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Base sidebar width sits at ~83% of the screen so users can peek the main page
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.80;
// The maximum distance the sidebar can stretch to the right (until it fills the screen)
const SIDEBAR_STRETCH_DISTANCE = SCREEN_WIDTH - SIDEBAR_WIDTH;
const TOTAL_WIDTH = SIDEBAR_WIDTH + SCREEN_WIDTH; // Total scrollable width

// Diamond Logo component (using LOADER version for splash screen)
function DiamondLogo({ accentColor }) {
  return (
    <View style={loadingOverlayStyles.logoContainer}>
      <WebView
        source={{ html: DIAMOND_LOGO_HTML_LOADER(accentColor) }}
        style={loadingOverlayStyles.logoWebView}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        androidLayerType="hardware"
        originWhitelist={['*']}
        javaScriptEnabled={true}
      />
    </View>
  );
}

// Welcome Overlay with typewriter effect (uses message from context)
function WelcomeOverlay({ message, accentColor, visible, onFadeComplete }) {
  const [displayText, setDisplayText] = useState('');
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isMountedRef = useRef(true);

  // Typewriter effect
  useEffect(() => {
    if (!message) return;
    
    isMountedRef.current = true;
    let i = 0;
    const timers = [];
    
    const typeChar = () => {
      if (!isMountedRef.current) return;
      if (i < message.length) {
        setDisplayText(message.slice(0, i + 1));
        i++;
        const char = message[i - 1];
        const delay = /[.,?!;:\-–]/.test(char) ? 350 : 30 + Math.random() * 40;
        const t = setTimeout(typeChar, delay);
        timers.push(t);
      }
    };
    
    const starter = setTimeout(typeChar, 100);
    timers.push(starter);
    
    return () => { 
      isMountedRef.current = false;
      timers.forEach(t => clearTimeout(t));
    };
  }, [message]);

  // Fade out when not visible
  useEffect(() => {
    if (!visible) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        onFadeComplete?.();
      });
    }
  }, [visible, fadeAnim, onFadeComplete]);
 // fadeAnim
  return (
    <Animated.View style={[loadingOverlayStyles.overlay, { opacity: fadeAnim }]} pointerEvents={visible ? "auto" : "none"}>
      <View style={loadingOverlayStyles.welcomeContainer}>
        <DiamondLogo accentColor={accentColor} />
        <Text style={loadingOverlayStyles.welcomeText}>{displayText}</Text>
      </View>
    </Animated.View>
  );
}


function MainApp() {
  const insets = useSafeAreaInsets();
  
  // Initialize notification channel
  useEffect(() => {
    setupNotificationChannel();
  }, []);
  const { isReady, sessions, currentSession, messages, selectSession, deleteSession, clearCurrentSession, toggleFavorite, renameSession, currentUser, isLoggedIn, lastBackupTime, settings, updateSettings, splashMessage, setSplashComplete, setIsLoadingSession } = useApp();
  const [showPersonalization, setShowPersonalization] = useState(false);
  // Trigger force re-open even if personalization modal is mid-close.
  const [personalizationTrigger, setPersonalizationTrigger] = useState(0);
  // Trigger to open Account modal from other screens.
  const [accountTriggerExternal, setAccountTriggerExternal] = useState(0);
  const [showModels, setShowModels] = useState(false);
  const [sessionSelectTick, setSessionSelectTick] = useState(0);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHasQuery, setSidebarHasQuery] = useState(false);
  const [renameModal, setRenameModal] = useState({ visible: false, session: null });
  const [confirmDelete, setConfirmDelete] = useState({ visible: false, session: null });
  const [sidebarContextMenuOpen, setSidebarContextMenuOpen] = useState(false);
  const [thinkingModal, setThinkingModal] = useState({ visible: false, content: '', isStreaming: false });
  // Select text modal state (app-level for message text selection)
  const [selectTextModal, setSelectTextModal] = useState({ visible: false, content: '' });
  // Attachment modal state
  const [attachmentModal, setAttachmentModal] = useState(false);
  // Image viewer modal state
  const [imageViewerModal, setImageViewerModal] = useState({ 
    visible: false, 
    image: null, 
    isDownloadable: false,
  });
  
  // Loading overlay state
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
  const [mountLoadingOverlay, setMountLoadingOverlay] = useState(true);
  // Track if any modal is open (for blocking pager swipe)
  const isModalOpen = useRef(false);
  // Fade animation for right buttons container
  const rightBtnOpacity = useRef(new Animated.Value(0)).current;
  const showRightBtns = currentSession && messages.length > 0;

  // Fade in/out right buttons when session changes
  useEffect(() => {
    Animated.timing(rightBtnOpacity, {
      toValue: showRightBtns ? 1 : 0,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [showRightBtns, rightBtnOpacity]);

  // Always hide splash after 1s (independent of isReady).
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLoadingOverlay(false);
      setSplashComplete(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Keep modal open ref in sync
  useEffect(() => {
    isModalOpen.current = showContextMenu || showModels || showPersonalization || renameModal.visible || confirmDelete.visible || sidebarContextMenuOpen || thinkingModal.visible;
  }, [showContextMenu, showModels, showPersonalization, renameModal.visible, confirmDelete.visible, sidebarContextMenuOpen, thinkingModal.visible]);

  // Horizontal pager - start at main screen (offset = SIDEBAR_WIDTH)
  // Using Reanimated shared values for smooth native thread animations
  const scrollX = useSharedValue(SIDEBAR_WIDTH);
  const sidebarStretch = useSharedValue(0);
  const currentPage = useSharedValue(1); // 0 = sidebar, 1 = main
  const gestureStartedExpanded = useSharedValue(false); // Track if gesture started while expanded
  const lastDragPosition = useRef(SIDEBAR_WIDTH);
  const attachmentModalRef = useRef(null); // Ref for attachment modal graceful closing
  const modelsModalRef = useRef(null); // Ref for models modal graceful closing
  
  // Keep RN Animated for non-gesture animations (button opacity etc)
  const scrollXAnimated = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const sidebarStretchAnimated = useRef(new Animated.Value(0)).current;
  
  // Animated styles for pager container (runs on native thread)
  const pagerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -scrollX.value }],
  }));
  
  // Animated styles for sidebar width
  const sidebarAnimatedStyle = useAnimatedStyle(() => ({
    width: SIDEBAR_WIDTH + sidebarStretch.value,
  }));
  
  // Animated styles for overlays
  const mainOverlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, [0, SIDEBAR_WIDTH], [0.5, 0]),
  }));

  // Keep RN Animated interpolations for non-gesture related UI
  // const sidebarOverlayOpacity = scrollXAnimated.interpolate({
  //   inputRange: [0, SIDEBAR_WIDTH],
  //   outputRange: [0, 0.5],
  //   extrapolate: 'clamp',
  // });
  // const mainOverlayOpacity = scrollXAnimated.interpolate({
  //   inputRange: [0, SIDEBAR_WIDTH],
  //   outputRange: [0.5, 0],
  //   extrapolate: 'clamp',
  // });

  // Helper to sync RN Animated with Reanimated for non-gesture UI
  // const syncAnimatedValues = useCallback((targetPage) => {
  //   const scrollTarget = targetPage === 0 ? 0 : SIDEBAR_WIDTH;
  //   const stretchTarget = targetPage === 0 && sidebarHasQuery ? SIDEBAR_STRETCH_DISTANCE : 0;
  //   scrollXAnimated.setValue(scrollTarget);
  //   sidebarStretchAnimated.setValue(stretchTarget);
  // }, [scrollXAnimated, sidebarStretchAnimated, sidebarHasQuery]);

  // Wrapper for Keyboard.dismiss to use with runOnJS
  const dismissKeyboard = useCallback(() => Keyboard.dismiss(), []);

  // Horizontal pager gesture handler (runs entirely on native UI thread)
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onStart(() => {
      'worklet';
      // Cancel any running animations to prevent flicker
      cancelAnimation(scrollX);
      cancelAnimation(sidebarStretch);
      // Track initial stretch value at gesture start
      gestureStartedExpanded.value = sidebarStretch.value;
    })
    .onUpdate((e) => {
      'worklet';
      const initialStretch = gestureStartedExpanded.value;
      const baseOffset = currentPage.value === 0 ? 0 : SIDEBAR_WIDTH;
      
      // If started from expanded state on sidebar
      if (currentPage.value === 0 && initialStretch > 0) {
        // Sliding left - consume translation for stretch collapse, excess to pager
        if (e.translationX < 0) {
          const stretchConsumed = Math.min(initialStretch, -e.translationX);
          sidebarStretch.value = initialStretch - stretchConsumed;
          const excessTranslation = Math.max(0, -e.translationX - initialStretch);
          scrollX.value = Math.min(SIDEBAR_WIDTH, excessTranslation);
        } else {
          // Sliding right or not moving yet - keep stretch, allow stretch increase
          sidebarStretch.value = Math.min(SIDEBAR_STRETCH_DISTANCE, initialStretch + e.translationX);
          scrollX.value = 0;
        }
        return;
      }
      
      // Normal pager movement (not started from expanded)
      const proposedOffset = baseOffset - e.translationX;

      if (proposedOffset < 0) {
        scrollX.value = 0;
        sidebarStretch.value = Math.min(SIDEBAR_STRETCH_DISTANCE, -proposedOffset);
      } else {
        scrollX.value = Math.max(0, Math.min(SIDEBAR_WIDTH, proposedOffset));
        sidebarStretch.value = 0;
      }
    })
    .onEnd((e) => {
      'worklet';
      const currentOffset = scrollX.value;
      const initialStretch = gestureStartedExpanded.value;
      const wasExpanded = initialStretch > 0;

      // Normal page determination
      let targetPage;
      if (Math.abs(e.velocityX) > 500) {
        targetPage = e.velocityX > 0 ? 0 : 1;
      } else {
        targetPage = currentOffset < SIDEBAR_WIDTH / 2 ? 0 : 1;
      }

      const scrollTarget = targetPage === 0 ? 0 : SIDEBAR_WIDTH;
      // If started from expanded, always collapse stretch
      const stretchTarget = 0;

      // Animate to target - fast, snappy, no bounce
      // State updates are deferred until animation completes to prevent jank
      const config = { duration: 200, easing: Easing.out(Easing.cubic) };
      scrollX.value = withTiming(scrollTarget, config, (finished) => {
        'worklet';
        if (finished) {
          // Sync state on JS thread AFTER animation completes
          runOnJS(setSidebarOpen)(targetPage === 0);
          if (targetPage === 1 || wasExpanded) {
            runOnJS(setSidebarHasQuery)(false);
            runOnJS(dismissKeyboard)();
          }
        }
      });
      
      // Hybrid approach: Use Spring for WIDTH animations (stretch) to fix 50fps release lag
      // while keeping Timing for TRANSFORM animations (scrollX) for consistent snapping.
      sidebarStretch.value = withSpring(stretchTarget, { 
        damping: 30, 
        stiffness: 300, 
        mass: 0.8, 
        velocity: e.velocityX // Pass gesture velocity for seamless handoff
      });
      
      currentPage.value = targetPage;
    });

  // Sidebar width calculated from Reanimated value is handled by sidebarAnimatedStyle

  const openSidebar = useCallback(() => {
    Keyboard.dismiss();
    // Always open collapsed; expand only when search is actively focused.
    setSidebarHasQuery(false);
    currentPage.value = 0;
    const config = { duration: 200, easing: Easing.out(Easing.cubic) };
    // Animate first, then update state after animation completes
    scrollX.value = withTiming(0, config, (finished) => {
      'worklet';
      if (finished) {
        runOnJS(setSidebarOpen)(true);
      }
    });
    // Always animate to 0 (collapsed) - we explicitly set sidebarHasQuery to false above
    // Using the closure value would cause stale state bug (value not updated yet)
    sidebarStretch.value = withTiming(0, config);
  }, [scrollX, sidebarStretch]);

  const closeSidebar = useCallback(() => {
    Keyboard.dismiss();
    // Reset query state immediately to prevent stale state on rapid open/close
    setSidebarHasQuery(false);
    currentPage.value = 1;
    const config = { duration: 200, easing: Easing.out(Easing.cubic) };
    // Animate first, then update state after animation completes
    scrollX.value = withTiming(SIDEBAR_WIDTH, config, (finished) => {
      'worklet';
      if (finished) {
        runOnJS(setSidebarOpen)(false);
        // Redundant but safe - ensures query is false even if animation was interrupted
        runOnJS(setSidebarHasQuery)(false);
      }
    });
    sidebarStretch.value = withTiming(0, config);
  }, [scrollX, sidebarStretch, setSidebarHasQuery]);

  // Smoothly adjust sidebar extent when search text toggles a full-width request
  // State updates immediately for instant icon switch, animation follows
  // IMPORTANT: Only expand if sidebarHasQuery is explicitly true
  // This prevents race conditions where stale state causes unwanted expansion on sidebar open
  const prevSidebarHasQueryRef = useRef(sidebarHasQuery);
  useEffect(() => {
    if (!sidebarOpen) {
      prevSidebarHasQueryRef.current = false;
      return;
    }
    
    // Only animate stretch when sidebarHasQuery actively changes
    // Skip animation on initial sidebar open (prevents flash of expansion)
    const queryChanged = prevSidebarHasQueryRef.current !== sidebarHasQuery;
    prevSidebarHasQueryRef.current = sidebarHasQuery;
    
    // If sidebarHasQuery is false, always ensure we're collapsed
    // If sidebarHasQuery is true AND it just changed, expand
    if (!sidebarHasQuery) {
      sidebarStretch.value = withSpring(0, { damping: 35, stiffness: 440, mass: 1, velocity: 500 });
    } else if (queryChanged) {
      // Optimized Spring for auto-stretch (system driven) - softer stiffness prevents 60fps locking feels
      sidebarStretch.value = withSpring(SIDEBAR_STRETCH_DISTANCE, { 
        damping: 35,    // Slightly higher damping for stability
        stiffness: 440, // Lower stiffness (softer) consumes less processing power per frame visually
        mass: 1,
        velocity: 500   // Initial kick to make it feel responsive immediately
      });
    }
  }, [sidebarHasQuery, sidebarOpen, sidebarStretch]);

  const openPersonalization = useCallback(() => {
    setShowPersonalization(true);
    setPersonalizationTrigger(prev => prev + 1);
  }, []);
  // Open Account modal through Personalization screen.
  const openAccountFromModels = useCallback(() => {
    setShowPersonalization(true);
    setPersonalizationTrigger(prev => prev + 1);
    setAccountTriggerExternal(prev => prev + 1);
  }, []);
  const closePersonalization = useCallback(() => setShowPersonalization(false), []);
  const handleShowThinking = useCallback((content) => {
    setThinkingModal({ visible: true, content, isStreaming: false });
  }, []);
  const streamingTimeoutRef = useRef(null);
  const handleStreamingThinking = useCallback((content) => {
    // Only update content if modal is already open, don't auto-open
    // Mark as streaming to let StreamdownRN use streaming mode (not batch)
    setThinkingModal(prev => prev.visible ? { ...prev, content, isStreaming: true } : prev);
    
    // Reset isStreaming to false after 500ms of no updates (stream ended)
    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current);
    }
    streamingTimeoutRef.current = setTimeout(() => {
      setThinkingModal(prev => prev.visible ? { ...prev, isStreaming: false } : prev);
    }, 500);
  }, []);
  const closeThinkingModal = useCallback(() => {
    setThinkingModal({ visible: false, content: '', isStreaming: false });
  }, []);
  // Handle select text from message context menu - opens app-level SlideLeftModal
  const handleSelectText = useCallback((content) => {
    setSelectTextModal({ visible: true, content: content || '' });
  }, []);
  const openModels = useCallback(() => {
    Keyboard.dismiss();
    setShowModels(true);
  }, []);
  const closeModels = useCallback(() => setShowModels(false), []);
  
  // Attachment modal handlers
  const openAttachmentModal = useCallback(() => {
    Keyboard.dismiss();
    setAttachmentModal(true);
  }, []);
  const closeAttachmentModal = useCallback(() => setAttachmentModal(false), []);
  
  // Ref for ChatInput to add attachments
  const chatInputRef = useRef(null);
  const attachmentIdRef = useRef(0);

  // Get MIME type from extension
  const getMimeType = (filename) => {
    const ext = filename?.split('.').pop()?.toLowerCase() || '';
    const mimeTypes = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      heic: 'image/heic',
      heif: 'image/heif',
      pdf: 'application/pdf',
      txt: 'text/plain',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  };
  
  // Handle image selection
  const handleSelectImages = useCallback(async () => {
    // Close modal gracefully if possible
    attachmentModalRef.current?.close() || closeAttachmentModal();
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to upload images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: true, // Get base64 directly from picker
      });

      if (!result.canceled && result.assets) {
        const newAttachments = result.assets.map((asset) => {
          const filename = asset.fileName || asset.uri.split('/').pop() || 'image.jpg';
          return {
            id: attachmentIdRef.current++,
            type: 'image',
            uri: asset.uri,
            name: filename,
            mimeType: asset.mimeType || getMimeType(filename),
            size: asset.fileSize,
            base64: asset.base64, // Direct from picker
            width: asset.width,
            height: asset.height,
          };
        });
        chatInputRef.current?.addAttachments(newAttachments);
      }
    } catch (error) {
      console.error('Error picking images:', error);
      Alert.alert('Error', 'Failed to select images. Please try again.');
    }
  }, [closeAttachmentModal]);
  
  // Handle file selection - read content for AI
  const handleSelectFiles = useCallback(async () => {
    // Close modal gracefully if possible
    attachmentModalRef.current?.close() || closeAttachmentModal();
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // Allow all files
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        // DEBUG: Log what DocumentPicker returns
        console.log('[handleSelectFiles] DocumentPicker result.assets:', result.assets.map(a => ({ name: a.name, uri: a.uri, mimeType: a.mimeType, size: a.size })));
        
        // Text-readable file extensions (plain text that can be shown inline)
        const textExtensions = [
          'txt', 'md', 'markdown', 'json', 'csv', 'xml', 'html', 'htm', 'css',
          'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp',
          'rb', 'php', 'go', 'rs', 'swift', 'kt', 'scala', 'sh', 'bash', 'zsh',
          'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'log', 'sql', 'graphql',
          'vue', 'svelte', 'astro', 'env', 'gitignore', 'dockerfile', 'makefile'
        ];
        
        // Document types that need base64 for API (PDF, DOCX, etc)
        const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
        
        const textMimeTypes = [
          'text/', 'application/json', 'application/xml', 'application/javascript',
        ];
        
        const newAttachments = await Promise.all(
          result.assets.map(async (asset) => {
            let textContent = null;
            let base64 = null;
            const ext = asset.name?.split('.').pop()?.toLowerCase() || '';
            const mimeType = asset.mimeType || getMimeType(asset.name);
            
            // Check file type
            const isTextFile = textExtensions.includes(ext) || 
                               textMimeTypes.some(t => mimeType.startsWith(t)) ||
                               mimeType === 'text/plain';
            const isDocument = documentExtensions.includes(ext) ||
                               mimeType === 'application/pdf' ||
                               mimeType.includes('word') ||
                               mimeType.includes('spreadsheet') ||
                               mimeType.includes('presentation');
            
            // Read text files as plain text
            if (isTextFile) {
              try {
                const response = await fetch(asset.uri);
                textContent = await response.text();
                // Limit content size to prevent huge payloads (max 100KB)
                if (textContent.length > 100000) {
                  textContent = textContent.substring(0, 100000) + '\n\n[Content truncated due to size limit]';
                }
              } catch (e) {
                console.log('Could not read text file:', e);
              }
            }
            
            // Read documents as base64 for API (PDF, DOCX, etc)
            if (isDocument) {
              try {
                base64 = await FileSystem.readAsStringAsync(asset.uri, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                // Limit size - most APIs have ~25MB limit, but let's be safe with 10MB
                if (base64.length > 10 * 1024 * 1024) {
                  console.log('File too large for base64 encoding');
                  base64 = null;
                }
              } catch (e) {
                console.log('Could not read file as base64:', e);
              }
            }
            
            return {
              id: attachmentIdRef.current++,
              type: 'file',
              uri: asset.uri,
              name: asset.name || 'File',
              mimeType: mimeType,
              size: asset.size,
              textContent, // Text content for text files
              base64, // Base64 for documents (PDF, DOCX, etc)
            };
          })
        );
        chatInputRef.current?.addAttachments(newAttachments);
      }
    } catch (error) {
      console.error('Error picking files:', error);
      Alert.alert('Error', 'Failed to select files. Please try again.');
    }
  }, [closeAttachmentModal]);
  
  // Handle camera
  const handleOpenCamera = useCallback(async () => {
    // Close modal gracefully if possible
    attachmentModalRef.current?.close() || closeAttachmentModal();
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your camera to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        base64: true, // Get base64 directly from picker
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const filename = asset.fileName || `photo_${Date.now()}.jpg`;
        
        chatInputRef.current?.addAttachments([{
          id: attachmentIdRef.current++,
          type: 'image',
          uri: asset.uri,
          name: filename,
          mimeType: asset.mimeType || 'image/jpeg',
          size: asset.fileSize,
          base64: asset.base64, // Direct from picker
          width: asset.width,
          height: asset.height,
        }]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  }, [closeAttachmentModal]);

  // Back button handler - only for sidebar (modals handle their own back)
  useEffect(() => {
    if (showPersonalization || showModels || showContextMenu) return; // Let modals handle back
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sidebarOpen) {
        closeSidebar();
        return true;
      }
      return false;
    });
    return () => backHandler.remove();
  }, [showPersonalization, showModels, showContextMenu, sidebarOpen, closeSidebar]);

  // Helper to format backup time
  const formatBackupTime = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const handleNewChat = useCallback(() => {
    if (!currentSession || messages.length === 0) {
      clearCurrentSession();
      closeSidebar();
      return;
    }
    clearCurrentSession();
    closeSidebar();
  }, [currentSession, messages, clearCurrentSession, closeSidebar]);

  return (
    <>
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        
        {/* Horizontal Pager Container */}
        <Reanimated.View style={[styles.pagerContainer, pagerAnimatedStyle]}>
          {/* Page 1: Sidebar (80% base width, stretches to 100% when pulled) */}
          <Reanimated.View style={[styles.sidebarPage, sidebarAnimatedStyle, { paddingTop: insets.top }]}>

          <View style={styles.sidebarContent}>

            

            <SessionList
              sessions={sessions}
              currentSession={currentSession}
              onSelect={(session) => { 
                // 1. Show skeleton FIRST
                setIsLoadingSession(true);
                setSessionSelectTick(prev => prev + 1);
                
                // 2. Wait 100ms for skeleton to appear, THEN slide
                setTimeout(() => {
                  closeSidebar();
                  
                  // 3. Wait for slide to complete (200ms animation + 100ms buffer), THEN load
                  setTimeout(() => selectSession(session), 300);
                }, 100);
              }}
              onDelete={async (id) => {
                const isDeletingCurrent = currentSession?.id === id;
                await deleteSession(id);
                if (isDeletingCurrent) {
                  closeSidebar();
                }
              }}
              onNew={handleNewChat}
              onToggleFavorite={toggleFavorite}
              onRename={renameSession}
              onSearchQueryChange={setSidebarHasQuery}
              onContextMenuChange={setSidebarContextMenuOpen}
              isExpanded={sidebarHasQuery}
              onCollapse={() => { Keyboard.dismiss(); setSidebarHasQuery(false); }}
              onClose={closeSidebar}
            />
            {/* Profile / Account Section */}
            <Pressable 
              style={styles.sidebarProfileBtn} 
              onPress={openPersonalization}
              android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
            >
              {isLoggedIn && currentUser?.avatarUrl ? (
                <Image 
                  source={{ uri: currentUser.avatarUrl }} 
                  style={styles.sidebarProfileImage} 
                />
              ) : (
                <View style={styles.sidebarProfilePlaceholder}>
                  <Ionicons name="person-circle-outline" size={38} color={COLORS.icon} />
                </View>
              )}
              <View style={styles.sidebarProfileInfo}>
                <Text style={styles.sidebarProfileName}>
                  {isLoggedIn ? currentUser?.name || 'Account' : 'Not Logged in'}
                </Text>
                {isLoggedIn && lastBackupTime ? (
                  <Text style={styles.sidebarBackupTime}>
                    Last backup: {formatBackupTime(lastBackupTime)}
                  </Text>
                  ) :
                  <Text style={styles.sidebarBackupTime}>
                    Open settings
                  </Text>
                }
              </View>
            </Pressable>
            {/* <TouchableOpacity style={styles.sidebarSettingsBtn} onPress={openPersonalization}>
              <Ionicons name="options-outline" size={20} color={COLORS.fgMuted} />
              <Text style={styles.sidebarSettingsText}>Personalization</Text>
            </TouchableOpacity> */}
          </View>
          </Reanimated.View>

        {/* Page 2: Main Chat (100% width) */}
        <View style={[styles.mainPage, { width: SCREEN_WIDTH }]}>
          <ChatScreen 
            topInset={insets.top} 
            sidebarOpen={sidebarOpen} 
            sessionSelectTick={sessionSelectTick}
            onShowThinking={handleShowThinking} 
            onStreamingThinking={handleStreamingThinking} 
            onSelectText={handleSelectText} 
            onOpenAttachmentModal={openAttachmentModal} 
            onImagePress={(img) => setImageViewerModal({ 
              visible: true, 
              image: img, 
              isDownloadable: img?.isDownloadable || false, 
            })} 
            onOpenModels={openModels}
            chatInputRef={chatInputRef} 
          />

          <LinearGradient
            colors={[COLORS.bg90, COLORS.bg90, COLORS.bg70, 'transparent']}
            locations={[0, 0.5, 0.7, 1]}
            style={[styles.floatingHeader, { height: insets.top + 80 }]}
            pointerEvents="none"
          />

          <Pressable 
            style={[styles.floatingMenuBtn, { top: insets.top + 11 }]} 
            onPress={openSidebar}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
          >
            <Ionicons name="menu" size={22} color={COLORS.icon} />
          </Pressable>

          <Pressable
            style={[styles.floatingLogoBtn, { top: insets.top + 11 }]}
            onPress={openModels}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
          >
            <View style={styles.logo}>
              <SvgXml xml={LOGO_SVG} width={70} height={30}/>
            </View>
          </Pressable>

          <Animated.View 
            style={[styles.floatingPencilBtn, { top: insets.top + 11, opacity: rightBtnOpacity }]}
            pointerEvents={showRightBtns ? 'auto' : 'none'}
          >
            {/* BUTTON 1: PENCIL */}
            <Pressable 
              onPress={handleNewChat} 
              // Bikin wadah lingkaran 40x40 (atau sesuaikan size yg dimau)
              style={{ 
                width: 43, 
                height: 43, 
                borderRadius: 30, // Setengah dari width/height
                alignItems: 'center', // Biar icon di tengah
                justifyContent: 'center' 
              }}
              // borderless: false biar ripplenya stay di dalem lingkaran
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
            >
              <SvgXml 
                xml={PENCIL} 
                // Perhatikan kurung siku [] lalu kurung kurawal {}
                style={[styles.rightSideLogo, { transform: [{ translateX: 1 }] }]} 
                width={23} 
                height={23} 
              />
            </Pressable>

            {/* BUTTON 2: ELLIPSIS (Tiga Titik) */}
            <Pressable 
              onPress={() => setShowContextMenu(true)} 
              // Sama, bikin wadah lingkaran juga
              style={{ 
                width: 43, 
                height: 43, 
                borderRadius: 30, 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
            >
              <Ionicons name="ellipsis-vertical" size={21} color={COLORS.icon} />
            </Pressable>
          </Animated.View>

          {/* Context Menu with Lucide icons */}
          <ContextMenuFixed
            visible={showContextMenu}
            onClose={() => setShowContextMenu(false)}
            sessionName={currentSession?.name || 'New Chat'}
            position={{ top: insets.top + 65, right: 16 }}
            options={[
              { label: 'Rename', icon: Pencil, onPress: () => {
                if (currentSession) setRenameModal({ visible: true, session: currentSession });
              }},
              { label: 'Delete', icon: Trash2, danger: true, onPress: () => {
                if (currentSession) setConfirmDelete({ visible: true, session: currentSession });
              }},
            ]}
          />

          {/* Main dimming overlay - tap to close sidebar when sidebar is open */}
          <Reanimated.View 
            style={[styles.pageOverlay, mainOverlayAnimatedStyle]} 
            pointerEvents={sidebarOpen ? 'auto' : 'none'}
          >
            <TouchableWithoutFeedback onPress={closeSidebar}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
          </Reanimated.View>
        </View>
        </Reanimated.View>

      {/* Personalization Modal */}
      <PersonalizationScreen
        visible={showPersonalization}
        onClose={closePersonalization}
        triggerOpen={personalizationTrigger}
        accountTriggerExternal={accountTriggerExternal}
      />

      {/* Account Modal */}

      {/* Models List Modal */}
        <SlideUpModal ref={modelsModalRef} visible={showModels} onClose={closeModels} showBottomGradient autoExpanded>
          {({ dragHandlers }) => (
            <ModelsListScreen 
              onClose={() => modelsModalRef.current?.close() || closeModels()} 
              dragHandlers={dragHandlers}
              onOpenAccount={openAccountFromModels}
            />
          )}
        </SlideUpModal>

      {/* Rename Modal */}
      <InputModal
        visible={renameModal.visible}
        title="Rename Chat"
        fields={[{ key: 'name', placeholder: 'Chat name', value: renameModal.session?.name || '', required: true }]}
        submitText="Save"
        onSubmit={(values) => {
          if (renameModal.session) renameSession(renameModal.session.id, values.name);
          setRenameModal({ visible: false, session: null });
        }}
        onCancel={() => setRenameModal({ visible: false, session: null })}
      />

      {/* Confirm Delete Modal */}
      <AlertModal
        visible={confirmDelete.visible}
        title="Confirm Delete"
        message={`Are you sure you want to delete "${confirmDelete.session?.name}"?`}
        primaryText="Delete"
        secondaryText="Cancel"
        danger
        onPrimary={() => {
          if (confirmDelete.session) deleteSession(confirmDelete.session.id);
          setConfirmDelete({ visible: false, session: null });
        }}
        onSecondary={() => setConfirmDelete({ visible: false, session: null })}
      />

      {/* Thinking Modal */}
      <SlideUpModal 
        visible={thinkingModal.visible} 
        onClose={closeThinkingModal}
        showBottomGradient
        bottomInset={insets.bottom}
      >
        {({ dragHandlers }) => (
          <View style={styles.thinkingModalContainer}>
            <View style={styles.thinkingModalHeader} {...dragHandlers}>
              <LucideAtom style={styles.lucideAtom} size={20} color={COLORS.fg} strokeWidth={1.3} /> 
              <Text style={styles.thinkingModalTitle}>Thought Process</Text>
              <LinearGradient
                colors={[COLORS.bgSecondaryv2, COLORS.bgSecondaryv2, COLORS.bgSecondaryv2, 'transparent']}
                locations={[0, 0.5, 0.7, 1]}
                style={[styles.floatingHeader, { height: 45 }]}
                pointerEvents="none"
              />
            </View>
            <ScrollView
              style={styles.thinkingModalScroll}
              contentContainerStyle={styles.thinkingModalContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <StreamdownRN 
                theme={{
                  colors: {
                    background: 'transparent',
                    foreground: COLORS.fgMuted,
                    muted: COLORS.fgMuted,
                    accent: COLORS.primary,
                    codeBackground: 'rgba(0,0,0,0.2)',
                    codeForeground: '#8a9199',
                    border: COLORS.borderLight,
                    link: '#a3c4f3',
                    syntaxDefault: '#8a9199',
                    syntaxKeyword: '#c97070',
                    syntaxString: '#8ab4d8',
                    syntaxNumber: '#6a9fcc',
                    syntaxComment: '#6a737d',
                    syntaxFunction: '#b392cc',
                    syntaxClass: '#cc9050',
                    syntaxOperator: '#c97070',
                  },
                  fonts: {
                    regular: FONTS.ai,
                    bold: FONTS.aiBold,
                    mono: FONTS.mono,
                  },
                  spacing: {
                    block: 6,
                    inline: 3,
                    indent: 12,
                  },
                }}
                isComplete={!thinkingModal.isStreaming}
              >
                {thinkingModal.content}
              </StreamdownRN>
            </ScrollView>
          </View>
        )}
      </SlideUpModal>

      {/* Select text modal - app-level for message text selection */}
      <SlideLeftModal
        visible={selectTextModal.visible}
        onClose={() => setSelectTextModal({ visible: false, content: '' })}
        title="Select Text"
      >
        <ScrollView showsVerticalScrollIndicator={false} style={styles.selectTextScrollView}>
          <Text style={styles.selectTextBody} selectable>{selectTextModal.content}</Text>
        </ScrollView>
      </SlideLeftModal>

      {/* Attachment modal */}
      <SlideUpModal
        ref={attachmentModalRef}
        visible={attachmentModal}
        onClose={closeAttachmentModal}
        showBottomGradient
      >
        <View style={styles.attachmentModalContent}>
          <View style={styles.attachmentRowParent}>
            <View style={styles.attachmentRow}>          
              <Pressable
                style={[styles.attachmentOption, { borderBottomWidth: 0 }]}
                onPress={handleOpenCamera}
                android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
              >
                <View style={styles.attachmentOptionIcon}>
                  <Camera size={28} color={COLORS.icon} strokeWidth={1.3} />
                </View>
                <View style={styles.attachmentOptionText}>
                  <Text style={styles.attachmentOptionLabel}>Camera</Text>
                </View>
              </Pressable>
              <Pressable
                style={styles.attachmentOption}
                onPress={handleSelectImages}
                android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
              >
                <View style={styles.attachmentOptionIcon}>
                  <ImageIcon size={28} color={COLORS.icon} strokeWidth={1.3} />
                </View>
                <View style={styles.attachmentOptionText}>
                  <Text style={styles.attachmentOptionLabel}>Photos</Text>
                </View>
              </Pressable>

              <Pressable
                style={styles.attachmentOption}
                onPress={handleSelectFiles}
                android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
              >
                <View style={styles.attachmentOptionIcon}>
                  <FileText size={28} color={COLORS.icon} strokeWidth={1.3} />
                </View>
                <View style={styles.attachmentOptionText}>
                  <Text style={styles.attachmentOptionLabel}>Files</Text>
                </View>
              </Pressable>

            </View>
          </View>

          {/* Toggles - exact same as ModelsListScreen */}
          <View style={styles.attachmentToggleCard}>
            <Pressable 
              style={styles.attachmentToggleRowTop}
              onPress={() => updateSettings({ agenticMode: !settings.agenticMode })}
            >
              <LucideCombine size={25} color={settings.agenticMode ? COLORS.primary : COLORS.fgMuted} strokeWidth={1.5} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.attachmentToggleLabel}>Agentic Mode</Text>
                <Text style={styles.attachmentToggleSublabel}>Allow the AI to use tools</Text>
              </View>
              <Switch
                value={settings.agenticMode}
                onValueChange={(val) => updateSettings({ agenticMode: val })}
                trackColor={{ false: COLORS.borderLight, true: COLORS.primary }}
                thumbColor={COLORS.fg}
              />
            </Pressable>


            <Pressable 
              style={styles.attachmentToggleRowBottom}
              onPress={() => updateSettings({ generateImage: !settings.generateImage })}
            >
              <LineSquiggle size={25} color={settings.generateImage ? COLORS.primary : COLORS.fgMuted} strokeWidth={1.5} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.attachmentToggleLabel}>Generate Image</Text>
                <Text style={styles.attachmentToggleSublabel}>Enable image generation</Text>
              </View>
              <Switch
                value={settings.generateImage}
                onValueChange={(val) => updateSettings({ generateImage: val })}
                trackColor={{ false: COLORS.borderLight, true: COLORS.primary }}
                thumbColor={COLORS.fg}
              />
            </Pressable>
          </View>
        </View>
      </SlideUpModal>

      </View>
    </GestureDetector>
    
    {/* Loading overlay - OUTSIDE GestureDetector to properly block touches */}
    {mountLoadingOverlay && (
      <WelcomeOverlay
        message={splashMessage}
        accentColor={COLORS.accent}
        visible={showLoadingOverlay}
        onFadeComplete={() => setMountLoadingOverlay(false)}
      />
    )}
    
    
    {/* Image viewer modal - fullscreen zoomable/pannable */}
    <ImageViewerModal
      visible={imageViewerModal.visible}
      image={imageViewerModal.image}
      onClose={() => setImageViewerModal({ visible: false, image: null, isDownloadable: false })}
      isDownloadable={imageViewerModal.isDownloadable}
    />
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts(fontAssets);

  if (!fontsLoaded) {
    return <LoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <AppProvider>
            <MainApp />
          </AppProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.fgMuted,
    marginTop: 12,
    fontSize: 16,
  },
  pagerContainer: {
    flex: 1,
    flexDirection: 'row',
    width: TOTAL_WIDTH,
  },
  sidebarPage: {
    height: '100%',
    backgroundColor: COLORS.bgv2,
    overflow: 'hidden',
  },
  sidebarContent: {
    flex: 1,
  },
  mainPage: {
    height: '100%',
    backgroundColor: COLORS.bg,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  floatingMenuBtn: {
    position: 'absolute',
    left: 16,
    width: 45,
    height: 45,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    zIndex: 10,
  },
  floatingLogoBtn: {
    position: 'absolute',
    left: 69,
    width: 105,
    height: 45,
    borderRadius: 50,
    color: COLORS.icon,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    zIndex: 10,
  },
  floatingPencilBtn: {
    position: 'absolute',
    display: 'flex',
    justifyContent: 'space-between',
    flexDirection: 'row',
    right: 16,
    width: 88,
    // paddingHorizontal: 9,
    height: 45,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    zIndex: 10,
  },
  rightSideLogo: {
    color: COLORS.icon,
  },
  sidebarSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 17,
    paddingBottom: 40,
    borderTopColor: COLORS.borderLight,
  },
  sidebarSettingsText: {
    color: COLORS.fgMuted,
    fontSize: 16,
    marginLeft: 12,
  },
  sidebarProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 17,
    paddingTop: 12,
    paddingBottom: 32,
  },
  sidebarProfileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  sidebarProfilePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sidebarProfileInfo: {
    marginLeft: 12,
    flex: 1,
  },
  sidebarProfileName: {
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.sans,
  },
  sidebarBackupTime: {
    color: COLORS.fgMuted,
    fontSize: 12,
    marginTop: 2,
  },
  pageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.whiteTr,
    zIndex: 100,
  },
  // Attachment modal styles
  attachmentModalContent: {
    paddingHorizontal: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentRowParent: {
    display: 'flex',
    width: '100%',
    paddingLeft: 16,
    paddingRight: 16,
    paddingBottom: 16,
  },
  attachmentRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingBottom: 16,
  },
  attachmentModalTitle: {
    fontSize: 16,
    fontFamily: FONTS.sansBold,
    color: COLORS.fg,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  attachmentOption: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    height: 100,
    flex: 1,
    borderRadius: 15,
    backgroundColor: COLORS.borderLight,
  },
  attachmentOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginLeft: 12,
  },
  attachmentOptionText: {
    marginTop: 0,
  },
  attachmentOptionLabel: {
    fontSize: 15,
    fontFamily: FONTS.sans,
    color: COLORS.fg,
    marginBottom: 2,
  },
  attachmentOptionSublabel: {
    fontSize: 12,
    fontFamily: FONTS.sans,
    color: COLORS.fgMuted,
  },
  attachmentToggleCard: {
    width: '100%',
    borderRadius: 12,
    marginTop: 0,
    marginHorizontal: 16,    
    borderWidth: 0,
    overflow: 'hidden',
  },
  attachmentToggleRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 5,
    paddingLeft: 23,
  },
  attachmentToggleRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 5,
    paddingLeft: 23,
  },
  attachmentToggleDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: 16,
  },
  attachmentToggleLabel: {
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.sans,
  },
  attachmentToggleSublabel: {
    color: COLORS.fgMuted,
    fontSize: 12,
    marginTop: 0,
  },
  thinkingModalContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  thinkingModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lucideAtom: {
    zIndex: 9,
    marginBottom: 2,
  },
  thinkingModalTitle: {
    color: COLORS.fg,
    fontSize: 16,
    zIndex: 6,
    fontFamily: FONTS.display,
  },
  thinkingModalScroll: {
    flex: 1,
  },
  thinkingModalContent: {
    paddingVertical: 16,
    paddingBottom: 120,
    
  },
  // Select text modal styles (SlideLeftModal content)
  selectTextScrollView: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 1,
  },
  selectTextBody: {
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.sans,
    lineHeight: 22,
    paddingBottom: 24,
  },
});

// Loading overlay styles (same as ChatScreen's WelcomeScreen)
const loadingOverlayStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  welcomeContainer: {
    alignItems: 'center',
    gap: 0,
    paddingBottom: 45,
  },
  logoContainer: {
    width: 150,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWebView: {
    width: 150,
    height: 150,
    backgroundColor: 'transparent',
  },
  welcomeText: {
    color: COLORS.fg,
    fontSize: 24,
    maxWidth: '80%',
    fontFamily: FONTS.display,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
