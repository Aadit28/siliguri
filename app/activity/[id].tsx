import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Body, Button, Card, Dialog, H1, H2, Muted } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useCity } from '../../src/context/CityContext';
import { useDisplayMode } from '../../src/context/DisplayModeContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import {
  ActivityCategory,
  localizeActivity,
} from '../../src/data/mockActivities';
import { getActivity, joinActivity, leaveActivity } from '../../src/lib/activities';
import { syncActivitiesForParticipant } from '../../src/lib/activityCalendarSync';
import { listFamilyLinks } from '../../src/lib/family';
import type { Lang } from '../../src/lib/languages';
import type { Activity, ActivitySession } from '../../src/lib/types';
import {
  AppColors,
  PastelName,
  family,
  font,
  pastelForMode,
  radius,
  space,
  TAP,
} from '../../src/lib/theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];
type PendingAction = 'join' | 'leave' | null;
type StatusMessage = { tone: 'success' | 'warning' | 'error'; text: string } | null;
type ActivitySupport = 'chairAvailable' | 'wheelchairFriendly' | 'caregiverWelcome';

const CATEGORY_ICONS: Record<ActivityCategory, FeatherName> = {
  yoga: 'sunrise',
  fitness: 'activity',
  learning: 'book-open',
  creative: 'edit-3',
  social: 'users',
  wellness: 'heart',
};

