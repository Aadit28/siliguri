import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Button, Muted, Sheet } from './ui';
import { AppColors, family, radius, Tokens } from '../lib/theme';
import { useTokens } from '../lib/useTokens';
import { useTheme } from '../context/ThemeContext';
import {
  ORDER_LANGUAGES,
  OrderLanguage,
  OrderPriceMode,
  buildOrderMessage,
  loadOrderAddress,
  loadOrderDraft,
  saveOrderAddress,
  saveOrderDraft,
} from '../lib/orderMessage';
import { openWhatsAppChat } from '../lib/whatsapp';

// Compose an order, read it, then send it.
//
// The sheet never sends anything. It opens WhatsApp with the message typed and
// the elder presses send there — which is what makes this legal without a
// Business API and, more to the point, what makes it trustworthy: the words
// leaving in their name are on screen first, in the language the shop reads.

type Props = {
  visible: boolean;
  onClose: () => void;
  serviceId: string;
  shopName: string;
  phone?: string | null;
  /** Who the order is for; the signed-in elder, or the parent a guardian is helping. */
  forName?: string | null;
};

export default function OrderSheet({ visible, onClose, serviceId, shopName, phone, forName }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const tk = useTokens();
  const styles = useMemo(() => makeStyles(colors, tk), [colors, tk]);

  const [item, setItem] = useState('');
  const [language, setLanguage] = useState<OrderLanguage>('hi');
  const [languageOpen, setLanguageOpen] = useState(false);
  const [priceMode, setPriceMode] = useState<OrderPriceMode>('ask');
  const [rupees, setRupees] = useState('');
  const [address, setAddress] = useState('');

  // Reload on every open, not once on mount: the elder may have ordered from
  // another shop in between, and a stale draft would put the wrong standing
  // price in front of them.
  useEffect(() => {
    if (!visible) return;
    const saved = loadOrderDraft(serviceId);
    setItem(saved?.item ?? '');
    setLanguage(saved?.language ?? 'hi');
    setPriceMode(saved?.priceMode ?? 'ask');
    setRupees(saved?.pricePaise ? String(Math.round(saved.pricePaise / 100)) : '');
    setAddress(loadOrderAddress());
    setLanguageOpen(false);
  }, [serviceId, visible]);

  const pricePaise = useMemo(() => {
    const value = Number(rupees.trim());
    if (!rupees.trim() || !Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 100);
  }, [rupees]);

  const draft = { item, language, priceMode, pricePaise };
  const preview = useMemo(
    () => buildOrderMessage(draft, { shopName, forName, address }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item, language, priceMode, pricePaise, shopName, forName, address],
  );

  const ready = item.trim().length > 0;
  const languageLabel = ORDER_LANGUAGES.find((l) => l.code === language)?.label ?? 'हिन्दी';

  function send() {
    if (!ready) return;
    saveOrderDraft(serviceId, draft);
    saveOrderAddress(address);
    void openWhatsAppChat(phone, preview);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('order.title', { shop: shopName })}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Muted>{t('order.subtitle')}</Muted>

        <Text style={styles.label}>{t('order.itemLabel')}</Text>
        <TextInput
          value={item}
          onChangeText={setItem}
          placeholder={t('order.itemPlaceholder')}
          placeholderTextColor={colors.textSubtle}
          style={styles.input}
          multiline
        />

        <Text style={styles.label}>{t('order.languageLabel')}</Text>
        <Muted style={styles.hint}>{t('order.languageHint')}</Muted>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: languageOpen }}
          onPress={() => setLanguageOpen((open) => !open)}
          style={styles.dropdown}
        >
          <Text style={styles.dropdownValue}>{languageLabel}</Text>
          <Feather name={languageOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
        </Pressable>
        {languageOpen ? (
          <View style={styles.dropdownList}>
            {ORDER_LANGUAGES.map((option) => (
              <Pressable
                key={option.code}
                accessibilityRole="button"
                accessibilityState={{ selected: option.code === language }}
                onPress={() => {
                  setLanguage(option.code);
                  setLanguageOpen(false);
                }}
                style={[styles.dropdownItem, option.code === language && styles.dropdownItemActive]}
              >
                <Text style={styles.dropdownValue}>{option.label}</Text>
                {option.code === language ? (
                  <Feather name="check" size={18} color={colors.primary} />
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={styles.label}>{t('order.priceLabel')}</Text>
        <View style={styles.modeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: priceMode === 'ask' }}
            onPress={() => setPriceMode('ask')}
            style={[styles.mode, priceMode === 'ask' && styles.modeActive]}
          >
            <Text style={styles.modeTitle}>{t('order.priceAsk')}</Text>
            <Text style={styles.modeHint}>{t('order.priceAskHint')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: priceMode === 'known' }}
            onPress={() => setPriceMode('known')}
            style={[styles.mode, priceMode === 'known' && styles.modeActive]}
          >
            <Text style={styles.modeTitle}>{t('order.priceKnown')}</Text>
            <Text style={styles.modeHint}>{t('order.priceKnownHint')}</Text>
          </Pressable>
        </View>
        {priceMode === 'known' ? (
          <TextInput
            value={rupees}
            onChangeText={setRupees}
            keyboardType="number-pad"
            placeholder={t('order.pricePlaceholder')}
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
          />
        ) : null}

        <Text style={styles.label}>{t('order.addressLabel')}</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder={t('order.addressPlaceholder')}
          placeholderTextColor={colors.textSubtle}
          style={styles.input}
          multiline
        />

        <Text style={styles.label}>{t('order.previewLabel')}</Text>
        <View style={styles.preview}>
          <Text style={styles.previewText}>{preview}</Text>
        </View>
        <Muted style={styles.hint}>{t('order.sendHint')}</Muted>

        <Button label={t('order.send')} disabled={!ready} onPress={send} />
      </ScrollView>
    </Sheet>
  );
}

function makeStyles(colors: AppColors, tk: Tokens) {
  return StyleSheet.create({
    body: { padding: tk.space.md, paddingBottom: tk.space.xl, gap: tk.space.sm },
    label: { color: colors.text, fontFamily: family.semibold, fontSize: tk.font.sm, marginTop: tk.space.sm },
    hint: { fontSize: tk.font.xs },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: tk.space.sm,
      paddingVertical: tk.space.sm,
      minHeight: tk.TAP,
      color: colors.text,
      fontFamily: family.regular,
      fontSize: tk.font.md,
      backgroundColor: colors.cardSolid,
    },
    dropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: tk.space.sm,
      minHeight: tk.TAP,
      backgroundColor: colors.cardSolid,
    },
    dropdownList: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: colors.cardSolid,
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: tk.space.sm,
      minHeight: tk.TAP,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    dropdownItemActive: { backgroundColor: colors.primaryTint },
    dropdownValue: { color: colors.text, fontFamily: family.medium, fontSize: tk.font.md },
    modeRow: { flexDirection: 'row', gap: tk.space.sm },
    mode: {
      flex: 1,
      gap: 2,
      padding: tk.space.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.cardSolid,
    },
    modeActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
    modeTitle: { color: colors.text, fontFamily: family.semibold, fontSize: tk.font.sm },
    modeHint: { color: colors.textMuted, fontFamily: family.regular, fontSize: tk.font.xs },
    preview: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: tk.space.sm,
      backgroundColor: colors.surfaceTint,
    },
    previewText: {
      color: colors.text,
      fontFamily: family.regular,
      fontSize: tk.font.md,
      lineHeight: tk.font.md * 1.4,
    },
  });
}
