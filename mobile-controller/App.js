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
  Platform,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- THEME ---
const COLORS = {
  background: '#000000', surface: '#121212', card: '#1C1C1E', cardElevated: '#2C2C2E',
  primary: '#0A84FF', danger: '#FF453A', warning: '#FF9F0A', success: '#32D74B',
  text: '#FFFFFF', textSecondary: '#8E8E93', border: '#2C2C2E',
};

const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
const RADIUS = { sm: 8, md: 16, lg: 24, round: 999 };

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [savedDevices, setSavedDevices] = useState([]);
  const [activePin, setActivePin] = useState(null);

  // Network Discovery
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  
  // Pairing logic
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [pairingIp, setPairingIp] = useState(null);
  const [pairingHostname, setPairingHostname] = useState(null);
  const [inputPin, setInputPin] = useState('');

  // App States
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

  useEffect(() => {
    loadSavedDevices();
    scanLocalNetwork(); // auto-scan on startup
  }, []);

  const loadSavedDevices = async () => {
    try {
      const data = await AsyncStorage.getItem('nexus_devices_v2');
      if (data) setSavedDevices(JSON.parse(data));
    } catch (e) {}
  };

  const saveDevice = async (ip, hostname, pin) => {
    try {
      const newDevice = { ip, hostname, pin, lastSeen: Date.now() };
      let updated = [newDevice, ...savedDevices.filter(d => d.ip !== ip)];
      setSavedDevices(updated);
      await AsyncStorage.setItem('nexus_devices_v2', JSON.stringify(updated));
    } catch (e) {}
  };

  const removeSavedDevice = async (ip) => {
    Alert.alert("Remove Device?", `Forget paired PC ${ip}?`, [
       { text: "Cancel", style: "cancel" },
       { text: "Remove", style: "destructive", onPress: async () => {
            let updated = savedDevices.filter(d => d.ip !== ip);
            setSavedDevices(updated);
            await AsyncStorage.setItem('nexus_devices_v2', JSON.stringify(updated));
       }}
    ]);
  };

  // ─── Network Scanning ───────────────────────────────────────────
  const scanLocalNetwork = async () => {
    setIsScanning(true);
    setDiscoveredDevices([]); 
    try {
        const pingIp = (targetIp) => {
            return new Promise((resolve) => {
                let finished = false;
                const controller = new AbortController();
                const timer = setTimeout(() => { 
                    if (!finished) {
                        try { controller.abort(); } catch(e){}
                        finished = true; resolve(null); 
                    }
                }, 1200); 
                
                fetch(`http://${targetIp}:8000/`, { signal: controller.signal })
                    .then(res => res.json())
                    .then(data => {
                        if (finished) return;
                        clearTimeout(timer);
                        finished = true;
                        if (data && data.status === 'ok') {
                            setDiscoveredDevices(prev => {
                               if (!prev.find(d => d.ip === targetIp)) return [...prev, { ip: targetIp, hostname: data.hostname }];
                               return prev;
                            });
                        }
                        resolve(null);
                    })
                    .catch(() => { 
                        if (finished) return;
                        clearTimeout(timer);
                        finished = true; resolve(null); 
                    });
            });
        };

        const ipsToScan = ['NexusPC.local', '10.0.2.2'];
        const standardPrefixes = ['192.168.100.', '192.168.1.', '192.168.0.', '192.168.8.', '10.0.0.'];
        
        // Always derive Phone IP just in case it's on a custom subnet
        const ipInfo = await Network.getIpAddressAsync();
        if (ipInfo && ipInfo !== '0.0.0.0' && ipInfo.includes('.') && !ipInfo.startsWith('127.')) {
            const currentPrefix = ipInfo.split('.').slice(0, 3).join('.') + '.';
            if (!standardPrefixes.includes(currentPrefix)) standardPrefixes.unshift(currentPrefix);
        }

        // Generate full global sweep list
        for (const prefix of standardPrefixes) {
             for (let i = 1; i <= 254; i++) ipsToScan.push(`${prefix}${i}`);
        }

        // Extremely safe STAGGERED dispatch to bypass Android Port-Scan blocks & Bridge flooding
        for (let i = 0; i < ipsToScan.length; i++) {
           pingIp(ipsToScan[i]); // Fire without blocking loop!
           await new Promise(r => setTimeout(r, 12)); // 12ms stagger -> 1200 IPs takes ~14 seconds to fully dispatch
        }
        
    } catch(e) {}
    
    // Allow lingering requests to complete gracefully
    setTimeout(() => setIsScanning(false), 2000);
  };

  // ─── Connection & Pairing ───────────────────────────────────────────
  const initiateConnect = async (ip, hostname = "PC", savedPin = null) => {
    const targetIp = ip || ipAddress;
    if (!targetIp.trim()) return Alert.alert('Error', 'Enter a valid IP address.');
    let cleanIp = targetIp.trim().replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/+$/, '');
    
    const url = `http://${cleanIp}:8000`;
    setLoadingAction(`connecting_${cleanIp}`);
    
    // First, verify connection works and PIN is valid (if provided)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      
      const res = await fetch(`${url}/volume`, { 
          headers: savedPin ? { 'pin': savedPin } : {}, 

          signal: controller.signal 
      });
      clearTimeout(timeoutId);

      if (res.status === 401 || !savedPin) {
          // Needs PIN or unauthorized
          setPairingIp(ip);
          setPairingHostname(hostname);
          setPairingModalOpen(true);
          setLoadingAction('');
          return;
      }

      if (res.ok) {
          // Success
          setActivePin(savedPin);
          setServerUrl(url);
          setIsConnected(true);
          fetchVolume(url, savedPin);
          getStats(url, savedPin);
      } else {
          Alert.alert('Connection Failed', 'Server rejected the connection.');
      }
    } catch (e) {
      Alert.alert('Connection Error', `Target ${ip} is unreachable.`);
    } finally {
      if (!pairingModalOpen) setLoadingAction('');
    }
  };

  const handlePairingSubmit = async () => {
     if (inputPin.length !== 4) return Alert.alert("Invalid PIN", "Enter the 4-digit PIN.");
     
     const url = `http://${pairingIp}:8000`;
     setLoadingAction(`pairing`);
     try {
        const res = await fetch(`${url}/volume`, { headers: { 'pin': inputPin } });
        if (res.ok) {
            // Pair successful
            await saveDevice(pairingIp, pairingHostname, inputPin);
            setActivePin(inputPin);
            setServerUrl(url);
            setIsConnected(true);
            setPairingModalOpen(false);
            setInputPin('');
            
            fetchVolume(url, inputPin);
            getStats(url, inputPin);
        } else {
            Alert.alert("Pairing Failed", "Incorrect PIN entered.");
        }
     } catch (e) {
        Alert.alert("Pairing Error", "Lost connection to the PC.");
     }
     setLoadingAction('');
  };

  const disconnect = () => {
    setIsConnected(false);
    setServerUrl('');
    setStats(null);
    setScreenshot(null);
    setActivePin(null);
  };

  const sendAction = async (endpoint, method = 'POST', body = null, urlOverride = null, pinOverride = null) => {
    const targetUrl = urlOverride || serverUrl;
    const targetPin = pinOverride || activePin;
    if (!targetUrl || !targetPin) return null;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const options = { 
          method, 
          headers: { 'Content-Type': 'application/json', 'pin': targetPin }, 
          signal: controller.signal 
      };
      if (body) options.body = JSON.stringify(body);
      const res = await fetch(`${targetUrl}${endpoint}`, options);
      clearTimeout(timeoutId);
      return await res.json();
    } catch (e) { return { error: 'Network request failed' }; }
  };

  // ─── Feature Actions ─────────────────────────────────────────
  const fetchVolume = async (url = null, pin = null) => {
    const data = await sendAction('/volume', 'GET', null, url, pin);
    if (data && !data.error) { setCurrentVolume(data.volume); setIsMuted(data.muted); }
  };
  const handleToggleMute = async () => {
    const res = await sendAction('/volume/mute');
    if (res && !res.error) setIsMuted(res.muted);
  };
  const handleVolumeUp = async () => {
    const res = await sendAction('/volume/up');
    if (res && !res.error) { setCurrentVolume(res.volume); setIsMuted(false); }
  };
  const handleVolumeDown = async () => {
    const res = await sendAction('/volume/down');
    if (res && !res.error) { setCurrentVolume(res.volume); setIsMuted(false); }
  };
  const mediaControl = (action) => sendAction(`/media/${action}`);
  const captureScreen = async () => {
    if (!isConnected) return;
    setIsCapturing(true);
    setImgLoading(true);
    setScreenshot(`${serverUrl}/screen?t=${Date.now()}`); // uses headers inside <Image/> component
    await new Promise(r => setTimeout(r, 600)); 
    setIsCapturing(false);
  };
  const getStats = async (url = null, pin = null) => {
    setLoadingAction('stats');
    const start = Date.now();
    const data = await sendAction('/stats', 'GET', null, url, pin);
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
  }, [serverUrl, activePin]);

  // ─── Unconnected View ─────────────────────────────────────────
  if (!isConnected) {
    return (
      <View style={styles.baseContainer}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        
        <ScrollView contentContainerStyle={styles.scrollContentUnconnected} showsVerticalScrollIndicator={false}>
          <View style={styles.loginHeader}>
            <Ionicons name="wifi" size={56} color={COLORS.primary} style={styles.loginIcon} />
            <Text style={styles.loginTitle}>NEXUS NETWORK</Text>
            <Text style={styles.loginSubtitle}>Select a local PC to pair securely</Text>
          </View>
          
          {/* Discovered Devices */}
          <View style={styles.sectionBlock}>
             <View style={styles.sectionHeaderFlex}>
                <Text style={styles.sectionLabel}>DISCOVERED PCS</Text>
                <TouchableOpacity onPress={scanLocalNetwork} disabled={isScanning}>
                   {isScanning ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="sync" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
             </View>
             
             {discoveredDevices.length === 0 && !isScanning && (
                 <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>No Nexus PCs found on your WiFi.</Text>
                 </View>
             )}

             {discoveredDevices.map((dev, i) => {
                const isPaired = savedDevices.find(s => s.ip === dev.ip);
                return (
                  <TouchableOpacity 
                     key={i} 
                     style={styles.pcDeviceCard} 
                     onPress={() => initiateConnect(dev.ip, dev.hostname, isPaired ? isPaired.pin : null)}
                     disabled={loadingAction.includes('connecting')}
                  >
                     <View style={[styles.deviceIconBox, isPaired && {backgroundColor: COLORS.success + '22'}]}>
                        <Ionicons name={isPaired ? "checkmark-circle" : "desktop"} size={24} color={isPaired ? COLORS.success : COLORS.primary} />
                     </View>
                     <View style={styles.deviceInfo}>
                        <Text style={styles.deviceName}>{dev.hostname}</Text>
                        <Text style={styles.deviceIp}>IP: {dev.ip} {!isPaired && ' • Requires PIN'}</Text>
                     </View>
                     {loadingAction === `connecting_${dev.ip}` ? (
                         <ActivityIndicator size="small" color={COLORS.primary} />
                     ) : (
                         <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                     )}
                  </TouchableOpacity>
                )
             })}
          </View>

          {/* Saved Offline Devices */}
          {savedDevices.length > 0 && (
             <View style={styles.sectionBlock}>
                 <Text style={styles.sectionLabel}>PREVIOUSLY PAIRED (OFFLINE)</Text>
                 {savedDevices.filter(s => !discoveredDevices.find(d => d.ip === s.ip)).map((dev, i) => (
                    <TouchableOpacity 
                       key={i} 
                       style={[styles.pcDeviceCard, {opacity: 0.6}]} 
                       onPress={() => initiateConnect(dev.ip, dev.hostname, dev.pin)}
                       onLongPress={() => removeSavedDevice(dev.ip)}
                    >
                       <View style={styles.deviceIconBox}>
                          <Ionicons name="desktop-outline" size={24} color={COLORS.textSecondary} />
                       </View>
                       <View style={styles.deviceInfo}>
                          <Text style={styles.deviceName}>{dev.hostname}</Text>
                          <Text style={styles.deviceIp}>{dev.ip} • Paired</Text>
                       </View>
                    </TouchableOpacity>
                 ))}
             </View>
          )}

          {/* Fallback Manual Connection Option */}
          <View style={{ alignItems: 'center', marginTop: SPACING.lg }}>
             {!showManualInput ? (
                <TouchableOpacity onPress={() => setShowManualInput(true)}>
                   <Text style={{ color: COLORS.textSecondary, fontSize: 13, textDecorationLine: 'underline' }}>
                      Can't find your PC? Enter IP Manually
                   </Text>
                </TouchableOpacity>
             ) : (
                <View style={[styles.sectionBlock, { width: '100%', marginTop: SPACING.md }]}>
                   <Text style={styles.sectionLabel}>DIRECT IP CONNECTION</Text>
                   <View style={styles.inputWrapper}>
                      <Ionicons name="link" size={20} color={COLORS.textSecondary} />
                      <TextInput
                         style={styles.inputField}
                         placeholder="e.g. 192.168.100.236"
                         placeholderTextColor={COLORS.textSecondary}
                         value={ipAddress}
                         onChangeText={setIpAddress}
                         keyboardType="default"
                         autoCapitalize="none"
                      />
                   </View>
                   <TouchableOpacity style={styles.btnConnect} onPress={() => initiateConnect(null, "Direct PC", null)}>
                      <Text style={styles.btnConnectText}>CONNECT NOW</Text>
                   </TouchableOpacity>
                </View>
             )}
          </View>

        </ScrollView>

        {/* Pairing Code Modal */}
        <Modal visible={pairingModalOpen} transparent animationType="fade">
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
               <View style={styles.pairingBox}>
                   <View style={styles.pairingIcon}>
                       <Ionicons name="lock-closed" size={32} color={COLORS.warning} />
                   </View>
                   <Text style={styles.pairingTitle}>Pairing Required</Text>
                   <Text style={styles.pairingSub}>Enter the 4-digit PIN shown on {pairingHostname}'s Nexus Server PC Tray Icon.</Text>
                   
                   <TextInput
                      style={styles.pinInput}
                      keyboardType="number-pad"
                      maxLength={4}
                      value={inputPin}
                      onChangeText={setInputPin}
                      placeholder="• • • •"
                      placeholderTextColor={COLORS.textSecondary}
                      autoFocus
                      secureTextEntry
                   />
                   
                   <View style={styles.pairingBtnRow}>
                       <TouchableOpacity style={styles.btnCancel} onPress={() => setPairingModalOpen(false)}>
                           <Text style={styles.btnCancelText}>Cancel</Text>
                       </TouchableOpacity>
                       <TouchableOpacity style={styles.btnConfirm} onPress={handlePairingSubmit} disabled={inputPin.length !== 4 || loadingAction === 'pairing'}>
                           {loadingAction === 'pairing' ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.btnConfirmText}>Verify</Text>}
                       </TouchableOpacity>
                   </View>
               </View>
            </KeyboardAvoidingView>
        </Modal>

      </View>
    );
  }

  // ─── Connected View ──────────────────────────────────────────
  return (
    <View style={styles.baseContainer}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={styles.topNavigation}>
        <View style={styles.navLeft}>
            <View style={styles.statusIndicator} />
            <View>
              <Text style={styles.navStatusText}>SECURE CONNECTION</Text>
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
        {/* Media */}
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

        {/* Volume */}
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

        {/* Live Capture */}
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
                    <Image 
                       source={{ uri: screenshot, headers: { 'pin': activePin } }} 
                       style={styles.screenImage} 
                       resizeMode="contain" 
                       onLoad={() => setImgLoading(false)} 
                       onError={() => setImgLoading(false)} 
                    />
                 </ScrollView>
             ) : (
                 <View style={styles.screenPlaceholder}>
                    <Ionicons name="image-outline" size={32} color={COLORS.textSecondary} />
                    <Text style={styles.screenPlaceholderText}>No desktop capture yet.</Text>
                 </View>
             )}
          </View>
        </View>

        {/* Performance */}
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
                     <View style={styles.hwWidgetHeader}><Ionicons name="hardware-chip" size={16} color={COLORS.textSecondary} /><Text style={styles.hwWidgetLabel}>CPU</Text></View>
                     <Text style={styles.hwWidgetValue}>{stats.cpu_percent.toFixed(0)}%</Text>
                     <View style={styles.hwTrack}><View style={[styles.hwFill, { width: `${Math.min(100, stats.cpu_percent)}%`, backgroundColor: stats.cpu_percent > 80 ? COLORS.danger : COLORS.success }]} /></View>
                   </View>
                   <View style={styles.separatorVertical} />
                   <View style={styles.hwWidget}>
                     <View style={styles.hwWidgetHeader}><Ionicons name="server" size={16} color={COLORS.textSecondary} /><Text style={styles.hwWidgetLabel}>RAM</Text></View>
                     <Text style={styles.hwWidgetValue}>{stats.ram_percent.toFixed(0)}%</Text>
                     <View style={styles.hwTrack}><View style={[styles.hwFill, { width: `${Math.min(100, stats.ram_percent)}%`, backgroundColor: stats.ram_percent > 80 ? COLORS.danger : COLORS.primary }]} /></View>
                   </View>
                 </View>
                 <View style={styles.processesSection}>
                   <View style={styles.processesFilterRow}>
                      <Text style={styles.processesLabel}>Processes</Text>
                      <TouchableOpacity onPress={() => setShowAllProcesses(!showAllProcesses)}><Text style={styles.toggleDisplayBtn}>{showAllProcesses ? 'Show Less' : 'View Full List'}</Text></TouchableOpacity>
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
              <View style={styles.screenPlaceholder}><Ionicons name="pie-chart-outline" size={32} color={COLORS.textSecondary} /><Text style={styles.screenPlaceholderText}>Metrics unavailable. Tap sync.</Text></View>
           )}
        </View>

        <TouchableOpacity style={styles.triggerBtnDanger} onPress={() => setPowerMenuVisible(true)}>
             <Ionicons name="power" size={24} color={COLORS.danger} />
             <Text style={styles.triggerBtnTextDanger}>Power Menu</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* POWER MODAL */}
      <Modal visible={powerMenuVisible} transparent={true} animationType="slide">
         <View style={styles.sheetOverlay}>
            <TouchableOpacity style={styles.sheetCloser} activeOpacity={1} onPress={() => setPowerMenuVisible(false)} />
            <View style={styles.sheetBody}>
               <View style={styles.sheetDragHandle} />
               <Text style={styles.sheetHeadline}>PC Power Options</Text>
               <View style={styles.sheetActionGroup}>
                   <TouchableOpacity style={styles.sheetBtnWarning} onPress={() => { setPowerMenuVisible(false); handlePower('restart'); }}>
                       <Ionicons name="refresh" size={22} color={COLORS.background} />
                       <Text style={styles.sheetBtnTextDark}>Restart</Text>
                   </TouchableOpacity>
                   <TouchableOpacity style={styles.sheetBtnDanger} onPress={() => { setPowerMenuVisible(false); handlePower('shutdown'); }}>
                       <Ionicons name="power" size={22} color={COLORS.text} />
                       <Text style={styles.sheetBtnTextLight}>Shutdown</Text>
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

