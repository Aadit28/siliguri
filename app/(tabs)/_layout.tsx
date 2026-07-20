import React, { useEffect, useState } from 'react';
import { ColorValue, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { family, font, shadow } from '../../src/lib/theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

// @react-navigation/bottom-tabs is nested under expo-router, not directly
// importable — recover the tab-bar props type from the Tabs component itself.
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const DOCK_RADIUS = 24;
const DOCK_PAD = 6;
// GSAP power4.out equivalent: fast launch, long soft landing.
const SLIDE_EASING = Easing.bezier(0.22, 1, 0.36, 1);

function NavIcon({ name, color, focused }: { name: FeatherName; color: ColorValue; focused: boolean }) {
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

  return (
    <Animated.View style={style}>
      <Feather name={name} size={24} color={color} />
    </Animated.View>
  );
}

function GlassTabBar({ state, descriptors, navigation }: TabBarProps) {
  const { colors, mode } = useTheme();
  const { isComputerMode } = useDisplayMode();
  const [innerWidth, setInnerWidth] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
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

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value * itemWidth }],
  }));

  if (isComputerMode || keyboardOpen) return null;

  return (
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
              {options.tabBarIcon ? options.tabBarIcon({ focused, color: tint, size: 24 }) : null}
              <Text style={[styles.label, { color: tint }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function AppSectionLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { lang } = useLocale();

  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
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
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    minHeight: 72,
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
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  label: { fontFamily: family.medium, fontSize: font.xs, lineHeight: 16 },
});
