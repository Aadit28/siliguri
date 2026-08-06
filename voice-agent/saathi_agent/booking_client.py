"""Booking transport.

Two implementations of one protocol:

* `HttpBookingClient` - thin wrapper over the Part C endpoints on the Saathi
  API. The voice agent owns zero booking logic; capacity, holds, guardian
  approval and idempotency are all decided server-side.
* `MockBookingClient` - in-memory stand-in with the same semantics (atomic
  capacity, 5-minute holds, idempotent writes, guardian fork above a spend
  threshold) so the whole tool loop runs offline in tests and the REPL.

Sync on purpose. Week 1 is a text loop; the LiveKit worker in week 2 wraps
this in a thread executor rather than colouring the whole package async for
no gain today.
"""

from __future__ import annotations

import itertools
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol, runtime_checkable

IST = timezone(timedelta(hours=5, minutes=30))
HOLD_TTL_SECONDS = 300  # BUILD_GUIDE C.2: elders need time to say yes.


class BookingError(Exception):
    """Upstream refused. `code` is echoed to the model inside a rejection."""

    def __init__(self, code: str, message: str, *, retryable: bool = True) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


@runtime_checkable
class BookingClient(Protocol):
    def search_vendors(self, category: str, query: str | None = None) -> list[dict[str, Any]]: ...

    def search_slots(self, vendor_id: str, date_range: str) -> list[dict[str, Any]]: ...

    def hold_slot(self, slot_id: str, idempotency_key: str) -> dict[str, Any]: ...

    def confirm_booking(self, hold_id: str, idempotency_key: str) -> dict[str, Any]: ...

    def cancel_booking(self, booking_id: str) -> dict[str, Any]: ...

    def release_hold(self, hold_id: str) -> dict[str, Any]:
        """Runtime cleanup, not an LLM tool. Called when a correction replaces
        a hold or a call ends with one outstanding, so the slot goes back to
        capacity immediately instead of waiting out its TTL."""
        ...

    def create_reminder(self, what: str, time_local: str, repeat: str) -> dict[str, Any]: ...

    def call_family_member(self, member_id: str) -> dict[str, Any]: ...

    def handoff_to_human(self, reason: str) -> dict[str, Any]: ...


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------


def _split_ist(starts_at: str) -> tuple[str, str]:
    """`2026-08-13T16:00:00+05:30` -> ('2026-08-13', '16:00'), in IST.

    A guardian abroad must not shift the elder's day (AGENTS.md: everything is
    IST), so the conversion is explicit rather than local-timezone.
    """
    try:
        moment = datetime.fromisoformat(str(starts_at).replace("Z", "+00:00"))
    except ValueError:
        return str(starts_at), ""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=IST)
    local = moment.astimezone(IST)
    return local.date().isoformat(), local.strftime("%H:%M")


def _parse_range(date_range: str) -> tuple[str | None, str | None]:
    """'2026-08-11..2026-08-16' -> both ends. A vaguer phrase sends nothing and
    lets the server default to 'from now'."""
    tokens = [tok for tok in str(date_range or "").replace("..", " ").split() if tok.count("-") == 2]
    if not tokens:
        return None, None
    return min(tokens), max(tokens)


