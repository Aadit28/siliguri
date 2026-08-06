"""Client-side mirrors of the server's refusals.

Three unrelated-looking jobs live here because they share one property: all
three are code, never prompt. The model cannot argue past any of them.

1. Server-echo validation - every id the model puts in a tool argument must
   have come back from a tool result earlier in *this* session. The server
   re-checks the same thing (BUILD_GUIDE D.2); this layer exists so a
   fabricated id costs a local rejection instead of a round trip.
2. Distress detection - matched on the raw utterance before the LLM sees it.
3. Correction patching - slot diffing so a readback correction touches one
   field instead of restarting the booking.
"""

from __future__ import annotations

import re
import unicodedata
from enum import Enum
from typing import Any, Iterable

from pydantic import BaseModel, ConfigDict, Field


class RejectionCode(str, Enum):
    UNKNOWN_TOOL = "unknown_tool"
    BAD_ARGS = "bad_args"
    UNKNOWN_VENDOR_ID = "unknown_vendor_id"
    UNKNOWN_SLOT_ID = "unknown_slot_id"
    UNKNOWN_HOLD_ID = "unknown_hold_id"
    UNKNOWN_BOOKING_ID = "unknown_booking_id"
    UNKNOWN_MEMBER_ID = "unknown_member_id"
    STATE_BLOCKED = "state_blocked"
    UPSTREAM_ERROR = "upstream_error"


class ToolRejection(BaseModel):
    """Typed error handed back to the model as the tool result.

    Shaped so the model can recover on its own: `message` says what to do
    next, `retryable` says whether doing it again could ever work.
    """

    model_config = ConfigDict(frozen=True)

    code: RejectionCode
    message: str
    retryable: bool = True

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code.value, "message": self.message, "retryable": self.retryable}


# --------------------------------------------------------------------------
# Distress
# --------------------------------------------------------------------------

# The Bengali/Hinglish set required by BUILD_GUIDE D.3 plus the Hindi/English
# terms already used by the text assistant (server/assistant/plan.js
# URGENT_WORDS). Keep the two lists in sync when either grows.
DISTRESS_TERMS: tuple[str, ...] = (
    # required by D.3
    "dard",
    "ব্যথা",
    "emergency",
    "সাহায্য",
    "chest pain",
    "সীনে ব্যথা",
    # carried over from plan.js URGENT_WORDS
    "urgent",
    "breathing",
    "stroke",
    "unconscious",
    "bleeding",
    "ambulance",
    "seene mein dard",
    "saans",
    "behosh",
    "आपातकाल",
    "सीने में दर्द",
    "सांस",
    "बेहोश",
    "खून",
    "एम्बुलेंस",
    "অ্যাম্বুলেন্স",
    "শ্বাস",
    "রক্ত",
)


def _term_pattern(term: str) -> re.Pattern[str]:
    # ASCII terms get word boundaries so "standard" is not distress. Indic
    # scripts are matched as substrings: Bengali and Devanagari words carry
    # inflectional suffixes, so "ব্যথাটা" must still trip the wire.
    if term.isascii():
        return re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE)
    return re.compile(re.escape(term))


_DISTRESS_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (term, _term_pattern(term)) for term in DISTRESS_TERMS
)


