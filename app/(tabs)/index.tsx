import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import AddReminderSheet from '../../src/components/AddReminderSheet';
import AnimatedSection from '../../src/components/animated-section';
import AppHeader from '../../src/components/AppHeader';
import CityPicker from '../../src/components/CityPicker';
import ServiceGlyph from '../../src/components/ServiceGlyph';
import SiteFooter from '../../src/components/SiteFooter';
import { DialFallbackDialog, H1, H2, Muted, useDialer } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useCity } from '../../src/context/CityContext';
import { useDisplayMode } from '../../src/context/DisplayModeContext';
import { useTheme } from '../../src/context/ThemeContext';
import { fetchFavoriteIds, fetchServices } from '../../src/lib/api';
import { listEvents } from '../../src/lib/calendar';
import { categoryColor } from '../../src/lib/categories';
import { buildNotifications, formatEventWhen, todayISO, upcomingEvents } from '../../src/lib/notifications';
import { refreshFamilyForSelf, syncFamilyForSelf } from '../../src/lib/familySync';
import { useLivePoll } from '../../src/lib/useLivePoll';
import {
  AppColors,
  PastelName,
  PastelTone,
  TAB_BAR_CLEARANCE,
  Tokens,
  family,
  pastelForMode,
  radius,
} from '../../src/lib/theme';
import { useTokens } from '../../src/lib/useTokens';
import { CalendarEvent, CareTeamCategory, CareTeamMember, FamilyFavorite, Service } from '../../src/lib/types';

const CARE_TEAM_ICONS: Record<CareTeamCategory, keyof typeof Feather.glyphMap> = {
  doctor: 'user',
  grocery: 'shopping-bag',
  pharmacy: 'plus-square',
  hospital: 'plus-circle',
  helper: 'users',
  other: 'phone',
};

const CARE_TEAM_TONES: Record<CareTeamCategory, PastelName> = {
  doctor: 'sky',
  grocery: 'sage',
  pharmacy: 'rose',
  hospital: 'coral',
  helper: 'lilac',
  other: 'peach',
};

// Easy view drops the entrance animation entirely. AnimatedSection owns its
// `entering` prop, so the only way to omit it without forking that shared
// component is to swap in a plain View with the same props.
function PlainSection({
  children,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={style}>{children}</View>;
}


export default function Home() {
  const router = useRouter();
  const { t } = useTranslation();
  const { displayName, user, session } = useAuth();
  const { colors, mode } = useTheme();
  const tones = pastelForMode(mode);
  const { width } = useWindowDimensions();
  const { isComputerMode } = useDisplayMode();
  const { city } = useCity();
  // Phone display mode always gets the narrow layout, even when the browser
  // window is wide — the shell is clamped to 480px in that mode.
  const isWide = isComputerMode && width >= 900;
  const tk = useTokens();
  const styles = useMemo(() => makeStyles(colors, isWide, tk), [colors, isWide, tk]);
  const Section = tk.isSimple ? PlainSection : AnimatedSection;
  const homeScrollRef = useRef<ScrollView>(null);
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [careTeam, setCareTeam] = useState<CareTeamMember[]>([]);
  const [familyPicks, setFamilyPicks] = useState<FamilyFavorite[]>([]);
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);
  const { dial, failedNumber, clearFailedNumber } = useDialer();

  const loadEvents = useCallback(() => {
    listEvents(user?.id).then(setEvents);
  }, [user?.id]);

  useEffect(() => {
    fetchServices(city).then(setAllServices);
  }, [city]);

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

  // A guardian adding a reminder from their own phone has to land here without
  // the senior navigating away and back. refreshFamilyForSelf rather than
  // syncFamilyForSelf: the latter answers from a cache that only clears when the
  // app is backgrounded, which is exactly what never happens on a screen someone
  // is watching.
  useLivePoll(() => {
    if (!user || !session?.access_token) return;
    refreshFamilyForSelf(session.access_token, user.id).then((result) => {
      setCareTeam(result.careTeam);
      setFamilyPicks(result.favorites);
      loadEvents();
    });
  });

  // Reminders are edited on /calendar, so re-read them every time Home regains focus.
  useFocusEffect(loadEvents);

  useEffect(() => {
    homeScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [isWide]);

  const today = todayISO();
  const nextEvents = useMemo(() => upcomingEvents(events, 3, today), [events, today]);
  const dueSoonCount = useMemo(() => buildNotifications(events, today).length, [events, today]);
  const verifiedCount = useMemo(() => allServices.filter((service) => service.verified).length, [allServices]);

  const stats: { icon: keyof typeof Feather.glyphMap; value: number; label: string; tone: PastelTone; onPress: () => void }[] = [
    { icon: 'bell', value: dueSoonCount, label: t('home.statUpcoming'), tone: tones.butter, onPress: () => router.push('/calendar') },
    { icon: 'heart', value: savedCount, label: t('home.statSaved'), tone: tones.rose, onPress: () => router.push('/services') },
    { icon: 'check-circle', value: verifiedCount, label: t('home.statVerified'), tone: tones.sage, onPress: () => router.push('/services') },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView ref={homeScrollRef} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scrollContent}>
        <AppHeader />
        <View style={styles.content}>
          <Section style={styles.intro}>
            <Text style={[styles.greeting, { color: colors.textMuted }]}>{t('home.greeting')}</Text>
            <H1 style={styles.title}>{displayName || t('home.guestName')}</H1>
            <Muted style={styles.subtitle}>{t('home.mobileNeedTitle')}</Muted>
            <CityPicker />
          </Section>

          <Section delay={40} style={styles.section}>
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
                  <Feather name={stat.icon} size={18} color={stat.tone.fg} />
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
                    <View style={styles.rowIcon}>
                      <Feather name="calendar" size={22} color={tones.sky.fg} />
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
                  <View style={styles.rowIcon}>
                    <Feather name="plus" size={22} color={tones.sky.fg} />
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
          </Section>

          {user ? (
            <Section delay={100} style={styles.section}>
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
                        <View style={styles.rowIcon}>
                          <Feather
                            name={CARE_TEAM_ICONS[member.category]}
                            size={22}
                            color={tones[CARE_TEAM_TONES[member.category]].fg}
                          />
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
                            onPress={() => dial(member.phone)}
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
                        <ServiceGlyph
                          category={pick.category ?? 'daily_service'}
                          color={categoryColor(pick.category ?? 'daily_service', mode).fg}
                          size={22}
                        />
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
                <View style={styles.rowIcon}>
                  <Feather name="users" size={20} color={tones.lilac.fg} />
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
            </Section>
          ) : null}

                  </View>
        <SiteFooter services={allServices} />
      </ScrollView>

      <AddReminderSheet
        visible={reminderSheetOpen}
        onClose={() => setReminderSheetOpen(false)}
        onSaved={loadEvents}
      />

      <DialFallbackDialog number={failedNumber} onClose={clearFailedNumber} />
    </View>
  );
}

