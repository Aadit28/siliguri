import React from 'react';
import {
  Text,
  TextProps,
  TouchableOpacity,
  View,
  ViewProps,
  StyleSheet,
  ActivityIndicator,
  Modal as RNModal,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { family, font, radius, space, shadow, TAP, tracking } from '../lib/theme';
import { useTheme } from '../context/ThemeContext';

// Quiet surface tile (Uber pattern): gray fill, no border, no shadow.
export function Card({ style, ...props }: ViewProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bgAlt,
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
  icon?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const isSecondary = variant === 'secondary';
  const filled =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.emergency
        : variant === 'accent'
          ? colors.accent
          : colors.cardStrong;
  const fg = isSecondary
    ? colors.text
    : variant === 'danger'
      ? '#FFFFFF'
      : variant === 'accent'
        ? colors.accentFg
        : colors.primaryFg;

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
          borderColor: isSecondary ? colors.border : filled,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnContent}>
          {typeof icon === 'string' ? <Text style={[styles.btnText, { color: fg }]}>{icon}</Text> : icon}
          <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
        </View>
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
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.cardStrong,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? colors.primaryFg : colors.text }]}>
        {emoji ? `${emoji} ` : ''}
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function Badge({ label, color }: { label: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: color ?? colors.successSoft, borderColor: colors.border }]}>
      <Text style={[styles.badgeText, { color: color ? '#fff' : colors.success }]}>{label}</Text>
    </View>
  );
}

export function Stars({ rating }: { rating: number | null }) {
  const { colors } = useTheme();
  if (!rating) return null;
  return (
    <Text style={{ color: colors.star, fontFamily: family.medium, fontSize: font.sm }}>
      {rating.toFixed(1)}/5
    </Text>
  );
}

function ModalHeading({ title }: { title?: React.ReactNode }) {
  const { colors } = useTheme();
  if (!title) return null;
  return typeof title === 'string' ? (
    <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
  ) : (
    <View style={styles.modalTitleNode}>{title}</View>
  );
}

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.modalScrim} />
        <View style={[styles.sheetPanel, { backgroundColor: colors.cardSolid, borderColor: colors.border, maxHeight: height * 0.88 }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.handle }]} />
          <ModalHeading title={title} />
          {children}
        </View>
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
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dialogRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.modalScrim} />
        <View style={[styles.dialogPanel, { backgroundColor: colors.cardSolid, borderColor: colors.border, width: Math.min(width - 32, 440) }]}>
          <ModalHeading title={title} />
          {children}
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 0,
    overflow: 'hidden',
  },
  h1: { fontFamily: family.semibold, fontSize: font.xxl, lineHeight: font.xxl * 1.13, letterSpacing: tracking.display },
  h2: { fontFamily: family.semibold, fontSize: font.lg, lineHeight: font.lg * 1.2, letterSpacing: tracking.lg },
  body: { fontFamily: family.regular, fontSize: font.md, lineHeight: font.md * 1.5 },
  muted: { fontFamily: family.regular, fontSize: font.sm, lineHeight: font.sm * 1.5 },
  btn: {
    minHeight: TAP,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderWidth: 1,
  },
  btnSecondary: {
    borderWidth: 1,
    ...shadow.sm,
  },
  btnText: { fontFamily: family.medium, fontSize: font.md },
  btnContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  chip: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.sm,
    flexShrink: 0,
    borderWidth: 1,
  },
  chipText: { fontFamily: family.medium, fontSize: font.sm },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeText: { fontFamily: family.medium, fontSize: font.xs },
  modalScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.52)' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetPanel: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
  },
  sheetHandle: { width: 42, height: 5, borderRadius: 999, alignSelf: 'center', marginTop: space.sm, marginBottom: space.md },
  dialogRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
  dialogPanel: { borderRadius: radius.xl, borderWidth: 1, padding: space.lg, ...shadow.md },
  modalTitle: { fontFamily: family.semibold, fontSize: font.lg, lineHeight: 28, marginBottom: space.md },
  modalTitleNode: { marginBottom: space.md },
});
