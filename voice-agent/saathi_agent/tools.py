"""The whole tool surface: eight typed tools and the dispatcher that runs them.

Narrow by design (BUILD_GUIDE D.2). There is no `call_api`, no free-text
query, no escape hatch - the blast radius of a prompt injection is exactly
these eight verbs against ids the server already handed us.
"""

from __future__ import annotations

import json
import uuid
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .booking_client import BookingClient, BookingError
from .guards import RejectionCode, SessionMemory, ToolRejection

VendorCategory = Literal["doctor", "medical_shop", "grocery", "home_service", "travel_agent"]
RepeatKind = Literal["once", "daily", "weekly"]


class ToolName(StrEnum):
    SEARCH_VENDORS = "search_vendors"
    SEARCH_SLOTS = "search_slots"
    HOLD_SLOT = "hold_slot"
    CONFIRM_BOOKING = "confirm_booking"
    CANCEL_BOOKING = "cancel_booking"
    CREATE_REMINDER = "create_reminder"
    CALL_FAMILY_MEMBER = "call_family_member"
    HANDOFF_TO_HUMAN = "handoff_to_human"


#: Tools that change something. The state machine is consulted before any of
#: these are dispatched; the read-only two run freely.
MUTATING_TOOLS: frozenset[str] = frozenset(
    {
        ToolName.HOLD_SLOT,
        ToolName.CONFIRM_BOOKING,
        ToolName.CANCEL_BOOKING,
        ToolName.CREATE_REMINDER,
        ToolName.CALL_FAMILY_MEMBER,
        ToolName.HANDOFF_TO_HUMAN,
    }
)

#: Never exposed to the model and stripped from whatever it sends anyway.
RUNTIME_OWNED_FIELDS: frozenset[str] = frozenset({"idempotency_key"})


# --------------------------------------------------------------------------
# Argument models
# --------------------------------------------------------------------------


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SearchVendorsArgs(_Args):
    """Verified vendors in the elder's city. Returns real ids only."""

    category: VendorCategory = Field(description="Kind of vendor to look for.")
    query: str | None = Field(default=None, description="Optional name, speciality or area.")


class SearchSlotsArgs(_Args):
    """Open appointment slots for one vendor."""

    vendor_id: str = Field(description="An id from a search_vendors result. Never invent one.")
    date_range: str = Field(
        description="ISO range like '2026-08-11..2026-08-16', or a phrase like 'this week'."
    )


class HoldSlotArgs(_Args):
    """Reserve for 5 minutes without committing. Auto-expires."""

    slot_id: str = Field(description="An id from a search_slots result. Never invent one.")
    idempotency_key: str | None = Field(
        default=None,
        description="Runtime-owned. Do not supply; any value sent here is discarded.",
    )


class ConfirmBookingArgs(_Args):
    """IRREVERSIBLE. Only after the elder said yes to the readback."""

    hold_id: str = Field(description="The hold_id returned by hold_slot.")
    idempotency_key: str | None = Field(
        default=None,
        description="Runtime-owned. Do not supply; any value sent here is discarded.",
    )


class CancelBookingArgs(_Args):
    booking_id: str = Field(description="A booking_id from a confirm_booking result.")


class CreateReminderArgs(_Args):
    """Validated by the same domain-care parser the app uses."""

    what: str = Field(description="What to remind about, in the elder's own words.")
    time_local: str = Field(description="Local IST time, e.g. '08:00' or '2026-08-12 20:30'.")
    repeat: RepeatKind = Field(default="once")


class CallFamilyMemberArgs(_Args):
    """Only members of the elder's family circle; the server injects the list."""

    member_id: str = Field(description="An id from the injected family circle.")


class HandoffToHumanArgs(_Args):
    """Hand the call to a Saathi helper. Never continue a booking after this."""

    reason: str = Field(description="Short reason, e.g. 'distress:chest pain' or 'slot_fill_failed'.")


ARG_MODELS: dict[str, type[_Args]] = {
    ToolName.SEARCH_VENDORS: SearchVendorsArgs,
    ToolName.SEARCH_SLOTS: SearchSlotsArgs,
    ToolName.HOLD_SLOT: HoldSlotArgs,
    ToolName.CONFIRM_BOOKING: ConfirmBookingArgs,
    ToolName.CANCEL_BOOKING: CancelBookingArgs,
    ToolName.CREATE_REMINDER: CreateReminderArgs,
    ToolName.CALL_FAMILY_MEMBER: CallFamilyMemberArgs,
    ToolName.HANDOFF_TO_HUMAN: HandoffToHumanArgs,
}


