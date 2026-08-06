import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Sheet } from './ui';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { listFamilyLinks } from '../lib/family';
import { isDemoToken } from '../lib/demoFamily';
import { AppColors, ROW_MIN_HEIGHT, family, font, radius, space } from '../lib/theme';

/**
 * Who an action is for, when the signed-in account is not necessarily the
 * person it benefits.
 *
 * Two endpoints need this and both fail quietly without it. A booking resolves
 * the family from the caller when no elderId is sent, which only works for
 * someone who looks after exactly one parent: a guardian of two is answered
 * with a 400 they cannot act on, and a guardian of one silently books for the
 * parent with nothing on screen saying so. A subscription is worse — with no
 * beneficiary named, the plan a guardian bought for their mother entitles the
 * guardian instead. So the app names the person itself whenever the account has
 * an active guardian link, and shows the choice before the money or the seat.
 */
export type FamilyPerson = { id: string; name: string };

export type BeneficiaryLabels = {
  /** How the signed-in user appears in their own list, e.g. "Myself". */
  self: string;
  /** Stand-in for a linked parent whose name and phone are both unreadable. */
  unnamed: string;
};

export type BeneficiaryState = {
  /** Empty for an account that guards nobody — that user is always the beneficiary. */
  people: FamilyPerson[];
  /**
   * Sent as elderId. Null means "let the server resolve me", which is only
   * correct when `people` is empty.
   */
  beneficiaryId: string | null;
  setBeneficiaryId: (id: string) => void;
  selected: FamilyPerson | null;
  loading: boolean;
};

export function useFamilyBeneficiary(
  token: string | null,
  labels: BeneficiaryLabels,
): BeneficiaryState {
  const { user } = useAuth();
  const selfId = user?.id ?? null;
  // Depended on as strings: a fresh labels object every render would restart
  // the load on every state change it causes.
  const selfLabel = labels.self;
  const unnamedLabel = labels.unnamed;

  const [people, setPeople] = useState<FamilyPerson[]>([]);
  const [beneficiaryId, setBeneficiaryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || isDemoToken(token)) {
      setPeople([]);
      setBeneficiaryId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { asGuardian } = await listFamilyLinks(token);
      const parents: FamilyPerson[] = asGuardian
        .filter((link) => link.status === 'active' && link.parentId)
        .map((link) => ({
          id: link.parentId as string,
          name: link.parentName || link.parentPhone || unnamedLabel,
        }));

      if (parents.length === 0) {
        // Guards nobody, so they are the beneficiary. No picker, and no id:
        // the server resolves this case correctly on its own.
        setPeople([]);
        setBeneficiaryId(null);
        return;
      }

      // A guardian can also be cared for in their own right. "Myself" sits last
      // so the default stays the parent — what the server resolves today.
      const choices = selfId ? [...parents, { id: selfId, name: selfLabel }] : parents;
      setPeople(choices);
      setBeneficiaryId((current) =>
        current && choices.some((choice) => choice.id === current) ? current : (parents[0]?.id ?? null),
      );
    } catch {
      // A failed link read must not block the screen: fall back to the server's
      // own resolution, which still works for everyone who guards at most one
      // parent and answers the rest with a sentence naming the fix.
      setPeople([]);
      setBeneficiaryId(null);
    } finally {
      setLoading(false);
    }
  }, [selfId, selfLabel, token, unnamedLabel]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => people.find((person) => person.id === beneficiaryId) ?? null,
    [beneficiaryId, people],
  );

  return { people, beneficiaryId, setBeneficiaryId, selected, loading };
}

/**
 * The chip and its sheet. Renders nothing when there is nobody to choose
 * between, so a plain elder never meets a control that has one answer.
 */
export default function ForWhomPicker({
  people,
  selectedId,
  onChange,
  title,
  chipLabel,
  changeLabel,
}: {
  people: FamilyPerson[];
  selectedId: string | null;
  onChange: (id: string) => void;
  /** Sheet heading, e.g. "Who is this booking for?" */
  title: string;
  /** Chip text, already carrying the selected name. */
  chipLabel: string;
  /** Screen-reader label for the chip. */
  changeLabel: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const styles = makeStyles(colors);

  if (people.length < 2) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={changeLabel}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      >
        <Feather name="user" size={15} color={colors.textMuted} />
        <Text style={styles.chipLabel} numberOfLines={1}>
          {chipLabel}
        </Text>
        <Feather name="chevron-down" size={15} color={colors.textMuted} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {people.map((person) => {
            const active = person.id === selectedId;
            return (
              <Pressable
                key={person.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  onChange(person.id);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.row,
                  active && { borderColor: colors.primary, backgroundColor: colors.surfaceTint },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.rowName} numberOfLines={2}>
                  {person.name}
                </Text>
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
      minHeight: 44,
      paddingHorizontal: space.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.bgAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipLabel: { fontFamily: family.medium, fontSize: font.sm, color: colors.text, flexShrink: 1 },
    pressed: { opacity: 0.7 },
    list: { maxHeight: 340 },
    listContent: { paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.sm,
      minHeight: ROW_MIN_HEIGHT,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgAlt,
    },
    rowName: { flex: 1, fontFamily: family.semibold, fontSize: font.md, color: colors.text },
  });
}
