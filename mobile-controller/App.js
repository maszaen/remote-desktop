import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  StatusBar,
  RefreshControl,
  Dimensions,
  Platform,
  ActivityIndicator,
  Switch,
  Modal,
  Keyboard,
  KeyboardAvoidingView,
  Animated,
  Easing,
  BackHandler,
  Pressable,
  Linking,
  useWindowDimensions,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as ScreenOrientation from "expo-screen-orientation";
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from "react-native-gesture-handler";
import AnimatedRe, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDecay,
  runOnJS,
  cancelAnimation,
} from "react-native-reanimated";
import Svg, { Polyline } from "react-native-svg";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────
const C = {
  bg: "#050508",
  surface: "#0D0D12",
  elevated: "#141418",
  border: "#FFFFFF0D",
  separator: "#ffffff15",
  primary: "#4F8EF7",
  primaryDim: "#4F8EF715",
  danger: "#F7504F",
  dangerDim: "#F7504F15",
  warning: "#F7A14F",
  warningDim: "#F7A14F15",
  success: "#4FCF8E",
  successDim: "#4FCF8E15",
  text: "#F2F2F7",
  sub: "#AEAEB2",
  muted: "#5c5c5e",
};

const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
const R = { sm: 10, md: 16, lg: 20, xl: 28, full: 999 };
const F = { xs: 11, sm: 13, md: 15, lg: 17, xl: 22, hero: 44 };

// ─── SLIDE-UP BOTTOM SHEET ────────────────────────────────────────────────────
const SHEET_OVERFLOW = 300; // extra px below screen to prevent gap on swipe-up

const APP_ICONS = {
  chrome: { src: require("./assets/icon/chrome.png"), needCircle: true },
  epic_games: {
    src: require("./assets/icon/epicgames.png"),
    needCircle: false,
  },
  gta_v: { src: require("./assets/icon/gtav.png"), needCircle: false },
  nfs_heat: { src: require("./assets/icon/nfsheat.jpg"), needCircle: true },
  spotify: { src: require("./assets/icon/spotify.png"), needCircle: true },
  steam: { src: require("./assets/icon/steam.jpeg"), needCircle: true },
  vscode: { src: require("./assets/icon/vscode.png"), needCircle: false },
  affinity_designer: {
    src: require("./assets/icon/affinity.png"),
    needCircle: true,
  },
};

// ─── ROOT / FOLDER ICON & COLOR MAPS ──────────────────────────────────────────
// Used in File Transfer breadcrumb and root list
const FOLDER_ICON_MAP = {
  Desktop: "desktop-outline",
  Downloads: "download-outline",
  Documents: "document-text-outline",
  Pictures: "image-outline",
  Videos: "videocam-outline",
  Music: "musical-notes-outline",
};

const FOLDER_COLOR_MAP = {
  Desktop: "#4F8EF7", // C.primary
  Downloads: "#4FCF8E", // C.success
  Documents: "#F7A14F", // C.warning
  Pictures: "#FF9F0A",
  Videos: "#F7504F", // C.danger
  Music: "#FF2D55",
};

// Returns whether a path is a drive root (e.g. "C:\", "D:/")
const isDrivePath = (path) => /^[a-zA-Z]:[\\\/]?$/.test(path || "");

const BottomSheet = ({ visible, onClose, children, title, subtitle }) => {
  const [mounted, setMounted] = useState(false);
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withSpring(0, {
        damping: 24,
        stiffness: 220,
        mass: 0.8,
      });
      overlayOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 }, () => {
        runOnJS(setMounted)(false);
      });
      overlayOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      } else {
        // Rubber band upward — capped so it never exceeds SHEET_OVERFLOW
        translateY.value = Math.max(-SHEET_OVERFLOW, e.translationY * 0.15);
      }
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 500) {
        const throwVelocity = Math.max(e.velocityY, 800);
        translateY.value = withSpring(
          SCREEN_HEIGHT,
          {
            velocity: throwVelocity,
            damping: 24,
            stiffness: 220,
            mass: 0.6,
          },
          () => {
            runOnJS(onClose)();
          },
        );
        overlayOpacity.value = withTiming(0, { duration: 150 });
      } else {
        translateY.value = withSpring(0, {
          damping: 24,
          stiffness: 220,
          mass: 0.8,
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <AnimatedRe.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: "rgba(0,0,0,0.50)" },
          overlayStyle,
        ]}
        pointerEvents={visible ? "auto" : "none"}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />
      </AnimatedRe.View>

      <AnimatedRe.View style={[s.sheet, sheetStyle]}>
        <GestureDetector gesture={pan}>
          <AnimatedRe.View style={s.sheetDragArea}>
            <View style={s.sheetHandle} />
            {title ? <Text style={s.sheetTitle}>{title}</Text> : null}
            {subtitle ? <Text style={s.sheetSubtitle}>{subtitle}</Text> : null}
          </AnimatedRe.View>
        </GestureDetector>
        {children}
      </AnimatedRe.View>
    </View>
  );
};

