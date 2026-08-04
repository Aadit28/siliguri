import React, { useEffect, useState } from 'react';
import { ColorValue, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useDisplayMode } from '../../src/context/DisplayModeContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useSimpleMode } from '../../src/context/SimpleModeContext';
import { family, shadow } from '../../src/lib/theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

// @react-navigation/bottom-tabs is nested under expo-router, not directly
// importable — recover the tab-bar props type from the Tabs component itself.
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

// Compact capsule, sized like the iOS tab bar rather than a full-width shelf:
// item height is Apple's 44pt minimum target, the label drops to a caption, and
// the bar hugs its items instead of stretching edge to edge.
const DOCK_PAD = 4;
const ITEM_HEIGHT = 44;
// Six destinations must remain visible even on a 320pt-wide phone.
const ITEM_WIDTH = 52;
const DOCK_HEIGHT = ITEM_HEIGHT + DOCK_PAD * 2;
const DOCK_RADIUS = DOCK_HEIGHT / 2;
// GSAP power4.out equivalent: fast launch, long soft landing.
const SLIDE_EASING = Easing.bezier(0.22, 1, 0.36, 1);

// Easy view swaps the floating glass capsule for a plain docked shelf: opaque,
// full width, one hairline rule, no blur and no moving parts. Blur over live
// content is the single hardest thing on this screen to read with cataracts.
const SIMPLE_ITEM_HEIGHT = 64;
const SIMPLE_ICON_SIZE = 30;

function NavIcon({ name, color, focused }: { name: FeatherName; color: ColorValue; focused: boolean }) {
  const { isSimple } = useSimpleMode();
  const lift = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    lift.value = withSpring(focused ? 1 : 0, {
      damping: 16,
      stiffness: 260,
      reduceMotion: ReduceMotion.System,
    });
  }, [focused, lift]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value * -2 }],
  }));

  if (isSimple) {
    return <Feather name={name} size={SIMPLE_ICON_SIZE} color={color} />;
  }

  return (
    <Animated.View style={style}>
      <Feather name={name} size={21} color={color} />
    </Animated.View>
  );
}

function SimpleTabBar({ state, descriptors, navigation }: TabBarProps) {
  const { colors } = useTheme();
  const { isComputerMode } = useDisplayMode();

  // Same rule as the glass bar: desktop chrome supplies its own nav, and the
  // bar never hides on keyboard open.
  if (isComputerMode) return null;

  return (
    <View style={[styles.simpleBar, { backgroundColor: colors.bgAlt, borderTopColor: colors.border }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label =
          typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);
        const tint = focused ? colors.primaryFg : colors.text;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            style={[styles.simpleItem, focused && { backgroundColor: colors.primary }]}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
          >
            {options.tabBarIcon
              ? options.tabBarIcon({ focused, color: tint, size: SIMPLE_ICON_SIZE })
              : null}
            <Text
              maxFontSizeMultiplier={1.3}
              style={[styles.simpleLabel, { color: tint }]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function GlassTabBar({ state, descriptors, navigation }: TabBarProps) {
  const { colors, mode } = useTheme();
  const { isComputerMode } = useDisplayMode();
  const [innerWidth, setInnerWidth] = useState(0);
  const slide = useSharedValue(state.index);

  const itemWidth = innerWidth > 0 ? innerWidth / state.routes.length : 0;

  useEffect(() => {
    // ReduceMotion.Never: a short state-conveying translate — OS "animation
    // effects off" (default on many Windows installs) would otherwise make the
    // pill teleport and the indicator read as broken.
    slide.value = withTiming(state.index, {
      duration: 520,
      easing: SLIDE_EASING,
      reduceMotion: ReduceMotion.Never,
    });
  }, [state.index, slide]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value * itemWidth }],
  }));

  // B10: never hide the tab bar on keyboard open — elders lose all navigation.
  // The bar is absolutely positioned at bottom:14; on Android (adjustResize, the
  // pilot platform) the window resizes on keyboard show so it floats just above
  // the keyboard. Only computer mode (desktop chrome supplies its own nav) hides it.
  if (isComputerMode) return null;

  return (
    // Full-width wrapper only to centre the capsule; box-none so the page keeps
    // receiving touches either side of it.
    <View style={styles.dockWrap} pointerEvents="box-none">
      <View style={[styles.tabBar, shadow.md]}>
      <View style={[StyleSheet.absoluteFill, styles.dockClip]}>
        {/* Bevel: light catches the top-left edge, falls off bottom-right. */}
        <LinearGradient
          colors={[colors.navEdgeHi, colors.navEdgeLo]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.dockInner}>
          <BlurView
            intensity={48}
            tint={mode}
            experimentalBlurMethod="dimezisBlurView"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.navGlass }]}
          />
        </View>
      </View>

      <View
        style={styles.itemRow}
        onLayout={(event) => setInnerWidth(event.nativeEvent.layout.width)}
      >
        {itemWidth > 0 ? (
          <Animated.View
            style={[
              styles.pill,
              pillStyle,
              { width: itemWidth, backgroundColor: colors.navPill, borderColor: colors.navPillEdge },
            ]}
          />
        ) : null}

        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);
          const tint = focused ? colors.text : colors.textSubtle;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={styles.item}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            >
              {options.tabBarIcon ? options.tabBarIcon({ focused, color: tint, size: 21 }) : null}
              <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      </View>
    </View>
  );
}

export default function AppSectionLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { lang } = useLocale();
  const { isSimple } = useSimpleMode();

  return (
    <Tabs
      tabBar={(props) => (isSimple ? <SimpleTabBar {...props} /> : <GlassTabBar {...props} />)}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, focused }) => <NavIcon name="home" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: t('tabs.services'),
          tabBarIcon: ({ color, focused }) => <NavIcon name="search" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="activities"
        options={{
          title: t('tabs.activities'),
          tabBarIcon: ({ color, focused }) => <NavIcon name="calendar" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: t('tabs.assistant'),
          tabBarIcon: ({ color, focused }) => <NavIcon name="message-circle" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: t('tabs.community'),
          tabBarLabel: lang === 'hi' ? 'पूछें' : 'Ask',
          tabBarIcon: ({ color, focused }) => <NavIcon name="users" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="help"
        options={{
          title: t('tabs.help'),
          tabBarIcon: ({ color, focused }) => <NavIcon name="help-circle" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Detached floating glass dock: content scrolls underneath, blur samples it live.
  dockWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    alignItems: 'center',
  },
  tabBar: {
    maxWidth: '100%',
    height: DOCK_HEIGHT,
    borderRadius: DOCK_RADIUS,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  dockClip: {
    borderRadius: DOCK_RADIUS,
    overflow: 'hidden',
  },
  // Inset so the gradient underneath reads as a 1.5px bevel ring.
  dockInner: {
    position: 'absolute',
    top: 1.5,
    right: 1.5,
    bottom: 1.5,
    left: 1.5,
    borderRadius: DOCK_RADIUS - 1.5,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    margin: DOCK_PAD,
  },
  // Mini glass container that slides under the active tab.
  pill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: DOCK_RADIUS - DOCK_PAD,
    borderWidth: 1,
  },
  item: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  label: { fontFamily: family.medium, fontSize: 10, lineHeight: 12 },

  // Docked at the very bottom rather than floating: the existing
  // TAB_BAR_CLEARANCE (92) already reserves more than this bar's height, so no
  // screen's last row hides under it.
  simpleBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  simpleItem: {
    flex: 1,
    minHeight: SIMPLE_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 6,
  },
  simpleLabel: { fontFamily: family.semibold, fontSize: 16, lineHeight: 20, fontWeight: '600' },
});
