import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import AddReminderSheet from '../../src/components/AddReminderSheet';
import AnimatedSection from '../../src/components/animated-section';
import AppHeader from '../../src/components/AppHeader';
import ServiceGlyph from '../../src/components/ServiceGlyph';
import SiteFooter from '../../src/components/SiteFooter';
import { H1, H2, Muted, Stars } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { fetchFavoriteIds, fetchServices } from '../../src/lib/api';
import { listEvents } from '../../src/lib/calendar';
import { SERVICE_CATEGORIES } from '../../src/lib/categories';
import { buildNotifications, formatEventWhen, todayISO, upcomingEvents } from '../../src/lib/notifications';
import { syncFamilyForSelf } from '../../src/lib/familySync';
import { AppColors, ROW_MIN_HEIGHT, TAB_BAR_CLEARANCE, TAP, family, font, radius, space } from '../../src/lib/theme';
import { CalendarEvent, CareTeamCategory, CareTeamMember, FamilyFavorite, Service, ServiceCategory } from '../../src/lib/types';

const CARE_TEAM_ICONS: Record<CareTeamCategory, keyof typeof Feather.glyphMap> = {
  doctor: 'user',
  grocery: 'shopping-bag',
  pharmacy: 'plus-square',
  hospital: 'plus-circle',
  helper: 'users',
  other: 'phone',
};

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
  const { displayName, user, session } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const styles = makeStyles(colors, isWide);
  const homeScrollRef = useRef<ScrollView>(null);
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [featured, setFeatured] = useState<Service[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [careTeam, setCareTeam] = useState<CareTeamMember[]>([]);
  const [familyPicks, setFamilyPicks] = useState<FamilyFavorite[]>([]);
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);

  const loadEvents = useCallback(() => {
    listEvents().then(setEvents);
  }, []);

  useEffect(() => {
    fetchServices().then((all) => {
      setAllServices(all);
      setFeatured(pickMixedFeaturedServices(all));
    });
  }, []);

  // Stars are toggled on /services and /service/[id], so re-read the saved
  // count every time Home regains focus, not just when the user changes.
  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setSavedCount(0);
        return;
      }
      let active = true;
      fetchFavoriteIds(user.id).then((ids) => {
        if (active) setSavedCount(ids.size);
      });
      return () => {
        active = false;
      };
    }, [user]),
  );

  // Read back care team, saved services and reminders a linked guardian set
  // for this account, then re-read the calendar since sync may have added rows.
  useEffect(() => {
    if (!user || !session?.access_token) {
      setCareTeam([]);
      setFamilyPicks([]);
      return;
    }
    let active = true;
    syncFamilyForSelf(session.access_token, user.id).then((result) => {
      if (!active) return;
      setCareTeam(result.careTeam);
      setFamilyPicks(result.favorites);
      loadEvents();
    });
    return () => {
      active = false;
    };
  }, [user, session?.access_token, loadEvents]);

  // Reminders are edited on /calendar, so re-read them every time Home regains focus.
  useFocusEffect(loadEvents);

  useEffect(() => {
    homeScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [isWide]);

  const today = todayISO();
  const nextEvents = useMemo(() => upcomingEvents(events, 3, today), [events, today]);
  const dueSoonCount = useMemo(() => buildNotifications(events, today).length, [events, today]);
  const verifiedCount = useMemo(() => allServices.filter((service) => service.verified).length, [allServices]);

  const stats: { icon: keyof typeof Feather.glyphMap; value: number; label: string; onPress: () => void }[] = [
    { icon: 'bell', value: dueSoonCount, label: t('home.statUpcoming'), onPress: () => router.push('/calendar') },
    { icon: 'heart', value: savedCount, label: t('home.statSaved'), onPress: () => router.push('/services') },
    { icon: 'check-circle', value: verifiedCount, label: t('home.statVerified'), onPress: () => router.push('/services') },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <AppHeader />
      <ScrollView ref={homeScrollRef} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <AnimatedSection style={styles.intro}>
            <Text style={[styles.greeting, { color: colors.textMuted }]}>{t('home.greeting')}</Text>
            <H1 style={styles.title}>{displayName || t('home.guestName')}</H1>
            <Muted style={styles.subtitle}>{t('home.mobileNeedTitle')}</Muted>
            <Text style={[styles.launchCity, { color: colors.textSubtle }]}>{t('home.signalCity')}</Text>
          </AnimatedSection>

          <AnimatedSection delay={40} style={styles.section}>
            <View style={styles.sectionHeader}>
              <H2>{t('home.snapshotTitle')}</H2>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('reminders.newTitle')}
                onPress={() => setReminderSheetOpen(true)}
                style={({ pressed }) => [
                  styles.addReminder,
                  { borderColor: colors.border, backgroundColor: colors.bgAlt },
                  pressed && styles.pressed,
                ]}
              >
                <Feather name="plus" size={18} color={colors.text} />
                <Text style={[styles.addReminderLabel, { color: colors.text }]}>{t('reminders.add')}</Text>
              </Pressable>
            </View>

            <View style={styles.statRow}>
              {stats.map((stat) => (
                <Pressable
                  key={stat.label}
                  accessibilityRole="button"
                  accessibilityLabel={`${stat.value} ${stat.label}`}
                  onPress={stat.onPress}
                  style={({ pressed }) => [
                    styles.statTile,
                    { backgroundColor: colors.bgAlt, borderColor: colors.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <Feather name={stat.icon} size={18} color={colors.textMuted} />
                  <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={2}>
                    {stat.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.list, { borderColor: colors.border }]}>
              {nextEvents.length ? (
                nextEvents.map(({ event, dateISO }, index) => (
                  <Pressable
                    key={event.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${event.title}. ${formatEventWhen(dateISO, event.time)}`}
                    onPress={() => router.push('/calendar')}
                    style={({ pressed }) => [
                      styles.row,
                      index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                      <Feather name="calendar" size={22} color={colors.text} />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
                        {event.title}
                      </Text>
                      <Muted numberOfLines={1} style={styles.rowMeta}>
                        {formatEventWhen(dateISO, event.time)}
                        {event.repeat && event.repeat !== 'once'
                          ? ` · ${t(`reminders.repeat.${event.repeat}`)}`
                          : ''}
                      </Muted>
                    </View>
                    <Feather name="chevron-right" size={22} color={colors.textSubtle} />
                  </Pressable>
                ))
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/calendar')}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                    <Feather name="plus" size={22} color={colors.text} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>{t('home.remindersEmpty')}</Text>
                    <Muted numberOfLines={1} style={styles.rowMeta}>
                      {t('home.remindersEmptyHint')}
                    </Muted>
                  </View>
                  <Feather name="chevron-right" size={22} color={colors.textSubtle} />
                </Pressable>
              )}
            </View>
          </AnimatedSection>

          {user ? (
            <AnimatedSection delay={100} style={styles.section}>
              {careTeam.length ? (
                <>
                  <View style={styles.sectionHeader}>
                    <H2>{t('family.careTeamTitle')}</H2>
                  </View>
                  <View style={[styles.list, { borderColor: colors.border }]}>
                    {careTeam.map((member, index) => (
                      <View
                        key={member.id}
                        style={[
                          styles.row,
                          index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                        ]}
                      >
                        <View style={[styles.rowIcon, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                          <Feather name={CARE_TEAM_ICONS[member.category]} size={22} color={colors.text} />
                        </View>
                        <View style={styles.rowCopy}>
                          <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
                            {member.name}
                          </Text>
                          <Muted numberOfLines={1} style={styles.rowMeta}>
                            {t(`family.categories.${member.category}`)}
                          </Muted>
                        </View>
                        {member.phone ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${t('family.callContact')} ${member.name}`}
                            onPress={() => Linking.openURL(`tel:${member.phone}`)}
                            style={({ pressed }) => [
                              styles.callBtn,
                              { backgroundColor: colors.primary },
                              pressed && styles.pressed,
                            ]}
                          >
                            <Feather name="phone" size={18} color={colors.primaryFg} />
                            <Text style={[styles.callBtnLabel, { color: colors.primaryFg }]}>{t('family.callContact')}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              {familyPicks.length ? (
                <>
                  <View style={styles.sectionHeader}>
                    <H2>{t('family.favoritesTitle')}</H2>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.pickStrip}
                  >
                    {familyPicks.map((pick) => (
                      <Pressable
                        key={pick.id}
                        accessibilityRole="button"
                        accessibilityLabel={pick.name}
                        onPress={() => router.push(`/service/${pick.serviceId}`)}
                        style={({ pressed }) => [
                          styles.pickCard,
                          { backgroundColor: colors.card, borderColor: colors.border },
                          pressed && styles.pressed,
                        ]}
                      >
                        <ServiceGlyph category={pick.category ?? 'daily_service'} color={colors.text} size={22} />
                        <Text style={[styles.pickName, { color: colors.text }]} numberOfLines={2}>
                          {pick.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('family.guardianEntry')}
                onPress={() => router.push('/guardian')}
                style={({ pressed }) => [
                  styles.guardianRow,
                  { backgroundColor: colors.bgAlt, borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name="users" size={20} color={colors.text} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>
                    {t('family.guardianEntry')}
                  </Text>
                  <Muted numberOfLines={2} style={styles.rowMeta}>
                    {t('family.guardianEntryHint')}
                  </Muted>
                </View>
                <Feather name="chevron-right" size={22} color={colors.textSubtle} />
              </Pressable>
            </AnimatedSection>
          ) : null}

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

      <AddReminderSheet
        visible={reminderSheetOpen}
        onClose={() => setReminderSheetOpen(false)}
        onSaved={loadEvents}
      />
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
      paddingBottom: isWide ? space.xl : TAB_BAR_CLEARANCE,
      gap: space.xl,
    },
    intro: { gap: space.xs },
    greeting: { fontFamily: family.medium, fontSize: font.sm, lineHeight: font.sm * 1.4 },
    title: { fontFamily: family.medium, fontSize: isWide ? font.xxl : 34, lineHeight: isWide ? font.xxl * 1.13 : 41 },
    subtitle: { fontFamily: family.medium, fontSize: font.md, lineHeight: font.md * 1.4 },
    launchCity: { marginTop: space.xs, fontFamily: family.medium, fontSize: font.sm, lineHeight: font.sm * 1.4 },
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
    addReminder: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      borderWidth: 1,
      borderRadius: radius.pill,
      paddingHorizontal: space.sm,
    },
    addReminderLabel: { fontFamily: family.semibold, fontSize: font.sm },
    statRow: { flexDirection: 'row', gap: space.sm },
    statTile: {
      flex: 1,
      minHeight: 96,
      gap: space.xs,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: space.sm,
      paddingVertical: space.sm,
      justifyContent: 'center',
    },
    statValue: { fontFamily: family.heavy, fontSize: font.xl, lineHeight: font.xl * 1.1 },
    statLabel: { fontFamily: family.medium, fontSize: font.xs, lineHeight: font.xs * 1.3 },
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
    callBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      minHeight: TAP,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
    },
    callBtnLabel: { fontFamily: family.semibold, fontSize: font.sm },
    pickStrip: { gap: space.sm, paddingVertical: 2 },
    pickCard: {
      width: 148,
      minHeight: 96,
      gap: space.sm,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      justifyContent: 'center',
    },
    pickName: { fontFamily: family.semibold, fontSize: font.sm, lineHeight: font.sm * 1.3 },
    guardianRow: {
      minHeight: ROW_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    pressed: { opacity: 0.72 },
  });
}