class HttpBookingClient:
    """Talks to the Saathi API dispatcher (`api/index.js`), Part C routes.

    Two shapes meet here. The wire is camelCase and slot-centric
    (`/api/bookings/search` returns slots with their vendor embedded); the
    agent works in snake_case with `hold_id` / `booking_id` / `price_paise`,
    the same keys MockBookingClient produces. Everything below is that
    translation - no booking logic, by design.
    """

    def __init__(
        self,
        base_url: str | None = None,
        *,
        auth_token: str | None = None,
        elder_id: str | None = None,
        timeout: float = 10.0,
        client: Any | None = None,
    ) -> None:
        import httpx

        self.base_url = (base_url or os.environ.get("SAATHI_API_BASE_URL", "")).rstrip("/")
        if not self.base_url and client is None:
            raise ValueError("SAATHI_API_BASE_URL is required for HttpBookingClient")
        self._token = auth_token or os.environ.get("SAATHI_API_TOKEN")
        self._elder_id = elder_id or os.environ.get("SAATHI_ELDER_ID")
        # The server never sends a vendor name on a hold or a booking, and the
        # readback has to say one, so names seen during search are kept.
        self._vendor_names: dict[str, str] = {}
        headers = {"content-type": "application/json"}
        if self._token:
            headers["authorization"] = f"Bearer {self._token}"
        self._http = client or httpx.Client(base_url=self.base_url, timeout=timeout, headers=headers)

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        import httpx

        try:
            response = self._http.post(path, json=payload)
        except httpx.HTTPError as exc:  # network-level: worth another attempt
            raise BookingError("network_error", f"{path} unreachable: {exc}") from exc
        if response.status_code >= 400:
            body: Any
            try:
                body = response.json()
            except ValueError:
                body = {"error": response.text[:200]}
            raise BookingError(
                str(body.get("code") or f"http_{response.status_code}"),
                str(body.get("error") or body),
                # 4xx other than 409/429 will not fix itself on retry.
                retryable=response.status_code in (409, 429) or response.status_code >= 500,
            )
        return response.json()

    # -- translation -----------------------------------------------------
    def _slot(self, row: dict[str, Any]) -> dict[str, Any]:
        date, time_ = _split_ist(row.get("startsAt", ""))
        vendor = row.get("vendor") or {}
        if vendor.get("id"):
            self._vendor_names[str(vendor["id"])] = vendor.get("name", "")
        return {
            "id": row["id"],
            "vendor_id": row.get("vendorId"),
            "vendor_name": vendor.get("name"),
            "date": date,
            "time": time_,
            "duration_min": row.get("durationMin"),
            "capacity": row.get("capacity"),
            "booked": row.get("booked"),
            # The slot payload carries no price; the amount is decided when
            # the hold is taken. Readback price comes from the hold.
            "price_paise": None,
        }

    def _booking_row(self, row: dict[str, Any]) -> dict[str, Any]:
        date, time_ = _split_ist(row.get("startsAt") or row.get("holdExpiresAt") or "")
        return {
            "hold_id": row["id"],
            "booking_id": row["id"],
            "slot_id": row.get("slotId"),
            "vendor_id": row.get("vendorId"),
            "vendor_name": self._vendor_names.get(str(row.get("vendorId")), ""),
            "date": date,
            "time": time_,
            "price_paise": row.get("amountPaise"),
            "status": row.get("status"),
            "expires_at": row.get("holdExpiresAt"),
            "idempotency_key": row.get("idempotencyKey"),
        }

    # -- protocol --------------------------------------------------------
    def search_vendors(self, category: str, query: str | None = None) -> list[dict[str, Any]]:
        """Vendors with real open slots. A vendor with nothing bookable is not
        worth offering, so the slot search doubles as the vendor search."""
        slots = self._post("/api/bookings/search", {"category": category}).get("slots", [])
        vendors: dict[str, dict[str, Any]] = {}
        for row in slots:
            vendor = row.get("vendor") or {}
            if not vendor.get("id") or vendor["id"] in vendors:
                continue
            self._vendor_names[str(vendor["id"])] = vendor.get("name", "")
            vendors[vendor["id"]] = {
                "id": vendor["id"],
                "name": vendor.get("name"),
                "category": vendor.get("category", category),
                "area": vendor.get("address"),
                "phone": vendor.get("phone"),
            }
        found = list(vendors.values())
        if query:
            needle = query.strip().lower()
            narrowed = [
                v for v in found
                if needle in str(v.get("name", "")).lower() or needle in str(v.get("area", "")).lower()
            ]
            found = narrowed or found
        return found

    def search_slots(self, vendor_id: str, date_range: str) -> list[dict[str, Any]]:
        date_from, date_to = _parse_range(date_range)
        payload: dict[str, Any] = {"vendorId": vendor_id}
        if date_from:
            payload["dateFrom"] = date_from
        if date_to:
            payload["dateTo"] = date_to
        return [self._slot(row) for row in self._post("/api/bookings/search", payload).get("slots", [])]

    def hold_slot(self, slot_id: str, idempotency_key: str) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "slotId": slot_id,
            "idempotencyKey": idempotency_key,
            "createdBy": "voice_agent",
        }
        if self._elder_id:
            payload["elderId"] = self._elder_id
        return self._booking_row(self._post("/api/bookings/hold", payload)["hold"])

    def confirm_booking(self, hold_id: str, idempotency_key: str) -> dict[str, Any]:
        payload = {"holdId": hold_id, "idempotencyKey": idempotency_key}
        return self._booking_row(self._post("/api/bookings/confirm", payload)["booking"])

    def cancel_booking(self, booking_id: str) -> dict[str, Any]:
        return self._booking_row(
            self._post("/api/bookings/cancel", {"bookingId": booking_id})["booking"]
        )

    def release_hold(self, hold_id: str) -> dict[str, Any]:
        """A hold is a booking row in status `held`, and `held` is cancellable,
        so giving one back is a cancel. The sweeper would also reclaim it, but
        only after the TTL - too slow when the elder is still on the call and
        has just changed the day."""
        return self.cancel_booking(hold_id)

    def create_reminder(self, what: str, time_local: str, repeat: str) -> dict[str, Any]:
        return self._post(
            "/api/family/reminders", {"what": what, "time_local": time_local, "repeat": repeat}
        )

    def call_family_member(self, member_id: str) -> dict[str, Any]:
        return self._post("/api/family/call", {"member_id": member_id})

    def handoff_to_human(self, reason: str) -> dict[str, Any]:
        return self._post("/api/voice/handoff", {"reason": reason})


