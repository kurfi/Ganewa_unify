/**
 * phoneNormalization.ts
 * Utility to generate normalized variants of phone numbers for flexible Firestore queries.
 */

/**
 * Returns an array of phone number variants (up to 10 for Firestore 'in' queries).
 * Handles Nigerian standard numbers (080..., 070..., 090..., 081..., etc.) and international formats (+234...).
 * Also appends space-padded variations to match records stored with trailing whitespace in the database.
 */
export function getPhoneVariants(phone: string): string[] {
  if (!phone) return [];

  // Remove all non-digit and non-plus characters
  const cleaned = phone.trim().replace(/[^\d+]/g, '');
  if (!cleaned) return [];

  const baseVariants = new Set<string>();
  baseVariants.add(phone.trim());
  baseVariants.add(cleaned);

  // Strip leading plus if any
  const digitsOnly = cleaned.replace(/^\+/, '');
  baseVariants.add(digitsOnly);

  // Check Nigerian prefix patterns (+234, 234, 0...)
  if (digitsOnly.startsWith('234') && digitsOnly.length === 13) {
    const local10 = digitsOnly.substring(3); // e.g. 8012345678
    baseVariants.add(`0${local10}`);
    baseVariants.add(`+234${local10}`);
    baseVariants.add(`234${local10}`);
    baseVariants.add(local10);
  } else if (digitsOnly.startsWith('0') && digitsOnly.length === 11) {
    const local10 = digitsOnly.substring(1); // e.g. 8012345678
    baseVariants.add(`0${local10}`);
    baseVariants.add(`+234${local10}`);
    baseVariants.add(`234${local10}`);
    baseVariants.add(local10);
  } else if (digitsOnly.length === 10 && !digitsOnly.startsWith('0')) {
    baseVariants.add(`0${digitsOnly}`);
    baseVariants.add(`+234${digitsOnly}`);
    baseVariants.add(`234${digitsOnly}`);
    baseVariants.add(digitsOnly);
  }

  // Create trailing-space padded variants to handle loose Firestore inputs
  const variantsArray = Array.from(baseVariants).filter(Boolean);
  const finalSet = new Set<string>();

  // Add all base variants
  variantsArray.forEach(v => finalSet.add(v));
  // Add variants with a trailing space
  variantsArray.forEach(v => finalSet.add(v + ' '));

  // Firestore 'in' operator supports max 10 elements
  return Array.from(finalSet).slice(0, 10);
}

/**
 * Normalizes a single phone number to a standard key for exact matching (e.g. 10-digit national number).
 */
export function normalizePhoneKey(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13) {
    return digits.substring(3);
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return digits.substring(1);
  }
  if (digits.length === 10) {
    return digits;
  }
  return digits;
}

/**
 * Normalizes a phone string which may contain multiple phone numbers separated by separators
 * (e.g., "08012345678 / 08087654321" or "08012345678, 08022222222") and returns all normalized keys.
 */
export function getNormalizedPhoneKeys(phone: string): string[] {
  if (!phone) return [];
  // Split by common separators: slash, comma, semicolon, ampersand, or words 'and'/'or'
  const parts = phone.split(/[\/,;&]|\band\b|\bor\b/);
  const keys = new Set<string>();

  parts.forEach(part => {
    const key = normalizePhoneKey(part.trim());
    if (key) {
      keys.add(key);
    }
  });

  return Array.from(keys);
}

