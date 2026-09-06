# VoiceOver typing feedback investigation

Investigated on September 6, 2026. The maintainer reported that Safari speaks actual
newly typed characters in both CSS-masked input and textarea controls, while Chrome,
Edge, and Firefox speak bullets. Secret Input in Safari reportedly speaks “bullet”
first and “comma” subsequently. The maintainer subsequently corrected the
CSS speech record: Safari reads actual characters for both CSS variants. The earlier
all-browser claim of concealed CSS content reading was incorrect. Secret Input's
reported content reading remains concealed.

This investigation captures native macOS accessibility notifications. It does not
substitute those notifications for an observed VoiceOver utterance.

## Results from Safari

Environment: macOS 26.4.1, Safari 26.4. A local fixture received three separate native
keyboard events, `a`, `b`, and `c`, approximately 1.2 seconds apart. A second fixture
received three U+2022 BULLET characters through native keyboard events. An
`AXObserverCreateWithInfoCallback` observer captured `AXValueChanged` notifications
on the test field and web area. Duplicate notifications on these two objects are
represented once below. Notifications without a change dictionary are omitted.

| Control / update                      | First character | Second character        | Third character           |
| ------------------------------------- | --------------- | ----------------------- | ------------------------- |
| Native text input                     | Typing `a`      | Typing `b`              | Typing `c`                |
| Native text input receiving bullets   | Typing `•`      | Typing `•`              | Typing `•`                |
| Input + CSS text security             | Typing `a`      | Typing `b`              | Typing `c`                |
| Textarea + CSS text security          | Typing `a`      | Typing `b`              | Typing `c`                |
| Native password input                 | Typing `•`      | Typing `•`              | Typing `•`                |
| Current Secret Input controller       | Insert `•`      | Delete `•`, Insert `••` | Delete `••`, Insert `•••` |
| Minimal `input.value` replacement     | Insert `•`      | Delete `•`, Insert `••` | Delete `••`, Insert `•••` |
| Append one bullet with `setRangeText` | Insert `•`      | Delete `•`, Insert `••` | Delete `••`, Insert `•••` |

The raw dictionary uses `AXTextEditType` values 1 = Delete, 2 = Insert, and 3 =
Typing, with the strings above in `AXTextChangeValue`. All three keystrokes
completed in each fixture. Additional minimal variants without an explicit
`setSelectionRange()` call, and with a synthetic input event whose `data` was a
bullet, produced the same replacement dictionaries.

## What explains the differences

### CSS masking and newly typed characters

Safari sends actual newly typed text through its editing-notification path for
these CSS controls. This is a concrete input to VoiceOver's typing feedback and
explains why concealing later content reading does not imply concealed typing
feedback. The native password fixture instead sends masked text.

The WebKit source matches this distinction:

- `AccessibilityNodeObject::isSecureField()` delegates to `HTMLInputElement`;
  its secure-field predicate checks password type or an autofilled-and-obscured
  state. CSS `text-security` alone is not this predicate, and a textarea does not
  pass the input-element check.
- `AXObjectCache::enqueuePasswordNotification()` applies `secureContext()` to
  secure controls, replacing the notification's inserted/deleted text with mask
  characters. Other controls bypass that transformation.

