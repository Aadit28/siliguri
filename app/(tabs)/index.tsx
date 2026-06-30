import React, { useEffect, useState } from 'react';
import {
  Image,
  ImageBackground,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ImageStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AnimatedSection from '../../src/components/animated-section';
import AppHeader from '../../src/components/AppHeader';
import { H1, H2, Body, Muted, Stars } from '../../src/components/ui';
import { AppColors, font, radius, space, shadow } from '../../src/lib/theme';
import { SERVICE_CATEGORIES, categoryColor, serviceEmoji } from '../../src/lib/categories';
import { fetchServices } from '../../src/lib/api';
import { Service } from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

const heroImage = require('../../assets/saathi-hero-care.png');

const TRUST_RAILS = [
  { label: 'Elderline 14567', url: 'https://scw.dosje.gov.in/elderline' },
  { label: 'eSanjeevani', url: 'https://esanjeevani.mohfw.gov.in/' },
  { label: 'UMANG', url: 'https://web.umang.gov.in/' },
  { label: 'CSC access', url: 'https://csc.gov.in/' },
  { label: 'Yatri Sathi', url: 'https://yatrisathi.in/' },
  { label: 'Sanchar Saathi', url: 'https://sancharsaathi.gov.in/' },
];

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const { displayName } = useAuth();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const showHeroProof = width >= 1160;
  const styles = makeStyles(colors, isDark, isWide);
  const [featured, setFeatured] = useState<Service[]>([]);

  useEffect(() => {
    fetchServices().then((all) => {
      const top = [...all]
        .filter((s) => s.verified)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 8);
      setFeatured(top.length ? top : all.slice(0, 8));
    });
  }, []);

  const quick = [
    {
      label: t('home.quickServices'),
      caption: t('home.heroPrimary'),
      go: '/services',
      mark: 'Find',
      color: colors.primary,
      soft: colors.primaryTint,
    },
    {
      label: t('home.quickCommunity'),
      caption: t('home.signalCaregiver'),
      go: '/community',
      mark: 'Ask',
      color: colors.accent,
      soft: colors.accentSoft,
    },
    {
      label: t('home.quickHelp'),
      caption: t('home.heroSecondary'),
      go: '/help',
      mark: 'SOS',
      color: colors.danger,
      soft: colors.dangerSoft,
    },
  ];
  const mobileQuick = [
    {
      label: t('home.mobileServiceTitle'),
      caption: t('home.mobileServiceBody'),
      go: '/services',
      mark: 'Find',
      color: colors.primary,
      soft: colors.primaryTint,
    },
    {
      label: t('home.mobileCommunityTitle'),
      caption: t('home.mobileCommunityBody'),
      go: '/community',
      mark: 'Ask',
      color: colors.accent,
      soft: colors.accentSoft,
    },
    {
      label: t('home.mobileHelpTitle'),
      caption: t('home.mobileHelpBody'),
      go: '/help',
      mark: 'SOS',
      color: colors.danger,
      soft: colors.dangerSoft,
    },
  ];

  const metrics = [
    t('home.metricCities'),
    t('home.metricProviders'),
    t('home.metricResponse'),
  ];

  const journey = [
    {
      label: t('home.journeyFind'),
      body: t('home.journeyFindBody'),
      color: colors.primary,
    },
    {
      label: t('home.journeyConfirm'),
      body: t('home.journeyConfirmBody'),
      color: colors.accent,
    },
    {
      label: t('home.journeyFollow'),
      body: t('home.journeyFollowBody'),
      color: colors.success,
    },
  ];

  const onPrimary = isDark ? colors.textOnDark : '#fff';
  const heroImageLayerStyle: ImageStyle = isWide ? { transform: [{ translateX: -18 }, { scale: 1.03 }] } : {};

  if (!isWide) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <View style={styles.backdropTop} />
        <AppHeader />
        <ScrollView contentContainerStyle={styles.mobileContent} contentInsetAdjustmentBehavior="automatic">
          <AnimatedSection style={styles.mobileHero}>
            <View style={styles.mobilePhotoWrap}>
              <Image
                source={heroImage}
                resizeMode="contain"
                style={styles.mobilePhoto as ImageStyle}
                accessibilityLabel={t('home.heroPhotoAlt')}
              />
            </View>

            <View style={styles.mobileHeroCopy}>
              <Text style={styles.kickerDark}>{t('home.heroKicker')}</Text>
              <H1 style={styles.mobileTitle}>
                {t('home.greeting')}
                {displayName ? `, ${displayName}` : ''}. {t('home.heroTitle')}
              </H1>
              <Body style={styles.mobileBody}>{t('home.heroBody')}</Body>
            </View>

            <View style={styles.mobileActionRow}>
              <TouchableOpacity
                style={[styles.mobilePrimary, { backgroundColor: colors.primary }]}
                activeOpacity={0.88}
                onPress={() => router.push('/services')}
              >
                <Text style={[styles.primaryCtaText, { color: onPrimary }]}>{t('home.heroPrimary')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mobileSecondary} activeOpacity={0.88} onPress={() => router.push('/help')}>
                <Text style={styles.mobileSecondaryText}>{t('home.heroSecondary')}</Text>
              </TouchableOpacity>
            </View>
          </AnimatedSection>

          <AnimatedSection delay={80} style={styles.mobileStart}>
            <Text style={styles.mobileSectionLabel}>{t('home.mobileNeedTitle')}</Text>
            <View style={styles.mobileTileGrid}>
              {mobileQuick.map((q, index) => (
                <TouchableOpacity
                  key={q.go}
                  style={[styles.mobileTile, index === 2 && styles.mobileTileWide]}
                  onPress={() => router.push(q.go as any)}
                  activeOpacity={0.86}
                >
                  <View style={[styles.mobileTileIcon, { backgroundColor: q.soft }]}>
                    <Text style={[styles.mobileTileMark, { color: q.color }]}>{q.mark}</Text>
                  </View>
                  <Text style={styles.mobileTileTitle}>{q.label}</Text>
                  <Muted numberOfLines={2} style={styles.mobileTileBody}>
                    {q.caption}
                  </Muted>
                </TouchableOpacity>
              ))}
            </View>
          </AnimatedSection>

          <AnimatedSection delay={140} style={styles.mobileCategories}>
            <View style={styles.mobileSectionHeader}>
              <Text style={styles.mobileSectionLabel}>{t('home.browseCategories')}</Text>
              <TouchableOpacity onPress={() => router.push('/services')} activeOpacity={0.7}>
                <Text style={styles.seeAll}>{t('home.seeAll')} -&gt;</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.mobileCategoryGrid}>
              {SERVICE_CATEGORIES.slice(0, 6).map((c) => {
                const cc = categoryColor(c.key);
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={styles.mobileCategory}
                    activeOpacity={0.85}
                    onPress={() => router.push({ pathname: '/services', params: { category: c.key } })}
                  >
                    <View style={[styles.mobileCategoryIcon, { backgroundColor: cc.bg }]}>
                      <Text style={styles.catEmoji}>{c.emoji}</Text>
                    </View>
                    <Text style={styles.mobileCategoryText} numberOfLines={2}>
                      {t(`categories.${c.key}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </AnimatedSection>

          {featured.length > 0 ? (
            <AnimatedSection delay={200} style={styles.mobileFeatured}>
              <View style={styles.mobileSectionHeader}>
                <View>
                  <Text style={styles.mobileSectionLabel}>{t('common.verified')}</Text>
                  <H2 style={styles.mobileH2}>{t('home.topRated')}</H2>
                </View>
                <TouchableOpacity onPress={() => router.push('/services')} activeOpacity={0.7}>
                  <Text style={styles.seeAll}>{t('home.seeAll')} -&gt;</Text>
                </TouchableOpacity>
              </View>
              {featured.slice(0, 3).map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.mobileProvider}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/service/${s.id}`)}
                >
                  <View style={[styles.mobileProviderIcon, { backgroundColor: categoryColor(s.category).bg }]}>
                    <Text style={styles.railEmoji}>{serviceEmoji(s.category)}</Text>
                  </View>
                  <View style={styles.mobileProviderCopy}>
                    <Text style={styles.mobileProviderName} numberOfLines={2}>
                      {s.name}
                    </Text>
                    <Muted numberOfLines={1} style={styles.mobileProviderMeta}>
                      {s.town ? `${s.town} - ` : ''}
                      {t(`categories.${s.category}`)}
                    </Muted>
                  </View>
                  <Stars rating={s.rating} />
                </TouchableOpacity>
              ))}
            </AnimatedSection>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.backdropTop} />
      <View style={styles.backdropBottom} />
      <AppHeader />
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <AnimatedSection style={styles.heroShell}>
          <ImageBackground
            source={heroImage}
            resizeMode="cover"
            style={styles.heroImage}
            imageStyle={heroImageLayerStyle}
            accessibilityLabel={t('home.heroPhotoAlt')}
          >
            <View style={styles.heroScrim}>
              <View style={styles.heroLayout}>
                <View style={styles.heroCopy}>
                  <Text style={styles.kicker}>{t('home.heroKicker')}</Text>
                  <H1 style={styles.heroTitle}>
                    {t('home.greeting')}
                    {displayName ? `, ${displayName}` : ''}. {t('home.heroTitle')}
                  </H1>
                  <Body style={styles.heroBody}>{t('home.heroBody')}</Body>
                  <View style={styles.signalRow}>
                    {[t('home.signalCity'), t('home.signalVerified'), t('home.signalCaregiver')].map((label) => (
                      <View key={label} style={styles.signalPill}>
                        <View style={styles.signalDot} />
                        <Text style={styles.signalText}>{label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.heroActions}>
                    <TouchableOpacity
                      style={[styles.primaryCta, { backgroundColor: colors.primary }]}
                      activeOpacity={0.88}
                      onPress={() => router.push('/services')}
                    >
                      <Text style={[styles.primaryCtaText, { color: onPrimary }]}>
                        {t('home.heroPrimary')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.secondaryCta}
                      activeOpacity={0.88}
                      onPress={() => router.push('/help')}
                    >
                      <Text style={styles.secondaryCtaText}>{t('home.heroSecondary')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {showHeroProof ? (
                  <View style={styles.heroProof}>
                    <Text style={styles.heroProofLabel}>{t('home.scaleTitle')}</Text>
                    <Text style={styles.heroProofBody}>{t('home.scaleBody')}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </ImageBackground>
        </AnimatedSection>

        <AnimatedSection delay={80} style={styles.metricGrid}>
          {metrics.map((metric, index) => (
            <View key={metric} style={styles.metricCard}>
              <Text style={styles.metricNumber}>0{index + 1}</Text>
              <Text style={styles.metricText}>{metric}</Text>
            </View>
          ))}
        </AnimatedSection>

        <AnimatedSection delay={140} style={styles.proofSection}>
          <View style={styles.proofCopy}>
            <Text style={styles.kickerDark}>{t('home.trustTitle')}</Text>
            <H2 style={styles.proofTitle}>{t('home.proofTitle')}</H2>
            <Body style={styles.proofBody}>{t('home.proofBody')}</Body>
          </View>
          <View style={styles.proofStack}>
            {[
              t('home.opsVerifyBody'),
              t('home.opsCoordinateBody'),
              t('home.opsEscalateBody'),
            ].map((item, index) => (
              <View key={item} style={styles.proofRow}>
                <Text style={styles.proofIndex}>{index + 1}</Text>
                <Text style={styles.proofRowText}>{item}</Text>
              </View>
            ))}
          </View>
        </AnimatedSection>

        <AnimatedSection delay={200} style={styles.quickGrid}>
          {quick.map((q) => (
            <TouchableOpacity
              key={q.go}
              style={styles.quickPanel}
              onPress={() => router.push(q.go as any)}
              activeOpacity={0.86}
            >
              <View style={[styles.quickMark, { backgroundColor: q.soft }]}>
                <Text style={[styles.quickMarkText, { color: q.color }]}>{q.mark}</Text>
              </View>
              <Text style={styles.quickLabel}>{q.label}</Text>
              <Muted style={styles.quickCaption}>{q.caption}</Muted>
            </TouchableOpacity>
          ))}
        </AnimatedSection>

        <AnimatedSection delay={260} style={styles.journeySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.journeyKicker}>{t('home.journeyTitle')}</Text>
            <H2 style={styles.journeyTitle}>{t('home.opsTitle')}</H2>
          </View>
          <View style={styles.journeyRail}>
            {journey.map((step, index) => (
              <View key={step.label} style={styles.journeyStep}>
                <View style={[styles.journeyDot, { backgroundColor: step.color }]}>
                  <Text style={[styles.journeyDotText, { color: onPrimary }]}>{index + 1}</Text>
                </View>
                <View style={styles.journeyLine} />
                <Text style={styles.journeyLabel}>{step.label}</Text>
                <Muted style={styles.journeyBody}>{step.body}</Muted>
              </View>
            ))}
          </View>
        </AnimatedSection>

        {featured.length > 0 ? (
          <AnimatedSection delay={320}>
            <View style={styles.railHeader}>
              <View>
                <Text style={styles.kickerDark}>{t('common.verified')}</Text>
                <H2>{t('home.topRated')}</H2>
              </View>
              <TouchableOpacity onPress={() => router.push('/services')} activeOpacity={0.7}>
                <Text style={styles.seeAll}>{t('home.seeAll')} -&gt;</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal={!isWide}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalRail}
            >
              {featured.slice(0, isWide ? 4 : 8).map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.railCard}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/service/${s.id}`)}
                >
                  <View style={styles.railCardTop}>
                    <View style={[styles.railIcon, { backgroundColor: categoryColor(s.category).bg }]}>
                      <Text style={styles.railEmoji}>{serviceEmoji(s.category)}</Text>
                    </View>
                    {s.verified ? <Text style={styles.railVerified}>{t('common.verified')}</Text> : null}
                  </View>
                  <Text style={styles.railName} numberOfLines={2}>
                    {s.name}
                  </Text>
                  {s.town ? (
                    <Muted numberOfLines={1} style={styles.railTown}>
                      {s.town}
                    </Muted>
                  ) : null}
                  <View style={styles.railMeta}>
                    <Stars rating={s.rating} />
                    <Text style={styles.railCategory}>{t(`categories.${s.category}`)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </AnimatedSection>
        ) : null}

        <AnimatedSection delay={380} style={styles.categorySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.kickerDark}>{t('home.scaleTitle')}</Text>
            <H2>{t('home.browseCategories')}</H2>
          </View>
          <View style={styles.catGrid}>
            {SERVICE_CATEGORIES.map((c) => {
              const cc = categoryColor(c.key);
              return (
                <TouchableOpacity
                  key={c.key}
                  style={styles.cat}
                  activeOpacity={0.85}
                  onPress={() => router.push({ pathname: '/services', params: { category: c.key } })}
                >
                  <View style={[styles.catIcon, { backgroundColor: cc.bg }]}>
                    <Text style={styles.catEmoji}>{c.emoji}</Text>
                  </View>
                  <Text style={styles.catLabel}>{t(`categories.${c.key}`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </AnimatedSection>

        <AnimatedSection delay={440} style={styles.railsSection}>
          <View style={styles.railsCopy}>
            <Text style={styles.kickerDark}>{t('home.railsTitle')}</Text>
            <H2>{t('home.scaleTitle')}</H2>
            <Muted style={styles.railsBody}>{t('home.railsBody')}</Muted>
          </View>
          <View style={styles.railsWrap}>
            {TRUST_RAILS.map((rail) => (
              <TouchableOpacity
                key={rail.label}
                style={styles.railChip}
                activeOpacity={0.8}
                onPress={() => Linking.openURL(rail.url)}
              >
                <Text style={styles.railChipText}>{rail.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </AnimatedSection>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors, isDark: boolean, isWide: boolean) {
  const onImage = '#FFFFFF';
  const contentMax = 1120;

  return StyleSheet.create({
    screen: { flex: 1 },
    backdropTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: isWide ? 520 : 420,
      backgroundColor: colors.surfaceTint,
      opacity: isDark ? 0.3 : 0.96,
    },
    backdropBottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 260,
      backgroundColor: colors.accentSoft,
      opacity: isDark ? 0.12 : 0.28,
    },
    content: {
      width: '100%',
      maxWidth: contentMax,
      alignSelf: 'center',
      paddingHorizontal: isWide ? space.xl : space.md,
      paddingTop: isWide ? space.xl : space.md,
      paddingBottom: space.xl * 2,
      gap: isWide ? space.xl : space.lg,
    },
    mobileContent: {
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: space.md,
      paddingTop: space.md,
      paddingBottom: 108,
      gap: space.md,
    },
    mobileHero: {
      borderRadius: radius.xl,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      overflow: 'hidden',
      ...shadow.sm,
    },
    mobileHeroCopy: {
      paddingHorizontal: space.lg,
      paddingTop: space.lg,
      paddingBottom: space.md,
      gap: space.sm,
    },
    mobileTitle: {
      fontSize: 30,
      lineHeight: 37,
      letterSpacing: 0,
    },
    mobileBody: {
      color: colors.textMuted,
      lineHeight: 24,
    },
    mobilePhotoWrap: {
      backgroundColor: isDark ? '#101010' : '#ECECEA',
      borderBottomWidth: 1,
      borderColor: colors.glassBorder,
      paddingHorizontal: space.sm,
      paddingVertical: space.sm,
    },
    mobilePhoto: {
      width: '100%',
      height: 214,
      borderRadius: radius.lg,
    },
    mobileActionRow: {
      padding: space.md,
      gap: space.sm,
    },
    mobilePrimary: {
      minHeight: 56,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.md,
      ...shadow.sm,
    },
    mobileSecondary: {
      minHeight: 52,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.md,
    },
    mobileSecondaryText: {
      color: colors.primaryDark,
      fontSize: font.sm,
      fontWeight: '900',
      textAlign: 'center',
    },
    mobileStart: {
      gap: space.sm,
    },
    mobileSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.sm,
    },
    mobileSectionLabel: {
      color: colors.text,
      fontSize: font.md,
      fontWeight: '900',
    },
    mobileTileGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
    },
    mobileTile: {
      width: '48.4%',
      minHeight: 132,
      borderRadius: radius.lg,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      padding: space.md,
      gap: 8,
      ...shadow.sm,
    },
    mobileTileWide: {
      width: '100%',
      minHeight: 112,
    },
    mobileTileIcon: {
      alignSelf: 'flex-start',
      minHeight: 34,
      minWidth: 54,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.sm,
    },
    mobileTileMark: {
      fontSize: font.xs,
      fontWeight: '900',
    },
    mobileTileTitle: {
      color: colors.text,
      fontSize: font.md,
      fontWeight: '900',
      lineHeight: 22,
    },
    mobileTileBody: {
      fontSize: font.xs,
      lineHeight: 19,
    },
    mobileCategories: {
      gap: space.sm,
    },
    mobileCategoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
    },
    mobileCategory: {
      width: '48.4%',
      minHeight: 116,
      borderRadius: radius.lg,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      padding: space.sm,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.sm,
    },
    mobileCategoryIcon: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mobileCategoryText: {
      color: colors.text,
      fontSize: font.xs,
      fontWeight: '900',
      textAlign: 'center',
      lineHeight: 18,
      marginTop: 8,
    },
    mobileFeatured: {
      gap: space.sm,
    },
    mobileH2: {
      fontSize: font.lg,
      lineHeight: 27,
    },
    mobileProvider: {
      minHeight: 94,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      padding: space.md,
      ...shadow.sm,
    },
    mobileProviderIcon: {
      width: 52,
      height: 52,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mobileProviderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    mobileProviderName: {
      color: colors.text,
      fontSize: font.sm,
      fontWeight: '900',
      lineHeight: 20,
    },
    mobileProviderMeta: {
      fontSize: font.xs,
      lineHeight: 18,
    },
    heroShell: {
      borderRadius: isWide ? 28 : radius.xl,
      overflow: 'hidden',
      backgroundColor: '#050505',
      ...shadow.md,
    },
    heroImage: {
      minHeight: isWide ? 560 : 700,
      justifyContent: 'flex-end',
    },
    heroScrim: {
      flex: 1,
      backgroundColor: isDark
        ? isWide
          ? 'rgba(0,0,0,0.44)'
          : 'rgba(0,0,0,0.52)'
        : isWide
          ? 'rgba(0,0,0,0.36)'
          : 'rgba(0,0,0,0.48)',
      padding: isWide ? space.xl : space.lg,
      justifyContent: 'flex-end',
    },
    heroLayout: {
      flex: 1,
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'flex-end' : 'stretch',
      justifyContent: 'space-between',
      gap: space.lg,
    },
    heroCopy: {
      maxWidth: isWide ? 580 : '100%',
      backgroundColor: isWide ? 'rgba(0,0,0,0.56)' : 'rgba(0,0,0,0.66)',
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      padding: isWide ? space.xl : space.lg,
    },
    kicker: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: font.xs,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    kickerDark: {
      color: colors.accentDark,
      fontSize: font.xs,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    heroTitle: {
      color: onImage,
      marginTop: space.sm,
      fontSize: isWide ? 48 : 32,
      lineHeight: isWide ? 56 : 39,
      maxWidth: 650,
    },
    heroBody: {
      color: 'rgba(255,255,255,0.84)',
      marginTop: space.md,
      maxWidth: 560,
    },
    signalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.lg },
    signalPill: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: radius.pill,
      paddingHorizontal: space.sm,
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
    },
    signalDot: {
      width: 7,
      height: 7,
      borderRadius: radius.pill,
      backgroundColor: 'rgba(255,255,255,0.92)',
    },
    signalText: { color: onImage, fontSize: font.xs, fontWeight: '800' },
    heroActions: { flexDirection: isWide ? 'row' : 'column', gap: space.sm, marginTop: space.lg },
    primaryCta: {
      minHeight: 58,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.lg,
      ...shadow.sm,
    },
    primaryCtaText: { fontSize: font.md, fontWeight: '900', textAlign: 'center' },
    secondaryCta: {
      minHeight: 58,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.26)',
      backgroundColor: 'rgba(255,255,255,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.lg,
    },
    secondaryCtaText: { color: onImage, fontSize: font.md, fontWeight: '900', textAlign: 'center' },
    heroProof: {
      width: isWide ? 286 : 320,
      marginRight: isWide ? 132 : 0,
      borderRadius: radius.xl,
      backgroundColor: 'rgba(255,255,255,0.82)',
      padding: isWide ? space.md : space.lg,
    },
    heroProofLabel: { color: '#0F2525', fontSize: font.sm, fontWeight: '900', lineHeight: 22 },
    heroProofBody: { color: '#526667', fontSize: font.xs, lineHeight: 20, marginTop: space.xs, fontWeight: '600' },
    metricGrid: {
      flexDirection: isWide ? 'row' : 'column',
      gap: space.sm,
    },
    metricCard: {
      flex: 1,
      minHeight: 120,
      borderRadius: radius.lg,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      padding: space.lg,
      justifyContent: 'space-between',
      ...shadow.sm,
    },
    metricNumber: { color: colors.accentDark, fontSize: font.xs, fontWeight: '900' },
    metricText: { color: colors.text, fontSize: font.md, lineHeight: 25, fontWeight: '900' },
    proofSection: {
      flexDirection: isWide ? 'row' : 'column',
      gap: space.lg,
      alignItems: 'stretch',
      borderRadius: radius.xl,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      padding: isWide ? space.xl : space.lg,
      ...shadow.sm,
    },
    proofCopy: { flex: 1.05, justifyContent: 'center' },
    proofTitle: { marginTop: space.sm },
    proofBody: { marginTop: space.sm, color: colors.textMuted },
    proofStack: { flex: 1, gap: space.sm },
    proofRow: {
      flexDirection: 'row',
      gap: space.md,
      alignItems: 'flex-start',
      borderRadius: radius.lg,
      backgroundColor: colors.chipBg,
      padding: space.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    proofIndex: { color: colors.primaryDark, fontSize: font.md, fontWeight: '900' },
    proofRowText: { flex: 1, color: colors.text, fontSize: font.sm, lineHeight: 22, fontWeight: '700' },
    quickGrid: {
      flexDirection: isWide ? 'row' : 'column',
      gap: space.sm,
    },
    quickPanel: {
      flex: 1,
      minHeight: isWide ? 190 : 132,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.cardStrong,
      padding: space.lg,
      justifyContent: 'space-between',
      ...shadow.sm,
    },
    quickMark: {
      alignSelf: 'flex-start',
      minWidth: 58,
      minHeight: 38,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.sm,
    },
    quickMarkText: { fontSize: font.xs, fontWeight: '900' },
    quickLabel: { color: colors.text, fontWeight: '900', fontSize: isWide ? font.lg : font.md, marginTop: space.md },
    quickCaption: { fontSize: font.sm, marginTop: space.xs },
    journeySection: {
      borderRadius: radius.xl,
      backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : '#050505',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.10)',
      padding: isWide ? space.xl : space.lg,
      gap: space.lg,
      ...shadow.md,
    },
    journeyKicker: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: font.xs,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    journeyTitle: { color: onImage },
    sectionHeader: { gap: space.xs },
    journeyRail: {
      flexDirection: isWide ? 'row' : 'column',
      gap: space.md,
    },
    journeyStep: {
      flex: 1,
      borderRadius: radius.lg,
      backgroundColor: 'rgba(255,255,255,0.10)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
      padding: space.lg,
      overflow: 'hidden',
    },
    journeyDot: {
      width: 42,
      height: 42,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    journeyDotText: { fontSize: font.sm, fontWeight: '900' },
    journeyLine: {
      height: 2,
      width: '46%',
      backgroundColor: 'rgba(255,255,255,0.24)',
      marginVertical: space.md,
    },
    journeyLabel: { color: onImage, fontSize: font.lg, fontWeight: '900' },
    journeyBody: { color: 'rgba(255,255,255,0.82)', marginTop: space.xs },
    railHeader: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginBottom: space.md,
      gap: space.md,
    },
    seeAll: { color: colors.primaryDark, fontWeight: '900', fontSize: font.sm },
    horizontalRail: {
      gap: space.sm,
      paddingBottom: space.xs,
      flexDirection: isWide ? 'row' : undefined,
      flexWrap: isWide ? 'wrap' : undefined,
    },
    railCard: {
      width: isWide ? undefined : 224,
      flexBasis: isWide ? '24%' : undefined,
      flexGrow: isWide ? 1 : 0,
      minHeight: 210,
      backgroundColor: colors.cardStrong,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      padding: space.lg,
      ...shadow.sm,
    },
    railCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    railIcon: {
      width: 54,
      height: 54,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    railEmoji: { fontSize: 27 },
    railVerified: { color: colors.success, fontWeight: '900', fontSize: font.xs },
    railName: { fontSize: font.md, fontWeight: '900', color: colors.text, lineHeight: font.md * 1.25, marginTop: space.md },
    railTown: { fontSize: font.xs, marginTop: 4 },
    railMeta: { gap: space.xs, marginTop: 'auto', paddingTop: space.md },
    railCategory: { color: colors.textMuted, fontSize: font.xs, fontWeight: '800' },
    categorySection: { gap: space.md },
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    cat: {
      width: isWide ? '15.4%' : '31.5%',
      minHeight: isWide ? 150 : 122,
      backgroundColor: colors.cardStrong,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      alignItems: 'center',
      justifyContent: 'center',
      padding: space.sm,
      ...shadow.sm,
    },
    catIcon: {
      width: 58,
      height: 58,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catEmoji: { fontSize: 29 },
    catLabel: {
      marginTop: 8,
      fontSize: font.xs,
      fontWeight: '900',
      color: colors.text,
      textAlign: 'center',
    },
    railsSection: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'stretch',
      gap: space.lg,
      borderRadius: radius.xl,
      backgroundColor: colors.cardStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      padding: isWide ? space.xl : space.lg,
      ...shadow.sm,
    },
    railsCopy: { flex: 1.1, gap: space.xs },
    railsBody: { fontSize: font.sm, marginTop: space.sm },
    railsWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    railChip: {
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.chipBg,
      paddingVertical: 10,
      paddingHorizontal: space.md,
    },
    railChipText: { color: colors.primaryDark, fontSize: font.xs, fontWeight: '900' },
  });
}