const styles = StyleSheet.create({
  // Global
  baseContainer: { flex: 1, backgroundColor: COLORS.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  scrollContentUnconnected: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xl * 2, gap: SPACING.lg },
  
  // Inputs
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardElevated, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  inputField: { flex: 1, color: COLORS.text, fontSize: 16, paddingVertical: Platform.OS === 'ios' ? 14 : 10, paddingLeft: SPACING.sm, fontWeight: '500' },
  btnConnect: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center' },
  btnConnectText: { color: COLORS.text, fontSize: 15, fontWeight: '800', letterSpacing: 1 },

  // Unconnected Header
  loginHeader: { alignItems: 'center', marginVertical: SPACING.xl },
  loginIcon: { marginBottom: SPACING.md },
  loginTitle: { fontSize: 32, fontWeight: '900', color: COLORS.text, letterSpacing: 2 },
  loginSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: SPACING.sm, fontWeight: '600' },
  
  // PC Blocks
  sectionBlock: { marginBottom: SPACING.xl },
  sectionHeaderFlex: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 1 },
  emptyCard: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.lg, alignItems: 'center', borderStyle: 'dashed' },
  emptyText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '500' },
  
  pcDeviceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  deviceIconBox: { width: 44, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.cardElevated, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  deviceIp: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },

  // Pairing Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: SPACING.lg },
  pairingBox: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center' },
  pairingIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.warning + '22', justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  pairingTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  pairingSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.xl, lineHeight: 20 },
  pinInput: { width: 140, height: 60, backgroundColor: COLORS.cardElevated, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.warning, color: COLORS.warning, fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: 8, marginBottom: SPACING.xl },
  pairingBtnRow: { flexDirection: 'row', gap: SPACING.md, width: '100%' },
  btnCancel: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.cardElevated, alignItems: 'center' },
  btnCancelText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 16 },
  btnConfirm: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center' },
  btnConfirmText: { color: COLORS.text, fontWeight: '800', fontSize: 16 },

  // Connected UI Components Same Logic as previous design...
  topNavigation: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.card },
  navLeft: { flexDirection: 'row', alignItems: 'center' },
  statusIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success, marginRight: SPACING.sm },
  navStatusText: { fontSize: 11, fontWeight: '800', color: COLORS.success, letterSpacing: 0.5 },
  navIpText: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  navBtnDisconnect: { backgroundColor: COLORS.cardElevated, padding: SPACING.sm, borderRadius: RADIUS.sm },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.lg },
  cardTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.lg },
  cardTitleNoMargin: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  cardHeaderFlex: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  cardHeaderBtn: { backgroundColor: COLORS.cardElevated, width: 36, height: 36, borderRadius: RADIUS.round, justifyContent: 'center', alignItems: 'center' },
  mediaCluster: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACING.xl },
  mediaBtnSecondary: { width: 54, height: 54, borderRadius: RADIUS.round, backgroundColor: COLORS.cardElevated, justifyContent: 'center', alignItems: 'center' },
  mediaBtnPrimary: { width: 72, height: 72, borderRadius: RADIUS.round, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', flexDirection: 'row' },
  volumeCluster: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  muteBtn: { width: 54, height: 54, borderRadius: RADIUS.round, backgroundColor: COLORS.cardElevated, justifyContent: 'center', alignItems: 'center' },
  volumeStepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardElevated, borderRadius: RADIUS.round, padding: SPACING.xs },
  stepBtn: { width: 48, height: 48, borderRadius: RADIUS.round, backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  volValueWrapper: { width: 64, justifyContent: 'center', alignItems: 'center' },
  volValueText: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  screenFrame: { width: '100%', aspectRatio: 16/9, backgroundColor: COLORS.background, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  screenLoaderOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  screenScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  screenImage: { width: '100%', height: '100%' },
  screenPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: SPACING.sm },
  screenPlaceholderText: { color: COLORS.textSecondary, fontSize: 13, marginTop: SPACING.sm },
  statsContainer: { marginTop: SPACING.xs },
  hwWidgets: { flexDirection: 'row', backgroundColor: COLORS.cardElevated, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg },
  separatorVertical: { width: 1, backgroundColor: COLORS.card, marginHorizontal: SPACING.md },
  hwWidget: { flex: 1 },
  hwWidgetHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  hwWidgetLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase' },
  hwWidgetValue: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginVertical: SPACING.sm },
  hwTrack: { height: 6, backgroundColor: COLORS.card, borderRadius: RADIUS.round, overflow: 'hidden' },
  hwFill: { height: '100%', borderRadius: RADIUS.round },
  processesSection: { marginTop: SPACING.xs },
  processesFilterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  processesLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  toggleDisplayBtn: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  tableHeader: { flexDirection: 'row', paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: SPACING.sm },
  thCell: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase' },
  tableBody: { gap: 0 },
  tdRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.cardElevated },
  tdCellPrimary: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  tdCellSecondary: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary },
  triggerBtnDanger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#3A1110', borderWidth: 1, borderColor: '#7A1C16', borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.sm },
  triggerBtnTextDanger: { color: COLORS.danger, fontSize: 16, fontWeight: '800' },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  sheetCloser: { flex: 1 },
  sheetBody: { backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, paddingBottom: Platform.OS === 'ios' ? 40 : SPACING.xl },
  sheetDragHandle: { width: 40, height: 4, backgroundColor: COLORS.textSecondary, borderRadius: RADIUS.round, alignSelf: 'center', marginBottom: SPACING.lg },
  sheetHeadline: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.xl, textAlign: 'center' },
  sheetActionGroup: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  sheetBtnWarning: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.warning, padding: SPACING.md, borderRadius: RADIUS.md, gap: SPACING.xs },
  sheetBtnDanger: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.danger, padding: SPACING.md, borderRadius: RADIUS.md, gap: SPACING.xs },
  sheetBtnTextDark: { fontSize: 15, fontWeight: '700', color: COLORS.background },
  sheetBtnTextLight: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  sheetBtnOutline: { borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center' },
  sheetBtnOutlineText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' }
});
