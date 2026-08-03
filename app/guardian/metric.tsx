// One analytics metric, full screen. Reached by tapping a tile on the guardian
// dashboard, but it stands alone: it re-fetches its own analytics from the
// parentId in the URL, so a direct load, a refresh or a shared link all work.
// A static route segment wins over the sibling [parentId] one in Expo Router,
// so /guardian/metric is this screen and not a parent whose id is "metric".
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import AppHeader from '../../src/components/AppHeader';
import { Button, Card, H1, H2, Muted } from '../../src/components/ui';
import {
  MetricDetail,
  MetricVisual,
  isMetricKey,
  metricLabel,
  metricValue,
} from '../../src/components/GuardianMetric';
import { AppColors, family, font, radius, space, TAP } from '../../src/lib/theme';
import { ParentAnalytics } from '../../src/lib/types';
import { useAuth } from '../../src/context/AuthContext';
import { useDisplayMode } from '../../src/context/DisplayModeContext';
import { useTheme } from '../../src/context/ThemeContext';
import { fetchParentAnalytics, friendlyFamilyError, listFamilyLinks } from '../../src/lib/family';
import { useLivePoll } from '../../src/lib/useLivePoll';
import { markLoginIntent } from '../../src/lib/authNavigation';

export default function MetricDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ parentId?: string | string[]; key?: string | string[] }>();
  const parentId = Array.isArray(params.parentId) ? params.parentId[0] : params.parentId;
  const rawKey = Array.isArray(params.key) ? params.key[0] : params.key;
  const metricKey = isMetricKey(rawKey) ? rawKey : null;

  const { session, user, loading } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isComputerMode } = useDisplayMode();
  const isWide = isComputerMode && width >= 900;
  const styles = useMemo(() => makeStyles(colors, isWide), [colors, isWide]);

  const [parentName, setParentName] = useState('');
  const [data, setData] = useState<ParentAnalytics | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = session?.access_token ?? null;

  useEffect(() => {
    if (!token || !parentId) return;
    let active = true;
    listFamilyLinks(token)
      .then(({ asGuardian }) => {
        if (!active) return;
        const link = asGuardian.find((l) => l.parentId === parentId);
        setParentName(link?.parentName || link?.parentPhone || '');
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token, parentId]);

  // The screen owns its fetch. A guardian who is not linked to this parentId
  // gets a 403/404 from the same endpoint the dashboard uses, which lands here
  // as "not linked" copy — `data` stays null, so nothing is ever rendered from
  // an id the signed-in user has no claim to.
  useEffect(() => {
    if (!token || !parentId) return;
    let active = true;
    setDataLoading(true);
    setError(null);
    fetchParentAnalytics(token, parentId)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) {
          setData(null);
          setError(friendlyFamilyError(e, t));
        }
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, parentId]);

  // Same quiet refresh as the dashboard: the numbers update in place rather
  // than collapsing the screen into a spinner while the guardian is reading it.
  useLivePoll(
    () => {
      if (!token || !parentId) return;
      fetchParentAnalytics(token, parentId)
        .then((d) => setData(d))
        .catch(() => undefined);
    },
    { enabled: Boolean(token && parentId) },
  );

  function goBack() {
    // A direct load or refresh of this URL has no history to pop, so back has
    // to fall through to the parent dashboard rather than dead-end.
    if (router.canGoBack()) router.back();
    else if (parentId) router.replace({ pathname: '/guardian/[parentId]', params: { parentId } });
    else router.replace('/guardian');
  }

  const heading = metricKey ? metricLabel(metricKey, t) : t('family.metric.unknownTitle');

  function frame(body: React.ReactNode) {
    return (
      <View style={styles.screen}>
        <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.pageOuter}>
          <AppHeader title={heading} />
          <Stack.Screen options={{ title: heading }} />
          <View style={[styles.page, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
            <View style={styles.shell}>{body}</View>
          </View>
        </ScrollView>
      </View>
    );
  }

  const backControl = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('family.back')}
      testID="metric-back"
      onPress={goBack}
      style={styles.backRow}
      hitSlop={8}
    >
      <Feather name="chevron-left" size={18} color={colors.textMuted} />
      <Text style={styles.backText}>{t('family.back')}</Text>
    </Pressable>
  );

  if (loading) {
    return frame(
      <Card style={styles.stateCard}>
        <ActivityIndicator color={colors.textMuted} />
        <Muted style={styles.stateText}>{t('family.loading')}</Muted>
      </Card>,
    );
  }

  if (!session || !user) {
    return frame(
      <Card style={styles.gateCard}>
        <View style={styles.gateIconBlock}>
          <Feather name="lock" size={28} color={colors.text} />
        </View>
        <H2 style={styles.gateTitle}>{t('family.errorSignIn')}</H2>
        <View style={styles.gateAction}>
          <Button
            label={t('common.signIn')}
            onPress={() => {
              markLoginIntent();
              router.push('/login');
            }}
          />
        </View>
      </Card>,
    );
  }

  if (!parentId || !metricKey) {
    return frame(
      <>
        {backControl}
        <Card style={styles.stateCard}>
          <Feather name="alert-circle" size={20} color={colors.textSubtle} />
          <Muted style={styles.stateText}>{t('family.metric.unknown')}</Muted>
        </Card>
      </>,
    );
  }

  if (dataLoading && !data) {
    return frame(
      <>
        {backControl}
        <Card style={styles.stateCard}>
          <ActivityIndicator color={colors.textMuted} />
          <Muted style={styles.stateText}>{t('family.loading')}</Muted>
        </Card>
      </>,
    );
  }

  if (error || !data) {
    return frame(
      <>
        {backControl}
        <Card style={styles.stateCard} testID="metric-error">
          <Feather name="alert-circle" size={20} color={colors.textSubtle} />
          <Muted style={styles.stateText}>{error || t('family.errorGeneric')}</Muted>
        </Card>
      </>,
    );
  }

  const label = metricLabel(metricKey, t);
  const value = metricValue(metricKey, data, t);

  return frame(
    <>
      {backControl}
      <H1>{label}</H1>
      {parentName ? <Muted style={styles.forWhom}>{t('family.analyticsFor', { name: parentName })}</Muted> : null}

      <Card style={styles.headlineCard} testID={`metric-headline-${metricKey}`}>
        <Text style={styles.headlineValue} testID="metric-headline-value">
          {value}
        </Text>
        <Text style={styles.headlineLabel}>{label}</Text>
      </Card>

      <Card style={styles.sectionCard} testID={`metric-visual-${metricKey}`}>
        <Text style={styles.sectionTitle}>{t('family.metric.breakdown')}</Text>
        <MetricVisual metricKey={metricKey} data={data} colors={colors} />
      </Card>

      <Card style={styles.sectionCard} testID={`metric-detail-${metricKey}`}>
        <Text style={styles.sectionTitle}>{t('family.metric.whatThisMeans')}</Text>
        <MetricDetail metricKey={metricKey} data={data} colors={colors} parentId={parentId} />
      </Card>
    </>,
  );
}

