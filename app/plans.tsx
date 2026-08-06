import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Button, Card, H1, H2, Muted } from '../src/components/ui';
import { AppColors, family, radius, Tokens } from '../src/lib/theme';
import { useTokens } from '../src/lib/useTokens';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { markLoginIntent } from '../src/lib/authNavigation';
import { isDemoToken } from '../src/lib/demoFamily';
import { useLivePoll } from '../src/lib/useLivePoll';
import ForWhomPicker, { useFamilyBeneficiary } from '../src/components/ForWhomPicker';
import {
  BillingStatus,
  FREE_PLAN,
  Plan,
  PlanId,
  PlansCatalog,
  fetchBillingStatus,
  fetchPlans,
  friendlyBillingError,
  isAlreadySubscribed,
  isBillingNotConfigured,
  isLiveSubscription,
  planAdditions,
  planRank,
  rupeesFromPaise,
  subscribeToPlan,
} from '../src/lib/billing';

// Razorpay confirms a mandate through a webhook, so the app learns about a
// completed checkout by asking again rather than being told. Five seconds is
// fast enough that a family coming back from the payment page sees the change
// almost at once; the window caps how long a screen someone abandoned mid-
// payment keeps asking.
const CHECK_INTERVAL_MS = 5000;
const AWAIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * The price list, the plan this family is on, and the one button that starts a
 * checkout.
 *
 * No card, UPI handle or mandate is collected here. /api/billing/subscribe
 * returns Razorpay's hosted checkout link and the app opens it in the browser;
 * the only thing that comes back is an entitlement change on the next status
 * read.
 */
