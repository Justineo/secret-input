# Accessibility boundary

Use the [product behavior expectations](../behavior-expectations.md) to judge accessibility outcomes. Native password behavior is a reference, not a requirement to reproduce every assistive technology’s policy. These are target expectations, not a claim that every platform has been tested.

The public element is the native editing input, so labels, descriptions, errors, focus, and platform accessibility relationships need no shadow-boundary forwarding. Keep author-supplied ARIA on the input and do not introduce a wrapper role.

While `revealed` is `false`, assistive technology that inspects or rereads the current text value must not receive the complete plaintext secret, and screen-reader reading must not disclose it. This is a non-negotiable acceptance gate. This control is still `input[type="text"]`, not `input[type="password"]`; there is no ARIA mechanism that restores native secure-field semantics. Do not invent a password role or treat the missing role as permission to relax concealment.

Native password inputs receive dedicated platform mappings: protected text on MSAA/IAccessible2, `isPassword=true` on UI Automation, password text on ATK, and `AXSecureTextField` on Apple platforms. Windows clients are expected to suppress keyboard echo for protected controls, and NVDA explicitly masks real typed characters and suppresses word echo when the focused object has its protected state. Do not generalize this Windows policy to every assistive technology. TalkBack has allowed password speech according to product version, settings, and headphone state. Platform mappings establish a policy input, not a universal speech outcome; source inspection does not replace testing the chosen browser and assistive-technology combinations.

Setting `revealed` to `true` deliberately exposes the secret as the input's accessible text value. A UI that offers this state needs an explicit user-operated reveal control, a clear visible state, and an accessible name such as “Reveal secret” / “Hide secret”. Do not describe the masks-only guarantee as active while revealed.

Screen readers and mobile assistive technologies may announce newly entered characters, words, composition candidates, or input-method output according to product and user settings. Record this immediate input feedback separately from reading the stored value; identical native-password feedback is not required. Refocus or content-reading commands must not read the concealed secret, and editing feedback must not replay its stored value. Do not add secret text to announcements, hide the editor from the accessibility tree, or disable accessible editing to suppress speech.

The required regression scenario is: initialize or enter a secret, leave the field, refocus it through the screen reader, then request its current content. It must remain concealed while the field's name, hidden state, editing, and error information remain accessible. An ordinary text-field role is acceptable if these outcomes are verified. Password-specific commands need not be replicated; an explicit, accessible reveal/hide action may provide inspection instead.

Retaining the native input preserves its label, descriptions, errors, focus, selection, and text-field keyboard surface. It does not give the text input a secure accessibility role, secure typing echo, or password-specific context-menu presentation; Web content has no supported API for adding those semantics.

Manual coverage includes NVDA with Chrome, JAWS with Chrome or Edge, VoiceOver with Safari on macOS and iOS, and TalkBack with Chrome on Android. Test accessible value/text APIs and actual speech separately, including initial values, refocus, select-all, word/line reading, editing, composition, and return from reveal. Test labeling, errors, and basic operability too. Bullets in the DOM or a protected role alone do not establish a pass. Unverified combinations must remain unverified.

## VoiceOver observations reported on September 6, 2026

The maintainer tested both input text + CSS and textarea + CSS. VoiceOver announces
bullets in Chrome, Edge, and Firefox, but reads actual characters for both CSS
variants in Safari. The latest correction explicitly supersedes the earlier record
that described CSS content reading as concealed in all four browsers. Both Safari
CSS cells are Unsupported for “Hides actual value from assistive tech”. Native
password inputs produce typing sounds in the reported comparison. Secret Input's
reported content reading remains concealed. These are user-reported speech
observations; exact browser/OS versions and speech settings were not supplied.
Do not extend them to every reading command or other screen readers.

For Secret Input in Safari, the maintainer heard “bullet” for the first character and
“comma” for subsequent characters during typing. Current-content reading still did not
expose actual characters. The controller's mask is U+2022 BULLET throughout; its render
path repeats that character and does not substitute U+002C COMMA. The report identifies
an announcement discrepancy, not evidence that the secret itself contains commas.
The [notification investigation](../voiceover-typing-investigation.md) captured a
concrete browser difference: Safari sends whole-value Delete/Insert changes for
the controller, while Chrome sends a one-bullet Typing change. Safari sends actual
new characters for both CSS variants; Chrome sends bullets even though its CSS
controls' `AXValue` remains plaintext. These are native notification captures,
not speech transcripts. A September 7 follow-up captured VoiceOver output requests
of `•`, then `••`, then `•••` for the controller; native bullet typing kept requesting
one bullet. An independent AVSpeechSynthesizer reproduction using the active Samantha
voice produced audio identical to “bullet” for `•` and to “comma” for `••` and `•••`.
This supplies a concrete speech-synthesis explanation for the reported pattern;
it is not a recording of VoiceOver audio or a claim about every voice and OS.
No captured field value or output-request string contains a comma. Do not change
the submitted value, introduce secret-bearing announcements, or replace the mask
character without verifying a proposed fix.

Keep three observations distinct: the text returned by accessibility APIs, immediate
typing feedback, and speech when requesting already-stored content. Earlier agent-run
Chrome/Edge and Safari checks exposed plaintext through CSS-masked accessible values;
that remains an API finding. It does not establish that VoiceOver reads that plaintext.
The public comparison retains “Hides actual value from assistive tech” and uses a
`<small>` note to identify VoiceOver as the tested assistive technology. Safari's
CSS speech result is Unsupported. Neither that note nor the other Supported cells
establish acceptance across all accessibility interfaces or screen readers.
