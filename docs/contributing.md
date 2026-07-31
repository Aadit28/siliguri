# Working on Saathi

Written for whoever picks this up next. It assumes you have the app running
(see the README) and covers the habits that keep this particular codebase from
breaking in ways its users cannot report.

## Who you are writing for

The parent using this app is around seventy, reads Hindi more comfortably than
English, and holds the phone at arm's length. They will not read an error
message twice, they will not know what a permission prompt was for, and if a
button does nothing they will assume they did it wrong.

Their child is three time zones away and cannot see the screen. When something
does not work, they cannot walk over and look.

That shapes several rules below. They are not style preferences.

## Never fail quietly

A swallowed error in this codebase can mean a missed dose of blood-pressure
medicine. If something did not work, the person must be told, in their language,
in words that name what to do next.

Concretely:

- A `catch` that returns a default needs a comment explaining why silence is
  correct there. If you cannot write that comment, surface the error instead.
- If a write fails, do not leave optimistic UI showing success. Revert it.
- If a reminder saves but its alert could not be scheduled, say so. `addEvent`
  returns `alertProblem` for exactly this.
- Do not delete local data because a fetch came back empty. An empty list from a
  failed request looks identical to a genuinely empty list. `mergeReminders`
  takes a `complete` flag for this reason.

## Both languages, always

Hindi is the default, not a translation afterthought. When you add user-facing
text:

Add the key to both `src/locales/en.json` and `src/locales/hi.json`. They are at
parity and should stay there. A `defaultValue` in code is a scaffold for an
unmerged branch, not a substitute for the Hindi string.

Write Hindi an elder can read. Plain words, no transliterated English where a
common Hindi word exists. Reuse vocabulary already in `hi.json` so the app
sounds like one voice.

Remember that server error strings are English. Route them through
`localizedServerError` rather than rendering them raw.

## Sizes and contrast are requirements

`TAP` in `src/lib/theme.ts` is 56, and it is a floor, not a suggestion. If a
control must look smaller, make the touch target 56 anyway. React Native Web
ignores `hitSlop` for hit testing, so padding the box is not enough on the web
build.

Body text uses `font.sm` (16) or larger. `font.xs` is for captions.

Colour pairs need to pass WCAG AA. Compute the ratio rather than eyeballing it.

## Time is Indian Standard Time

The parent is in Siliguri. The guardian might be anywhere. Every date the user
sees is IST. Use `todayISO()` from `src/lib/notifications.ts` instead of
`new Date()` when you need today, or a guardian in New Jersey will set a
reminder for the wrong day.

## Keep the demo path alive

Every function in `src/lib/family.ts` that calls the network needs a branch for
demo tokens. Miss one and the demo breaks in front of whoever you were showing
it to, with a 401 they cannot interpret. `src/lib/demoFamily.ts` holds the
fixtures.

## Server-side checks are the real checks

The client gate on `/admin` is convenience. Every admin route re-checks the
caller's role on the server, and every family route re-checks the link. Keep it
that way, and when you add a table holding citizen data, give it a `city_id` and
scope the query on the server.

Two specific traps:

Do not trust `x-forwarded-for[0]` for anything. A client sets it. Use
`requestIp()`.

Do not let model output become policy. The assistant's disclaimer is fixed
reviewed copy, and its suggested actions are filtered against the service ids
the client actually sent. Both are load-bearing.

## Before you open a pull request

There is no test suite yet, which makes the manual gate more important:

```bash
npx tsc --noEmit -p tsconfig.json
```

Then exercise what you touched in the browser, as the account that would hit it.
If you changed the guardian flow, sign in as `demo.guardian` and set a reminder.
If you touched the API, curl it and read the status code rather than assuming.

Claims in a pull request description should be things you watched happen. "Should
work" is not a verification.

## Commit messages

Explain the behaviour that changed and why it mattered, in prose, without
bullet-point shorthand. Someone reading the log in a year needs to understand
what was broken, not just which function moved.
