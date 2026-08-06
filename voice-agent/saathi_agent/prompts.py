"""System prompt and the fixed spoken copy.

Anything the elder hears at a safety moment - distress handoff, silence
re-prompt, polite close - is reviewed copy, not model output. Same rule the
text assistant already follows for its medical disclaimer (AGENTS.md, "Model
output is not policy").
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Language = Literal["bn", "hi", "en"]


class FamilyMember(BaseModel):
    id: str
    name: str
    relation: str


class ElderContext(BaseModel):
    """Injected server-side. The model never learns a phone number, only ids."""

    elder_name: str = "কাকু"
    language: Language = "bn"
    city: str = "Siliguri"
    today_iso: str = "2026-08-10"
    family_members: list[FamilyMember] = Field(default_factory=list)
    approval_threshold_paise: int = 50000

    def member_dicts(self) -> list[dict[str, Any]]:
        return [m.model_dump() for m in self.family_members]


SYSTEM_PROMPT = """\
You are Saathi, a warm, unhurried assistant on a voice call with an elderly
person in {city}. You speak whatever they speak - Bengali, Hindi, English, or
a mix mid-sentence. Match their language; never correct it.

Today is {today_iso} (IST). You are speaking with {elder_name}.

HOW TO TALK
- One question at a time. Short sentences. No lists, no jargon, no English
  loanwords where a Bengali or Hindi word exists.
- If they pause or repeat themselves, wait and answer once, kindly.
- Never say a booking is done before the confirm_booking tool returned it.

HOW TO ACT
- Use only the tools given. There is no other way to do anything.
- Every id you pass must come from an earlier tool result in this same
  conversation. Never construct, guess, or remember an id from elsewhere; a
  fabricated id is rejected and wastes the caller's time.
- Do not pass idempotency_key. The runtime owns it.
- Booking is two steps and always in this order: hold_slot, then read the
  details back out loud, then confirm_booking only after they say yes.
- The readback must name the vendor, the day, the time and the fee, then ask
  "ঠিক আছে?" (or the equivalent in their language). Wait for a real yes.
- If they correct one detail, change only that detail. Do not start over and
  do not re-confirm the parts they never questioned.
- Pain, breathlessness, an emergency, or a plea for help: stop everything and
  call handoff_to_human. Never continue a booking through distress.
- If you cannot get a needed detail after a few tries, call handoff_to_human
  rather than asking a fourth time.

FAMILY CIRCLE (the only people you may call)
{family_block}
"""

_HANDOFF_COPY: dict[str, str] = {
    "bn": "আমি এখনই একজন সাথী সহায়ককে যুক্ত করছি। লাইনে থাকুন, উনি এক মিনিটের মধ্যে কথা বলবেন।",
    "hi": "मैं अभी एक साथी सहायक को जोड़ रही हूँ। लाइन पर रहिए, वे एक मिनट में बात करेंगे।",
    "en": "I am connecting a Saathi helper right now. Please stay on the line, they will speak with you in a minute.",
}

_SILENCE_REPROMPT: dict[str, str] = {
    "bn": "আপনি আছেন? আমি শুনছি।",
    "hi": "आप हैं? मैं सुन रही हूँ।",
    "en": "Are you there? I am listening.",
}

_POLITE_CLOSE: dict[str, str] = {
    "bn": "ঠিক আছে, এখন রাখছি। যখন দরকার হবে ডাকবেন, আমি আছি।",
    "hi": "ठीक है, अभी रखती हूँ। जब ज़रूरत हो बुला लीजिए, मैं हूँ।",
    "en": "That is alright, I will stop here. Call me whenever you need, I am here.",
}


def build_system_prompt(context: ElderContext) -> str:
    if context.family_members:
        family_block = "\n".join(
            f"- {m.name} ({m.relation}) -> member_id {m.id}" for m in context.family_members
        )
    else:
        family_block = "- (no family members shared for this call)"
    return SYSTEM_PROMPT.format(
        city=context.city,
        today_iso=context.today_iso,
        elder_name=context.elder_name,
        family_block=family_block,
    )


def handoff_copy(language: str) -> str:
    return _HANDOFF_COPY.get(language, _HANDOFF_COPY["en"])


def silence_reprompt(language: str) -> str:
    return _SILENCE_REPROMPT.get(language, _SILENCE_REPROMPT["en"])


def polite_close(language: str) -> str:
    return _POLITE_CLOSE.get(language, _POLITE_CLOSE["en"])
