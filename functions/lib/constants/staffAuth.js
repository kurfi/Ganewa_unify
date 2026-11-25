"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAFF_EMAIL_SUFFIX = exports.STAFF_EMAIL_DOMAIN = void 0;
/**
 * Canonical hidden email domain and suffix for staff username-only logins.
 * Uses the RFC 2606 / RFC 6761 reserved `.invalid` TLD so it can never be
 * publicly registered on the internet.
 */
exports.STAFF_EMAIL_DOMAIN = 'staff.ganewa.invalid';
exports.STAFF_EMAIL_SUFFIX = `@${exports.STAFF_EMAIL_DOMAIN}`;
//# sourceMappingURL=staffAuth.js.map