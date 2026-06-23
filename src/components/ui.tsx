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
import { colors, font, radius, space, shadow, TAP } from '../lib/theme';

export function Card({ style, ...props }: ViewProps) {
  return <View style={[styles.card, style]} {...props} />;
}

export function H1({ style, ...props }: TextProps) {
  return <Text style={[styles.h1, style]} {...props} />;
}
export function H2({ style, ...props }: TextProps) {
  return <Text style={[styles.h2, style]} {...props} />;
}
export function Body({ style, ...props }: TextProps) {
  return <Text style={[styles.body, style]} {...props} />;
}
export function Muted({ style, ...props }: TextProps) {
  return <Text style={[styles.muted, style]} {...props} />;
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
  const filled =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.danger
        : variant === 'accent'
          ? colors.accent
          : colors.card;
  const isSecondary = variant === 'secondary';
  const fg = isSecondary ? colors.primary : '#fff';
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
        { backgroundColor: filled, opacity: disabled ? 0.45 : 1 },
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
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
    >
      <Text style={[styles.chipText, { color: active ? '#fff' : colors.primaryDark }]}>
        {emoji ? `${emoji} ` : ''}
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function Badge({ label, color = colors.success }: { label: string; color?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>✓ {label}</Text>
    </View>
  );
}

export function Stars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <Text style={{ color: colors.star, fontSize: font.sm, fontWeight: '800' }}>
      ★ {rating.toFixed(1)}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  h1: { fontSize: font.xxl, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  h2: { fontSize: font.lg, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  body: { fontSize: font.md, color: colors.text, lineHeight: font.md * 1.45 },
  muted: { fontSize: font.sm, color: colors.textMuted, lineHeight: font.sm * 1.4 },
  btn: {
    minHeight: TAP,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  btnSecondary: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.card,
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
  },
  chipIdle: { backgroundColor: colors.chipBg },
  chipActive: { backgroundColor: colors.primary, ...shadow.sm },
  chipText: { fontSize: font.sm, fontWeight: '700' },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { color: '#fff', fontSize: font.xs, fontWeight: '800' },
});
