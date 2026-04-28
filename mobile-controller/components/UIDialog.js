import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Basic colors to fallback if not provided by App
const C = {
  primary: "#4F8EF7",
  primaryDim: "rgba(79, 142, 247, 0.15)",
  bg: "#121212",
  elevated: "#141418",
  border: "#FFFFFF0D",
  text: "#FFFFFF",
  textDim: "#AAAAAA",
  danger: "#FF453A",
  warning: "#FF9F0A",
  success: "#32D74B",
};

const SP = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

const SpinningIcon = ({ name, size, color, spinning }) => {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (spinning) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinValue.stopAnimation();
    }
  }, [spinning]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
};

export const UIDialog = ({
  visible = false,
  title = "",
  message = "",
  type = "alert", // "alert", "confirm", "progress"
  progress = 0,
  icon = null,
  iconColor = null,
  iconBg = null,
  spinning = null,
  children = null,
  buttons = [],
  cancelable = true,
  onClose = () => {},
}) => {
  const [mounted, setMounted] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  // Derive buttons from provided prop or use defaults
  const renderButtons =
    type === "alert" && buttons.length === 0
      ? [{ text: "OK", onPress: onClose }]
      : buttons;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 9,
          tension: 130,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.95,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  if (!mounted && !visible) return null;

  return (
    <Modal
      transparent
      visible={mounted || visible}
      animationType="none"
      onRequestClose={() => cancelable && onClose()}
    >
      <KeyboardAvoidingView
        style={[
          StyleSheet.absoluteFillObject,
          {
            justifyContent: "center",
            alignItems: "center",
            padding: SP.md,
            zIndex: 99999,
          },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: "rgba(0,0,0,0.65)", opacity },
          ]}
          pointerEvents={cancelable ? "auto" : "none"}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => {
              Keyboard.dismiss();
              if (cancelable) onClose();
            }}
          />
        </Animated.View>

        <Animated.View
          style={[s.uiDialogBox, { opacity, transform: [{ scale }] }]}
          pointerEvents="box-none"
        >
          <View style={s.uiDialogContentWrapper}>
            {(type === "progress" || icon) && (
              <View style={{ alignItems: "center", marginBottom: SP.md }}>
                <View
                  style={[
                    s.uiDialogIconCircle,
                    { backgroundColor: iconBg || C.primaryDim },
                  ]}
                >
                  <SpinningIcon
                    name={icon || "cloud-upload-outline"}
                    size={26}
                    color={iconColor || C.primary}
                    spinning={spinning !== null ? spinning : type === "progress"}
                  />
                </View>
              </View>
            )}

            {!!title && (
              <Text
                style={[
                  s.uiDialogTitle,
                  type === "progress" && { marginBottom: SP.xs },
                ]}
              >
                {title}
              </Text>
            )}
            {!!message && <Text style={s.uiDialogMessage}>{message}</Text>}

            {children}

            {type === "progress" && (
              <View style={s.uiDialogProgressWrapper}>
                <View style={s.uiDialogProgressTrack}>
                  <Animated.View
                    style={[
                      s.uiDialogProgressFill,
                      {
                        width: Math.min(100, Math.max(0, progress)) + "%",
                        backgroundColor: C.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={s.uiDialogProgressText}>
                  {progress.toFixed(1)}%
                </Text>
              </View>
            )}
          </View>

          {renderButtons.length > 0 && (
            <View
              style={[
                s.uiDialogBtnRow,
                renderButtons.length > 2 && { flexDirection: "column" },
              ]}
            >
              {renderButtons.map((btn, idx) => {
                const isVertical = renderButtons.length > 2;
                return (
                  <TouchableOpacity
                    key={idx}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (btn.onPress) btn.onPress();
                      if (btn.shouldClose !== false) onClose();
                    }}
                    style={[
                      s.uiDialogBtn,
                      {
                        borderLeftWidth: !isVertical && idx > 0 ? 1 : 0,
                        borderColor: C.border,
                        flex: isVertical ? 0 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.uiDialogBtnText,
                        (!btn.style || btn.style === "default") && {
                          color: C.text,
                          fontWeight: "500",
                        },
                        btn.style === "cancel" && {
                          color: C.textDim,
                          fontWeight: "400",
                        },
                        btn.style === "destructive" && {
                          color: C.danger,
                          fontWeight: "600",
                        },
                        btn.style === "primary" && {
                          color: C.primary,
                          fontWeight: "600",
                        },
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const s = StyleSheet.create({
  uiDialogBox: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  uiDialogContentWrapper: {
    padding: SP.md,
    alignItems: "center",
  },
  uiDialogIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  uiDialogTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: SP.sm,
  },
  uiDialogMessage: {
    color: C.textDim,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: SP.sm,
    lineHeight: 20,
    marginBottom: SP.sm,
  },
  uiDialogProgressWrapper: {
    width: "100%",
    marginTop: SP.md,
  },
  uiDialogProgressTrack: {
    width: "100%",
    height: 6,
    backgroundColor: C.border,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: SP.xs,
  },
  uiDialogProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  uiDialogProgressText: {
    color: C.textDim,
    fontSize: 12,
    textAlign: "center",
    fontWeight: "500",
  },
  uiDialogBtnRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: C.border,
  },
  uiDialogBtn: {
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  uiDialogBtnText: {
    fontSize: 16,
  },
});

export default UIDialog;
