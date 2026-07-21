import React, { useEffect, useRef, useState } from 'react';
import type { TextInputKeyPressEvent } from 'react-native';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import ServiceGlyph from '../../src/components/ServiceGlyph';
import { Muted } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useDisplayMode } from '../../src/context/DisplayModeContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { requestAssistantPlan, AssistantAction, AssistantAttachment, AssistantMessage, AssistantPlan } from '../../src/lib/assistant';
import { addEvent, parseWhenToDate } from '../../src/lib/calendar';
import { fetchServices, toggleFavorite as toggleFavoriteRemote } from '../../src/lib/api';
import { useServicePreferences } from '../../src/lib/servicePreferences';
import { categoryColor } from '../../src/lib/categories';
import { family, font, radius, space, shadow, TAB_BAR_CLEARANCE, TAP } from '../../src/lib/theme';
import { Service } from '../../src/lib/types';
import { openWhatsAppCall, openWhatsAppShare } from '../../src/lib/whatsapp';

const EXAMPLE_KEYS = ['doctor', 'medicine', 'travel'] as const;
// 1 line = 23.4 text + 20 vertical padding; 3 lines = 90.2.
const COMPOSER_MIN_HEIGHT = 44;
const COMPOSER_MAX_HEIGHT = 91;
// Browser default focus ring draws a heavy black rect around the pill; the filled
// pill + caret is the focus affordance instead.
const WEB_INPUT_RESET = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as object) : null;
const MAX_IMAGE_ATTACHMENTS = 3;
const MAX_CHAT_SESSIONS = 12;
const CHAT_STORAGE_KEY = 'saathi-assistant-chats-v1';
const MAX_STORED_MESSAGES_PER_CHAT = 40;

// Targets for the planner's open_screen action payloads (see src/lib/assistant.ts).
const SCREEN_ROUTES: Record<string, string> = {
  calendar: '/calendar',
  services: '/services',
  community: '/community',
  help: '/help',
  connectors: '/connectors',
};

type ComposerKeyPressEvent = TextInputKeyPressEvent & {
  key?: string;
  shiftKey?: boolean;
  preventDefault?: () => void;
  nativeEvent: TextInputKeyPressEvent['nativeEvent'] & {
    shiftKey?: boolean;
  };
};

type ChatSession = {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  messages: AssistantMessage[];
};

type ChatState = {
  activeSessionId: string;
  sessions: ChatSession[];
};

let cachedInitialChatState: ChatState | null = null;

