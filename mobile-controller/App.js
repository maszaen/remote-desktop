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
  Modal,
  KeyboardAvoidingView,
  Animated,
  Easing,
  PanResponder,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";

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
  muted: "#48484A",
};

const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
const R = { sm: 10, md: 16, lg: 20, xl: 28, full: 999 };
const F = { xs: 11, sm: 13, md: 15, lg: 17, xl: 22, hero: 44 };

// ─── SLIDE-UP BOTTOM SHEET ────────────────────────────────────────────────────
const BottomSheet = ({ visible, onClose, children, title, subtitle }) => {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 240,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          onClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 70,
            friction: 11,
          }).start();
        }
      },
    }),
  ).current;

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Overlay fades independently — not tied to sheet translateY */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: "rgba(0,0,0,0.50)", opacity: overlayOpacity },
        ]}
        pointerEvents={visible ? "auto" : "none"}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />
      </Animated.View>

      {/* Sheet slides up separately */}
      <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
        <View {...panResponder.panHandlers} style={s.sheetDragArea}>
          <View style={s.sheetHandle} />
          {title ? <Text style={s.sheetTitle}>{title}</Text> : null}
          {subtitle ? <Text style={s.sheetSubtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </Animated.View>
    </View>
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
export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [savedDevices, setSavedDevices] = useState([]);
  const [headerName, setHeaderName] = useState("Nexus");
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

  const [currentVolume, setCurrentVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [stats, setStats] = useState(null);
  const [showAllProcesses, setShowAllProcesses] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingAction, setLoadingAction] = useState("");

  const [mediaSheetOpen, setMediaSheetOpen] = useState(false);
  const [volumeSheetOpen, setVolumeSheetOpen] = useState(false);
  const [powerSheetOpen, setPowerSheetOpen] = useState(false);

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
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      const opts = {
        method,
        headers: { "Content-Type": "application/json", pin, "x-nexus-id": id },
        signal: ctrl.signal,
      };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(`${url}${endpoint}`, opts);
      clearTimeout(tid);
      return await res.json();
    } catch (e) {
      return { error: "Network request failed", message: e.toString() };
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
        "/volume",
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
            `Could not reach ${cleanIp}\n\n${data.message || data.error}`,
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
      setIsConnected(true);
      fetchVolume(url, savedPin);
      getStats(url, savedPin);
      captureScreen(url, savedPin);
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
    const res = await sendAction("/volume", "GET", null, url, inputPin);
    if (res && !res.error && res.volume !== undefined) {
      await saveDevice(pairingIp, pairingHostname, inputPin);
      setActivePin(inputPin);
      setServerUrl(url);
      setIsConnected(true);
      setPairingModalOpen(false);
      setInputPin("");
      fetchVolume(url, inputPin);
      getStats(url, inputPin);
      captureScreen(url, inputPin);
    } else
      Alert.alert("Pairing Failed", "Incorrect Code or Server unreachable.");
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
    setStats(null);
    setScreenshot(null);
    setActivePin(null);
  };

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
  const mediaControl = (a) => sendAction(`/media/${a}`);
  const captureScreen = async (url = null, pin = null) => {
    setIsCapturing(true);
    setImgLoading(true);
    const d = await sendAction("/screen", "GET", null, url, pin);
    if (d?.image) setScreenshot(d.image);
    setIsCapturing(false);
    setImgLoading(false);
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
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchVolume();
    await getStats();
    setRefreshing(false);
  }, [serverUrl, activePin]);

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
                  Open PC tray → "Show QR to Connect"
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.muted} />
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
                      <ActivityIndicator size="small" color={C.primary} />
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={C.muted}
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
                  <Ionicons name="chevron-forward" size={16} color={C.muted} />
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
                    style={{ marginRight: SP.sm }}
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
        <Modal visible={renameTarget !== null} transparent animationType="fade">
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
        <Modal visible={isScanningQR} animationType="slide" transparent={false}>
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
        <Modal visible={pairingModalOpen} transparent animationType="fade">
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
  const hostname = savedDevices.map((device) => device.hostname)[0];

  return (
    <View style={s.root}>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />

      {/* Top Nav */}
      <View style={s.topNav}>
        <View style={s.topNavLeft}>
          <BlinkDot />
          <View>
            <Text style={s.navBadge}>CONNECTED</Text>
            <Text style={s.navHost}>{hostname}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={s.disconnectBtn}
          onPress={disconnect}
          activeOpacity={0.7}
        >
          <Ionicons name="power" size={17} color={C.danger} />
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
          />
        }
      >
        {/* Media row */}
        <TouchableOpacity
          style={s.menuRow}
          onPress={() => setMediaSheetOpen(true)}
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
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
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
              {isMuted ? "Muted" : `${currentVolume}%`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
        </TouchableOpacity>
        <View style={s.sep} />

        {/* Live Desktop */}
        <View style={{ paddingTop: SP.lg }}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.groupLabel}>DESKTOP CAPTURE</Text>
            <TouchableOpacity
              onPress={() => captureScreen()}
              disabled={isCapturing}
              style={s.refreshChip}
              activeOpacity={0.7}
            >
              {isCapturing ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <>
                  <Ionicons name="sync-outline" size={13} color={C.sub} />
                  <Text style={s.refreshChipText}> Refresh</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={s.screenFrame}>
            {imgLoading && screenshot && (
              <View style={s.screenLoader}>
                <ActivityIndicator size="large" color={C.primary} />
              </View>
            )}
            {screenshot ? (
              <ScrollView
                minimumZoomScale={1}
                maximumZoomScale={4}
                contentContainerStyle={{ flexGrow: 1 }}
              >
                <Image
                  source={{ uri: screenshot }}
                  style={s.screenImg}
                  resizeMode="contain"
                />
              </ScrollView>
            ) : (
              <View style={s.screenPlaceholder}>
                <Ionicons name="image-outline" size={26} color={C.muted} />
                <Text style={s.placeholderText}>Tap refresh to capture</Text>
              </View>
            )}
          </View>
          {stats && (
            <>
              {stats.active_window && (
                <View style={s.activeWinRow}>
                  <Text style={s.hwLabel}>Active Window</Text>
                  <Text style={s.activeWinValue} numberOfLines={1}>
                    {stats.active_window}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
        <View style={[s.sep, { marginLeft: 0, marginTop: SP.lg }]} />

        {/* System Stats */}
        <View style={{ paddingTop: SP.lg }}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.groupLabel}>SYSTEM</Text>
            <TouchableOpacity
              onPress={() => getStats()}
              disabled={loadingAction === "stats"}
              style={s.refreshChip}
              activeOpacity={0.7}
            >
              {loadingAction === "stats" ? (
                <ActivityIndicator size="small" color={C.warning} />
              ) : (
                <>
                  <Ionicons name="sync-outline" size={13} color={C.sub} />
                  <Text style={s.refreshChipText}> Refresh</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {stats ? (
            <>
              <View style={s.hwRow}>
                <View style={s.hwMeter}>
                  <View style={s.hwMeterTop}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Ionicons
                        name="hardware-chip-outline"
                        size={12}
                        color={C.muted}
                      />
                      <Text style={s.hwLabel}>CPU</Text>
                    </View>
                    <Text style={[s.hwValue, { color: cpuColor }]}>
                      {stats.cpu_percent.toFixed(0)}%
                    </Text>
                  </View>
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
                <View style={s.hwDivider} />
                <View style={s.hwMeter}>
                  <View style={s.hwMeterTop}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <Ionicons
                        name="server-outline"
                        size={12}
                        color={C.muted}
                      />
                      <Text style={s.hwLabel}>RAM</Text>
                    </View>
                    <Text style={[s.hwValue, { color: ramColor }]}>
                      {stats.ram_percent.toFixed(0)}%
                    </Text>
                  </View>
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

              <View style={{ marginTop: SP.lg }}>
                <View style={s.procHeader}>
                  <Text style={s.procTitle}>Top Processes</Text>
                  <TouchableOpacity
                    onPress={() => setShowAllProcesses(!showAllProcesses)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.procToggle}>
                      {showAllProcesses ? "Show Less" : "View All"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={s.tableHead}>
                  <Text style={[s.thCell, { flex: 3 }]}>Process</Text>
                  <Text style={[s.thCell, { flex: 1.5, textAlign: "right" }]}>
                    Mem
                  </Text>
                  <Text style={[s.thCell, { flex: 1, textAlign: "right" }]}>
                    CPU
                  </Text>
                </View>
                {(showAllProcesses
                  ? stats.top_processes
                  : stats.top_processes.slice(0, 5)
                ).map((p, i) => (
                  <View key={i} style={s.tableRow}>
                    <Text style={[s.tdName, { flex: 3 }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={[s.tdVal, { flex: 1.5, textAlign: "right" }]}>
                      {p.memory_mb} MB
                    </Text>
                    <Text style={[s.tdVal, { flex: 1, textAlign: "right" }]}>
                      {p.cpu_percent?.toFixed(1)}%
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={s.screenPlaceholder}>
              <Ionicons name="pie-chart-outline" size={26} color={C.muted} />
              <Text style={s.placeholderText}>Pull down to refresh</Text>
            </View>
          )}
        </View>
        <View style={[s.sep, { marginLeft: 0, marginTop: SP.lg }]} />

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
            <Text style={s.menuRowSub}>Shutdown, restart, or abort</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ═══ MEDIA SHEET ═══ */}
      <BottomSheet
        visible={mediaSheetOpen}
        onClose={() => setMediaSheetOpen(false)}
        title="Media Controls"
        subtitle={stats?.active_media || "Nothing Playing"}
      >
        <View style={s.sheetContent}>
          <View style={s.mediaCluster}>
            <TouchableOpacity
              style={s.mediaBtnSm}
              onPress={() => mediaControl("prev")}
              activeOpacity={0.7}
            >
              <Ionicons name="play-skip-back" size={22} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.mediaBtnLg}
              onPress={() => mediaControl("playpause")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="play"
                size={22}
                color={C.text}
                style={{ position: "absolute", left: 20 }}
              />
              <Ionicons
                name="pause"
                size={22}
                color={C.text}
                style={{ position: "absolute", right: 20 }}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.mediaBtnSm}
              onPress={() => mediaControl("next")}
              activeOpacity={0.7}
            >
              <Ionicons name="play-skip-forward" size={22} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>

      {/* ═══ VOLUME SHEET ═══ */}
      <BottomSheet
        visible={volumeSheetOpen}
        onClose={() => setVolumeSheetOpen(false)}
        title="System Volume"
        subtitle={isMuted ? "Muted" : `${currentVolume}%`}
      >
        <View style={s.sheetContent}>
          <TouchableOpacity
            style={s.muteRow}
            onPress={handleToggleMute}
            activeOpacity={0.7}
          >
            <View
              style={[
                s.menuRowIcon,
                { backgroundColor: isMuted ? C.dangerDim : C.elevated },
              ]}
            >
              <Ionicons
                name={
                  isMuted || currentVolume === 0 ? "volume-mute" : "volume-high"
                }
                size={20}
                color={isMuted ? C.danger : C.sub}
              />
            </View>
            <Text style={[s.menuRowTitle, { flex: 1, marginLeft: SP.md }]}>
              {isMuted ? "Tap to Unmute" : "Tap to Mute"}
            </Text>
            <View
              style={[
                s.togglePill,
                isMuted && {
                  backgroundColor: C.danger + "40",
                  borderColor: C.danger + "40",
                },
              ]}
            >
              <View
                style={[
                  s.toggleThumb,
                  isMuted && {
                    transform: [{ translateX: 18 }],
                    backgroundColor: C.danger,
                  },
                ]}
              />
            </View>
          </TouchableOpacity>

          <View style={[s.sep, { marginLeft: 0, marginVertical: SP.sm }]} />

          <View style={s.volBarRow}>
            <Ionicons name="volume-low" size={16} color={C.muted} />
            <View style={s.volBarWrap}>
              <View
                style={[
                  s.volBarFill,
                  {
                    width: `${isMuted ? 0 : currentVolume}%`,
                    backgroundColor: isMuted ? C.danger : C.primary,
                  },
                ]}
              />
            </View>
            <Ionicons name="volume-high" size={16} color={C.muted} />
          </View>

          <View style={s.volStepRow}>
            <TouchableOpacity
              style={s.volStepBtn}
              onPress={handleVolumeDown}
              activeOpacity={0.7}
            >
              <Ionicons name="remove" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={s.volStepValue}>
              {isMuted ? "—" : `${currentVolume}%`}
            </Text>
            <TouchableOpacity
              style={s.volStepBtn}
              onPress={handleVolumeUp}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={22} color={C.text} />
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
          <View style={s.powerBtnRow}>
            <TouchableOpacity
              style={s.powerBtnWarn}
              onPress={() => {
                setPowerSheetOpen(false);
                handlePower("restart");
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={20} color={C.bg} />
              <Text style={s.powerBtnDarkText}>Restart</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.powerBtnDanger}
              onPress={() => {
                setPowerSheetOpen(false);
                handlePower("shutdown");
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="power" size={20} color={C.text} />
              <Text style={s.powerBtnLightText}>Shutdown</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={s.powerBtnOutline}
            onPress={() => {
              setPowerSheetOpen(false);
              cancelShutdown();
            }}
            activeOpacity={0.7}
          >
            <Text style={s.powerBtnOutlineText}>Abort Active Action</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
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
    color: C.muted,
    letterSpacing: 2,
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
    backgroundColor: C.surface,
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
    width: 36,
    height: 36,
    borderRadius: R.sm,
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
    backgroundColor: C.elevated,
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
    textAlign: "right",
    fontSize: F.sm,
    color: C.primary,
    fontWeight: "600",
    marginLeft: SP.md,
  },

  // ── Processes ──
  procHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SP.sm,
  },
  procTitle: { fontSize: F.md, fontWeight: "700", color: C.text },
  procToggle: { fontSize: F.sm, color: C.primary, fontWeight: "700" },
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
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.separator + "80",
  },
  tdName: { fontSize: F.md, fontWeight: "600", color: C.text },
  tdVal: { fontSize: F.sm, color: C.muted, fontWeight: "500" },

  // ── Bottom Sheet ──
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.border,
    paddingBottom: Platform.OS === "ios" ? 34 : SP.xl,
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
  sheetContent: { paddingHorizontal: SP.lg, paddingTop: SP.xs },

  // ── Media Sheet ──
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
  muteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SP.sm,
  },
  togglePill: {
    width: 44,
    height: 26,
    borderRadius: R.full,
    backgroundColor: C.elevated,
    padding: 3,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.sub,
  },
  volBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    paddingVertical: SP.sm,
  },
  volBarWrap: {
    flex: 1,
    height: 6,
    backgroundColor: C.elevated,
    borderRadius: R.full,
    overflow: "hidden",
  },
  volBarFill: { height: "100%", borderRadius: R.full },
  volStepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SP.md,
  },
  volStepBtn: {
    width: 54,
    height: 54,
    borderRadius: R.full,
    backgroundColor: C.elevated,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  volStepValue: { fontSize: F.xl, fontWeight: "800", color: C.text },

  // ── Power Sheet ──
  powerBtnRow: { flexDirection: "row", gap: SP.md, marginBottom: SP.md },
  powerBtnWarn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.warning,
    paddingVertical: 16,
    borderRadius: R.md,
    gap: SP.sm,
  },
  powerBtnDanger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.danger,
    paddingVertical: 16,
    borderRadius: R.md,
    gap: SP.sm,
  },
  powerBtnDarkText: { fontSize: F.md, fontWeight: "800", color: C.bg },
  powerBtnLightText: { fontSize: F.md, fontWeight: "800", color: C.text },
  powerBtnOutline: {
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 14,
    borderRadius: R.md,
    alignItems: "center",
    backgroundColor: C.elevated,
  },
  powerBtnOutlineText: { color: C.sub, fontSize: F.md, fontWeight: "700" },
});