export default function PlansScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const { colors } = useTheme();
  const tk = useTokens();
  const styles = useMemo(() => makeStyles(colors, tk), [colors, tk]);

  const token = session?.access_token ?? null;
  const demo = token ? isDemoToken(token) : false;

  const [catalog, setCatalog] = useState<PlansCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Who the plan covers. The entitlement is granted on the beneficiary stamped
  // at purchase, so a guardian who does not say "for my mother" pays for a plan
  // that switches nothing on for her.
  const {
    people: beneficiaries,
    beneficiaryId,
    setBeneficiaryId,
    selected: beneficiary,
    loading: beneficiariesLoading,
  } = useFamilyBeneficiary(token, {
    self: t('plans.forMyself'),
    unnamed: t('plans.parentFallback'),
  });

  // The server answers 503 billing_not_configured until the Razorpay keys are
  // set. Nothing is broken and nothing is retryable, so the plans stay on
  // screen and only the buttons are replaced.
  const [comingSoon, setComingSoon] = useState(false);

  // Set once a hosted checkout has been opened, and the only thing that turns
  // the status polling on.
  const [awaiting, setAwaiting] = useState<PlanId | null>(null);
  const [awaitDeadline, setAwaitDeadline] = useState(0);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [confirmedPlan, setConfirmedPlan] = useState<PlanId | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setCatalog(await fetchPlans());
    } catch (error) {
      setLoadError(friendlyBillingError(error, t, 'plans'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const refreshStatus = useCallback(async (): Promise<BillingStatus | null> => {
    if (!token || isDemoToken(token)) return null;
    try {
      const next = await fetchBillingStatus(token);
      setStatus(next);
      return next;
    } catch {
      // The plan badge is the only thing this drives. Failing it loudly would
      // hide a price list that loaded perfectly well without a session.
      return null;
    }
  }, [token]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Only while a checkout is open. useLivePoll already stops on blur and in the
  // background, so this cannot keep asking from a forgotten tab.
  useLivePoll(
    () => {
      const plan = awaiting;
      if (!plan) return;
      if (Date.now() > awaitDeadline) {
        setAwaiting(null);
        return;
      }
      void refreshStatus().then((next) => {
        if (next && planRank(next.entitlement) >= planRank(plan)) {
          setConfirmedPlan(plan);
          setAwaiting(null);
          setCheckoutUrl(null);
        }
      });
    },
    { enabled: awaiting !== null, intervalMs: CHECK_INTERVAL_MS },
  );

  const openCheckout = useCallback(
    async (url: string) => {
      try {
        await Linking.openURL(url);
        return true;
      } catch {
        // Popup blocked, or no browser to hand it to. The link stays on screen
        // as selectable text rather than a dead button.
        setActionError(t('plans.errorOpenFailed'));
        return false;
      }
    },
    [t],
  );

  const subscribe = useCallback(
    async (plan: PlanId) => {
      if (!token) {
        markLoginIntent();
        router.push('/login');
        return;
      }
      setBusyPlan(plan);
      setActionError(null);
      try {
        const result = await subscribeToPlan(token, plan, beneficiaryId);
        if (!result.shortUrl) {
          setActionError(t('plans.errorGeneric'));
          return;
        }
        setCheckoutUrl(result.shortUrl);
        setAwaiting(plan);
        setAwaitDeadline(Date.now() + AWAIT_WINDOW_MS);
        await openCheckout(result.shortUrl);
      } catch (error) {
        if (isBillingNotConfigured(error)) {
          setComingSoon(true);
          return;
        }
        setActionError(friendlyBillingError(error, t, 'subscribe'));
        // A 409 means the server knows about a plan this screen does not.
        if (isAlreadySubscribed(error)) void refreshStatus();
      } finally {
        setBusyPlan(null);
      }
    },
    [beneficiaryId, openCheckout, refreshStatus, router, t, token],
  );

  const title = t('plans.title');
  const entitlement = status?.entitlement ?? FREE_PLAN;
  const ownedPlan = isLiveSubscription(status?.subscription) ? status?.subscription?.plan : null;

  if (authLoading || loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator color={colors.textMuted} size="large" />
      </View>
    );
  }

  if (loadError || !catalog) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title }} />
        <Card style={styles.stateCard}>
          <Feather name="alert-circle" size={22} color={colors.danger} />
          <Muted style={styles.stateText}>{loadError ?? t('plans.errorGeneric')}</Muted>
          <View style={styles.stateAction}>
            <Button label={t('plans.retry')} onPress={() => void loadCatalog()} />
          </View>
        </Card>
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.content}>
        <H1>{title}</H1>
        <Muted>{t('plans.intro')}</Muted>
        <ForWhomPicker
          people={beneficiaries}
          selectedId={beneficiaryId}
          onChange={setBeneficiaryId}
          title={t('plans.forTitle')}
          chipLabel={t('plans.forParent', { name: beneficiary?.name ?? '' })}
          changeLabel={t('plans.forChange', { name: beneficiary?.name ?? '' })}
        />

        {actionError ? (
          <View style={styles.notice}>
            <Feather name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.noticeText}>{actionError}</Text>
          </View>
        ) : null}

        {confirmedPlan ? (
          <Card style={[styles.card, { backgroundColor: colors.successSoft }]}>
            <View style={styles.rowHead}>
              <Feather name="check-circle" size={22} color={colors.success} />
              <Text style={styles.successTitle}>{t('plans.activeTitle')}</Text>
            </View>
            <Muted>
              {t('plans.activeBody', {
                plan: t(`plans.names.${confirmedPlan}`, {
                  defaultValue: catalog.plans.find((p) => p.id === confirmedPlan)?.name ?? '',
                }),
              })}
            </Muted>
          </Card>
        ) : null}

        {awaiting ? (
          <Card style={styles.card}>
            <View style={styles.rowHead}>
              <ActivityIndicator color={colors.textMuted} />
              <Text style={styles.rowLabel}>{t('plans.checkoutTitle')}</Text>
            </View>
            <Muted>{t('plans.checkoutBody')}</Muted>
            {checkoutUrl ? (
              <Text selectable style={styles.checkoutLink}>
                {checkoutUrl}
              </Text>
            ) : null}
            {checkoutUrl ? (
              <Button
                label={t('plans.reopenCheckout')}
                variant="secondary"
                onPress={() => void openCheckout(checkoutUrl)}
              />
            ) : null}
            <Button
              label={t('plans.checkAgain')}
              variant="secondary"
              onPress={() => void refreshStatus()}
            />
            <Button
              label={t('plans.stopWaiting')}
              variant="secondary"
              onPress={() => setAwaiting(null)}
            />
          </Card>
        ) : null}

        {comingSoon ? (
          <Card style={styles.card}>
            <View style={styles.rowHead}>
              <Feather name="clock" size={22} color={colors.textSubtle} />
              <Text style={styles.rowLabel}>{t('plans.comingSoonTitle')}</Text>
            </View>
            <Muted>{t('plans.comingSoonBody')}</Muted>
          </Card>
        ) : null}

        {demo ? (
          <Card style={styles.card}>
            <View style={styles.rowHead}>
              <Feather name="info" size={22} color={colors.textSubtle} />
              <Text style={styles.rowLabel}>{t('plans.demoNoticeTitle')}</Text>
            </View>
            <Muted>{t('plans.demoNotice')}</Muted>
          </Card>
        ) : null}

        {/* The free tier first, as the baseline the paid cards add to. It has
            no id to subscribe to, so it carries no button. */}
        <Card style={styles.card}>
          <View style={styles.planHead}>
            <View style={styles.planHeadText}>
              <H2>{t('plans.names.free', { defaultValue: catalog.free.name })}</H2>
              <Text style={styles.price}>{t('plans.freePrice')}</Text>
            </View>
            {entitlement === FREE_PLAN ? (
              <View style={[styles.badge, { backgroundColor: colors.surfaceTint }]}>
                <Text style={styles.badgeText}>{t('plans.currentBadge')}</Text>
              </View>
            ) : null}
          </View>
          <Muted>{t('plans.freeBody')}</Muted>
          <FeatureList features={catalog.free.features} styles={styles} colors={colors} t={t} />
        </Card>

        {catalog.plans.map((plan: Plan, index: number) => {
          const adds = planAdditions(catalog.plans, index, catalog.free);
          const below = index > 0 ? catalog.plans[index - 1] : null;
          const isCurrent = entitlement === plan.id;
          const paidByFamily = isCurrent && ownedPlan !== plan.id;
          const includedInHigher = !isCurrent && planRank(plan.id) < planRank(entitlement);
          const price = rupeesFromPaise(plan.price_paise);

          return (
            <Card key={plan.id} style={styles.card}>
              <View style={styles.planHead}>
                <View style={styles.planHeadText}>
                  <H2>{t(`plans.names.${plan.id}`, { defaultValue: plan.name })}</H2>
                  <Text style={styles.price}>
                    {price ? t('plans.perMonth', { price }) : ''}
                  </Text>
                </View>
                {isCurrent ? (
                  <View style={[styles.badge, { backgroundColor: colors.successSoft }]}>
                    <Text style={[styles.badgeText, { color: colors.success }]}>
                      {paidByFamily ? t('plans.familyBadge') : t('plans.currentBadge')}
                    </Text>
                  </View>
                ) : null}
              </View>

              {below ? (
                <Muted>
                  {t('plans.everythingIn', {
                    plan: t(`plans.names.${below.id}`, { defaultValue: below.name }),
                  })}
                </Muted>
              ) : (
                <Muted>{t('plans.everythingInFree')}</Muted>
              )}

              <FeatureList features={adds} styles={styles} colors={colors} t={t} />

              {isCurrent ? (
                <Muted>{paidByFamily ? t('plans.familyBody') : t('plans.currentBody')}</Muted>
              ) : includedInHigher ? (
                <Muted>{t('plans.includedInYours')}</Muted>
              ) : comingSoon || demo ? null : (
                <Button
                  label={t('plans.choose')}
                  loading={busyPlan === plan.id}
                  // Also while the family links are still loading: a checkout
                  // opened before the beneficiary is known would be stamped to
                  // the payer and entitle the wrong person for a whole cycle.
                  disabled={busyPlan !== null || awaiting !== null || beneficiariesLoading}
                  onPress={() => void subscribe(plan.id)}
                />
              )}
            </Card>
          );
        })}

        <Muted style={styles.footnote}>{t('plans.footnote')}</Muted>
      </ScrollView>
    </View>
  );
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

