import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Sheet } from './ui';
import { useCity } from '../context/CityContext';
import { useTheme } from '../context/ThemeContext';
import { AppColors, ROW_MIN_HEIGHT, TAP, family, font, radius, space } from '../lib/theme';

/**
 * The active city, shown as a tappable chip.
 *
 * Deliberately reads as a statement of where you are rather than a form
 * control: the directory only makes sense once an elder can see, at a glance,
 * that these are numbers in their own town.
 */
export default function CityPicker() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { city, cities, setCitySlug } = useCity();
  const [open, setOpen] = useState(false);
  const styles = makeStyles(colors);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('city.change', { city: city.name })}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      >
        <Feather name="map-pin" size={15} color={colors.textMuted} />
        <Text style={styles.chipLabel} numberOfLines={1}>
          {city.name}
          {city.state ? `, ${city.state}` : ''}
        </Text>
        <Feather name="chevron-down" size={15} color={colors.textMuted} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title={t('city.title')}>
        <Text style={styles.hint}>{t('city.hint')}</Text>
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {cities.map((item) => {
            const active = item.slug === city.slug;
            return (
              <Pressable
                key={item.slug}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setCitySlug(item.slug);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.row,
                  active && { borderColor: colors.primary, backgroundColor: colors.surfaceTint },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  {item.state ? <Text style={styles.rowState}>{item.state}</Text> : null}
                </View>
                {active ? <Feather name="check" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: space.xs,
      // Below the 56px primary target on purpose: this is a secondary control
      // sitting under a heading, and a full-height pill there reads as a button
      // to press rather than a label to glance at. Still above the 44px floor.
      minHeight: 44,
      paddingHorizontal: space.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.bgAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipLabel: {
      fontFamily: family.medium,
      fontSize: font.sm,
      color: colors.text,
    },
    pressed: { opacity: 0.7 },
    hint: {
      fontFamily: family.regular,
      fontSize: font.sm,
      color: colors.textMuted,
      paddingHorizontal: space.md,
      paddingBottom: space.sm,
    },
    list: { maxHeight: 340 },
    listContent: { paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: ROW_MIN_HEIGHT,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgAlt,
    },
    rowText: { gap: 2 },
    rowName: { fontFamily: family.semibold, fontSize: font.md, color: colors.text },
    rowState: { fontFamily: family.regular, fontSize: font.sm, color: colors.textMuted },
  });
}
