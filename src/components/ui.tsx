import React from 'react';
import {
  Linking,
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
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { family, radius, shadow, tracking, tokensFor } from '../lib/theme';
import { useTokens, ScreenTokens } from '../lib/useTokens';
import { useTheme } from '../context/ThemeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// OS accessibility text scaling multiplies on top of easy view's 1.15, and an
// elder with the system slider at max would otherwise push a button label past
// its container. 1.3 keeps large-text users served without breaking rows.
const MAX_FONT_SCALE = 1.3;

// ---------------------------------------------------------------------------
// Dialling
//
// `Linking.openURL('tel:…')` rejects on web (and on tablets with no dialler).
// An unhandled rejection makes the SOS button look dead, which is the worst
// possible failure for this audience. Every dial path goes through `useDialer`
// so a failure surfaces the number as large selectable text instead.
// ---------------------------------------------------------------------------

export function telDigits(number?: string | null) {
  return String(number ?? '').replace(/[^\d+]/g, '');
}

export function useDialer() {
  const [failedNumber, setFailedNumber] = React.useState<string | null>(null);

  const dial = React.useCallback((number?: string | null) => {
    const digits = telDigits(number);
    if (!digits) return;
    // openURL returns a promise on native and (on web) may throw synchronously.
    Promise.resolve()
      .then(() => Linking.openURL(`tel:${digits}`))
      .catch(() => setFailedNumber(String(number)));
  }, []);

  const clearFailedNumber = React.useCallback(() => setFailedNumber(null), []);

  return { dial, failedNumber, clearFailedNumber };
}

// Shown when the dialler could not be opened: the number stays on screen, big
// and selectable, so it can be read aloud or copied into the phone app.
export function DialFallbackDialog({ number, onClose }: { number: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const tk = useTokens();
  const styles = useUiStyles();
  return (
    <Dialog
      visible={Boolean(number)}
      onClose={onClose}
      title={t('dialer.failedTitle', { defaultValue: 'Could not open the phone app' })}
    >
      <Body style={{ marginBottom: tk.space.md }}>
        {t('dialer.failedBody', { defaultValue: 'Please dial this number on your phone:' })}
      </Body>
      <Text selectable style={[styles.dialNumber, { color: colors.text }]}>
        {number ?? ''}
      </Text>
      <Button label={t('common.close')} onPress={onClose} />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Server error copy
//
// The API answers in English only. Screens must never print those strings to a
// Hindi reader, so known messages map onto translated copy and anything
// unrecognised falls back to one generic, translated line.
// ---------------------------------------------------------------------------

const SERVER_ERROR_KEYS: Array<[RegExp, string, string]> = [
  [/could not reach|not running|network|timed? out|failed to fetch/i, 'errors.network', 'We could not reach the internet. Check your connection and try again.'],
  [/already have your request/i, 'errors.callbackDuplicate', 'We already have your request. Our team will call you back soon.'],
  [/too many sign-?in attempts/i, 'errors.tooManySignIn', 'Too many sign-in tries. Please wait a few minutes.'],
  [/too many codes/i, 'errors.otpDailyLimit', 'Too many codes today. Please try again tomorrow.'],
  [/code already sent/i, 'errors.otpAlreadySent', 'A code was just sent. Please wait a minute before asking again.'],
  [/too many wrong tries/i, 'errors.otpTooManyWrong', 'Too many wrong tries. Please ask for a new code.'],
  [/code expired/i, 'errors.otpExpired', 'That code has expired. Please ask for a new one.'],
  [/code is not right/i, 'errors.otpWrong', 'That code is not right. Please check and try again.'],
  [/whatsapp sign-?in is not set up/i, 'errors.otpUnavailable', 'Sign-in by WhatsApp is not ready yet. Please use your username and password.'],
  [/too many/i, 'errors.tooMany', 'Too many tries. Please wait a few minutes and try again.'],
  [/invalid (username|phone number) or password/i, 'errors.badCredentials', 'That username or password is not correct.'],
  [/already registered/i, 'errors.phoneTaken', 'That phone number already has an account. Please sign in instead.'],
  [/password with at least/i, 'errors.passwordShort', 'Please use a password of at least 6 letters or numbers.'],
  [/enter your username|username must be at least|username is too long/i, 'errors.usernameInvalid', 'Please check your username and try again.'],
  [/enter (your|a valid) phone number/i, 'errors.phoneInvalid', 'Please enter a valid phone number.'],
  [/enter your username or phone/i, 'errors.identifierRequired', 'Please enter your username or phone number.'],
  [/add a name and phone/i, 'errors.callbackFieldsRequired', 'Please fill in your name and phone number.'],
  [/add a valid phone/i, 'errors.phoneInvalid', 'Please enter a valid phone number.'],
  [/add a title and message/i, 'errors.postFieldsRequired', 'Please fill in both the title and the message.'],
  [/under 200 characters/i, 'errors.titleTooLong', 'Please make the title shorter.'],
  [/under 4000 characters/i, 'errors.bodyTooLong', 'Please make the message shorter.'],
  [/enter the 6-digit code/i, 'errors.otpLength', 'Please enter the 6-digit code.'],
];

// Dates follow the in-app language toggle, not the device locale: passing
// `undefined` to toLocaleDateString reads the OS setting, so a phone in English
// printed English dates inside a fully Hindi screen. India region throughout.
export function dateLocale(lang: string | null | undefined) {
  return `${lang || 'en'}-IN`;
}

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export function localizedServerError(raw: string | null | undefined, t: Translate) {
  const generic = t('errors.generic', { defaultValue: 'Something went wrong. Please try again.' });
  const message = String(raw ?? '').trim();
  if (!message) return generic;
  const match = SERVER_ERROR_KEYS.find(([pattern]) => pattern.test(message));
  return match ? t(match[1], { defaultValue: match[2] }) : generic;
}

// Shared entrance timings: ease-out, state-conveying, honors reduced motion.
const scrimIn = FadeIn.duration(160).reduceMotion(ReduceMotion.System);
const sheetIn = SlideInDown.duration(320)
  .easing(Easing.out(Easing.exp))
  .reduceMotion(ReduceMotion.System);
const dialogIn = FadeInDown.duration(200)
  .easing(Easing.out(Easing.cubic))
  .reduceMotion(ReduceMotion.System);

// Quiet surface tile (Uber pattern): gray fill, no border, no shadow.
export function Card({ style, ...props }: ViewProps) {
  const { colors } = useTheme();
  const styles = useUiStyles();
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
  const styles = useUiStyles();
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.h1, { color: colors.text }, style]} {...props} />
  );
}

export function H2({ style, ...props }: TextProps) {
  const { colors } = useTheme();
  const styles = useUiStyles();
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.h2, { color: colors.text }, style]} {...props} />
  );
}