# --------------------------------------------------------------------------
# Mock
# --------------------------------------------------------------------------

_SEED_VENDORS: list[dict[str, Any]] = [
    {
        "id": "vnd_dr_sharma",
        "name": "ডাঃ শর্মা",
        "name_en": "Dr. Sharma",
        "category": "doctor",
        "speciality": "general physician",
        "area": "Hakimpara",
        "city_id": "siliguri",
        "fee_paise": 30000,
    },
    {
        "id": "vnd_dr_banerjee",
        "name": "ডাঃ ব্যানার্জি",
        "name_en": "Dr. Banerjee",
        "category": "doctor",
        "speciality": "cardiologist",
        "area": "Sevoke Road",
        "city_id": "siliguri",
        "fee_paise": 60000,
    },
    {
        "id": "vnd_apollo_pharmacy",
        "name": "Apollo Pharmacy",
        "name_en": "Apollo Pharmacy",
        "category": "medical_shop",
        "area": "Hill Cart Road",
        "city_id": "siliguri",
        "fee_paise": 0,
    },
    {
        "id": "vnd_bidhan_grocer",
        "name": "Bidhan Market Grocer",
        "name_en": "Bidhan Market Grocer",
        "category": "grocery",
        "area": "Bidhan Market",
        "city_id": "siliguri",
        "fee_paise": 0,
    },
    {
        "id": "vnd_sujit_electrician",
        "name": "Sujit Electrician",
        "name_en": "Sujit Electrician",
        "category": "home_service",
        "speciality": "electrician",
        "area": "Ashrampara",
        "city_id": "siliguri",
        "fee_paise": 25000,
    },
    {
        "id": "vnd_nb_travels",
        "name": "North Bengal Travels",
        "name_en": "North Bengal Travels",
        "category": "travel_agent",
        "area": "Sevoke Road",
        "city_id": "siliguri",
        "fee_paise": 0,
    },
]

