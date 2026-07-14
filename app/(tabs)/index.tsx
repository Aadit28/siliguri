import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
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
import AnimatedSection from '../../src/components/animated-section';
import AppHeader from '../../src/components/AppHeader';
import ServiceGlyph from '../../src/components/ServiceGlyph';
import SiteFooter from '../../src/components/SiteFooter';
import { H1, H2, Muted, Stars } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { fetchServices } from '../../src/lib/api';
import { categoryColor, SERVICE_CATEGORIES } from '../../src/lib/categories';
import { EMERGENCY_PRIMARY_NUMBER } from '../../src/lib/config';
import { AppColors, font, radius, shadow, space } from '../../src/lib/theme';
import { Service, ServiceCategory } from '../../src/lib/types';

const heroImage = require('../../assets/saathi-hero-care.png');

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
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const styles = makeStyles(colors, isDark, isWide);
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
  const quickActions = [
    {
      mark: 'AI',
      title: t('tabs.assistant'),
      body: t('assistant.agentSignal'),
      tone: colors.info,
      soft: colors.infoSoft,
      onPress: () => router.push('/assistant'),
    },
    {
      mark: 'Q&A',
      title: t('home.quickCommunity'),
      body: t('home.mobileCommunityBody'),
      tone: colors.primary,
      soft: colors.primarySoft,
      onPress: () => router.push('/community'),
    },
    {
      mark: '112',
      title: t('home.quickHelp'),
      body: t('home.mobileHelpBody'),
      tone: colors.emergency,
      soft: colors.emergencySoft,
      onPress: () => router.push('/help'),
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <AppHeader />
      <ScrollView ref={homeScrollRef} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
        <AnimatedSection style={styles.heroCard}>
          <View style={styles.heroImageWrap}>
            <Image source={heroImage} resizeMode="cover" style={styles.heroImage} accessibilityLabel={t('home.heroPhotoAlt')} />
            <View style={styles.locationPill}>
              <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
              <Text style={styles.locationText}>{t('home.signalCity')}</Text>
            </View>
          </View>

          <View style={styles.heroContent}>
            <Text style={[styles.greeting, { color: colors.primaryDark }]}>{greeting}</Text>
            <H1 style={styles.heroTitle}>{t('home.mobileNeedTitle')}</H1>
            <Muted style={styles.heroBody}>{t('home.subtitle')}</Muted>

            <View style={styles.heroActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/services')}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>{t('home.quickServices')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('help.callEmergency112')}
                onPress={() => Linking.openURL(`tel:${EMERGENCY_PRIMARY_NUMBER}`)}
                style={({ pressed }) => [styles.emergencyButton, { borderColor: colors.emergency }, pressed && styles.pressed]}
              >
                <Text style={[styles.emergencyButtonText, { color: colors.emergency }]}>SOS 112</Text>
              </Pressable>
            </View>

            <View style={styles.trustRow}>
              {[t('home.signalVerified'), t('home.signalCaregiver')].map((signal) => (
                <View key={signal} style={[styles.trustPill, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.trustText, { color: colors.primaryDark }]}>✓ {signal}</Text>
                </View>
              ))}
            </View>
          </View>
        </AnimatedSection>

        <AnimatedSection delay={60} style={styles.quickActionGrid}>
          {quickActions.map((action) => (
            <Pressable
              key={action.title}
              accessibilityRole="button"
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.quickActionCard,
                { backgroundColor: colors.cardStrong, borderColor: colors.border },
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.quickActionMark, { backgroundColor: action.soft }]}>
                <Text style={[styles.quickActionMarkText, { color: action.tone }]}>{action.mark}</Text>
              </View>
              <View style={styles.quickActionCopy}>
                <Text style={[styles.quickActionTitle, { color: colors.text }]}>{action.title}</Text>
                <Text style={[styles.quickActionBody, { color: colors.textMuted }]} numberOfLines={2}>{action.body}</Text>
              </View>
              <Text style={[styles.quickActionArrow, { color: action.tone }]}>›</Text>
            </Pressable>
          ))}
        </AnimatedSection>

        <AnimatedSection delay={80} style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeadingCopy}>
              <H2>{t('home.browseCategories')}</H2>
              <Muted>{t('home.mobileServiceBody')}</Muted>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/services')}>
              <Text style={[styles.seeAll, { color: colors.primary }]}>{t('home.seeAll')}</Text>
            </Pressable>
          </View>

          <View style={styles.categoryGrid}>
            {SERVICE_CATEGORIES.map((category) => {
              const tone = categoryColor(category.key);
              return (
                <Pressable
                  key={category.key}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/services', params: { category: category.key } })}
                  style={({ pressed }) => [
                    styles.categoryCard,
                    { backgroundColor: colors.cardStrong, borderColor: colors.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.categoryIcon, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                    <ServiceGlyph category={category.key} color={tone.fg} size={26} />
                  </View>
                  <Text style={[styles.categoryLabel, { color: colors.text }]}>{t(`categories.${category.key}`)}</Text>
                  <Text style={[styles.arrow, { color: colors.primary }]}>›</Text>
                </Pressable>
              );
            })}
          </View>
        </AnimatedSection>

        {featured.length ? (
          <AnimatedSection delay={140} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeadingCopy}>
                <Text style={[styles.eyebrow, { color: colors.success }]}>{t('common.verified')}</Text>
                <H2>{t('home.topRated')}</H2>
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.push('/services')}>
                <Text style={[styles.seeAll, { color: colors.primary }]}>{t('home.seeAll')}</Text>
              </Pressable>
            </View>

            <View style={styles.providerGrid}>
              {featured.map((service) => {
                const tone = categoryColor(service.category);
                return (
                  <Pressable
                    key={service.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/service/${service.id}`)}
                    style={({ pressed }) => [
                      styles.providerCard,
                      { backgroundColor: colors.cardStrong, borderColor: colors.border },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.providerIcon, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                      <ServiceGlyph category={service.category} color={tone.fg} size={24} />
                    </View>
                    <View style={styles.providerCopy}>
                      <Text selectable style={[styles.providerName, { color: colors.text }]} numberOfLines={2}>
                        {service.name}
                      </Text>
                      <Muted numberOfLines={1} style={styles.providerMeta}>
                        {service.town || 'Siliguri'} · {t(`categories.${service.category}`)}
                      </Muted>
                    </View>
                    <Stars rating={service.rating} />
                  </Pressable>
                );
              })}
            </View>
          </AnimatedSection>
        ) : null}

        <AnimatedSection delay={200} style={[styles.officialSection, { backgroundColor: colors.cardStrong, borderColor: colors.border }]}>
          <View style={styles.officialIntro}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>
              {lang === 'hi' ? 'सरकारी और सार्वजनिक सेवाएँ' : 'Government and public services'}
            </Text>
            <H2>{t('home.railsTitle')}</H2>
            <Muted>{t('home.railsBody')}</Muted>
          </View>

          <View style={styles.railGrid}>
            {TRUST_RAILS.map((rail, index) => (
              <Pressable
                key={rail.label}
                accessibilityRole="link"
                accessibilityLabel={`${rail.label}. ${lang === 'hi' ? rail.hi : rail.en}`}
                onPress={() => openExternal(rail.url)}
                style={({ pressed }) => [
                  styles.railCard,
                  { backgroundColor: colors.bgAlt, borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.railNumber, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.railNumberText, { color: colors.primaryDark }]}>{String(index + 1).padStart(2, '0')}</Text>
                </View>
                <View style={styles.railCopy}>
                  <Text style={[styles.railLabel, { color: colors.text }]}>{rail.label}</Text>
                  <Text style={[styles.railDescription, { color: colors.textMuted }]}>{lang === 'hi' ? rail.hi : rail.en}</Text>
                </View>
                <Text style={[styles.externalArrow, { color: colors.primary }]}>↗</Text>
              </Pressable>
            ))}
          </View>
        </AnimatedSection>

        <View style={[styles.safetyNote, { backgroundColor: colors.primarySoft }]}>
          <Text style={[styles.safetyTitle, { color: colors.primaryDark }]}>{t('home.trustTitle')}</Text>
          <Text style={[styles.safetyBody, { color: colors.textMuted }]}>{t('home.trustBanner')}</Text>
        </View>

        </View>
        <SiteFooter services={allServices} />
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors, isDark: boolean, isWide: boolean) {
  return StyleSheet.create({
    screen: { flex: 1 },
    scrollContent: {
      width: '100%',
    },
    content: {
      width: '100%',
      maxWidth: 1920,
      alignSelf: 'center',
      paddingHorizontal: isWide ? space.lg : space.md,
      paddingTop: isWide ? space.lg : space.md,
      paddingBottom: isWide ? 56 : space.xl,
      gap: isWide ? space.xl : space.xl,
    },
    heroCard: {
      flexDirection: isWide ? 'row' : 'column',
      overflow: 'hidden',
      borderRadius: radius.xl,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow.md,
    },
    heroImageWrap: { flex: isWide ? 0.78 : undefined, minHeight: isWide ? 440 : 245, backgroundColor: colors.primarySoft },
    heroImage: { width: '100%', height: '100%', minHeight: isWide ? 440 : 245 },
    locationPill: {
      position: 'absolute',
      left: space.md,
      bottom: space.md,
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: radius.pill,
      paddingHorizontal: space.md,
      backgroundColor: 'rgba(255,255,255,0.94)',
      ...shadow.sm,
    },
    statusDot: { width: 9, height: 9, borderRadius: 9 },
    locationText: { color: '#24312E', fontSize: font.xs, fontWeight: '700' },
    heroContent: { flex: 1.22, justifyContent: 'center', padding: isWide ? 52 : space.lg, gap: space.md },
    greeting: { fontSize: font.sm, fontWeight: '800' },
    heroTitle: { maxWidth: 700, fontSize: isWide ? 46 : 34, lineHeight: isWide ? 53 : 41 },
    heroBody: { maxWidth: 680, fontSize: font.md, lineHeight: 26 },
    heroActions: { flexDirection: isWide ? 'row' : 'column', gap: space.sm },
    primaryButton: {
      minHeight: 58,
      flex: isWide ? 1 : undefined,
      borderRadius: radius.lg,
      paddingHorizontal: space.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: { color: '#FFFFFF', fontSize: font.md, fontWeight: '800' },
    emergencyButton: {
      minHeight: 58,
      flex: isWide ? 0.72 : undefined,
      borderRadius: radius.lg,
      borderWidth: 2,
      paddingHorizontal: space.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.emergencySoft : '#FFFFFF',
    },
    emergencyButtonText: { fontSize: font.md, fontWeight: '800' },
    trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    trustPill: { minHeight: 34, borderRadius: radius.pill, paddingHorizontal: space.sm, alignItems: 'center', justifyContent: 'center' },
    trustText: { fontSize: font.xs, fontWeight: '700' },
    quickActionGrid: { flexDirection: isWide ? 'row' : 'column', gap: space.sm },
    quickActionCard: {
      flex: isWide ? 1 : undefined,
      minHeight: isWide ? 104 : 92,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: space.md,
      ...shadow.sm,
    },
    quickActionMark: { width: 54, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    quickActionMarkText: { fontSize: font.sm, fontWeight: '800' },
    quickActionCopy: { flex: 1, minWidth: 0, gap: 3 },
    quickActionTitle: { fontSize: font.md, lineHeight: 23, fontWeight: '800' },
    quickActionBody: { fontSize: font.xs, lineHeight: 19 },
    quickActionArrow: { fontSize: 28, lineHeight: 30, fontWeight: '500' },
    section: { gap: space.md },
    sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
    sectionHeadingCopy: { flex: 1, gap: 5 },
    eyebrow: { fontSize: font.xs, lineHeight: 18, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    seeAll: { minHeight: 40, paddingTop: 8, fontSize: font.sm, fontWeight: '800' },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    categoryCard: {
      flexGrow: 1,
      flexBasis: isWide ? '13%' : '47%',
      minHeight: isWide ? 112 : 126,
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: space.md,
      gap: space.sm,
      ...shadow.sm,
    },
    categoryIcon: { width: 52, height: 52, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    categoryLabel: { flex: 1, paddingRight: space.lg, fontSize: font.sm, lineHeight: 21, fontWeight: '800' },
    arrow: { position: 'absolute', right: space.md, bottom: space.sm, fontSize: 26, lineHeight: 28, fontWeight: '500' },
    providerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    providerCard: {
      flexGrow: 1,
      flexBasis: isWide ? '31%' : '100%',
      minHeight: 96,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: space.md,
      ...shadow.sm,
    },
    providerIcon: { width: 52, height: 52, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    providerCopy: { flex: 1, minWidth: 0, gap: 3 },
    providerName: { fontSize: font.sm, lineHeight: 21, fontWeight: '800' },
    providerMeta: { fontSize: font.xs, lineHeight: 18 },
    officialSection: { borderRadius: radius.xl, borderWidth: 1, padding: isWide ? space.xl : space.lg, gap: space.lg, ...shadow.sm },
    officialIntro: { maxWidth: 720, gap: 7 },
    railGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    railCard: {
      flexGrow: 1,
      flexBasis: isWide ? '31%' : '100%',
      minHeight: 100,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: space.md,
    },
    railNumber: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    railNumberText: { fontSize: font.xs, fontWeight: '800', fontVariant: ['tabular-nums'] },
    railCopy: { flex: 1, minWidth: 0, gap: 3 },
    railLabel: { fontSize: font.sm, lineHeight: 21, fontWeight: '800' },
    railDescription: { fontSize: font.xs, lineHeight: 19 },
    externalArrow: { fontSize: 20, lineHeight: 22, fontWeight: '700' },
    safetyNote: { borderRadius: radius.lg, padding: space.lg, gap: 6 },
    safetyTitle: { fontSize: font.sm, lineHeight: 22, fontWeight: '800' },
    safetyBody: { fontSize: font.sm, lineHeight: 23 },
    pressed: { opacity: 0.72 },
  });
}
