import PropTypes from "prop-types";
import { useTheme } from "@mui/material/styles";
import {
  OMZIG_WORDMARK_FULL,
  OMZIG_TAGLINE,
  OMZIG_TAGLINE_COLOR,
  OMZIG_FONT_DISPLAY,
} from "./palette";

/**
 * omzig.ai wordmark — the supplied artwork from the brand asset pack.
 *
 * Two variants ship because the mark is drawn in a single flat colour: the
 * "for-dark" file is 94% #FFFFFF ink on a transparent ground, the "for-light"
 * file is 94% #0E1420. Using only one would make the logo invisible in the other
 * theme, so the src follows theme.palette.mode. Both carry the Electric ".ai".
 *
 * Sized by WIDTH, not height. The brand sheet sets a minimum wordmark width of
 * 100px on screen, and the source canvas is 1332x448 with the ink inset — so a
 * height that looks right in a 24px nav slot would render the mark at ~71px wide,
 * under the minimum. 112px wide puts the ink at 104px and the image box at 38px
 * tall. Below 100px the sheet says use the circle icon instead
 * (public/omzig-ai-icon-circle.png), not a smaller wordmark.
 *
 * A plain <img> rather than next/image: this app is a static export, where
 * next/image needs an explicit loader or unoptimized, and the wordmark is a fixed
 * 37KB asset with nothing to optimise.
 *
 * Do not recolour, outline, or add a shadow to the artwork, and do not reinstate
 * the retired all-caps mark or a macron over the O — both were withdrawn for
 * trademark reasons.
 */
export const OmzigLogo = ({ withTagline = false, width = 112 }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const src = dark
    ? "/omzig-ai-wordmark-for-dark.png"
    : "/omzig-ai-wordmark-for-light.png";

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1 }}>
      <img
        src={src}
        alt={OMZIG_WORDMARK_FULL}
        width={width}
        // height omitted deliberately: the intrinsic 1332x448 ratio sets it, so
        // the mark can never be stretched if the asset is ever re-cut.
        style={{ display: "block", width, height: "auto" }}
      />
      {withTagline && (
        // Tagline stays live text: the only supplied lockup with a tagline is the
        // dark variant, and text keeps it legible in both themes. Space Grotesk
        // Medium in Slate on dark / #5A6B82 on light, per the sheet. Note these
        // are the sheet's colours and they measure AA, not AAA — so only use
        // withTagline on the base Ink or White canvas, never on a raised card.
        <span
          style={{
            fontFamily: OMZIG_FONT_DISPLAY,
            fontWeight: 500,
            fontSize: Math.max(11, Math.round(width * 0.115)),
            letterSpacing: "0.01em",
            color: dark ? OMZIG_TAGLINE_COLOR.dark : OMZIG_TAGLINE_COLOR.light,
            marginTop: 4,
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
  /** Rendered width in px. Keep at or above 100 — the brand sheet's minimum. */
  width: PropTypes.number,
};