def _function_schema(name: str, model: type[_Args]) -> dict[str, Any]:
    schema = model.model_json_schema()
    properties = {
        key: {k: v for k, v in prop.items() if k != "title"}
        for key, prop in schema.get("properties", {}).items()
        if key not in RUNTIME_OWNED_FIELDS
    }
    required = [r for r in schema.get("required", []) if r not in RUNTIME_OWNED_FIELDS]
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": (model.__doc__ or "").strip(),
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
                "additionalProperties": False,
            },
        },
    }


def openai_tool_schemas() -> list[dict[str, Any]]:
    """OpenAI-compatible function schemas, minus the runtime-owned fields.

    The model is not shown `idempotency_key` at all - the cheapest way to stop
    it inventing one is to never mention the parameter exists.
    """
    return [_function_schema(str(name), model) for name, model in ARG_MODELS.items()]


# --------------------------------------------------------------------------
# Idempotency
# --------------------------------------------------------------------------


class IdempotencyStore:
    """One uuid4 per booking attempt, reused for every write in that attempt.

    A booking attempt is identified by the slot being held *for this attempt*.
    The confirm that follows inherits the hold's key, so a retried hold *and* a
    retried confirm both collapse onto the same server-side row (BUILD_GUIDE
    C.2).

    The attempt is the unit, not the slot: once its hold is released, expired
    or cancelled, `drop_slot` retires the key so the next hold of the same slot
    is a new attempt and mints a new one. Without that, the idempotency
    contract (same key, same row) hands back the dead hold forever and the slot
    is unbookable for the rest of the call.
    """

    def __init__(self) -> None:
        self._by_slot: dict[str, str] = {}
        self._by_hold: dict[str, str] = {}
        self.issued: list[str] = []

    def for_slot(self, slot_id: str) -> str:
        key = self._by_slot.get(slot_id)
        if key is None:
            key = str(uuid.uuid4())
            self._by_slot[slot_id] = key
            self.issued.append(key)
        return key

    def drop_slot(self, slot_id: str) -> str | None:
        """Retire this slot's key. The next `for_slot` starts a fresh attempt."""
        return self._by_slot.pop(str(slot_id), None)

    def drop_hold(self, hold_id: str) -> str | None:
        return self._by_hold.pop(str(hold_id), None)

    def bind_hold(self, hold_id: str, key: str) -> None:
        self._by_hold[hold_id] = key

    def for_hold(self, hold_id: str) -> str:
        key = self._by_hold.get(hold_id)
        if key is None:
            # Should not happen (the guard rejects unknown hold ids first) but
            # a fresh key is still safer than reusing an unrelated one.
            key = str(uuid.uuid4())
            self._by_hold[hold_id] = key
            self.issued.append(key)
        return key


# --------------------------------------------------------------------------
# Dispatch
# --------------------------------------------------------------------------


def redact_runtime_fields(value: Any) -> Any:
    """Strip runtime-owned fields out of anything heading for the model.

    Stripping them from the *arguments* only covers half the door: the booking
    API echoes the idempotency key back on every hold and booking row, and a
    key sitting in model context can be read aloud over TTS, land in the
    transcript, or be lifted by an injection riding in a vendor name.
    """
    if isinstance(value, dict):
        return {k: redact_runtime_fields(v) for k, v in value.items() if k not in RUNTIME_OWNED_FIELDS}
    if isinstance(value, list):
        return [redact_runtime_fields(item) for item in value]
    return value


class ToolOutcome(BaseModel):
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)
    ok: bool
    data: Any = None
    rejection: ToolRejection | None = None
    idempotency_key: str | None = None
    model_supplied_key: bool = False

    def tool_content(self) -> str:
        """Exactly what the model sees as the tool result."""
        if self.ok:
            return json.dumps(
                {"ok": True, "data": redact_runtime_fields(self.data)}, ensure_ascii=False
            )
        assert self.rejection is not None
        return json.dumps({"ok": False, "error": self.rejection.as_dict()}, ensure_ascii=False)


