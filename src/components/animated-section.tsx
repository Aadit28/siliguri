import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

export default function AnimatedSection({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View entering={FadeInUp.duration(420).delay(delay).springify().damping(18)} style={style}>
      {children}
    </Animated.View>
  );
}
