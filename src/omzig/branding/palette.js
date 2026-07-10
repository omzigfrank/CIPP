/**
 * ŌMZIG brand palette — JS mirror of src/omzig/branding/tokens.css.
 * Extracted from omzig_logo_blue.png (dominant #3088C8).
 * Spec: Omzig Custom CIPP Build v1.1 §5.2.
 */

export const omzigScale = {
  50: '#EEF5FA',
  100: '#D5E7F4',
  200: '#ACCFE9',
  300: '#82B7DE',
  400: '#599FD3',
  500: '#3088C8', // brand
  600: '#2873AA',
  700: '#215F8C',
  800: '#1A4A6E',
  900: '#133650',
  950: '#0C2232',
}

export const omzigSurfaces = {
  ink: '#0B0F1A',
  surface: '#111827',
  paper: '#FFFFFF',
  textHiDark: '#F8FAFC',
  textHiLight: '#0B0F1A',
  textLoDark: '#94A3B8',
  textLoLight: '#334155',
}

export const omzigSemantic = {
  success: '#14B8A6',
  warn: '#F59E0B',
  danger: '#DC2626',
  info: omzigScale[500],
}

/**
 * MUI primary preset for the Omzig brand.
 * `main` is blue-600 (5.09:1 with white button text — AA normal); brand
 * blue-500 stays reserved for large text, borders, focus rings and fills on
 * dark surfaces per the §5.2 use rules. The AAA hardening pass (milestone 6)
 * audits every text-on-fill pairing against the 7:1 target.
 */
export const omzigMuiPreset = {
  lightest: omzigScale[50],
  light: omzigScale[400],
  main: omzigScale[600],
  dark: omzigScale[800],
  darkest: omzigScale[950],
  contrastText: '#FFFFFF',
}

export const OMZIG_WORDMARK = 'ŌMZIG' // Ō (U+014C) + MZIG — never render without the macron
export const OMZIG_TAGLINE = 'We are best practice.'
