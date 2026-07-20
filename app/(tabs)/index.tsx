import React, { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import AnimatedSection from '../../src/components/animated-section';
import AppHeader from '../../src/components/AppHeader';
import ServiceGlyph from '../../src/components/ServiceGlyph';
import SiteFooter from '../../src/components/SiteFooter';
import { Button, H1, H2, Muted, Stars } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { fetchServices } from '../../src/lib/api';
import { SERVICE_CATEGORIES } from '../../src/lib/categories';
import { EMERGENCY_PRIMARY_NUMBER } from '../../src/lib/config';
import { AppColors, ROW_MIN_HEIGHT, TAP, family, font, radius, space, tracking } from '../../src/lib/theme';
import { Service, ServiceCategory } from '../../src/lib/types';

const TRUST_RAILS = [
  {
    label: 'Elderline 14567',
    url: 'https://scw.dosje.gov.in/elderline',
    en: 'Help and information for older adults.',
    hi: 'वरिष्ठ नागरिकों के लिए सहायता और जानकारी।',
  },
  {
    label: 'eSanjeevani',
    url: 'https://esanjeevani.mohfw.gov.in/',
    en: 'Online government health services.',
    hi: 'सरकारी ऑनलाइन स्वास्थ्य सेवाएँ।',
  },
  {
    label: 'UMANG',
    url: 'https://web.umang.gov.in/',
    en: 'Many government services in one place.',
    hi: 'कई सरकारी सेवाएँ एक ही जगह।',
  },
  {
    label: 'CSC access',
    url: 'https://csc.gov.in/',
    en: 'Assisted access to digital services.',
    hi: 'डिजिटल सेवाओं तक सहायता के साथ पहुँच।',
  },
  {
    label: 'Yatri Sathi',
    url: 'https://yatrisathi.in/',
    en: 'Travel information and support.',
    hi: 'यात्रा की जानकारी और सहायता।',
  },
  {
    label: 'Sanchar Saathi',
    url: 'https://sancharsaathi.gov.in/',
    en: 'Mobile and telecom safety services.',
    hi: 'मोबाइल और दूरसंचार सुरक्षा सेवाएँ।',
  },
];

const FEATURED_CATEGORY_MIX: ServiceCategory[] = [
  'elder_home',
  'doctor',
  'hospital',
  'medical_shop',
  'home_service',
  'travel_agent',
  'daily_service',
];

function pickMixedFeaturedServices(services: Service[], limit = 6) {
  const ranked = [...services]
    .filter((service) => service.verified)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const pool = ranked.length ? ranked : services;
  const picked: Service[] = [];
  const used = new Set<string>();

  FEATURED_CATEGORY_MIX.forEach((category) => {
    if (picked.length >= limit) return;
    const next = pool.find((service) => service.category === category && !used.has(service.id));
    if (!next) return;
    picked.push(next);
    used.add(next.id);
  });

  return picked;
}

function openExternal(url: string) {
  if (process.env.EXPO_OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(url);
}

export default function Home() {
  const router = useRouter();
  const { t } = useTranslation();
  const { lang } = useLocale();
  const { displayName } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const styles = makeStyles(colors, isWide);
  const homeScrollRef = useRef<ScrollView>(null);
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [featured, setFeatured] = useState<Service[]>([]);

  useEffect(() => {
    fetchServices().then((all) => {
      setAllServices(all);
      setFeatured(pickMixedFeaturedServices(all));
    });
  }, []);

  useEffect(() => {
    homeScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [isWide]);

  const greeting = `${t('home.greeting')}${displayName ? `, ${displayName}` : ''}`;

  const destinations: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }[] = [
    { icon: 'message-square', label: t('tabs.assistant'), onPress: () => router.push('/assistant') },
    { icon: 'users', label: t('tabs.community'), onPress: () => router.push('/community') },
    { icon: 'shield', label: t('help.title'), onPress: () => router.push('/help') },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <AppHeader />
      <ScrollView ref={homeScrollRef} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <AnimatedSection style={styles.intro}>
            <Text style={[styles.greeting, { color: colors.textMuted }]}>{greeting}</Text>
            <H1 style={styles.title}>{t('home.mobileNeedTitle')}</H1>
            <Muted style={styles.subtitle}>{t('home.mobileServiceBody')}</Muted>
            <Text style={[styles.launchCity, { color: colors.textSubtle }]}>{t('home.signalCity')}</Text>
          </AnimatedSection>

          <AnimatedSection delay={40} style={styles.actions}>
            <Button
              label={t('home.quickServices')}
              onPress={() => router.push('/services')}
              icon={<Feather name="search" size={20} color={colors.primaryFg} />}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('help.callEmergency112')}
              onPress={() => Linking.openURL(`tel:${EMERGENCY_PRIMARY_NUMBER}`)}
              style={({ pressed }) => [styles.sosRow, { borderColor: colors.emergency }, pressed && styles.pressed]}
            >
              <Feather name="phone-call" size={20} color={colors.emergency} />
              <Text style={[styles.sosLabel, { color: colors.emergency }]}>{t('home.heroSecondary')}</Text>
              <Text style={[styles.sosHint, { color: colors.emergency }]}>{t('common.call')}</Text>
            </Pressable>
          </AnimatedSection>

          <AnimatedSection delay={80} style={[styles.list, { borderColor: colors.border }]}>
            {destinations.map((item, index) => (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                onPress={item.onPress}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                  <Feather name={item.icon} size={22} color={colors.text} />
                </View>
                <Text style={[styles.rowLabel, { color: colors.text }]}>{item.label}</Text>
                <Feather name="chevron-right" size={22} color={colors.textSubtle} />
              </Pressable>
            ))}
          </AnimatedSection>

          <AnimatedSection delay={120} style={styles.section}>
            <View style={styles.sectionHeader}>
              <H2>{t('home.browseCategories')}</H2>
              <Pressable accessibilityRole="button" onPress={() => router.push('/services')} hitSlop={8}>
                <Text style={[styles.seeAll, { color: colors.accent }]}>{t('home.seeAll')}</Text>
              </Pressable>
            </View>

            <View style={styles.categoryGrid}>
              {SERVICE_CATEGORIES.map((category) => (
                <Pressable
                  key={category.key}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/services', params: { category: category.key } })}
                  style={({ pressed }) => [
                    styles.categoryTile,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                    <ServiceGlyph category={category.key} color={colors.text} size={24} />
                  </View>
                  <Text style={[styles.categoryLabel, { color: colors.text }]} numberOfLines={2}>
                    {t(`categories.${category.key}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </AnimatedSection>

          {featured.length ? (
            <AnimatedSection delay={160} style={styles.section}>
              <View style={styles.sectionHeader}>
                <H2>{t('home.topRated')}</H2>
                <Pressable accessibilityRole="button" onPress={() => router.push('/services')} hitSlop={8}>
                  <Text style={[styles.seeAll, { color: colors.accent }]}>{t('home.seeAll')}</Text>
                </Pressable>
              </View>

              <View style={[styles.list, { borderColor: colors.border }]}>
                {featured.map((service, index) => (
                  <Pressable
                    key={service.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/service/${service.id}`)}
                    style={({ pressed }) => [
                      styles.row,
                      index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                      <ServiceGlyph category={service.category} color={colors.text} size={22} />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text selectable style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
                        {service.name}
                      </Text>
                      <Muted numberOfLines={1} style={styles.rowMeta}>
                        {service.town || 'Siliguri'} · {t(`categories.${service.category}`)}
                      </Muted>
                    </View>
                    <Stars rating={service.rating} />
                  </Pressable>
                ))}
              </View>
            </AnimatedSection>
          ) : null}

          <AnimatedSection delay={200} style={styles.section}>
            <View style={styles.sectionHeader}>
              <H2>{lang === 'hi' ? 'सरकारी और सार्वजनिक सेवाएँ' : 'Government & public services'}</H2>
            </View>

            <View style={[styles.list, { borderColor: colors.border }]}>
              {TRUST_RAILS.map((rail, index) => (
                <Pressable
                  key={rail.label}
                  accessibilityRole="link"
                  accessibilityLabel={`${rail.label}. ${lang === 'hi' ? rail.hi : rail.en}`}
                  onPress={() => openExternal(rail.url)}
                  style={({ pressed }) => [
                    styles.row,
                    index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>{rail.label}</Text>
                    <Muted numberOfLines={2} style={styles.rowMeta}>
                      {lang === 'hi' ? rail.hi : rail.en}
                    </Muted>
                  </View>
                  <Feather name="external-link" size={20} color={colors.textSubtle} />
                </Pressable>
              ))}
            </View>
          </AnimatedSection>
        </View>
        <SiteFooter services={allServices} />
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors, isWide: boolean) {
  return StyleSheet.create({
    screen: { flex: 1 },
    scrollContent: { width: '100%' },
    content: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      paddingHorizontal: isWide ? space.lg : space.md,
      paddingTop: space.lg,
      paddingBottom: space.xl,
      gap: space.xl,
    },
    intro: { gap: space.xs },
    greeting: { fontFamily: family.medium, fontSize: font.sm, lineHeight: font.sm * 1.4 },
    title: { fontFamily: family.medium, fontSize: isWide ? font.xxl : 34, lineHeight: isWide ? font.xxl * 1.13 : 41 },
    subtitle: { fontFamily: family.medium, fontSize: font.md, lineHeight: font.md * 1.4 },
    launchCity: { marginTop: space.xs, fontFamily: family.medium, fontSize: font.sm, lineHeight: font.sm * 1.4 },
    actions: { gap: space.sm },
    sosRow: {
      minHeight: TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: space.lg,
    },
    sosLabel: { flex: 1, fontFamily: family.bold, fontSize: font.md, letterSpacing: tracking.md },
    sosHint: { fontFamily: family.semibold, fontSize: font.sm },
    list: {
      borderWidth: 1,
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    row: {
      minHeight: ROW_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    rowIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowCopy: { flex: 1, minWidth: 0, gap: 2 },
    rowLabel: { flex: 1, fontFamily: family.semibold, fontSize: font.md, lineHeight: font.md * 1.3 },
    rowMeta: { flex: 0, fontFamily: family.regular, fontSize: font.sm },
    section: { gap: space.md },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
    seeAll: { minHeight: 40, paddingTop: 8, fontFamily: family.semibold, fontSize: font.sm },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    categoryTile: {
      flexGrow: 1,
      flexBasis: isWide ? '30%' : '47%',
      minHeight: ROW_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    categoryLabel: { flex: 1, fontFamily: family.semibold, fontSize: font.sm, lineHeight: font.sm * 1.35 },
    pressed: { opacity: 0.72 },
  });
}