export function Body({ style, ...props }: TextProps) {
  const { colors } = useTheme();
  const styles = useUiStyles();
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.body, { color: colors.text }, style]} {...props} />
  );
}

export function Muted({ style, ...props }: TextProps) {
  const { colors } = useTheme();
  const styles = useUiStyles();
  return (
    <Text
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[styles.muted, { color: colors.textMuted }, style]}
      {...props}
    />
  );
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
  const styles = useUiStyles();
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
          {typeof icon === 'string' ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.btnText, { color: fg }]}>
              {icon}
            </Text>
          ) : (
            icon
          )}
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.btnText, { color: fg }]}>
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function Chip({
  label,
  emoji,
  count,
  active,
  onPress,
}: {
  label: string;
  emoji?: string;
  count?: number;
  active?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useUiStyles();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.95, { damping: 20, stiffness: 300, reduceMotion: ReduceMotion.System });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 20, stiffness: 300, reduceMotion: ReduceMotion.System });
      }}
      style={[
        styles.chip,
        pressStyle,
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
      {typeof count === 'number' ? (
        <Text
          style={[
            styles.chipCount,
            { color: active ? colors.primaryFg : colors.textMuted, opacity: active ? 0.75 : 1 },
          ]}
        >
          {count}
        </Text>
      ) : null}
    </AnimatedPressable>
  );
}

function contrastText(background: string) {
  const hex = background.startsWith('#') ? background.slice(1) : null;
  if (!hex || (hex.length !== 3 && hex.length !== 6)) return '#fff';
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? '#111' : '#fff';
}

export function Badge({ label, color }: { label: string; color?: string }) {
  const { colors } = useTheme();
  const styles = useUiStyles();
  return (
    <View style={[styles.badge, { backgroundColor: color ?? colors.successSoft, borderColor: colors.border }]}>
      <Text style={[styles.badgeText, { color: color ? contrastText(color) : colors.success }]}>{label}</Text>
    </View>
  );
}

export function Stars({ rating }: { rating: number | null }) {
  const { colors } = useTheme();
  const tk = useTokens();
  if (!rating) return null;
  return (
    <Text style={{ color: colors.star, fontFamily: family.medium, fontSize: tk.font.sm }}>
      {rating.toFixed(1)}/5
    </Text>
  );
}

