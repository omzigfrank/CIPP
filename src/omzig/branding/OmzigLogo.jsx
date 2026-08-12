import PropTypes from "prop-types";
import { useTheme } from "@mui/material/styles";
import {
  omzigScale,
  omzigSurfaces,
  OMZIG_WORDMARK,
  OMZIG_WORDMARK_SUFFIX,
  OMZIG_WORDMARK_FULL,
  OMZIG_TAGLINE,
  OMZIG_TAGLINE_COLOR,
  OMZIG_FONT_DISPLAY,
} from "./palette";

/**
 * omzig.ai wordmark — brand sheet v1 (August 2026).
 *
 * Always lowercase, always Space Grotesk Bold, always with the ".ai" in
 * Electric. Rendered as live text rather than the supplied PNG so it stays
 * crisp at every size, recolors with the theme, and reads correctly to screen
 * readers. The brand sheet's don't-list is enforced here: no gradient, no
 * outline, no drop shadow, and no recolor of the mark beyond Ink / White /
 * Electric.
 *
 * Do not reintroduce the previous all-caps mark, nor a macron over the O
 * (U+014C). Both were withdrawn for trademark reasons.
 *
 * Clear space per the sheet is the height of the "o" on all sides; at the
 * wordmark's cap height that is ~0.52em, applied as padding by the caller's
 * layout. Below 100px wide, callers should use the circle icon instead
 * (public/omzig-icon.png).
 *
 * KNOWN AA/AAA CONFLICT — the tagline only.
 * The sheet fixes the tagline at Slate #8FA3BD on dark and #5A6B82 on light,
 * and says never to restyle it. Measured, those land:
 *     #8FA3BD  7.14:1 on base Ink (AAA) · 6.35:1 on ink-2 · 5.60:1 on ink-3
 *     #5A6B82  5.44:1 on white · 5.07:1 on paper-2 · 4.85:1 on paper-3
 * So the tagline is AA, not the AAA the build spec (§9) asks for everywhere
 * else. Rather than recolor a brand asset, `withTagline` is restricted to the
 * base canvas: pass it only where the lockup sits on Ink or White (the auth
 * and loading heroes), never on a raised card. Everything else in this file is
 * AAA. Resolving the light-mode ceiling needs a marketing decision, not a
 * code change.
 */
export const OmzigLogo = ({ withTagline = false, size = 28 }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  // "omzig" carries the layout: White on dark, Ink on light. The ".ai" is the
  // accent. On dark it steps to 400 (#5FC0FF, AAA on every panel) because exact
  // Electric only holds 6.11:1 on raised surfaces; on light it uses 800.
  const wordColor = dark ? omzigSurfaces.textHiDark : omzigSurfaces.ink;
  const suffixColor = dark ? omzigScale[400] : omzigScale[800];

  return (
    <span
      style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1 }}
      role="img"
      aria-label={OMZIG_WORDMARK_FULL}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: OMZIG_FONT_DISPLAY,
          fontWeight: 700,
          fontSize: size,
          letterSpacing: "-0.02em",
          color: wordColor,
          whiteSpace: "nowrap",
        }}
      >
        {OMZIG_WORDMARK}
        <span style={{ color: suffixColor }}>{OMZIG_WORDMARK_SUFFIX}</span>
      </span>
      {withTagline && (
        <span
          aria-hidden="true"
          style={{
            fontFamily: OMZIG_FONT_DISPLAY,
            fontWeight: 500,
            fontSize: Math.max(11, Math.round(size * 0.32)),
            letterSpacing: "0.01em",
            color: dark ? OMZIG_TAGLINE_COLOR.dark : OMZIG_TAGLINE_COLOR.light,
            marginTop: 3,
            whiteSpace: "nowrap",
          }}
        >
          {OMZIG_TAGLINE}
        </span>
      )}
    </span>
  );
};

OmzigLogo.propTypes = {
  withTagline: PropTypes.bool,
  size: PropTypes.number,
};
