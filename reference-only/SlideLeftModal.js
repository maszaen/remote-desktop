import { useRef, useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, BackHandler, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Gradient constants - pixel based
const GRADIENT_MAX_HEIGHT = 50; // Max gradient height in pixels
const GRADIENT_THRESHOLD = 200; // Scroll distance for full gradient (0 to full in 200px)

/**
 * Get border radius for card based on position in category
 * @param {number} index - Card index
 * @param {number} total - Total cards in category
 */
function getCardRadius(index, total) {
  if (total === 1) {
    return { borderRadius: 20 };
  }
  if (index === 0) {
    return { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 };
  }
  if (index === total - 1) {
    return { borderTopLeftRadius: 5, borderTopRightRadius: 5, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 };
  }
  return { borderRadius: 5 };
}

/**
 * Menu Card Item
 */
function MenuCard({ icon, title, description, onPress, style }) {
  return (
    // Use RN Pressable for immediate tap response (no gesture-handler delay).
    <Pressable 
      style={[styles.card, style]} 
      onPress={() => requestAnimationFrame(() => onPress?.())} 
      android_ripple={{ color: 'rgba(255,255,255,0.08)', foreground: true }}
      delayPressIn={0}
    >
      <View style={styles.cardLeft}>
        <Ionicons name={icon} size={22} color={COLORS.fgMuted} />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{title}</Text>
          {description && <Text style={styles.cardDesc}>{description}</Text>}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.fgMuted} />
    </Pressable>
  );
}

/**
 * Menu Category with cards
 * @param {string} title - Category title
 * @param {Array} items - Array of { icon, title, description, onPress }
 */
function MenuCategory({ title, items }) {
  return (
    <View style={styles.category}>
      <Text style={styles.categoryTitle}>{title}</Text>
      <View style={styles.categoryCards}>
        {items.map((item, index) => (
          <MenuCard
            key={item.title}
            icon={item.icon}
            title={item.title}
            description={item.description}
            onPress={item.onPress}
            style={getCardRadius(index, items.length)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Reusable slide-left fullscreen modal
 * @param {boolean} visible - Modal visibility
 * @param {function} onClose - Called when modal is closed
 * @param {string} title - Header title
 * @param {React.ReactNode} children - Modal content (use MenuCategory for menu screens)
 * @param {boolean} showBack - Show back button (default true)
 * @param {boolean} showGradients - Show scroll-based gradients (default true)
 */
export default function SlideLeftModal({ visible, onClose, title, children, showBack = true, showGradients = true, triggerOpen }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  
  // Gradient heights based on scroll position
  const [topGradientHeight, setTopGradientHeight] = useState(0);
  const [bottomGradientHeight, setBottomGradientHeight] = useState(GRADIENT_MAX_HEIGHT);
  // Manage pointer events to prevent blocking touches during exit animation
  const [wrapperPointerEvents, setWrapperPointerEvents] = useState('auto');
  
  // Track content and layout dimensions
  const contentHeight = useRef(0);
  const layoutHeight = useRef(0);

  const open = useCallback(() => {
    setWrapperPointerEvents('auto');
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 135,
        friction: 19,
      }),
      Animated.timing(overlayAnim, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, overlayAnim]);

  const close = useCallback(() => {
    // Immediately disable pointer events on wrapper so touches pass through to underlying screens
    setWrapperPointerEvents('none');
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: SCREEN_WIDTH,
        useNativeDriver: true,
        tension: 135,
        friction: 19,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 125,
        useNativeDriver: true,
      }),
    ]).start((result) => {
      // Only trigger onClose if animation finished (wasn't interrupted by an open call)
      if (result.finished) {
        onClose?.();
      }
    });
  }, [slideAnim, overlayAnim, onClose]);

  // Handle scroll to update gradient heights
  const handleScroll = useCallback((event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollY = contentOffset.y;
    const maxScroll = contentSize.height - layoutMeasurement.height;
    
    // Store dimensions for initial calculation
    contentHeight.current = contentSize.height;
    layoutHeight.current = layoutMeasurement.height;
    
    // Top gradient: 0 at top, grows as user scrolls down (max at 200px scroll)
    const topHeight = Math.min(GRADIENT_MAX_HEIGHT, (scrollY / GRADIENT_THRESHOLD) * GRADIENT_MAX_HEIGHT);
    setTopGradientHeight(Math.max(0, topHeight));
    
    // Bottom gradient: full at top, shrinks as user approaches bottom
    const distanceFromBottom = maxScroll - scrollY;
    const bottomHeight = Math.min(GRADIENT_MAX_HEIGHT, (distanceFromBottom / GRADIENT_THRESHOLD) * GRADIENT_MAX_HEIGHT);
    setBottomGradientHeight(Math.max(0, bottomHeight));
  }, []);

  // Reset gradients when modal opens
  useEffect(() => {
    if (visible) {
      open();
      // Reset to initial state: no top gradient, full bottom gradient
      setTopGradientHeight(0);
      setBottomGradientHeight(GRADIENT_MAX_HEIGHT);
    }
  }, [visible, open, triggerOpen]);

  useEffect(() => {
    if (!visible) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => backHandler.remove();
  }, [visible, close]);

  if (!visible) return null;

  return (
    <View style={styles.wrapper} pointerEvents={wrapperPointerEvents}>
      <Animated.View style={[styles.overlay, { opacity: overlayAnim }]} />
      <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim }] }]}>
        <View style={styles.header}>
          {showBack && (
            <Pressable style={styles.backBtn} onPress={close} android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}>
              <Ionicons name="arrow-back-outline" size={23} color={COLORS.fg} />
            </Pressable>
          )}
          <Text style={[styles.headerTitle, !showBack && styles.headerTitleCenter]}>{title}</Text>
        </View>
        
        <View style={styles.contentWrapper}>
          {/* Top gradient - fades content under header */}
          {showGradients && topGradientHeight > 0 && (
            <View style={[styles.topGradient, { height: topGradientHeight }]} pointerEvents="none">
              <LinearGradient
                colors={[COLORS.bg, 'transparent']}
                style={StyleSheet.absoluteFill}
              />
            </View>
          )}
          
          {/* Scrollable content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {children}
          </ScrollView>
          
          {/* Bottom gradient - fades content at bottom */}
          {showGradients && bottomGradientHeight > 0 && (
            <View style={[styles.bottomGradient, { height: bottomGradientHeight }]} pointerEvents="none">
              <LinearGradient
                colors={['transparent', COLORS.bg]}
                style={StyleSheet.absoluteFill}
              />
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// Export MenuCategory for use in screens
SlideLeftModal.Category = MenuCategory;
SlideLeftModal.Card = MenuCard;

const styles = StyleSheet.create({
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
  },
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
  },
  backBtn: {
    width: 45,
    height: 45,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
  },
  headerTitle: {
    flex: 1,
    color: COLORS.fg,
    fontSize: 18,
    fontFamily: FONTS.display,
    textAlign: 'center',
    marginRight: 45,
  },
  contentWrapper: {
    flex: 1,
    position: 'relative',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100, // Extra padding for bottom gradient
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: -10,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  category: {
    marginBottom: 16,
  },
  categoryTitle: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontFamily: FONTS.ai,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  categoryCards: {
    gap: 3,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgSecondary,
    padding: 14,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardText: {
    gap: 2,
  },
  cardTitle: {
    color: COLORS.fg,
    fontSize: 16,
    fontFamily: FONTS.sans,
  },
  cardDesc: {
    color: COLORS.fgMuted,
    fontSize: 13,
    fontFamily: FONTS.sans,
  },
});
