import React, { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Body, Button, Card, H1, H2, Muted } from '../src/components/ui';
import CityPicker from '../src/components/CityPicker';
import { AppColors, family, radius, Tokens, tracking } from '../src/lib/theme';
import { useTokens } from '../src/lib/useTokens';
import { useSignOutConfirm } from '../src/lib/useSignOutConfirm';
import { useAuth } from '../src/context/AuthContext';
import { useCity } from '../src/context/CityContext';
import { useDisplayMode } from '../src/context/DisplayModeContext';
import { useLocale } from '../src/context/LocaleContext';
import { useSimpleMode } from '../src/context/SimpleModeContext';
import { useTheme } from '../src/context/ThemeContext';

/**
 * One screen for everything about "me": who is signed in, the settings that
 * were previously scattered across the header and the SOS tab, and the way out.
 *
 * Every setting is a full-width row with its current value spelled out in
 * words above the action, because an elder reading a bare switch cannot tell
 * which side is on.
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, isDark, toggleTheme } = useTheme();
  const tk = useTokens();
  const styles = useMemo(() => makeStyles(colors, tk), [colors, tk]);

  const { user, displayName } = useAuth();
  const { lang, toggle: toggleLanguage } = useLocale();
  const { isSimple, toggleSimple } = useSimpleMode();
  const { isComputerMode, toggleDisplayMode } = useDisplayMode();
  const { city } = useCity();
  const { armed: signOutArmed, confirmSignOut } = useSignOutConfirm();

  const phone = user?.user_metadata?.phone_number || '';
  const username = user?.user_metadata?.username || '';
  const initial = (displayName || username).trim().charAt(0).toUpperCase();

  // Switch-role control. The label always states the action the tap performs,
  // and accessibilityState carries the current setting for a screen reader.
  const settingToggle = (
    key: string,
    checked: boolean,
    label: string,
    onPress: () => void,
    role: 'switch' | 'button' = 'switch',
  ) => (
    <Pressable
      key={key}
      accessibilityRole={role}
      accessibilityState={role === 'switch' ? { checked } : undefined}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toggle,
        { backgroundColor: colors.cardStrong, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <Feather
        name={role === 'switch' ? (checked ? 'check-square' : 'square') : 'repeat'}
        size={24}
        color={colors.text}
      />
      <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen options={{ title: t('profile.title') }} />

      <View style={styles.hero}>
        <H1>{t('profile.title')}</H1>
      </View>

      <Card style={styles.identityCard}>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
          {initial ? (
            <Text style={[styles.avatarInitial, { color: colors.text }]}>{initial}</Text>
          ) : (
            <Feather name="user" size={28} color={colors.text} />
          )}
        </View>
        {user ? (
          <View style={styles.identityText}>
            <H2>{displayName || username}</H2>
            {phone ? (
              <Muted>
                {t('profile.phoneLabel')}: {phone}
              </Muted>
            ) : username ? (
              <Muted>
                {t('profile.usernameLabel')}: {username}
              </Muted>
            ) : null}
            <Muted>
              {t('profile.cityLabel')}: {city.name}
              {city.state ? `, ${city.state}` : ''}
            </Muted>
          </View>
        ) : (
          <View style={styles.identityText}>
            <Body>{t('profile.signedOutHint')}</Body>
            <Button label={t('common.signIn')} onPress={() => router.push('/login')} />
          </View>
        )}
      </Card>

      <H2 style={styles.sectionHeader}>{t('profile.settingsTitle')}</H2>

      <Card style={styles.card}>
        <View style={styles.rowHead}>
          <Text style={styles.rowLabel}>{t('profile.language')}</Text>
          <Text style={styles.rowValue}>{lang === 'hi' ? 'हिंदी' : 'English'}</Text>
        </View>
        {/* Not a switch: neither language is the "on" side, and a screen reader
            announcing "Hindi, on" would be nonsense. */}
        {settingToggle('language', lang === 'hi', t('profile.changeLanguage'), toggleLanguage, 'button')}
      </Card>

      <Card style={styles.card}>
        <View style={styles.rowHead}>
          <Text style={styles.rowLabel}>{t('profile.theme')}</Text>
          <Text style={styles.rowValue}>{isDark ? t('profile.themeDark') : t('profile.themeLight')}</Text>
        </View>
        {settingToggle(
          'theme',
          isDark,
          isDark ? t('profile.switchToLight') : t('profile.switchToDark'),
          toggleTheme,
        )}
      </Card>

      <Card style={styles.card}>
        <View style={styles.rowHead}>
          <Text style={styles.rowLabel}>{t('help.simpleTitle')}</Text>
          <Text style={styles.rowValue}>{isSimple ? t('profile.on') : t('profile.off')}</Text>
        </View>
        <Muted>{t('help.simpleHint')}</Muted>
        {settingToggle(
          'simple',
          isSimple,
          isSimple ? t('help.simpleTurnOff') : t('help.simpleTurnOn'),
          toggleSimple,
        )}
      </Card>

      {/* Desktop/phone layout is a web-only concept: on a real phone the app is
          already the phone layout and the control would do nothing. */}
      {Platform.OS === 'web' ? (
        <Card style={styles.card}>
          <View style={styles.rowHead}>
            <Text style={styles.rowLabel}>{t('profile.display')}</Text>
            <Text style={styles.rowValue}>
              {isComputerMode ? t('profile.displayDesktop') : t('profile.displayMobile')}
            </Text>
          </View>
          {settingToggle(
            'display',
            isComputerMode,
            isComputerMode ? t('profile.switchToMobile') : t('profile.switchToDesktop'),
            toggleDisplayMode,
          )}
        </Card>
      ) : null}

      <Card style={styles.card}>
        <View style={styles.rowHead}>
          <Text style={styles.rowLabel}>{t('profile.cityLabel')}</Text>
        </View>
        <Muted>{t('profile.cityHint')}</Muted>
        {/* The same chip-and-sheet used on Home, Services and sign-in, so the
            city is changed the one way this app has already taught. */}
        <CityPicker />
      </Card>

      <H2 style={styles.sectionHeader}>{t('profile.moreTitle')}</H2>

      <Card style={styles.card}>
        <Body>{t('help.privacyBody')}</Body>
        <Button label={t('help.privacyCta')} variant="secondary" onPress={() => router.push('/privacy')} />
      </Card>

      <Card style={styles.card}>
        <Body>{t('profile.familyBody')}</Body>
        <Button label={t('profile.familyCta')} variant="secondary" onPress={() => router.push('/help')} />
      </Card>

      {user ? (
        <>
          <H2 style={styles.sectionHeader}>{t('profile.signOutTitle')}</H2>
          <Card style={styles.card}>
            <Body>{t('profile.signOutBody')}</Body>
            <Button
              label={signOutArmed ? t('profile.signOutConfirm') : t('common.signOut')}
              variant="danger"
              onPress={confirmSignOut}
            />
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(colors: AppColors, tk: Tokens) {
  return StyleSheet.create({
    content: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      padding: tk.space.md,
      paddingBottom: tk.space.xl,
      gap: tk.space.md,
    },
    hero: { paddingHorizontal: tk.space.xs },
    identityCard: { flexDirection: 'row', alignItems: 'center', gap: tk.space.md },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: radius.pill,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    avatarInitial: {
      fontFamily: family.heavy,
      fontSize: tk.font.xl,
      lineHeight: tk.font.xl * 1.15,
      letterSpacing: tracking.display,
    },
    identityText: { flex: 1, minWidth: 0, gap: tk.space.xs },
    sectionHeader: { marginTop: tk.space.md, paddingHorizontal: tk.space.xs },
    card: { gap: tk.space.sm },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: tk.space.sm,
    },
    rowLabel: { fontFamily: family.semibold, fontSize: tk.font.md, color: colors.text },
    rowValue: { fontFamily: family.regular, fontSize: tk.font.md, color: colors.textMuted },
    toggle: {
      minHeight: tk.TAP,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tk.space.sm,
      paddingHorizontal: tk.space.md,
      borderRadius: radius.lg,
      borderWidth: 1,
    },
    toggleLabel: { fontFamily: family.semibold, fontSize: tk.font.md },
    pressed: { opacity: 0.72 },
  });
}
