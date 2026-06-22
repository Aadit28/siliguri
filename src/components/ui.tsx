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
import { colors, font, radius, space, TAP } from '../lib/theme';

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
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
}) {
  const bg =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : colors.card;
  const fg = variant === 'secondary' ? colors.primary : '#fff';
  const border = variant === 'secondary' ? colors.primary : 'transparent';
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.btn,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : 1 },
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
      style={[
        styles.chip,
        { backgroundColor: active ? colors.primary : colors.chipBg },
      ]}
    >
      <Text
        style={[styles.chipText, { color: active ? '#fff' : colors.primaryDark }]}
      >
        {emoji ? `${emoji} ` : ''}
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function Badge({ label, color = colors.accent }: { label: string; color?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>✓ {label}</Text>
    </View>
  );
}

export function Stars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <Text style={{ color: colors.star, fontSize: font.sm, fontWeight: '700' }}>
      ★ {rating.toFixed(1)}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  h1: { fontSize: font.xxl, fontWeight: '800', color: colors.text },
  h2: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  body: { fontSize: font.md, color: colors.text, lineHeight: font.md * 1.4 },
  muted: { fontSize: font.sm, color: colors.textMuted },
  btn: {
    minHeight: TAP,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderWidth: 2,
  },
  btnText: { fontSize: font.md, fontWeight: '700' },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.sm,
  },
  chipText: { fontSize: font.sm, fontWeight: '700' },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { color: '#fff', fontSize: font.xs, fontWeight: '700' },
});
