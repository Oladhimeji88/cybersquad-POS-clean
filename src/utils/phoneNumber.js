const NIGERIA_COUNTRY_CODE = '234';

const digitsOnly = (value = '') => String(value).replace(/\D/g, '');

export const normalizeNigerianPhone = (value = '') => {
  let digits = digitsOnly(value);
  if (!digits) return null;

  // Local form with leading 0 must be exactly 11 digits (e.g. 08151106893).
  if (digits.startsWith('0')) {
    if (digits.length !== 11 || digits.startsWith('00')) {
      return null;
    }
    digits = digits.slice(1);
    return `+${NIGERIA_COUNTRY_CODE}${digits}`;
  }

  // Accept forms like +2348012345678 or 2348012345678.
  if (digits.startsWith(NIGERIA_COUNTRY_CODE)) {
    digits = digits.slice(NIGERIA_COUNTRY_CODE.length);
  }

  // National significant number must be exactly 10 digits and not start with 0.
  if (!/^\d{10}$/.test(digits) || digits.startsWith('0')) {
    return null;
  }

  return `+${NIGERIA_COUNTRY_CODE}${digits}`;
};

export const isValidNigerianPhone = (value = '') =>
  normalizeNigerianPhone(value) !== null;

// Returns the input plus any alternate Nigerian formats it could be stored as.
// Lets phone search match records saved before normalization (raw `0...`) and
// records saved after (E.164 `+234...`), regardless of which form the operator types.
export const getNigerianPhoneSearchVariants = (value = '') => {
  const trimmed = String(value).trim();
  if (!trimmed) return [];
  const variants = new Set([trimmed]);
  const normalized = normalizeNigerianPhone(trimmed);
  if (normalized) {
    variants.add(normalized);
    if (normalized.startsWith(`+${NIGERIA_COUNTRY_CODE}`)) {
      variants.add(`0${normalized.slice(`+${NIGERIA_COUNTRY_CODE}`.length)}`);
    }
  }
  return Array.from(variants);
};
