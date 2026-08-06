"""Saathi voice agent - week 1, text mode.

Tool loop + conversation state machine + eval harness, no audio. The audio
layer (LiveKit, Sarvam STT/TTS) arrives in week 2 and replaces only the
caller of `VoiceSession.user_says`.
"""

from .agent import AgentTurn, AuditEvent, AuditTrace, LLMResponse, LLMToolCall, OpenAIChatClient, VoiceSession
from .booking_client import BookingClient, BookingError, HttpBookingClient, MockBookingClient
from .guards import RejectionCode, SessionMemory, ToolRejection, detect_distress
from .prompts import ElderContext, FamilyMember, build_system_prompt
from .scripted_llm import ScriptedLLM, ScriptedStep
from .state import ConversationStateMachine, InvalidTransition, State, is_explicit_yes
from .tools import ToolDispatcher, ToolName, ToolOutcome, openai_tool_schemas

__all__ = [
    "AgentTurn",
    "AuditEvent",
    "AuditTrace",
    "BookingClient",
    "BookingError",
    "ConversationStateMachine",
    "ElderContext",
    "FamilyMember",
    "HttpBookingClient",
    "InvalidTransition",
    "LLMResponse",
    "LLMToolCall",
    "MockBookingClient",
    "OpenAIChatClient",
    "RejectionCode",
    "ScriptedLLM",
    "ScriptedStep",
    "SessionMemory",
    "State",
    "ToolDispatcher",
    "ToolName",
    "ToolOutcome",
    "ToolRejection",
    "VoiceSession",
    "build_system_prompt",
    "detect_distress",
    "is_explicit_yes",
    "openai_tool_schemas",
]
