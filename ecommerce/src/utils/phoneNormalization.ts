/**
 * phoneNormalization.ts
 * Utility to generate normalized variants of phone numbers for flexible Firestore queries.
 */

export function getPhoneVariants(phone: string): string[] {
  if (!phone) return [];

  const cleaned = phone.trim().replace(/[^\d+]/g, '');
  if (!cleaned) return [];

  const variants = new Set<string>();
  variants.add(phone.trim());
  variants.add(cleaned);

  const digitsOnly = cleaned.replace(/^\+/, '');
  variants.add(digitsOnly);

  if (digitsOnly.startsWith('234') && digitsOnly.length === 13) {
    const local10 = digitsOnly.substring(3);
    variants.add(`0${local10}`);
    variants.add(`+234${local10}`);
    variants.add(`234${local10}`);
    variants.add(local10);
  } else if (digitsOnly.startsWith('0') && digitsOnly.length === 11) {
    const local10 = digitsOnly.substring(1);
    variants.add(`0${local10}`);
    variants.add(`+234${local10}`);
    variants.add(`234${local10}`);
    variants.add(local10);
  } else if (digitsOnly.length === 10 && !digitsOnly.startsWith('0')) {
    variants.add(`0${digitsOnly}`);
    variants.add(`+234${digitsOnly}`);
    variants.add(`234${digitsOnly}`);
    variants.add(digitsOnly);
  }

  return Array.from(variants).filter(Boolean).slice(0, 10);
}

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