export default function AssistantScreen() {
  const { t } = useTranslation();
  const { lang } = useLocale();
  const { session } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const initialChatState = getInitialChatState(t);
  const [services, setServices] = useState<Service[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  // One text line incl. vertical padding; grows via onContentSizeChange to 3 lines max.
  const [inputHeight, setInputHeight] = useState(COMPOSER_MIN_HEIGHT);

  useEffect(() => {
    if (!input) setInputHeight(COMPOSER_MIN_HEIGHT);
  }, [input]);

  function handleInputContentSize(event: { nativeEvent: { contentSize: { height: number } } }) {
    const raw = event?.nativeEvent?.contentSize?.height || 0;
    // react-native-web reports scrollHeight (padding included); native reports text box only.
    const padded = Platform.OS === 'web' ? raw : raw + 20;
    setInputHeight(Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, Math.round(padded))));
  }
  const [sessions, setSessions] = useState<ChatSession[]>(() => initialChatState.sessions);
  const [activeSessionId, setActiveSessionId] = useState(() => initialChatState.activeSessionId);
  const [loading, setLoading] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const submitInFlightRef = useRef(false);
  const canAttachImages = getWebDocument() !== null;
  const activeSession = sessions.find((sessionItem) => sessionItem.id === activeSessionId) ?? sessions[0];
  const messages = activeSession.messages;
  const showSideHistory = width >= 900;
  const { isComputerMode } = useDisplayMode();

  useEffect(() => {
    let mounted = true;
    fetchServices()
      .then((items) => {
        if (mounted) setServices(items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setServicesLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages, loading]);

  useEffect(() => {
    setSessions((current) =>
      current.map((sessionItem) =>
        sessionItem.messages.length === 1 && sessionItem.messages[0].id === 'welcome'
          ? {
              ...sessionItem,
              title: t('assistant.newChat'),
              preview: t('assistant.simpleWelcome'),
              messages: [welcomeMessage(t('assistant.simpleWelcome'))],
            }
          : sessionItem,
      ),
    );
  }, [t]);

  useEffect(() => {
    if (!sessions.some((sessionItem) => sessionItem.id === activeSessionId)) {
      const fallbackSession = sessions[0];
      if (fallbackSession) setActiveSessionId(fallbackSession.id);
    }
  }, [activeSessionId, sessions, t]);

  useEffect(() => {
    saveChatState({ activeSessionId, sessions });
  }, [activeSessionId, sessions]);

  useEffect(() => {
    const documentRef = getWebDocument();
    if (!documentRef) return undefined;

    const handlePaste = (event: any) => {
      const items = Array.from(event.clipboardData?.items ?? []) as any[];
      const files = items
        .filter((item) => String(item?.type || '').startsWith('image/'))
        .map((item) => item.getAsFile?.())
        .filter(Boolean);

      if (!files.length) return;
      event.preventDefault?.();
      void readImageFiles(files).then((next) => {
        if (next.length) appendAttachments(next);
      });
    };

    documentRef.addEventListener('paste', handlePaste);
    return () => documentRef.removeEventListener('paste', handlePaste);
  }, []);

  function appendAttachments(next: AssistantAttachment[]) {
    setAttachments((current) => [...current, ...next].slice(0, MAX_IMAGE_ATTACHMENTS));
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function pickImages() {
    const documentRef = getWebDocument();
    if (!documentRef || loading || servicesLoading) return;

    const inputNode = documentRef.createElement('input');
    inputNode.type = 'file';
    inputNode.accept = 'image/*';
    inputNode.multiple = true;
    inputNode.onchange = () => {
      const files = Array.from(inputNode.files ?? []);
      void readImageFiles(files).then((next) => {
        if (next.length) appendAttachments(next);
      });
    };
    inputNode.click();
  }

  function updateMessagesForSession(sessionId: string, updater: (current: AssistantMessage[]) => AssistantMessage[]) {
    setSessions((current) =>
      current.map((sessionItem) => {
        if (sessionItem.id !== sessionId) return sessionItem;
        const nextMessages = updater(sessionItem.messages);
        return summarizeSession({
          ...sessionItem,
          messages: nextMessages,
          updatedAt: Date.now(),
        }, t);
      }),
    );
  }

  function updateActiveMessages(updater: (current: AssistantMessage[]) => AssistantMessage[]) {
    updateMessagesForSession(activeSessionId, updater);
  }

  function appendAssistantNote(text: string) {
    updateActiveMessages((current) => [
      ...current,
      { id: `note-${Date.now()}`, role: 'assistant', text },
    ]);
  }

  function startNewChat() {
    if (loading) return;
    const nextSession = newChatSession(t);
    setSessions((current) => [nextSession, ...current].slice(0, MAX_CHAT_SESSIONS));
    setActiveSessionId(nextSession.id);
    setInput('');
    setAttachments([]);
  }

  function selectChat(id: string) {
    if (loading) return;
    setActiveSessionId(id);
    setInput('');
    setAttachments([]);
  }

  async function submit(text = input) {
    const body = text.trim();
    const currentAttachments = attachments;
    const hasContent = Boolean(body || currentAttachments.length);
    if (!hasContent || loading || servicesLoading || submitInFlightRef.current) return;

    submitInFlightRef.current = true;
    const targetSessionId = activeSessionId;
    const userText = body || t('assistant.imageOnlyMessage');
    updateMessagesForSession(targetSessionId, (current) => [
      ...current,
      {
        id: `u-${Date.now()}`,
        role: 'user',
        text: userText,
        attachments: currentAttachments,
      },
    ]);
    setInput('');
    setAttachments([]);
    setLoading(true);

    try {
      const plan = await requestAssistantPlan({
        message: body,
        services,
        lang: lang === 'hi' ? 'hi' : 'en',
        imageAttachments: currentAttachments,
        token: session?.access_token,
      });

      const reply = [plan.summary, plan.followUpQuestion].filter(Boolean).join('\n\n');
      updateMessagesForSession(targetSessionId, (current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: reply,
          plan,
        },
      ]);
    } catch {
      updateMessagesForSession(targetSessionId, (current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: t('common.errorLoading'),
        },
      ]);
    } finally {
      submitInFlightRef.current = false;
      setLoading(false);
    }
  }

  function handleComposerKeyPress(event: ComposerKeyPressEvent) {
    const key = event.key ?? event.nativeEvent.key;
    const shiftKey = event.shiftKey ?? event.nativeEvent.shiftKey ?? false;
    if (key !== 'Enter' || shiftKey) return;

    event.preventDefault?.();
    submit();
  }

  function handleAction(action: AssistantAction, plan?: AssistantPlan) {
    if (action.kind === 'call' && action.value) {
      openWhatsAppCall(action.value);
      return;
    }
    if ((action.kind === 'directions' || action.kind === 'source') && action.value) {
      Linking.openURL(action.value);
      return;
    }
    if (action.kind === 'add_calendar' && action.value) {
      const payload = parseActionPayload(action.value);
      const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
      if (title) {
        const { dateISO, time } = parseWhenToDate(typeof payload?.when === 'string' ? payload.when : '');
        const service = plan?.suggestedServices.find((item) => item.id === action.serviceId) ?? null;
        addEvent({
          title,
          dateISO,
          time,
          serviceId: action.serviceId ?? null,
          serviceName: service?.name ?? null,
          servicePhone: service?.phone ?? null,
        })
          .then(() => appendAssistantNote(t('assistant.addedToCalendar')))
          .catch(() => appendAssistantNote(t('common.errorLoading')));
        return;
      }
    }
    if (action.kind === 'pay' && action.value) {
      const upiId = action.value;
      const payee = plan?.suggestedServices.find((item) => item.id === action.serviceId)?.name;
      const params = new URLSearchParams({ pa: upiId });
      if (payee) params.set('pn', payee);
      Linking.openURL(`upi://pay?${params.toString()}`).catch(() =>
        appendAssistantNote(`${t('pay.payUpi')}: ${upiId}`),
      );
      return;
    }
    if (action.kind === 'book_ride') {
      const payload = parseActionPayload(action.value);
      const rideUrl =
        typeof payload?.url === 'string' && /^https?:\/\//i.test(payload.url)
          ? payload.url
          : action.value && /^https?:\/\//i.test(action.value)
            ? action.value
            : null;
      if (rideUrl) {
        Linking.openURL(rideUrl);
        return;
      }
      // No bookable link in the payload yet; fall through to the composer prompt.
    }
    if (action.kind === 'open_screen') {
      const payload = parseActionPayload(action.value);
      const target = SCREEN_ROUTES[String(payload?.screen ?? '')];
      if (target) {
        router.push(target);
        return;
      }
    }
    if (action.kind === 'family_update' && plan) {
      // Hand off to WhatsApp instead of stuffing the composer — sending the canned
      // text back into the assistant just produced a nonsense round-trip.
      openWhatsAppShare(`${t('assistant.familyMessagePrefix')}\n${plan.summary}`);
      return;
    }
    setInput((current) => current || t('assistant.detailPrompt'));
  }

  const canSend = Boolean(input.trim() || attachments.length) && !loading && !servicesLoading;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <AppHeader title={t('assistant.title')} />

      <View
        style={[
          styles.assistantLayout,
          !showSideHistory ? styles.assistantLayoutStacked : null,
          !isComputerMode ? styles.assistantLayoutPhone : null,
        ]}
      >
        <View
          style={[
            styles.historyPanel,
            !showSideHistory ? styles.historyPanelStacked : null,
            { backgroundColor: colors.cardSolid, borderColor: colors.border },
          ]}
        >
          <View style={styles.historyHeader}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>{t('assistant.chatHistory')}</Text>
            <TouchableOpacity
              onPress={startNewChat}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={t('assistant.newChat')}
              activeOpacity={0.82}
              style={[styles.newChatButton, { backgroundColor: colors.primary, opacity: loading ? 0.72 : 1 }]}
            >
              <Text style={[styles.newChatButtonText, { color: colors.primaryFg }]}>
                {t('assistant.newChat')}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.historyList}
            horizontal={!showSideHistory}
            contentContainerStyle={[
              styles.historyListContent,
              !showSideHistory ? styles.historyListContentStacked : null,
            ]}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            {sessions.map((sessionItem) => {
              const active = sessionItem.id === activeSessionId;
              return (
                <TouchableOpacity
                  key={sessionItem.id}
                  onPress={() => selectChat(sessionItem.id)}
                  disabled={loading && !active}
                  accessibilityRole="button"
                  accessibilityLabel={sessionItem.title}
                  activeOpacity={0.82}
                  style={[
                    styles.historyItem,
                    !showSideHistory ? styles.historyItemStacked : null,
                    {
                      backgroundColor: active ? colors.primaryTint : colors.bgAlt,
                      borderColor: active ? colors.primary : colors.border,
                      opacity: loading && !active ? 0.55 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.historyItemTitle, { color: active ? colors.primaryDark : colors.text }]} numberOfLines={1}>
                    {sessionItem.title}
                  </Text>
                  <Text style={[styles.historyPreview, { color: colors.textMuted }]} numberOfLines={2}>
                    {sessionItem.preview}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.chatShell}>
          <View style={styles.statusRow}>
            <Muted style={styles.statusText}>
              {servicesLoading ? t('assistant.loadingServices') : t('assistant.botStatus')}
            </Muted>
            {!showSideHistory ? (
              <TouchableOpacity
                onPress={startNewChat}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={t('assistant.newChat')}
                activeOpacity={0.82}
                style={[styles.mobileNewChat, { borderColor: colors.border, opacity: loading ? 0.5 : 1 }]}
              >
                <Text style={[styles.mobileNewChatText, { color: colors.text }]}>{t('assistant.newChat')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.thread}
            contentContainerStyle={styles.threadContent}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onAction={handleAction}
              />
            ))}

            {loading ? (
              <View style={styles.botRow}>
                <SmallAvatar />
                <View style={[styles.typingBubble, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.typingText, { color: colors.textMuted }]}>
                    {t('assistant.typing')}
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.composer}>
            <View style={[styles.inputBar, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
              <View>
                {plusMenuOpen ? (
                  <View style={[styles.plusMenu, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
                    {canAttachImages ? (
                      <>
                        <TouchableOpacity
                          onPress={() => {
                            setPlusMenuOpen(false);
                            pickImages();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={t('assistant.attachImage')}
                          activeOpacity={0.82}
                          style={styles.plusMenuItem}
                        >
                          <Feather name="image" size={18} color={colors.text} />
                          <Text style={[styles.plusMenuItemText, { color: colors.text }]}>
                            {t('assistant.attachImage')}
                          </Text>
                        </TouchableOpacity>
                        <View style={[styles.plusMenuDivider, { backgroundColor: colors.border }]} />
                      </>
                    ) : null}
                    {EXAMPLE_KEYS.map((key) => (
                      <TouchableOpacity
                        key={key}
                        onPress={() => {
                          setPlusMenuOpen(false);
                          if (loading || servicesLoading) return;
                          submit(t(`assistant.examples.${key}`));
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t(`assistant.exampleLabels.${key}`)}
                        activeOpacity={0.82}
                        style={styles.plusMenuItem}
                      >
                        <Feather name="message-circle" size={18} color={colors.textMuted} />
                        <Text style={[styles.plusMenuItemText, { color: colors.text }]}>
                          {t(`assistant.exampleLabels.${key}`)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <TouchableOpacity
                  onPress={() => setPlusMenuOpen((open) => !open)}
                  disabled={loading || servicesLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('assistant.attachImage')}
                  activeOpacity={0.82}
                  style={[styles.plusButton, { opacity: loading || servicesLoading ? 0.4 : 1 }]}
                >
                  <Feather name="plus" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>
              <TextInput
                multiline
                blurOnSubmit={false}
                submitBehavior="submit"
                returnKeyType="send"
                value={input}
                onChangeText={setInput}
                onKeyPress={handleComposerKeyPress}
                onSubmitEditing={() => submit()}
                onFocus={() => setPlusMenuOpen(false)}
                onContentSizeChange={handleInputContentSize}
                placeholder={t('assistant.chatPlaceholder')}
                placeholderTextColor={colors.textSubtle}
                style={[
                  styles.input,
                  WEB_INPUT_RESET,
                  {
                    height: inputHeight,
                    color: colors.text,
                  },
                ]}
              />
              <TouchableOpacity
                onPress={() => submit()}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel={t('assistant.chatSend')}
                activeOpacity={0.82}
                style={[
                  styles.sendButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: canSend ? 1 : 0.35,
                  },
                ]}
              >
                <Feather name="arrow-up" size={20} color={colors.primaryFg} />
              </TouchableOpacity>
            </View>

            {attachments.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.attachmentList}
                keyboardShouldPersistTaps="handled"
              >
                {attachments.map((attachment) => (
                  <View key={attachment.id} style={[styles.attachmentPreview, { borderColor: colors.border }]}>
                    <Image source={{ uri: attachment.uri }} style={styles.attachmentPreviewImage} />
                    <TouchableOpacity
                      onPress={() => removeAttachment(attachment.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('assistant.removeImage')}
                      activeOpacity={0.82}
                      style={[styles.removeAttachmentButton, { backgroundColor: colors.cardSolid }]}
                    >
                      <Text style={[styles.removeAttachmentText, { color: colors.text }]}>x</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function MessageBubble({
  message,
  onAction,
}: {
  message: AssistantMessage;
  onAction: (action: AssistantAction, plan?: AssistantPlan) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { favoriteSet, toggleFavorite } = useServicePreferences();
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const isUser = message.role === 'user';
  const suggested = message.plan?.suggestedServices[0];
  const suggestedTone = suggested ? categoryColor(suggested.category) : null;
  const isStarred = suggested ? favoriteSet.has(suggested.id) : false;

  function starSuggested() {
    if (!suggested) return;
    setServiceMenuOpen(false);
    const wasFav = favoriteSet.has(suggested.id);
    toggleFavorite(suggested.id);
    if (user) {
      toggleFavoriteRemote(suggested.id, user.id, wasFav).catch(() => toggleFavorite(suggested.id));
    }
  }

  function sendSuggestedToFamily() {
    if (!suggested) return;
    setServiceMenuOpen(false);
    openWhatsAppShare(
      [t('assistant.familyMessagePrefix'), suggested.name, suggested.phone, suggested.address]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return (
    <View style={isUser ? styles.userRow : styles.botRow}>
      {!isUser ? <SmallAvatar /> : null}
      <View
        style={[
          styles.message,
          isUser ? styles.userMessage : styles.botMessage,
          {
            backgroundColor: isUser ? colors.chipBg : colors.cardSolid,
            borderColor: colors.border,
          },
        ]}
      >
        {message.attachments?.length ? (
          <View style={styles.messageAttachments}>
            {message.attachments.map((attachment) => (
              <Image
                key={attachment.id}
                source={{ uri: attachment.uri }}
                style={[styles.messageImage, { borderColor: colors.border }]}
              />
            ))}
          </View>
        ) : null}

        <Text selectable style={[styles.messageText, { color: colors.text }]}>
          {message.text}
        </Text>

        {message.plan ? (
          <View style={[styles.simplePlan, { borderTopColor: colors.border }]}>
            {suggested ? (
              <View style={styles.serviceLine}>
                <TouchableOpacity
                  onPress={() => router.push(`/service/${suggested.id}`)}
                  accessibilityRole="link"
                  accessibilityLabel={suggested.name}
                  activeOpacity={0.82}
                  style={styles.serviceLink}
                >
                  <View
                    style={[
                      styles.serviceIcon,
                      {
                        backgroundColor: suggestedTone?.bg ?? colors.primaryTint,
                        borderColor: suggestedTone?.border ?? colors.border,
                      },
                    ]}
                  >
                    <ServiceGlyph category={suggested.category} color={suggestedTone?.fg ?? colors.primaryDark} size={18} />
                  </View>
                  <View style={styles.serviceTextWrap}>
                    <Text style={[styles.serviceName, { color: colors.accent }]} numberOfLines={2}>
                      {suggested.name}
                    </Text>
                    <Text style={[styles.serviceMeta, { color: colors.textMuted }]} numberOfLines={2}>
                      {suggested.address || t('assistant.serviceReady')}
                    </Text>
                  </View>
                </TouchableOpacity>
                <View>
                  {serviceMenuOpen ? (
                    <View style={[styles.serviceMenu, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
                      <TouchableOpacity
                        onPress={starSuggested}
                        accessibilityRole="button"
                        accessibilityLabel={t(isStarred ? 'assistant.serviceMenu.unstar' : 'assistant.serviceMenu.star')}
                        activeOpacity={0.82}
                        style={styles.plusMenuItem}
                      >
                        <Feather name="star" size={18} color={isStarred ? colors.accent : colors.text} />
                        <Text style={[styles.plusMenuItemText, { color: colors.text }]}>
                          {t(isStarred ? 'assistant.serviceMenu.unstar' : 'assistant.serviceMenu.star')}
                        </Text>
                      </TouchableOpacity>
                      {suggested.phone ? (
                        <TouchableOpacity
                          onPress={() => {
                            setServiceMenuOpen(false);
                            openWhatsAppCall(suggested.phone);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={t('assistant.serviceMenu.call')}
                          activeOpacity={0.82}
                          style={styles.plusMenuItem}
                        >
                          <Feather name="phone" size={18} color={colors.text} />
                          <Text style={[styles.plusMenuItemText, { color: colors.text }]}>
                            {t('assistant.serviceMenu.call')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        onPress={sendSuggestedToFamily}
                        accessibilityRole="button"
                        accessibilityLabel={t('assistant.serviceMenu.sendToFamily')}
                        activeOpacity={0.82}
                        style={styles.plusMenuItem}
                      >
                        <Feather name="users" size={18} color={colors.text} />
                        <Text style={[styles.plusMenuItemText, { color: colors.text }]}>
                          {t('assistant.serviceMenu.sendToFamily')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => setServiceMenuOpen((open) => !open)}
                    accessibilityRole="button"
                    accessibilityLabel={t('assistant.serviceMenu.more')}
                    activeOpacity={0.82}
                    style={styles.serviceMoreButton}
                  >
                    <Feather name="more-horizontal" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <Text style={[styles.planHint, { color: colors.textMuted }]}>
              {message.plan.safetyNote}
            </Text>

            <View style={styles.actionRow}>
              {message.plan.actions.slice(0, 3).map((action, index) => (
                <TouchableOpacity
                  key={`${action.kind}-${index}`}
                  onPress={() => onAction(action, message.plan)}
                  activeOpacity={0.82}
                  style={[styles.actionButton, { backgroundColor: colors.primaryTint, borderColor: colors.border }]}
                >
                  <Text style={[styles.actionText, { color: colors.primaryDark }]} numberOfLines={1}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SmallAvatar() {
  const { colors } = useTheme();
  return (
    <View style={[styles.smallAvatar, { backgroundColor: colors.primary }]}>
      <Text style={[styles.smallAvatarText, { color: colors.primaryFg }]}>AI</Text>
    </View>
  );
}

function welcomeMessage(text: string): AssistantMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    text,
  };
}

function getInitialChatState(t: (key: string) => string): ChatState {
  if (cachedInitialChatState) return cachedInitialChatState;
  const storedState = loadChatState(t);
  cachedInitialChatState = storedState;
  return storedState;
}

function loadChatState(t: (key: string) => string): ChatState {
  const fallbackSession = newChatSession(t);
  const fallback = {
    activeSessionId: fallbackSession.id,
    sessions: [fallbackSession],
  };
  const storage = getWebStorage();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ChatState>;
    const sessions = sanitizeStoredSessions(parsed.sessions, t);
    if (!sessions.length) return fallback;
    const activeSessionId =
      parsed.activeSessionId && sessions.some((sessionItem) => sessionItem.id === parsed.activeSessionId)
        ? parsed.activeSessionId
        : sessions[0].id;
    return { activeSessionId, sessions };
  } catch {
    return fallback;
  }
}

function saveChatState(state: ChatState) {
  if (!state.sessions.length) return;
  // Keep the module cache current so a remount re-initializes from the latest
  // state instead of the snapshot taken on first mount.
  cachedInitialChatState = state;
  const storage = getWebStorage();
  if (!storage) return;

  const storedState = {
    activeSessionId: state.activeSessionId,
    sessions: state.sessions.slice(0, MAX_CHAT_SESSIONS).map(prepareSessionForStorage),
  };

  try {
    storage.setItem(CHAT_STORAGE_KEY, JSON.stringify(storedState));
  } catch {
    try {
      storage.setItem(CHAT_STORAGE_KEY, JSON.stringify(stripStoredImageData(storedState)));
    } catch {
      // Storage can be unavailable or full; the current in-memory chat should still work.
    }
  }
}

function sanitizeStoredSessions(value: unknown, t: (key: string) => string): ChatSession[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => {
      const id = String(item?.id || '');
      const messages = sanitizeStoredMessages(item?.messages);
      if (!id || !messages.length) return null;
      return summarizeSession(
        {
          id,
          title: String(item?.title || t('assistant.newChat')),
          preview: String(item?.preview || t('assistant.simpleWelcome')),
          updatedAt: typeof item?.updatedAt === 'number' ? item.updatedAt : Date.now(),
          messages,
        },
        t,
      );
    })
    .filter((sessionItem): sessionItem is ChatSession => Boolean(sessionItem))
    .sort((a: ChatSession, b: ChatSession) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CHAT_SESSIONS) as ChatSession[];
}

function sanitizeStoredMessages(value: unknown): AssistantMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((message: any) => {
      const role = message?.role === 'assistant' ? 'assistant' : message?.role === 'user' ? 'user' : null;
      const id = String(message?.id || '');
      const text = String(message?.text || '').trim();
      if (!role || !id || !text) return null;
      return {
        id,
        role,
        text,
        attachments: sanitizeStoredAttachments(message?.attachments),
        plan: isRenderableStoredPlan(message?.plan) ? message.plan : undefined,
      } as AssistantMessage;
    })
    .filter(Boolean)
    .slice(-MAX_STORED_MESSAGES_PER_CHAT) as AssistantMessage[];
}

function isRenderableStoredPlan(plan: any): boolean {
  // Old-schema plans without these arrays would crash the message renderer.
  return Boolean(
    plan &&
      typeof plan === 'object' &&
      Array.isArray(plan.suggestedServices) &&
      Array.isArray(plan.actions),
  );
}

function parseActionPayload(value?: string | null): any | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sanitizeStoredAttachments(value: unknown): AssistantAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const attachments = value
    .map((attachment: any) => {
      const id = String(attachment?.id || '');
      const uri = String(attachment?.uri || '');
      if (!id || !uri || !(uri.startsWith('data:image/') || /^https:\/\//i.test(uri))) return null;
      return {
        id,
        type: 'image',
        uri,
        name: attachment?.name ? String(attachment.name) : undefined,
        mimeType: attachment?.mimeType ? String(attachment.mimeType) : undefined,
        size: typeof attachment?.size === 'number' ? attachment.size : undefined,
      } as AssistantAttachment;
    })
    .filter(Boolean)
    .slice(0, MAX_IMAGE_ATTACHMENTS) as AssistantAttachment[];
  return attachments.length ? attachments : undefined;
}

function prepareSessionForStorage(sessionItem: ChatSession): ChatSession {
  return {
    ...sessionItem,
    messages: sessionItem.messages.slice(-MAX_STORED_MESSAGES_PER_CHAT),
  };
}

function stripStoredImageData(state: ChatState): ChatState {
  return {
    ...state,
    sessions: state.sessions.map((sessionItem) => ({
      ...sessionItem,
      messages: sessionItem.messages.map((message) => ({
        ...message,
        attachments: message.attachments?.map((attachment) => ({
          ...attachment,
          uri: '',
        })),
      })),
    })),
  };
}

function newChatSession(t: (key: string) => string): ChatSession {
  const now = Date.now();
  return {
    id: `chat-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: t('assistant.newChat'),
    preview: t('assistant.simpleWelcome'),
    updatedAt: now,
    messages: [welcomeMessage(t('assistant.simpleWelcome'))],
  };
}

function summarizeSession(sessionItem: ChatSession, t: (key: string) => string): ChatSession {
  const userMessages = sessionItem.messages.filter((message) => message.role === 'user');
  const lastMessage = sessionItem.messages[sessionItem.messages.length - 1];
  const title = userMessages[0]?.text || t('assistant.newChat');
  const preview = lastMessage?.text || t('assistant.simpleWelcome');
  return {
    ...sessionItem,
    title: truncateChatText(title, 42),
    preview: truncateChatText(preview, 76),
  };
}

function truncateChatText(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trim()}...`;
}

function getWebDocument(): any | null {
  return typeof globalThis === 'undefined' ? null : ((globalThis as any).document ?? null);
}

function getWebStorage(): Storage | null {
  return typeof globalThis === 'undefined' ? null : ((globalThis as any).localStorage ?? null);
}

async function readImageFiles(files: unknown[]): Promise<AssistantAttachment[]> {
  const imageFiles = files
    .filter((file: any) => String(file?.type || '').startsWith('image/'))
    .slice(0, MAX_IMAGE_ATTACHMENTS);

  const attachments = await Promise.all(imageFiles.map((file) => readImageFile(file)));
  return attachments.filter(Boolean) as AssistantAttachment[];
}

function readImageFile(file: any): Promise<AssistantAttachment | null> {
  const Reader = typeof globalThis === 'undefined' ? null : (globalThis as any).FileReader;
  if (!Reader) return Promise.resolve(null);

  return new Promise((resolve) => {
    const reader = new Reader();
    reader.onload = () => {
      const uri = typeof reader.result === 'string' ? reader.result : '';
      resolve(
        uri
          ? {
              id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: 'image',
              uri,
              name: file?.name ? String(file.name) : undefined,
              mimeType: file?.type ? String(file.type) : undefined,
              size: typeof file?.size === 'number' ? file.size : undefined,
            }
          : null,
      );
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  assistantLayout: {
    flex: 1,
    width: '100%',
    maxWidth: 1460,
    alignSelf: 'center',
    padding: space.md,
    flexDirection: 'row',
    gap: space.md,
  },
  assistantLayoutStacked: {
    flexDirection: 'column',
  },
  // Floating glass tab bar covers the bottom edge; keep the composer above it.
  assistantLayoutPhone: {
    paddingBottom: TAB_BAR_CLEARANCE - space.lg,
  },
  historyPanel: {
    width: 286,
    minWidth: 240,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.sm,
    gap: space.sm,
    ...shadow.sm,
  },
  historyPanelStacked: {
    display: 'none',
  },
  historyHeader: {
    gap: space.sm,
  },
  historyTitle: {
    fontSize: font.md,
    fontFamily: family.bold,
  },
  newChatButton: {
    minHeight: TAP,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  newChatButtonText: {
    fontSize: font.sm,
    fontFamily: family.semibold,
  },
  historyList: { flex: 1 },
  historyListContent: {
    gap: space.sm,
    paddingBottom: space.sm,
  },
  historyListContentStacked: {
    paddingBottom: 0,
    paddingRight: space.sm,
  },
  historyItem: {
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.sm,
    justifyContent: 'center',
    gap: 4,
  },
  historyItemStacked: {
    width: 220,
  },
  historyItemTitle: {
    fontSize: font.sm,
    fontFamily: family.semibold,
  },
  historyPreview: {
    fontFamily: family.regular,
    fontSize: font.xs,
    lineHeight: font.xs * 1.25,
  },
  chatShell: {
    flex: 1,
    width: '100%',
    gap: space.sm,
    minWidth: 0,
  },
  statusRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: 2,
  },
  statusText: { fontFamily: family.regular, fontSize: font.sm },
  mobileNewChat: {
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileNewChatText: { fontSize: font.sm, fontFamily: family.semibold },
  thread: { flex: 1 },
  threadContent: {
    paddingVertical: space.md,
    gap: space.md,
  },
  botRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  smallAvatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAvatarText: { fontSize: font.xs, fontFamily: family.bold },
  message: {
    maxWidth: '82%',
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    ...shadow.sm,
  },
  botMessage: {
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  userMessage: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.md,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  messageText: {
    fontFamily: family.regular,
    fontSize: font.md,
    lineHeight: font.md * 1.35,
  },
  typingBubble: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  typingText: { fontSize: font.sm, fontFamily: family.semibold },
  simplePlan: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    gap: space.sm,
  },
  serviceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    zIndex: 20,
  },
  serviceLink: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  serviceMoreButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceMenu: {
    position: 'absolute',
    top: 36,
    right: 0,
    minWidth: 210,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.xs,
    zIndex: 60,
    ...shadow.md,
  },
  serviceIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceTextWrap: { flex: 1, minWidth: 0 },
  serviceName: { fontSize: font.sm, fontFamily: family.bold },
  serviceMeta: { fontFamily: family.regular, fontSize: font.xs, lineHeight: font.xs * 1.25 },
  planHint: {
    fontFamily: family.regular,
    fontSize: font.xs,
    lineHeight: font.xs * 1.3,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  actionButton: {
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    maxWidth: '100%',
  },
  actionText: { fontSize: font.xs, fontFamily: family.semibold },
  composer: {
    paddingTop: space.xs,
    gap: space.sm,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 4,
  },
  plusButton: {
    width: 36,
    height: 36,
    marginBottom: 4,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusMenu: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    minWidth: 230,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.xs,
    zIndex: 30,
    ...shadow.md,
  },
  plusMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
  },
  plusMenuItemText: {
    fontSize: font.sm,
    fontFamily: family.medium,
  },
  plusMenuDivider: {
    height: 1,
    marginVertical: space.xs,
    marginHorizontal: space.sm,
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    fontFamily: family.regular,
    fontSize: font.md,
    lineHeight: font.md * 1.3,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 36,
    height: 36,
    marginBottom: 4,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentList: {
    gap: space.sm,
    paddingRight: space.md,
  },
  attachmentPreview: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  attachmentPreviewImage: {
    width: '100%',
    height: '100%',
  },
  removeAttachmentButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeAttachmentText: {
    fontSize: font.sm,
    fontFamily: family.bold,
    lineHeight: font.sm,
  },
  messageAttachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginBottom: space.xs,
  },
  messageImage: {
    width: 132,
    height: 96,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
