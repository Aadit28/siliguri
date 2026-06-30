import React from 'react';
import {
  Text,
  TextProps,
  TouchableOpacity,
  View,
  ViewProps,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { font, radius, space, shadow, TAP } from '../lib/theme';
import { useTheme } from '../context/ThemeContext';

export function Card({ style, ...props }: ViewProps) {
  const { colors, mode } = useTheme();
  return (
    <BlurView
      intensity={mode === 'dark' ? 58 : 42}
      tint={mode === 'dark' ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.glassBorder,
        },
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
  icon?: string;
}) {
  const { colors, isDark } = useTheme();
  const isSecondary = variant === 'secondary';
  const filled =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.danger
        : variant === 'accent'
          ? colors.accent
          : colors.card;
  const fg = isSecondary ? colors.primaryDark : isDark ? colors.textOnDark : '#fff';

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.btn,
        isSecondary ? styles.btnSecondary : shadow.sm,
        {
          backgroundColor: filled,
          borderColor: isSecondary ? colors.border : 'transparent',
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.btnText, { color: fg }]}>
          {icon ? `${icon}  ` : ''}
          {label}
        </Text>
      )}
    </TouchableOpacity>
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
  const { colors, isDark } = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.chipBg,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? (isDark ? colors.textOnDark : '#fff') : colors.primaryDark }]}>
        {emoji ? `${emoji} ` : ''}
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function Badge({ label, color }: { label: string; color?: string }) {
  const { colors, isDark } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: color ?? colors.success }]}>
      <Text style={[styles.badgeText, { color: isDark ? colors.textOnDark : '#fff' }]}>
        ✓ {label}
      </Text>
    </View>
  );
}

export function Stars({ rating }: { rating: number | null }) {
  const { colors } = useTheme();
  if (!rating) return null;
  return (
    <Text style={{ color: colors.star, fontSize: font.sm, fontWeight: '800' }}>
      ★ {rating.toFixed(1)}
    </Text>
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
  h1: { fontSize: font.xxl, fontWeight: '800' },
  h2: { fontSize: font.lg, fontWeight: '800' },
  body: { fontSize: font.md, lineHeight: font.md * 1.45 },
  muted: { fontSize: font.sm, lineHeight: font.sm * 1.4 },
  btn: {
    minHeight: TAP,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderWidth: 1,
  },
  btnSecondary: {
    borderWidth: 1,
  },
  btnText: { fontSize: font.md, fontWeight: '800' },
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
  chipText: { fontSize: font.sm, fontWeight: '700' },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: font.xs, fontWeight: '800' },
});