// ─── SLIDE-LEFT FULLSCREEN MODAL ─────────────────────────────────────────────
const SlideLeftModal = ({
  visible,
  onClose,
  children,
  contentInsetTop = 0,
}) => {
  const [mounted, setMounted] = useState(false);
  const slideX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;

    Animated.parallel([
      Animated.spring(slideX, {
        toValue: visible ? 0 : SCREEN_WIDTH,
        tension: 135,
        friction: 19,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 140 : 125,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && !visible) {
        setMounted(false);
      }
    });
  }, [visible, mounted, slideX, overlayOpacity]);

  useEffect(() => {
    if (!visible) return;
    const backSub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose?.();
      return true;
    });
    return () => backSub.remove();
  }, [visible, onClose]);

  if (!mounted) return null;

  return (
    <View style={s.slideLeftWrapper} pointerEvents="box-none">
      <Animated.View
        style={[s.slideLeftOverlay, { opacity: overlayOpacity }]}
      />
      <Animated.View
        style={[
          s.slideLeftContainer,
          { paddingTop: contentInsetTop, transform: [{ translateX: slideX }] },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
};

// ─── ZOOMABLE IMAGE (ported from ImageViewerModal — momentum + edge snap) ────
// Render at 3x layout size so React Native decodes full source resolution.
// Scale range is shifted: MIN_SCALE = fits screen, MAX_SCALE = 5x visual zoom.
const RENDER_FACTOR = 3;
const MIN_SCALE = 1 / RENDER_FACTOR;
const MAX_SCALE = 5 / RENDER_FACTOR;
const FRAME_ASPECT = 16 / 9;

// ─── PEN UTILS ────────────────────────────────────────────────────────────────
// Convert stored stroke points (normalized 0..1 within the actual PC content
// area) back to Svg-coord strings inside the IMG_W x IMG_H frame, accounting
// for letterbox offsets so strokes sit on top of the displayed pixel.
const penPointsToSvg = (pts, contentLeft, contentTop, contentW, contentH) => {
  if (!pts || pts.length === 0) return "";
  let out = "";
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const x = contentLeft + p.nx * contentW;
    const y = contentTop + p.ny * contentH;
    if (i > 0) out += " ";
    out += `${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return out;
};

// Derive "contain-fit" image frame dimensions from current viewport size.
const calcImgDims = (screenW, screenH) => {
  "worklet";
  const screenAspect = screenW / screenH;
  let fitW, fitH;
  if (screenAspect <= FRAME_ASPECT) {
    fitW = screenW;
    fitH = screenW / FRAME_ASPECT;
  } else {
    fitH = screenH;
    fitW = screenH * FRAME_ASPECT;
  }
  return { imgW: fitW * RENDER_FACTOR, imgH: fitH * RENDER_FACTOR };
};

const ZoomableImage = ({
  uri,
  penMode = false,
  pcAspect = 16 / 9,
  strokes = [],
  onPenStrokeFinalize,
}) => {
  const { width: winW, height: winH } = useWindowDimensions();

  // Derive frame dimensions that "contain" fit a 16:9 box inside the viewport
  const { imgW, imgH } = calcImgDims(winW, winH);

  // Letterbox offsets for the actual PC content inside the 16:9 frame
  const frameAspect = imgW / imgH;
  let _contentW, _contentH, _contentLeft, _contentTop;
  if (pcAspect >= frameAspect) {
    _contentW = imgW;
    _contentH = imgW / pcAspect;
    _contentLeft = 0;
    _contentTop = (imgH - _contentH) / 2;
  } else {
    _contentH = imgH;
    _contentW = imgH * pcAspect;
    _contentLeft = (imgW - _contentW) / 2;
    _contentTop = 0;
  }
  const contentW = _contentW;
  const contentH = _contentH;
  const contentLeft = _contentLeft;
  const contentTop = _contentTop;

  // ── Shared values for worklet access (updated on orientation change) ──
  const svScreenW = useSharedValue(winW);
  const svScreenH = useSharedValue(winH);
  const svImgW = useSharedValue(imgW);
  const svImgH = useSharedValue(imgH);
  const svContentW = useSharedValue(contentW);
  const svContentH = useSharedValue(contentH);
  const svContentLeft = useSharedValue(contentLeft);
  const svContentTop = useSharedValue(contentTop);

  const scale = useSharedValue(MIN_SCALE);
  const savedScale = useSharedValue(MIN_SCALE);
  const [prevUri, setPrevUri] = useState(uri);

  const offsetBaseX = useSharedValue(0);
  const offsetBaseY = useSharedValue(0);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const pinchX = useSharedValue(0);
  const pinchY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const pinchActive = useSharedValue(0);

  const hasLoadedRef = useRef(false);
  const prevDimsRef = useRef({ w: winW, h: winH });

  // Sync shared values & reset zoom/pan when orientation changes
  useEffect(() => {
    svScreenW.value = winW;
    svScreenH.value = winH;
    svImgW.value = imgW;
    svImgH.value = imgH;
    svContentW.value = contentW;
    svContentH.value = contentH;
    svContentLeft.value = contentLeft;
    svContentTop.value = contentTop;

    if (prevDimsRef.current.w !== winW || prevDimsRef.current.h !== winH) {
      prevDimsRef.current = { w: winW, h: winH };
      cancelAnimation(offsetBaseX);
      cancelAnimation(offsetBaseY);
      cancelAnimation(scale);
      scale.value = MIN_SCALE;
      savedScale.value = MIN_SCALE;
      offsetBaseX.value = 0;
      offsetBaseY.value = 0;
      panX.value = 0;
      panY.value = 0;
      pinchX.value = 0;
      pinchY.value = 0;
    }
  }, [winW, winH, imgW, imgH, contentW, contentH, contentLeft, contentTop]);

  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      pinchActive.value = 1;
      savedScale.value = scale.value;
      originX.value = e.focalX - svScreenW.value / 2 - offsetBaseX.value;
      originY.value = e.focalY - svScreenH.value / 2 - offsetBaseY.value;
    })
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
      let purePinchX = -originX.value * (e.scale - 1);
      let purePinchY = -originY.value * (e.scale - 1);
      pinchX.value = purePinchX;
      pinchY.value = purePinchY;
    })
    .onEnd(() => {
      offsetBaseX.value += pinchX.value + panX.value;
      offsetBaseY.value += pinchY.value + panY.value;

      pinchX.value = 0;
      pinchY.value = 0;
      panX.value = 0;
      panY.value = 0;

      let targetScale = scale.value;
      if (scale.value < MIN_SCALE) targetScale = MIN_SCALE;
      else if (scale.value > MAX_SCALE) targetScale = MAX_SCALE;

      const _imgW = svImgW.value;
      const _imgH = svImgH.value;
      const _scrW = svScreenW.value;
      const _scrH = svScreenH.value;

      if (targetScale !== scale.value) {
        const ratio = targetScale / scale.value;
        let targetX = offsetBaseX.value * ratio;
        let targetY = offsetBaseY.value * ratio;

        const scaledW = _imgW * targetScale;
        const scaledH = _imgH * targetScale;
        const maxX = Math.max(0, (scaledW - _scrW) / 2);
        const maxY = Math.max(0, (scaledH - _scrH) / 2);
        targetX = Math.max(-maxX, Math.min(maxX, targetX));
        targetY = Math.max(-maxY, Math.min(maxY, targetY));

        offsetBaseX.value = withSpring(targetX);
        offsetBaseY.value = withSpring(targetY);
        scale.value = withSpring(targetScale);
      } else {
        const scaledW = _imgW * targetScale;
        const scaledH = _imgH * targetScale;
        const maxX = Math.max(0, (scaledW - _scrW) / 2);
        const maxY = Math.max(0, (scaledH - _scrH) / 2);
        const cx = offsetBaseX.value;
        const cy = offsetBaseY.value;
        const clampedX = Math.max(-maxX, Math.min(maxX, cx));
        const clampedY = Math.max(-maxY, Math.min(maxY, cy));
        if (cx !== clampedX || cy !== clampedY) {
          offsetBaseX.value = withSpring(clampedX);
          offsetBaseY.value = withSpring(clampedY);
        }
      }

      pinchX.value = 0;
      pinchY.value = 0;
      savedScale.value = targetScale;
      pinchActive.value = 0;
    });

  const panGesture = Gesture.Pan()
    .averageTouches(true)
    .minPointers(penMode ? 2 : 1)
    .onStart((e) => {
      cancelAnimation(offsetBaseX);
      cancelAnimation(offsetBaseY);
      offsetBaseX.value += panX.value;
      offsetBaseY.value += panY.value;
      panX.value = 0;
      panY.value = 0;
    })
    .onUpdate((e) => {
      panX.value = e.translationX;
      panY.value = e.translationY;
    })
    .onEnd((e) => {
      if (
        panX.value === 0 &&
        panY.value === 0 &&
        (scale.value < MIN_SCALE || scale.value > MAX_SCALE)
      ) {
        return;
      }

      offsetBaseX.value += panX.value;
      offsetBaseY.value += panY.value;
      panX.value = 0;
      panY.value = 0;

      let targetScale = scale.value;
      if (scale.value < MIN_SCALE) targetScale = MIN_SCALE;
      else if (scale.value > MAX_SCALE) targetScale = MAX_SCALE;

      const _imgW = svImgW.value;
      const _imgH = svImgH.value;
      const _scrW = svScreenW.value;
      const _scrH = svScreenH.value;

      const scaledW = _imgW * targetScale;
      const scaledH = _imgH * targetScale;
      const maxX = Math.max(0, (scaledW - _scrW) / 2);
      const maxY = Math.max(0, (scaledH - _scrH) / 2);
      const clampX = (v) => Math.max(-maxX, Math.min(maxX, v));
      const clampY = (v) => Math.max(-maxY, Math.min(maxY, v));

      const cx = offsetBaseX.value;
      const cy = offsetBaseY.value;

      if (targetScale !== scale.value) {
        const ratio = targetScale / scale.value;
        let targetX = cx * ratio;
        let targetY = cy * ratio;
        targetX = Math.max(-maxX, Math.min(maxX, targetX));
        targetY = Math.max(-maxY, Math.min(maxY, targetY));
        scale.value = withSpring(targetScale);
        offsetBaseX.value = withSpring(targetX);
        offsetBaseY.value = withSpring(targetY);
      } else {
        const outOfBoundsX = cx < -maxX || cx > maxX;
        const outOfBoundsY = cy < -maxY || cy > maxY;
        const lowVelocity =
          Math.abs(e.velocityX) < 100 && Math.abs(e.velocityY) < 100;
        if (lowVelocity || outOfBoundsX || outOfBoundsY) {
          offsetBaseX.value = withSpring(clampX(cx));
          offsetBaseY.value = withSpring(clampY(cy));
        } else {
          offsetBaseX.value = withDecay({
            velocity: e.velocityX,
            clamp: [-maxX, maxX],
          });
          offsetBaseY.value = withDecay({
            velocity: e.velocityY,
            clamp: [-maxY, maxY],
          });
        }
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      const _imgW = svImgW.value;
      const _imgH = svImgH.value;
      const _scrW = svScreenW.value;
      const _scrH = svScreenH.value;

      if (scale.value > MIN_SCALE * 1.1) {
        scale.value = withSpring(MIN_SCALE);
        savedScale.value = MIN_SCALE;
        offsetBaseX.value = withSpring(0);
        offsetBaseY.value = withSpring(0);
      } else {
        const targetScale = 2.5 / RENDER_FACTOR;
        const dx = e.x - _scrW / 2;
        const dy = e.y - _scrH / 2;
        const offsetX = -dx * (targetScale / MIN_SCALE - 1);
        const offsetY = -dy * (targetScale / MIN_SCALE - 1);
        const scaledW = _imgW * targetScale;
        const scaledH = _imgH * targetScale;
        const maxX = Math.max(0, (scaledW - _scrW) / 2);
        const maxY = Math.max(0, (scaledH - _scrH) / 2);
        const clampedX = Math.max(-maxX, Math.min(maxX, offsetX));
        const clampedY = Math.max(-maxY, Math.min(maxY, offsetY));
        scale.value = withSpring(targetScale);
        savedScale.value = targetScale;
        offsetBaseX.value = withSpring(clampedX);
        offsetBaseY.value = withSpring(clampedY);
      }
    });

  // ── Pen-mode draw gesture ──
  const [liveStrokePoints, setLiveStrokePoints] = useState(null);
  const liveStrokeRef = useRef(null);
  const strokeStartRef = useRef(0);

  const handlePenStartJS = (nx, ny) => {
    const now = Date.now();
    strokeStartRef.current = now;
    const initial = [{ nx, ny, t: 0 }];
    liveStrokeRef.current = initial;
    setLiveStrokePoints(initial);
  };
  const handlePenMoveJS = (nx, ny) => {
    if (!liveStrokeRef.current) return;
    const t = Date.now() - strokeStartRef.current;
    const next = liveStrokeRef.current.concat([{ nx, ny, t }]);
    liveStrokeRef.current = next;
    setLiveStrokePoints(next);
  };
  const handlePenEndJS = () => {
    const pts = liveStrokeRef.current;
    liveStrokeRef.current = null;
    setLiveStrokePoints(null);
    if (!pts || pts.length === 0) return;
    if (onPenStrokeFinalize) onPenStrokeFinalize(pts);
  };

  const drawGesture = Gesture.Pan()
    .maxPointers(1)
    .minDistance(0)
    .onStart((e) => {
      const tx = offsetBaseX.value + panX.value + pinchX.value;
      const ty = offsetBaseY.value + panY.value + pinchY.value;
      const s = scale.value;
      const imgLeft = svScreenW.value / 2 + tx - (svImgW.value * s) / 2;
      const imgTop = svScreenH.value / 2 + ty - (svImgH.value * s) / 2;
      const bx = (e.x - imgLeft) / s;
      const by = (e.y - imgTop) / s;
      let nx = (bx - svContentLeft.value) / svContentW.value;
      let ny = (by - svContentTop.value) / svContentH.value;
      nx = Math.max(0, Math.min(1, nx));
      ny = Math.max(0, Math.min(1, ny));
      runOnJS(handlePenStartJS)(nx, ny);
    })
    .onUpdate((e) => {
      const tx = offsetBaseX.value + panX.value + pinchX.value;
      const ty = offsetBaseY.value + panY.value + pinchY.value;
      const s = scale.value;
      const imgLeft = svScreenW.value / 2 + tx - (svImgW.value * s) / 2;
      const imgTop = svScreenH.value / 2 + ty - (svImgH.value * s) / 2;
      const bx = (e.x - imgLeft) / s;
      const by = (e.y - imgTop) / s;
      let nx = (bx - svContentLeft.value) / svContentW.value;
      let ny = (by - svContentTop.value) / svContentH.value;
      nx = Math.max(0, Math.min(1, nx));
      ny = Math.max(0, Math.min(1, ny));
      runOnJS(handlePenMoveJS)(nx, ny);
    })
    .onFinalize(() => {
      runOnJS(handlePenEndJS)();
    });

  const composedGestures = penMode
    ? Gesture.Simultaneous(pinchGesture, panGesture, drawGesture)
    : Gesture.Race(
        doubleTapGesture,
        Gesture.Simultaneous(pinchGesture, panGesture),
      );

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetBaseX.value + panX.value + pinchX.value },
      { translateY: offsetBaseY.value + panY.value + pinchY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composedGestures}>
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <AnimatedRe.View style={animStyle}>
          {prevUri && prevUri !== uri && (
            <Image
              source={{ uri: prevUri }}
              style={{
                position: "absolute",
                width: imgW,
                height: imgH,
                borderRadius: R.md,
              }}
              resizeMode="contain"
              fadeDuration={0}
            />
          )}
          <Image
            source={{ uri }}
            style={{ width: imgW, height: imgH, borderRadius: R.md }}
            resizeMode="contain"
            fadeDuration={hasLoadedRef.current ? 0 : 300}
            onLoad={() => {
              hasLoadedRef.current = true;
              setPrevUri(uri);
            }}
          />
          <Svg
            width={imgW}
            height={imgH}
            viewBox={`0 0 ${imgW} ${imgH}`}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          >
            {strokes.map((st, i) => (
              <Polyline
                key={st.id || i}
                points={penPointsToSvg(
                  st.points,
                  contentLeft,
                  contentTop,
                  contentW,
                  contentH,
                )}
                stroke={st.color || "#FF3B30"}
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {liveStrokePoints && liveStrokePoints.length > 0 && (
              <Polyline
                points={penPointsToSvg(
                  liveStrokePoints,
                  contentLeft,
                  contentTop,
                  contentW,
                  contentH,
                )}
                stroke="#FF3B30"
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </Svg>
        </AnimatedRe.View>
      </View>
    </GestureDetector>
  );
};

// ─── ANIMATED HELPERS ─────────────────────────────────────────────────────────
const PulseRing = ({ color = C.primary, size = 96 }) => {
  const s1 = useRef(new Animated.Value(1)).current;
  const o1 = useRef(new Animated.Value(0.5)).current;
  const s2 = useRef(new Animated.Value(1)).current;
  const o2 = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    const pulse = (sv, ov, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(sv, {
              toValue: 1.65,
              duration: 1800,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(ov, {
              toValue: 0,
              duration: 1800,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(sv, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(ov, {
              toValue: delay === 0 ? 0.5 : 0.25,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ).start();
    pulse(s1, o1, 0);
    pulse(s2, o2, 900);
  }, []);

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: color,
          transform: [{ scale: s1 }],
          opacity: o1,
        }}
      />
      <Animated.View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: color,
          transform: [{ scale: s2 }],
          opacity: o2,
        }}
      />
    </View>
  );
};

const BlinkDot = ({ color = C.success }) => {
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(op, {
          toValue: 0.25,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(op, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View
      style={{
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: color,
        opacity: op,
        marginRight: SP.sm,
      }}
    />
  );
};

const SpinningIcon = ({ name, size, color, spinning }) => {
  const spin = useRef(new Animated.Value(0)).current;
  const spinRef = useRef(null);

  useEffect(() => {
    if (spinning) {
      spin.setValue(0);
      spinRef.current = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      spinRef.current.start();
    } else {
      if (spinRef.current) spinRef.current.stop();
      spin.setValue(0);
    }
    return () => {
      if (spinRef.current) spinRef.current.stop();
    };
  }, [spinning]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
};

// ── MARQUEE TEXT (auto-scrolling for long text) ──────────────────────────────
const MARQUEE_H = 64; // height for the marquee container (matches font size 56 + buffer)
const MarqueeText = ({
  children,
  style,
  speed = 40,
  gradientColor = C.elevated,
  onScrollChange,
}) => {
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const animRef = useRef(null);

  const overflow = textW - containerW;
  const shouldScroll = containerW > 0 && textW > 0 && overflow > 5;

  useEffect(() => {
    onScrollChange?.(shouldScroll);
  }, [shouldScroll]);

  useEffect(() => {
    if (animRef.current) animRef.current.stop();
    scrollX.setValue(0);
    if (!shouldScroll) return;

    const duration = (overflow / speed) * 1000;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(2000),
        Animated.timing(scrollX, {
          toValue: -overflow - 24,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
        Animated.timing(scrollX, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animRef.current = anim;
    anim.start();
    return () => anim.stop();
  }, [shouldScroll, overflow, speed]);

  return (
    <View
      style={{ width: "100%", overflow: "hidden", height: MARQUEE_H }}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
    >
      {/* Hidden off-screen text for measuring true width (never wraps in 10000px row) */}
      <View
        style={{
          position: "absolute",
          top: -9999,
          flexDirection: "row",
          width: 10000,
        }}
        pointerEvents="none"
      >
        <Text
          style={style}
          onLayout={(e) => setTextW(e.nativeEvent.layout.width)}
        >
          {children}
        </Text>
      </View>

      {/* Visible scrolling text */}
      <Animated.View
        style={{
          flexDirection: "row",
          width: 10000,
          transform: [{ translateX: shouldScroll ? scrollX : 0 }],
        }}
      >
        <Text
          style={[
            style,
            !shouldScroll && { width: containerW, textAlign: "center" },
          ]}
          numberOfLines={1}
        >
          {children}
        </Text>
      </Animated.View>

      {/* Fade edges */}
      {shouldScroll && (
        <>
          <LinearGradient
            colors={[gradientColor, "transparent"]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              position: "absolute",
              left: -3,
              top: 0,
              bottom: 0,
              width: 30,
            }}
            pointerEvents="none"
          />
          <LinearGradient
            colors={["transparent", gradientColor]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.7, y: 0 }}
            style={{
              position: "absolute",
              right: -5,
              top: 0,
              bottom: 0,
              width: 30,
            }}
            pointerEvents="none"
          />
        </>
      )}
    </View>
  );
};

const FadeSlideIn = ({ children, delay = 0, style }) => {
  const op = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(18)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, {
        toValue: 1,
        duration: 480,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(ty, {
        toValue: 0,
        duration: 480,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);
  return (
    <Animated.View
      style={[style, { opacity: op, transform: [{ translateY: ty }] }]}
    >
      {children}
    </Animated.View>
  );
};

// ─── APP ──────────────────────────────────────────────────────────────────────
function AppMain() {
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [savedDevices, setSavedDevices] = useState([]);
  const [connectedHost, setConnectedHost] = useState("Nexus");
  const [activePin, setActivePin] = useState(null);
  const [deviceId, setDeviceId] = useState(null);

  const [isScanningQR, setIsScanningQR] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [showManualInput, setShowManualInput] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [pairingIp, setPairingIp] = useState(null);
  const [pairingHostname, setPairingHostname] = useState(null);
  const [inputPin, setInputPin] = useState("");

  const [marqueeScrolling, setMarqueeScrolling] = useState(false);

  const [currentVolume, setCurrentVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [stats, setStats] = useState(null);
  const [optimisticPlaying, setOptimisticPlaying] = useState(null); // null = use server state
  const [mediaFetching, setMediaFetching] = useState(false);
  const [mediaCooldown, setMediaCooldown] = useState(false);
  const mediaTimeoutRef = useRef(null);
  const [visibleApps, setVisibleApps] = useState([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [showAllProcesses, setShowAllProcesses] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotKey, setScreenshotKey] = useState(0);
  const [imgLoading, setImgLoading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingAction, setLoadingAction] = useState("");
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [hiResImage, setHiResImage] = useState(null);
  const [hiResLoading, setHiResLoading] = useState(false);

  const [mediaSheetOpen, setMediaSheetOpen] = useState(false);
  const [volumeSheetOpen, setVolumeSheetOpen] = useState(false);
  const [powerSheetOpen, setPowerSheetOpen] = useState(false);
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false);
  const [launcherSheetOpen, setLauncherSheetOpen] = useState(false);
  const [keyboardSheetOpen, setKeyboardSheetOpen] = useState(false);
  const [connectivitySheetOpen, setConnectivitySheetOpen] = useState(false);
  const [clipboardSheetOpen, setClipboardSheetOpen] = useState(false);
  const [filesSheetOpen, setFilesSheetOpen] = useState(false);

  // Files browser state
  const [filesRoots, setFilesRoots] = useState([]);
  const [filesCurrentPath, setFilesCurrentPath] = useState(null);
  const [filesParent, setFilesParent] = useState(null);
  const [filesEntries, setFilesEntries] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesUploading, setFilesUploading] = useState(false);

  // Pen overlay (annotation on PC monitor)
  const [penModeActive, setPenModeActive] = useState(false);
  const [penStarting, setPenStarting] = useState(false);
  const [overlayPcSize, setOverlayPcSize] = useState({ width: 0, height: 0 });
  const [penStrokes, setPenStrokes] = useState([]);

  const [launchableApps, setLaunchableApps] = useState([]);
  const [launchingKey, setLaunchingKey] = useState("");
  const [topNavHeight, setTopNavHeight] = useState(0);

  const [queueInput, _setQueueInput] = useState("waasd");
  const queueInputRef = useRef("waasd");
  const setQueueInput = (val) => {
    queueInputRef.current = val;
    _setQueueInput(val);
  };
  const [queueDelayMs, setQueueDelayMs] = useState("10");
  const [queueHoldMs, setQueueHoldMs] = useState("100");
  const queueLoopActive = useRef(false);

  const [wifiActive, setWifiActive] = useState(false);
  const [btActive, setBtActive] = useState(false);
  const [wifiLoading, setWifiLoading] = useState(false);
  const [btLoading, setBtLoading] = useState(false);

  // Live Screen (auto-refresh 1fps in image modal)
  const [liveScreenActive, setLiveScreenActive] = useState(false);
  const liveScreenRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      try {
        let id = await AsyncStorage.getItem("nexus_device_id");
        if (!id) {
          id =
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
          await AsyncStorage.setItem("nexus_device_id", id);
        }
        setDeviceId(id);
        const data = await AsyncStorage.getItem("nexus_devices_v2");
        if (data) {
          const parsed = JSON.parse(data);
          setSavedDevices(parsed);
          if (parsed?.length > 0) {
            setTimeout(
              () =>
                initiateConnect(
                  parsed[0].ip,
                  parsed[0].hostname || parsed[0].ip,
                  parsed[0].pin,
                  true,
                  id,
                ),
              300,
            );
          }
        }
      } catch (e) {}
    };
    init();
  }, []);

  // ── Storage ──────────────────────────────────────────────────
  const saveDevice = async (ip, hostname, pin) => {
    try {
      const newDev = { ip, hostname, pin, lastSeen: Date.now() };
      const updated = [newDev, ...savedDevices.filter((d) => d.ip !== ip)];
      setSavedDevices(updated);
      await AsyncStorage.setItem("nexus_devices_v2", JSON.stringify(updated));
    } catch (e) {}
  };
  const removeSavedDevice = async (ip) => {
    const updated = savedDevices.filter((d) => d.ip !== ip);
    setSavedDevices(updated);
    await AsyncStorage.setItem("nexus_devices_v2", JSON.stringify(updated));
  };
  const renameSavedDevice = async (ip, newName) => {
    const updated = savedDevices.map((d) =>
      d.ip === ip ? { ...d, hostname: newName } : d,
    );
    setSavedDevices(updated);
    await AsyncStorage.setItem("nexus_devices_v2", JSON.stringify(updated));
  };
  const handleDeviceLongPress = (dev) => {
    Alert.alert(dev.hostname || dev.ip, `IP: ${dev.ip}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Rename",
        onPress: () =>
          Alert.prompt
            ? Alert.prompt(
                "Rename",
                "",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Save",
                    onPress: (n) =>
                      n?.trim() && renameSavedDevice(dev.ip, n.trim()),
                  },
                ],
                "plain-text",
                dev.hostname || "",
              )
            : (() => {
                setRenameValue(dev.hostname || "");
                setRenameTarget(dev);
              })(),
      },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeSavedDevice(dev.ip),
      },
    ]);
  };

  // ── Network ──────────────────────────────────────────────────
  const formatConnectionError = (title, data, fallbackUrl = "") => {
    const statusLine =
      data?.status || data?.statusText
        ? `HTTP: ${data?.status || "-"} ${data?.statusText || ""}`.trim()
        : "HTTP: -";
    const phase = data?.phase || data?._requestError?.phase || "unknown";
    const endpoint = data?.endpoint || data?._requestError?.endpoint || "-";
    const requestUrl =
      data?.url || data?._requestError?.url || fallbackUrl || "-";
    const message =
      data?.message ||
      data?.detail ||
      data?._requestError?.message ||
      data?.error ||
      "Unknown connection error";
    return (
      `${title}\n\n` +
      `Phase: ${phase}\n` +
      `${statusLine}\n` +
      `Endpoint: ${endpoint}\n` +
      `URL: ${requestUrl}\n\n` +
      `Error: ${message}`
    );
  };

  const sendAction = async (
    endpoint,
    method = "POST",
    body = null,
    urlOverride = null,
    pinOverride = null,
    idOverride = null,
  ) => {
    const url = urlOverride || serverUrl;
    const pin = pinOverride || activePin;
    const id = idOverride || deviceId;
    if (!url || !pin) return null;
    const requestUrl = `${url}${endpoint}`;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 12000);
      const opts = {
        method,
        headers: { "Content-Type": "application/json", pin, "x-nexus-id": id },
        signal: ctrl.signal,
      };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(requestUrl, opts);
      clearTimeout(tid);

      const contentType = res.headers.get("content-type") || "";
      let payload = null;
      let rawText = "";

      if (contentType.includes("application/json")) {
        payload = await res.json();
      } else {
        rawText = await res.text();
        try {
          payload = rawText ? JSON.parse(rawText) : null;
        } catch {
          payload = null;
        }
      }

      if (!res.ok) {
        const requestError = {
          phase: "http",
          status: res.status,
          statusText: res.statusText,
          endpoint,
          url: requestUrl,
          message:
            payload?.detail ||
            payload?.message ||
            rawText ||
            res.statusText ||
            "Request failed",
        };

        if (payload && typeof payload === "object") {
          return { ...payload, _requestError: requestError };
        }

        return { error: `HTTP ${res.status}`, ...requestError };
      }

      if (payload && typeof payload === "object") {
        return payload;
      }

      return { ok: true, data: rawText || "" };
    } catch (e) {
      return {
        error: "Network request failed",
        phase: e?.name === "AbortError" ? "timeout" : "network",
        message: e?.message || e?.toString?.() || "Unknown error",
        endpoint,
        url: requestUrl,
      };
    }
  };

  const initiateConnect = async (
    ip,
    hostname = "PC",
    savedPin = null,
    isAuto = false,
    forceId = null,
  ) => {
    const raw = ip || ipAddress;
    if (!raw?.trim()) return;
    const cleanIp = raw
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/:\d+$/, "")
      .replace(/\/+$/, "");
    const url = `http://${cleanIp}:8000`;
    setLoadingAction(`connecting_${cleanIp}`);
    try {
      const data = await sendAction(
        "/auth-check",
        "GET",
        null,
        url,
        savedPin,
        forceId,
      );
      if (data?.error) {
        if (!isAuto)
          Alert.alert(
            "Connection Failed",
            formatConnectionError(`Could not reach ${cleanIp}`, data, url),
          );
        return;
      }
      if (!data || data.detail === "Invalid Nexus Pairing Code" || !savedPin) {
        setPairingIp(cleanIp);
        setPairingHostname(hostname);
        setPairingModalOpen(true);
        setLoadingAction("");
        return;
      }
      if (savedPin) await saveDevice(cleanIp, hostname, savedPin);
      setActivePin(savedPin);
      setServerUrl(url);
      setConnectedHost(hostname || data?.hostname || cleanIp);
      setIsConnected(true);
      fetchVolume(url, savedPin);
      getStats(url, savedPin);
      captureScreen(url, savedPin);
      fetchApps(url, savedPin);
      fetchConnectivity(url, savedPin);
    } catch (e) {
    } finally {
      setLoadingAction("");
    }
  };

  const handlePairingSubmit = async () => {
    if (inputPin.length !== 4)
      return Alert.alert("Invalid PIN", "Enter the 4-digit Code.");
    setLoadingAction("pairing");
    const url = `http://${pairingIp}:8000`;
    const res = await sendAction("/auth-check", "GET", null, url, inputPin);
    if (res && !res.error && res.status === "ok") {
      await saveDevice(pairingIp, pairingHostname, inputPin);
      setActivePin(inputPin);
      setServerUrl(url);
      setConnectedHost(pairingHostname || res?.hostname || pairingIp);
      setIsConnected(true);
      setPairingModalOpen(false);
      setInputPin("");
      fetchVolume(url, inputPin);
      getStats(url, inputPin);
      captureScreen(url, inputPin);
      fetchApps(url, inputPin);
      fetchConnectivity(url, inputPin);
    } else
      Alert.alert(
        "Pairing Failed",
        formatConnectionError("Incorrect code or server unreachable", res, url),
      );
    setLoadingAction("");
  };

  const handleQRScan = async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        Alert.alert(
          "Camera Required",
          "Grant camera permission to scan QR codes.",
        );
        return;
      }
    }
    setIsScanningQR(true);
  };
  const onBarcodeScanned = ({ data }) => {
    setIsScanningQR(false);
    try {
      const p = JSON.parse(data);
      if (p.url && p.pin) {
        const ip = p.url
          .replace(/^https?:\/\//, "")
          .replace(/:\d+$/, "")
          .replace(/\/+$/, "");
        initiateConnect(ip, p.hostname || "Nexus PC", p.pin);
      } else if (p.ip && p.pin) {
        initiateConnect(p.ip, p.hostname || "Nexus PC", p.pin);
      } else Alert.alert("Invalid QR", "Not a valid Nexus QR code.");
    } catch {
      Alert.alert("Invalid QR", "Could not parse QR data.");
    }
  };
  const disconnect = () => {
    setIsConnected(false);
    setServerUrl("");
    setConnectedHost("Nexus");
    setStats(null);
    setVisibleApps([]);
    setScreenshot(null);
    setActivePin(null);
    setConnectivitySheetOpen(false);
    setWifiActive(false);
    setBtActive(false);

    setLiveScreenActive(false);
    if (liveScreenRef.current) {
      clearTimeout(liveScreenRef.current);
      liveScreenRef.current = null;
    }
  };

  useEffect(() => {
    const backAction = () => {
      if (imageModalOpen) {
        setImageModalOpen(false);
        return true;
      }
      if (mediaSheetOpen) {
        setMediaSheetOpen(false);
        return true;
      }
      if (volumeSheetOpen) {
        setVolumeSheetOpen(false);
        return true;
      }
      if (powerSheetOpen) {
        setPowerSheetOpen(false);
        return true;
      }
      if (shortcutSheetOpen) {
        setShortcutSheetOpen(false);
        return true;
      }
      if (launcherSheetOpen) {
        setLauncherSheetOpen(false);
        return true;
      }
      if (keyboardSheetOpen) {
        setKeyboardSheetOpen(false);
        return true;
      }
      if (connectivitySheetOpen) {
        setConnectivitySheetOpen(false);
        return true;
      }
      if (clipboardSheetOpen) {
        setClipboardSheetOpen(false);
        return true;
      }
      if (filesSheetOpen) {
        if (filesCurrentPath) {
          if (filesParent) browseFilesPath(filesParent);
          else fetchFilesRoots();
        } else {
          setFilesSheetOpen(false);
        }
        return true;
      }
      if (isScanningQR) {
        setIsScanningQR(false);
        return true;
      }
      if (pairingModalOpen) {
        setPairingModalOpen(false);
        return true;
      }
      if (renameTarget) {
        setRenameTarget(null);
        return true;
      }
      if (isConnected) {
        Alert.alert(
          "Disconnect",
          "Are you sure you want to close the connection?",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Yes",
              onPress: () => disconnect(),
            },
          ],
        );
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction,
    );

    return () => backHandler.remove();
  }, [
    imageModalOpen,
    mediaSheetOpen,
    volumeSheetOpen,
    powerSheetOpen,
    shortcutSheetOpen,
    launcherSheetOpen,
    keyboardSheetOpen,
    connectivitySheetOpen,
    clipboardSheetOpen,
    filesSheetOpen,
    filesCurrentPath,
    filesParent,
    isScanningQR,
    pairingModalOpen,
    renameTarget,
    isConnected,
  ]);

  // ── Features ─────────────────────────────────────────────────
  const fetchVolume = async (url, pin) => {
    const d = await sendAction("/volume", "GET", null, url, pin);
    if (d && !d.error) {
      setCurrentVolume(d.volume);
      setIsMuted(d.muted);
    }
  };
  const handleToggleMute = async () => {
    const r = await sendAction("/volume/mute");
    if (r && !r.error) setIsMuted(r.muted);
  };
  const handleVolumeUp = async () => {
    const r = await sendAction("/volume/up");
    if (r && !r.error) {
      setCurrentVolume(r.volume);
      setIsMuted(false);
    }
  };
  const handleVolumeDown = async () => {
    const r = await sendAction("/volume/down");
    if (r && !r.error) {
      setCurrentVolume(r.volume);
      setIsMuted(false);
    }
  };
  const mediaControl = async (a) => {
    // Cooldown guard — prevent spam
    if (a !== "prev") {
      if (mediaCooldown) return;
      setMediaCooldown(true);
      setTimeout(() => setMediaCooldown(false), 4000);
    }

    // Cancel any pending server check from a previous press
    if (mediaTimeoutRef.current) clearTimeout(mediaTimeoutRef.current);

    // Optimistic toggle for play/pause
    if (a === "playpause") {
      const currentlyPlaying =
        stats?.active_media && stats.active_media !== "Not Playing";
      setOptimisticPlaying(!currentlyPlaying);
    }

    setMediaFetching(true);
    sendAction(`/media/${a}`);

    // Confirm real state after delay
    mediaTimeoutRef.current = setTimeout(async () => {
      const d = await sendAction("/stats", "GET");
      if (d?.cpu_percent !== undefined) setStats(d);
      setOptimisticPlaying(null);
      setMediaFetching(false);
      mediaTimeoutRef.current = null;
    }, 3000);
  };
  const captureScreen = async (url = null, pin = null) => {
    setIsCapturing(true);
    setImgLoading(true);
    const d = await sendAction("/screen", "GET", null, url, pin);
    if (d?.image) {
      setScreenshot(d.image);
      setScreenshotKey((prev) => prev + 1);
    }
    setIsCapturing(false);
    setImgLoading(false);
  };
  const captureHiRes = async () => {
    setHiResLoading(true);
    try {
      const rawUrl = `${serverUrl}/screen/raw?quality=high&token=${deviceId}&t=${Date.now()}`;
      await Image.prefetch(rawUrl);
      setHiResImage(rawUrl);
    } catch (e) {
      console.warn("Hi-res fetch failed", e);
    }
    setHiResLoading(false);
  };
  const openImageDetail = async () => {
    setHiResLoading(true);
    try {
      const rawUrl = `${serverUrl}/screen/raw?quality=high&token=${deviceId}&t=${Date.now()}`;
      await Image.prefetch(rawUrl);
      setHiResImage(rawUrl);
      setImageModalOpen(true);
    } catch (e) {
      // Fallback: open with thumbnail
      setHiResImage(screenshot);
      setImageModalOpen(true);
    }
    setHiResLoading(false);
  };
  const getStats = async (url = null, pin = null) => {
    setLoadingAction("stats");
    const t = Date.now();
    const d = await sendAction("/stats", "GET", null, url, pin);
    const el = Date.now() - t;
    if (el < 1000) await new Promise((r) => setTimeout(r, 1000 - el));
    if (d?.cpu_percent !== undefined) setStats(d);
    setLoadingAction("");
  };
  const fetchApps = async (url = null, pin = null) => {
    setIsLoadingApps(true);
    const d = await sendAction("/apps", "GET", null, url, pin);
    if (d?.apps) setVisibleApps(d.apps);
    setIsLoadingApps(false);
  };
  const handlePower = (action) =>
    Alert.alert("Confirm", `${action.toUpperCase()} your PC? Runs in 5 sec.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        style: "destructive",
        onPress: async () => {
          await sendAction(`/power/${action}`);
          setStats(null);
        },
      },
    ]);
  const cancelShutdown = async () => {
    await sendAction("/power/cancel");
    Alert.alert("Aborted", "Shutdown/Restart cancelled.");
  };

  const handleKillProcess = (app) => {
    Alert.alert("End Task", `Force quit ${app.name}?\n\n"${app.title}"`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Force Quit",
        style: "destructive",
        onPress: async () => {
          const res = await sendAction("/process/kill", "POST", {
            pid: app.pid,
            name: app.name,
          });
          if (res?.error) {
            Alert.alert("Failed", res.error);
          }
          setTimeout(() => {
            fetchApps();
            getStats();
          }, 500);
        },
      },
    ]);
  };

  // ── Keyboard Shortcuts ──
  const sendShortcut = async (shortcut) => {
    await sendAction("/shortcut", "POST", { shortcut });
  };

  // ── App Launcher ──
  const fetchLaunchableApps = async () => {
    const r = await sendAction("/apps/launchables", "GET");
    if (r && !r.error && Array.isArray(r.apps)) {
      setLaunchableApps(r.apps);
    }
  };

  const launchPresetApp = async (appKey) => {
    setLaunchingKey(appKey);
    const r = await sendAction("/apps/launch", "POST", { app_key: appKey });
    if (r?.error) {
      Alert.alert("Launch Failed", r.error);
    }
    setLaunchingKey("");
  };

  const parseQueueInput = (raw) => {
    return Array.from((raw || "").replace(/\r/g, "")).map((char) => {
      let key = char;
      if (char === "\n") key = "enter";
      if (char === "\t") key = "tab";
      if (char === " ") key = "space";
      return { key, action: "tap" }; // Default to tap for server compatibility with uppercase
    });
  };

  const sendQueueToServer = async () => {
    if (!queueInput.trim()) {
      Alert.alert("Kosong", "Tulis teks atau pola dulu.");
      return;
    }

    const items = parseQueueInput(queueInput);

    // Server uses default_delay_ms and default_hold_ms to process tap/hold times globally
    const payload = {
      items,
      default_delay_ms: Number(queueDelayMs) || 0,
      default_hold_ms: Number(queueHoldMs) || 30,
    };

    const r = await sendAction("/keyboard/queue/start", "POST", payload);
    if (r?.error) {
      Alert.alert("Gagal", r.error);
    } else {
      setQueueInput(""); // Bersihkan setelah sukses
    }
  };

  const stopServerQueue = async () => {
    const r = await sendAction("/keyboard/queue/stop", "POST");
    if (r?.error) {
      Alert.alert("Gagal", r.error);
    } else {
      Alert.alert("Dihentikan", "Eksekusi antrian di PC telah dibatalkan.");
    }
  };

  // ── Connectivity ──
  const fetchConnectivity = async (url = null, pin = null) => {
    const d = await sendAction("/connectivity", "GET", null, url, pin);
    if (d && d.wifi !== undefined) {
      setWifiActive(d.wifi);
      setBtActive(d.bluetooth);
    }
  };

  const toggleRadio = async (type) => {
    const isCurrentlyActive = type === "wifi" ? wifiActive : btActive;
    const action = isCurrentlyActive ? "off" : "on";

    if (type === "wifi" && action === "off") {
      Alert.alert(
        "Turn Off Wi-Fi?",
        "This will disable Wi-Fi on your PC. You will lose connection to Nexus Remote and won't be able to reconnect until Wi-Fi is turned back on manually.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Turn Off",
            style: "destructive",
            onPress: () => executeToggle(type, action),
          },
        ],
      );
    } else {
      executeToggle(type, action);
    }
  };

  const executeToggle = async (type, action) => {
    if (type === "wifi") setWifiLoading(true);
    else setBtLoading(true);

    const r = await sendAction(`/connectivity/${type}/${action}`, "POST");

    if (r && !r.error && r.status === "success") {
      if (type === "wifi") setWifiActive(r.wifi);
      else setBtActive(r.bluetooth);
    }

    if (type === "wifi") setWifiLoading(false);
    else setBtLoading(false);
  };

  const handleSendClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text) return Alert.alert("Empty Clipboard", "Nothing to send.");
      const r = await sendAction("/clipboard", "POST", { content: text });
      if (r && !r.error && r.status === "success") {
        Alert.alert("Sent", "Clipboard text sent to PC.");
      } else {
        Alert.alert("Error", "Failed to send clipboard.");
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const handleReceiveClipboard = async () => {
    try {
      const r = await sendAction("/clipboard", "GET");
      if (r && !r.error && r.status === "success" && r.content) {
        await Clipboard.setStringAsync(r.content);
        Alert.alert("Received", "PC clipboard copied to your phone.");
      } else {
        Alert.alert("Empty or Error", "Could not get clipboard from PC.");
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  // ── Panic Button ──
  const handlePanic = async () => {
    await sendAction("/panic");
  };

  // ── File Transfer ──
  const formatBytes = (n) => {
    if (!n || n <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  };

  const fetchFilesRoots = async () => {
    setFilesLoading(true);
    try {
      const r = await sendAction("/files/roots", "GET");
      if (r && !r.error && Array.isArray(r.roots)) {
        setFilesRoots(r.roots);
        setFilesCurrentPath(null);
        setFilesParent(null);
        setFilesEntries([]);
      } else {
        Alert.alert("Error", "Failed to load folders");
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setFilesLoading(false);
    }
  };

  const browseFilesPath = async (path) => {
    setFilesLoading(true);
    try {
      const r = await sendAction(
        `/files/list?path=${encodeURIComponent(path)}`,
        "GET",
      );
      if (r && !r.error && Array.isArray(r.entries)) {
        setFilesCurrentPath(r.path);
        setFilesParent(r.parent);
        setFilesEntries(r.entries);
      } else {
        Alert.alert("Error", r?.message || "Failed to load folder");
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setFilesLoading(false);
    }
  };

  const downloadFile = (entry) => {
    const url = `${serverUrl}/files/download?token=${encodeURIComponent(
      deviceId,
    )}&path=${encodeURIComponent(entry.path)}`;
    Linking.openURL(url).catch((e) => Alert.alert("Download Error", e.message));
  };

  const uploadFileToCurrent = async () => {
    if (!filesCurrentPath) {
      Alert.alert("Pick Folder", "Open a destination folder first.");
      return;
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: "*/*",
      });
      if (res.canceled) return;
      const asset = res.assets && res.assets[0];
      if (!asset) return;
      setFilesUploading(true);
      const form = new FormData();
      form.append("dest_path", filesCurrentPath);
      form.append("file", {
        uri: asset.uri,
        name: asset.name || "upload.bin",
        type: asset.mimeType || "application/octet-stream",
      });
      const r = await fetch(`${serverUrl}/files/upload`, {
        method: "POST",
        headers: { pin: activePin, "x-nexus-id": deviceId },
        body: form,
      });
      const payload = await r.json().catch(() => null);
      if (!r.ok || !payload || payload.error) {
        Alert.alert(
          "Upload Failed",
          payload?.detail || payload?.message || `HTTP ${r.status}`,
        );
      } else {
        await browseFilesPath(filesCurrentPath);
        Alert.alert("Uploaded", payload.name || "File sent to PC.");
      }
    } catch (e) {
      Alert.alert("Upload Error", e.message);
    } finally {
      setFilesUploading(false);
    }
  };

  // ── Pen Overlay ──
  const enablePenMode = async () => {
    if (penStarting || penModeActive) return;
    setPenStarting(true);
    try {
      const r = await sendAction("/overlay/start", "POST");
      if (r && !r.error) {
        // Server returns actual PC screen dimensions — used to compute
        // letterbox offsets on the mobile side.
        const w = Number(r.width) || 0;
        const h = Number(r.height) || 0;
        if (w > 0 && h > 0) setOverlayPcSize({ width: w, height: h });
        setPenStrokes([]);
        setPenModeActive(true);
      } else {
        Alert.alert("Pen Mode", "Failed to start overlay.");
      }
    } catch (e) {
      Alert.alert("Pen Mode", e.message);
    } finally {
      setPenStarting(false);
    }
  };

  const disablePenMode = async () => {
    setPenModeActive(false);
    setPenStrokes([]);
    setOverlayPcSize({ width: 0, height: 0 });
    try {
      await sendAction("/overlay/stop", "POST");
    } catch (e) {
      // best-effort
    }
  };

  // ── Pen stroke finalization ──
  // ZoomableImage's draw gesture buffers points locally and draws them on
  // a phone-side Svg for instant feedback. When the finger lifts we get
  // the complete stroke (points carry timestamps from the recording),
  // append it to local state, and POST once to the server which replays
  // it with original timing so PC viewers see the goresan animate in.
  const handlePenStrokeFinalize = (points) => {
    if (!penModeActive || !points || points.length === 0) return;
    const strokeId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const color = "#FF3B30";
    const width = 6;
    const stroke = { id: strokeId, color, width, points };
    setPenStrokes((prev) => prev.concat([stroke]));
    // Send in the background — don't block the UI.
    (async () => {
      try {
        await fetch(`${serverUrl}/overlay/replay_stroke`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            pin: activePin,
            "x-nexus-id": deviceId,
          },
          body: JSON.stringify({
            stroke_id: strokeId,
            color,
            width,
            points: points.map((p) => [p.nx, p.ny, p.t]),
          }),
        });
      } catch (e) {
        // best-effort — local canvas already shows it
      }
    })();
  };

  // ── Live Screen ──
  const startLiveScreen = () => {
    setLiveScreenActive(true);
  };
  const stopLiveScreen = () => {
    setLiveScreenActive(false);
    if (liveScreenRef.current) {
      clearTimeout(liveScreenRef.current);
      liveScreenRef.current = null;
    }
  };

  useEffect(() => {
    if (liveScreenActive && imageModalOpen) {
      const tick = async () => {
        try {
          const rawUrl = `${serverUrl}/screen/raw?quality=low&token=${deviceId}&t=${Date.now()}`;
          await Image.prefetch(rawUrl);
          setHiResImage(rawUrl);
        } catch (e) {
          console.warn("Live screen fetch failed", e);
        }
        if (liveScreenActive) {
          liveScreenRef.current = setTimeout(tick, 1200); // ~1fps with network latency
        }
      };
      tick();
    } else {
      if (liveScreenRef.current) {
        clearTimeout(liveScreenRef.current);
        liveScreenRef.current = null;
      }
    }
    return () => {
      if (liveScreenRef.current) {
        clearTimeout(liveScreenRef.current);
        liveScreenRef.current = null;
      }
    };
  }, [liveScreenActive, imageModalOpen]);

  useEffect(() => {
    if (launcherSheetOpen) {
      fetchLaunchableApps();
    }
  }, [launcherSheetOpen]);

  useEffect(() => {
    if (filesSheetOpen) {
      fetchFilesRoots();
    }
  }, [filesSheetOpen]);

  useEffect(() => {
    // Stop pen mode when the image modal closes or live screen stops.
    if ((!imageModalOpen || !liveScreenActive) && penModeActive) {
      disablePenMode();
    }
  }, [imageModalOpen, liveScreenActive]);

  useEffect(() => {
    if (imageModalOpen) {
      ScreenOrientation.unlockAsync();
    } else {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      );
    }
  }, [imageModalOpen]);

  useEffect(() => {
    if (!keyboardSheetOpen) {
      Keyboard.dismiss();
      setQueueInput("");
    }
  }, [keyboardSheetOpen]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchVolume(),
        fetchApps(),
        getStats(),
        captureScreen(),
        fetchConnectivity(),
      ]);
    } catch (e) {
      console.warn("Refresh error", e);
    }
    setRefreshing(false);
  }, [serverUrl, activePin]);

  // Auto-refresh on first connect (including auto-connect on app start)
  const hasAutoRefreshed = useRef(false);
  useEffect(() => {
    if (isConnected && serverUrl && activePin && !hasAutoRefreshed.current) {
      hasAutoRefreshed.current = true;
      // Small delay to ensure state is committed
      setTimeout(() => {
        captureScreen();
        getStats();
        fetchApps();
        fetchVolume();
        fetchConnectivity();
      }, 500);
    }
    if (!isConnected) {
      hasAutoRefreshed.current = false;
    }
  }, [isConnected, serverUrl, activePin]);

  const cpuColor =
    stats?.cpu_percent > 80
      ? C.danger
      : stats?.cpu_percent > 60
        ? C.warning
        : C.success;
  const ramColor =
    stats?.ram_percent > 80
      ? C.danger
      : stats?.ram_percent > 60
        ? C.warning
        : C.primary;

  const keyboardModalTopInset =
    topNavHeight +
    (Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0);

  // Easy-to-edit display name mapping for active window title.
  const ACTIVE_WINDOW_LABEL_MAP = {
    "System tray overflow window.": "System tray",
    "Program Manager": "Desktop",
  };

  // Easy-to-edit display name mapping for process/app names.
  const APP_NAME_LABEL_MAP = {
    Code: "VSCode",
    Steamwebhelper: "Steam",
    "WINWORD.EXE": "Microsoft Word",
    "EXCEL.EXE": "Microsoft Excel",
    Chrome: "Google Chrome",
    Taskmgr: "Task Manager",
    Antigravity: "Google Antigravity",
    Pwsh: "Windows PowerShell",
    Affinity: "Affinity Designer",
    Obs64: "OBS Studio",
    Zoom: "Zoom Workplace",
    WindowsTerminal: "Command Prompt",
    "POWERPOINT.EXE": "Microsoft PowerPoint",
    "ONENOTE.EXE": "Microsoft OneNote",
    Msedge: "Microsoft Edge",
  };

  const displayActiveWindow = stats?.active_window
    ? ACTIVE_WINDOW_LABEL_MAP[stats.active_window] || stats.active_window
    : "";

  // ════════════════════════════════════════════════════════════════
  // UNCONNECTED SCREEN
  // ════════════════════════════════════════════════════════════════
  if (!isConnected) {
    return (
      <View style={s.root}>
        <StatusBar
          barStyle="light-content"
          translucent
          backgroundColor="transparent"
        />

        <ScrollView
          contentContainerStyle={s.scrollLogin}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <FadeSlideIn delay={0} style={s.hero}>
            <View style={s.logoWrap}>
              <PulseRing color={C.primary} size={100} />
              <View style={s.logoCircle}>
                <MaterialCommunityIcons
                  name="remote-desktop"
                  size={32}
                  color={C.primary}
                />
              </View>
            </View>
            <Text style={s.heroTitle}>NEXUS</Text>
            <Text style={s.heroSub}>Remote Desktop Controller</Text>
            <View style={s.readyBadge}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: C.success,
                  marginRight: 6,
                }}
              />
              <Text style={s.readyBadgeText}>Ready to Connect</Text>
            </View>
          </FadeSlideIn>

          {/* Scan QR row */}
          <FadeSlideIn delay={100}>
            <TouchableOpacity
              style={s.menuRow}
              onPress={handleQRScan}
              activeOpacity={0.6}
            >
              <View style={[s.menuRowIcon, { backgroundColor: C.primaryDim }]}>
                <MaterialCommunityIcons
                  name="qrcode-scan"
                  size={20}
                  color={C.primary}
                />
              </View>
              <View style={s.menuRowBody}>
                <Text style={s.menuRowTitle}>Scan QR Code</Text>
                <Text style={s.menuRowSub}>
                  Open PC tray and "Show QR to Connect"
                </Text>
              </View>
              <Ionicons
                name="arrow-forward-outline"
                size={20}
                color={C.muted}
                style={{ paddingRight: SP.sm }}
              />
            </TouchableOpacity>
            <View style={s.sep} />
          </FadeSlideIn>

          {/* Saved devices */}
          {savedDevices.length > 0 && (
            <FadeSlideIn delay={180} style={{ marginTop: SP.lg }}>
              <Text style={s.groupLabel}>PAIRED DEVICES</Text>
              {savedDevices.map((dev, i) => (
                <View key={dev.ip}>
                  <TouchableOpacity
                    style={s.menuRow}
                    onPress={() =>
                      initiateConnect(dev.ip, dev.hostname || dev.ip, dev.pin)
                    }
                    onLongPress={() => handleDeviceLongPress(dev)}
                    disabled={loadingAction.includes("connecting")}
                    activeOpacity={0.6}
                  >
                    <View
                      style={[s.menuRowIcon, { backgroundColor: C.successDim }]}
                    >
                      <Ionicons name="desktop" size={18} color={C.success} />
                    </View>
                    <View style={s.menuRowBody}>
                      <Text style={s.menuRowTitle}>
                        {dev.hostname || `PC (${dev.ip})`}
                      </Text>
                      <Text style={s.menuRowSub}>{dev.ip}</Text>
                    </View>
                    {loadingAction === `connecting_${dev.ip}` ? (
                      <ActivityIndicator
                        style={{ paddingRight: SP.sm }}
                        size="small"
                        color={C.primary}
                      />
                    ) : (
                      <Ionicons
                        name="arrow-forward-outline"
                        size={20}
                        color={C.muted}
                        style={{ paddingRight: SP.sm }}
                      />
                    )}
                  </TouchableOpacity>
                  {i < savedDevices.length - 1 && <View style={s.sep} />}
                </View>
              ))}
              <View style={s.sep} />
            </FadeSlideIn>
          )}

          {/* Manual input */}
          <FadeSlideIn delay={240} style={{ marginTop: SP.lg }}>
            {!showManualInput ? (
              <>
                <TouchableOpacity
                  style={s.menuRow}
                  onPress={() => setShowManualInput(true)}
                  activeOpacity={0.6}
                >
                  <View
                    style={[s.menuRowIcon, { backgroundColor: C.elevated }]}
                  >
                    <Ionicons name="terminal-outline" size={18} color={C.sub} />
                  </View>
                  <View style={s.menuRowBody}>
                    <Text style={s.menuRowTitle}>Enter IP Manually</Text>
                    <Text style={s.menuRowSub}>
                      Type the PC's local IP address
                    </Text>
                  </View>
                  <Ionicons
                    name="arrow-forward-outline"
                    size={20}
                    color={C.muted}
                    style={{ paddingRight: SP.sm }}
                  />
                </TouchableOpacity>
                <View style={s.sep} />
              </>
            ) : (
              <View style={{ paddingBottom: SP.md }}>
                <Text style={s.groupLabel}>MANUAL CONNECTION</Text>
                <View style={s.inputRow}>
                  <Ionicons
                    name="globe-outline"
                    size={18}
                    color={C.muted}
                    style={{ paddingLeft: SP.sm, marginRight: SP.sm }}
                  />
                  <TextInput
                    style={s.inputField}
                    placeholder="192.168.x.x"
                    placeholderTextColor={C.muted}
                    value={ipAddress}
                    onChangeText={setIpAddress}
                    keyboardType="default"
                    autoCapitalize="none"
                  />
                </View>
                <TouchableOpacity
                  style={[s.btnPrimary, !ipAddress.trim() && { opacity: 0.3 }]}
                  onPress={() => initiateConnect(null, "Direct PC", null)}
                  disabled={!ipAddress.trim()}
                  activeOpacity={0.8}
                >
                  <Text style={s.btnPrimaryText}>CONNECT</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={15}
                    color={C.text}
                    style={{ marginLeft: 8 }}
                  />
                </TouchableOpacity>
              </View>
            )}
          </FadeSlideIn>

          <View style={{ height: 60 }} />
        </ScrollView>

        {/* Rename Modal */}
        <Modal
          visible={renameTarget !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setRenameTarget(null)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={s.modalOverlay}
          >
            <View style={s.modalBox}>
              <View style={[s.modalIcon, { backgroundColor: C.primaryDim }]}>
                <Ionicons name="create" size={22} color={C.primary} />
              </View>
              <Text style={s.modalTitle}>Rename Device</Text>
              <Text style={s.modalSub}>{renameTarget?.ip}</Text>
              <TextInput
                style={[
                  s.pinInput,
                  {
                    fontSize: 16,
                    letterSpacing: 0,
                    borderColor: C.primary,
                    color: C.text,
                  },
                ]}
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="e.g. My Desktop"
                placeholderTextColor={C.muted}
                autoFocus
              />
              <View style={s.modalBtnRow}>
                <TouchableOpacity
                  style={s.btnSecondary}
                  onPress={() => {
                    setRenameTarget(null);
                    setRenameValue("");
                  }}
                >
                  <Text style={s.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    s.btnPrimary,
                    { flex: 1 },
                    !renameValue.trim() && { opacity: 0.3 },
                  ]}
                  disabled={!renameValue.trim()}
                  onPress={() => {
                    renameSavedDevice(renameTarget.ip, renameValue.trim());
                    setRenameTarget(null);
                    setRenameValue("");
                  }}
                >
                  <Text style={s.btnPrimaryText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* QR Camera */}
        <Modal
          visible={isScanningQR}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setIsScanningQR(false)}
        >
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={onBarcodeScanned}
            />
            <View style={s.qrOverlay}>
              <View style={s.qrOverlayTop}>
                <Text style={s.qrOverlayTitle}>Scan Nexus QR</Text>
                <Text style={s.qrOverlayHint}>
                  Point at the QR on your PC screen
                </Text>
              </View>
              <View style={s.qrFrame}>
                <View style={[s.qrCorner, s.qrTL]} />
                <View style={[s.qrCorner, s.qrTR]} />
                <View style={[s.qrCorner, s.qrBL]} />
                <View style={[s.qrCorner, s.qrBR]} />
              </View>
              <TouchableOpacity
                style={s.qrCloseBtn}
                onPress={() => setIsScanningQR(false)}
              >
                <Ionicons name="close-circle" size={20} color={C.text} />
                <Text style={s.qrCloseBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Pairing Modal */}
        <Modal
          visible={pairingModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPairingModalOpen(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={s.modalOverlay}
          >
            <View style={s.modalBox}>
              <View style={[s.modalIcon, { backgroundColor: C.warningDim }]}>
                <Ionicons name="lock-closed" size={22} color={C.warning} />
              </View>
              <Text style={s.modalTitle}>Pairing Required</Text>
              <Text style={s.modalSub}>
                Enter the 4-digit code shown on{"\n"}
                <Text style={{ color: C.text, fontWeight: "700" }}>
                  {pairingHostname}
                </Text>
                's system tray
              </Text>
              <TextInput
                style={[
                  s.pinInput,
                  { borderColor: C.warning, color: C.warning },
                ]}
                keyboardType="number-pad"
                maxLength={4}
                value={inputPin}
                onChangeText={setInputPin}
                placeholder="• • • •"
                placeholderTextColor={C.muted}
                autoFocus
                secureTextEntry
              />
              <View style={s.modalBtnRow}>
                <TouchableOpacity
                  style={s.btnSecondary}
                  onPress={() => {
                    setPairingModalOpen(false);
                    setInputPin("");
                  }}
                >
                  <Text style={s.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    s.btnPrimary,
                    { flex: 1 },
                    inputPin.length !== 4 && { opacity: 0.3 },
                  ]}
                  onPress={handlePairingSubmit}
                  disabled={
                    inputPin.length !== 4 || loadingAction === "pairing"
                  }
                >
                  {loadingAction === "pairing" ? (
                    <ActivityIndicator color={C.bg} size="small" />
                  ) : (
                    <Text style={s.btnPrimaryText}>Verify</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // CONNECTED SCREEN
  // ════════════════════════════════════════════════════════════════
  const hostname = connectedHost;

  return (
    <View style={s.root}>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />

      {/* Top Nav */}
      <View
        style={s.topNav}
        onLayout={(e) => setTopNavHeight(e.nativeEvent.layout.height)}
      >
        <View style={s.topNavLeft}>
          <View>
            <Text style={s.navBadge}>
              <BlinkDot /> CONNECTED
            </Text>
            <Text style={s.navHost}>{hostname}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={s.disconnectBtn}
          onPress={() => {
            if (keyboardSheetOpen) setKeyboardSheetOpen(false);
            else if (shortcutSheetOpen) setShortcutSheetOpen(false);
            else if (filesSheetOpen) setFilesSheetOpen(false);
            else disconnect();
          }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={
              keyboardSheetOpen || shortcutSheetOpen || filesSheetOpen
                ? "arrow-back"
                : "power"
            }
            size={17}
            color={
              keyboardSheetOpen || shortcutSheetOpen || filesSheetOpen
                ? C.sub
                : C.danger
            }
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollConnected}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
            colors={[C.primary]}
            progressBackgroundColor={C.elevated}
          />
        }
      >
        {/* Media row */}
        <TouchableOpacity
          style={s.menuRow}
          onPress={() => {
            getStats();
            setMediaSheetOpen(true);
          }}
          activeOpacity={0.6}
        >
          <View style={[s.menuRowIcon, { backgroundColor: C.primaryDim }]}>
            <Ionicons name="musical-notes" size={18} color={C.primary} />
          </View>
          <View style={s.menuRowBody}>
            <Text style={s.menuRowTitle}>Media Controls</Text>
            <Text style={s.menuRowSub} numberOfLines={1}>
              {stats?.active_media || "Nothing Playing"}
            </Text>
          </View>
          <Ionicons
            name="arrow-forward-outline"
            size={20}
            color={C.muted}
            style={{ paddingRight: SP.sm }}
          />
        </TouchableOpacity>
        <View style={s.sep} />

        {/* Volume row */}
        <TouchableOpacity
          style={s.menuRow}
          onPress={() => setVolumeSheetOpen(true)}
          activeOpacity={0.6}
        >
          <View style={[s.menuRowIcon, { backgroundColor: C.elevated }]}>
            <Ionicons
              name={
                isMuted || currentVolume === 0 ? "volume-mute" : "volume-high"
              }
              size={18}
              color={isMuted ? C.danger : C.sub}
            />
          </View>
          <View style={s.menuRowBody}>
            <Text style={s.menuRowTitle}>System Volume</Text>
            <Text style={s.menuRowSub}>
              {isMuted
                ? "Muted"
                : currentVolume !== undefined
                  ? `${currentVolume}%`
                  : "Loading..."}
            </Text>
          </View>
          <Ionicons
            name="arrow-forward-outline"
            size={20}
            color={C.muted}
            style={{ paddingRight: SP.sm }}
          />
        </TouchableOpacity>
        <View style={s.sep} />

        {/* Live Desktop */}
        <View style={{ paddingTop: SP.lg }}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.groupLabel}>DESKTOP CAPTURE</Text>
            <TouchableOpacity
              onPress={() => {
                captureScreen();
                getStats();
              }}
              disabled={isCapturing}
              style={s.refreshChip}
              activeOpacity={0.7}
            >
              <SpinningIcon
                name="sync-outline"
                size={13}
                color={C.sub}
                spinning={isCapturing}
              />
              <Text style={s.refreshChipText}> Refresh</Text>
            </TouchableOpacity>
          </View>

          <View style={s.screenFrame}>
            {imgLoading && screenshot && (
              <View style={s.screenLoader}>
                <ActivityIndicator size="large" color={C.primary} />
              </View>
            )}
            {screenshot ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={openImageDetail}
                disabled={hiResLoading}
              >
                <Image
                  key={screenshotKey}
                  source={{ uri: screenshot }}
                  style={s.screenImg}
                  resizeMode="contain"
                />
                <View style={s.screenZoomHint}>
                  {hiResLoading ? (
                    <>
                      <ActivityIndicator size={12} color={C.primary} />
                      <Text
                        style={{
                          fontSize: F.xs,
                          color: C.primary,
                          marginLeft: 4,
                          fontWeight: "600",
                        }}
                      >
                        Loading HD…
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="expand-outline" size={14} color={C.sub} />
                      <Text
                        style={{
                          fontSize: F.xs,
                          color: C.sub,
                          marginLeft: 4,
                          fontWeight: "600",
                        }}
                      >
                        Tap to zoom
                      </Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            ) : (
              <View style={[s.screenPlaceholder, { height: "100%" }]}>
                <Ionicons name="image-outline" size={26} color={C.muted} />
                <Text style={s.placeholderText}>Tap refresh to capture</Text>
              </View>
            )}
          </View>

          {/* ── Active Window Pill with Panic ── */}
          {stats?.active_window && (
            <View style={s.activeWinPill}>
              <View style={{ flex: 1 }}>
                <Text style={s.hwLabel}>Active Window</Text>
                <Text style={s.activeWinValue} numberOfLines={1}>
                  {displayActiveWindow}
                </Text>
              </View>
              <TouchableOpacity
                style={s.panicBtn}
                onPress={handlePanic}
                activeOpacity={0.7}
              >
                <Ionicons name="eye-off" size={14} color={C.danger} />
                <Text style={s.panicBtnText}>Hide/Show</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <View style={[s.sep, { marginLeft: 0, marginTop: SP.lg }]} />

        {/* System Stats */}
        <View style={{ paddingTop: SP.lg }}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.groupLabel}>SYSTEM</Text>
            <TouchableOpacity
              onPress={() => {
                getStats();
                fetchApps();
              }}
              disabled={loadingAction === "stats"}
              style={s.refreshChip}
              activeOpacity={0.7}
            >
              <SpinningIcon
                name="sync-outline"
                size={13}
                color={C.sub}
                spinning={loadingAction === "stats"}
              />
              <Text style={s.refreshChipText}> Refresh</Text>
            </TouchableOpacity>
          </View>

          {stats ? (
            <>
              {/* ── Usage Cards ── */}
              <View style={s.usageCardGrid}>
                {/* CPU */}
                <View style={s.usageCard}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      marginBottom: SP.sm,
                    }}
                  >
                    <Ionicons
                      name="hardware-chip-outline"
                      size={12}
                      color={C.muted}
                    />
                    <Text style={s.hwLabel}>CPU</Text>
                  </View>
                  <Text style={[s.usagePct, { color: cpuColor }]}>
                    {stats.cpu_percent.toFixed(0)}%
                  </Text>
                  <Text style={s.usageCardSub} numberOfLines={1}>
                    {stats.cpu_name || "Processor"}
                  </Text>
                  <View style={s.hwTrack}>
                    <View
                      style={[
                        s.hwFill,
                        {
                          width: `${Math.min(100, stats.cpu_percent)}%`,
                          backgroundColor: cpuColor,
                        },
                      ]}
                    />
                  </View>
                </View>

                {/* RAM */}
                <View style={s.usageCard}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      marginBottom: SP.sm,
                    }}
                  >
                    <Ionicons name="server-outline" size={12} color={C.muted} />
                    <Text style={s.hwLabel}>RAM</Text>
                  </View>
                  <Text style={[s.usagePct, { color: ramColor }]}>
                    {stats.ram_percent.toFixed(0)}%
                  </Text>
                  <Text style={s.usageCardSub} numberOfLines={1}>
                    {stats.ram_used_gb
                      ? `${stats.ram_used_gb} / ${stats.ram_total_gb} GB`
                      : `${stats.ram_percent.toFixed(0)}% used`}
                  </Text>
                  <View style={s.hwTrack}>
                    <View
                      style={[
                        s.hwFill,
                        {
                          width: `${Math.min(100, stats.ram_percent)}%`,
                          backgroundColor: ramColor,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>

              {/* ── Running Apps ── */}
              <View
                style={{
                  backgroundColor: C.elevated,
                  borderRadius: R.sm,
                  borderWidth: 1,
                  borderColor: C.border,
                  paddingHorizontal: SP.md,
                  paddingTop: SP.md - 2,
                  paddingBottom: SP.sm - 2,
                }}
              >
                <View style={s.tableHead}>
                  <Text style={[s.thCell, { flex: 3 }]}>App</Text>
                  <Text style={[s.thCell, { flex: 1.5, textAlign: "right" }]}>
                    Mem
                  </Text>
                  <View style={{ width: 26 + SP.sm }} />
                </View>

                {(showAllProcesses ? visibleApps : visibleApps.slice(0, 5)).map(
                  (app) => {
                    const normalizedAppName = app.name
                      ? app.name.toLowerCase().replace(".exe", "")
                      : "";
                    const appNameKey = Object.keys(APP_NAME_LABEL_MAP).find(
                      (k) =>
                        k.toLowerCase().replace(".exe", "") ===
                        normalizedAppName,
                    );
                    const hasCustomAppName = !!appNameKey;
                    const displayAppName = appNameKey
                      ? APP_NAME_LABEL_MAP[appNameKey]
                      : app.name;

                    return (
                      <View key={app.pid} style={s.tableRow}>
                        <View
                          style={{
                            flex: 3,
                            paddingRight: SP.sm,
                            justifyContent: "center",
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {app.is_focused && (
                              <View
                                style={{
                                  width: 5,
                                  height: 5,
                                  borderRadius: 3,
                                  backgroundColor: C.success,
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            <Text
                              style={[
                                s.tdName,
                                {
                                  textTransform: hasCustomAppName
                                    ? "none"
                                    : "capitalize",
                                  flex: 1,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {displayAppName}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: F.xs - 1,
                              color: C.muted,
                              marginTop: 2,
                            }}
                            numberOfLines={1}
                          >
                            {app.title}
                          </Text>
                        </View>
                        <Text
                          style={[s.tdVal, { flex: 1.5, textAlign: "right" }]}
                        >
                          {app.memory_mb >= 1024
                            ? `${(app.memory_mb / 1024).toFixed(1)} GB`
                            : `${app.memory_mb} MB`}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleKillProcess(app)}
                          style={s.killBtn}
                          activeOpacity={0.6}
                        >
                          <Ionicons name="close" size={14} color={C.danger} />
                        </TouchableOpacity>
                      </View>
                    );
                  },
                )}
                {visibleApps.length === 0 && (
                  <View
                    style={[s.screenPlaceholder, { paddingVertical: SP.lg }]}
                  >
                    <Text style={s.placeholderText}>No visible apps</Text>
                  </View>
                )}
                {visibleApps.length > 5 && (
                  <View style={s.procHeader}>
                    <TouchableOpacity
                      onPress={() => setShowAllProcesses(!showAllProcesses)}
                      activeOpacity={0.7}
                    >
                      <Text style={s.procToggle}>
                        {showAllProcesses
                          ? "Show Less"
                          : `View All (${visibleApps.length})`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </>
          ) : (
            <View
              style={[
                s.screenPlaceholder,
                { borderWidth: 1, borderColor: C.border, borderRadius: R.sm },
              ]}
            >
              <Ionicons name="pie-chart-outline" size={26} color={C.muted} />
              <Text style={s.placeholderText}>Pull down to refresh</Text>
            </View>
          )}
        </View>
        <View style={[s.sep, { marginLeft: 0, marginTop: SP.lg }]} />

        {/* Keyboard Shortcuts row */}
        <TouchableOpacity
          style={s.menuRow}
          onPress={() => setShortcutSheetOpen(true)}
          activeOpacity={0.6}
        >
          <View style={[s.menuRowIcon, { backgroundColor: C.warningDim }]}>
            <Ionicons name="flash" size={18} color={C.warning} />
          </View>
          <View style={s.menuRowBody}>
            <Text style={s.menuRowTitle}>Keyboard Shortcuts</Text>
            <Text style={s.menuRowSub}>Common shortcuts</Text>
          </View>
          <Ionicons
            name="arrow-forward-outline"
            size={20}
            color={C.muted}
            style={{ paddingRight: SP.sm }}
          />
        </TouchableOpacity>

        <View style={s.sep} />

        {/* Launch Apps row */}
        <TouchableOpacity
          style={s.menuRow}
          onPress={() => setLauncherSheetOpen(true)}
          activeOpacity={0.6}
        >
          <View style={[s.menuRowIcon, { backgroundColor: C.primaryDim }]}>
            <Ionicons name="grid" size={18} color={C.primary} />
          </View>
          <View style={s.menuRowBody}>
            <Text style={s.menuRowTitle}>Launch Apps</Text>
            <Text style={s.menuRowSub}>
              Preload game/music before entering room
            </Text>
          </View>
          <Ionicons
            name="arrow-forward-outline"
            size={20}
            color={C.muted}
            style={{ paddingRight: SP.sm }}
          />
        </TouchableOpacity>

        <View style={s.sep} />

        {/* Remote Keyboard row */}
        <TouchableOpacity
          style={s.menuRow}
          onPress={() => setKeyboardSheetOpen(true)}
          activeOpacity={0.6}
        >
          <View style={[s.menuRowIcon, { backgroundColor: C.warningDim }]}>
            <Ionicons name="keypad" size={18} color={C.warning} />
          </View>
          <View style={s.menuRowBody}>
            <Text style={s.menuRowTitle}>Keyboard Inject</Text>
            <Text style={s.menuRowSub}>Realtime typing + queue mode</Text>
          </View>
          <Ionicons
            name="arrow-forward-outline"
            size={20}
            color={C.muted}
            style={{ paddingRight: SP.sm }}
          />
        </TouchableOpacity>

        <View style={s.sep} />

        {/* Connectivity row */}
        <TouchableOpacity
          style={s.menuRow}
          onPress={() => setConnectivitySheetOpen(true)}
          activeOpacity={0.6}
        >
          <View style={[s.menuRowIcon, { backgroundColor: C.successDim }]}>
            <Ionicons name="wifi" size={18} color={C.success} />
          </View>
          <View style={s.menuRowBody}>
            <Text style={s.menuRowTitle}>Connectivity</Text>
            <Text style={s.menuRowSub}>Wi-Fi & Bluetooth</Text>
          </View>
          <Ionicons
            name="arrow-forward-outline"
            size={20}
            color={C.muted}
            style={{ paddingRight: SP.sm }}
          />
        </TouchableOpacity>

        <View style={s.sep} />

        {/* Clipboard Access row */}
        <TouchableOpacity
          style={s.menuRow}
          onPress={() => setClipboardSheetOpen(true)}
          activeOpacity={0.6}
        >
          <View style={[s.menuRowIcon, { backgroundColor: C.primaryDim }]}>
            <Ionicons name="file-tray-full" size={18} color={C.primary} />
          </View>
          <View style={s.menuRowBody}>
            <Text style={s.menuRowTitle}>Clipboard Access</Text>
            <Text style={s.menuRowSub}>Cross-device clipboard</Text>
          </View>
          <Ionicons
            name="arrow-forward-outline"
            size={20}
            color={C.muted}
            style={{ paddingRight: SP.sm }}
          />
        </TouchableOpacity>

        <View style={s.sep} />

        {/* File Transfer row */}
        <TouchableOpacity
          style={s.menuRow}
          onPress={() => setFilesSheetOpen(true)}
          activeOpacity={0.6}
        >
          <View style={[s.menuRowIcon, { backgroundColor: C.warningDim }]}>
            <Ionicons name="folder-open" size={18} color={C.warning} />
          </View>
          <View style={s.menuRowBody}>
            <Text style={s.menuRowTitle}>File Transfer</Text>
            <Text style={s.menuRowSub}>Browse PC folders & send files</Text>
          </View>
          <Ionicons
            name="arrow-forward-outline"
            size={20}
            color={C.muted}
            style={{ paddingRight: SP.sm }}
          />
        </TouchableOpacity>

        <View style={s.sep} />
        {/* Power row */}
        <TouchableOpacity
          style={s.menuRow}
          onPress={() => setPowerSheetOpen(true)}
          activeOpacity={0.6}
        >
          <View style={[s.menuRowIcon, { backgroundColor: C.dangerDim }]}>
            <Ionicons name="power" size={18} color={C.danger} />
          </View>
          <View style={s.menuRowBody}>
            <Text style={[s.menuRowTitle, { color: C.danger }]}>
              Power Options
            </Text>
            <Text style={s.menuRowSub}>Shutdown or restart</Text>
          </View>
          <Ionicons
            name="arrow-forward-outline"
            size={20}
            color={C.muted}
            style={{ paddingRight: SP.sm }}
          />
        </TouchableOpacity>

        <View style={s.sep} />

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ═══ MEDIA SHEET ═══ */}
      <BottomSheet
        visible={mediaSheetOpen}
        onClose={() => setMediaSheetOpen(false)}
        title="Media Controls"
      >
        <View style={s.sheetContent}>
          {/* Hero track title with marquee */}
          <View style={s.mediaTitleWrap}>
            {stats?.active_media && stats.active_media !== "Not Playing" ? (
              <MarqueeText
                style={[
                  s.mediaHeroTitle,
                  marqueeScrolling && { paddingLeft: 20 },
                ]}
                onScrollChange={setMarqueeScrolling}
              >
                {stats.active_media}
              </MarqueeText>
            ) : (
              <Text
                style={[
                  s.mediaHeroTitle,
                  { color: C.muted, textAlign: "center" },
                ]}
              >
                {mediaFetching ? "Loading..." : "Not Playing"}
              </Text>
            )}
          </View>
          <View style={s.mediaCluster}>
            <TouchableOpacity
              style={s.mediaBtnSm}
              onPress={() => mediaControl("prev")}
              activeOpacity={0.7}
            >
              <Ionicons name="play-skip-back" size={20} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.mediaBtnLg, mediaCooldown && { opacity: 0.6 }]}
              onPress={() => mediaControl("playpause")}
              disabled={mediaCooldown}
              activeOpacity={0.8}
            >
              <Ionicons
                name={
                  (
                    optimisticPlaying !== null
                      ? optimisticPlaying
                      : stats?.active_media &&
                        stats.active_media !== "Not Playing"
                  )
                    ? "pause"
                    : "play"
                }
                size={37}
                color={C.text}
                style={
                  (
                    optimisticPlaying !== null
                      ? optimisticPlaying
                      : stats?.active_media &&
                        stats.active_media !== "Not Playing"
                  )
                    ? {
                        paddingLeft: 0,
                      }
                    : {
                        paddingLeft: 5,
                      }
                }
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.mediaBtnSm, mediaCooldown && { opacity: 0.4 }]}
              onPress={() => mediaControl("next")}
              disabled={mediaCooldown}
              activeOpacity={0.7}
            >
              <Ionicons name="play-skip-forward" size={20} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>

      {/* ═══ VOLUME SHEET ═══ */}
      <BottomSheet
        visible={volumeSheetOpen}
        onClose={() => setVolumeSheetOpen(false)}
        title="System Volume"
        // subtitle={
        //   isMuted
        //     ? "Muted"
        //     : currentVolume !== undefined
        //       ? `${currentVolume}%`
        //       : "Loading..."
        // }
      >
        <View style={s.sheetContent}>
          {/* Large volume display */}
          <View style={s.volDisplayCenter}>
            <Text style={[s.volBigNumber, isMuted && { color: C.danger }]}>
              {isMuted
                ? "MUTE"
                : currentVolume !== undefined
                  ? `${currentVolume}`
                  : "—"}
            </Text>
            {!isMuted && currentVolume !== undefined && (
              <Text style={s.volBigUnit}>%</Text>
            )}
          </View>

          {/* Volume bar */}
          <View style={s.volBarRow}>
            <Ionicons name="volume-low" size={18} color={C.muted} />
            <View style={s.volBarWrap}>
              <View
                style={[
                  s.volBarFill,
                  {
                    width: `${isMuted ? 0 : currentVolume || 0}%`,
                    backgroundColor: isMuted ? C.danger : C.primary,
                  },
                ]}
              />
            </View>
            <Ionicons name="volume-high" size={18} color={C.muted} />
          </View>

          {/* +/- buttons & mute */}
          <View style={s.volControlRow}>
            <TouchableOpacity
              style={s.volStepBtn}
              onPress={handleVolumeDown}
              activeOpacity={0.7}
            >
              <Ionicons name="remove" size={24} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                s.volMuteBtn,
                isMuted && {
                  backgroundColor: C.danger + "20",
                  borderColor: C.danger + "50",
                },
              ]}
              onPress={handleToggleMute}
              activeOpacity={0.7}
            >
              <Ionicons
                name={
                  isMuted || currentVolume === 0 ? "volume-mute" : "volume-high"
                }
                size={22}
                color={isMuted ? C.danger : C.sub}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.volStepBtn}
              onPress={handleVolumeUp}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={24} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>

      {/* ═══ POWER SHEET ═══ */}
      <BottomSheet
        visible={powerSheetOpen}
        onClose={() => setPowerSheetOpen(false)}
        title="Power Options"
        subtitle={`Connected to ${hostname}`}
      >
        <View style={s.sheetContent}>
          <TouchableOpacity
            style={s.powerRow}
            onPress={() => {
              setPowerSheetOpen(false);
              handlePower("restart");
            }}
            activeOpacity={0.7}
          >
            <View
              style={[s.powerRowIcon, { backgroundColor: C.warning + "18" }]}
            >
              <Ionicons name="refresh" size={22} color={C.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.powerRowTitle}>Restart</Text>
              <Text style={s.powerRowSub}>Reboot system in 5 seconds</Text>
            </View>
            <Ionicons
              name="arrow-forward-outline"
              size={20}
              color={C.muted}
              style={{ paddingRight: SP.sm }}
            />
          </TouchableOpacity>

          <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

          <TouchableOpacity
            style={s.powerRow}
            onPress={() => {
              setPowerSheetOpen(false);
              handlePower("shutdown");
            }}
            activeOpacity={0.7}
          >
            <View
              style={[s.powerRowIcon, { backgroundColor: C.danger + "18" }]}
            >
              <Ionicons name="power" size={22} color={C.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.powerRowTitle}>Shutdown</Text>
              <Text style={s.powerRowSub}>Turn off PC in 5 seconds</Text>
            </View>
            <Ionicons
              name="arrow-forward-outline"
              size={20}
              color={C.muted}
              style={{ paddingRight: SP.sm }}
            />
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ═══ KEYBOARD SHORTCUTS SLIDE-LEFT MODAL ═══ */}
      <SlideLeftModal
        visible={shortcutSheetOpen}
        onClose={() => setShortcutSheetOpen(false)}
        contentInsetTop={keyboardModalTopInset}
      >
        <View style={s.keyboardModalRoot}>
          {/* HEADER (Fixed) */}
          <View
            style={{
              paddingTop: SP.md,
              paddingBottom: SP.md,
              paddingHorizontal: SP.lg,
              backgroundColor: C.bg,
              zIndex: 10,
            }}
          >
            <Text
              style={{
                fontSize: F.xl,
                fontWeight: "700",
                color: C.text,
                letterSpacing: -0.5,
              }}
            >
              Keyboard Shortcuts
            </Text>
            <Text style={{ fontSize: F.sm, color: C.sub, marginTop: 4 }}>
              Quick actions for your PC
            </Text>
          </View>

          {/* MAIN CONTAINER */}
          <View
            style={{
              flex: 1,
              paddingHorizontal: SP.md,
              paddingBottom: SP.xl,
              maxHeight:
                SCREEN_HEIGHT -
                (Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0) -
                120,
            }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: C.elevated,
                borderRadius: R.lg,
                borderWidth: 1,
                borderColor: C.border,
                overflow: "hidden",
              }}
            >
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingVertical: SP.xs,
                  paddingBottom: 100,
                }}
                showsVerticalScrollIndicator={false}
              >
                {/* ── System & Windows ── */}
                <Text
                  style={{
                    fontSize: F.sm,
                    fontWeight: "700",
                    color: C.sub,
                    marginTop: SP.sm,
                    marginBottom: SP.xs,
                    marginLeft: SP.md,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  System & Windows
                </Text>

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("win")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons name="logo-windows" size={22} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Windows</Text>
                    <Text style={s.powerRowSub}>Show/Hide Start Menu</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("win-d")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="desktop-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Windows + D</Text>
                    <Text style={s.powerRowSub}>
                      Show Desktop or Minimize Apps
                    </Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("win-a")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="options-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Windows + A</Text>
                    <Text style={s.powerRowSub}>Open Control Center</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("win-n")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="notifications-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Windows + N</Text>
                    <Text style={s.powerRowSub}>Open Notification Panel</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("win-tab")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="albums-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Windows + Tab</Text>
                    <Text style={s.powerRowSub}>
                      Task View / Switch Workspaces
                    </Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("alt-tab")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="swap-horizontal"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Alt + Tab</Text>
                    <Text style={s.powerRowSub}>
                      Next App and Switch Between Apps
                    </Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("alt-shift-tab")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="repeat"
                      size={22}
                      color={C.primary}
                      style={{ transform: [{ scaleX: -1 }] }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Alt + Shift + Tab</Text>
                    <Text style={s.powerRowSub}>Switch to Previous App</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("win-up")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="caret-up-circle-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Windows + Up</Text>
                    <Text style={s.powerRowSub}>Maximize Window</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("win-down")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="caret-down-circle-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Windows + Down</Text>
                    <Text style={s.powerRowSub}>Minimize Window</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("alt-f4")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.dangerDim }]}
                  >
                    <Ionicons name="close-outline" size={22} color={C.danger} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Alt + F4</Text>
                    <Text style={s.powerRowSub}>Close Window / App</Text>
                  </View>
                </TouchableOpacity>

                {/* ── Captures & Screen ── */}
                <Text
                  style={{
                    fontSize: F.sm,
                    fontWeight: "700",
                    color: C.sub,
                    marginTop: SP.lg,
                    marginBottom: SP.xs,
                    marginLeft: SP.md,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Captures & Screen
                </Text>

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("win-shift-s")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons name="crop-outline" size={22} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Win + Shift + S</Text>
                    <Text style={s.powerRowSub}>Take a Screenshot</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("win-shift-r")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.warningDim }]}
                  >
                    <Ionicons
                      name="recording-outline"
                      size={22}
                      color={C.warning}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Win + Shift + R</Text>
                    <Text style={s.powerRowSub}>Record Screen</Text>
                  </View>
                </TouchableOpacity>

                {/* ── Text & Editing ── */}
                <Text
                  style={{
                    fontSize: F.sm,
                    fontWeight: "700",
                    color: C.sub,
                    marginTop: SP.lg,
                    marginBottom: SP.xs,
                    marginLeft: SP.md,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Text & Editing
                </Text>

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("left")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="arrow-back-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Left Arrow</Text>
                    <Text style={s.powerRowSub}>Move Cursor Left</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("right")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="arrow-forward-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Right Arrow</Text>
                    <Text style={s.powerRowSub}>Move Cursor Right</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("up")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="arrow-up-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Up Arrow</Text>
                    <Text style={s.powerRowSub}>Move Cursor Up</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("down")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="arrow-down-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Down Arrow</Text>
                    <Text style={s.powerRowSub}>Move Cursor Down</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("ctrl-a")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons name="scan-outline" size={22} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Ctrl + A</Text>
                    <Text style={s.powerRowSub}>Select All</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("ctrl-c")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons name="copy-outline" size={22} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Ctrl + C</Text>
                    <Text style={s.powerRowSub}>Copy Selection</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("ctrl-shift-left")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons name="arrow-back" size={22} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Ctrl + Shift + Left</Text>
                    <Text style={s.powerRowSub}>Select Text Left</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("tab")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="arrow-forward-circle-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Tab</Text>
                    <Text style={s.powerRowSub}>Next Focus / Indent</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("shift-tab")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="arrow-back-circle-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Shift + Tab</Text>
                    <Text style={s.powerRowSub}>Previous Focus / Unindent</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("enter")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="return-down-back-sharp"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Enter</Text>
                    <Text style={s.powerRowSub}>Submit / Next Line</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("shift-enter")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="return-up-back-sharp"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Shift + Enter</Text>
                    <Text style={s.powerRowSub}>Soft Line Break / Submit</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("backspace")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.warningDim }]}
                  >
                    <Ionicons
                      name="backspace-outline"
                      size={22}
                      color={C.warning}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Backspace</Text>
                    <Text style={s.powerRowSub}>Delete Last Character</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("ctrl-s")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.warningDim }]}
                  >
                    <Ionicons
                      name="cloud-done-outline"
                      size={22}
                      color={C.warning}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Ctrl + S</Text>
                    <Text style={s.powerRowSub}>Save Current Progress</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56 }]} />

                {/* ── Browser & Tabs ── */}
                <Text
                  style={{
                    fontSize: F.sm,
                    fontWeight: "700",
                    color: C.sub,
                    marginTop: SP.lg,
                    marginBottom: SP.xs,
                    marginLeft: SP.md,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Browser & Tabs
                </Text>

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("ctrl-t")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Ctrl + T</Text>
                    <Text style={s.powerRowSub}>Open New Tab</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("ctrl-l")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons name="link-outline" size={22} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Ctrl + L</Text>
                    <Text style={s.powerRowSub}>Select Address Bar</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("ctrl-shift-t")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="refresh-circle-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Ctrl + Shift + T</Text>
                    <Text style={s.powerRowSub}>Restore Closed Tab</Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("f12")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}
                  >
                    <Ionicons
                      name="code-slash-outline"
                      size={22}
                      color={C.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>F12</Text>
                    <Text style={s.powerRowSub}>
                      Inspect Element / DevTools
                    </Text>
                  </View>
                </TouchableOpacity>
                <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => sendShortcut("ctrl-w")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.powerRowIcon, { backgroundColor: C.warningDim }]}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={22}
                      color={C.warning}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>Ctrl + W</Text>
                    <Text style={s.powerRowSub}>Close Current Tab</Text>
                  </View>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </View>
      </SlideLeftModal>

      {/* ═══ LAUNCH APPS SHEET ═══ */}
      <BottomSheet
        visible={launcherSheetOpen}
        onClose={() => setLauncherSheetOpen(false)}
        title="Launch Apps"
        subtitle="Start heavy apps before entering your room"
      >
        <View style={s.sheetContent}>
          {launchableApps.length === 0 ? (
            <View style={[s.screenPlaceholder, { paddingVertical: SP.lg }]}>
              <ActivityIndicator color={C.primary} size="small" />
              <Text style={s.placeholderText}>Loading launch presets...</Text>
            </View>
          ) : (
            launchableApps.map((app, idx) => (
              <View key={app.key}>
                <TouchableOpacity
                  style={s.powerRow}
                  onPress={() => launchPresetApp(app.key)}
                  activeOpacity={0.7}
                  disabled={launchingKey === app.key}
                >
                  <View
                    style={[
                      s.powerRowIcon,
                      APP_ICONS[app.key]?.needCircle && { overflow: "hidden" },
                      !APP_ICONS[app.key] && { backgroundColor: C.primaryDim },
                    ]}
                  >
                    {launchingKey === app.key ? (
                      <ActivityIndicator color={C.primary} size="small" />
                    ) : APP_ICONS[app.key] ? (
                      <Image
                        source={APP_ICONS[app.key].src}
                        style={{
                          width: "100%",
                          height: "100%",
                          resizeMode: APP_ICONS[app.key].needCircle
                            ? "cover"
                            : "contain",
                        }}
                      />
                    ) : (
                      <Ionicons
                        name="rocket-outline"
                        size={20}
                        color={C.primary}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.powerRowTitle}>{app.label}</Text>
                    <Text style={s.powerRowSub} numberOfLines={1}>
                      {app.target}
                    </Text>
                  </View>
                </TouchableOpacity>
                {idx < launchableApps.length - 1 && (
                  <View
                    style={[s.sep, { marginLeft: 56, marginVertical: 0 }]}
                  />
                )}
              </View>
            ))
          )}
        </View>
      </BottomSheet>

      {/* ═══ REMOTE KEYBOARD SLIDE-LEFT MODAL ═══ */}
      <SlideLeftModal
        visible={keyboardSheetOpen}
        onClose={() => setKeyboardSheetOpen(false)}
        contentInsetTop={keyboardModalTopInset}
      >
        <View style={s.keyboardModalRoot}>
          <ScrollView
            style={s.keyboardModalScroll}
            contentContainerStyle={s.keyboardModalScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* SETTINGS ROW */}
            <View style={[s.queueSettingsRow, { marginTop: SP.xs }]}>
              <View
                style={[
                  s.queueSettingBox,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: SP.sm,
                    paddingHorizontal: SP.sm,
                    borderRadius: R.sm,
                    elevation: 1,
                  },
                ]}
              >
                <View
                  style={{
                    backgroundColor: C.primaryDim,
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: SP.sm,
                  }}
                >
                  <Ionicons name="timer" size={24} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.queueSettingLabel, { marginBottom: 0 }]}>
                    Delay (ms)
                  </Text>
                  <TextInput
                    style={[
                      s.queueSettingInput,
                      { fontSize: F.lg, fontWeight: "700" },
                    ]}
                    value={queueDelayMs}
                    onChangeText={setQueueDelayMs}
                    keyboardType="number-pad"
                    placeholder="10"
                    placeholderTextColor={C.muted}
                  />
                </View>
              </View>

              <View
                style={[
                  s.queueSettingBox,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: SP.sm,
                    paddingHorizontal: SP.sm,
                    borderRadius: R.sm,
                    elevation: 1,
                  },
                ]}
              >
                <View
                  style={{
                    backgroundColor: C.primaryDim,
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: SP.sm,
                  }}
                >
                  <Ionicons name="finger-print" size={22} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.queueSettingLabel, { marginBottom: 0 }]}>
                    Hold (ms)
                  </Text>
                  <TextInput
                    style={[
                      s.queueSettingInput,
                      { fontSize: F.lg, fontWeight: "700" },
                    ]}
                    value={queueHoldMs}
                    onChangeText={setQueueHoldMs}
                    keyboardType="number-pad"
                    placeholder="30"
                    placeholderTextColor={C.muted}
                  />
                </View>
              </View>
            </View>

            <View
              style={[
                s.keyboardPanel,
                { backgroundColor: "transparent", borderWidth: 0, padding: 0 },
              ]}
            >
              {/* MAIN TEXTAREA CARD */}
              <View
                style={[
                  s.keyboardTextareaWrap,
                  {
                    minHeight: 240,
                    overflow: "hidden",
                    elevation: 2,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: SP.md,
                    paddingTop: SP.sm,
                    paddingBottom: SP.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: C.border,
                    backgroundColor: C.elevated,
                  }}
                >
                  <Ionicons
                    name="terminal"
                    size={16}
                    color={C.primary}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      s.groupLabel,
                      { marginVertical: 0, color: C.primary, letterSpacing: 1 },
                    ]}
                  >
                    SCRIPT / PATTERN
                  </Text>
                </View>
                <TextInput
                  style={[
                    s.keyboardInput,
                    s.keyboardTextarea,
                    {
                      fontSize: F.lg,
                      flex: 1,
                      paddingTop: SP.md - 3,
                      paddingHorizontal: SP.md,
                      backgroundColor: C.elevated,
                    },
                  ]}
                  value={queueInput}
                  onChangeText={setQueueInput}
                  placeholder="Ketik teks, macro, atau pola (misal: waasd)..."
                  placeholderTextColor={C.muted}
                  autoCorrect={false}
                  autoCapitalize="none"
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </View>
          </ScrollView>

          {/* ACTION BUTTONS (Floating Bottom) */}
          <View
            style={{
              paddingHorizontal: SP.lg,
              paddingTop: SP.sm,
              paddingBottom: Platform.OS === "ios" ? 40 : 40,
              backgroundColor: C.bg,
              borderTopWidth: 1,
              borderTopColor: C.border,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                marginTop: SP.sm,
                backgroundColor: C.elevated,
                borderRadius: R.full,
                borderWidth: 1,
                borderColor: C.border,
                overflow: "hidden",
                height: 44,
              }}
            >
              <Pressable
                style={({ pressed }) => [
                  {
                    width: 52,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRightWidth: 1,
                    borderRightColor: C.border,
                  },
                  pressed && Platform.OS === "ios" && { opacity: 0.7 },
                ]}
                android_ripple={{
                  color: "rgba(247, 80, 79, 0.2)",
                  foreground: true,
                }}
                delayPressIn={0}
                onPress={() => setQueueInput("")}
              >
                <Ionicons name="trash" size={18} color={C.danger} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  {
                    width: 52,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRightWidth: 1,
                    borderRightColor: C.border,
                  },
                  pressed && Platform.OS === "ios" && { opacity: 0.7 },
                ]}
                android_ripple={{
                  color: "rgba(247, 80, 79, 0.2)",
                  foreground: true,
                }}
                delayPressIn={0}
                onPress={stopServerQueue}
              >
                <Ionicons name="stop" size={18} color={C.danger} />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  {
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  pressed && Platform.OS === "ios" && { opacity: 0.6 },
                ]}
                android_ripple={{
                  color: "rgba(79, 142, 247, 0.2)",
                  foreground: true,
                }}
                delayPressIn={0}
                onPress={sendQueueToServer}
              >
                <Ionicons
                  name="paper-plane"
                  size={16}
                  color={C.primary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={{
                    color: C.primary,
                    fontSize: 14,
                    fontWeight: "700",
                    letterSpacing: 0.5,
                  }}
                >
                  EXECUTE SCRIPT
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SlideLeftModal>

      {/* ═══ CONNECTIVITY MODAL ═══ */}
      <BottomSheet
        visible={connectivitySheetOpen}
        onClose={() => setConnectivitySheetOpen(false)}
        title="Connectivity"
        subtitle={`Turn on / off connectivity`}
      >
        <View style={s.sheetContent}>
          <TouchableOpacity
            style={s.powerRow}
            activeOpacity={0.7}
            onPress={() => toggleRadio("wifi")}
            disabled={wifiLoading}
          >
            <View style={[s.powerRowIcon, { backgroundColor: C.successDim }]}>
              <Ionicons name="wifi-outline" size={22} color={C.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.powerRowTitle}>Wi-Fi</Text>
              <Text style={s.powerRowSub}>
                {wifiActive ? "Connected / On" : "Disabled / Off"}
              </Text>
            </View>
            {wifiLoading ? (
              <ActivityIndicator color={C.primary} />
            ) : (
              <View
                style={[
                  s.customToggle,
                  wifiActive && {
                    backgroundColor: C.success + "25",
                    borderColor: C.success + "50",
                  },
                ]}
              >
                <View
                  style={[
                    s.customToggleThumb,
                    wifiActive
                      ? { backgroundColor: C.success, alignSelf: "flex-end" }
                      : { backgroundColor: C.muted },
                  ]}
                />
              </View>
            )}
          </TouchableOpacity>

          <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

          <TouchableOpacity
            style={s.powerRow}
            activeOpacity={0.7}
            onPress={() => toggleRadio("bluetooth")}
            disabled={btLoading}
          >
            <View style={[s.powerRowIcon, { backgroundColor: "#007AFF30" }]}>
              <Ionicons name="bluetooth" size={22} color="#007AFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.powerRowTitle}>Bluetooth</Text>
              <Text style={s.powerRowSub}>
                {btActive ? "Connected / On" : "Disabled / Off"}
              </Text>
            </View>
            {btLoading ? (
              <ActivityIndicator color={C.primary} />
            ) : (
              <View
                style={[
                  s.customToggle,
                  btActive && {
                    backgroundColor: "#007AFF25",
                    borderColor: "#007AFF50",
                  },
                ]}
              >
                <View
                  style={[
                    s.customToggleThumb,
                    btActive
                      ? { backgroundColor: "#007AFF", alignSelf: "flex-end" }
                      : { backgroundColor: C.muted },
                  ]}
                />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ═══ CLIPBOARD ACCESS MODAL ═══ */}
      <BottomSheet
        visible={clipboardSheetOpen}
        onClose={() => setClipboardSheetOpen(false)}
        title="Clipboard Access"
        subtitle={`Cross-device clipboard`}
      >
        <View style={s.sheetContent}>
          <TouchableOpacity
            style={s.powerRow}
            activeOpacity={0.7}
            onPress={handleSendClipboard}
          >
            <View style={[s.powerRowIcon, { backgroundColor: C.warningDim }]}>
              <Ionicons
                name="cloud-upload-outline"
                size={22}
                color={C.warning}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.powerRowTitle}>Send Clipboard</Text>
              <Text style={s.powerRowSub}>Copy phone clipboard to PC</Text>
            </View>
          </TouchableOpacity>

          <View style={[s.sep, { marginLeft: 56, marginVertical: 0 }]} />

          <TouchableOpacity
            style={s.powerRow}
            activeOpacity={0.7}
            onPress={handleReceiveClipboard}
          >
            <View style={[s.powerRowIcon, { backgroundColor: C.primaryDim }]}>
              <Ionicons
                name="cloud-download-outline"
                size={22}
                color={C.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.powerRowTitle}>Receive Clipboard</Text>
              <Text style={s.powerRowSub}>Copy PC clipboard to phone</Text>
            </View>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ═══ FILE TRANSFER MODAL ═══ */}
      <SlideLeftModal
        visible={filesSheetOpen}
        onClose={() => setFilesSheetOpen(false)}
        contentInsetTop={keyboardModalTopInset}
      >
        <View style={[s.keyboardModalRoot, { position: "relative" }]}>
          {/* BREADCRUMB HEADER */}
          <View
            style={{
              paddingTop: SP.md,
              backgroundColor: C.bg,
              zIndex: 10,
              flexDirection: "row",
              alignItems: "center",
              position: "relative",
            }}
          >
            {/* Path Scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                alignItems: "center",
                paddingHorizontal: SP.lg,
              }}
            >
              {/* Root / Disk Button */}
              {(() => {
                // Find most-specific matching root for current path
                const currentRoot = filesCurrentPath
                  ? filesRoots
                      .filter((r) =>
                        filesCurrentPath
                          .toLowerCase()
                          .startsWith(r.path.toLowerCase()),
                      )
                      .sort((a, b) => b.path.length - a.path.length)[0]
                  : null;

                const isDrive = currentRoot && isDrivePath(currentRoot.path);
                const driveLetter = isDrive
                  ? currentRoot.path.charAt(0).toUpperCase() + ":"
                  : null;
                // Strip the "(C:)" suffix from drive name e.g. "Local Disk (C:)" → "Local Disk"
                const driveName = isDrive
                  ? currentRoot.label.replace(/\s*\([A-Z]:\)\s*$/, "").trim()
                  : null;
                const folderColor =
                  currentRoot && !isDrive
                    ? FOLDER_COLOR_MAP[currentRoot.label] || "#4F8EF7"
                    : "#4F8EF7";
                const folderIcon =
                  currentRoot && !isDrive
                    ? FOLDER_ICON_MAP[currentRoot.label] || "folder-outline"
                    : null;

                return (
                  <TouchableOpacity
                    activeOpacity={0.6}
                    onPress={() => fetchFilesRoots()}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: folderColor + "18",
                      borderWidth: 1,
                      borderColor: folderColor + "30",
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: R.sm,
                    }}
                  >
                    {!filesCurrentPath ? (
                      // At root view
                      <>
                        <Ionicons
                          name="grid-outline"
                          size={15}
                          color={"#4F8EF7"}
                          style={{ marginRight: 5 }}
                        />
                        <Text
                          style={{
                            fontSize: F.sm,
                            fontWeight: "600",
                            color: "#4F8EF7",
                          }}
                        >
                          Storage
                        </Text>
                      </>
                    ) : isDrive ? (
                      // Inside a disk drive — show letter + name stacked
                      <>
                        <Ionicons
                          name="disc-outline"
                          size={15}
                          color={"#4F8EF7"}
                          style={{ marginRight: 6 }}
                        />
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                          }}
                        >
                          {driveName ? (
                            <Text
                              style={{
                                fontSize: F.sm,
                                fontWeight: "700",
                                color: "#AEAEB2",
                                lineHeight: 15,
                                textTransform: "Capitalize",
                              }}
                            >
                              {driveName} ({driveLetter})
                            </Text>
                          ) : null}
                        </View>
                      </>
                    ) : (
                      // Inside a user folder (Desktop, Downloads, etc.)
                      <>
                        <Ionicons
                          name={folderIcon}
                          size={15}
                          color={folderColor}
                          style={{ marginRight: 5 }}
                        />
                        <Text
                          style={{
                            fontSize: F.sm,
                            fontWeight: "600",
                            color: folderColor,
                          }}
                        >
                          {currentRoot.label}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })()}

              {/* Breadcrumb path — shows only the path RELATIVE to current root */}
              {filesCurrentPath &&
                (() => {
                  const currentRoot = filesRoots
                    .filter((r) =>
                      filesCurrentPath
                        .toLowerCase()
                        .startsWith(r.path.toLowerCase()),
                    )
                    .sort((a, b) => b.path.length - a.path.length)[0];
                  const rootPath = currentRoot ? currentRoot.path : "";
                  // Relative path after stripping the root (e.g. "\Users\zaen" for disk, "\subfolder" for Desktop)
                  const relativePath = filesCurrentPath.substring(
                    rootPath.length,
                  );
                  const segments = relativePath.split(/[\\/]+/).filter(Boolean);

                  return segments.map((part, index, arr) => {
                    const isLast = index === arr.length - 1;
                    // Build the full path up to this segment (for navigation on tap)
                    const sep = rootPath.includes("/") ? "/" : "\\";
                    const trailingRoot =
                      rootPath.endsWith("\\") || rootPath.endsWith("/")
                        ? rootPath
                        : rootPath + sep;
                    const segmentPath =
                      trailingRoot + arr.slice(0, index + 1).join(sep);

                    return (
                      <React.Fragment key={index}>
                        <Ionicons
                          name="chevron-forward"
                          size={13}
                          color={isLast ? "#5c5c5e" : "#FFFFFF0D"}
                          style={{ marginHorizontal: 6 }}
                        />
                        {isLast ? (
                          <Text
                            style={{
                              fontSize: F.sm,
                              color: "#F2F2F7",
                              fontWeight: "600",
                              paddingVertical: 4,
                            }}
                          >
                            {part}
                          </Text>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.6}
                            onPress={() => browseFilesPath(segmentPath)}
                          >
                            <Text
                              style={{
                                fontSize: F.sm,
                                color: "#AEAEB2",
                                fontWeight: "400",
                                paddingVertical: 4,
                              }}
                            >
                              {part}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </React.Fragment>
                    );
                  });
                })()}
            </ScrollView>
            <LinearGradient
              colors={[C.bg, "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 40,
              }}
              pointerEvents="none"
            />
            <LinearGradient
              colors={["transparent", C.bg]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                bottom: 0,
                width: 40,
              }}
              pointerEvents="none"
            />
          </View>

          {/* MAIN CONTAINER */}
          <View
            style={{
              flex: 1,
              padding: SP.md,
              paddingBottom: SP.xl,
              maxHeight:
                SCREEN_HEIGHT -
                (Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0) -
                100,
            }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: C.elevated,
                borderRadius: R.lg,
                borderWidth: 1,
                borderColor: C.border,
                overflow: "hidden",
                minHeight: 200,
              }}
            >
              {filesLoading ? (
                // LOADING STATE
                <View
                  style={{
                    flex: 1,
                    paddingVertical: SP.xxl * 2,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ActivityIndicator size="large" color={C.primary} />
                  <Text
                    style={{
                      marginTop: SP.md,
                      color: C.sub,
                      fontSize: F.sm,
                      fontWeight: "500",
                    }}
                  >
                    Loading folder...
                  </Text>
                </View>
              ) : (
                <FadeSlideIn
                  key={filesCurrentPath || "root"}
                  style={{ flex: 1 }}
                >
                  {!filesCurrentPath ? (
                    // SHOW ROOTS
                    <ScrollView
                      style={{ flex: 1 }}
                      contentContainerStyle={{ paddingBottom: 100 }}
                      showsVerticalScrollIndicator={false}
                    >
                      {filesRoots.length === 0 ? (
                        // EMPTY ROOTS STATE
                        <View
                          style={{
                            paddingVertical: SP.xxl * 1.5,
                            alignItems: "center",
                          }}
                        >
                          <View
                            style={{
                              width: 80,
                              height: 80,
                              borderRadius: 40,
                              backgroundColor: C.primaryDim,
                              justifyContent: "center",
                              alignItems: "center",
                              marginBottom: SP.lg,
                            }}
                          >
                            <Ionicons
                              name="folder-open"
                              size={40}
                              color={C.primary}
                            />
                          </View>
                          <Text
                            style={{
                              fontSize: F.lg,
                              fontWeight: "600",
                              color: C.text,
                            }}
                          >
                            No folders
                          </Text>
                          <Text
                            style={{
                              fontSize: F.sm,
                              color: C.sub,
                              marginTop: 4,
                              textAlign: "center",
                            }}
                          >
                            There are no roots available.
                          </Text>
                        </View>
                      ) : (
                        filesRoots.map((root, index) => {
                          const isRootDrive = isDrivePath(root.path);
                          const rootIconName = isRootDrive
                            ? "disc-outline"
                            : FOLDER_ICON_MAP[root.label] ||
                              "folder-open-outline";
                          const rootIconColor = isRootDrive
                            ? "#4F8EF7"
                            : FOLDER_COLOR_MAP[root.label] || "#4F8EF7";
                          const rootBgColor = rootIconColor + "18";
                          return (
                            <View key={root.path}>
                              <TouchableOpacity
                                style={[
                                  s.fileRow,
                                  {
                                    paddingVertical: SP.md,
                                    paddingHorizontal: SP.md,
                                  },
                                ]}
                                activeOpacity={0.6}
                                onPress={() => browseFilesPath(root.path)}
                              >
                                <View
                                  style={[
                                    s.fileRowIcon,
                                    {
                                      width: 44,
                                      height: 44,
                                      borderRadius: 12,
                                      backgroundColor: rootBgColor,
                                    },
                                  ]}
                                >
                                  <Ionicons
                                    name={rootIconName}
                                    size={24}
                                    color={rootIconColor}
                                  />
                                </View>
                                <View
                                  style={{
                                    flex: 1,
                                    marginLeft: SP.sm,
                                    justifyContent: "center",
                                  }}
                                >
                                  <Text
                                    style={[
                                      s.fileRowTitle,
                                      {
                                        fontSize: F.md,
                                        fontWeight: "600",
                                        marginBottom: 2,
                                      },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {root.label}
                                  </Text>
                                  <Text
                                    style={[
                                      s.fileRowSub,
                                      { fontSize: 13, marginTop: 0 },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {root.path}
                                  </Text>
                                </View>
                                <Ionicons
                                  name="chevron-forward"
                                  size={20}
                                  color={C.muted}
                                />
                              </TouchableOpacity>
                              {index < filesRoots.length - 1 && (
                                <View
                                  style={{
                                    height: 1,
                                    backgroundColor: C.border,
                                    marginLeft: 74,
                                  }}
                                />
                              )}
                            </View>
                          );
                        })
                      )}
                    </ScrollView>
                  ) : (
                    // SHOW ENTRIES
                    <ScrollView
                      style={{ flex: 1 }}
                      contentContainerStyle={{ paddingBottom: 100 }}
                      showsVerticalScrollIndicator={false}
                    >
                      {filesEntries.length === 0 ? (
                        // EMPTY ENTRIES STATE
                        <View
                          style={{
                            paddingVertical: SP.xxl * 1.5,
                            alignItems: "center",
                          }}
                        >
                          <View
                            style={{
                              width: 80,
                              height: 80,
                              borderRadius: 40,
                              backgroundColor: C.primaryDim,
                              justifyContent: "center",
                              alignItems: "center",
                              marginBottom: SP.lg,
                            }}
                          >
                            <Ionicons
                              name="folder-open"
                              size={40}
                              color={C.primary}
                            />
                          </View>
                          <Text
                            style={{
                              fontSize: F.lg,
                              fontWeight: "600",
                              color: C.text,
                            }}
                          >
                            Folder is empty
                          </Text>
                          <Text
                            style={{
                              fontSize: F.sm,
                              color: C.sub,
                              marginTop: 4,
                              textAlign: "center",
                              paddingHorizontal: SP.xl,
                            }}
                          >
                            There are no files or folders to display in this
                            location.
                          </Text>
                        </View>
                      ) : (
                        filesEntries.map((entry, index) => (
                          <View key={entry.path}>
                            <TouchableOpacity
                              style={[
                                s.fileRow,
                                {
                                  paddingVertical: SP.md,
                                  paddingHorizontal: SP.md,
                                },
                              ]}
                              activeOpacity={0.6}
                              onPress={() => {
                                if (entry.is_dir) browseFilesPath(entry.path);
                                else downloadFile(entry);
                              }}
                            >
                              <View
                                style={[
                                  s.fileRowIcon,
                                  {
                                    width: 44,
                                    height: 44,
                                    borderRadius: 12,
                                    backgroundColor: entry.is_dir
                                      ? C.primaryDim
                                      : C.border,
                                  },
                                ]}
                              >
                                <Ionicons
                                  name={
                                    entry.is_dir ? "folder" : "document-text"
                                  }
                                  size={22}
                                  color={entry.is_dir ? C.primary : C.sub}
                                />
                              </View>
                              <View
                                style={{
                                  flex: 1,
                                  marginLeft: SP.sm,
                                  justifyContent: "center",
                                }}
                              >
                                <Text
                                  style={[
                                    s.fileRowTitle,
                                    {
                                      fontSize: F.md,
                                      fontWeight: "500",
                                      marginBottom: 2,
                                    },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {entry.name}
                                </Text>
                                <Text
                                  style={[
                                    s.fileRowSub,
                                    { fontSize: 13, marginTop: 0 },
                                  ]}
                                >
                                  {entry.is_dir
                                    ? "Folder"
                                    : formatBytes(entry.size)}
                                </Text>
                              </View>
                              <Ionicons
                                name={
                                  entry.is_dir
                                    ? "chevron-forward"
                                    : "download-outline"
                                }
                                size={20}
                                color={entry.is_dir ? C.muted : C.sub}
                              />
                            </TouchableOpacity>
                            {index < filesEntries.length - 1 && (
                              <View
                                style={{
                                  height: 1,
                                  backgroundColor: C.border,
                                  marginLeft: 74,
                                }}
                              />
                            )}
                          </View>
                        ))
                      )}
                    </ScrollView>
                  )}
                </FadeSlideIn>
              )}
            </View>
          </View>

          {/* FLOATING UPLOAD BUTTON */}
          {filesCurrentPath && (
            <TouchableOpacity
              style={{
                position: "absolute",
                bottom: SP.xl + SP.md,
                right: SP.xl,
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: C.primary,
                justifyContent: "center",
                alignItems: "center",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 5,
                elevation: 6,
              }}
              disabled={filesUploading}
              onPress={uploadFileToCurrent}
              activeOpacity={0.8}
            >
              {filesUploading ? (
                <ActivityIndicator size="small" color={C.bg} />
              ) : (
                <Ionicons name="cloud-upload" size={28} color={C.bg} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </SlideLeftModal>

      {/* ═══ IMAGE DETAIL MODAL ═══ */}
      <Modal
        visible={imageModalOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        supportedOrientations={["portrait", "landscape"]}
        onRequestClose={() => {
          setImageModalOpen(false);
          stopLiveScreen();
        }}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={s.imgModalRoot}>
            {/* Zoomable image — takes full screen, centered */}
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  justifyContent: "center",
                  alignItems: "center",
                  paddingTop:
                    Platform.OS === "android" ? StatusBar.currentHeight : 0,
                },
              ]}
            >
              {hiResImage ? (
                <ZoomableImage
                  uri={hiResImage}
                  penMode={penModeActive}
                  pcAspect={
                    overlayPcSize.width > 0 && overlayPcSize.height > 0
                      ? overlayPcSize.width / overlayPcSize.height
                      : 16 / 9
                  }
                  strokes={penStrokes}
                  onPenStrokeFinalize={handlePenStrokeFinalize}
                />
              ) : (
                <View style={s.imgModalScrollContent}>
                  <ActivityIndicator size="large" color={C.primary} />
                </View>
              )}
            </View>

            {/* Floating top bar — overlays the image */}
            <View style={s.imgModalTopBar}>
              <TouchableOpacity
                onPress={() => {
                  setImageModalOpen(false);
                  stopLiveScreen();
                }}
                style={s.imgModalCloseBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color={C.sub} />
              </TouchableOpacity>
              <Text style={s.imgModalTitle}>Desktop Capture</Text>
              <TouchableOpacity
                onPress={captureHiRes}
                disabled={hiResLoading}
                style={s.imgModalRefreshBtn}
                activeOpacity={0.7}
              >
                <SpinningIcon
                  name="sync-outline"
                  size={16}
                  color={C.sub}
                  spinning={hiResLoading}
                />
              </TouchableOpacity>
            </View>

            {/* Bottom floating bar — live screen toggle + loading */}
            <View style={s.imgModalBottomBar}>
              {hiResLoading && (
                <View style={s.imgModalLoadingPill}>
                  <ActivityIndicator
                    size="small"
                    color={C.primary}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={{ color: C.sub, fontSize: F.xs, fontWeight: "600" }}
                  >
                    High resolution
                  </Text>
                </View>
              )}
              <View style={s.imgModalBottomBtnRow}>
                <TouchableOpacity
                  style={[
                    s.liveScreenBtn,
                    liveScreenActive && s.liveScreenBtnActive,
                  ]}
                  onPress={() => {
                    if (liveScreenActive) {
                      stopLiveScreen();
                    } else {
                      startLiveScreen();
                    }
                  }}
                  activeOpacity={0.7}
                >
                  {liveScreenActive && <BlinkDot color={C.danger} />}
                  <Ionicons
                    name={liveScreenActive ? "videocam" : "videocam-outline"}
                    size={16}
                    color={liveScreenActive ? C.danger : C.sub}
                  />
                  <Text
                    style={[
                      s.liveScreenBtnText,
                      liveScreenActive && { color: C.danger },
                    ]}
                  >
                    {liveScreenActive ? "LIVE" : "Go Live"}
                  </Text>
                </TouchableOpacity>

                {/* Pen Mode — only available while Go Live is active. */}
                <TouchableOpacity
                  style={[
                    s.liveScreenBtn,
                    !liveScreenActive && { opacity: 0.4 },
                    penModeActive && s.penModeBtnActive,
                  ]}
                  disabled={!liveScreenActive || penStarting}
                  onPress={() => {
                    if (penModeActive) {
                      disablePenMode();
                    } else {
                      enablePenMode();
                    }
                  }}
                  activeOpacity={0.7}
                >
                  {penStarting ? (
                    <ActivityIndicator size="small" color={C.warning} />
                  ) : (
                    <Ionicons
                      name={penModeActive ? "create" : "create-outline"}
                      size={16}
                      color={penModeActive ? C.warning : C.sub}
                    />
                  )}
                  <Text
                    style={[
                      s.liveScreenBtnText,
                      penModeActive && { color: C.warning },
                    ]}
                  >
                    {penModeActive ? "PEN ON" : "Pen Mode"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppMain />
    </GestureHandlerRootView>
  );
}

// ─── STYLESHEET ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },

  scrollLogin: {
    paddingHorizontal: SP.lg,
    paddingTop: SP.xxl + SP.lg,
    paddingBottom: SP.xl,
  },
  scrollConnected: { paddingHorizontal: SP.lg, paddingBottom: SP.xl },

  // ── Hero ──
  hero: { alignItems: "center", marginBottom: SP.xl + SP.md },
  logoWrap: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SP.lg,
  },
  logoCircle: {
    position: "absolute",
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: C.primaryDim,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.primary + "25",
  },
  heroTitle: {
    fontSize: F.hero,
    fontWeight: "900",
    color: C.text,
    letterSpacing: 10,
  },
  heroSub: {
    fontSize: F.xs,
    color: C.muted,
    marginTop: SP.xs,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  readyBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SP.md,
    backgroundColor: C.successDim,
    paddingHorizontal: SP.md,
    paddingVertical: SP.xs + 2,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: C.success + "25",
  },
  readyBadgeText: {
    fontSize: F.xs,
    color: C.success,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  // ── Menu Rows ──
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SP.md,
    gap: SP.md,
  },
  menuRowIcon: {
    width: 42,
    height: 42,
    borderRadius: R.full,
    justifyContent: "center",
    alignItems: "center",
  },
  menuRowBody: { flex: 1 },
  menuRowTitle: { fontSize: F.md, fontWeight: "600", color: C.text },
  menuRowSub: {
    fontSize: F.sm,
    color: C.muted,
    marginTop: 2,
    fontWeight: "400",
  },

  // ── Separator ──
  sep: { height: 1, backgroundColor: C.separator },

  // ── Group Label ──
  groupLabel: {
    fontSize: F.sm,
    fontWeight: "800",
    paddingLeft: SP.sm,
    color: C.muted,
    letterSpacing: 1,
  },

  // ── Section header ──
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SP.sm,
  },
  refreshChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.elevated,
    gap: 4,
    paddingHorizontal: SP.sm + 2,
    paddingVertical: SP.xs + 2,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: C.border,
  },
  refreshChipText: { fontSize: F.xs, color: C.sub, fontWeight: "600" },

  // ── Input ──
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: SP.sm,
    marginBottom: SP.md,
  },
  inputField: {
    flex: 1,
    color: C.text,
    fontSize: F.lg,
    paddingVertical: Platform.OS === "ios" ? 8 : 6,
    fontWeight: "600",
  },

  // ── Buttons ──
  btnPrimary: {
    backgroundColor: C.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: R.md,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  btnPrimaryText: {
    color: C.text,
    fontSize: F.md,
    fontWeight: "800",
    letterSpacing: 1,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: R.md,
    backgroundColor: C.elevated,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  btnSecondaryText: { color: C.sub, fontWeight: "700", fontSize: F.md },

  // ── Modals ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    padding: SP.lg,
  },
  modalBox: {
    backgroundColor: C.elevated,
    borderRadius: R.xl,
    padding: SP.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SP.md,
  },
  modalTitle: {
    fontSize: F.xl,
    fontWeight: "900",
    color: C.text,
    marginBottom: SP.xs,
  },
  modalSub: {
    fontSize: F.sm,
    color: C.muted,
    textAlign: "center",
    marginBottom: SP.lg,
    lineHeight: 20,
  },
  pinInput: {
    width: "100%",
    maxWidth: 220,
    height: 64,
    backgroundColor: C.elevated,
    borderRadius: R.md,
    borderWidth: 2,
    fontSize: 32,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 16,
    marginBottom: SP.lg,
    color: C.text,
  },
  modalBtnRow: { flexDirection: "row", gap: SP.md, width: "100%" },

  // ── QR ──
  qrOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 80,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  qrOverlayTop: { alignItems: "center" },
  qrOverlayTitle: { color: C.text, fontSize: 22, fontWeight: "900" },
  qrOverlayHint: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    marginTop: 6,
    fontWeight: "500",
  },
  qrFrame: { width: 250, height: 250, position: "relative" },
  qrCorner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: C.primary,
    borderWidth: 3,
  },
  qrTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 16,
  },
  qrTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 16,
  },
  qrBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 16,
  },
  qrBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 16,
  },
  qrCloseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  qrCloseBtnText: { color: C.text, fontSize: F.md, fontWeight: "700" },

  // ── Top Nav ──
  topNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: C.separator,
    backgroundColor: C.bg,
    zIndex: 80,
    elevation: 12,
  },
  topNavLeft: { flexDirection: "row", alignItems: "center" },
  navBadge: {
    fontSize: F.xs - 1,
    fontWeight: "800",
    color: C.success,
    letterSpacing: 1.5,
  },
  navHost: { fontSize: F.md, fontWeight: "700", color: C.text, marginTop: 1 },
  disconnectBtn: {
    width: 40,
    height: 40,
    borderRadius: R.full,
    backgroundColor: C.dangerDim,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.danger + "25",
  },

  // ── Screen ──
  screenFrame: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: C.bg,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  screenLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  screenImg: { width: "100%", height: "100%" },
  screenPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: SP.xxl,
  },
  placeholderText: {
    color: C.muted,
    fontSize: F.sm,
    marginTop: SP.sm,
    fontWeight: "500",
  },
  screenZoomHint: {
    position: "absolute",
    bottom: SP.sm,
    right: SP.sm,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: R.full,
  },

  // ── Image Detail Modal ──
  imgModalRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  imgModalTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 54 : StatusBar.currentHeight + 10,
    paddingHorizontal: SP.lg,
    paddingBottom: SP.sm,
    zIndex: 10,
  },
  imgModalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: R.full,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  imgModalTitle: {
    fontSize: F.lg,
    fontWeight: "800",
    borderRadius: R.full,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    backgroundColor: "rgba(255,255,255,0.1)",
    color: C.sub,
  },
  imgModalRefreshBtn: {
    width: 40,
    height: 40,
    borderRadius: R.full,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  imgModalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  imgModalImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * (9 / 16),
  },
  imgModalLoadingPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  // ── HW ──
  hwRow: { flexDirection: "row", marginBottom: SP.md },
  hwMeter: { flex: 1 },
  hwMeterTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SP.xs,
  },
  hwLabel: {
    fontSize: F.xs,
    fontWeight: "700",
    color: C.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  hwValue: { fontSize: F.lg, fontWeight: "800" },
  hwTrack: {
    height: 3,
    backgroundColor: C.border,
    borderRadius: R.full,
    overflow: "hidden",
  },
  hwFill: { height: "100%", borderRadius: R.full },
  hwDivider: {
    width: 1,
    backgroundColor: C.separator,
    marginHorizontal: SP.lg,
  },

  activeWinRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SP.sm,
  },
  activeWinValue: {
    flex: 1,
    textAlign: "left",
    fontSize: F.sm,
    color: C.primary,
    fontWeight: "600",
    marginRight: SP.md,
  },

  // ── Usage Cards ──
  usageCardGrid: {
    flexDirection: "row",
    gap: SP.sm,
    marginBottom: SP.sm,
  },
  usageCard: {
    flex: 1,
    backgroundColor: C.elevated,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    padding: SP.md,
  },
  usagePct: {
    fontSize: F.xl + 4,
    fontWeight: "800",
    lineHeight: F.xl + 6,
    marginBottom: 2,
  },
  usageCardSub: {
    fontSize: F.xs,
    color: C.muted,
    fontWeight: "500",
    marginBottom: SP.sm,
  },

  // ── Active Window Pill ──
  activeWinPill: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.elevated,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SP.md,
    paddingRight: SP.md - 2,
    paddingVertical: SP.sm + 2,
    marginTop: SP.sm,
  },

  // ── Processes ──
  procHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SP.xs,
  },
  procTitle: { fontSize: F.md, fontWeight: "700", color: C.text },
  procToggle: {
    fontSize: F.sm,
    color: C.primary,
    fontWeight: "700",
    marginBottom: SP.sm,
  },
  tableHead: {
    flexDirection: "row",
    paddingBottom: SP.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.separator,
  },
  thCell: {
    fontSize: F.xs,
    fontWeight: "700",
    color: C.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
  },
  tdName: { fontSize: F.md, fontWeight: "600", color: C.text },
  tdVal: {
    fontSize: F.sm,
    color: C.muted,
    fontWeight: "500",
    alignSelf: "center",
  },
  killBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.dangerDim,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: SP.sm,
    borderWidth: 1,
    borderColor: C.danger + "30",
  },

  // ── Bottom Sheet ──
  sheet: {
    position: "absolute",
    bottom: -SHEET_OVERFLOW,
    left: 0,
    right: 0,
    backgroundColor: C.elevated,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.border,
    paddingBottom: (Platform.OS === "ios" ? 34 : SP.xl) + SHEET_OVERFLOW,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 28,
  },
  sheetDragArea: {
    alignItems: "center",
    paddingTop: SP.md,
    paddingBottom: SP.sm,
    paddingHorizontal: SP.lg,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: C.muted + "55",
    borderRadius: R.full,
    marginBottom: SP.md,
  },
  sheetTitle: {
    fontSize: F.xl,
    fontWeight: "900",
    color: C.text,
    textAlign: "center",
  },
  sheetSubtitle: {
    fontSize: F.sm,
    color: C.muted,
    textAlign: "center",
    marginTop: 4,
    fontWeight: "500",
  },
  sheetContent: { paddingHorizontal: SP.md, paddingTop: SP.xs },

  // ── Media Sheet ──
  mediaTitleWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SP.lg,
    paddingHorizontal: SP.xl,
  },
  mediaHeroTitle: {
    fontSize: 56,
    fontWeight: "800",
    color: C.text,
    lineHeight: 60,
  },
  mediaCluster: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.xl,
    paddingVertical: SP.lg + SP.sm,
  },
  mediaBtnSm: {
    width: 58,
    height: 58,
    borderRadius: R.full,
    backgroundColor: C.elevated,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  mediaBtnLg: {
    width: 76,
    height: 76,
    borderRadius: R.full,
    backgroundColor: C.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },

  // ── Volume Sheet ──
  volDisplayCenter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingVertical: SP.lg,
    gap: 2,
  },
  volBigNumber: {
    fontSize: 56,
    fontWeight: "800",
    color: C.text,
    lineHeight: 60,
    paddingLeft: 4,
  },
  volBigUnit: {
    fontSize: 56,
    fontWeight: "700",
    color: C.muted,
    lineHeight: 60,
    paddingRight: 4,
  },
  volBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm + 2,
    paddingVertical: SP.sm,
    paddingHorizontal: SP.lg,
  },
  volBarWrap: {
    flex: 1,
    height: 8,
    backgroundColor: C.border,
    borderRadius: R.full,
    overflow: "hidden",
  },
  volBarFill: { height: "100%", borderRadius: R.full },
  volControlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.lg,
    paddingVertical: SP.lg,
  },
  volStepBtn: {
    width: 56,
    height: 56,
    borderRadius: R.full,
    backgroundColor: C.elevated,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  volMuteBtn: {
    width: 56,
    height: 56,
    borderRadius: R.full,
    backgroundColor: C.elevated,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },

  // ── Power Sheet ──
  powerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SP.md - 4,
    paddingHorizontal: SP.sm + 2,
    gap: SP.md,
  },
  powerRowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  powerRowTitle: {
    fontSize: F.md,
    fontWeight: "700",
    color: C.text,
    marginBottom: 2,
  },
  powerRowSub: { fontSize: F.xs, fontWeight: "500", color: C.muted },

  // ── Custom Toggle ──
  customToggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    padding: 2,
    justifyContent: "center",
  },
  customToggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },

  // ── Slide Left Modal ──
  slideLeftWrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  slideLeftOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.50)",
  },
  slideLeftContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.bg,
  },

  // ── Remote Keyboard Fullscreen Modal ──
  keyboardModalRoot: {
    flex: 1,
    backgroundColor: C.bg,
  },
  keyboardModalScroll: {
    flex: 1,
  },
  keyboardModalScrollContent: {
    paddingHorizontal: SP.md,
    paddingTop: 0,
    paddingBottom: SP.xl,
  },
  keyboardHeroCard: {
    backgroundColor: C.elevated,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    padding: SP.md,
    marginBottom: SP.sm,
  },
  keyboardHeroTitle: {
    fontSize: F.lg,
    fontWeight: "800",
    color: C.text,
  },
  keyboardHeroSub: {
    marginTop: SP.xs,
    fontSize: F.sm,
    color: C.muted,
    lineHeight: 19,
  },
  keyboardTitleBlock: {
    marginBottom: SP.md,
  },
  keyboardPanel: {
    backgroundColor: C.elevated,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    padding: SP.md,
    marginTop: SP.sm,
  },
  hiddenRealtimeInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  keyboardNativeToggleBtn: {
    marginTop: SP.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.full,
    paddingVertical: SP.sm,
  },
  keyboardNativeToggleBtnActive: {
    backgroundColor: C.primaryDim,
    borderColor: C.primary + "55",
  },
  keyboardNativeToggleText: {
    fontSize: F.sm,
    color: C.sub,
    fontWeight: "700",
  },
  keyboardRealtimeGrid: {
    marginTop: SP.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: SP.sm,
  },
  keyboardRealtimeBtn: {
    width: "31.5%",
    minHeight: 48,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  keyboardRealtimeBtnText: {
    fontSize: F.sm,
    color: C.sub,
    fontWeight: "700",
  },

  // ── Realtime action keys ──
  rtActionRow: {
    marginTop: SP.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SP.xs + 2,
    paddingHorizontal: 2,
  },
  rtActionBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.elevated,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SP.xs,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  rtActionBtnWide: {
    flexGrow: 2.5,
    minWidth: "35%",
    backgroundColor: C.primaryDim,
    borderColor: C.primary + "30",
  },
  rtActionBtnText: {
    fontSize: F.sm,
    color: C.text,
    fontWeight: "800",
  },
  // ── D-Pad ──
  rtDpad: {
    marginTop: SP.lg,
    marginBottom: SP.md,
    alignSelf: "center",
    gap: SP.xs,
  },
  rtDpadRow: {
    flexDirection: "row",
    gap: SP.xs,
    justifyContent: "center",
  },
  rtDpadBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.elevated,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  rtDpadPlaceholder: {
    width: 64,
    height: 64,
  },
  keyboardTextareaWrap: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
  },
  keyboardTextarea: {
    minHeight: 130,
    paddingTop: SP.md,
    paddingBottom: SP.md,
    paddingHorizontal: SP.md,
    color: C.text,
  },
  keyboardBackBtn: {
    width: 40,
    height: 40,
    borderRadius: R.full,
    backgroundColor: C.elevated,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },

  // ── Remote Keyboard ──
  keyboardModeRow: {
    flexDirection: "row",
    gap: SP.sm,
    marginBottom: SP.md,
  },
  keyboardModeBtn: {
    flex: 1,
    paddingVertical: SP.md,
    borderRadius: R.md,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    gap: 1,
  },
  keyboardModeBtnActive: {
    borderColor: C.primary + "55",
    backgroundColor: C.primaryDim,
  },
  keyboardModeText: {
    color: C.sub,
    fontSize: F.sm,
    fontWeight: "600",
  },
  keyboardModeTextActive: {
    color: C.primary,
    fontWeight: "700",
  },
  keyboardModeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.primary,
    marginTop: 4,
  },
  keyboardInputWrap: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: SP.sm,
    marginBottom: SP.sm,
  },
  keyboardInput: {
    color: C.text,
    fontSize: F.md,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  keyboardQuickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SP.sm,
    marginTop: SP.sm,
  },
  keyboardQuickBtn: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.full,
    paddingHorizontal: SP.md,
    paddingVertical: SP.xs + 3,
  },
  keyboardQuickBtnActive: {
    borderColor: C.primary + "55",
    backgroundColor: C.primaryDim,
  },
  keyboardQuickText: {
    fontSize: F.xs,
    color: C.sub,
    fontWeight: "600",
  },
  queueSettingsRow: {
    flexDirection: "row",
    gap: SP.sm,
    paddingTop: SP.md,
  },
  queueSettingBox: {
    flex: 1,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
  },
  queueSettingLabel: {
    fontSize: F.xs,
    color: C.muted,
    marginBottom: 4,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  queueSettingInput: {
    color: C.text,
    fontSize: F.lg,
    fontWeight: "500",
    paddingVertical: 0,
  },
  queueExplainText: {
    marginTop: SP.xs,
    fontSize: F.xs,
    color: C.muted,
    lineHeight: 18,
    fontWeight: "500",
  },
  queueIndicatorHero: {
    marginTop: SP.sm,
    marginBottom: SP.sm,
    minHeight: 72,
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  queuePlaybackRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 64,
  },
  queuePlaybackFadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 60,
  },
  queuePlaybackText: {
    fontSize: 56,
    lineHeight: 60,
    color: C.text,
    marginRight: 1,
    paddingTop: 10, // Ensure text isn't cut off by lineHeight constraints
  },
  queuePlaybackTextCurrent: {
    color: C.primary,
  },
  keyboardQueueClearBtn: {
    marginTop: SP.sm,
    alignSelf: "stretch",
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    alignItems: "center",
  },
  keyboardQueueClearText: {
    fontSize: F.xs,
    color: C.text,
    fontWeight: "800",
  },
  queueDraftWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SP.sm,
    marginTop: SP.sm,
  },
  queueToken: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.full,
    paddingHorizontal: SP.sm + 2,
    paddingVertical: SP.xs + 1,
  },
  queueTokenHold: {
    borderColor: C.warning + "55",
    backgroundColor: C.warningDim,
  },
  queueTokenText: {
    fontSize: F.xs,
    color: C.sub,
    fontWeight: "600",
  },
  queueStatusBox: {
    marginTop: SP.md,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    padding: SP.sm,
  },
  queueStatusTitle: {
    fontSize: F.sm,
    fontWeight: "700",
    color: C.text,
  },
  queueStatusSub: {
    fontSize: F.xs,
    color: C.muted,
    marginTop: 2,
    marginBottom: SP.sm,
  },
  queueIndicatorWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SP.xs,
  },
  queueIndicatorToken: {
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    paddingHorizontal: SP.sm,
    paddingVertical: 4,
  },
  queueIndicatorSent: {
    borderColor: C.success + "55",
    backgroundColor: C.successDim,
  },
  queueIndicatorCurrent: {
    borderColor: C.primary,
    backgroundColor: C.primary,
  },
  queueIndicatorText: {
    fontSize: F.xs,
    color: C.sub,
    fontWeight: "600",
  },
  keyboardControlBtn: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    minWidth: "48%",
  },
  keyboardControlBtnHalf: {
    flex: 1,
  },
  keyboardControlRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SP.sm,
    marginTop: SP.sm,
    justifyContent: "space-between",
  },
  keyboardControlBtnPrimary: {
    backgroundColor: C.primary,
    borderWidth: 1,
    borderColor: C.primary + "77",
    borderRadius: R.md,
    paddingHorizontal: SP.md,
    paddingVertical: SP.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    width: "100%",
  },
  keyboardControlPrimaryText: {
    color: C.text,
    fontSize: F.xs,
    fontWeight: "800",
  },
  keyboardControlText: {
    color: C.text,
    fontSize: F.xs,
    fontWeight: "700",
  },

  // ── Panic Button ──
  panicBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.dangerDim,
    paddingHorizontal: SP.sm + 4,
    paddingVertical: SP.xs + 2,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: C.danger + "30",
  },
  panicBtnText: {
    fontSize: F.xs,
    fontWeight: "800",
    color: C.danger,
    letterSpacing: 0.5,
  },

  // ── Live Screen Button ──
  imgModalBottomBar: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 40 : 24,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
  },
  liveScreenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  liveScreenBtnActive: {
    backgroundColor: C.danger + "18",
    borderColor: C.danger + "40",
  },
  liveScreenBtnText: {
    fontSize: F.xs,
    fontWeight: "700",
    color: C.sub,
    letterSpacing: 0.5,
  },
  imgModalBottomBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
  },
  penModeBtnActive: {
    backgroundColor: C.warning + "18",
    borderColor: C.warning + "40",
  },

  // ── File Transfer Sheet ──
  fileNavRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SP.sm,
    paddingHorizontal: SP.sm,
    gap: SP.sm,
    marginBottom: SP.xs,
  },
  fileNavText: {
    fontSize: F.sm,
    color: C.sub,
    fontWeight: "600",
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SP.sm + 2,
    paddingHorizontal: SP.sm,
    gap: SP.md,
  },
  fileRowIcon: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  fileRowTitle: {
    fontSize: F.sm,
    color: C.text,
    fontWeight: "600",
  },
  fileRowSub: {
    fontSize: F.xs,
    color: C.muted,
    marginTop: 2,
  },
  fileEmptyText: {
    fontSize: F.sm,
    color: C.muted,
    textAlign: "center",
    paddingVertical: SP.xl,
  },
  fileUploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    marginTop: SP.md,
    paddingVertical: SP.md,
    borderRadius: R.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.primary + "40",
    backgroundColor: C.primaryDim,
  },
  fileUploadText: {
    fontSize: F.sm,
    color: C.primary,
    fontWeight: "700",
  },
});
