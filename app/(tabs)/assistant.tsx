import React, { useEffect, useRef, useState } from 'react';
import type { TextInputKeyPressEvent } from 'react-native';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import AppHeader from '../../src/components/AppHeader';
import SiteFooter from '../../src/components/SiteFooter';
import { Button, Sheet } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { requestAssistantPlan, AssistantAction, AssistantAttachment, AssistantMessage, AssistantPlan, AssistantPlanContext } from '../../src/lib/assistant';
import { fetchServices } from '../../src/lib/api';
import { addEvent, listEvents, parseWhenToDate, toLocalISODate } from '../../src/lib/calendar';
import { serviceEmoji } from '../../src/lib/categories';
import { languageForContent } from '../../src/lib/languages';
import { appendTurn, buildAssistantContext, loadMemory } from '../../src/lib/memory';
import { openUpiPayment } from '../../src/lib/payments';
import { family, font, radius, shadow, space, TAP, tracking } from '../../src/lib/theme';
import { Service } from '../../src/lib/types';
import { speak, speechRecognitionSupported, startListening, stopSpeaking } from '../../src/lib/voice';

const EXAMPLE_KEYS = ['doctor', 'medicine', 'travel'] as const;
const MAX_IMAGE_ATTACHMENTS = 3;
const MAX_CHAT_SESSIONS = 12;
const CHAT_STORAGE_KEY = 'saathi-assistant-chats-v1';
const MAX_STORED_MESSAGES_PER_CHAT = 40;
const MAX_CONTEXT_CALENDAR_EVENTS = 10;
const PROFILE_CITY = 'Siliguri';
const AUTO_MESSAGE_IDS = new Set(['welcome', 'welcome-back']);

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
  const assistantLang = languageForContent(lang);
  const { session, displayName } = useAuth();
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const assistantSectionMinHeight = Math.max(520, height - 84);
  const router = useRouter();
  const initialChatState = getInitialChatState(t);
  const [services, setServices] = useState<Service[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>(() => initialChatState.sessions);
  const [activeSessionId, setActiveSessionId] = useState(() => initialChatState.activeSessionId);
  const [loading, setLoading] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const listenerRef = useRef<{ stop: () => void } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const submitInFlightRef = useRef(false);
  const canAttachImages = getWebDocument() !== null;
  const activeSession = sessions.find((sessionItem) => sessionItem.id === activeSessionId) ?? sessions[0];
  const messages = activeSession.messages;
  const showSideHistory = width >= 900;

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
    let mounted = true;
    loadMemory()
      .then((memory) => {
        if (!mounted || !memory.turns.length) return;
        setSessions((current) =>
          current.map((sessionItem) =>
            sessionItem.id === activeSessionId &&
            sessionItem.messages.length === 1 &&
            sessionItem.messages[0].id === 'welcome'
              ? {
                  ...sessionItem,
                  messages: [
                    ...sessionItem.messages,
                    { id: 'welcome-back', role: 'assistant' as const, text: t('assistant.welcomeBack') },
                  ],
                }
              : sessionItem,
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages, loading]);

  useEffect(() => {
    setSessions((current) =>
      current.map((sessionItem) => {
        const pristine =
          sessionItem.messages.length > 0 &&
          sessionItem.messages.every((message) => AUTO_MESSAGE_IDS.has(message.id));
        if (!pristine) return sessionItem;
        const nextMessages = sessionItem.messages.map((message) =>
          message.id === 'welcome-back'
            ? { ...message, text: t('assistant.welcomeBack') }
            : welcomeMessage(t('assistant.simpleWelcome')),
        );
        return {
          ...sessionItem,
          title: t('assistant.newChat'),
          preview: nextMessages[nextMessages.length - 1]?.text ?? t('assistant.simpleWelcome'),
          messages: nextMessages,
        };
      }),
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

    stopSpeaking();
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
      const context = await buildPlanContext(
        session && displayName ? { name: displayName, city: PROFILE_CITY } : null,
      );
      await appendTurn({ role: 'user', text: userText }).catch(() => undefined);

      const plan = await requestAssistantPlan({
        message: body,
        services,
        lang: assistantLang,
        imageAttachments: currentAttachments,
        token: session?.access_token,
        context,
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
      await appendTurn({ role: 'assistant', text: reply }).catch(() => undefined);
      if (speakReplies) speak(reply, assistantLang);
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
      Linking.openURL(`tel:${action.value}`);
      return;
    }
    if ((action.kind === 'directions' || action.kind === 'source') && action.value) {
      Linking.openURL(action.value);
      return;
    }
    if (action.kind === 'family_update' && plan) {
      setInput(`${t('assistant.familyMessagePrefix')}\n${plan.summary}`);
      return;
    }
    if (action.kind === 'add_calendar') {
      try {
        const payload = JSON.parse(action.value || '{}');
        const { dateISO, time } = parseWhenToDate(payload.when || '');
        const service = plan?.suggestedServices.find((item) => item.id === action.serviceId);
        addEvent({
          title: payload.title || plan?.summary || 'Saathi',
          dateISO,
          time,
          serviceId: action.serviceId ?? null,
          serviceName: service?.name ?? null,
          servicePhone: service?.phone ?? null,
        }).then(() => {
          const confirmationText = t('assistant.addedToCalendar');
          updateActiveMessages((current) => [
            ...current,
            { id: `cal-${Date.now()}`, role: 'assistant', text: confirmationText },
          ]);
          if (speakReplies) speak(confirmationText, assistantLang);
        });
      } catch {
        // Malformed action payload; ignore silently.
      }
      return;
    }
    if (action.kind === 'pay') {
      const service = plan?.suggestedServices.find((item) => item.id === action.serviceId);
      openUpiPayment({ upiId: String(action.value), name: service?.name }).then((opened) => {
        if (!opened) {
          updateActiveMessages((current) => [
            ...current,
            {
              id: `pay-${Date.now()}`,
              role: 'assistant',
              text: `${t('pay.webFallback')}\n${action.value}`,
            },
          ]);
        }
      });
      return;
    }
    if (action.kind === 'book_ride') {
      try {
        const payload = JSON.parse(action.value || '{}');
        const destination = payload.destination || '';
        Linking.openURL(
          `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff%5Bformatted_address%5D=${encodeURIComponent(destination)}`,
        );
      } catch {
        // Malformed action payload; ignore silently.
      }
      return;
    }
    if (action.kind === 'open_screen') {
      try {
        const payload = JSON.parse(action.value || '{}');
        const path = screenToPath(String(payload.screen || ''));
        if (path) router.push(path as any);
      } catch {
        // Malformed action payload; ignore silently.
      }
      return;
    }
    setInput((current) => current || t('assistant.detailPrompt'));
  }

  function toggleListening() {
    if (listening) {
      listenerRef.current?.stop();
      setListening(false);
      return;
    }
    stopSpeaking();
    const handle = startListening({
      lang: assistantLang,
      onResult: (text) => {
        setListening(false);
        submit(text);
      },
      onEnd: () => setListening(false),
      onError: () => setListening(false),
    });
    if (!handle) return;
    listenerRef.current = handle;
    setListening(true);
  }

  const canSend = Boolean(input.trim() || attachments.length) && !loading && !servicesLoading;
  const promptsDisabled = loading || servicesLoading;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <AppHeader title={t('assistant.title')} />

      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.layout,
            { minHeight: assistantSectionMinHeight },
            showSideHistory ? styles.layoutWide : null,
          ]}
        >
          {showSideHistory ? (
            <View
              style={[
                styles.historyPanel,
                { backgroundColor: colors.cardSolid, borderColor: colors.border },
              ]}
            >
              <View style={[styles.historyPanelHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.historyPanelTitle, { color: colors.text }]}>
                  {t('assistant.chatHistory')}
                </Text>
                <Button
                  label={t('assistant.newChat')}
                  onPress={startNewChat}
                  disabled={loading}
                  icon={<Feather name="plus" size={20} color={colors.primaryFg} />}
                />
              </View>
              <ScrollView style={styles.historyRows} showsVerticalScrollIndicator={false}>
                {sessions.map((sessionItem, index) => (
                  <React.Fragment key={sessionItem.id}>
                    {index > 0 ? (
                      <View style={[styles.historyDivider, { backgroundColor: colors.border }]} />
                    ) : null}
                    <ChatHistoryRow
                      item={sessionItem}
                      active={sessionItem.id === activeSessionId}
                      disabled={loading && sessionItem.id !== activeSessionId}
                      onPress={() => selectChat(sessionItem.id)}
                    />
                  </React.Fragment>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View
            style={[
              styles.chatColumn,
              showSideHistory
                ? [styles.chatColumnWide, { backgroundColor: colors.bg, borderColor: colors.border }]
                : null,
            ]}
          >
            <View style={[styles.botHeader, { borderBottomColor: colors.border }]}>
              <View style={[styles.botAvatar, { backgroundColor: colors.primary }]}>
                <Feather name="message-circle" size={20} color={colors.primaryFg} />
              </View>
              <View style={styles.botHeaderCopy}>
                <Text style={[styles.botTitle, { color: colors.text }]} numberOfLines={1}>
                  {t('assistant.botTitle')}
                </Text>
                <Text
                  style={[
                    styles.botStatus,
                    { color: servicesLoading ? colors.textMuted : colors.success },
                  ]}
                  numberOfLines={1}
                >
                  {servicesLoading ? t('assistant.loadingServices') : t('assistant.botStatus')}
                </Text>
              </View>
              <Pressable
                onPress={() => setSpeakReplies((current) => !current)}
                accessibilityRole="switch"
                accessibilityState={{ checked: speakReplies }}
                accessibilityLabel={t('voice.speakReplies')}
                style={({ pressed }) => [
                  styles.iconBtn,
                  {
                    backgroundColor: speakReplies
                      ? colors.accentSoft
                      : pressed
                        ? colors.cardStrong
                        : colors.surfaceTint,
                  },
                ]}
              >
                <Feather
                  name={speakReplies ? 'volume-2' : 'volume-x'}
                  size={20}
                  color={speakReplies ? colors.accent : colors.textMuted}
                />
              </Pressable>
              {!showSideHistory ? (
                <Pressable
                  onPress={() => setHistoryOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('assistant.chatHistory')}
                  style={({ pressed }) => [
                    styles.iconBtn,
                    { backgroundColor: pressed ? colors.cardStrong : colors.surfaceTint },
                  ]}
                >
                  <Feather name="clock" size={20} color={colors.text} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => router.push('/calendar')}
                accessibilityRole="button"
                accessibilityLabel={t('calendar.title')}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { backgroundColor: pressed ? colors.cardStrong : colors.surfaceTint },
                ]}
              >
                <Feather name="calendar" size={20} color={colors.text} />
              </Pressable>
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
                <View
                  style={[
                    styles.bubble,
                    styles.botBubble,
                    styles.typingBubble,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <ActivityIndicator color={colors.textMuted} />
                  <Text style={[styles.typingText, { color: colors.textMuted }]}>
                    {t('assistant.typing')}
                  </Text>
                </View>
              </View>
            ) : null}

            {!loading && !messages.some((message) => message.role === 'user') ? (
              <View style={styles.starterBlock}>
                <Text style={[styles.examplesHint, { color: colors.textSubtle }]}>
                  {t('assistant.examplesHint')}
                </Text>
                {EXAMPLE_KEYS.map((key) => (
                  <Pressable
                    key={key}
                    disabled={promptsDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={t(`assistant.exampleLabels.${key}`)}
                    onPress={() => {
                      if (!promptsDisabled) submit(t(`assistant.examples.${key}`));
                    }}
                    style={({ pressed }) => [
                      styles.starterRow,
                      {
                        backgroundColor: pressed ? colors.cardStrong : colors.card,
                        borderColor: colors.border,
                        opacity: promptsDisabled ? 0.55 : 1,
                      },
                    ]}
                  >
                    <View style={[styles.starterDisc, { backgroundColor: colors.surfaceTint }]}>
                      <Feather name="message-circle" size={18} color={colors.text} />
                    </View>
                    <Text
                      style={[styles.starterText, { color: colors.text }]}
                      numberOfLines={2}
                    >
                      {t(`assistant.exampleLabels.${key}`)}
                    </Text>
                    <Feather name="arrow-up-right" size={18} color={colors.textSubtle} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View
            style={[
              styles.composer,
              { backgroundColor: colors.bgAlt, borderTopColor: colors.border },
            ]}
          >
            {attachments.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.attachmentList}
                keyboardShouldPersistTaps="handled"
              >
                {attachments.map((attachment) => (
                  <View
                    key={attachment.id}
                    style={[styles.attachmentPreview, { borderColor: colors.border }]}
                  >
                    <Image source={{ uri: attachment.uri }} style={styles.attachmentPreviewImage} />
                    <Pressable
                      onPress={() => removeAttachment(attachment.id)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={t('assistant.removeImage')}
                      style={[
                        styles.removeAttachmentButton,
                        { backgroundColor: colors.cardSolid, borderColor: colors.border },
                      ]}
                    >
                      <Feather name="x" size={14} color={colors.text} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            {listening ? (
              <View style={styles.listeningRow}>
                <View style={[styles.listeningDot, { backgroundColor: colors.danger }]} />
                <Text style={[styles.listeningHint, { color: colors.danger }]}>
                  {t('voice.listening')}
                </Text>
              </View>
            ) : null}

            <View style={styles.inputRow}>
              {speechRecognitionSupported() ? (
                <Pressable
                  onPress={toggleListening}
                  disabled={loading || servicesLoading}
                  accessibilityRole="button"
                  accessibilityLabel={listening ? t('voice.stop') : t('voice.start')}
                  style={({ pressed }) => [
                    styles.roundBtn,
                    {
                      backgroundColor: listening
                        ? colors.danger
                        : pressed
                          ? colors.cardStrong
                          : colors.surfaceTint,
                      opacity: loading || servicesLoading ? 0.45 : 1,
                    },
                  ]}
                >
                  <Feather
                    name={listening ? 'mic-off' : 'mic'}
                    size={20}
                    color={listening ? colors.dangerFg : colors.text}
                  />
                </Pressable>
              ) : null}
              {canAttachImages ? (
                <Pressable
                  onPress={pickImages}
                  disabled={loading || servicesLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('assistant.attachImage')}
                  style={({ pressed }) => [
                    styles.roundBtn,
                    {
                      backgroundColor: pressed ? colors.cardStrong : colors.surfaceTint,
                      opacity: loading || servicesLoading ? 0.45 : 1,
                    },
                  ]}
                >
                  <Feather name="image" size={20} color={colors.text} />
                </Pressable>
              ) : null}
              <TextInput
                multiline
                blurOnSubmit={false}
                submitBehavior="submit"
                returnKeyType="send"
                value={input}
                onChangeText={setInput}
                onKeyPress={handleComposerKeyPress}
                onSubmitEditing={() => submit()}
                placeholder={t('assistant.chatPlaceholder')}
                placeholderTextColor={colors.textSubtle}
                style={[
                  styles.input,
                  { backgroundColor: colors.surfaceTint, color: colors.text },
                ]}
              />
              <Pressable
                onPress={() => submit()}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel={t('assistant.chatSend')}
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    backgroundColor: canSend
                      ? pressed
                        ? colors.primaryDark
                        : colors.primary
                      : colors.surfaceTint,
                  },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textSubtle} />
                ) : (
                  <Feather
                    name="arrow-up"
                    size={24}
                    color={canSend ? colors.primaryFg : colors.textSubtle}
                  />
                )}
              </Pressable>
            </View>
          </View>
        </View>
        </View>
        <SiteFooter services={services} />
      </ScrollView>

      {!showSideHistory ? (
        <Sheet
          visible={historyOpen}
          onClose={() => setHistoryOpen(false)}
          title={t('assistant.chatHistory')}
        >
          <Button
            label={t('assistant.newChat')}
            onPress={() => {
              startNewChat();
              setHistoryOpen(false);
            }}
            disabled={loading}
            icon={<Feather name="plus" size={20} color={colors.primaryFg} />}
          />
          <ScrollView
            style={{ maxHeight: Math.round(height * 0.5), marginTop: space.md }}
            contentContainerStyle={styles.sheetRows}
            showsVerticalScrollIndicator={false}
          >
            {sessions.map((sessionItem) => (
              <ChatHistoryRow
                key={sessionItem.id}
                item={sessionItem}
                rounded
                active={sessionItem.id === activeSessionId}
                disabled={loading && sessionItem.id !== activeSessionId}
                onPress={() => {
                  selectChat(sessionItem.id);
                  setHistoryOpen(false);
                }}
              />
            ))}
          </ScrollView>
        </Sheet>
      ) : null}
    </View>
  );
}

function ChatHistoryRow({
  item,
  active,
  disabled,
  rounded,
  onPress,
}: {
  item: ChatSession;
  active: boolean;
  disabled?: boolean;
  rounded?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      style={({ pressed }) => [
        styles.historyRow,
        rounded ? styles.historyRowRounded : null,
        {
          backgroundColor: active ? colors.cardStrong : pressed ? colors.overlay : 'transparent',
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <View style={[styles.historyDisc, { backgroundColor: colors.surfaceTint }]}>
        <Feather name="message-square" size={20} color={colors.text} />
      </View>
      <View style={styles.historyRowText}>
        <Text style={[styles.historyRowTitle, { color: colors.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.historyRowPreview, { color: colors.textMuted }]} numberOfLines={1}>
          {item.preview}
        </Text>
      </View>
      {active ? <Feather name="check" size={20} color={colors.text} /> : null}
    </Pressable>
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
  const isUser = message.role === 'user';

  return (
    <View style={isUser ? styles.userRow : styles.botRow}>
      {!isUser ? <SmallAvatar /> : null}
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.userBubble, { backgroundColor: colors.primary }]
            : [styles.botBubble, { backgroundColor: colors.card, borderColor: colors.border }],
        ]}
      >
        {message.attachments?.length ? (
          <View style={styles.messageAttachments}>
            {message.attachments.map((attachment) => (
              <Image
                key={attachment.id}
                source={{ uri: attachment.uri }}
                style={[
                  styles.messageImage,
                  { borderColor: colors.border },
                ]}
              />
            ))}
          </View>
        ) : null}

        <Text
          selectable
          style={[
            styles.messageText,
            { color: isUser ? colors.primaryFg : colors.text },
          ]}
        >
          {message.text}
        </Text>

        {message.plan ? (
          <View style={[styles.planBlock, { borderTopColor: colors.border }]}>
            {message.plan.suggestedServices[0] ? (
              <View style={styles.serviceLine}>
                <View style={[styles.serviceTile, { backgroundColor: colors.surfaceTint }]}>
                  <Text style={styles.serviceEmoji}>
                    {serviceEmoji(message.plan.suggestedServices[0].category)}
                  </Text>
                </View>
                <View style={styles.serviceTextWrap}>
                  <Text style={[styles.serviceName, { color: colors.text }]} numberOfLines={2}>
                    {message.plan.suggestedServices[0].name}
                  </Text>
                  <Text style={[styles.serviceMeta, { color: colors.textMuted }]} numberOfLines={2}>
                    {message.plan.suggestedServices[0].address || t('assistant.serviceReady')}
                  </Text>
                </View>
              </View>
            ) : null}

            <Text style={[styles.planNote, { color: colors.textMuted }]}>
              {message.plan.safetyNote}
            </Text>

            {message.plan.actions.length > 0 ? (
              <Text style={[styles.approveHint, { color: colors.textSubtle }]}>
                {t('assistant.approve')}
              </Text>
            ) : null}

            <View style={styles.actionRow}>
              {message.plan.actions.slice(0, 4).map((action, index) => (
                <Pressable
                  key={`${action.kind}-${index}`}
                  onPress={() => onAction(action, message.plan)}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  style={({ pressed }) => [
                    styles.actionPill,
                    { backgroundColor: colors.accentSoft, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.actionPillText, { color: colors.accent }]} numberOfLines={1}>
                    {action.label}
                  </Text>
                </Pressable>
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
      <Feather name="message-circle" size={16} color={colors.primaryFg} />
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

function screenToPath(screen: string): string | null {
  if (screen === 'home') return '/';
  if (screen === 'calendar') return '/calendar';
  if (screen === 'services') return '/services';
  if (screen === 'community') return '/community';
  if (screen === 'help') return '/help';
  if (screen === 'connectors') return '/connectors';
  if (screen.startsWith('service:')) {
    const id = screen.slice('service:'.length).trim();
    if (!id || id.includes('/') || id.includes('\\') || id.includes('..')) return null;
    return `/service/${id}`;
  }
  return null;
}

async function buildPlanContext(
  profile: { name: string; city: string } | null,
): Promise<AssistantPlanContext | null> {
  try {
    const memoryContext = await buildAssistantContext();
    const events = await listEvents();
    const todayISO = toLocalISODate(new Date());
    const calendar = events
      .filter((event) => event.dateISO >= todayISO)
      .slice(0, MAX_CONTEXT_CALENDAR_EVENTS)
      .map((event) => ({
        title: event.title,
        dateISO: event.dateISO,
        time: event.time,
      }));

    const context: AssistantPlanContext = {};
    if (profile) context.profile = profile;
    if (calendar.length) {
      context.calendar = calendar;
      context.todayISO = todayISO;
    }
    if (memoryContext.facts.length) context.facts = memoryContext.facts;
    if (memoryContext.recentTurns.length) context.recentTurns = memoryContext.recentTurns;
    return Object.keys(context).length ? context : null;
  } catch {
    return null;
  }
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
  const storage = getWebStorage();
  if (!storage || !state.sessions.length) return;

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
        plan: message?.plan && typeof message.plan === 'object' ? message.plan : undefined,
      } as AssistantMessage;
    })
    .filter(Boolean)
    .slice(-MAX_STORED_MESSAGES_PER_CHAT) as AssistantMessage[];
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
  pageScroll: { flex: 1 },
  pageContent: {
    flexGrow: 1,
    paddingBottom: 0,
  },
  layout: {
    flex: 1,
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
    flexDirection: 'column',
    minWidth: 0,
  },
  layoutWide: {
    flexDirection: 'row',
    padding: space.md,
    gap: space.md,
  },
  historyPanel: {
    width: 300,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.sm,
  },
  historyPanelHeader: {
    padding: space.md,
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyPanelTitle: {
    fontSize: font.lg,
    fontFamily: family.bold,
    letterSpacing: tracking.lg,
    lineHeight: Math.round(font.lg * 1.3),
  },
  historyRows: { flex: 1 },
  historyRow: {
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyRowRounded: {
    borderRadius: radius.md,
  },
  historyDisc: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyRowText: { flex: 1, minWidth: 0 },
  historyRowTitle: {
    fontSize: font.md,
    fontFamily: family.semibold,
  },
  historyRowPreview: {
    fontSize: font.sm,
    fontFamily: family.regular,
    lineHeight: Math.round(font.sm * 1.45),
    marginTop: 2,
  },
  historyDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 72,
  },
  sheetRows: {
    gap: space.xs,
  },
  chatColumn: {
    flex: 1,
    minWidth: 0,
  },
  chatColumnWide: {
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.sm,
  },
  botHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  botAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botHeaderCopy: { flex: 1, minWidth: 0 },
  botTitle: {
    fontSize: font.lg,
    fontFamily: family.bold,
    letterSpacing: tracking.lg,
    lineHeight: Math.round(font.lg * 1.3),
  },
  botStatus: {
    fontSize: font.sm,
    fontFamily: family.medium,
    marginTop: 2,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thread: { flex: 1 },
  threadContent: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: space.md,
  },
  botRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingRight: space.xl,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingLeft: space.xxl,
  },
  smallAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '84%',
    paddingHorizontal: space.md,
    paddingVertical: 12,
  },
  botBubble: {
    borderWidth: 1,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    ...shadow.sm,
  },
  userBubble: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.sm,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  messageText: {
    fontSize: font.md,
    fontFamily: family.regular,
    lineHeight: Math.round(font.md * 1.5),
  },
  messageAttachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginBottom: space.sm,
  },
  messageImage: {
    width: 132,
    height: 96,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  typingBubble: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  typingText: {
    fontSize: font.sm,
    fontFamily: family.medium,
  },
  planBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  serviceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  serviceTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceEmoji: { fontSize: 22 },
  serviceTextWrap: { flex: 1, minWidth: 0 },
  serviceName: {
    fontSize: font.md,
    fontFamily: family.semibold,
  },
  serviceMeta: {
    fontSize: font.sm,
    fontFamily: family.regular,
    lineHeight: Math.round(font.sm * 1.45),
    marginTop: 2,
  },
  planNote: {
    fontSize: font.sm,
    fontFamily: family.regular,
    lineHeight: Math.round(font.sm * 1.45),
  },
  approveHint: {
    fontSize: font.xs,
    fontFamily: family.medium,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  actionPill: {
    minHeight: 44,
    borderRadius: radius.pill,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    maxWidth: '100%',
  },
  actionPillText: {
    fontSize: font.sm,
    fontFamily: family.semibold,
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  examplesHint: {
    fontSize: font.xs,
    fontFamily: family.medium,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  starterBlock: {
    marginTop: space.sm,
    gap: space.sm,
  },
  starterRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  starterDisc: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starterText: {
    flex: 1,
    fontSize: font.sm,
    fontFamily: family.semibold,
    lineHeight: Math.round(font.sm * 1.35),
  },
  listeningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: 2,
  },
  listeningDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  listeningHint: {
    fontSize: font.sm,
    fontFamily: family.medium,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
  },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 124,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: font.md,
    fontFamily: family.regular,
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  sendBtn: {
    width: TAP,
    height: TAP,
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
    top: space.xs,
    right: space.xs,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
