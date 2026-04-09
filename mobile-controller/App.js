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
  Modal,
  Platform,
  ActivityIndicator
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// --- THEME ---
const COLORS = {
  background: '#0a0a0c', // Deep black 
  card: '#161618',       // Slightly lighter for cards
  cardHighlight: '#1f1f22',
  accent: '#0A84FF',     // Vivid Blue
  danger: '#FF453A',     // Red
  success: '#32D74B',    // Green
  warning: '#FF9F0A',    // Orange
  text: '#FFFFFF',
  textDim: '#8E8E93',
  border: '#2C2C2E',
};

export default function App() {
  const [ipAddress, setIpAddress] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState('');

  // Volume
  const [currentVolume, setCurrentVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Stats
  const [stats, setStats] = useState(null);
  const [showAllProcesses, setShowAllProcesses] = useState(false);

  // Screenshots
  const [screenshot, setScreenshot] = useState(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Loading & Modals
  const [refreshing, setRefreshing] = useState(false);
  const [loadingAction, setLoadingAction] = useState('');
  const [powerMenuVisible, setPowerMenuVisible] = useState(false);

  // ─── Connection ───────────────────────────────────────────
  const connect = async () => {
    if (!ipAddress.trim()) return Alert.alert('Whoops!', 'Enter your PC IP address first.');
    let cleanIp = ipAddress.trim();
    cleanIp = cleanIp.replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/+$/, '');
    const url = `http://${cleanIp}:8000`;
    
    setLoadingAction('connecting');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${url}/`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        setServerUrl(url);
        setIsConnected(true);
        fetchVolume(url);
        getStats(url);
      }
    } catch (e) {
      Alert.alert('Connection Failed', `Could not connect to ${cleanIp}.\nMake sure you're on the same WiFi and the server is running.`);
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
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      };
      if (body) options.body = JSON.stringify(body);
      const res = await fetch(`${targetUrl}${endpoint}`, options);
      clearTimeout(timeoutId);
      return await res.json();
    } catch (e) {
      return { error: 'Network request failed' };
    }
  };

  // ─── Control Handlers ─────────────────────────────────────
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
    if (result && !result.error) {
      setCurrentVolume(result.volume);
      setIsMuted(false);
    }
  };

  const handleVolumeDown = async () => {
    const result = await sendAction('/volume/down');
    if (result && !result.error) {
      setCurrentVolume(result.volume);
    }
  };

  const mediaControl = (action) => sendAction(`/media/${action}`);

  const captureScreen = async () => {
    if (!isConnected) return;
    setIsCapturing(true);
    setImgLoading(true);
    setScreenshot(`${serverUrl}/screen?t=${Date.now()}`);
    // Simulate slight delay so the loading indicator renders smoothly
    await new Promise(r => setTimeout(r, 600)); 
    setIsCapturing(false);
  };

  const getStats = async (urlOverride = null) => {
    setLoadingAction('stats');
    const start = Date.now();
    const data = await sendAction('/stats', 'GET', null, urlOverride);
    const elapsed = Date.now() - start;
    if (elapsed < 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
    }
    if (data && !data.error) setStats(data);
    setLoadingAction('');
  };

  const handlePower = (action) => {
    Alert.alert(
      `Confimation Required`,
      `Are you sure you want to ${action.toUpperCase()} your PC?\nCommand will execute in 5 seconds.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Yes, ${action}`,
          style: 'destructive',
          onPress: async () => {
            const result = await sendAction(`/power/${action}`);
            if (result && result.message) {
              setStats(null); // Clear stats for visual feedback
            }
          },
        },
      ]
    );
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

  // ─── Components ───────────────────────────────────────────
  if (!isConnected) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.connectContainer}>
          <View style={styles.heroGlow} />
          <Ionicons name="desktop-outline" size={72} color={COLORS.accent} style={styles.logoIcon}/>
          <Text style={styles.appTitle}>Nexus Control</Text>
          <Text style={styles.appSubtitle}>Your PC, perfectly synchronized.</Text>

          <View style={styles.inputCard}>
            <Text style={styles.label}>Connect to Server IP</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="wifi" size={20} color={COLORS.textDim} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="192.168.1.x"
                placeholderTextColor={COLORS.textDim}
                value={ipAddress}
                onChangeText={setIpAddress}
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity
              style={[styles.btnPrimary, loadingAction === 'connecting' && { opacity: 0.7 }]}
              onPress={connect}
              disabled={loadingAction === 'connecting'}
            >
              <Text style={styles.btnPrimaryText}>
                {loadingAction === 'connecting' ? 'SYNCING...' : 'CONNECT'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.statusDot} />
          <View>
            <Text style={styles.headerTitle}>Connected</Text>
            <Text style={styles.headerIp}>{serverUrl.replace('http://', '')}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={disconnect}>
          <Ionicons name="power" size={20} color={COLORS.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        {/* ── SECT 1: MEDIA PLAYER ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Media</Text>
          <View style={styles.mediaRow}>
            <TouchableOpacity style={styles.mediaBtn} onPress={() => mediaControl('prev')}>
              <MaterialCommunityIcons name="skip-previous" size={32} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaBtnPlay} onPress={() => mediaControl('playpause')}>
              <MaterialCommunityIcons name="play-pause" size={40} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaBtn} onPress={() => mediaControl('next')}>
              <MaterialCommunityIcons name="skip-next" size={32} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── SECT 2: VOLUME CONTROL ── */}
        <View style={styles.card}>
            <Text style={styles.sectionTitle}>System Volume</Text>
            <View style={styles.volumeRow}>
              <TouchableOpacity onPress={handleToggleMute} style={{ width: 44, alignItems: 'center' }}>
                <Ionicons name={isMuted || currentVolume === 0 ? "volume-mute" : "volume-high"} size={26} color={isMuted ? COLORS.danger : COLORS.textDim} />
              </TouchableOpacity>

              <View style={{flexDirection: 'row', flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16}}>
                <TouchableOpacity onPress={handleVolumeDown} style={styles.volAdjustBtn}>
                    <Ionicons name="remove" size={24} color={COLORS.textDim} />
                </TouchableOpacity>

                <Text style={[styles.volumeText, {fontSize: 20, width: 60}]}>{currentVolume}%</Text>

                <TouchableOpacity onPress={handleVolumeUp} style={[styles.volAdjustBtn, {backgroundColor: COLORS.cardHighlight}]}>
                    <Ionicons name="add" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>
            </View>
        </View>

        {/* ── SECT 3: LIVE DESKTOP SCREEN ── */}
        <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
               <Text style={styles.sectionTitle}>Live Desktop</Text>
               <TouchableOpacity onPress={captureScreen} disabled={isCapturing} style={styles.refreshBtn}>
                  {isCapturing ? (
                      <ActivityIndicator size="small" color={COLORS.accent} />
                  ) : (
                      <Ionicons name="refresh" size={20} color={COLORS.textDim} />
                  )}
               </TouchableOpacity>
            </View>
            
            <View style={styles.screenContainer}>
               {imgLoading && screenshot && (
                   <View style={styles.absoluteLoaderCenter}>
                      <ActivityIndicator size="large" color={COLORS.accent} />
                   </View>
               )}
               {screenshot ? (
                   <ScrollView minimumZoomScale={1} maximumZoomScale={5} contentContainerStyle={styles.screenInner}>
                      <Image 
                         source={{ uri: screenshot }} 
                         style={styles.screenImage} 
                         resizeMode="contain"
                         onLoad={() => setImgLoading(false)}
                         onError={() => setImgLoading(false)}
                      />
                   </ScrollView>
               ) : (
                   <View style={styles.blankScreen}>
                      <MaterialCommunityIcons name="monitor-off" size={48} color={COLORS.border} style={{marginBottom: 10}} />
                      <Text style={styles.blankText}>No capture available</Text>
                      <Text style={styles.blankTextSub}>Tap the refresh icon to sync.</Text>
                   </View>
               )}
            </View>
        </View>

        {/* ── SECT 4: PERFORMANCE DETAILS ── */}
        <View style={styles.card}>
           <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Performance</Text>
              <TouchableOpacity onPress={() => getStats()} disabled={loadingAction === 'stats'} style={styles.refreshBtn}>
                 {loadingAction === 'stats' ? (
                     <ActivityIndicator size="small" color={COLORS.warning} />
                 ) : (
                     <Ionicons name="refresh" size={20} color={COLORS.textDim} />
                 )}
              </TouchableOpacity>
           </View>

           {stats ? (
              <>
                 <View style={styles.hardwareGrid}>
                   <View style={styles.hardwareBox}>
                     <Text style={styles.hwLabel}>CPU</Text>
                     <Text style={styles.hwValue}>{stats.cpu_percent}%</Text>
                     <View style={styles.barBg}>
                        <View style={[styles.barFill, { width: `${Math.min(100, stats.cpu_percent)}%`, backgroundColor: stats.cpu_percent > 80 ? COLORS.danger : COLORS.success }]} />
                     </View>
                   </View>
                   <View style={styles.hardwareBox}>
                     <Text style={styles.hwLabel}>RAM</Text>
                     <Text style={styles.hwValue}>{stats.ram_percent}%</Text>
                     <View style={styles.barBg}>
                        <View style={[styles.barFill, { width: `${Math.min(100, stats.ram_percent)}%`, backgroundColor: stats.ram_percent > 80 ? COLORS.danger : COLORS.accent }]} />
                     </View>
                     <Text style={styles.hwDetail}>{stats.ram_used_gb} / {stats.ram_total_gb} GB</Text>
                   </View>
                 </View>

                 <View style={styles.processHeader}>
                   <Text style={styles.subTitle}>Top Processes</Text>
                   <TouchableOpacity onPress={() => setShowAllProcesses(!showAllProcesses)}>
                     <Text style={styles.linkText}>{showAllProcesses ? 'Show Less' : 'Show All'}</Text>
                   </TouchableOpacity>
                 </View>

                 <View style={styles.processTableHead}>
                    <Text style={[styles.tCol, {flex: 2}]}>Task</Text>
                    <Text style={[styles.tCol, {flex: 1, textAlign:'right'}]}>RAM</Text>
                    <Text style={[styles.tCol, {flex: 1, textAlign:'right'}]}>CPU</Text>
                 </View>

                 {(showAllProcesses ? stats.top_processes : stats.top_processes.slice(0, 7)).map((p, i) => (
                   <View key={i} style={styles.processRow}>
                     <Text style={[styles.tRowText, {flex: 2, color: COLORS.text}]} numberOfLines={1}>{p.name}</Text>
                     <Text style={[styles.tRowText, {flex: 1, textAlign:'right', color: COLORS.textDim}]}>{p.memory_mb} MB</Text>
                     <Text style={[styles.tRowText, {flex: 1, textAlign:'right', color: COLORS.textDim}]}>{p.cpu_percent?.toFixed(1)}%</Text>
                   </View>
                 ))}
              </>
           ) : (
              <View style={[styles.blankScreen, {paddingVertical: 30}]}>
                 <Ionicons name="hardware-chip-outline" size={48} color={COLORS.border} style={{marginBottom: 10}} />
                 <Text style={styles.blankText}>No metrics available</Text>
                 <Text style={styles.blankTextSub}>Tap the refresh icon to sync stats.</Text>
              </View>
           )}
        </View>

        {/* ── SECT 5: POWER ── */}
        <View style={styles.powerCardWrapper}>
            <TouchableOpacity style={styles.btnPowerMenu} onPress={() => setPowerMenuVisible(true)}>
                <MaterialCommunityIcons name="power-settings" size={26} color={COLORS.danger} style={{marginRight: 10}}/>
                <Text style={styles.btnPowerMenuTxt}>Power Menu</Text>
            </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Power Action Bottom Sheet */}
      <Modal visible={powerMenuVisible} transparent={true} animationType="slide">
         <TouchableOpacity style={styles.powerModalOverlay} activeOpacity={1} onPress={() => setPowerMenuVisible(false)}>
            <View style={styles.powerSheet}>
               <View style={styles.sheetHandle} />
               <Text style={styles.sheetTitle}>Power Options</Text>
               <Text style={styles.sheetSubtitle}>Pick an action to execute on your PC.</Text>
               
               <TouchableOpacity style={[styles.sheetCollapseBtn, {backgroundColor: COLORS.warning, marginTop: 20}]} onPress={() => { setPowerMenuVisible(false); handlePower('restart'); }}>
                   <Ionicons name="refresh" size={22} color={COLORS.text} style={{marginRight: 12}}/>
                   <Text style={styles.btnTextBold}>Restart PC</Text>
               </TouchableOpacity>

               <TouchableOpacity style={[styles.sheetCollapseBtn, {backgroundColor: COLORS.danger}]} onPress={() => { setPowerMenuVisible(false); handlePower('shutdown'); }}>
                   <Ionicons name="power" size={22} color={COLORS.text} style={{marginRight: 12}}/>
                   <Text style={styles.btnTextBold}>Shutdown PC</Text>
               </TouchableOpacity>

               <TouchableOpacity style={styles.sheetCollapseCancel} onPress={() => { setPowerMenuVisible(false); cancelShutdown(); }}>
                   <Text style={styles.btnTextDim}>Cancel Active Shutdown Action</Text>
               </TouchableOpacity>
            </View>
         </TouchableOpacity>
      </Modal>

    </View>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // LOGIN SCREEN
  connectContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  heroGlow: {
    position: 'absolute',
    top: '25%',
    left: '50%',
    width: 200,
    height: 200,
    marginLeft: -100,
    backgroundColor: COLORS.accent,
    opacity: 0.15,
    borderRadius: 100,
    transform: [{ scaleX: 2 }],
  },
  logoIcon: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  appSubtitle: {
    fontSize: 15,
    color: COLORS.textDim,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 40,
  },
  inputCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  label: {
    fontSize: 13,
    color: COLORS.textDim,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 18,
    paddingVertical: 16,
  },
  btnPrimary: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPrimaryText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },

  // HEADER
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardHighlight,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.success,
    marginRight: 10,
    shadowColor: COLORS.success,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  headerTitle: {
    color: COLORS.textDim,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  headerIp: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  iconBtn: {
    backgroundColor: COLORS.cardHighlight,
    padding: 10,
    borderRadius: 12,
  },

  // CARDS (GENERAL)
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    color: COLORS.text,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  refreshBtn: {
    padding: 6,
    backgroundColor: COLORS.cardHighlight,
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  subTitle: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '700',
  },

  // MEDIA (Container 1)
  mediaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    marginTop: 10,
  },
  mediaBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.cardHighlight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaBtnPlay: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },

  // VOLUME (Container 2)
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 10,
  },
  volAdjustBtn: {
    width: 44,
    height: 44,
    backgroundColor: COLORS.background,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  volumeText: {
    width: 60,
    textAlign: 'center',
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 20,
  },

  // SCREEN CAPTURE (Container 3)
  screenContainer: {
     width: '100%',
     height: 220,
     backgroundColor: COLORS.background,
     borderRadius: 16,
     borderWidth: 1,
     borderColor: COLORS.border,
     overflow: 'hidden',
     justifyContent: 'center',
     alignItems: 'center',
  },
  screenInner: {
     flexGrow: 1, 
     justifyContent: 'center',
     alignItems: 'center',
     width: '100%',
     height: '100%'
  },
  screenImage: {
     width: '100%',
     height: '100%',
  },
  absoluteLoaderCenter: {
     position: 'absolute',
     zIndex: 10,
     backgroundColor: '#00000088',
     width: '100%',
     height: '100%',
     justifyContent: 'center',
     alignItems: 'center'
  },
  blankScreen: {
     alignItems: 'center',
     justifyContent: 'center',
  },
  blankText: {
     color: COLORS.textDim,
     fontSize: 15,
     fontWeight: '600'
  },
  blankTextSub: {
     color: '#555',
     fontSize: 12,
     marginTop: 4,
  },

  // STATS (Container 4)
  hardwareGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  hardwareBox: {
    flex: 1,
    backgroundColor: COLORS.cardHighlight,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  hwLabel: {
    fontSize: 13,
    color: COLORS.textDim,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  hwValue: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.text,
    marginVertical: 10,
  },
  barBg: {
    height: 6,
    backgroundColor: COLORS.background,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  hwDetail: {
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 8,
    fontWeight: '600',
  },
  processHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  linkText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  processTableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
    marginBottom: 8,
  },
  tCol: {
    fontSize: 11,
    color: COLORS.textDim,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  processRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardHighlight,
  },
  tRowText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // POWER CONTROL MENU BUTTON
  powerCardWrapper: {
      marginTop: 20,
      marginBottom: 30,
  },
  btnPowerMenu: {
      backgroundColor: '#261214',
      borderWidth: 1,
      borderColor: '#4d1217',
      borderRadius: 20,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
  },
  btnPowerMenuTxt: {
      color: COLORS.danger,
      fontSize: 18,
      fontWeight: 'bold',
      letterSpacing: 0.5,
  },

  // POWER BOTTOM SHEET
  powerModalOverlay: {
      flex: 1,
      backgroundColor: '#000000AA',
      justifyContent: 'flex-end',
  },
  powerSheet: {
      backgroundColor: COLORS.cardHighlight,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      padding: 24,
      paddingBottom: 40,
  },
  sheetHandle: {
      width: 40,
      height: 4,
      backgroundColor: COLORS.textDim,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 20,
  },
  sheetTitle: {
      color: COLORS.text,
      fontSize: 24,
      fontWeight: 'bold',
  },
  sheetSubtitle: {
      color: COLORS.textDim,
      fontSize: 14,
      marginTop: 4,
  },
  sheetCollapseBtn: {
      flexDirection: 'row',
      paddingVertical: 18,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
  },
  btnTextBold: {
      color: COLORS.text,
      fontSize: 16,
      fontWeight: 'bold',
  },
  sheetCollapseCancel: {
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 10,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 16,
  }
});
