const signatures = [
  ["1Password", "com-1password-button, com-1password-menu, [data-com-onepassword-filled]"],
  ["Bitwarden", "[data-bitwarden-watching], bw-inline-menu"],
  ["LastPass", "[data-lastpass-icon-root], [data-lastpass-root], [data-lastpass-infield]"],
  ["Dashlane", "[data-dashlane-rid], [data-dashlane-classification]"],
  ["Keeper", "[data-keeper-lock-id], [data-keeper-edited]"],
  ["Proton Pass", "[data-protonpass-form], [data-protonpass-role]"],
] as const;

export function findPasswordManager(root: ParentNode): string | undefined {
  return signatures.find(([, selector]) => root.querySelector(selector))?.[0];
}
