export const validateNigerianPhone = (phone: string, showToast?: (msg: string, type: string) => void): boolean => {
    const nigerianPrefixes = ['081', '080', '091', '090', '070'];
    const cleanPhone = phone.trim();

    if (cleanPhone.length !== 11) {
        if (showToast) showToast('Phone number must be exactly 11 digits', 'error');
        return false;
    }

    if (!/^\d+$/.test(cleanPhone)) {
        if (showToast) showToast('Phone number must contain only digits', 'error');
        return false;
    }

    const prefix = cleanPhone.substring(0, 3);
    if (!nigerianPrefixes.includes(prefix)) {
        if (showToast) showToast('Phone number must start with 081, 080, 091, 090, or 070', 'error');
        return false;
    }

    return true;
};

export const validateInventoryField = (value: string, fieldName: string, showToast?: (msg: string, type: string) => void, maxLen?: number): boolean => {
    const cleanValue = value.trim();
    
    if (maxLen && cleanValue.length > maxLen) {
        if (showToast) showToast(`${fieldName} must not exceed ${maxLen} characters.`, 'error');
        return false;
    }

    const regex = /^[a-zA-Z0-9\s&,]*$/;
    if (!regex.test(cleanValue)) {
        if (showToast) showToast(`${fieldName} contains invalid characters. Only alphanumeric, space, & and , are allowed.`, 'error');
        return false;
    }
    return true;
};

export const validateNumericField = (value: number, fieldName: string, min: number = 0, showToast?: (msg: string, type: string) => void): boolean => {
    if (isNaN(value) || value < min) {
        if (showToast) showToast(`${fieldName} must be a valid number and at least ${min}`, 'error');
        return false;
    }
    return true;
};
