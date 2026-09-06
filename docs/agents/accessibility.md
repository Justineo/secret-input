# Accessibility boundary

Use the [product behavior expectations](../behavior-expectations.md) to judge accessibility outcomes. Native password behavior is a reference, not a requirement to reproduce every assistive technology’s policy. These are target expectations, not a claim that every platform has been tested.

The public element is the native editing input, so labels, descriptions, errors, focus, and platform accessibility relationships need no shadow-boundary forwarding. Keep author-supplied ARIA on the input and do not introduce a wrapper role.

While `revealed` is `false`, assistive technology that inspects or rereads the current text value should encounter bullets, not the secret. This control is still `input[type="text"]`, not `input[type="password"]`; there is no ARIA mechanism that restores native secure-field semantics. Do not invent a password role.

Native password inputs receive dedicated platform mappings: protected text on MSAA/IAccessible2, `isPassword=true` on UI Automation, password text on ATK, and `AXSecureTextField` on Apple platforms. Windows clients are expected to suppress keyboard echo for protected controls, and NVDA explicitly masks real typed characters and suppresses word echo when the focused object has its protected state. Do not generalize this Windows policy to every assistive technology. TalkBack has allowed password speech according to product version, settings, and headphone state. Platform mappings establish a policy input, not a universal speech outcome; source inspection does not replace testing the chosen browser and assistive-technology combinations.

Setting `revealed` to `true` deliberately exposes the secret as the input's accessible text value. A UI that offers this state needs an explicit user-operated reveal control, a clear visible state, and an accessible name such as “Reveal secret” / “Hide secret”. Do not describe the masks-only guarantee as active while revealed.

Typing echo is outside the existing-value guarantee. Screen readers and mobile assistive technologies may announce characters, words, composition candidates, or input-method output according to product and user settings. A text input may not invoke the user’s password-specific settings. Do not add secret text to live regions or suppress ordinary accessibility interaction to imitate secure-field behavior. Different echo alone is not a failure of this component’s contract; broken basic editing or component-authored disclosure is.

Retaining the native input preserves its label, descriptions, errors, focus, selection, and text-field keyboard surface. It does not give the text input a secure accessibility role, secure typing echo, or password-specific context-menu presentation; Web content has no supported API for adding those semantics.

Manual coverage includes NVDA with Chrome, JAWS with Chrome or Edge, VoiceOver with Safari on macOS and iOS, and TalkBack with Chrome on Android. Test labeling, errors, existing-value rereading, and typing echo separately.
