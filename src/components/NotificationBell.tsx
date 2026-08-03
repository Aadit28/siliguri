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
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { fetchServerAlerts, markServerAlertsRead, ServerAlert } from '../lib/alerts';
import { useLivePoll } from '../lib/useLivePoll';
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
  const { session } = useAuth();
  const { height, width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [serverAlerts, setServerAlerts] = useState<ServerAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const requestId = useRef(0);
  const token = session?.access_token;
  const load = useCallback(() => {
    const id = ++requestId.current;
    listEvents().then((events) => {
      if (id === requestId.current) setItems(buildNotifications(events));
    });
    // Server alerts: family activity and help-desk updates. Web and Expo Go
    // never receive these as push, so the inbox is their only channel.
    fetchServerAlerts(token).then((result) => {
      if (id === requestId.current) {
        setServerAlerts(result.alerts);
        setUnreadCount(result.unread);
      }
    });
    return () => {
      // Invalidate any in-flight request on blur/unmount.
      requestId.current += 1;
    };
  }, [token]);

  useFocusEffect(load);

  // SOS is the one alert that must not wait for a navigation. The senior
  // presses it and every linked family member's bell should fill in while they
  // are looking at it — web and Expo Go get no push, so this inbox is their
  // only channel.
  useLivePoll(load);

  function openPanel() {
    load();
    setOpen(true);
    // The badge earned its attention; opening the panel spends it.
    if (unreadCount) {
      markServerAlertsRead(token);
      setUnreadCount(0);
    }
  }

  // Only things already due or due today are worth a badge; the rest sit quietly.
  const badgeCount = items.filter((item) => item.tone !== 'soon').length + unreadCount;
  // Cap rather than fix. A fixed height left a dead block of glass under three
  // rows; the panel now shrinks to its content and only scrolls once it would
  // pass a third of the viewport.
  const panelMaxHeight = Math.max(240, Math.round(height / 3));
  // The bell lives at the top right, so the panel hangs from that corner. Left
  // unbounded it spanned a 1900px desktop viewport, stretching every row the
  // full width of the screen for two lines of text.
  const panelWidth = Math.min(width - 28, 420);

  function alertDay(iso: string) {
    // IST calendar day, compared in IST — the alert about a Siliguri parent
    // should read "today" on the Siliguri day, wherever the guardian is.
    const ist = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000);
    const todayIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const dayKey = ist.toISOString().slice(0, 10);
    const todayKey = todayIst.toISOString().slice(0, 10);
    if (dayKey === todayKey) return t('notifications.tone.today');
    return dayKey;
  }

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
        onPress={openPanel}
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
            style={[
              styles.panel,
              shadow.md,
              { top: insets.top + space.xs, width: panelWidth, maxHeight: panelMaxHeight },
            ]}
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

            {items.length === 0 && serverAlerts.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="bell-off" size={22} color={colors.textSubtle} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  {t('notifications.empty')}
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.list}>
                {serverAlerts.map((alert) => (
                  <Pressable
                    key={alert.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${alert.title}. ${alert.body ?? ''}`}
                    onPress={() => {
                      setOpen(false);
                      const target = alert.url;
                      if (target && target.startsWith('/') && !target.startsWith('//')) {
                        router.push(target as never);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.item,
                      { borderColor: colors.navPillEdge, backgroundColor: colors.navPill },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.itemDot,
                        { backgroundColor: alert.unread ? colors.accent : colors.textMuted },
                      ]}
                    />
                    <View style={styles.itemCopy}>
                      <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
                        {alert.title}
                      </Text>
                      <Text style={[styles.itemMeta, { color: colors.textMuted }]} numberOfLines={1}>
                        {[alertDay(alert.createdAt), alert.body].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.textSubtle} />
                  </Pressable>
                ))}
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
