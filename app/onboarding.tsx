import React, { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import Animated, { Easing, FadeIn, ReduceMotion } from 'react-native-reanimated';
import { Button, H1, Muted } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import {
  AppColors,
  PastelName,
  PastelTone,
  family,
  font,
  pastelForMode,
  radius,
  space,
  TAP,
} from '../src/lib/theme';
import { OnboardingKind, markOnboarded } from '../src/lib/onboarding';
import { useIntroAnimation } from '../src/lib/useIntroAnimation';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

type Slide = { icon: FeatherName; tone: PastelName; key: string };

// Three slides per portal. Copy lives in the locale files under
// `onboarding.<kind>.<key>`; only the icon and its tint are decided here.
const SLIDES: Record<OnboardingKind, Slide[]> = {
  senior: [
    { icon: 'message-circle', tone: 'sky', key: 'ask' },
    { icon: 'bell', tone: 'sage', key: 'reminders' },
    { icon: 'phone-call', tone: 'coral', key: 'help' },
  ],
  guardian: [
    { icon: 'activity', tone: 'sage', key: 'seeHow' },
    { icon: 'bell', tone: 'sky', key: 'setReminders' },
    { icon: 'alert-triangle', tone: 'coral', key: 'alerts' },
  ],
};

const CHOICES: Array<{ kind: OnboardingKind; icon: FeatherName; tone: PastelName }> = [
  { kind: 'senior', icon: 'user', tone: 'peach' },
  { kind: 'guardian', icon: 'users', tone: 'lilac' },
];

// Slides swap in place rather than paging sideways: a swipe carousel is an
// invisible affordance to a first-time elder user, so every step advances on an
// explicit, labelled button instead.
//
// Web drives the entrance from a GSAP timeline (useIntroAnimation.web.ts) and
// must not also run this, or the two fight over opacity on the same nodes.
const stepIn =
  Platform.OS === 'web'
    ? undefined
    : FadeIn.duration(220).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System);

// Marks a node for the web GSAP timeline. react-native-web turns `dataSet` into
// real `data-*` attributes; React Native's own prop types do not declare it and
// the native renderer drops unknown props, so this is a web-only hint that costs
// nothing on iOS and Android. Returned as `object` because the alternative is
// widening every call site with a cast.
const anim = (name: 'badge' | 'item' | 'footer'): object => ({ dataSet: { anim: name } });

