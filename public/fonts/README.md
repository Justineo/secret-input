# Demo fonts

The demo self-hosts the Latin variable subset of Geist (weights 400–600) and a regular-weight Geist Mono subset for code (printable ASCII and U+2022) under the SIL Open Font License. The adjacent OFL files contain each font's copyright and license terms.

Sources:

- Geist: https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwcGFWNOITd.woff2
- Geist Mono: https://fonts.gstatic.com/l/font?kit=or3yQ6H-1_WfwkMZI_qYPLs1a-t7PU0AbeE9KJ5W7ihaOviSXrvcFtTVbU2xmOGkiCNNk8Rm64MfAqGNxutGFJUknyWbylBzQodN3oIhcpOuiIRPB-QIti6rL7jxtYLx22nbkvXArgi0eTV8h5tVOUVwh_lOTQqs8E9Sepz_m9kHNbCcY0qpoQ&skey=f2030a904b731103&v=v6
- Licenses: https://github.com/google/fonts/tree/main/ofl/geist and https://github.com/google/fonts/tree/main/ofl/geistmono

The site preloads the primary font and uses `font-display: optional` so a slow font request does not replace text after first paint. Characters outside these subsets use the system fallback stack.

The 5,980-byte code font was requested from the Google Fonts CSS API with `family=Geist Mono:wght@400` and a `text` set containing U+0020–007E and U+2022. It preserves the original typeface while omitting unused weights and glyphs. Code characters outside that set use the monospace fallback.
