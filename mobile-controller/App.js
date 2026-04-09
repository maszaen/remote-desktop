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
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function App() {
  const [ipAddress, setIpAddress] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState('');

  // Volume state
  const [currentVolume, setCurrentVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [customVolume, setCustomVolume] = useState('');

  // Stats state
  const [stats, setStats] = useState(null);
  const [showAllProcesses, setShowAllProcesses] = useState(false);

  // Screenshot state
  const [screenshot, setScreenshot] = useState(null);

  // Loading states
  const [refreshing, setRefreshing] = useState(false);
  const [loadingAction, setLoadingAction] = useState('');

  // ─── Connection ───────────────────────────────────────────

  const connect = async () => {
    if (!ipAddress.trim()) return Alert.alert('Error', 'Masukkin IP address dulu bro');
    // Clean input: strip http://, https://, trailing port, slashes
    let cleanIp = ipAddress.trim();
    cleanIp = cleanIp.replace(/^https?:\/\//, '');
    cleanIp = cleanIp.replace(/:\d+$/, '');
    cleanIp = cleanIp.replace(/\/+$/, '');
    const url = `http://${cleanIp}:8000`;
    setLoadingAction('connecting');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${url}/`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        setServerUrl(url);
        setIsConnected(true);
        // Fetch current volume right after connect
        try {
          const volRes = await fetch(`${url}/volume`);
          const volData = await volRes.json();
          if (!volData.error) {
            setCurrentVolume(volData.volume);
            setIsMuted(volData.muted);
          }
        } catch (_) {}
        Alert.alert('✅ Connected', `Terhubung ke ${cleanIp}`);
      }
    } catch (e) {
      Alert.alert('❌ Gagal Connect', `URL: ${url}\nError: ${e.message}\n\nPastikan:\n1. Server jalan di PC\n2. HP & PC WiFi sama\n3. Firewall ga block port 8000`);
    } finally {
      setLoadingAction('');
    }
  };

  const disconnect = () => {
    setIsConnected(false);
    setServerUrl('');
    setStats(null);
    setScreenshot(null);
    setCurrentVolume(0);
    setIsMuted(false);
  };

  // ─── Generic Action Sender ────────────────────────────────

  const sendAction = async (endpoint, method = 'POST', body = null) => {
    if (!isConnected) return null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      };
      if (body) options.body = JSON.stringify(body);
      const res = await fetch(`${serverUrl}${endpoint}`, options);
      return await res.json();
    } catch (e) {
      Alert.alert('⚠️ Error', 'Koneksi gagal. Cek WiFi lo.');
      return null;
    }
  };

  // ─── Volume Controls ──────────────────────────────────────

  const fetchVolume = async () => {
    const data = await sendAction('/volume', 'GET');
    if (data && !data.error) {
      setCurrentVolume(data.volume);
      setIsMuted(data.muted);
    } else if (data?.error) {
      Alert.alert('Volume Error', data.error);
    }
  };

  const handleSetVolume = async (val) => {
    const result = await sendAction('/volume', 'POST', { volume: val });
    if (result && !result.error) {
      setCurrentVolume(val);
      setIsMuted(false);
    } else if (result?.error) {
      Alert.alert('Volume Error', result.error);
    }
  };

  const handleVolumeUp = async () => {
    const result = await sendAction('/volume/up');
    if (result && !result.error) {
      setCurrentVolume(result.volume);
      setIsMuted(false);
    } else if (result?.error) {
      Alert.alert('Volume Error', result.error);
    }
  };

  const handleVolumeDown = async () => {
    const result = await sendAction('/volume/down');
    if (result && !result.error) {
      setCurrentVolume(result.volume);
    } else if (result?.error) {
      Alert.alert('Volume Error', result.error);
    }
  };

  const handleToggleMute = async () => {
    const result = await sendAction('/volume/mute');
    if (result && !result.error) {
      setIsMuted(result.muted);
    } else if (result?.error) {
      Alert.alert('Volume Error', result.error);
    }
  };

  const handleCustomVolume = () => {
    const val = parseInt(customVolume, 10);
    if (isNaN(val) || val < 0 || val > 100) {
      Alert.alert('Error', 'Volume harus antara 0-100');
      return;
    }
    handleSetVolume(val);
    setCustomVolume('');
  };

  // ─── Media Controls ───────────────────────────────────────

  const mediaControl = (action) => sendAction(`/media/${action}`);

  // ─── Screenshot ───────────────────────────────────────────

  const captureScreen = () => {
    if (!isConnected) return;
    setScreenshot(`${serverUrl}/screen?t=${Date.now()}`);
  };

  // ─── System Stats ─────────────────────────────────────────

  const getStats = async () => {
    if (!isConnected) return;
    setLoadingAction('stats');
    const data = await sendAction('/stats', 'GET');
    if (data && !data.error) {
      setStats(data);
    }
    setLoadingAction('');
  };

  // ─── Power Controls (with confirmation) ───────────────────

  const handlePower = (action) => {
    const actionLabel = action === 'shutdown' ? 'Shutdown' : 'Restart';
    Alert.alert(
      `⚠️ ${actionLabel} PC?`,
      `Yakin mau ${actionLabel.toLowerCase()} PC lo? Akan mulai dalam 5 detik setelah confirm.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: `Ya, ${actionLabel}`,
          style: 'destructive',
          onPress: async () => {
            const result = await sendAction(`/power/${action}`);
            if (result && result.message) {
              Alert.alert('✅ OK', result.message + '\n\nMau batalin? Pencet Cancel Shutdown.');
            }
          },
        },
      ]
    );
  };

  const cancelShutdown = async () => {
    const result = await sendAction('/power/cancel');
    if (result && result.message) {
      Alert.alert('✅ Cancelled', result.message);
    }
  };

  // ─── Refresh ──────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchVolume();
    setRefreshing(false);
  }, [isConnected, serverUrl]);

  // ─── Render ───────────────────────────────────────────────

  if (!isConnected) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f0f2f5" />
        <View style={styles.connectContainer}>
          <Text style={styles.appTitle}>🎮 PC Remote</Text>
          <Text style={styles.appSubtitle}>Control your PC from your phone</Text>

          <View style={styles.card}>
            <Text style={styles.label}>IP Address PC</Text>
            <TextInput
              style={styles.input}
              placeholder="contoh: 192.168.1.15"
              placeholderTextColor="#999"
              value={ipAddress}
              onChangeText={setIpAddress}
              keyboardType="default"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.btnPrimary, loadingAction === 'connecting' && styles.btnDisabled]}
              onPress={connect}
              disabled={loadingAction === 'connecting'}
            >
              <Text style={styles.btnText}>
                {loadingAction === 'connecting' ? '⏳ Connecting...' : '🔗 Connect'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Pastikan PC dan HP lo di WiFi yang sama.{'\n'}
            Jalanin server di PC dulu sebelum connect.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#f0f2f5" />

      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.header}>🎮 PC Remote</Text>
          <Text style={styles.connectedBadge}>● Connected to {ipAddress}</Text>
        </View>
        <TouchableOpacity style={styles.btnDisconnect} onPress={disconnect}>
          <Text style={styles.btnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* ── Volume & Media ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>🔊 Volume & Media</Text>

        {/* Current Volume Display */}
        <View style={styles.volumeDisplay}>
          <Text style={styles.volumeNumber}>{isMuted ? '🔇' : '🔊'} {currentVolume}%</Text>
          {isMuted && <Text style={styles.mutedLabel}>MUTED</Text>}
        </View>

        {/* Volume Bar Visual */}
        <View style={styles.volumeBarContainer}>
          <View style={[styles.volumeBarFill, { width: `${currentVolume}%` }]} />
        </View>

        {/* Volume Up/Down/Mute */}
        <View style={styles.row}>
          <TouchableOpacity style={styles.btnAction} onPress={handleVolumeDown}>
            <Text style={styles.btnText}>🔉 -5</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnAction, isMuted ? styles.btnMuted : styles.btnMuteActive]}
            onPress={handleToggleMute}
          >
            <Text style={styles.btnText}>{isMuted ? '🔇 Unmute' : '🔇 Mute'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnAction} onPress={handleVolumeUp}>
            <Text style={styles.btnText}>🔊 +5</Text>
          </TouchableOpacity>
        </View>

        {/* Volume Presets */}
        <View style={styles.row}>
          {[0, 25, 50, 75, 100].map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.btnPreset, currentVolume === v && styles.btnPresetActive]}
              onPress={() => handleSetVolume(v)}
            >
              <Text style={[styles.btnPresetText, currentVolume === v && styles.btnPresetTextActive]}>
                {v}%
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom Volume */}
        <View style={styles.customVolumeRow}>
          <TextInput
            style={styles.volumeInput}
            placeholder="0-100"
            placeholderTextColor="#999"
            value={customVolume}
            onChangeText={setCustomVolume}
            keyboardType="numeric"
            maxLength={3}
          />
          <TouchableOpacity style={styles.btnSetVol} onPress={handleCustomVolume}>
            <Text style={styles.btnText}>Set</Text>
          </TouchableOpacity>
        </View>

        {/* Media Controls */}
        <View style={styles.divider} />
        <Text style={styles.subTitle}>Media Player</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.btnMedia} onPress={() => mediaControl('prev')}>
            <Text style={styles.mediaIcon}>⏮</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnMedia, styles.btnPlayPause]} onPress={() => mediaControl('playpause')}>
            <Text style={styles.mediaIconBig}>⏯</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnMedia} onPress={() => mediaControl('next')}>
            <Text style={styles.mediaIcon}>⏭</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Screen Capture ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📸 Screen Capture</Text>
        <Text style={styles.sectionDesc}>Lihat layar PC lo buat cek progress download dll.</Text>
        <TouchableOpacity style={styles.btnPrimary} onPress={captureScreen}>
          <Text style={styles.btnText}>📷 Capture Sekarang</Text>
        </TouchableOpacity>
        {screenshot && (
          <TouchableOpacity onPress={captureScreen} activeOpacity={0.8}>
            <Image source={{ uri: screenshot }} style={styles.screenshot} resizeMode="contain" />
            <Text style={styles.screenshotHint}>Tap gambar untuk refresh</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── System Stats ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📊 System Stats</Text>
        <TouchableOpacity
          style={[styles.btnPrimary, loadingAction === 'stats' && styles.btnDisabled]}
          onPress={getStats}
          disabled={loadingAction === 'stats'}
        >
          <Text style={styles.btnText}>
            {loadingAction === 'stats' ? '⏳ Loading...' : '🔍 Cek Usage'}
          </Text>
        </TouchableOpacity>

        {stats && (
          <View style={styles.statsContainer}>
            {/* CPU & RAM Overview */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>CPU</Text>
                <Text style={styles.statValue}>{stats.cpu_percent}%</Text>
                <View style={styles.statBar}>
                  <View
                    style={[
                      styles.statBarFill,
                      { width: `${stats.cpu_percent}%` },
                      stats.cpu_percent > 80 && styles.statBarDanger,
                    ]}
                  />
                </View>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>RAM</Text>
                <Text style={styles.statValue}>{stats.ram_percent}%</Text>
                <View style={styles.statBar}>
                  <View
                    style={[
                      styles.statBarFill,
                      { width: `${stats.ram_percent}%` },
                      stats.ram_percent > 80 && styles.statBarDanger,
                    ]}
                  />
                </View>
                <Text style={styles.statDetail}>
                  {stats.ram_used_gb} / {stats.ram_total_gb} GB
                </Text>
              </View>
            </View>

            {/* Top Processes */}
            <View style={styles.processHeader}>
              <Text style={styles.processTitle}>Top Processes (by RAM)</Text>
              <TouchableOpacity onPress={() => setShowAllProcesses(!showAllProcesses)}>
                <Text style={styles.toggleText}>
                  {showAllProcesses ? 'Show Less ▲' : `Show All (${stats.top_processes.length}) ▼`}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Process List Header */}
            <View style={styles.processListHeader}>
              <Text style={[styles.processCol, { flex: 0.4 }]}>#</Text>
              <Text style={[styles.processCol, { flex: 2 }]}>Name</Text>
              <Text style={[styles.processCol, { flex: 0.8 }]}>MB</Text>
              <Text style={[styles.processCol, { flex: 0.7 }]}>RAM%</Text>
              <Text style={[styles.processCol, { flex: 0.7 }]}>CPU%</Text>
            </View>

            {(showAllProcesses ? stats.top_processes : stats.top_processes.slice(0, 10)).map((p, i) => (
              <View key={i} style={[styles.processRow, i % 2 === 0 && styles.processRowAlt]}>
                <Text style={[styles.processText, { flex: 0.4 }]}>{i + 1}</Text>
                <Text style={[styles.processText, { flex: 2 }]} numberOfLines={1}>
                  {p.name || 'Unknown'}
                </Text>
                <Text style={[styles.processText, { flex: 0.8 }]}>
                  {p.memory_mb || 0}
                </Text>
                <Text style={[styles.processText, { flex: 0.7 }]}>
                  {p.memory_percent?.toFixed(1) || '0.0'}%
                </Text>
                <Text style={[styles.processText, { flex: 0.7 }]}>
                  {p.cpu_percent?.toFixed(1) || '0.0'}%
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Power Controls ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>⚡ Power Options</Text>
        <Text style={styles.sectionDesc}>Hati-hati! Pastikan semua kerjaan udah ke-save.</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.btnWarning} onPress={() => handlePower('restart')}>
            <Text style={styles.btnText}>🔄 Restart</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnDanger} onPress={() => handlePower('shutdown')}>
            <Text style={styles.btnText}>⏻ Shutdown</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.btnCancel} onPress={cancelShutdown}>
          <Text style={styles.btnCancelText}>❌ Cancel Shutdown/Restart</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },

  // ── Connect Screen ──
  connectContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  appSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#888',
    marginBottom: 30,
  },
  hint: {
    marginTop: 20,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 55,
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  connectedBadge: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '600',
    marginTop: 2,
  },
  btnDisconnect: {
    backgroundColor: '#FF3B30',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Cards ──
  card: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },

  // ── Typography ──
  label: { fontSize: 16, marginBottom: 10, color: '#333', fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 6, color: '#1a1a1a' },
  sectionDesc: { fontSize: 12, color: '#888', marginBottom: 14 },
  subTitle: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 10 },

  // ── Inputs ──
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 13,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#fafafa',
    color: '#333',
  },

  // ── Buttons ──
  btnPrimary: {
    backgroundColor: '#007AFF',
    padding: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnAction: {
    backgroundColor: '#4a4a4a',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  btnDanger: {
    backgroundColor: '#FF3B30',
    padding: 13,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  btnWarning: {
    backgroundColor: '#FF9500',
    padding: 13,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  btnCancel: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  btnCancelText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
  },
  btnMuted: {
    backgroundColor: '#FF9500',
  },
  btnMuteActive: {
    backgroundColor: '#555',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  btnSetVol: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginLeft: 8,
  },

  // ── Volume ──
  volumeDisplay: {
    alignItems: 'center',
    marginVertical: 10,
  },
  volumeNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  mutedLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FF3B30',
    marginTop: 2,
  },
  volumeBarContainer: {
    height: 6,
    backgroundColor: '#e8e8e8',
    borderRadius: 3,
    marginBottom: 14,
    overflow: 'hidden',
  },
  volumeBarFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 3,
  },
  customVolumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  volumeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 10,
    fontSize: 16,
    backgroundColor: '#fafafa',
    color: '#333',
  },

  // ── Volume Presets ──
  btnPreset: {
    flex: 1,
    marginHorizontal: 3,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  btnPresetActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  btnPresetText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  btnPresetTextActive: {
    color: 'white',
  },

  // ── Media ──
  btnMedia: {
    backgroundColor: '#4a4a4a',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginHorizontal: 5,
  },
  btnPlayPause: {
    backgroundColor: '#007AFF',
    flex: 1.3,
  },
  mediaIcon: {
    fontSize: 22,
  },
  mediaIconBig: {
    fontSize: 28,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 16,
  },

  // ── Layout ──
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  // ── Screenshot ──
  screenshot: {
    width: '100%',
    height: 200,
    marginTop: 14,
    borderRadius: 10,
    backgroundColor: '#111',
  },
  screenshotHint: {
    textAlign: 'center',
    fontSize: 11,
    color: '#aaa',
    marginTop: 4,
  },

  // ── Stats ──
  statsContainer: {
    marginTop: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 10,
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginVertical: 4,
  },
  statBar: {
    height: 5,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  statBarFill: {
    height: '100%',
    backgroundColor: '#34C759',
    borderRadius: 3,
  },
  statBarDanger: {
    backgroundColor: '#FF3B30',
  },
  statDetail: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
  },

  // ── Processes ──
  processHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  processTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  toggleText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
  processListHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#e8ecf0',
    borderRadius: 6,
    marginBottom: 4,
  },
  processCol: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#555',
  },
  processRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  processRowAlt: {
    backgroundColor: '#f8f9fa',
  },
  processText: {
    fontSize: 12,
    color: '#444',
  },
});