// `size` is small inside the chooser rows: at 375px a full-size badge squeezed
// the description into five wrapped lines and the two cards ran off the screen.
function IconBadge({ icon, tone, size = 88 }: { icon: FeatherName; tone: PastelTone; size?: number }) {
  return (
    <View
      style={[
        badgeStyles.badge,
        { width: size, height: size, backgroundColor: tone.bg, borderColor: tone.border },
      ]}
    >
      <Feather name={icon} size={Math.round(size * 0.4)} color={tone.fg} />
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function Onboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const pastel = pastelForMode(mode);
  const styles = makeStyles(colors);

  // step 0 is the portal chooser; 1-3 are that portal's slides.
  const [kind, setKind] = useState<OnboardingKind | null>(null);
  const [step, setStep] = useState(0);

  const slides = kind ? SLIDES[kind] : [];
  const slide = step > 0 ? slides[step - 1] : null;
  const isLast = kind !== null && step === slides.length;

  // Scope for the GSAP selectors, and the key that replays the timeline. No-op
  // on native, where the Reanimated `entering` above handles the same job.
  const scopeRef = useRef(null);
  useIntroAnimation(scopeRef, slide ? `${kind}-${slide.key}` : 'chooser');

  function leave(chosen: OnboardingKind) {
    // Best-effort: if the flag never lands the intro simply shows again, which
    // is far better than holding an elder on a loading screen.
    if (user?.id) void markOnboarded(user.id, chosen);
    router.replace(chosen === 'guardian' ? '/guardian' : '/');
  }

  function choose(next: OnboardingKind) {
    setKind(next);
    setStep(1);
  }

  function advance() {
    if (!kind) return;
    if (isLast) leave(kind);
    else setStep((current) => current + 1);
  }

  function back() {
    // Step 1 goes back to the chooser, which means clearing the pick too —
    // otherwise the dots would still show a portal that is no longer selected.
    if (step === 1) setKind(null);
    setStep((current) => Math.max(0, current - 1));
  }

  return (
    <View ref={scopeRef} style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topRow}>
        {step > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={back}
            hitSlop={8}
            style={styles.topButton}
          >
            <Feather name="chevron-left" size={20} color={colors.textMuted} />
            <Text style={styles.topButtonText}>{t('common.back')}</Text>
          </Pressable>
        ) : (
          <View style={styles.topButton} />
        )}

        {/* Skip is only offered once a portal is picked: skipping the chooser
            would leave us with no destination to send the user to. */}
        {kind ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.skip')}
            onPress={() => leave(kind)}
            hitSlop={8}
            style={styles.topButton}
          >
            <Text style={styles.topButtonText}>{t('onboarding.skip')}</Text>
          </Pressable>
        ) : (
          <View style={styles.topButton} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {step === 0 ? (
          <Animated.View key="chooser" entering={stepIn} style={styles.stage}>
            <H1 {...anim('item')} style={styles.title}>{t('onboarding.chooser.title')}</H1>
            <Muted {...anim('item')} style={styles.subtitle}>{t('onboarding.chooser.subtitle')}</Muted>

            <View style={styles.choices}>
              {CHOICES.map((choice) => (
                <Pressable
                  key={choice.kind}
                  {...anim('item')}
                  accessibilityRole="button"
                  accessibilityLabel={t(`onboarding.chooser.${choice.kind}.title`)}
                  onPress={() => choose(choice.kind)}
                  style={({ pressed }) => [
                    styles.choiceCard,
                    pressed ? { backgroundColor: colors.surfaceTint } : null,
                  ]}
                >
                  <IconBadge icon={choice.icon} tone={pastel[choice.tone]} size={60} />
                  <View style={styles.choiceText}>
                    <Text style={styles.choiceTitle}>
                      {t(`onboarding.chooser.${choice.kind}.title`)}
                    </Text>
                    <Text style={styles.choiceBody}>
                      {t(`onboarding.chooser.${choice.kind}.body`)}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={22} color={colors.textSubtle} />
                </Pressable>
              ))}
            </View>
          </Animated.View>
        ) : slide && kind ? (
          <Animated.View key={`${kind}-${slide.key}`} entering={stepIn} style={styles.stage}>
            <View {...anim('badge')}>
              <IconBadge icon={slide.icon} tone={pastel[slide.tone]} />
            </View>
            <H1 {...anim('item')} style={styles.slideTitle}>
              {t(`onboarding.${kind}.${slide.key}.title`)}
            </H1>
            <Text {...anim('item')} style={styles.slideBody}>
              {t(`onboarding.${kind}.${slide.key}.body`)}
            </Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
        {kind ? (
          <>
            {/* Only the dots carry the footer beat. Replaying the button on
                every Next would move a control that is still under the
                user's finger. */}
            <View
              {...anim('footer')}
              style={styles.dots}
              accessibilityRole="progressbar"
              accessibilityLabel={t('onboarding.progress', { step, total: slides.length })}
            >
              {slides.map((item, index) => (
                <View
                  key={item.key}
                  style={[
                    styles.dot,
                    index === step - 1
                      ? { backgroundColor: colors.primary, width: 22 }
                      : { backgroundColor: colors.border },
                  ]}
                />
              ))}
            </View>
            <Button label={isLast ? t('onboarding.start') : t('onboarding.next')} onPress={advance} />
          </>
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.md,
    },
    topButton: {
      minHeight: TAP,
      minWidth: 72,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    topButtonText: { fontFamily: family.medium, fontSize: font.sm, color: colors.textMuted },
    scroll: { flex: 1 },
    body: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: space.lg,
      paddingVertical: space.lg,
    },
    stage: { width: '100%', maxWidth: 520, alignSelf: 'center', alignItems: 'flex-start', gap: space.md },
    title: { marginTop: space.sm },
    subtitle: { maxWidth: 460 },
    choices: { alignSelf: 'stretch', gap: space.md, marginTop: space.sm },
    choiceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      padding: space.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgAlt,
    },
    choiceText: { flex: 1, minWidth: 0, gap: 4 },
    choiceTitle: { fontFamily: family.semibold, fontSize: font.md, color: colors.text },
    choiceBody: {
      fontFamily: family.regular,
      fontSize: font.sm,
      lineHeight: Math.round(font.sm * 1.45),
      color: colors.textMuted,
    },
    slideTitle: { marginTop: space.sm },
    slideBody: {
      fontFamily: family.regular,
      fontSize: font.md,
      lineHeight: Math.round(font.md * 1.55),
      color: colors.textMuted,
      maxWidth: 460,
    },
    footer: {
      paddingHorizontal: space.lg,
      paddingTop: space.md,
      gap: space.md,
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },
    dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: radius.pill },
  });
}
