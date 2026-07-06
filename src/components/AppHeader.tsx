import React, { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, radius, space, shadow } from '../lib/theme';
import { useLocale } from '../context/LocaleContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useDisplayMode } from '../context/DisplayModeContext';
import { HELPLINE_NUMBER } from '../lib/config';
import { markLoginIntent } from '../lib/authNavigation';
import { SUPPORTED_LANGUAGES } from '../lib/languages';

export default function AppHeader({ title }: { title?: string }) {
  const [hideHeader, setHideHeader] = useState(false);
  const hideHeaderRef = useRef(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { lang, setLang } = useLocale();
  const { displayName, user, signOut } = useAuth();
  const { colors, mode, isDark, toggleTheme } = useTheme();
  const { isComputerMode, toggleDisplayMode } = useDisplayMode();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const pathname = usePathname();
  const showNav = isComputerMode && width >= 720;
  const translatedHeader = lang !== 'en';
  const actionCompact = width < 520 || !showNav || translatedHeader;
  const veryNarrowHeader = width < 360;
  const compactHeader = showNav && (width < 960 || translatedHeader);
  const accountLabel = displayName?.split(' ')[0] || t('common.signOut');
  const authLabel = actionCompact ? (user ? accountLabel.slice(0, 1).toUpperCase() : 'In') : accountLabel;
  const navItems = [
    { label: t('tabs.home'), href: '/' },
    { label: t('tabs.services'), href: '/services' },
    { label: t('tabs.assistant'), href: '/assistant' },
    { label: t('tabs.community'), href: '/community' },
    { label: t('tabs.help'), href: '/help' },
  ];
  const isActiveNav = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  const currentLanguage =
    SUPPORTED_LANGUAGES.find((language) => language.code === lang) ?? SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    let ticking = false;
    let lastScrollTop = 0;
    const setHeaderHidden = (hidden: boolean) => {
      if (hideHeaderRef.current === hidden) return;
      hideHeaderRef.current = hidden;
      setHideHeader(hidden);
    };
    const getScrollElement = (target: EventTarget | null) => {
      if (
        !target ||
        target === document ||
        target === document.documentElement ||
        target === document.body ||
        target === document.scrollingElement
      ) {
        return document.scrollingElement ?? document.documentElement;
      }

      return typeof HTMLElement !== 'undefined' && target instanceof HTMLElement ? target : null;
    };
    const isPageScrollTarget = (target: EventTarget | null) => {
      const element = getScrollElement(target);
      if (!element) return true;
      if (element === document.scrollingElement || element === document.documentElement) return true;

      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      return viewportHeight === 0 || element.clientHeight >= viewportHeight * 0.82;
    };
    const readScrollTop = (target: EventTarget | null) => {
      const element = getScrollElement(target);
      if (element && element !== document.documentElement && element !== document.body) {
        return Number(element.scrollTop ?? 0);
      }
      return Number(document.scrollingElement?.scrollTop ?? window.scrollY ?? 0);
    };
    const readMaxScrollTop = (target: EventTarget | null) => {
      const element = getScrollElement(target);
      if (!element) return 0;
      return Math.max(0, Number(element.scrollHeight ?? 0) - Number(element.clientHeight ?? 0));
    };
    const handleScroll = (event: Event) => {
      if (!isPageScrollTarget(event.target)) return;
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const nextScrollTop = readScrollTop(event.target);
        const maxScrollTop = readMaxScrollTop(event.target);
        const delta = nextScrollTop - lastScrollTop;

        if (nextScrollTop <= 18) {
          setHeaderHidden(false);
        } else if (maxScrollTop - nextScrollTop <= 18) {
          setHeaderHidden(true);
        } else if (delta > 12) {
          setHeaderHidden(true);
        } else if (delta < -12) {
          setHeaderHidden(false);
        }

        lastScrollTop = nextScrollTop;
        ticking = false;
      });
    };

    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <BlurView
      intensity={isDark ? 64 : 48}
      tint={mode === 'dark' ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + space.sm,
          backgroundColor: colors.nav,
          borderBottomColor: colors.border,
        },
        hideHeader && styles.wrapHidden,
      ]}
    >
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => router.push('/')}
          accessibilityRole="header"
          style={[
            styles.brandWrap,
            showNav && styles.brandWrapDesktop,
            compactHeader && styles.brandWrapCompact,
          ]}
        >
          <Text style={[styles.brand, { color: colors.text }]} numberOfLines={1}>
            {t('appName')}
          </Text>
          {!showNav ? (
            <Text style={[styles.brandSub, { color: colors.textMuted }]} numberOfLines={1}>
              {title ?? t('tagline')}
            </Text>
          ) : null}
        </TouchableOpacity>

        {showNav ? (
          <View
            style={[
              styles.navLinks,
              compactHeader && styles.navLinksCompact,
              translatedHeader && styles.navLinksTranslated,
            ]}
          >
            {navItems.map((item) => (
              <TouchableOpacity
                key={item.href}
                onPress={() => router.push(item.href as any)}
                activeOpacity={0.75}
                style={[
                  styles.navLink,
                  compactHeader && styles.navLinkCompact,
                  translatedHeader && styles.navLinkTranslated,
                  isActiveNav(item.href) && {
                    backgroundColor: colors.chipBg,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.navLinkText,
                    compactHeader && styles.navLinkTextCompact,
                    translatedHeader && styles.navLinkTextTranslated,
                    { color: isActiveNav(item.href) ? colors.primaryDark : colors.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={[styles.actions, actionCompact && styles.actionsCompact]}>
          <TouchableOpacity
            onPress={() => setLanguageOpen(true)}
            style={[
              styles.languageBtn,
              actionCompact && styles.languageBtnCompact,
              translatedHeader && styles.languageBtnTranslated,
              { backgroundColor: colors.chipBg, borderColor: colors.border },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Choose language"
          >
            <Feather name="globe" size={16} color={colors.text} />
            <Text style={[styles.languageText, { color: colors.text }]} numberOfLines={1}>
              {actionCompact ? currentLanguage.shortLabel : currentLanguage.label}
            </Text>
            <Feather name="chevron-down" size={15} color={colors.textMuted} />
          </TouchableOpacity>

          <Modal
            transparent
            visible={languageOpen}
            animationType="fade"
            onRequestClose={() => setLanguageOpen(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={styles.modalScrim}
              onPress={() => setLanguageOpen(false)}
            >
              <View
                style={[
                  styles.languageMenu,
                  { backgroundColor: colors.bgAlt, borderColor: colors.border },
                ]}
              >
                <View style={styles.languageMenuHeader}>
                  <Text style={[styles.languageMenuTitle, { color: colors.text }]}>Language</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Close language menu"
                    onPress={() => setLanguageOpen(false)}
                    style={styles.menuCloseBtn}
                  >
                    <Feather name="x" size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <View style={styles.languageGrid}>
                  {SUPPORTED_LANGUAGES.map((language) => {
                    const selected = language.code === lang;
                    return (
                      <TouchableOpacity
                        key={language.code}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => {
                          setLang(language.code);
                          setLanguageOpen(false);
                        }}
                        style={[
                          styles.languageOption,
                          {
                            backgroundColor: selected ? colors.primaryTint : colors.surfaceTint,
                            borderColor: selected ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.languageNative, { color: colors.text }]}>
                          {language.nativeLabel}
                        </Text>
                        <Text style={[styles.languageEnglish, { color: colors.textMuted }]}>
                          {language.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </TouchableOpacity>
          </Modal>

          {!veryNarrowHeader ? (
            <TouchableOpacity
              onPress={toggleTheme}
              style={[styles.iconBtn, { backgroundColor: colors.chipBg, borderColor: colors.border }]}
              accessibilityRole="switch"
              accessibilityState={{ checked: isDark }}
              accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <Feather name="sun" size={20} color={colors.text} />
              ) : (
                <Feather name="moon" size={20} color={colors.text} />
              )}
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            onPress={toggleDisplayMode}
            style={[styles.iconBtn, { backgroundColor: colors.chipBg, borderColor: colors.border }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: isComputerMode }}
            accessibilityLabel={
              isComputerMode ? 'Switch to phone view' : 'Switch to computer view'
            }
          >
            {isComputerMode ? (
              <Feather name="smartphone" size={20} color={colors.text} />
            ) : (
              <Feather name="monitor" size={20} color={colors.text} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Linking.openURL(`tel:${HELPLINE_NUMBER}`)}
            style={[styles.helpBtn, actionCompact && styles.helpBtnCompact, { backgroundColor: colors.danger }]}
            accessibilityRole="button"
            accessibilityLabel={t('help.callNow')}
          >
            <Text style={[styles.helpText, { color: colors.textOnDark }]}>
              {actionCompact ? 'Call' : t('help.title')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              if (user) {
                signOut();
                return;
              }
              markLoginIntent();
              router.push('/login');
            }}
            style={[
              styles.authBtn,
              actionCompact && styles.authBtnCompact,
              { backgroundColor: colors.primaryTint, borderColor: colors.border },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.authText, { color: colors.primaryDark }]} numberOfLines={1}>
              {user ? authLabel : actionCompact ? 'In' : t('common.signIn')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    maxHeight: 112,
    overflow: 'hidden',
    transitionDuration: '180ms',
    transitionProperty: 'border-width, opacity, transform',
    transitionTimingFunction: 'ease-out',
    ...shadow.sm,
  } as any,
  wrapHidden: {
    borderBottomWidth: 0,
    opacity: 0,
    pointerEvents: 'none',
    transform: [{ translateY: -40 }],
  } as any,
  row: {
    position: 'relative',
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  brandWrap: { flex: 1, minWidth: 0 },
  brandWrapDesktop: {
    zIndex: 3,
    flex: 0,
    minWidth: 148,
    minHeight: 40,
    justifyContent: 'center',
    paddingRight: space.sm,
  },
  brandWrapCompact: {
    minWidth: 104,
  },
  brand: { fontSize: font.xl, fontWeight: '900' },
  brandSub: { fontSize: font.xs, fontWeight: '700', marginTop: 2 },
  actions: {
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
  },
  actionsCompact: { gap: 4 },
  languageBtn: {
    height: 40,
    minWidth: 112,
    maxWidth: 140,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
  },
  languageBtnCompact: {
    minWidth: 64,
    maxWidth: 72,
    paddingHorizontal: 8,
  },
  languageBtnTranslated: {
    minWidth: 88,
    maxWidth: 112,
  },
  languageText: { flexShrink: 1, fontSize: font.xs, fontWeight: '900' },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.16)',
    alignItems: 'flex-end',
    paddingTop: 76,
    paddingRight: space.md,
  },
  languageMenu: {
    width: 360,
    maxWidth: '94%',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    ...shadow.md,
  },
  languageMenuHeader: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  languageMenuTitle: { fontSize: font.md, fontWeight: '900' },
  menuCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  languageOption: {
    width: '48%',
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: 8,
  },
  languageNative: { fontSize: font.sm, fontWeight: '900' },
  languageEnglish: { marginTop: 2, fontSize: font.xs, fontWeight: '700' },
  navLinks: {
    position: 'absolute',
    top: 5,
    left: '50%',
    width: 560,
    maxWidth: '46%',
    zIndex: 1,
    pointerEvents: 'box-none',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    marginHorizontal: 0,
    transform: [{ translateX: -280 }],
  },
  navLinksCompact: {
    width: 456,
    maxWidth: '44%',
    gap: 3,
    transform: [{ translateX: -228 }],
  },
  navLinksTranslated: {
    width: 500,
    maxWidth: '42%',
    transform: [{ translateX: -250 }],
  },
  navLink: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: space.sm,
    maxWidth: 132,
  },
  navLinkCompact: {
    minHeight: 36,
    paddingHorizontal: 7,
    maxWidth: 98,
  },
  navLinkTranslated: {
    maxWidth: 108,
  },
  navLinkText: { fontSize: font.sm, fontWeight: '800' },
  navLinkTextCompact: { fontSize: 13 },
  navLinkTextTranslated: { fontSize: 12, lineHeight: 18 },
  iconBtn: {
    minWidth: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  iconText: { fontWeight: '900', fontSize: font.sm },
  helpBtn: {
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    ...shadow.sm,
  },
  helpBtnCompact: {
    width: 44,
    paddingHorizontal: 0,
  },
  helpText: { fontWeight: '900', fontSize: font.xs },
  authBtn: {
    height: 40,
    maxWidth: 84,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  authBtnCompact: {
    width: 42,
    paddingHorizontal: 0,
  },
  authText: { fontWeight: '900', fontSize: font.xs },
});
