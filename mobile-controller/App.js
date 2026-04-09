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
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const [isScreenModalOpen, setIsScreenModalOpen] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [loadingAction, setLoadingAction] = useState('');

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

  const handleSetVolume = async (val) => {
    const rounded = Math.round(val);
    setCurrentVolume(rounded); // Optimistic UI update
    const result = await sendAction('/volume', 'POST', { volume: rounded });
    if (result && !result.error) setIsMuted(false);
  };

  const handleToggleMute = async () => {
    const result = await sendAction('/volume/mute');
    if (result && !result.error) setIsMuted(result.muted);
  };

  const mediaControl = (action) => sendAction(`/media/${action}`);

  const captureScreen = () => {
    if (!isConnected) return;
    setScreenshot(`${serverUrl}/screen?t=${Date.now()}`);
    setIsScreenModalOpen(true);
  };

  const getStats = async (urlOverride = null) => {
    setLoadingAction('stats');
    const data = await sendAction('/stats', 'GET', null, urlOverride);
    if (data && !data.error) setStats(data);
    setLoadingAction('');
  };

  const handlePower = (action) => {
    Alert.alert(
      `⚠️ ${action.toUpperCase()}`,
      `Are you sure you want to ${action} your PC?\nDevice will ${action} in 5 seconds.`,
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
    Alert.alert('Cancelled', 'Power action aborted.');
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
      <SafeAreaView style={styles.container}>
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
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
        {/* ── SECT 1: MEDIA & AUDIO ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Media & Audio</Text>
          
          <View style={styles.mediaRow}>
            <TouchableOpacity style={styles.mediaBtn} onPress={() => mediaControl('prev')}>
              <Ionicons name="play-skip-back" size={28} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaBtnPlay} onPress={() => mediaControl('playpause')}>
              <Ionicons name="play-pause" size={36} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaBtn} onPress={() => mediaControl('next')}>
              <Ionicons name="play-skip-forward" size={28} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.volumeRow}>
            <TouchableOpacity onPress={handleToggleMute} style={{ width: 40, alignItems: 'center' }}>
              <Ionicons name={isMuted || currentVolume === 0 ? "volume-mute" : "volume-high"} size={26} color={isMuted ? COLORS.danger : COLORS.textDim} />
            </TouchableOpacity>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={100}
              value={currentVolume}
              onSlidingComplete={handleSetVolume}
              minimumTrackTintColor={COLORS.accent}
              maximumTrackTintColor={COLORS.cardHighlight}
              thumbTintColor={COLORS.text}
            />
            <Text style={styles.volumeText}>{currentVolume}%</Text>
          </View>
        </View>

        {/* ── SECT 2: UTILITIES ── */}
        <View style={styles.cardRow}>
           <TouchableOpacity style={[styles.card, styles.flexCard]} onPress={captureScreen}>
              <MaterialCommunityIcons name="monitor-screenshot" size={32} color={COLORS.accent} />
              <Text style={styles.cardTitle}>Capture Screen</Text>
              <Text style={styles.cardSubtitle}>View desktop</Text>
           </TouchableOpacity>
           
           <TouchableOpacity style={[styles.card, styles.flexCard]} onPress={getStats}>
              <Ionicons name="hardware-chip" size={32} color={COLORS.warning} />
              <Text style={styles.cardTitle}>Refresh Stats</Text>
              <Text style={styles.cardSubtitle}>Update usage</Text>
           </TouchableOpacity>
        </View>

        {/* ── SECT 3: PERFORMANCE DETAILS ── */}
        {stats && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Performance</Text>
            
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
          </View>
        )}

        {/* ── SECT 4: POWER ── */}
        <View style={[styles.card, { borderColor: '#401515', borderWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: COLORS.danger }]}>Power Control</Text>
          <View style={styles.powerRow}>
            <TouchableOpacity style={styles.btnRestart} onPress={() => handlePower('restart')}>
               <Ionicons name="refresh" size={20} color={COLORS.text} style={{marginRight: 6}} />
               <Text style={styles.btnTextBold}>Restart</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnShutdown} onPress={() => handlePower('shutdown')}>
               <Ionicons name="power" size={20} color={COLORS.text} style={{marginRight: 6}}/>
               <Text style={styles.btnTextBold}>Shutdown</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.btnCancel} onPress={cancelShutdown}>
              <Text style={styles.btnTextDim}>Abort Power Action</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Screen Modal */}
      <Modal visible={isScreenModalOpen} transparent={true} animationType="fade">
         <View style={styles.modalBg}>
            <View style={styles.modalHeader}>
               <Text style={styles.modalTitle}>Desktop Capture</Text>
               <TouchableOpacity onPress={() => setIsScreenModalOpen(false)}>
                  <Ionicons name="close" size={28} color={COLORS.text} />
               </TouchableOpacity>
            </View>
            {screenshot && <Image source={{ uri: screenshot }} style={styles.modalImg} resizeMode="contain" />}
            <TouchableOpacity style={[styles.btnPrimary, {margin: 20}]} onPress={captureScreen}>
               <Text style={styles.btnPrimaryText}>Refresh Capture</Text>
            </TouchableOpacity>
         </View>
      </Modal>

    </SafeAreaView>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    top: '30%',
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
    backgroundColor: COLORS.cardHighlight,
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
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 1,
  },

  // HEADER
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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

  // CARDS
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 16,
  },
  flexCard: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    color: COLORS.text,
    fontWeight: '800',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  subTitle: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 12,
  },
  cardSubtitle: {
    fontSize: 13,
    color: COLORS.textDim,
    marginTop: 4,
  },

  // MEDIA
  mediaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    marginBottom: 30,
    marginTop: 10,
  },
  mediaBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.cardHighlight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaBtnPlay: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardHighlight,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
  },
  slider: {
    flex: 1,
    height: 40,
    marginHorizontal: 8,
  },
  volumeText: {
    width: 45,
    textAlign: 'center',
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 15,
  },

  // STATS
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
    borderBottomColor: '#1e1e1e',
  },
  tRowText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // POWER
  powerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btnRestart: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.warning,
    paddingVertical: 16,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnShutdown: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.danger,
    paddingVertical: 16,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnTextBold: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  btnCancel: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.textDim,
    alignItems: 'center',
  },
  btnTextDim: {
    color: COLORS.textDim,
    fontSize: 14,
    fontWeight: '600',
  },

  // MODAL
  modalBg: {
    flex: 1,
    backgroundColor: '#000000ed',
    justifyContent: 'center',
  },
  modalHeader: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     padding: 24,
     alignItems: 'center',
  },
  modalTitle: {
     color: COLORS.text,
     fontSize: 18,
     fontWeight: 'bold'
  },
  modalImg: {
     width: '100%',
     height: SCREEN_WIDTH * 0.7,
     backgroundColor: '#000'
  }
});
