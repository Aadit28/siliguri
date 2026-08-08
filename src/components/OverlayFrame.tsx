import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useDisplayMode } from '../context/DisplayModeContext';
import { PHONE_MAX_WIDTH } from '../lib/display-mode';

// On web a react-native <Modal> renders into a fixed portal at the document
// root, outside the phone-width shell in app/_layout. Left alone, a sheet or a
// dialog spans the whole browser window while the app behind it is a 480px
// column — the scrim dims the desktop, not the phone. Every overlay wraps its
// contents in OverlayFrame so the scrim and the panel land on exactly the
// footprint the app occupies, in phone mode and in computer mode alike.

/** Width the overlay actually gets, for panels that size themselves. */
export function useOverlayWidth() {
  const { width } = useWindowDimensions();
  const { isComputerMode } = useDisplayMode();
  return isComputerMode ? width : Math.min(width, PHONE_MAX_WIDTH);
}

export default function OverlayFrame({
  onDismiss,
  style,
  children,
}: {
  /** Called for taps in the gutter beside the column. */
  onDismiss: () => void;
  /** The overlay's own root layout (bottom-anchored sheet, centred dialog…). */
  style?: View['props']['style'];
  children: React.ReactNode;
}) {
  const { isComputerMode } = useDisplayMode();
  return (
    <View style={styles.gutter}>
      {/* The gutter sits outside the scrim, so it needs its own dismiss target.
          Without it a desktop click beside the sheet does nothing and the
          overlay reads as stuck. Hidden from screen readers: the scrim inside
          the column already exposes a labelled Close. */}
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        focusable={false}
        onPress={onDismiss}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.column, isComputerMode ? null : styles.phone, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  gutter: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%' },
  phone: { maxWidth: PHONE_MAX_WIDTH },
});
