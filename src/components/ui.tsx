import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal as RNModal,
  Pressable,
  StyleSheet,
  Text,
  TextProps,
  useWindowDimensions,
  View,
  ViewProps,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { family, font, motion, radius, shadow, space, TAP, tracking } from '../lib/theme';
import { useTheme } from '../context/ThemeContext';

const EASE_OUT_QUINT = Easing.bezier(...motion.easeOutQuint);
const EASE_OUT_QUART = Easing.bezier(...motion.easeOutQuart);
const EASE_IN_QUINT = Easing.bezier(...motion.easeInQuint);

export function Card({ style, ...props }: ViewProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}
      {...props}
    />
  );
}

export function H1({ style, ...props }: TextProps) {
  const { colors } = useTheme();
  return <Text style={[styles.h1, { color: colors.text }, style]} {...props} />;
}

export function H2({ style, ...props }: TextProps) {
  const { colors } = useTheme();
  return <Text style={[styles.h2, { color: colors.text }, style]} {...props} />;
}

export function Body({ style, ...props }: TextProps) {
  const { colors } = useTheme();
  return <Text style={[styles.body, { color: colors.text }, style]} {...props} />;
}

export function Muted({ style, ...props }: TextProps) {
  const { colors } = useTheme();
  return <Text style={[styles.muted, { color: colors.textMuted }, style]} {...props} />;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'accent' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const { colors, mode } = useTheme();
  const isSecondary = variant === 'secondary';
  const fill =
    variant === 'primary'
      ? colors.primary
      : variant === 'accent'
        ? colors.accent
        : variant === 'danger'
          ? colors.danger
          : 'transparent';
  const pressedFill =
    variant === 'primary'
      ? colors.primaryDark
      : variant === 'accent'
        ? colors.accentDark
        : variant === 'danger'
          ? colors.dangerDark
          : colors.overlay;
  const fg =
    variant === 'primary'
      ? colors.primaryFg
      : variant === 'accent'
        ? colors.accentFg
        : variant === 'danger'
          ? colors.dangerFg
          : colors.primaryDark;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        isSecondary
          ? [styles.btnSecondary, { borderColor: colors.glassBorder }]
          : mode === 'light'
            ? shadow.sm
            : null,
        {
          backgroundColor: pressed ? pressedFill : fill,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed && !isSecondary ? 0.98 : 1 }],
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnContent}>
          {icon}
          <Text style={[isSecondary ? styles.btnTextSecondary : styles.btnText, { color: fg }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  emoji,
  active,
  onPress,
}: {
  label: string;
  emoji?: string;
  active?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.accent : pressed ? colors.cardStrong : colors.chipBg,
          borderColor: active ? colors.accent : colors.border,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? colors.accentFg : colors.text }]}>
        {emoji ? `${emoji} ` : ''}
        {label}
      </Text>
    </Pressable>
  );
}

export function Badge({ label, color }: { label: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: color ?? colors.success }]}>
      <Feather name="check" size={14} color={colors.successFg} />
      <Text style={[styles.badgeText, { color: colors.successFg }]}>{label}</Text>
    </View>
  );
}

