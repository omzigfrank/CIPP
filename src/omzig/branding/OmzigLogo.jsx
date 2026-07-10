import PropTypes from "prop-types";
import { useTheme } from "@mui/material/styles";
import { omzigScale } from "./palette";

/**
 * ŌMZIG wordmark (spec §5.1): capital O with macron (U+014C) followed by MZIG,
 * rendered as live text in Inter 500 so the macron is guaranteed at every size.
 * Brand blue-500 in light mode; blue-300 on dark surfaces per the §5.2 use rules.
 */
export const OmzigLogo = ({ withTagline = false, size = 28 }) => {
  const theme = useTheme();
  const wordmarkColor = theme.palette.mode === "dark" ? omzigScale[300] : omzigScale[500];

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1 }}>
      <span
        aria-label="ŌMZIG"
        style={{
          fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          fontWeight: 500,
          fontSize: size,
          letterSpacing: "0.04em",
          color: wordmarkColor,
          whiteSpace: "nowrap",
        }}
      >
        {"ŌMZIG"}
      </span>
      {withTagline && (
        <span
          style={{
            fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            fontWeight: 400,
            fontSize: Math.max(10, Math.round(size * 0.32)),
            color: theme.palette.text.secondary,
            marginTop: 2,
          }}
        >
          We are best practice.
        </span>
      )}
    </span>
  );
};

OmzigLogo.propTypes = {
  withTagline: PropTypes.bool,
  size: PropTypes.number,
};