def normalize(text: str) -> str:
    """NFC + collapse whitespace. Bengali conjuncts differ byte-wise between
    keyboards; without NFC an identical-looking word misses the match."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text or "")).strip()


def detect_distress(text: str) -> str | None:
    """Return the matched distress term, or None. Runs on every utterance in
    every state, before the LLM is called."""
    haystack = normalize(text).lower()
    for term, pattern in _DISTRESS_PATTERNS:
        if pattern.search(haystack):
            return term
    return None


# --------------------------------------------------------------------------
# Server-echo validation
# --------------------------------------------------------------------------


class SessionMemory:
    """Everything this session has actually seen come back from a tool.

    An id absent from here is, as far as the runtime is concerned, invented.
    """

    def __init__(self, family_members: Iterable[dict[str, Any]] | None = None) -> None:
        self.vendors: dict[str, dict[str, Any]] = {}
        self.slots: dict[str, dict[str, Any]] = {}
        self.holds: dict[str, dict[str, Any]] = {}
        self.bookings: dict[str, dict[str, Any]] = {}
        # Injected by the server from the elder's family circle. The model
        # never supplies arbitrary numbers - it only picks from this list.
        self.family_members: dict[str, dict[str, Any]] = {
            str(m["id"]): dict(m) for m in (family_members or [])
        }

    # -- recording -------------------------------------------------------
    def remember_vendors(self, vendors: Iterable[dict[str, Any]]) -> None:
        for vendor in vendors:
            self.vendors[str(vendor["id"])] = dict(vendor)

    def remember_slots(self, slots: Iterable[dict[str, Any]]) -> None:
        for slot in slots:
            self.slots[str(slot["id"])] = dict(slot)

    def remember_hold(self, hold: dict[str, Any]) -> None:
        self.holds[str(hold["hold_id"])] = dict(hold)

    def remember_booking(self, booking: dict[str, Any]) -> None:
        self.bookings[str(booking["booking_id"])] = dict(booking)

    def forget_hold(self, hold_id: str) -> None:
        self.holds.pop(str(hold_id), None)

    def live_hold_ids(self) -> list[str]:
        return [hid for hid, hold in self.holds.items() if hold.get("status") == "held"]

    # -- validation ------------------------------------------------------
    def validate(self, tool: str, args: dict[str, Any]) -> ToolRejection | None:
        """Return a rejection if any id in `args` was never handed to the model."""
        vendor_id = args.get("vendor_id")
        if vendor_id is not None and str(vendor_id) not in self.vendors:
            return ToolRejection(
                code=RejectionCode.UNKNOWN_VENDOR_ID,
                message=(
                    f"vendor_id {vendor_id!r} was not returned by search_vendors in this "
                    "conversation. Call search_vendors and use an id from its result."
                ),
            )

        slot_id = args.get("slot_id")
        if slot_id is not None and str(slot_id) not in self.slots:
            return ToolRejection(
                code=RejectionCode.UNKNOWN_SLOT_ID,
                message=(
                    f"slot_id {slot_id!r} was not returned by search_slots in this "
                    "conversation. Call search_slots and use an id from its result."
                ),
            )

        hold_id = args.get("hold_id")
        if hold_id is not None and str(hold_id) not in self.holds:
            return ToolRejection(
                code=RejectionCode.UNKNOWN_HOLD_ID,
                message=(
                    f"hold_id {hold_id!r} does not exist in this conversation. "
                    "Call hold_slot first and confirm only the hold it returned."
                ),
            )

        booking_id = args.get("booking_id")
        if booking_id is not None and str(booking_id) not in self.bookings:
            return ToolRejection(
                code=RejectionCode.UNKNOWN_BOOKING_ID,
                message=f"booking_id {booking_id!r} is not a booking made in this conversation.",
            )

        member_id = args.get("member_id")
        if member_id is not None and str(member_id) not in self.family_members:
            known = ", ".join(sorted(self.family_members)) or "none"
            return ToolRejection(
                code=RejectionCode.UNKNOWN_MEMBER_ID,
                message=(
                    f"member_id {member_id!r} is not in the elder's family circle "
                    f"(allowed: {known})."
                ),
                retryable=False,
            )

        return None


# --------------------------------------------------------------------------
# Correction patching
# --------------------------------------------------------------------------

# Fields the elder hears in the readback. Booking internals (vendor_id,
# slot_id, hold_id) are deliberately not here: swapping a slot id because the
# day changed is not something to read back to a 75-year-old.
READBACK_FIELDS: tuple[str, ...] = ("vendor", "date", "time", "price")


class SlotDiff(BaseModel):
    changed: dict[str, Any] = Field(default_factory=dict)
    previous: dict[str, Any] = Field(default_factory=dict)

    @property
    def fields(self) -> list[str]:
        return sorted(self.changed)

    def __bool__(self) -> bool:
        return bool(self.changed)


def diff_slots(current: dict[str, Any], patch: dict[str, Any]) -> SlotDiff:
    """Only genuinely different values count as a change. Re-sending the same
    date during a correction must not force it to be re-confirmed."""
    changed: dict[str, Any] = {}
    previous: dict[str, Any] = {}
    for key, value in patch.items():
        if current.get(key) != value:
            changed[key] = value
            previous[key] = current.get(key)
    return SlotDiff(changed=changed, previous=previous)


def apply_patch(current: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = dict(current)
    merged.update(patch)
    return merged