// Feature keys are the server's vocabulary (`whatsapp_alerts`). Anything the
// locale files have not been taught is humanised rather than printed raw,
// because a missing key must never show an elder a snake_case identifier.
function FeatureList({
  features,
  styles,
  colors,
  t,
}: {
  features: string[];
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  t: Translate;
}) {
  if (features.length === 0) return null;
  return (
    <View style={styles.features}>
      {features.map((feature) => (
        <View key={feature} style={styles.featureRow}>
          <Feather name="check" size={18} color={colors.success} />
          <Text style={styles.featureText}>
            {t(`plans.features.${feature}`, { defaultValue: feature.replace(/_/g, ' ') })}
          </Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(colors: AppColors, tk: Tokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
    content: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      padding: tk.space.md,
      paddingBottom: tk.space.xxl,
      gap: tk.space.md,
    },
    card: { gap: tk.space.sm },
    stateCard: { alignItems: 'center', gap: tk.space.sm, paddingVertical: tk.space.xl },
    stateText: { textAlign: 'center' },
    stateAction: { alignSelf: 'stretch', marginTop: tk.space.sm },
    notice: { flexDirection: 'row', alignItems: 'flex-start', gap: tk.space.sm },
    noticeText: {
      flex: 1,
      color: colors.danger,
      fontFamily: family.medium,
      fontSize: tk.font.sm,
      lineHeight: tk.font.sm * 1.45,
    },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: tk.space.sm },
    rowLabel: {
      flex: 1,
      fontFamily: family.semibold,
      fontSize: tk.font.md,
      lineHeight: tk.font.md * 1.35,
      color: colors.text,
    },
    successTitle: {
      flex: 1,
      fontFamily: family.semibold,
      fontSize: tk.font.md,
      lineHeight: tk.font.md * 1.35,
      color: colors.success,
    },
    planHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: tk.space.sm,
    },
    planHeadText: { flex: 1, minWidth: 0, gap: 2 },
    price: {
      fontFamily: family.heavy,
      fontSize: tk.font.lg,
      lineHeight: tk.font.lg * 1.25,
      color: colors.text,
    },
    badge: {
      paddingHorizontal: tk.space.sm,
      paddingVertical: 6,
      borderRadius: radius.sm,
      flexShrink: 0,
      maxWidth: '52%',
    },
    badgeText: { fontFamily: family.semibold, fontSize: tk.font.xs, color: colors.textMuted },
    features: { gap: tk.space.xs, marginTop: tk.space.xs },
    featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: tk.space.sm },
    featureText: {
      flex: 1,
      fontFamily: family.regular,
      fontSize: tk.font.sm,
      lineHeight: tk.font.sm * 1.45,
      color: colors.text,
    },
    checkoutLink: {
      fontFamily: family.regular,
      fontSize: tk.font.sm,
      lineHeight: tk.font.sm * 1.45,
      color: colors.accent,
    },
    footnote: { textAlign: 'center', fontSize: tk.font.xs },
  });
}
