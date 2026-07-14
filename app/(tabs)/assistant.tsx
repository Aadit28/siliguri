import React, { useEffect, useRef, useState } from 'react';
import type { TextInputKeyPressEvent } from 'react-native';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import ServiceGlyph from '../../src/components/ServiceGlyph';
import { useAuth } from '../../src/context/AuthContext';
import { useLocale } from '../../src/context/LocaleContext';
import { useTheme } from '../../src/context/ThemeContext';
import { requestAssistantPlan, AssistantAction, AssistantAttachment, AssistantMessage, AssistantPlan } from '../../src/lib/assistant';
import { fetchServices } from '../../src/lib/api';
import { categoryColor } from '../../src/lib/categories';
import { font, radius, space, shadow, TAP } from '../../src/lib/theme';
import { Service } from '../../src/lib/types';
import { openWhatsAppCall } from '../../src/lib/whatsapp';

const EXAMPLE_KEYS = ['doctor', 'medicine', 'travel'] as const;
const MAX_IMAGE_ATTACHMENTS = 3;
const MAX_CHAT_SESSIONS = 12;
const CHAT_STORAGE_KEY = 'saathi-assistant-chats-v1';
const MAX_STORED_MESSAGES_PER_CHAT = 40;

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
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const initialChatState = getInitialChatState(t);
  const [services, setServices] = useState<Service[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
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
    if (action.kind === 'family_update' && plan) {
      setInput(`${t('assistant.familyMessagePrefix')}\n${plan.summary}`);
      return;
    }
    setInput((current) => current || t('assistant.detailPrompt'));
  }

  const canSend = Boolean(input.trim() || attachments.length) && !loading && !servicesLoading;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <AppHeader title={t('assistant.title')} />

      <View style={[styles.assistantLayout, !showSideHistory ? styles.assistantLayoutStacked : null]}>
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
              <Text style={[styles.newChatButtonText, { color: isDark ? colors.textOnDark : '#fff' }]}>
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
          <View style={[styles.botHeader, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
            <View style={[styles.botAvatar, { backgroundColor: colors.primary }]}>
              <Text style={[styles.botAvatarText, { color: isDark ? colors.textOnDark : '#fff' }]}>AI</Text>
            </View>
            <View style={styles.botHeaderCopy}>
              <Text style={[styles.botTitle, { color: colors.text }]}>{t('assistant.botTitle')}</Text>
              <Text style={[styles.botStatus, { color: colors.success }]}>
                {servicesLoading ? t('assistant.loadingServices') : t('assistant.botStatus')}
              </Text>
            </View>
            {!showSideHistory ? (
              <TouchableOpacity
                onPress={startNewChat}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={t('assistant.newChat')}
                activeOpacity={0.82}
                style={[styles.mobileNewChat, { backgroundColor: colors.primarySoft, opacity: loading ? 0.6 : 1 }]}
              >
                <Text style={[styles.mobileNewChatText, { color: colors.primaryDark }]}>{t('assistant.newChat')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={[styles.safetyPanel, { backgroundColor: colors.warningBg, borderColor: colors.border }]}>
            <Text style={[styles.safetyText, { color: colors.warningText }]}>
              {t('assistant.safetyDisclaimer')}
            </Text>
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

          <View style={[styles.composer, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
            <Text style={[styles.examplesHint, { color: colors.textMuted }]}>
              {t('assistant.examplesHint')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickPrompts}
              keyboardShouldPersistTaps="handled"
            >
              {EXAMPLE_KEYS.map((key) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => submit(t(`assistant.examples.${key}`))}
                  accessibilityRole="button"
                  accessibilityLabel={t(`assistant.exampleLabels.${key}`)}
                  disabled={loading || servicesLoading}
                  activeOpacity={0.82}
                  style={[
                    styles.quickChip,
                    {
                      backgroundColor: colors.primaryTint,
                      borderColor: colors.border,
                      opacity: loading || servicesLoading ? 0.55 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.quickChipText, { color: colors.primaryDark }]}>
                    {t(`assistant.exampleLabels.${key}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.inputRow}>
              {canAttachImages ? (
                <TouchableOpacity
                  onPress={pickImages}
                  disabled={loading || servicesLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('assistant.attachImage')}
                  activeOpacity={0.82}
                  style={[
                    styles.photoButton,
                    {
                      backgroundColor: colors.primaryTint,
                      borderColor: colors.border,
                      opacity: loading || servicesLoading ? 0.55 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.photoButtonText, { color: colors.primaryDark }]}>
                    {t('assistant.attachImage')}
                  </Text>
                </TouchableOpacity>
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
                  {
                    backgroundColor: colors.bgAlt,
                    borderColor: colors.border,
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
                    backgroundColor: canSend ? colors.primary : colors.primaryTint,
                    opacity: canSend ? 1 : 0.65,
                  },
                ]}
              >
                <Text style={[styles.sendButtonText, { color: isDark ? colors.textOnDark : '#fff' }]}>
                  {t('assistant.chatSend')}
                </Text>
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
  const { colors, isDark } = useTheme();
  const isUser = message.role === 'user';
  const suggested = message.plan?.suggestedServices[0];
  const suggestedTone = suggested ? categoryColor(suggested.category) : null;

  return (
    <View style={isUser ? styles.userRow : styles.botRow}>
      {!isUser ? <SmallAvatar /> : null}
      <View
        style={[
          styles.message,
          isUser ? styles.userMessage : styles.botMessage,
          {
            backgroundColor: isUser ? colors.primary : colors.cardSolid,
            borderColor: isUser ? colors.primary : colors.border,
          },
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
                  { borderColor: isUser ? 'rgba(255,255,255,0.45)' : colors.border },
                ]}
              />
            ))}
          </View>
        ) : null}

        <Text
          selectable
          style={[
            styles.messageText,
            { color: isUser ? (isDark ? colors.textOnDark : '#fff') : colors.text },
          ]}
        >
          {message.text}
        </Text>

        {message.plan ? (
          <View style={[styles.simplePlan, { borderTopColor: colors.border }]}>
            {suggested ? (
              <View style={styles.serviceLine}>
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
                  <Text style={[styles.serviceName, { color: colors.text }]} numberOfLines={2}>
                    {suggested.name}
                  </Text>
                  <Text style={[styles.serviceMeta, { color: colors.textMuted }]} numberOfLines={2}>
                    {suggested.address || t('assistant.serviceReady')}
                  </Text>
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
  const { colors, isDark } = useTheme();
  return (
    <View style={[styles.smallAvatar, { backgroundColor: colors.primary }]}>
      <Text style={[styles.smallAvatarText, { color: isDark ? colors.textOnDark : '#fff' }]}>AI</Text>
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
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
  },
  historyPreview: {
    fontSize: font.xs,
    lineHeight: font.xs * 1.25,
  },
  chatShell: {
    flex: 1,
    width: '100%',
    gap: space.sm,
    minWidth: 0,
  },
  botHeader: {
    minHeight: 74,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    ...shadow.sm,
  },
  botAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botAvatarText: { fontSize: font.md, fontWeight: '900' },
  botHeaderCopy: { flex: 1, minWidth: 0 },
  botTitle: { fontSize: font.lg, fontWeight: '800' },
  botStatus: { fontSize: font.sm, fontWeight: '700', marginTop: 2 },
  mobileNewChat: {
    minHeight: 44,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileNewChatText: { fontSize: font.xs, fontWeight: '800' },
  safetyPanel: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  safetyText: {
    fontSize: font.xs,
    lineHeight: font.xs * 1.35,
    fontWeight: '800',
  },
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
  smallAvatarText: { fontSize: font.xs, fontWeight: '900' },
  message: {
    maxWidth: '82%',
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    ...shadow.sm,
  },
  botMessage: {
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  userMessage: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.sm,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  messageText: {
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
  typingText: { fontSize: font.sm, fontWeight: '700' },
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
  serviceName: { fontSize: font.sm, fontWeight: '900' },
  serviceMeta: { fontSize: font.xs, lineHeight: font.xs * 1.25 },
  planHint: {
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
  actionText: { fontSize: font.xs, fontWeight: '900' },
  composer: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.sm,
    gap: space.sm,
    ...shadow.sm,
  },
  quickPrompts: {
    gap: space.sm,
    paddingRight: space.md,
  },
  examplesHint: {
    fontSize: font.xs,
    fontWeight: '800',
    paddingHorizontal: 2,
  },
  quickChip: {
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  quickChipText: { fontSize: font.sm, fontWeight: '800' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
  },
  photoButton: {
    minHeight: TAP,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  photoButtonText: { fontSize: font.sm, fontWeight: '900' },
  input: {
    flex: 1,
    minHeight: TAP,
    maxHeight: 124,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: font.md,
    lineHeight: font.md * 1.3,
    textAlignVertical: 'top',
  },
  sendButton: {
    minWidth: 76,
    minHeight: TAP,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  sendButtonText: { fontSize: font.sm, fontWeight: '900' },
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
    fontWeight: '900',
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