function ModalHeading({ title }: { title?: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useUiStyles();
  if (!title) return null;
  return typeof title === 'string' ? (
    <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
  ) : (
    <View style={styles.modalTitleNode}>{title}</View>
  );
}

// Explicit exit for sheets. The drag handle and the scrim are invisible affordances
// to an elder — a labelled, TAP-sized X is the one that gets found.
function SheetCloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useUiStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.close')}
      onPress={onClose}
      hitSlop={8}
      style={({ pressed }) => [
        styles.sheetClose,
        { backgroundColor: colors.surfaceTint, borderColor: colors.border },
        pressed ? { opacity: 0.7 } : null,
      ]}
    >
      <Feather name="x" size={22} color={colors.text} />
      <Text style={[styles.sheetCloseLabel, { color: colors.text }]}>{t('common.close')}</Text>
    </Pressable>
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
  const { colors, mode } = useTheme();
  const { isSimple } = useTokens();
  const styles = useUiStyles();
  const { height } = useWindowDimensions();
  return (
    <RNModal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Animated.View entering={isSimple ? undefined : scrimIn} style={styles.modalScrim}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View entering={isSimple ? undefined : sheetIn} style={[styles.sheetShell, { borderColor: colors.glassBorder, maxHeight: height * 0.88 }]}>
          <BlurView
            intensity={22}
            tint={mode}
            experimentalBlurMethod="dimezisBlurView"
            style={[styles.sheetPanel, { backgroundColor: colors.panelGlass }]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={styles.sheetHandleTap}
            >
              <View style={[styles.sheetHandle, { backgroundColor: colors.handle }]} />
            </Pressable>
            <View style={styles.sheetTopRow}>
              <View style={styles.sheetTopHeading}>
                <ModalHeading title={title} />
              </View>
              <SheetCloseButton onClose={onClose} />
            </View>
            {children}
          </BlurView>
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
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors, mode } = useTheme();
  const { isSimple } = useTokens();
  const styles = useUiStyles();
  const { width } = useWindowDimensions();
  return (
    <RNModal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.dialogRoot}>
        <Animated.View entering={isSimple ? undefined : scrimIn} style={styles.modalScrim}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View
          entering={isSimple ? undefined : dialogIn}
          style={[styles.dialogShell, { borderColor: colors.glassBorder, width: Math.min(width - 32, 440) }]}
        >
          <BlurView
            intensity={22}
            tint={mode}
            experimentalBlurMethod="dimezisBlurView"
            style={[styles.dialogPanel, { backgroundColor: colors.panelGlass }]}
          >
            <ModalHeading title={title} />
            {children}
          </BlurView>
        </Animated.View>
      </View>
    </RNModal>
  );
}

function makeUiStyles(tk: ScreenTokens) {
  const { font, space } = tk;
  return StyleSheet.create({
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
      minHeight: tk.TAP,
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
      // Chips sit below the TAP floor by design (they are filters in a scroll
      // rail, not primary actions); easy view lifts them to the floor.
      minHeight: tk.isSimple ? 56 : 48,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      marginRight: space.sm,
      flexShrink: 0,
      borderWidth: 1,
    },
    chipText: { fontFamily: family.medium, fontSize: font.sm },
    chipCount: { fontFamily: family.regular, fontSize: font.xs },
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
    // Shell clips the blur to the radius; panel carries the translucent fill.
    sheetShell: {
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      overflow: 'hidden',
      ...shadow.md,
    },
    sheetPanel: {
      flexShrink: 1,
      paddingHorizontal: space.lg,
      paddingBottom: space.xl,
    },
    // 44px+ grab zone around the visual handle so elders can tap-to-close.
    sheetHandleTap: { minHeight: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
    sheetHandle: { width: 48, height: 5, borderRadius: 999 },
    sheetTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
    sheetTopHeading: { flex: 1, minWidth: 0, justifyContent: 'center' },
    sheetClose: {
      minHeight: tk.TAP,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      marginBottom: space.md,
      flexShrink: 0,
    },
    sheetCloseLabel: { fontFamily: family.semibold, fontSize: font.sm },
    dialNumber: {
      fontFamily: family.heavy,
      fontSize: font.xxl,
      lineHeight: font.xxl * 1.2,
      letterSpacing: tracking.display,
      textAlign: 'center',
      marginBottom: space.lg,
    },
    dialogRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
    dialogShell: {
      borderRadius: radius.xl,
      borderWidth: 1,
      overflow: 'hidden',
      ...shadow.md,
    },
    dialogPanel: { padding: space.lg },
    modalTitle: { fontFamily: family.semibold, fontSize: font.lg, lineHeight: 28, marginBottom: space.md },
    modalTitleNode: { marginBottom: space.md },
  });
}

// Only two sheets can ever exist, so both are built once at module load. Doing
// this per render would allocate a new StyleSheet on every keystroke in a chat.
const normalUiStyles = makeUiStyles({ ...tokensFor(false), isSimple: false });
const simpleUiStyles = makeUiStyles({ ...tokensFor(true), isSimple: true });

function useUiStyles() {
  const { isSimple } = useTokens();
  return isSimple ? simpleUiStyles : normalUiStyles;
}
