import React, { useCallback, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { listEvents } from '../lib/calendar';
import { buildNotifications, formatEventWhen, NotificationItem } from '../lib/notifications';
import { family, font, radius, shadow, space } from '../lib/theme';

const PANEL_RADIUS = 24;

const scrimIn = FadeIn.duration(160).reduceMotion(ReduceMotion.System);
const panelIn = FadeInDown.duration(240)
  .easing(Easing.out(Easing.cubic))
  .reduceMotion(ReduceMotion.System);

export default function NotificationBell() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors, mode } = useTheme();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);

  const requestId = useRef(0);
  const load = useCallback(() => {
    const id = ++requestId.current;
    listEvents().then((events) => {
      if (id === requestId.current) setItems(buildNotifications(events));
    });
    return () => {
      // Invalidate any in-flight request on blur/unmount.
      requestId.current += 1;
    };
  }, []);

  useFocusEffect(load);

  // Only things already due or due today are worth a badge; the rest sit quietly.
  const badgeCount = items.filter((item) => item.tone !== 'soon').length;
  const panelHeight = Math.max(240, Math.round(height / 3));

  function toneColor(tone: NotificationItem['tone']) {
    if (tone === 'overdue') return colors.emergency;
    if (tone === 'today') return colors.accent;
    return colors.textMuted;
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('notifications.title')}
        accessibilityHint={badgeCount ? t('notifications.badgeHint', { count: badgeCount }) : undefined}
        onPress={() => {
          load();
          setOpen(true);
        }}
        style={({ pressed }) => [styles.bellButton, { borderColor: colors.border }, pressed && styles.pressed]}
      >
        <Feather name="bell" size={20} color={colors.text} />
        {badgeCount ? (
          <View style={[styles.badge, { backgroundColor: colors.emergency, borderColor: colors.nav }]}>
            <Text style={styles.badgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
          </View>
        ) : null}
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <View style={styles.root}>
          <Animated.View entering={scrimIn} style={styles.scrim}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={() => setOpen(false)}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          <Animated.View
            entering={panelIn}
            style={[styles.panel, shadow.md, { top: insets.top + space.xs, height: panelHeight }]}
          >
            {/* Same bevel + blur recipe as the floating tab dock. */}
            <View style={[StyleSheet.absoluteFill, styles.panelClip]}>
              <LinearGradient
                colors={[colors.navEdgeHi, colors.navEdgeLo]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.panelInner}>
                <BlurView
                  intensity={48}
                  tint={mode}
                  experimentalBlurMethod="dimezisBlurView"
                  style={[StyleSheet.absoluteFill, { backgroundColor: colors.navGlass }]}
                />
              </View>
            </View>

            <View style={styles.panelHeader}>
              <Text style={[styles.panelTitle, { color: colors.text }]}>{t('notifications.title')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                onPress={() => setOpen(false)}
                hitSlop={8}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              >
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>

            {items.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="bell-off" size={22} color={colors.textSubtle} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  {t('notifications.empty')}
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.list}>
                {items.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}. ${formatEventWhen(item.dateISO, item.time)}`}
                    onPress={() => {
                      setOpen(false);
                      router.push('/calendar');
                    }}
                    style={({ pressed }) => [
                      styles.item,
                      { borderColor: colors.navPillEdge, backgroundColor: colors.navPill },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.itemDot, { backgroundColor: toneColor(item.tone) }]} />
                    <View style={styles.itemCopy}>
                      <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[styles.itemMeta, { color: toneColor(item.tone) }]} numberOfLines={1}>
                        {t(`notifications.tone.${item.tone}`)} · {formatEventWhen(item.dateISO, item.time)}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.textSubtle} />
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setOpen(false);
                router.push('/calendar');
              }}
              style={({ pressed }) => [styles.footer, pressed && styles.pressed]}
            >
              <Text style={[styles.footerText, { color: colors.accent }]}>{t('notifications.openCalendar')}</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontFamily: family.heavy, fontSize: 11, lineHeight: 13 },
  root: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)' },
  panel: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: PANEL_RADIUS,
    overflow: 'hidden',
  },
  panelClip: { borderRadius: PANEL_RADIUS, overflow: 'hidden' },
  panelInner: {
    position: 'absolute',
    top: 1.5,
    right: 1.5,
    bottom: 1.5,
    left: 1.5,
    borderRadius: PANEL_RADIUS - 1.5,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  panelTitle: { fontFamily: family.bold, fontSize: font.md, letterSpacing: -0.2 },
  closeButton: { minHeight: 36, minWidth: 36, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: space.sm, paddingBottom: space.sm, gap: space.xs },
  item: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  itemDot: { width: 8, height: 8, borderRadius: radius.pill },
  itemCopy: { flex: 1, minWidth: 0, gap: 2 },
  itemTitle: { fontFamily: family.semibold, fontSize: font.sm },
  itemMeta: { fontFamily: family.medium, fontSize: font.xs },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg },
  emptyText: { fontFamily: family.medium, fontSize: font.sm, textAlign: 'center' },
  footer: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingBottom: space.xs },
  footerText: { fontFamily: family.semibold, fontSize: font.sm },
  pressed: { opacity: 0.72 },
});