function makeStyles(colors: AppColors, isWide: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    pageOuter: { width: '100%' },
    page: { padding: isWide ? space.xl : space.md, paddingTop: space.md },
    shell: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: space.md },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      minHeight: TAP,
      paddingRight: space.sm,
    },
    backText: { fontSize: font.sm, fontFamily: family.medium, color: colors.textMuted },
    forWhom: { marginTop: -space.xs },
    headlineCard: { alignItems: 'flex-start', gap: 4 },
    headlineValue: {
      fontSize: font.xxl,
      fontFamily: family.bold,
      color: colors.text,
      lineHeight: Math.round(font.xxl * 1.2),
    },
    headlineLabel: { fontSize: font.md, fontFamily: family.medium, color: colors.textMuted },
    sectionCard: { gap: space.xs },
    sectionTitle: {
      fontSize: font.sm,
      fontFamily: family.semibold,
      color: colors.textSubtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    stateCard: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
    stateText: { textAlign: 'center' },
    gateCard: { alignItems: 'center', padding: space.lg, maxWidth: 460, alignSelf: 'center', width: '100%' },
    gateIconBlock: {
      width: 64,
      height: 64,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gateTitle: { marginTop: space.md, textAlign: 'center' },
    gateAction: { marginTop: space.lg, alignSelf: 'stretch' },
  });
}