const CATEGORY_TONES: Record<ActivityCategory, PastelName> = {
  yoga: 'lilac',
  fitness: 'sage',
  learning: 'sky',
  creative: 'peach',
  social: 'rose',
  wellness: 'butter',
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function futureSessions(activity: Activity) {
  const now = Date.now();
  return activity.sessions
    .filter((session) => Date.parse(session.startsAt) >= now)
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
}

function formatSessionDate(session: ActivitySession, lang: Lang) {
  const date = new Date(session.startsAt);
  if (!Number.isFinite(date.getTime())) return session.startsAt;
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat(`${lang}-IN`, { ...options, timeZone: session.timezone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(`${lang}-IN`, options).format(date);
  }
}

function formatSessionEnd(session: ActivitySession, lang: Lang) {
  if (!session.endsAt) return null;
  const date = new Date(session.endsAt);
  if (!Number.isFinite(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  try {
    return new Intl.DateTimeFormat(`${lang}-IN`, { ...options, timeZone: session.timezone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(`${lang}-IN`, options).format(date);
  }
}

function sessionDurationMinutes(session: ActivitySession | undefined) {
  if (!session?.endsAt) return null;
  const minutes = Math.round((Date.parse(session.endsAt) - Date.parse(session.startsAt)) / 60_000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

export default function ActivityDetailScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    participantId?: string | string[];
    participantName?: string | string[];
  }>();
  const id = firstParam(params.id);
  const participantId = firstParam(params.participantId);
  const router = useRouter();
  const { t } = useTranslation();
  const { lang } = useLocale();
  const { session, user, displayName } = useAuth();
  const { city } = useCity();
  const { colors, mode } = useTheme();
  const { isComputerMode } = useDisplayMode();
  const { width } = useWindowDimensions();
  const isWide = isComputerMode && width >= 920;
  const styles = makeStyles(colors, isWide);
  const token = session?.access_token;
  const effectiveParticipantId = participantId ?? user?.id;
  const [participantName, setParticipantName] = useState<string | null>(null);
  const participantLabel = participantId
    ? participantName || t('activities.linkedFamilyMember')
    : displayName || t('activities.yourAccount');
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);

  useEffect(() => {
    let active = true;
    setParticipantName(null);
    if (!token || !participantId) return () => { active = false; };
    listFamilyLinks(token)
      .then(({ asGuardian }) => {
        if (!active) return;
        const link = asGuardian.find(
          (item) => item.parentId === participantId && item.status === 'active',
        );
        setParticipantName(link?.parentName || link?.parentPhone || null);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [participantId, token]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setActivity(null);
    setStatus(null);
    if (!id) {
      setLoading(false);
      return () => { active = false; };
    }
    getActivity(id, token, participantId, city)
      .then((nextActivity) => {
        if (active) setActivity(nextActivity);
      })
      .catch(() => {
        if (active) setActivity(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [city, id, participantId, token]);

  const sessions = useMemo(() => (activity ? futureSessions(activity) : []), [activity]);

  const leaveDetail = () => {
    if (router.canGoBack()) router.back();
    else {
      router.replace({
        pathname: '/activities',
        params: {
          ...(participantId ? { participantId } : {}),
          ...(participantName ? { participantName } : {}),
        },
      });
    }
  };

  const screenOptions = {
    title: activity ? t(`activities.categories.${activity.category}`) : t('activities.title'),
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.nav },
    headerTintColor: colors.text,
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.notFound, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={screenOptions} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!activity) {
    return (
      <View style={[styles.screen, styles.notFound, { backgroundColor: colors.bg }]}>
        <Stack.Screen
          options={{
            ...screenOptions,
          }}
        />
        <View style={[styles.notFoundIcon, { backgroundColor: colors.bgAlt }]}>
          <Feather name="calendar" size={30} color={colors.textMuted} />
        </View>
        <H1 style={styles.notFoundTitle}>{t('activities.notFoundTitle')}</H1>
        <Muted style={styles.notFoundBody}>{t('activities.notFoundBody')}</Muted>
        <View style={styles.notFoundAction}>
          <Button label={t('activities.backToCatalog')} onPress={leaveDetail} />
        </View>
      </View>
    );
  }

  const isPreview = activity.catalogSource === 'preview';
  const tone = pastelForMode(mode)[CATEGORY_TONES[activity.category]];
  const title = isPreview ? localizeActivity(activity, lang, 'title') : activity.title;
  const description = isPreview
    ? localizeActivity(activity, lang, 'description')
    : activity.description ?? '';
  const languageList = activity.languages
    .map((language) => {
      const normalized = language.toLocaleLowerCase();
      if (normalized.includes('bengali') || normalized.includes('bangla')) return t('activities.languageNames.bn');
      if (normalized.includes('hindi')) return t('activities.languageNames.hi');
      if (normalized.includes('english')) return t('activities.languageNames.en');
      return language;
    })
    .join(' · ');
  const supports: ActivitySupport[] = [
    ...(activity.chairAvailable ? (['chairAvailable'] as const) : []),
    ...(activity.wheelchairAccessible ? (['wheelchairFriendly'] as const) : []),
    ...(activity.caregiverWelcome ? (['caregiverWelcome'] as const) : []),
  ];
  const nextSession = sessions.find((item) => item.status === 'scheduled');
  const joined = activity.enrollment?.status === 'joined';
  const waitlisted = activity.enrollment?.status === 'waitlisted';
  const hasActiveEnrollment = joined || waitlisted;
  const full = nextSession?.spotsRemaining === 0;
  const waitlistAvailable = activity.waitlistSpotsRemaining > 0;
  const fullyBooked = full && !waitlistAvailable;
  const actionDisabled =
    !hasActiveEnrollment && (!activity.registrationOpen || !nextSession || fullyBooked);
  const actionLabel = !token
    ? t('activities.signInToJoin')
    : waitlisted
      ? t('activities.leaveWaitlist')
      : joined
        ? t('activities.leave')
        : full
          ? t('activities.joinWaitlist')
          : t('activities.join');

  function requestEnrollmentChange() {
    setStatus(null);
    if (!token || !user) {
      router.push('/login');
      return;
    }
    if (isPreview) return;
    setPendingAction(hasActiveEnrollment ? 'leave' : 'join');
  }

  async function confirmEnrollmentChange() {
    if (!pendingAction || !token || !user || !effectiveParticipantId || !activity || isPreview) return;
    setBusy(true);
    setStatus(null);
    try {
      const enrollment = pendingAction === 'join'
        ? await joinActivity(token, activity.id, participantId)
        : await leaveActivity(token, activity.id, participantId);
      // Only the authoritative server response may change enrollment UI.
      setActivity({ ...enrollment.activity, enrollment });
      let synced = true;
      try {
        await syncActivitiesForParticipant(token, effectiveParticipantId, user.id);
      } catch {
        synced = false;
      }
      if (!synced) setStatus({ tone: 'warning', text: t('activities.syncError') });
      else if (pendingAction === 'leave') setStatus({ tone: 'success', text: t('activities.leaveSuccess') });
      else if (enrollment.status === 'waitlisted') setStatus({ tone: 'success', text: t('activities.waitlistSuccess') });
      else setStatus({ tone: 'success', text: t('activities.joinSuccess') });
      setPendingAction(null);
    } catch {
      setStatus({ tone: 'error', text: t('activities.actionError') });
      setPendingAction(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen
        options={{
          title: t(`activities.categories.${activity.category}`),
          headerStyle: { backgroundColor: colors.nav },
          headerTitleStyle: { color: colors.text, fontFamily: family.bold },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerBackVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              activeOpacity={0.8}
              onPress={leaveDetail}
              style={styles.headerBack}
            >
              <Feather name="arrow-left" size={20} color={colors.text} />
              <Text style={[styles.headerBackText, { color: colors.text }]}>{t('common.back')}</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        {participantId ? (
          <View style={[styles.participantBanner, { backgroundColor: colors.infoSoft }]}>
            <Feather name="user-check" size={22} color={colors.info} />
            <Text style={[styles.participantText, { color: colors.text }]}>
              {t('activities.forParticipant', { name: participantLabel })}
            </Text>
          </View>
        ) : null}

        {isPreview ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.previewBanner,
              { backgroundColor: colors.warningBg, borderColor: colors.warningText },
            ]}
          >
            <Feather name="info" size={24} color={colors.warningText} />
            <View style={styles.bannerCopy}>
              <Text style={[styles.bannerTitle, { color: colors.warningText }]}>
                {t('activities.previewBannerTitle')}
              </Text>
              <Text style={[styles.bannerBody, { color: colors.warningText }]}>
                {t('activities.previewBannerBody')}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.hero, { backgroundColor: colors.cardStrong, borderColor: colors.border }]}>
          <View style={[styles.heroIcon, { backgroundColor: tone.bg, borderColor: tone.border }]}>
            <Feather name={CATEGORY_ICONS[activity.category]} size={36} color={tone.fg} />
          </View>
          <View style={styles.heroCopy}>
            <Muted style={styles.categoryLabel}>{t(`activities.categories.${activity.category}`)}</Muted>
            <H1 style={styles.title}>{title}</H1>
            <View style={styles.badgeRow}>
              {isPreview ? (
                <>
                  <Badge label={t('activities.reviewedBadge')} />
                  <View
                    style={[
                      styles.previewBadge,
                      { backgroundColor: colors.warningBg, borderColor: colors.warningText },
                    ]}
                  >
                    <Text style={[styles.previewBadgeText, { color: colors.warningText }]}>
                      {t('activities.previewBadge')}
                    </Text>
                  </View>
                </>
              ) : (
                <Badge
                  label={t(`activities.verificationStatuses.${activity.verificationStatus}`)}
                  color={
                    activity.verificationStatus === 'saathi_verified'
                      ? colors.success
                      : colors.warningText
                  }
                />
              )}
              {joined ? <Badge label={t('activities.joinedBadge')} color={colors.success} /> : null}
              {waitlisted ? <Badge label={t('activities.waitlisted')} color={colors.info} /> : null}
            </View>
          </View>
        </View>

        <View style={styles.detailGrid}>
          <Card style={styles.aboutCard}>
            <H2>{t('activities.about')}</H2>
            <Body>{description}</Body>

            {isPreview ? <View style={[styles.browseNote, { backgroundColor: colors.cardStrong, borderColor: colors.border }]}>
              <Feather name="eye" size={21} color={colors.textMuted} />
              <View style={styles.browseCopy}>
                <Text style={[styles.browseTitle, { color: colors.text }]}>
                  {t('activities.browseOnlyTitle')}
                </Text>
                <Muted style={styles.browseBody}>{t('activities.browseOnlyBody')}</Muted>
              </View>
            </View> : null}
          </Card>

          <Card style={styles.detailsCard}>
            <H2>{t('activities.listingDetails')}</H2>
            <DetailRow
              icon="calendar"
              label={isPreview ? t('activities.scheduleIdea') : t('activities.nextSession')}
              value={nextSession ? formatSessionDate(nextSession, lang) : t('activities.noUpcomingSessions')}
              colors={colors}
              styles={styles}
            />
            {sessionDurationMinutes(nextSession) ? (
              <DetailRow
                icon="clock"
                label={t('activities.duration')}
                value={t('activities.minutes', { count: sessionDurationMinutes(nextSession) })}
                colors={colors}
                styles={styles}
              />
            ) : null}
            <DetailRow
              icon="map-pin"
              label={isPreview ? t('activities.proposedVenue') : t('activities.venue')}
              value={
                isPreview
                  ? t('activities.previewVenue')
                  : [activity.venueName, activity.address, activity.town].filter(Boolean).join(' · ')
              }
              colors={colors}
              styles={styles}
            />
            <DetailRow
              icon="user"
              label={t('activities.facilitator')}
              value={activity.instructorName || t('activities.facilitatorToConfirm')}
              colors={colors}
              styles={styles}
            />
            <DetailRow
              icon="message-circle"
              label={t('activities.languages')}
              value={languageList}
              colors={colors}
              styles={styles}
            />
            <DetailRow
              icon="activity"
              label={t('activities.mobility')}
              value={t(`activities.mobilityLevels.${activity.mobilityLevel}`)}
              colors={colors}
              styles={styles}
            />
          </Card>
        </View>

        <Card style={styles.supportCard}>
          <H2>{t('activities.accessibility')}</H2>
          <View style={styles.supportGrid}>
            {supports.map((support) => (
              <SupportItem key={support} support={support} colors={colors} styles={styles} />
            ))}
          </View>
          {activity.accessibilityNotes ? (
            <Muted>{isPreview ? t('activities.previewAccessibility') : activity.accessibilityNotes}</Muted>
          ) : null}
        </Card>

        {isPreview ? <View style={[styles.trustCard, { backgroundColor: colors.infoSoft, borderColor: colors.info }]}>
          <Feather name="shield" size={24} color={colors.info} />
          <View style={styles.trustCopy}>
            <Text style={[styles.trustTitle, { color: colors.text }]}>
              {t('activities.reviewedMeaningTitle')}
            </Text>
            <Text style={[styles.trustBody, { color: colors.textMuted }]}>
              {t('activities.reviewedMeaningBody')}
            </Text>
            <Text style={[styles.reconfirmLine, { color: colors.text }]}>
              {t('activities.reconfirmLine')}
            </Text>
          </View>
        </View> : (
          <View
            style={[
              styles.trustCard,
              {
                backgroundColor:
                  activity.verificationStatus === 'unverified' ? colors.warningBg : colors.successSoft,
                borderColor:
                  activity.verificationStatus === 'unverified' ? colors.warningText : colors.success,
              },
            ]}
          >
            <Feather
              name={activity.verificationStatus === 'unverified' ? 'alert-triangle' : 'shield'}
              size={24}
              color={activity.verificationStatus === 'unverified' ? colors.warningText : colors.success}
            />
            <View style={styles.trustCopy}>
              <Text style={[styles.trustTitle, { color: colors.text }]}>{t('activities.verification')}</Text>
              <Text style={[styles.trustBody, { color: colors.textMuted }]}>
                {t(`activities.verificationStatuses.${activity.verificationStatus}`)}
              </Text>
              {activity.verifiedBy ? (
                <Text style={[styles.reconfirmLine, { color: colors.text }]}>
                  {t('activities.verifiedBy', { name: activity.verifiedBy })}
                </Text>
              ) : null}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <H2>{isPreview ? t('activities.scheduleIdea') : t('activities.schedule')}</H2>
          {sessions.length === 0 ? (
            <Muted>{t('activities.noUpcomingSessions')}</Muted>
          ) : (
            <View style={styles.sessionList}>
              {sessions.map((item) => (
                <View
                  key={item.id}
                  style={[styles.sessionRow, { borderColor: colors.border, backgroundColor: colors.bgAlt }]}
                >
                  <View style={[styles.dateDisc, { backgroundColor: colors.cardStrong }]}>
                    <Feather name="calendar" size={21} color={colors.text} />
                  </View>
                  <View style={styles.sessionCopy}>
                    <Text style={[styles.sessionDate, { color: colors.text }]}>
                      {formatSessionDate(item, lang)}
                      {formatSessionEnd(item, lang) ? ` – ${formatSessionEnd(item, lang)}` : ''}
                    </Text>
                    <Muted>
                      {isPreview
                        ? t('activities.reconfirmLine')
                        : item.status === 'cancelled'
                          ? t('activities.sessionCancelled')
                          : typeof item.spotsRemaining === 'number'
                            ? item.spotsRemaining === 0
                              ? t(waitlistAvailable ? 'activities.full' : 'activities.fullNoWaitlist')
                              : t('activities.spotsLeft', { count: item.spotsRemaining })
                            : activity.venueName || activity.town || t('activities.venue')}
                    </Muted>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <Card style={styles.actionCard}>
          {isPreview ? (
            <View style={[styles.sampleNotice, { backgroundColor: colors.warningBg }]}>
              <Feather name="eye" size={22} color={colors.warningText} />
              <Text style={[styles.sampleText, { color: colors.warningText }]}>
                {t('activities.browseOnlyBody')}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.actionNotice}>
                <Feather name="calendar" size={22} color={colors.accent} />
                <Body style={styles.actionNoticeText}>{t('activities.calendarNotice')}</Body>
              </View>
              <View style={styles.actionNotice}>
                <Feather name="message-circle" size={22} color={colors.accent} />
                <Body style={styles.actionNoticeText}>{t('activities.assistantNotice')}</Body>
              </View>
              {!token ? <Muted>{t('activities.signInHint')}</Muted> : null}
              {!hasActiveEnrollment && !activity.registrationOpen ? (
                <Muted>{t('activities.registrationClosed')}</Muted>
              ) : null}
              {full && !hasActiveEnrollment ? (
                <Muted>
                  {waitlistAvailable
                    ? t('activities.waitlistSpotsLeft', { count: activity.waitlistSpotsRemaining })
                    : t('activities.fullNoWaitlist')}
                </Muted>
              ) : null}
              {waitlisted && typeof activity.enrollment?.waitlistPosition === 'number' ? (
                <Muted>
                  {t('activities.waitlistPosition', { position: activity.enrollment.waitlistPosition })}
                </Muted>
              ) : null}
              <Button
                label={actionLabel}
                variant={hasActiveEnrollment ? 'secondary' : 'accent'}
                disabled={actionDisabled}
                onPress={requestEnrollmentChange}
              />
            </>
          )}

          {status ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[
                styles.status,
                {
                  backgroundColor:
                    status.tone === 'success'
                      ? colors.successSoft
                      : status.tone === 'warning'
                        ? colors.warningBg
                        : colors.dangerSoft,
                },
              ]}
            >
              <Feather
                name={status.tone === 'success' ? 'check-circle' : 'alert-circle'}
                size={22}
                color={
                  status.tone === 'success'
                    ? colors.success
                    : status.tone === 'warning'
                      ? colors.warningText
                      : colors.danger
                }
              />
              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      status.tone === 'success'
                        ? colors.success
                        : status.tone === 'warning'
                          ? colors.warningText
                          : colors.danger,
                  },
                ]}
              >
                {status.text}
              </Text>
            </View>
          ) : null}
        </Card>

        <Dialog
          visible={pendingAction !== null}
          onClose={() => !busy && setPendingAction(null)}
          title={
            pendingAction === 'leave'
              ? t('activities.leaveConfirmTitle')
              : t('activities.joinConfirmTitle')
          }
        >
          <Body>
            {pendingAction === 'leave'
              ? t('activities.leaveConfirmBody', { name: participantLabel })
              : t('activities.joinConfirmBody', { name: participantLabel })}
          </Body>
          <View style={styles.dialogActions}>
            <Button
              label={pendingAction === 'leave' ? t('activities.leave') : full ? t('activities.joinWaitlist') : t('activities.join')}
              variant={pendingAction === 'leave' ? 'danger' : 'accent'}
              loading={busy}
              onPress={confirmEnrollmentChange}
            />
            <Button
              label={t('common.cancel')}
              variant="secondary"
              disabled={busy}
              onPress={() => setPendingAction(null)}
            />
          </View>
        </Dialog>
      </ScrollView>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  colors,
  styles,
}: {
  icon: FeatherName;
  label: string;
  value: string;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={[styles.detailRow, { borderTopColor: colors.border }]}>
      <Feather name={icon} size={20} color={colors.textMuted} />
      <View style={styles.detailCopy}>
        <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function SupportItem({
  support,
  colors,
  styles,
}: {
  support: ActivitySupport;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.supportItem, { borderColor: colors.border, backgroundColor: colors.cardStrong }]}>
      <View style={[styles.supportCheck, { backgroundColor: colors.successSoft }]}>
        <Feather name="check" size={17} color={colors.success} />
      </View>
      <Text style={[styles.supportText, { color: colors.text }]}>{t(`activities.supports.${support}`)}</Text>
    </View>
  );
}

function makeStyles(colors: AppColors, isWide: boolean) {
  return StyleSheet.create({
    screen: { flex: 1 },
    content: {
      width: '100%',
      maxWidth: 1120,
      alignSelf: 'center',
      padding: isWide ? space.xl : space.md,
      paddingBottom: space.xxl,
      gap: space.lg,
    },
    headerBack: {
      minHeight: 44,
      minWidth: 90,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 6,
      paddingHorizontal: space.sm,
    },
    headerBackText: { fontFamily: family.semibold, fontSize: font.md },
    participantBanner: {
      minHeight: TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderRadius: radius.lg,
      padding: space.md,
    },
    participantText: { flex: 1, fontFamily: family.semibold, fontSize: font.md },
    previewBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      borderWidth: 1,
      borderLeftWidth: 5,
      borderRadius: radius.md,
      padding: space.md,
    },
    bannerCopy: { flex: 1, minWidth: 0, gap: 3 },
    bannerTitle: { fontFamily: family.semibold, fontSize: font.md, lineHeight: font.md * 1.3 },
    bannerBody: { fontFamily: family.regular, fontSize: font.sm, lineHeight: font.sm * 1.45 },
    hero: {
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'flex-start',
      gap: space.lg,
      borderWidth: 1,
      borderRadius: radius.xl,
      padding: isWide ? space.xl : space.lg,
    },
    heroIcon: {
      width: 88,
      height: 88,
      borderWidth: 1,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroCopy: { flex: 1, minWidth: 0, gap: space.sm },
    categoryLabel: { fontFamily: family.semibold, fontSize: font.sm },
    title: { fontFamily: family.medium, fontSize: isWide ? 40 : 32, lineHeight: isWide ? 47 : 38 },
    badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs },
    previewBadge: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderRadius: radius.sm,
      paddingHorizontal: space.sm,
      paddingVertical: 5,
    },
    previewBadgeText: { fontFamily: family.medium, fontSize: font.xs },
    detailGrid: { flexDirection: isWide ? 'row' : 'column', gap: space.lg },
    aboutCard: { flex: 1, gap: space.md },
    detailsCard: { flex: 1, gap: 0 },
    browseNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: space.md,
    },
    browseCopy: { flex: 1, minWidth: 0, gap: 3 },
    browseTitle: { fontFamily: family.semibold, fontSize: font.md, lineHeight: font.md * 1.3 },
    browseBody: { fontSize: font.sm, lineHeight: font.sm * 1.4 },
    detailRow: {
      minHeight: 74,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      borderTopWidth: 1,
      paddingVertical: space.md,
    },
    detailCopy: { flex: 1, minWidth: 0, gap: 3 },
    detailLabel: { fontFamily: family.medium, fontSize: font.sm, lineHeight: font.sm * 1.3 },
    detailValue: { fontFamily: family.semibold, fontSize: font.md, lineHeight: font.md * 1.35 },
    supportCard: { gap: space.md },
    supportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    supportItem: {
      minHeight: TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      width: isWide ? '48.8%' : '100%',
    },
    supportCheck: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    supportText: { flex: 1, fontFamily: family.medium, fontSize: font.sm, lineHeight: font.sm * 1.35 },
    trustCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: space.lg,
    },
    trustCopy: { flex: 1, minWidth: 0, gap: space.xs },
    trustTitle: { fontFamily: family.semibold, fontSize: font.md, lineHeight: font.md * 1.3 },
    trustBody: { fontFamily: family.regular, fontSize: font.sm, lineHeight: font.sm * 1.45 },
    reconfirmLine: { fontFamily: family.semibold, fontSize: font.sm, lineHeight: font.sm * 1.45 },
    section: { gap: space.md },
    sessionList: { gap: space.sm },
    sessionRow: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      borderWidth: 1,
      borderRadius: radius.lg,
      padding: space.md,
    },
    dateDisc: {
      width: 46,
      height: 46,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sessionCopy: { flex: 1, minWidth: 0, gap: 3 },
    sessionDate: { fontFamily: family.semibold, fontSize: font.md, lineHeight: font.md * 1.4 },
    actionCard: { gap: space.md },
    actionNotice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.md },
    actionNoticeText: { flex: 1 },
    sampleNotice: {
      minHeight: TAP,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      borderRadius: radius.lg,
      padding: space.md,
    },
    sampleText: { flex: 1, fontFamily: family.semibold, fontSize: font.sm, lineHeight: font.sm * 1.45 },
    status: {
      minHeight: TAP,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      borderRadius: radius.lg,
      padding: space.md,
    },
    statusText: { flex: 1, fontFamily: family.semibold, fontSize: font.sm, lineHeight: font.sm * 1.45 },
    dialogActions: { gap: space.sm, paddingTop: space.lg },
    notFound: { alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.sm },
    notFoundIcon: {
      width: 72,
      height: 72,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notFoundTitle: { textAlign: 'center', marginTop: space.sm },
    notFoundBody: { maxWidth: 420, textAlign: 'center', fontSize: font.sm },
    notFoundAction: { width: '100%', maxWidth: 360, marginTop: space.md },
  });
}
