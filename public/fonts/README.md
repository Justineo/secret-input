# Demo fonts

The demo self-hosts the Latin variable subsets of Geist and Geist Mono (weights 400–600) under the SIL Open Font License. The adjacent OFL files contain each font's copyright and license terms.

Sources:

- Geist: https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwcGFWNOITd.woff2
- Geist Mono: https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrcdmhHkjko.woff2
- Licenses: https://github.com/google/fonts/tree/main/ofl/geist and https://github.com/google/fonts/tree/main/ofl/geistmono

The site preloads the primary font and uses `font-display: optional` so a slow font request does not replace text after first paint. Characters outside these subsets use the system fallback stack.