export function Stars({ rating }: { rating: number | null }) {
  const { colors } = useTheme();
  if (!rating) return null;
  return (
    <View style={styles.starsRow}>
      <Feather name="star" size={16} color={colors.star} />
      <Text style={{ color: colors.star, fontSize: font.sm, fontFamily: family.bold }}>
        {rating.toFixed(1)}
      </Text>
    </View>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduced(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

// Drives enter/exit for modals: progress 0..1, keeps the RN Modal mounted
// until the exit animation finishes. Reduced motion collapses to a 120ms fade.
function useModalTransition(
  visible: boolean,
  durIn: number,
  durOut: number,
  easeIn: ReturnType<typeof Easing.bezier>,
  easeOut: ReturnType<typeof Easing.bezier>,
) {
  const reduced = useReducedMotion();
  const [rendered, setRendered] = useState(visible);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      progress.value = withTiming(1, {
        duration: reduced ? motion.dur.press : durIn,
        easing: reduced ? Easing.linear : easeIn,
      });
    } else {
      progress.value = withTiming(
        0,
        {
          duration: reduced ? motion.dur.press : durOut,
          easing: reduced ? Easing.linear : easeOut,
        },
        (finished) => {
          if (finished) runOnJS(setRendered)(false);
        },
      );
    }
  }, [visible, reduced, durIn, durOut, easeIn, easeOut, progress]);

  return { reduced, rendered, progress };
}

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { reduced, rendered, progress } = useModalTransition(
    visible,
    motion.dur.sheetIn,
    motion.dur.sheetOut,
    EASE_OUT_QUINT,
    EASE_IN_QUINT,
  );
  const panelHeight = useSharedValue(screenHeight);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => {
    if (reduced) {
      return { opacity: progress.value, transform: [{ translateY: 0 }] };
    }
    return {
      opacity: 1,
      transform: [{ translateY: (1 - progress.value) * panelHeight.value }],
    };
  });

  if (!rendered) return null;

  return (
    <RNModal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, backdropStyle]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View
          onLayout={(e) => {
            panelHeight.value = e.nativeEvent.layout.height;
          }}
          style={[
            styles.sheetPanel,
            {
              backgroundColor: colors.cardSolid,
              maxHeight: screenHeight * 0.88,
              paddingBottom: space.lg + insets.bottom,
            },
            mode === 'light'
              ? shadow.sheet
              : { borderWidth: 1, borderBottomWidth: 0, borderColor: colors.glassBorder },
            panelStyle,
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: colors.handle }]} />
          {title ? <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text> : null}
          {children}
        </Animated.View>
      </View>
    </RNModal>
  );
}

export function Dialog({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const { colors, mode } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { reduced, rendered, progress } = useModalTransition(
    visible,
    motion.dur.dialogIn,
    motion.dur.dialogOut,
    EASE_OUT_QUART,
    EASE_IN_QUINT,
  );

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => {
    if (reduced) {
      return { opacity: progress.value, transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    return {
      opacity: progress.value,
      transform: [
        { translateY: (1 - progress.value) * 6 },
        { scale: 0.97 + progress.value * 0.03 },
      ],
    };
  });

  if (!rendered) return null;

  return (
    <RNModal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.dialogRoot}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, backdropStyle]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.dialogPanel,
            { backgroundColor: colors.cardSolid, width: Math.min(screenWidth - 48, 400) },
            mode === 'light' ? shadow.md : { borderWidth: 1, borderColor: colors.glassBorder },
            panelStyle,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={styles.dialogClose}
          >
            <Feather name="x" size={24} color={colors.textMuted} />
          </Pressable>
          {title ? (
            <Text style={[styles.modalTitle, styles.dialogTitle, { color: colors.text }]}>
              {title}
            </Text>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow.sm,
  },
  h1: {
    fontSize: font.xxl,
    fontFamily: family.bold,
    letterSpacing: tracking.xxl,
    lineHeight: Math.round(font.xxl * 1.2),
  },
  h2: {
    fontSize: font.lg,
    fontFamily: family.bold,
    letterSpacing: tracking.lg,
    lineHeight: Math.round(font.lg * 1.3),
  },
  body: {
    fontSize: font.md,
    fontFamily: family.regular,
    lineHeight: Math.round(font.md * 1.5),
  },
  muted: {
    fontSize: font.sm,
    fontFamily: family.regular,
    lineHeight: Math.round(font.sm * 1.45),
  },
  btn: {
    minHeight: TAP,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  btnSecondary: {
    borderWidth: 1.5,
  },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  btnText: { fontSize: font.md, fontFamily: family.bold },
  btnTextSecondary: { fontSize: font.md, fontFamily: family.semibold },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.sm,
    flexShrink: 0,
    borderWidth: 1,
  },
  chipText: { fontSize: font.sm, fontFamily: family.semibold },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: 10,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: font.xs, fontFamily: family.bold },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetPanel: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  modalTitle: {
    fontSize: font.lg,
    fontFamily: family.bold,
    letterSpacing: tracking.lg,
    lineHeight: Math.round(font.lg * 1.3),
    marginBottom: space.sm,
  },
  dialogRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dialogPanel: {
    borderRadius: radius.lg,
    padding: space.lg,
  },
  dialogClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  dialogTitle: { paddingRight: 44 },
});
