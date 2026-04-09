import React, { useState, useEffect, useCallback } from 'react';
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
  SafeAreaView,
  Platform,
  ActivityIndicator,
  Modal
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- THEME ---
// Using strict Apple-style Dark Mode guidelines (8-pt scale)
const COLORS = {
  background: '#000000', // Pure black background
  surface: '#121212',    // Slightly elevated surface
  card: '#1C1C1E',       // Raised card surface
  cardElevated: '#2C2C2E', // Buttons inside cards
  primary: '#0A84FF',    // iOS Blue
  danger: '#FF453A',     // iOS Red
  warning: '#FF9F0A',    // iOS Orange
  success: '#32D74B',    // iOS Green
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  border: '#2C2C2E',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

const RADIUS = {
  sm: 8,
  md: 16,
  lg: 24,
  round: 999,
};

export default function App() {
  const [ipAddress, setIpAddress] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [savedDevices, setSavedDevices] = useState([]);

  // States
  const [currentVolume, setCurrentVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [stats, setStats] = useState(null);
  const [showAllProcesses, setShowAllProcesses] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingAction, setLoadingAction] = useState('');
  const [powerMenuVisible, setPowerMenuVisible] = useState(false);

  // ─── Startup ───────────────────────────────────────────
  useEffect(() => {
    loadSavedDevices();
  }, []);

  const loadSavedDevices = async () => {
    try {
      const data = await AsyncStorage.getItem('saved_nexus_devices');
      if (data) setSavedDevices(JSON.parse(data));
    } catch (e) {}
  };

  const saveDevice = async (ip, hostname) => {
    try {
      const newDevice = { ip, hostname, lastSeen: Date.now() };
      let updated = [newDevice, ...savedDevices.filter(d => d.ip !== ip)];
      setSavedDevices(updated);
      await AsyncStorage.setItem('saved_nexus_devices', JSON.stringify(updated));
    } catch (e) {}
  };

  const removeSavedDevice = async (ip) => {
    Alert.alert("Remove Device?", `Are you sure you want to forget IP ${ip}?`, [
       { text: "Cancel", style: "cancel" },
       { text: "Remove", style: "destructive", onPress: async () => {
            let updated = savedDevices.filter(d => d.ip !== ip);
            setSavedDevices(updated);
            await AsyncStorage.setItem('saved_nexus_devices', JSON.stringify(updated));
       }}
    ]);
  };

  // ─── Network Actions ───────────────────────────────────────────
  const connect = async (overrideIp = null) => {
    const targetIp = overrideIp && typeof overrideIp === 'string' ? overrideIp : ipAddress;
    if (!targetIp.trim()) return Alert.alert('Whoops!', 'Enter your PC IP address first.');
    
    let cleanIp = targetIp.trim();
    cleanIp = cleanIp.replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/+$/, '');
    const url = `http://${cleanIp}:8000`;
    
    setLoadingAction(`connecting_${cleanIp}`);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${url}/`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const deviceHostname = data.hostname || 'Unknown PC';
        
        await saveDevice(cleanIp, deviceHostname);

        setServerUrl(url);
        setIsConnected(true);
        setIpAddress(''); // clear manual input
        fetchVolume(url);
        getStats(url);
      }
    } catch (e) {
      Alert.alert('Connection Failed', `Could not connect to ${cleanIp}.\nMake sure device and server are on the same network.`);
    } finally {
      setLoadingAction('');
    }
  };

  const disconnect = () => {
    setIsConnected(false);
    setServerUrl('');
    setStats(null);
    setScreenshot(null);
  };

  const sendAction = async (endpoint, method = 'POST', body = null, urlOverride = null) => {
    const targetUrl = urlOverride || serverUrl;
    if (!targetUrl) return null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const options = { method, headers: { 'Content-Type': 'application/json' }, signal: controller.signal };
      if (body) options.body = JSON.stringify(body);
      const res = await fetch(`${targetUrl}${endpoint}`, options);
      clearTimeout(timeoutId);
      return await res.json();
    } catch (e) { return { error: 'Network request failed' }; }
  };

  // ─── Feature Actions ─────────────────────────────────────────
  const fetchVolume = async (urlOverride = null) => {
    const data = await sendAction('/volume', 'GET', null, urlOverride);
    if (data && !data.error) {
      setCurrentVolume(data.volume);
      setIsMuted(data.muted);
    }
  };
  const handleToggleMute = async () => {
    const result = await sendAction('/volume/mute');
    if (result && !result.error) setIsMuted(result.muted);
  };
  const handleVolumeUp = async () => {
    const result = await sendAction('/volume/up');
    if (result && !result.error) { setCurrentVolume(result.volume); setIsMuted(false); }
  };
  const handleVolumeDown = async () => {
    const result = await sendAction('/volume/down');
    if (result && !result.error) { setCurrentVolume(result.volume); setIsMuted(false); }
  };
  const mediaControl = (action) => sendAction(`/media/${action}`);
  const captureScreen = async () => {
    if (!isConnected) return;
    setIsCapturing(true);
    setImgLoading(true);
    setScreenshot(`${serverUrl}/screen?t=${Date.now()}`);
    await new Promise(r => setTimeout(r, 600)); 
    setIsCapturing(false);
  };
  const getStats = async (urlOverride = null) => {
    setLoadingAction('stats');
    const start = Date.now();
    const data = await sendAction('/stats', 'GET', null, urlOverride);
    const elapsed = Date.now() - start;
    if (elapsed < 1000) await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
    if (data && !data.error) setStats(data);
    setLoadingAction('');
  };
  const handlePower = (action) => {
    Alert.alert(`Confirm Action`, `Are you sure you want to ${action.toUpperCase()} your PC?\nRuns in 5 sec.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Yes`, style: 'destructive', onPress: async () => { await sendAction(`/power/${action}`); setStats(null); } }
    ]);
  };
  const cancelShutdown = async () => {
    await sendAction('/power/cancel');
    Alert.alert('Aborted', 'Shutdown/Restart cancelled!');
  };
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchVolume();
    await getStats();
    setRefreshing(false);
  }, [serverUrl]);

  // ─── Unconnected View ─────────────────────────────────────────
  if (!isConnected) {
    return (
      <ScrollView contentContainerStyle={styles.baseContainerScroll} keyboardShouldPersistTaps="handled">
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={styles.loginContainer}>
          <View style={styles.loginHeader}>
            <Ionicons name="desktop" size={64} color={COLORS.primary} style={styles.loginIcon} />
            <Text style={styles.loginTitle}>NEXUS</Text>
            <Text style={styles.loginSubtitle}>Select a device to control</Text>
          </View>
          
          {/* Saved Devices Section */}
          {savedDevices.length > 0 && (
             <View style={styles.savedDevicesSection}>
                 <Text style={styles.savedTitle}>MY DEVICES</Text>
                 {savedDevices.map((dev, i) => (
                    <TouchableOpacity 
                       key={i} 
                       style={styles.savedDeviceCard} 
                       onPress={() => connect(dev.ip)}
                       onLongPress={() => removeSavedDevice(dev.ip)}
                       disabled={loadingAction.includes('connecting')}
                    >
                       <View style={styles.savedDeviceIcon}>
                          <Ionicons name="desktop-outline" size={24} color={COLORS.primary} />
                       </View>
                       <View style={styles.savedDeviceInfo}>
                          <Text style={styles.savedDeviceName}>{dev.hostname}</Text>
                          <Text style={styles.savedDeviceIp}>{dev.ip}</Text>
                       </View>
                       {loadingAction === `connecting_${dev.ip}` ? (
                           <ActivityIndicator size="small" color={COLORS.primary} />
                       ) : (
                           <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                       )}
                    </TouchableOpacity>
                 ))}
             </View>
          )}

          <View style={styles.loginCard}>
            <Text style={styles.inputLabel}>MANUAL CONNECT (IP)</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="link" size={20} color={COLORS.textSecondary} />
              <TextInput
                style={styles.inputField}
                placeholder="192.168.1.5"
                placeholderTextColor={COLORS.textSecondary}
                value={ipAddress}
                onChangeText={setIpAddress}
                keyboardType="default"
                autoCapitalize="none"
              />
            </View>
            <TouchableOpacity style={styles.btnConnect} onPress={connect} disabled={loadingAction.includes('connecting')}>
              {loadingAction && loadingAction.includes('connecting') ? (
                <ActivityIndicator size="small" color={COLORS.text} />
              ) : (
                <Text style={styles.btnConnectText}>CONNECT NOW</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ─── Connected View ──────────────────────────────────────────
  return (
    <View style={styles.baseContainer}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* GLOBAL HEADER */}
      <View style={styles.topNavigation}>
        <View style={styles.navLeft}>
            <View style={styles.statusIndicator} />
            <View>
              <Text style={styles.navStatusText}>ONLINE</Text>
              <Text style={styles.navIpText}>{serverUrl.replace('http://', '')}</Text>
            </View>
        </View>
        <TouchableOpacity style={styles.navBtnDisconnect} onPress={disconnect}>
          <Ionicons name="power" size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        
        {/* CARD: MEDIA PLAYER */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Media Controls</Text>
          <View style={styles.mediaCluster}>
            <TouchableOpacity style={styles.mediaBtnSecondary} onPress={() => mediaControl('prev')}>
              <Ionicons name="play-skip-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaBtnPrimary} onPress={() => mediaControl('playpause')}>
               <Ionicons name="play" size={24} color={COLORS.text} style={{ position: 'absolute', transform: [{ translateX: -7 }] }} />
               <Ionicons name="pause" size={24} color={COLORS.text} style={{ position: 'absolute', transform: [{ translateX: 6 }] }} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaBtnSecondary} onPress={() => mediaControl('next')}>
              <Ionicons name="play-skip-forward" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* CARD: VOLUME */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>System Volume</Text>
          <View style={styles.volumeCluster}>
            <TouchableOpacity onPress={handleToggleMute} style={styles.muteBtn}>
              <Ionicons name={isMuted || currentVolume === 0 ? "volume-mute" : "volume-high"} size={28} color={isMuted ? COLORS.danger : COLORS.primary} />
            </TouchableOpacity>
            <View style={styles.volumeStepper}>
              <TouchableOpacity onPress={handleVolumeDown} style={styles.stepBtn}>
                <Ionicons name="remove" size={24} color={COLORS.text} />
              </TouchableOpacity>
              <View style={styles.volValueWrapper}>
                <Text style={styles.volValueText}>{currentVolume}%</Text>
              </View>
              <TouchableOpacity onPress={handleVolumeUp} style={styles.stepBtn}>
                <Ionicons name="add" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* CARD: SCREEN CAPTURE */}
        <View style={styles.card}>
          <View style={styles.cardHeaderFlex}>
             <Text style={styles.cardTitleNoMargin}>Live Desktop</Text>
             <TouchableOpacity style={styles.cardHeaderBtn} onPress={captureScreen} disabled={isCapturing}>
                {isCapturing ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="sync" size={20} color={COLORS.textSecondary} />}
             </TouchableOpacity>
          </View>
          <View style={styles.screenFrame}>
             {imgLoading && screenshot && (
                 <View style={styles.screenLoaderOverlay}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                 </View>
             )}
             {screenshot ? (
                 <ScrollView minimumZoomScale={1} maximumZoomScale={4} contentContainerStyle={styles.screenScroll}>
                    <Image source={{ uri: screenshot }} style={styles.screenImage} resizeMode="contain" onLoad={() => setImgLoading(false)} onError={() => setImgLoading(false)} />
                 </ScrollView>
             ) : (
                 <View style={styles.screenPlaceholder}>
                    <Ionicons name="image-outline" size={32} color={COLORS.textSecondary} />
                    <Text style={styles.screenPlaceholderText}>No desktop capture yet.</Text>
                 </View>
             )}
          </View>
        </View>

        {/* CARD: PERFORMANCE */}
        <View style={styles.card}>
           <View style={styles.cardHeaderFlex}>
              <Text style={styles.cardTitleNoMargin}>System Performance</Text>
              <TouchableOpacity style={styles.cardHeaderBtn} onPress={() => getStats()} disabled={loadingAction === 'stats'}>
                 {loadingAction === 'stats' ? <ActivityIndicator size="small" color={COLORS.warning} /> : <Ionicons name="sync" size={20} color={COLORS.textSecondary} />}
              </TouchableOpacity>
           </View>

           {stats ? (
              <View style={styles.statsContainer}>
                 <View style={styles.hwWidgets}>
                   <View style={styles.hwWidget}>
                     <View style={styles.hwWidgetHeader}>
                        <Ionicons name="hardware-chip" size={16} color={COLORS.textSecondary} />
                        <Text style={styles.hwWidgetLabel}>CPU</Text>
                     </View>
                     <Text style={styles.hwWidgetValue}>{stats.cpu_percent.toFixed(0)}%</Text>
                     <View style={styles.hwTrack}><View style={[styles.hwFill, { width: `${Math.min(100, stats.cpu_percent)}%`, backgroundColor: stats.cpu_percent > 80 ? COLORS.danger : COLORS.success }]} /></View>
                   </View>
                   <View style={styles.separatorVertical} />
                   <View style={styles.hwWidget}>
                     <View style={styles.hwWidgetHeader}>
                        <Ionicons name="server" size={16} color={COLORS.textSecondary} />
                        <Text style={styles.hwWidgetLabel}>RAM</Text>
                     </View>
                     <Text style={styles.hwWidgetValue}>{stats.ram_percent.toFixed(0)}%</Text>
                     <View style={styles.hwTrack}><View style={[styles.hwFill, { width: `${Math.min(100, stats.ram_percent)}%`, backgroundColor: stats.ram_percent > 80 ? COLORS.danger : COLORS.primary }]} /></View>
                   </View>
                 </View>

                 <View style={styles.processesSection}>
                   <View style={styles.processesFilterRow}>
                      <Text style={styles.processesLabel}>Processes</Text>
                      <TouchableOpacity onPress={() => setShowAllProcesses(!showAllProcesses)}>
                        <Text style={styles.toggleDisplayBtn}>{showAllProcesses ? 'Show Less' : 'View Full List'}</Text>
                      </TouchableOpacity>
                   </View>
                   
                   <View style={styles.tableHeader}>
                     <Text style={[styles.thCell, {flex: 3}]}>Name</Text>
                     <Text style={[styles.thCell, {flex: 1.5, textAlign: 'right'}]}>Mem</Text>
                     <Text style={[styles.thCell, {flex: 1, textAlign: 'right'}]}>CPU</Text>
                   </View>
                   
                   <View style={styles.tableBody}>
                       {(showAllProcesses ? stats.top_processes : stats.top_processes.slice(0, 5)).map((p, i) => (
                         <View key={i} style={styles.tdRow}>
                           <Text style={[styles.tdCellPrimary, {flex: 3}]} numberOfLines={1}>{p.name}</Text>
                           <Text style={[styles.tdCellSecondary, {flex: 1.5, textAlign:'right'}]}>{p.memory_mb} MB</Text>
                           <Text style={[styles.tdCellSecondary, {flex: 1, textAlign:'right'}]}>{p.cpu_percent?.toFixed(1)}%</Text>
                         </View>
                       ))}
                   </View>
                 </View>
              </View>
           ) : (
              <View style={styles.screenPlaceholder}>
                 <Ionicons name="pie-chart-outline" size={32} color={COLORS.textSecondary} />
                 <Text style={styles.screenPlaceholderText}>Metrics unavailable. Tap sync.</Text>
              </View>
           )}
        </View>

        {/* BOTTOM TRIGGER: POWER OPTIONS */}
        <TouchableOpacity style={styles.triggerBtnDanger} onPress={() => setPowerMenuVisible(true)}>
             <Ionicons name="power" size={24} color={COLORS.danger} />
             <Text style={styles.triggerBtnTextDanger}>Power Menu</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* MODAL: POWER OPTIONS SHEETS */}
      <Modal visible={powerMenuVisible} transparent={true} animationType="slide">
         <View style={styles.sheetOverlay}>
            <TouchableOpacity style={styles.sheetCloser} activeOpacity={1} onPress={() => setPowerMenuVisible(false)} />
            <View style={styles.sheetBody}>
               <View style={styles.sheetDragHandle} />
               <Text style={styles.sheetHeadline}>PC Power Options</Text>
               <View style={styles.sheetActionGroup}>
                   <TouchableOpacity style={styles.sheetBtnWarning} onPress={() => { setPowerMenuVisible(false); handlePower('restart'); }}>
                       <Ionicons name="refresh" size={22} color={COLORS.background} />
                       <Text style={styles.sheetBtnTextDark}>Restart System</Text>
                   </TouchableOpacity>
                   <TouchableOpacity style={styles.sheetBtnDanger} onPress={() => { setPowerMenuVisible(false); handlePower('shutdown'); }}>
                       <Ionicons name="power" size={22} color={COLORS.text} />
                       <Text style={styles.sheetBtnTextLight}>Shutdown System</Text>
                   </TouchableOpacity>
               </View>
               <TouchableOpacity style={styles.sheetBtnOutline} onPress={() => { setPowerMenuVisible(false); cancelShutdown(); }}>
                   <Text style={styles.sheetBtnOutlineText}>Abort Active Action</Text>
               </TouchableOpacity>
            </View>
         </View>
      </Modal>

    </View>
  );
}

// ─── STYLESHEET ────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Global
  baseContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  baseContainerScroll: {
    flexGrow: 1,
    backgroundColor: COLORS.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    justifyContent: 'center',
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
    gap: SPACING.lg, // Perfect component spacing
  },

  // Login Screen
  loginContainer: {
    padding: SPACING.lg,
  },
  loginHeader: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
    marginTop: SPACING.xl,
  },
  loginIcon: {
    marginBottom: SPACING.md,
  },
  loginTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 2,
  },
  loginSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },

  // Saved Devices
  savedDevicesSection: {
    marginBottom: SPACING.xl,
  },
  savedTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    letterSpacing: 1,
  },
  savedDeviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  savedDeviceIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.cardElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  savedDeviceInfo: {
    flex: 1,
  },
  savedDeviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  savedDeviceIp: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // Manual Input
  loginCard: {
    backgroundColor: 'transparent',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    letterSpacing: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 54,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputField: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    marginLeft: SPACING.sm,
  },
  btnConnect: {
    backgroundColor: COLORS.cardElevated,
    height: 54,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnConnectText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Navbar
  topNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.card,
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginRight: SPACING.sm,
  },
  navStatusText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.success,
    letterSpacing: 0.5,
  },
  navIpText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 2,
  },
  navBtnDisconnect: {
    backgroundColor: COLORS.cardElevated,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
  },

  // Cards Base
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  cardTitleNoMargin: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  cardHeaderFlex: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  cardHeaderBtn: {
    backgroundColor: COLORS.cardElevated,
    width: 36,
    height: 36,
    borderRadius: RADIUS.round,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Media
  mediaCluster: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xl,
  },
  mediaBtnSecondary: {
    width: 54,
    height: 54,
    borderRadius: RADIUS.round,
    backgroundColor: COLORS.cardElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaBtnPrimary: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.round,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },

  // Volume
  volumeCluster: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  muteBtn: {
    width: 54,
    height: 54,
    borderRadius: RADIUS.round,
    backgroundColor: COLORS.cardElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  volumeStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardElevated,
    borderRadius: RADIUS.round,
    padding: SPACING.xs,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.round,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  volValueWrapper: {
    width: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  volValueText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },

  // Screen Frame
  screenFrame: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  screenLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  screenScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenImage: {
    width: '100%',
    height: '100%',
  },
  screenPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  screenPlaceholderText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: SPACING.sm,
  },

  // Stats
  statsContainer: {
    marginTop: SPACING.xs,
  },
  hwWidgets: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  separatorVertical: {
    width: 1,
    backgroundColor: COLORS.card,
    marginHorizontal: SPACING.md,
  },
  hwWidget: {
    flex: 1,
  },
  hwWidgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  hwWidgetLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  hwWidgetValue: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    marginVertical: SPACING.sm,
  },
  hwTrack: {
    height: 6,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.round,
    overflow: 'hidden',
  },
  hwFill: {
    height: '100%',
    borderRadius: RADIUS.round,
  },
  processesSection: {
    marginTop: SPACING.xs,
  },
  processesFilterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  processesLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  toggleDisplayBtn: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  thCell: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  tableBody: {
    gap: 0,
  },
  tdRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardElevated,
  },
  tdCellPrimary: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  tdCellSecondary: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },

  // Bottom Trigger (Power)
  triggerBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3A1110',      // Deep red background
    borderWidth: 1,
    borderColor: '#7A1C16',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  triggerBtnTextDanger: {
    color: COLORS.danger,
    fontSize: 16,
    fontWeight: '800',
  },

  // Power Sheet Modal
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  sheetCloser: {
    flex: 1,
  },
  sheetBody: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.lg,
    paddingBottom: Platform.OS === 'ios' ? 40 : SPACING.xl,
  },
  sheetDragHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.textSecondary,
    borderRadius: RADIUS.round,
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  sheetHeadline: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  sheetActionGroup: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  sheetBtnWarning: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.warning,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.xs,
  },
  sheetBtnDanger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.danger,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.xs,
  },
  sheetBtnTextDark: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.background,
  },
  sheetBtnTextLight: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  sheetBtnOutline: {
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  sheetBtnOutlineText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  }
});
