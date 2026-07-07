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
  type ImageStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AnimatedSection from '../../src/components/animated-section';
import AppHeader from '../../src/components/AppHeader';
import SiteFooter from '../../src/components/SiteFooter';
import { Badge, Body, Button, Card, H1, H2, Muted, Stars } from '../../src/components/ui';
import { AppColors, family, font, radius, shadow, space, tracking } from '../../src/lib/theme';
import { SERVICE_CATEGORIES, serviceEmoji } from '../../src/lib/categories';
import { fetchServices, fetchAnnouncements } from '../../src/lib/api';
import { Service, Announcement } from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useLocale } from '../../src/context/LocaleContext';

const heroImage = require('../../assets/saathi-hero-care.png');

type FeatherName = React.ComponentProps<typeof Feather>['name'];

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
  const { displayName, isAdmin } = useAuth();
  const { colors } = useTheme();
  const { lang } = useLocale();
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const isTranslatedLayout = lang !== 'en';
  const showHeroProof = width >= 1160;
  const styles = makeStyles(colors, isWide, isTranslatedLayout);
  const homeScrollRef = useRef<ScrollView>(null);
  const [featured, setFeatured] = useState<Service[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      homeScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [isWide]);

  useEffect(() => {
    fetchServices().then((all) => {
      const top = [...all]
        .filter((s) => s.verified)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 8);
      setFeatured(top.length ? top : all.slice(0, 8));
    });
    fetchAnnouncements().then(setAnnouncements);
  }, []);

  const quick: { label: string; caption: string; go: string; icon: FeatherName }[] = [
    {
      label: t('home.quickServices'),
      caption: t('home.heroPrimary'),
      go: '/services',
      icon: 'grid',
    },
    {
      label: t('home.quickCommunity'),
      caption: t('home.signalCaregiver'),
      go: '/community',
      icon: 'message-circle',
    },
    {
      label: t('home.quickHelp'),
      caption: t('home.heroSecondary'),
      go: '/help',
      icon: 'phone-call',
    },
    {
      label: t('home.myCalendar'),
      caption: t('calendar.upcoming'),
      go: '/calendar',
      icon: 'calendar',
    },
    {
      label: t('home.connectors'),
      caption: t('home.connectorsCaption'),
      go: '/connectors',
      icon: 'link',
    },
  ];
  const metrics = [
    t('home.metricCities'),
    t('home.metricProviders'),
    t('home.metricResponse'),
  ];

  const journey = [
    { label: t('home.journeyFind'), body: t('home.journeyFindBody') },
    { label: t('home.journeyConfirm'), body: t('home.journeyConfirmBody') },
    { label: t('home.journeyFollow'), body: t('home.journeyFollowBody') },
  ];

  const searchPill = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.heroPrimary')}
      onPress={() => router.push('/services')}
      style={({ pressed }) => [
        styles.searchPill,
        pressed && { backgroundColor: colors.cardStrong },
      ]}
    >
      <Feather name="search" size={22} color={colors.text} />
      <Text style={styles.searchPillText} numberOfLines={1}>
        {t('home.heroPrimary')}
      </Text>
    </Pressable>
  );

  const seeAllLink = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('home.seeAll')}
      onPress={() => router.push('/services')}
      style={({ pressed }) => [styles.seeAllBtn, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.seeAllText}>{t('home.seeAll')}</Text>
      <Feather name="arrow-right" size={16} color={colors.accent} />
    </Pressable>
  );

  const announcementsBlock =
    announcements.length > 0 ? (
      <AnimatedSection delay={60}>
        <Card style={styles.announceCard}>
          <H2>{t('announcements.title')}</H2>
          {announcements.map((a) => {
            const annTitle = lang === 'hi' && a.title_hi ? a.title_hi : a.title;
            const annBody = lang === 'hi' && a.body_hi ? a.body_hi : a.body;
            return (
              <View key={a.id} style={styles.announceItem}>
                <Text style={styles.announceItemTitle}>{annTitle}</Text>
                <Muted numberOfLines={3}>{annBody}</Muted>
                <Text style={styles.announceItemDate}>
                  {new Date(a.created_at).toLocaleDateString()}
                </Text>
              </View>
            );
          })}
        </Card>
      </AnimatedSection>
    ) : null;

  const quickList = (items: typeof quick) => (
    <Card style={styles.rowCard}>
      {items.map((q, index) => (
        <React.Fragment key={q.go}>
          {index > 0 ? <View style={styles.rowDivider} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={q.label}
            onPress={() => router.push(q.go as any)}
            style={({ pressed }) => [
              styles.listRow,
              pressed && { backgroundColor: colors.overlay },
            ]}
          >
            <View style={styles.listDisc}>
              <Feather name={q.icon} size={20} color={colors.text} />
            </View>
            <View style={styles.listCopy}>
              <Text style={styles.listTitle}>{q.label}</Text>
              <Text style={styles.listSubtitle} numberOfLines={2}>
                {q.caption}
              </Text>
            </View>
            <Feather name="chevron-right" size={22} color={colors.textSubtle} />
          </Pressable>
        </React.Fragment>
      ))}
    </Card>
  );

  const categoryTiles = (
    <View style={styles.tileGrid}>
      {SERVICE_CATEGORIES.map((c) => (
        <Pressable
          key={c.key}
          accessibilityRole="button"
          accessibilityLabel={t(`categories.${c.key}`)}
          onPress={() => router.push({ pathname: '/services', params: { category: c.key } })}
          style={styles.tileWrap}
        >
          {({ pressed }) => (
            <>
              <View
                style={[
                  styles.tile,
                  {
                    backgroundColor: pressed ? colors.cardStrong : colors.surfaceTint,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                <Text style={styles.tileEmoji}>{c.emoji}</Text>
              </View>
              <Text style={styles.tileLabel} numberOfLines={2}>
                {t(`categories.${c.key}`)}
              </Text>
            </>
          )}
        </Pressable>
      ))}
    </View>
  );

  const providerCard = (s: Service) => (
    <Pressable
      key={s.id}
      accessibilityRole="button"
      accessibilityLabel={s.name}
      onPress={() => router.push(`/service/${s.id}`)}
      style={({ pressed }) => [
        styles.providerCard,
        { backgroundColor: pressed ? colors.cardStrong : colors.cardSolid },
        isWide && styles.providerCardWide,
      ]}
    >
      <View style={styles.providerLead}>
        <Text style={styles.providerEmoji}>{serviceEmoji(s.category)}</Text>
      </View>
      <View style={styles.providerCopy}>
        <Text style={styles.providerName} numberOfLines={2}>
          {s.name}
        </Text>
        <Text style={styles.providerMeta} numberOfLines={1}>
          {t(`categories.${s.category}`)}
          {s.town ? ` · ${s.town}` : ''}
        </Text>
        <View style={styles.providerRating}>
          <Stars rating={s.rating} />
          {s.verified ? <Badge label={t('common.verified')} /> : null}
        </View>
      </View>
      <Feather name="chevron-right" size={22} color={colors.textSubtle} />
    </Pressable>
  );

  const adminBlock = isAdmin ? (
    <View style={styles.adminWrap}>
      <Button
        label={t('home.adminArea')}
        variant="secondary"
        onPress={() => router.push('/admin')}
      />
    </View>
  ) : null;

  if (!isWide) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <AppHeader />
        <ScrollView
          ref={homeScrollRef}
          contentContainerStyle={styles.mobileContent}
          contentInsetAdjustmentBehavior="automatic"
        >
          <AnimatedSection>
            <Card style={styles.heroCard}>
              <Text style={styles.kicker}>{t('home.heroKicker')}</Text>
              <H1 style={styles.greetingTitle}>
                {t('home.greeting')}
                {displayName ? `, ${displayName}` : ''}. {t('home.heroTitle')}
              </H1>
              <Body style={styles.heroBodyText}>{t('home.heroBody')}</Body>
              <View style={styles.signalRow}>
                {[t('home.signalCity'), t('home.signalVerified'), t('home.signalCaregiver')].map(
                  (label) => (
                    <View key={label} style={styles.signalPill}>
                      <Feather name="check" size={16} color={colors.text} />
                      <Text style={styles.signalText} numberOfLines={1}>
                        {label}
                      </Text>
                    </View>
                  ),
                )}
              </View>
              <View style={styles.heroPhotoWrap}>
                <Image
                  source={heroImage}
                  resizeMode="cover"
                  style={styles.heroPhoto as ImageStyle}
                  accessibilityLabel={t('home.heroPhotoAlt')}
                />
              </View>
              {searchPill}
              <View style={styles.heroActionsWide}>
                <View style={styles.heroActionItem}>
                  <Button label={t('home.heroPrimary')} onPress={() => router.push('/services')} />
                </View>
                <View style={styles.heroActionItem}>
                  <Button
                    label={t('home.heroSecondary')}
                    variant="secondary"
                    onPress={() => router.push('/help')}
                  />
                </View>
              </View>
              <View style={styles.heroProof}>
                <Text style={styles.heroProofLabel}>{t('home.scaleTitle')}</Text>
                <Text style={styles.heroProofBody}>{t('home.scaleBody')}</Text>
              </View>
            </Card>
          </AnimatedSection>

          {announcementsBlock}

          <AnimatedSection delay={80}>
            <View style={styles.metricGrid}>
              {metrics.map((metric, index) => (
                <View key={metric} style={styles.metricCard}>
                  <Text style={styles.metricNumber}>{`0${index + 1}`}</Text>
                  <Text style={styles.metricText}>{metric}</Text>
                </View>
              ))}
            </View>
          </AnimatedSection>

          <AnimatedSection delay={140}>
            <Card style={styles.proofCard}>
              <View style={styles.proofCopy}>
                <Text style={styles.kicker}>{t('home.trustTitle')}</Text>
                <H2 style={styles.proofTitle}>{t('home.proofTitle')}</H2>
                <Body style={styles.proofBody}>{t('home.proofBody')}</Body>
              </View>
              <View style={styles.proofStack}>
                {[
                  t('home.opsVerifyBody'),
                  t('home.opsCoordinateBody'),
                  t('home.opsEscalateBody'),
                ].map((item, index) => (
                  <View key={item} style={[styles.proofRow, index > 0 && styles.proofRowDivider]}>
                    <View style={styles.listDisc}>
                      <Text style={styles.stepIndex}>{index + 1}</Text>
                    </View>
                    <Text style={styles.proofRowText}>{item}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </AnimatedSection>

          <AnimatedSection delay={200} style={styles.section}>
            {quickList(quick)}
          </AnimatedSection>

          {featured.length > 0 ? (
            <AnimatedSection delay={260} style={[styles.section, styles.featuredSection]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderBlock}>
                  <Text style={styles.kicker}>{t('common.verified')}</Text>
                  <H2>{t('home.topRated')}</H2>
                </View>
                {seeAllLink}
              </View>
              <View style={styles.providerStack}>{featured.slice(0, 3).map(providerCard)}</View>
            </AnimatedSection>
          ) : null}

          <AnimatedSection delay={320} style={styles.section}>
            <View style={styles.sectionHeaderBlock}>
              <Text style={styles.kicker}>{t('home.scaleTitle')}</Text>
              <H2>{t('home.browseCategories')}</H2>
            </View>
            {categoryTiles}
          </AnimatedSection>

          <AnimatedSection delay={380}>
            <Card style={styles.journeyCard}>
              <View style={styles.sectionHeaderBlock}>
                <Text style={styles.kicker}>{t('home.journeyTitle')}</Text>
                <H2>{t('home.opsTitle')}</H2>
              </View>
              <View style={styles.journeyRail}>
                {journey.map((step, index) => (
                  <View
                    key={step.label}
                    style={[styles.journeyStep, index > 0 && styles.journeyStepBorder]}
                  >
                    <View style={styles.listDisc}>
                      <Text style={styles.stepIndex}>{index + 1}</Text>
                    </View>
                    <Text style={styles.journeyLabel}>{step.label}</Text>
                    <Muted style={styles.journeyBody}>{step.body}</Muted>
                  </View>
                ))}
              </View>
            </Card>
          </AnimatedSection>

          <AnimatedSection delay={440}>
            <Card style={styles.railsCard}>
              <View style={styles.railsCopy}>
                <Text style={styles.kicker}>{t('home.railsTitle')}</Text>
                <H2>{t('home.scaleTitle')}</H2>
                <Muted style={styles.railsBody}>{t('home.railsBody')}</Muted>
              </View>
              <View style={styles.railsWrap}>
                {TRUST_RAILS.map((rail) => (
                  <Pressable
                    key={rail.label}
                    accessibilityRole="link"
                    accessibilityLabel={rail.label}
                    onPress={() => Linking.openURL(rail.url)}
                    style={({ pressed }) => [
                      styles.railChip,
                      pressed && { backgroundColor: colors.cardStrong },
                    ]}
                  >
                    <Text style={styles.railChipText}>{rail.label}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          </AnimatedSection>

          {adminBlock}
          <SiteFooter />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <AppHeader />
      <ScrollView
        ref={homeScrollRef}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <AnimatedSection>
          <Card style={styles.heroCardWide}>
            <View style={styles.heroCopyWide}>
              <Text style={styles.kicker}>{t('home.heroKicker')}</Text>
              <H1 style={styles.heroTitleWide}>
                {t('home.greeting')}
                {displayName ? `, ${displayName}` : ''}. {t('home.heroTitle')}
              </H1>
              <Body style={styles.heroBodyText}>{t('home.heroBody')}</Body>

              <View style={styles.signalRow}>
                {[t('home.signalCity'), t('home.signalVerified'), t('home.signalCaregiver')].map(
                  (label) => (
                    <View key={label} style={styles.signalPill}>
                      <Feather name="check" size={16} color={colors.text} />
                      <Text style={styles.signalText} numberOfLines={1}>
                        {label}
                      </Text>
                    </View>
                  ),
                )}
              </View>

              <View style={styles.heroSearchWide}>{searchPill}</View>

              <View style={styles.heroActionsWide}>
                <View style={styles.heroActionItem}>
                  <Button label={t('home.heroPrimary')} onPress={() => router.push('/services')} />
                </View>
                <View style={styles.heroActionItem}>
                  <Button
                    label={t('home.heroSecondary')}
                    variant="secondary"
                    onPress={() => router.push('/help')}
                  />
                </View>
              </View>

              {showHeroProof ? (
                <View style={styles.heroProof}>
                  <Text style={styles.heroProofLabel}>{t('home.scaleTitle')}</Text>
                  <Text style={styles.heroProofBody}>{t('home.scaleBody')}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.heroMediaWide}>
              <Image
                source={heroImage}
                resizeMode="cover"
                style={styles.heroPhotoWide as ImageStyle}
                accessibilityLabel={t('home.heroPhotoAlt')}
              />
            </View>
          </Card>
        </AnimatedSection>

        {announcementsBlock}

        <AnimatedSection delay={80}>
          <View style={styles.metricGrid}>
            {metrics.map((metric, index) => (
              <View key={metric} style={styles.metricCard}>
                <Text style={styles.metricNumber}>{`0${index + 1}`}</Text>
                <Text style={styles.metricText}>{metric}</Text>
              </View>
            ))}
          </View>
        </AnimatedSection>

        <AnimatedSection delay={140}>
          <Card style={styles.proofCard}>
            <View style={styles.proofCopy}>
              <Text style={styles.kicker}>{t('home.trustTitle')}</Text>
              <H2 style={styles.proofTitle}>{t('home.proofTitle')}</H2>
              <Body style={styles.proofBody}>{t('home.proofBody')}</Body>
            </View>
            <View style={styles.proofStack}>
              {[
                t('home.opsVerifyBody'),
                t('home.opsCoordinateBody'),
                t('home.opsEscalateBody'),
              ].map((item, index) => (
                <View key={item} style={[styles.proofRow, index > 0 && styles.proofRowDivider]}>
                  <View style={styles.listDisc}>
                    <Text style={styles.stepIndex}>{index + 1}</Text>
                  </View>
                  <Text style={styles.proofRowText}>{item}</Text>
                </View>
              ))}
            </View>
          </Card>
        </AnimatedSection>

        <AnimatedSection delay={200} style={styles.section}>
          {quickList(quick)}
        </AnimatedSection>

        {featured.length > 0 ? (
          <AnimatedSection delay={260} style={[styles.section, styles.featuredSection]}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderBlock}>
                <Text style={styles.kicker}>{t('common.verified')}</Text>
                <H2>{t('home.topRated')}</H2>
              </View>
              {seeAllLink}
            </View>
            <View style={styles.providerGrid}>{featured.slice(0, 4).map(providerCard)}</View>
          </AnimatedSection>
        ) : null}

        <AnimatedSection delay={320} style={styles.section}>
          <View style={styles.sectionHeaderBlock}>
            <Text style={styles.kicker}>{t('home.scaleTitle')}</Text>
            <H2>{t('home.browseCategories')}</H2>
          </View>
          {categoryTiles}
        </AnimatedSection>

        <AnimatedSection delay={380}>
          <Card style={styles.journeyCard}>
            <View style={styles.sectionHeaderBlock}>
              <Text style={styles.kicker}>{t('home.journeyTitle')}</Text>
              <H2>{t('home.opsTitle')}</H2>
            </View>
            <View style={styles.journeyRail}>
              {journey.map((step, index) => (
                <View
                  key={step.label}
                  style={[styles.journeyStep, index > 0 && styles.journeyStepBorder]}
                >
                  <View style={styles.listDisc}>
                    <Text style={styles.stepIndex}>{index + 1}</Text>
                  </View>
                  <Text style={styles.journeyLabel}>{step.label}</Text>
                  <Muted style={styles.journeyBody}>{step.body}</Muted>
                </View>
              ))}
            </View>
          </Card>
        </AnimatedSection>

        {adminBlock}

        <AnimatedSection delay={440}>
          <Card style={styles.railsCard}>
            <View style={styles.railsCopy}>
              <Text style={styles.kicker}>{t('home.railsTitle')}</Text>
              <H2>{t('home.scaleTitle')}</H2>
              <Muted style={styles.railsBody}>{t('home.railsBody')}</Muted>
            </View>
            <View style={styles.railsWrap}>
              {TRUST_RAILS.map((rail) => (
                <Pressable
                  key={rail.label}
                  accessibilityRole="link"
                  accessibilityLabel={rail.label}
                  onPress={() => Linking.openURL(rail.url)}
                  style={({ pressed }) => [
                    styles.railChip,
                    pressed && { backgroundColor: colors.cardStrong },
                  ]}
                >
                  <Text style={styles.railChipText}>{rail.label}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
        </AnimatedSection>
        <SiteFooter />
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: AppColors, isWide: boolean, isTranslatedLayout: boolean) {
  const heroTitleSize = isTranslatedLayout ? (isWide ? 32 : 25) : isWide ? font.display : font.xl;
  const heroTitleLine = isTranslatedLayout ? Math.round(heroTitleSize * 1.52) : Math.round(heroTitleSize * 1.18);
  const bodyLine = isTranslatedLayout ? Math.round(font.sm * 1.65) : Math.round(font.md * 1.5);

  return StyleSheet.create({
    screen: { flex: 1 },
    content: {
      width: '100%',
      paddingHorizontal: isWide ? space.xl : space.md,
      paddingTop: space.sm,
      paddingBottom: 0,
      gap: space.lg,
      flexGrow: 1,
    },
    mobileContent: {
      width: '100%',
      paddingHorizontal: space.md,
      paddingTop: space.sm,
      paddingBottom: 0,
      gap: space.lg,
      flexGrow: 1,
    },

    // Shared
    kicker: {
      color: colors.textMuted,
      fontSize: font.xs,
      fontFamily: family.medium,
      lineHeight: isTranslatedLayout ? Math.round(font.xs * 1.55) : Math.round(font.xs * 1.4),
      letterSpacing: isTranslatedLayout ? 0 : 0.8,
      textTransform: 'uppercase',
    },
    section: { gap: space.md },
    featuredSection: { marginTop: 0 },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: space.md,
    },
    sectionHeaderBlock: { gap: space.xs },
    seeAllBtn: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    seeAllText: {
      color: colors.accent,
      fontSize: font.sm,
      fontFamily: family.semibold,
    },
    searchPill: {
      height: 56,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    searchPillText: {
      flex: 1,
      color: colors.textMuted,
      fontSize: isTranslatedLayout ? font.sm : font.md,
      fontFamily: family.semibold,
      lineHeight: isTranslatedLayout ? Math.round(font.sm * 1.55) : undefined,
    },

    // Greeting (mobile)
    greetingBlock: { gap: space.sm },
    greetingTitle: {
      fontSize: heroTitleSize,
      lineHeight: heroTitleLine,
      letterSpacing: isTranslatedLayout ? 0 : tracking.xl,
    },

    // Hero (mobile)
    heroCard: { gap: space.md },
    heroPhotoWrap: {
      height: 150,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceTint,
      overflow: 'hidden',
    },
    heroPhoto: { width: '100%', height: '100%' },
    heroBodyText: {
      color: colors.textMuted,
      fontSize: isTranslatedLayout ? font.sm : font.md,
      lineHeight: bodyLine,
    },
    heroActions: { gap: 12 },

    // Hero (wide)
    heroCardWide: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: radius.xl,
      padding: 0,
    },
    heroCopyWide: {
      flex: 1.05,
      padding: isTranslatedLayout ? space.lg : space.xl,
      gap: isTranslatedLayout ? space.sm : space.md,
    },
    heroTitleWide: {
      fontSize: heroTitleSize,
      lineHeight: heroTitleLine,
      letterSpacing: isTranslatedLayout ? 0 : tracking.display,
    },
    heroSearchWide: { maxWidth: 480 },
    heroActionsWide: {
      flexDirection: isWide ? 'row' : 'column',
      gap: 12,
      maxWidth: 560,
    },
    heroActionItem: { flex: 1 },
    heroMediaWide: { flex: isTranslatedLayout ? 0.92 : 1, minHeight: isTranslatedLayout ? 520 : 460 },
    heroPhotoWide: { width: '100%', height: '100%' },
    signalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    signalPill: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      backgroundColor: colors.surfaceTint,
      maxWidth: isTranslatedLayout ? 230 : undefined,
    },
    signalText: {
      flexShrink: 1,
      color: colors.text,
      fontSize: font.xs,
      fontFamily: family.medium,
      lineHeight: isTranslatedLayout ? Math.round(font.xs * 1.55) : undefined,
    },
    heroProof: {
      borderRadius: radius.md,
      backgroundColor: colors.surfaceTint,
      padding: space.md,
      gap: space.xs,
      maxWidth: 480,
    },
    heroProofLabel: {
      color: colors.text,
      fontSize: font.sm,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.sm * 1.45),
    },
    heroProofBody: {
      color: colors.textMuted,
      fontSize: font.xs,
      fontFamily: family.regular,
      lineHeight: Math.round(font.xs * 1.4),
    },

    // Announcements
    announceCard: { gap: space.sm },
    announceItem: {
      gap: space.xs,
      paddingTop: space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    announceItemTitle: {
      color: colors.text,
      fontSize: font.md,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.md * 1.5),
    },
    announceItemDate: {
      color: colors.textSubtle,
      fontSize: font.xs,
      fontFamily: family.medium,
      lineHeight: Math.round(font.xs * 1.4),
    },

    // Quick-action list (Uber row anatomy)
    rowCard: { padding: 0 },
    listRow: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: space.md,
      gap: 12,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 72,
    },
    listDisc: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listCopy: { flex: 1, minWidth: 0 },
    listTitle: {
      color: colors.text,
      fontSize: font.md,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.md * 1.5),
    },
    listSubtitle: {
      color: colors.textMuted,
      fontSize: font.sm,
      fontFamily: family.regular,
      lineHeight: Math.round(font.sm * 1.45),
      marginTop: 2,
    },

    // Category tiles (Uber suggestions grid)
    tileGrid: {
      flexDirection: 'row',
      flexWrap: isWide ? 'nowrap' : 'wrap',
      alignItems: 'flex-start',
      gap: isWide ? 14 : 12,
    },
    tileWrap: isWide
      ? {
          flex: 1,
          minWidth: 0,
          minHeight: 112,
        }
      : {
          width: '30%',
          minHeight: 118,
        },
    tile: {
      height: isWide ? 88 : 80,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileEmoji: { fontSize: 34 },
    tileLabel: {
      marginTop: isWide ? 10 : space.xs,
      color: colors.text,
      fontSize: font.xs,
      fontFamily: family.medium,
      lineHeight: Math.round(font.xs * 1.3),
      textAlign: 'center',
    },

    // Provider cards (Kroger anatomy)
    providerStack: { gap: 12 },
    providerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    providerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space.md,
      ...shadow.sm,
    },
    providerCardWide: { width: '48.8%' },
    providerLead: {
      width: 64,
      height: 64,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    providerEmoji: { fontSize: 32 },
    providerCopy: { flex: 1, minWidth: 0 },
    providerName: {
      color: colors.text,
      fontSize: font.md,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.md * 1.35),
    },
    providerMeta: {
      color: colors.textMuted,
      fontSize: font.sm,
      fontFamily: family.regular,
      lineHeight: Math.round(font.sm * 1.45),
      marginTop: space.xs,
    },
    providerRating: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 6,
    },

    // Metrics (wide)
    metricGrid: { flexDirection: isWide ? 'row' : 'column', gap: 12 },
    metricCard: {
      flex: 1,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: space.lg,
      gap: space.sm,
      ...shadow.sm,
    },
    metricNumber: {
      color: colors.text,
      fontSize: font.xl,
      fontFamily: family.heavy,
      letterSpacing: tracking.xl,
      lineHeight: Math.round(font.xl * 1.25),
    },
    metricText: {
      color: colors.textMuted,
      fontSize: font.sm,
      fontFamily: family.medium,
      lineHeight: Math.round(font.sm * 1.45),
    },

    // Proof (wide)
    proofCard: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: 'stretch',
      gap: space.lg,
      padding: isWide ? space.xl : space.md,
    },
    proofCopy: { flex: 1.05, justifyContent: 'center', gap: space.xs },
    proofTitle: { marginTop: space.xs },
    proofBody: { color: colors.textMuted, marginTop: space.xs },
    proofStack: { flex: 1 },
    proofRow: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
    },
    proofRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    stepIndex: {
      color: colors.text,
      fontSize: font.md,
      fontFamily: family.bold,
    },
    proofRowText: {
      flex: 1,
      color: colors.text,
      fontSize: font.sm,
      fontFamily: family.regular,
      lineHeight: Math.round(font.sm * 1.45),
    },

    // Journey (wide)
    journeyCard: { gap: space.lg, padding: isWide ? space.xl : space.md },
    journeyRail: { flexDirection: isWide ? 'row' : 'column', gap: space.lg },
    journeyStep: { flex: 1 },
    journeyStepBorder: {
      borderLeftWidth: isWide ? StyleSheet.hairlineWidth : 0,
      borderTopWidth: isWide ? 0 : StyleSheet.hairlineWidth,
      borderLeftColor: colors.border,
      borderTopColor: colors.border,
      paddingLeft: isWide ? space.lg : 0,
      paddingTop: isWide ? 0 : space.lg,
    },
    journeyLabel: {
      color: colors.text,
      fontSize: font.md,
      fontFamily: family.semibold,
      lineHeight: Math.round(font.md * 1.5),
      marginTop: 12,
    },
    journeyBody: { marginTop: space.xs },

    // Trust rails (wide)
    railsCard: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'stretch',
      gap: space.lg,
      padding: isWide ? space.xl : space.md,
    },
    railsCopy: { flex: 1.1, gap: space.xs },
    railsBody: { marginTop: space.xs },
    railsWrap: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.sm,
    },
    railChip: {
      minHeight: 44,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.md,
    },
    railChipText: {
      color: colors.accent,
      fontSize: font.sm,
      fontFamily: family.semibold,
    },

    // Admin
    adminWrap: isWide ? { alignSelf: 'flex-start', minWidth: 260 } : {},
  });
}
