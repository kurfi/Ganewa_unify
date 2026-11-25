/**
 * Canonical hidden email domain and suffix for staff username-only logins.
 * Uses the RFC 2606 / RFC 6761 reserved `.invalid` TLD so it can never be
 * publicly registered on the internet.
 */
export const STAFF_EMAIL_DOMAIN = 'staff.ganewa.invalid';
export const STAFF_EMAIL_SUFFIX = `@${STAFF_EMAIL_DOMAIN}`;
