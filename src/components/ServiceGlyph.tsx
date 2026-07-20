import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ServiceCategory } from '../lib/types';
import { useTheme } from '../context/ThemeContext';

type Props = {
  category: ServiceCategory;
  color?: string;
  size?: number;
};

export default function ServiceGlyph({ category, color, size = 22 }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(size, color ?? colors.text);

  if (category === 'elder_home') {
    return (
      <View style={styles.frame}>
        <View style={styles.houseRoofLeft} />
        <View style={styles.houseRoofRight} />
        <View style={styles.houseBase} />
        <View style={styles.houseDoor} />
      </View>
    );
  }

  if (category === 'doctor') {
    return (
      <View style={styles.frame}>
        <View style={styles.stethoscopeArc} />
        <View style={styles.stethoscopeLeft} />
        <View style={styles.stethoscopeRight} />
        <View style={styles.stethoscopeDot} />
      </View>
    );
  }

  if (category === 'hospital') {
    return (
      <View style={styles.frame}>
        <View style={styles.crossV} />
        <View style={styles.crossH} />
      </View>
    );
  }

  if (category === 'medical_shop') {
    return (
      <View style={styles.frame}>
        <View style={styles.pillShell}>
          <View style={styles.pillDivider} />
        </View>
      </View>
    );
  }

  if (category === 'travel_agent') {
    return (
      <View style={styles.frame}>
        <View style={styles.pinHead} />
        <View style={styles.pinDot} />
        <View style={styles.pinTail} />
      </View>
    );
  }

  if (category === 'home_service') {
    return (
      <View style={styles.frame}>
        <View style={styles.toolHandle} />
        <View style={styles.toolHead} />
        <View style={styles.toolMouth} />
      </View>
    );
  }

  return (
    <View style={styles.frame}>
      <View style={styles.civicRoof} />
      <View style={styles.civicBeam} />
      <View style={styles.civicColOne} />
      <View style={styles.civicColTwo} />
      <View style={styles.civicColThree} />
      <View style={styles.civicBase} />
    </View>
  );
}