Sources: [secure-field input predicate](https://github.com/WebKit/WebKit/blob/6270255c36bd2919ef0eea13368231f488df509b/Source/WebCore/html/HTMLInputElement.h#L149),
[accessibility predicate](https://github.com/WebKit/WebKit/blob/6270255c36bd2919ef0eea13368231f488df509b/Source/WebCore/accessibility/AccessibilityNodeObject.cpp#L1159),
[notification masking](https://github.com/WebKit/WebKit/blob/6270255c36bd2919ef0eea13368231f488df509b/Source/WebCore/accessibility/AXObjectCache.cpp#L3457).

These are source references from a pinned WebKit revision, not a claim that the
installed Safari binary was built from that revision. The runtime capture above
independently establishes the tested Safari behavior.

### Secret Input's first and subsequent edits

The controller writes a complete bullet string to `input.value`. In WebKit,
`setInnerTextValue()` records the previous text for a deferred replacement
notification. The macOS notification builder sends Delete for the old string and
Insert for the new string; it skips an empty string. Consequently the first edit
has only Insert, while subsequent edits have both Delete and Insert. Unlike native
typing, these notifications identify the replacement at the beginning of the
control rather than a one-character insertion at the caret.

Sources: [value replacement](https://github.com/WebKit/WebKit/blob/6270255c36bd2919ef0eea13368231f488df509b/Source/WebCore/html/HTMLTextFormControlElement.cpp#L720),
[macOS replacement dictionary](https://github.com/WebKit/WebKit/blob/6270255c36bd2919ef0eea13368231f488df509b/Source/WebCore/accessibility/mac/AXObjectCacheMac.mm#L692).

The minimal replacement fixture has no controller history, initialization primer,
or synthetic input event, yet produces the same notification pattern. Those
features are therefore unnecessary for this notification difference. This does
not establish that none of them could affect actual speech.

Changing to `setRangeText()` does not avoid the replacement path: WebKit builds
the complete resulting text and calls `setValue()` internally. The append-only
runtime fixture confirms that the public method still produces whole-value
replacement notifications. [Implementation](https://github.com/WebKit/WebKit/blob/6270255c36bd2919ef0eea13368231f488df509b/Source/WebCore/html/HTMLTextFormControlElement.cpp#L299).

### Chromium's notification strategy

The same observer and keyboard procedure was also run in Chrome 152.0.7977.77
on the same Mac. Both CSS-masked input and textarea sent Typing `•` for each
of the three keystrokes. Secret Input also sent Typing `•` on every keystroke.
For both CSS controls, the separately queried `AXValue` was still `abc` after
typing. This directly demonstrates that the field's accessible value and the
text carried by typing notifications can differ; inspecting `AXValue` alone
cannot predict the typing echo. Edge and Firefox notification payloads were not
captured in this investigation.

Chromium's macOS accessibility implementation computes the changed substring by
removing the common prefix and suffix from old and new accessible text. Its
notification builder labels a one-character insertion as Typing. Therefore an
accessible-text change from `•` to `••` can be reported as Typing `•` instead of
Delete `•` plus Insert `••`.

Sources: [computeTextEdit](https://github.com/chromium/chromium/blob/main/ui/accessibility/platform/browser_accessibility_cocoa.mm#L1281),
[notification builder](https://github.com/chromium/chromium/blob/main/ui/accessibility/platform/browser_accessibility_manager_mac.mm#L676).

## September 7 follow-up: reproducing the spoken word

The follow-up enabled VoiceOver AppleScript access with the maintainer's authorization
and captured `content of last phrase` plus VoiceOver's exported OutputRequest logs.
The active voice was Samantha, English (United States). Text verbosity was Some
punctuation, First 3 Times for repeated punctuation, and Characters and Words for
typing feedback. These speech settings were observed, not changed.

The actual VoiceOver output requests establish what reaches its speech path:

| Input method                                   | Request after first key | After second key | After third key |
| ---------------------------------------------- | ----------------------- | ---------------- | --------------- |
| Native input receiving bullets                 | `•`                     | `•`              | `•`             |
| Minimal script assigning the full bullet value | `•`                     | `••`             | `•••`           |
| Current Secret Input controller                | `•`                     | `••`             | `•••`           |

The last-phrase text does not expand symbols into their spoken names. Therefore
these records alone still cannot show the word “comma”. The exported logs also
contain the bullet strings, with no literal comma substitution in the field or
output-request text.

A separate reproduction using the public `AVSpeechSynthesizer` API and voice
`com.apple.voice.compact.en-US.Samantha` isolates the speech-synthesis behavior.
Each sample used a fresh process, an `AVSpeechUtterance` with the literal input
string, rate 0.5, and `write(_:toBufferCallback:)` to save the generated audio.
No browser, controller, accessibility notification, or VoiceOver was involved in
this reproduction.

| Text supplied to AVSpeechSynthesizer | Generated audio matches |
| ------------------------------------ | ----------------------- |
| `•`                                  | `bullet`                |
| `••`                                 | `comma`                 |
| `•••`                                | `comma`                 |
| `••••`                               | `comma`                 |
| `• •`                                | `comma`                 |

“Matches” means identical decoded audio samples, not an inferred pronunciation or
a speech-recognition result. After conversion to mono 16 kHz signed 16-bit PCM:

- `•` and `bullet` both have SHA-256
  `3238c52f7eed5d0a17386baba4ad503a1119f799a1a7245915cfe232c4d90d3c`.
- `••`, `•••`, `••••`, `• •`, and `comma` all have SHA-256
  `2e3189f71a8bdbdb30fd787148390db771fcfe2a58d65be6d29fd9353d5870b4`.
- Literal `bullet bullet`, `x`, and `xx` produced different audio, serving as
  controls against an unchanged output file or a synthesizer returning one constant.

This provides a concrete explanation for the reported first/subsequent difference:
Safari's whole-value notifications result in VoiceOver requests containing an
increasing bullet string. One bullet synthesizes as “bullet”; multiple bullets
reproduce “comma” in the system's Samantha speech synthesis. Native incremental
bullet input keeps requesting one bullet each time and avoids that multi-bullet
input. The earlier Chrome notification capture likewise supplies one bullet per
keystroke.

The connection from the captured VoiceOver request strings to the standalone
synthesizer result is an inference supported by the matching voice and exact reported
pronunciation pattern. This is not a recording of VoiceOver's audio output, nor
inspection of its private synthesis implementation. The reproducible system speech
behavior is established; the internal rule that maps multiple bullets to “comma”
is not public. Do not generalize the result to every voice or OS version. The older
`say`/NSSpeechSynthesizer route differed at two bullets, so it is not interchangeable
with this AVSpeechSynthesizer reproduction.

A minimal audible reproduction, independent of the website:

```swift
import AVFoundation
import Foundation

let synthesizer = AVSpeechSynthesizer()
let utterance = AVSpeechUtterance(string: "••")
utterance.voice = AVSpeechSynthesisVoice(
    identifier: "com.apple.voice.compact.en-US.Samantha"
)
utterance.rate = 0.5
synthesizer.speak(utterance)
RunLoop.current.run(until: Date().addingTimeInterval(3))
```

Apple documents [creating a speech utterance and selecting its voice](https://developer.apple.com/documentation/avfoundation/speech-synthesis)
and [VoiceOver's last-phrase export commands](https://support.apple.com/en-ca/guide/voiceover/vo2725/mac).
Those references describe the APIs; the bullet-to-comma result is the local experiment,
not an Apple-documented behavior guarantee.

No production controller behavior was changed. `setRangeText()` remains an unhelpful
substitution for this problem because it produces the same whole-value notification
path in the tested Safari. A reliable application workaround would need independent
speech and editing verification; changing the mask or adding announcements is not
a verified fix.

The fixtures, observer, request captures, Swift audio generator, generated samples,
and PCM comparison are local diagnostic artifacts under
`.vitest-attachments/voiceover-cause/`. The relevant files include `av-tts.swift`,
`speech-script-*.jsonl`, and `tts/av-audio-comparison.json`.