_SEED_SLOTS: list[dict[str, Any]] = [
    # Dr. Sharma: Tuesday and Thursday 16:00, plus a 17:00 Thursday.
    {"id": "slot_sharma_tue_1600", "vendor_id": "vnd_dr_sharma", "date": "2026-08-11",
     "time": "16:00", "day": "মঙ্গলবার", "duration_min": 15, "capacity": 1, "price_paise": 30000},
    {"id": "slot_sharma_thu_1600", "vendor_id": "vnd_dr_sharma", "date": "2026-08-13",
     "time": "16:00", "day": "বৃহস্পতিবার", "duration_min": 15, "capacity": 1, "price_paise": 30000},
    {"id": "slot_sharma_thu_1700", "vendor_id": "vnd_dr_sharma", "date": "2026-08-13",
     "time": "17:00", "day": "বৃহস্পতিবার", "duration_min": 15, "capacity": 1, "price_paise": 30000},
    {"id": "slot_banerjee_wed_1100", "vendor_id": "vnd_dr_banerjee", "date": "2026-08-12",
     "time": "11:00", "day": "বুধবার", "duration_min": 20, "capacity": 1, "price_paise": 60000},
    {"id": "slot_banerjee_fri_1100", "vendor_id": "vnd_dr_banerjee", "date": "2026-08-14",
     "time": "11:00", "day": "শুক্রবার", "duration_min": 20, "capacity": 1, "price_paise": 60000},
    {"id": "slot_sujit_tue_1000", "vendor_id": "vnd_sujit_electrician", "date": "2026-08-11",
     "time": "10:00", "day": "Tuesday", "duration_min": 60, "capacity": 2, "price_paise": 25000},
    {"id": "slot_sujit_wed_1000", "vendor_id": "vnd_sujit_electrician", "date": "2026-08-12",
     "time": "10:00", "day": "Wednesday", "duration_min": 60, "capacity": 2, "price_paise": 25000},
]