class ToolDispatcher:
    """Parse -> guard -> key -> call -> remember. No state logic here; the
    caller (agent) runs the state gate before handing anything over."""

    def __init__(self, client: BookingClient, memory: SessionMemory) -> None:
        self.client = client
        self.memory = memory
        self.idempotency = IdempotencyStore()

    def dispatch(self, name: str, raw_args: dict[str, Any] | None) -> ToolOutcome:
        model = ARG_MODELS.get(name)
        if model is None:
            return ToolOutcome(
                tool=name,
                args=dict(raw_args or {}),
                ok=False,
                rejection=ToolRejection(
                    code=RejectionCode.UNKNOWN_TOOL,
                    message=f"{name!r} is not a tool. Available: {', '.join(ARG_MODELS)}.",
                    retryable=False,
                ),
            )

        supplied = dict(raw_args or {})
        model_supplied_key = any(field in supplied for field in RUNTIME_OWNED_FIELDS)
        for field in RUNTIME_OWNED_FIELDS:
            supplied.pop(field, None)

        try:
            args = model(**supplied)
        except ValidationError as exc:
            return ToolOutcome(
                tool=name,
                args=supplied,
                ok=False,
                model_supplied_key=model_supplied_key,
                rejection=ToolRejection(
                    code=RejectionCode.BAD_ARGS,
                    message=f"Invalid arguments for {name}: {exc.errors(include_url=False)}",
                ),
            )

        # Runtime-owned fields never appear in the recorded args; the key the
        # runtime actually used is carried on the outcome instead.
        args_dict = {
            k: v for k, v in args.model_dump(exclude_none=False).items()
            if k not in RUNTIME_OWNED_FIELDS
        }
        rejection = self.memory.validate(name, args_dict)
        if rejection is not None:
            return ToolOutcome(
                tool=name,
                args=args_dict,
                ok=False,
                rejection=rejection,
                model_supplied_key=model_supplied_key,
            )

        key: str | None = None
        if name == ToolName.HOLD_SLOT:
            key = self.idempotency.for_slot(args_dict["slot_id"])
        elif name == ToolName.CONFIRM_BOOKING:
            key = self.idempotency.for_hold(args_dict["hold_id"])

        try:
            data = self._invoke(name, args_dict, key)
        except BookingError as exc:
            if name == ToolName.CONFIRM_BOOKING and exc.code == "hold_expired":
                # Server-side TTL, no client release: retire the attempt so a
                # re-hold of the same slot is not answered with the dead one.
                self._retire_attempt(args_dict["hold_id"])
            return ToolOutcome(
                tool=name,
                args=args_dict,
                ok=False,
                idempotency_key=key,
                model_supplied_key=model_supplied_key,
                rejection=ToolRejection(
                    code=RejectionCode.UPSTREAM_ERROR,
                    message=f"{exc.code}: {exc.message}",
                    retryable=exc.retryable,
                ),
            )

        self._remember(name, data)
        if name == ToolName.HOLD_SLOT and key:
            self.idempotency.bind_hold(str(data["hold_id"]), key)

        return ToolOutcome(
            tool=name,
            args=args_dict,
            ok=True,
            data=data,
            idempotency_key=key,
            model_supplied_key=model_supplied_key,
        )

    def _retire_attempt(self, hold_id: str) -> None:
        """This hold is dead: its slot's key must not be reused for the next try."""
        hold = self.memory.holds.get(str(hold_id)) or {}
        if hold.get("slot_id"):
            self.idempotency.drop_slot(str(hold["slot_id"]))
        self.idempotency.drop_hold(str(hold_id))

    def _invoke(self, name: str, args: dict[str, Any], key: str | None) -> Any:
        if name == ToolName.SEARCH_VENDORS:
            return self.client.search_vendors(args["category"], args.get("query"))
        if name == ToolName.SEARCH_SLOTS:
            return self.client.search_slots(args["vendor_id"], args["date_range"])
        if name == ToolName.HOLD_SLOT:
            return self.client.hold_slot(args["slot_id"], str(key))
        if name == ToolName.CONFIRM_BOOKING:
            return self.client.confirm_booking(args["hold_id"], str(key))
        if name == ToolName.CANCEL_BOOKING:
            return self.client.cancel_booking(args["booking_id"])
        if name == ToolName.CREATE_REMINDER:
            return self.client.create_reminder(args["what"], args["time_local"], args["repeat"])
        if name == ToolName.CALL_FAMILY_MEMBER:
            return self.client.call_family_member(args["member_id"])
        if name == ToolName.HANDOFF_TO_HUMAN:
            return self.client.handoff_to_human(args["reason"])
        raise AssertionError(f"unreachable tool {name}")

    def _remember(self, name: str, data: Any) -> None:
        if name == ToolName.SEARCH_VENDORS:
            self.memory.remember_vendors(data)
        elif name == ToolName.SEARCH_SLOTS:
            self.memory.remember_slots(data)
        elif name == ToolName.HOLD_SLOT:
            self.memory.remember_hold(data)
        elif name == ToolName.CONFIRM_BOOKING:
            self.memory.remember_booking(data)
            hold_id = str(data.get("hold_id", ""))
            if hold_id in self.memory.holds:
                self.memory.holds[hold_id]["status"] = "confirmed"
