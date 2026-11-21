import { registerPlugin, Capacitor } from '@capacitor/core';

export interface UsbDeviceInfo {
  deviceId: number;
  deviceName: string;
  vendorId: number;
  productId: number;
  manufacturerName?: string;
  productName?: string;
  isPrinter: boolean;
  hasPermission: boolean;
}

export interface BluetoothDeviceInfo {
  name: string;
  address: string;
}

export interface PosPrinterPluginInterface {
  getUsbPrinters(): Promise<{ devices: UsbDeviceInfo[] }>;
  requestUsbPermission(options?: { deviceId?: number }): Promise<{ granted: boolean; deviceId: number }>;
  printRaw(options: { data: string; deviceId?: number }): Promise<{ success: boolean; bytesWritten: number }>;
  cutPaper(options?: { deviceId?: number }): Promise<{ success: boolean }>;
  openCashDrawer(options?: { deviceId?: number }): Promise<{ success: boolean }>;
  getBluetoothPrinters(): Promise<{ devices: BluetoothDeviceInfo[] }>;
  printBluetooth(options: { address: string; data: string }): Promise<{ success: boolean; bytesWritten: number }>;
}

export const PosPrinter = registerPlugin<PosPrinterPluginInterface>('PosPrinter');

/**
 * Checks if the current POS environment is running inside Capacitor Native Android
 * (e.g. Chromebook running Android APK, or Android POS tablet).
 */
export const isNativeAndroid = (): boolean => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
};

/**
 * Converts a Uint8Array ESC/POS byte buffer to a base64 encoded string.
 */
export const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Lists connected USB devices and filters/flags thermal printers.
 */
export const getConnectedUsbPrinters = async (): Promise<UsbDeviceInfo[]> => {
  if (!isNativeAndroid()) return [];
  try {
    const res = await PosPrinter.getUsbPrinters();
    return res.devices || [];
  } catch (err) {
    console.error('Failed to get USB printers:', err);
    return [];
  }
};

/**
 * Requests native USB permission from Android UsbManager.
 * Prompts the native Android dialog: "Allow Ganewa POS to access Xprinter XP-T80Q?"
 */
export const requestUsbPrinterPermission = async (deviceId?: number): Promise<boolean> => {
  if (!isNativeAndroid()) return false;
  try {
    const res = await PosPrinter.requestUsbPermission(deviceId ? { deviceId } : {});
    return !!res.granted;
  } catch (err) {
    console.error('Failed to request USB permission:', err);
    return false;
  }
};

/**
 * Sends a raw ESC/POS byte buffer directly to the connected USB printer.
 * Zero dialogs, zero paper margins, direct hardware printhead communication.
 */
export const printViaNativeUsb = async (buffer: Uint8Array, deviceId?: number): Promise<boolean> => {
  if (!isNativeAndroid()) return false;
  try {
    const base64Data = uint8ArrayToBase64(buffer);
    const res = await PosPrinter.printRaw({
      data: base64Data,
      deviceId
    });
    return !!res.success;
  } catch (err: any) {
    console.error('Native USB print error:', err);
    // If permission was lost or device was replugged, try requesting permission
    if (err?.message?.includes('permission')) {
      const granted = await requestUsbPrinterPermission(deviceId);
      if (granted) {
        const base64Data = uint8ArrayToBase64(buffer);
        const retryRes = await PosPrinter.printRaw({
          data: base64Data,
          deviceId
        });
        return !!retryRes.success;
      }
    }
    return false;
  }
};

/**
 * Triggers ESC/POS paper cut via native Android USB layer.
 */
export const cutNativePaper = async (deviceId?: number): Promise<boolean> => {
  if (!isNativeAndroid()) return false;
  try {
    const res = await PosPrinter.cutPaper(deviceId ? { deviceId } : {});
    return !!res.success;
  } catch (err) {
    console.error('Native cut paper error:', err);
    return false;
  }
};

/**
 * Triggers cash drawer kick via native Android USB layer.
 */
export const openNativeCashDrawer = async (deviceId?: number): Promise<boolean> => {
  if (!isNativeAndroid()) return false;
  try {
    const res = await PosPrinter.openCashDrawer(deviceId ? { deviceId } : {});
    return !!res.success;
  } catch (err) {
    console.error('Native open cash drawer error:', err);
    return false;
  }
};