class MockBookingClient:
    """In-memory booking API with the semantics the real one must have.

    Deliberately faithful about the parts that break agents: capacity is
    checked atomically, the same idempotency key never produces a second
    write, and a hold that is neither confirmed nor released stays visible in
    `orphaned_holds()` so the eval suite can fail on it.
    """

    def __init__(
        self,
        *,
        approval_threshold_paise: int = 50000,
        now: datetime | None = None,
    ) -> None:
        self.vendors = {v["id"]: dict(v) for v in _SEED_VENDORS}
        self.slots = {s["id"]: dict(s, booked=0) for s in _SEED_SLOTS}
        self.holds: dict[str, dict[str, Any]] = {}
        self.bookings: dict[str, dict[str, Any]] = {}
        self.approval_threshold_paise = approval_threshold_paise
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._hold_seq = itertools.count(1)
        self._booking_seq = itertools.count(1)
        self._holds_by_key: dict[str, str] = {}
        self._bookings_by_key: dict[str, str] = {}
        self._now = now or datetime(2026, 8, 10, 11, 0, tzinfo=IST)

    # -- helpers ---------------------------------------------------------
    def _record(self, name: str, **kwargs: Any) -> None:
        self.calls.append((name, kwargs))

    def orphaned_holds(self) -> list[dict[str, Any]]:
        """Holds still occupying capacity. Must be empty when a suite ends."""
        return [h for h in self.holds.values() if h["status"] == "held"]

    # -- read ------------------------------------------------------------
    def search_vendors(self, category: str, query: str | None = None) -> list[dict[str, Any]]:
        self._record("search_vendors", category=category, query=query)
        found = [dict(v) for v in self.vendors.values() if v["category"] == category]
        if query:
            needle = query.strip().lower()
            narrowed = [
                v
                for v in found
                if needle in v["name"].lower()
                or needle in v["name_en"].lower()
                or needle in str(v.get("speciality", "")).lower()
                or needle in v["area"].lower()
            ]
            # An unmatched query is a bad query, not an empty city. Fall back
            # to the category list so the agent can disambiguate out loud.
            found = narrowed or found
        return found

    def search_slots(self, vendor_id: str, date_range: str) -> list[dict[str, Any]]:
        self._record("search_slots", vendor_id=vendor_id, date_range=date_range)
        if vendor_id not in self.vendors:
            raise BookingError("unknown_vendor", f"No vendor {vendor_id}", retryable=False)
        slots = [
            dict(s)
            for s in self.slots.values()
            if s["vendor_id"] == vendor_id and s["booked"] < s["capacity"]
        ]
        wanted = [tok for tok in str(date_range or "").replace("..", " ").split() if tok.count("-") == 2]
        if wanted:
            lo, hi = min(wanted), max(wanted)
            slots = [s for s in slots if lo <= s["date"] <= hi]
        return sorted(slots, key=lambda s: (s["date"], s["time"]))

    # -- write -----------------------------------------------------------
    def hold_slot(self, slot_id: str, idempotency_key: str) -> dict[str, Any]:
        self._record("hold_slot", slot_id=slot_id, idempotency_key=idempotency_key)
        existing = self._holds_by_key.get(idempotency_key)
        if existing:
            # Retry of the same booking attempt: same key, same hold, no
            # second unit of capacity consumed.
            return dict(self.holds[existing])

        slot = self.slots.get(slot_id)
        if slot is None:
            raise BookingError("unknown_slot", f"No slot {slot_id}", retryable=False)
        if slot["booked"] >= slot["capacity"]:
            raise BookingError("slot_taken", "That slot was just taken. Search again.")

        slot["booked"] += 1
        hold_id = f"hold_{next(self._hold_seq)}"
        vendor = self.vendors[slot["vendor_id"]]
        hold = {
            "hold_id": hold_id,
            "slot_id": slot_id,
            "vendor_id": slot["vendor_id"],
            "vendor_name": vendor["name"],
            "date": slot["date"],
            "time": slot["time"],
            "day": slot.get("day"),
            "price_paise": slot["price_paise"],
            "status": "held",
            "expires_at": (self._now + timedelta(seconds=HOLD_TTL_SECONDS)).isoformat(),
            "idempotency_key": idempotency_key,
        }
        self.holds[hold_id] = hold
        self._holds_by_key[idempotency_key] = hold_id
        return dict(hold)

    def confirm_booking(self, hold_id: str, idempotency_key: str) -> dict[str, Any]:
        self._record("confirm_booking", hold_id=hold_id, idempotency_key=idempotency_key)
        existing = self._bookings_by_key.get(idempotency_key)
        if existing:
            return dict(self.bookings[existing])

        hold = self.holds.get(hold_id)
        if hold is None:
            raise BookingError("unknown_hold", f"No hold {hold_id}", retryable=False)
        if hold["status"] == "released":
            raise BookingError("hold_expired", "That hold expired. Search slots again.")

        booking_id = f"bkg_{next(self._booking_seq)}"
        needs_guardian = hold["price_paise"] > self.approval_threshold_paise
        booking = {
            "booking_id": booking_id,
            "hold_id": hold_id,
            "slot_id": hold["slot_id"],
            "vendor_id": hold["vendor_id"],
            "vendor_name": hold["vendor_name"],
            "date": hold["date"],
            "time": hold["time"],
            "price_paise": hold["price_paise"],
            "status": "pending_guardian" if needs_guardian else "confirmed",
            "idempotency_key": idempotency_key,
            "created_by": "voice_agent",
        }
        hold["status"] = "confirmed"
        self.bookings[booking_id] = booking
        self._bookings_by_key[idempotency_key] = booking_id
        return dict(booking)

    def cancel_booking(self, booking_id: str) -> dict[str, Any]:
        self._record("cancel_booking", booking_id=booking_id)
        booking = self.bookings.get(booking_id)
        if booking is None:
            raise BookingError("unknown_booking", f"No booking {booking_id}", retryable=False)
        booking["status"] = "cancelled_user"
        slot = self.slots.get(booking["slot_id"])
        if slot and slot["booked"] > 0:
            slot["booked"] -= 1
        return dict(booking)

    def release_hold(self, hold_id: str) -> dict[str, Any]:
        self._record("release_hold", hold_id=hold_id)
        hold = self.holds.get(hold_id)
        if hold is None:
            raise BookingError("unknown_hold", f"No hold {hold_id}", retryable=False)
        if hold["status"] == "held":
            hold["status"] = "released"
            slot = self.slots.get(hold["slot_id"])
            if slot and slot["booked"] > 0:
                slot["booked"] -= 1
        return dict(hold)

    def create_reminder(self, what: str, time_local: str, repeat: str) -> dict[str, Any]:
        self._record("create_reminder", what=what, time_local=time_local, repeat=repeat)
        return {
            "reminder_id": f"rem_{len(self.calls)}",
            "what": what,
            "time_local": time_local,
            "repeat": repeat,
            "status": "scheduled",
        }

    def call_family_member(self, member_id: str) -> dict[str, Any]:
        self._record("call_family_member", member_id=member_id)
        return {"member_id": member_id, "status": "dialing"}

    def handoff_to_human(self, reason: str) -> dict[str, Any]:
        self._record("handoff_to_human", reason=reason)
        return {"status": "queued", "reason": reason, "eta_seconds": 60}