function makeStyles(size: number, color: string) {
  const stroke = Math.max(1.6, Math.round(size * 0.1));
  const shellWidth = size * 0.72;
  const shellHeight = size * 0.4;

  return StyleSheet.create({
    frame: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },

    houseRoofLeft: {
      position: 'absolute',
      top: size * 0.18,
      left: size * 0.19,
      width: size * 0.38,
      height: stroke,
      backgroundColor: color,
      transform: [{ rotate: '-36deg' }],
      borderRadius: 999,
    },
    houseRoofRight: {
      position: 'absolute',
      top: size * 0.18,
      right: size * 0.19,
      width: size * 0.38,
      height: stroke,
      backgroundColor: color,
      transform: [{ rotate: '36deg' }],
      borderRadius: 999,
    },
    houseBase: {
      position: 'absolute',
      bottom: size * 0.14,
      width: size * 0.56,
      height: size * 0.42,
      borderWidth: stroke,
      borderColor: color,
      borderRadius: size * 0.08,
    },
    houseDoor: {
      position: 'absolute',
      bottom: size * 0.14,
      width: size * 0.14,
      height: size * 0.22,
      borderWidth: stroke,
      borderBottomWidth: 0,
      borderColor: color,
      borderTopLeftRadius: size * 0.08,
      borderTopRightRadius: size * 0.08,
    },

    stethoscopeArc: {
      position: 'absolute',
      width: size * 0.56,
      height: size * 0.48,
      bottom: size * 0.18,
      borderLeftWidth: stroke,
      borderRightWidth: stroke,
      borderBottomWidth: stroke,
      borderColor: color,
      borderBottomLeftRadius: size * 0.28,
      borderBottomRightRadius: size * 0.28,
    },
    stethoscopeLeft: {
      position: 'absolute',
      top: size * 0.12,
      left: size * 0.24,
      width: stroke,
      height: size * 0.2,
      backgroundColor: color,
      borderRadius: 999,
    },
    stethoscopeRight: {
      position: 'absolute',
      top: size * 0.12,
      right: size * 0.24,
      width: stroke,
      height: size * 0.2,
      backgroundColor: color,
      borderRadius: 999,
    },
    stethoscopeDot: {
      position: 'absolute',
      right: size * 0.16,
      bottom: size * 0.16,
      width: size * 0.12,
      height: size * 0.12,
      borderRadius: 999,
      backgroundColor: color,
    },

    crossV: {
      position: 'absolute',
      width: stroke,
      height: size * 0.64,
      borderRadius: 999,
      backgroundColor: color,
    },
    crossH: {
      position: 'absolute',
      width: size * 0.64,
      height: stroke,
      borderRadius: 999,
      backgroundColor: color,
    },

    pillShell: {
      width: shellWidth,
      height: shellHeight,
      borderWidth: stroke,
      borderColor: color,
      borderRadius: 999,
      transform: [{ rotate: '-34deg' }],
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillDivider: {
      width: stroke,
      height: shellHeight + stroke * 1.5,
      backgroundColor: color,
      borderRadius: 999,
    },

    pinHead: {
      position: 'absolute',
      top: size * 0.08,
      width: size * 0.48,
      height: size * 0.48,
      borderWidth: stroke,
      borderColor: color,
      borderRadius: 999,
    },
    pinDot: {
      position: 'absolute',
      top: size * 0.25,
      width: size * 0.1,
      height: size * 0.1,
      borderRadius: 999,
      backgroundColor: color,
    },
    pinTail: {
      position: 'absolute',
      bottom: size * 0.08,
      width: stroke,
      height: size * 0.28,
      backgroundColor: color,
      borderRadius: 999,
    },

    toolHandle: {
      position: 'absolute',
      width: stroke,
      height: size * 0.56,
      backgroundColor: color,
      borderRadius: 999,
      transform: [{ rotate: '36deg' }],
    },
    toolHead: {
      position: 'absolute',
      top: size * 0.14,
      right: size * 0.18,
      width: size * 0.28,
      height: size * 0.16,
      borderTopWidth: stroke,
      borderRightWidth: stroke,
      borderColor: color,
      borderTopRightRadius: size * 0.18,
      transform: [{ rotate: '36deg' }],
    },
    toolMouth: {
      position: 'absolute',
      top: size * 0.2,
      right: size * 0.16,
      width: size * 0.12,
      height: stroke,
      backgroundColor: color,
      transform: [{ rotate: '36deg' }],
      borderRadius: 999,
    },

    civicRoof: {
      position: 'absolute',
      top: size * 0.12,
      width: 0,
      height: 0,
      borderLeftWidth: size * 0.28,
      borderRightWidth: size * 0.28,
      borderBottomWidth: size * 0.14,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: color,
    },
    civicBeam: {
      position: 'absolute',
      top: size * 0.3,
      width: size * 0.7,
      height: stroke,
      backgroundColor: color,
      borderRadius: 999,
    },
    civicColOne: {
      position: 'absolute',
      top: size * 0.36,
      left: size * 0.22,
      width: stroke,
      height: size * 0.28,
      backgroundColor: color,
      borderRadius: 999,
    },
    civicColTwo: {
      position: 'absolute',
      top: size * 0.36,
      width: stroke,
      height: size * 0.28,
      backgroundColor: color,
      borderRadius: 999,
    },
    civicColThree: {
      position: 'absolute',
      top: size * 0.36,
      right: size * 0.22,
      width: stroke,
      height: size * 0.28,
      backgroundColor: color,
      borderRadius: 999,
    },
    civicBase: {
      position: 'absolute',
      bottom: size * 0.12,
      width: size * 0.74,
      height: stroke,
      backgroundColor: color,
      borderRadius: 999,
    },
  });
}
