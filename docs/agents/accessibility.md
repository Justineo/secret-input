# Accessibility boundary

The public element is the native editing input, so labels, descriptions, errors, focus, and platform accessibility relationships need no shadow-boundary forwarding. Keep author-supplied ARIA on the input and do not introduce a wrapper role.

While `redacted` is `true`, assistive technology that inspects or rereads the current text value should encounter bullets, not the secret. This control is still `input[type="text"]`, not `input[type="password"]`; there is no ARIA mechanism that restores native secure-field semantics. Do not invent a password role.

Native password inputs receive dedicated platform mappings: protected text on MSAA/IAccessible2, `isPassword=true` on UI Automation, password text on ATK, and `AXSecureTextField` on Apple platforms. Windows clients are expected to suppress keyboard echo for protected controls, and NVDA explicitly suppresses echo when the focused object has its protected state. These contracts support NVDA and JAWS on Windows, VoiceOver on Apple platforms, and TalkBack through Android's password-node flag, but release testing must still verify each browser and assistive-technology combination.

Setting `redacted` to `false` deliberately exposes the secret as the input's accessible text value. A UI that offers this state needs an explicit user-operated reveal control, a clear visible state, and an accessible name such as “Reveal secret” / “Hide secret”. Do not describe the masks-only guarantee as active while revealed.

Typing echo is outside the existing-value guarantee. Screen readers and mobile assistive technologies may announce characters, words, composition candidates, or input-method output according to product and user settings.

Retaining the native input preserves its label, descriptions, errors, focus, selection, and text-field keyboard surface. It does not give the text input a secure accessibility role, secure typing echo, or password-specific context-menu presentation; Web content has no supported API for adding those semantics.

Manual coverage includes NVDA with Chrome, JAWS with Chrome or Edge, VoiceOver with Safari on macOS and iOS, and TalkBack with Chrome on Android. Test labeling, errors, existing-value rereading, and typing echo separately.
