import type { VoiceTokenGrant } from './voice';

// The one place that knows how to put audio in a LiveKit room.
//
// It is a stub on purpose. Joining a room from React Native needs
// `@livekit/react-native` + `@livekit/react-native-webrtc`, which are native
// modules: they cannot be added to this project without `expo prebuild` and a
// new binary, so that decision is the user's to make, not this file's. The
// screen above it is fully wired — it authenticates, mints a real token, and
// runs the whole state machine — and lands on the "coming soon" copy here
// instead of pretending to connect.
//
// To finish it:
//   1. npx expo install @livekit/react-native @livekit/react-native-webrtc
//   2. npx expo prebuild   (leaves Expo Go behind; dev build required)
//   3. call registerGlobals() once at app start, then replace the body of
//      connectVoiceRoom with a Room().connect(grant.url, grant.token) and
//      setMicrophoneEnabled(true), returning the disconnect as `leave`.

/**
 * Thrown when the LiveKit client is not installed. The screen treats this the
 * same way it treats the server's `voice_not_configured`: calling is not ready
 * yet, which is a thing to explain, not an error to dump.
 */
export const VOICE_SDK_MISSING = 'voice_sdk_missing';

export type VoiceRoomHandle = {
  /** Leaves the room and releases the microphone. Safe to call twice. */
  leave: () => Promise<void>;
};

export type VoiceRoomEvents = {
  /** The agent is in the room and audio is flowing both ways. */
  onConnected?: () => void;
  /** The room ended without the elder hanging up — dropped network, worker crash. */
  onDisconnected?: () => void;
  onError?: (code: string) => void;
};

/** True once a real LiveKit client is wired in below. */
export function voiceRoomSupported(): boolean {
  return false;
}

export async function connectVoiceRoom(
  _grant: VoiceTokenGrant,
  _events: VoiceRoomEvents = {},
): Promise<VoiceRoomHandle> {
  const error = new Error('The voice calling library is not installed in this build.') as Error & {
    code?: string;
  };
  error.code = VOICE_SDK_MISSING;
  throw error;
}
