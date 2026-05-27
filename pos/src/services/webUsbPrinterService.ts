export const isWebUSBSupported = (): boolean => {
    return !!(navigator as any).usb;
};

export const requestUSBPrinter = async () => {
    if (!(navigator as any).usb) return null;
    try {
        const device = await (navigator as any).usb.requestDevice({ filters: [] });
        return device;
    } catch (e) {
        console.warn("User cancelled or failed to select USB device", e);
        return null;
    }
};

export const printRawUSB = async (data: Uint8Array) => {
    console.log("Printing via WebUSB (Mock)", data);
};

export const isPrinterConnected = (): boolean => {
    // Mock check
    return false;
};

export const getPrinterInfo = (device: any): string => {
    return device ? (device.productName || "Unknown Printer") : "None";
};