function makeStyles(colors: AppColors, isWide: boolean | undefined, tk: Tokens & { isSimple: boolean }) {
  return StyleSheet.create({
    screen: { flex: 1 },
    scrollContent: { width: '100%' },
    content: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      paddingHorizontal: isWide ? tk.space.lg : tk.space.md,
      paddingTop: tk.space.lg,
      paddingBottom: isWide ? tk.space.xl : TAB_BAR_CLEARANCE,
      gap: tk.space.xl,
    },
    intro: { gap: tk.space.xs },
    greeting: { fontFamily: family.medium, fontSize: tk.font.sm, lineHeight: tk.font.sm * 1.4 },
    title: { fontFamily: family.medium, fontSize: isWide ? tk.font.xxl : 34, lineHeight: isWide ? tk.font.xxl * 1.13 : 41 },
    subtitle: { fontFamily: family.medium, fontSize: tk.font.md, lineHeight: tk.font.md * 1.4 },
    list: {
      borderWidth: 1,
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    row: {
      minHeight: tk.ROW_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: tk.space.md,
      paddingHorizontal: tk.space.md,
      paddingVertical: tk.space.sm,
    },
    // No chip behind the glyph: at this size a filled, bordered square reads as
    // a button the row is not, and six of them stacked turn a list into a grid.
    // The width is kept so every row's text still starts on the same edge.
    rowIcon: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowCopy: { flex: 1, minWidth: 0, gap: 2 },
    rowLabel: { flex: 1, fontFamily: family.semibold, fontSize: tk.font.md, lineHeight: tk.font.md * 1.3 },
    rowMeta: { flex: 0, fontFamily: family.regular, fontSize: tk.font.sm },
    addReminder: {
      minHeight: tk.TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: tk.space.xs,
      borderWidth: 1,
      borderRadius: radius.pill,
      paddingHorizontal: tk.space.md,
    },
    addReminderLabel: { fontFamily: family.semibold, fontSize: tk.font.sm },
    // Easy view stacks the three stat tiles one per line: side by side they
    // squeeze the scaled-up numerals and labels into two-line wraps.
    statRow: tk.isSimple
      ? { flexDirection: 'column', gap: tk.space.md }
      : { flexDirection: 'row', gap: tk.space.sm },
    statTile: {
      flex: tk.isSimple ? undefined : 1,
      width: tk.isSimple ? '100%' : undefined,
      minHeight: 96,
      gap: tk.space.xs,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: tk.space.sm,
      paddingVertical: tk.space.sm,
      justifyContent: 'center',
    },
    statValue: { fontFamily: family.heavy, fontSize: tk.font.xl, lineHeight: tk.font.xl * 1.1 },
    statLabel: { fontFamily: family.medium, fontSize: tk.font.xs, lineHeight: tk.font.xs * 1.3 },
    section: { gap: tk.space.md },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tk.space.md },
    seeAll: { minHeight: 40, paddingTop: 8, fontFamily: family.semibold, fontSize: tk.font.sm },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tk.isSimple ? tk.space.md : tk.space.sm },
    categoryTile: {
      flexGrow: 1,
      flexBasis: tk.isSimple ? '100%' : isWide ? '30%' : '47%',
      minHeight: tk.ROW_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: tk.space.sm,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: tk.space.md,
      paddingVertical: tk.space.sm,
    },
    categoryLabel: { flex: 1, fontFamily: family.semibold, fontSize: tk.font.sm, lineHeight: tk.font.sm * 1.35 },
    callBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tk.space.xs,
      minHeight: tk.TAP,
      paddingHorizontal: tk.space.md,
      borderRadius: radius.pill,
    },
    callBtnLabel: { fontFamily: family.semibold, fontSize: tk.font.sm },
    pickStrip: { gap: tk.space.sm, paddingVertical: 2 },
    pickCard: {
      width: 148,
      minHeight: 96,
      gap: tk.space.sm,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: tk.space.md,
      paddingVertical: tk.space.md,
      justifyContent: 'center',
    },
    pickName: { fontFamily: family.semibold, fontSize: tk.font.sm, lineHeight: tk.font.sm * 1.3 },
    guardianRow: {
      minHeight: tk.ROW_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: tk.space.md,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: tk.space.md,
      paddingVertical: tk.space.sm,
    },
    pressed: { opacity: 0.72 },
  });
}
