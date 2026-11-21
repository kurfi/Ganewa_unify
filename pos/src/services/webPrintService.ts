// Service for direct WebUSB, Web Serial, and Web Bluetooth thermal printing (No Print Dialog)

export type DirectPrinterType = 'none' | 'webusb' | 'webbluetooth' | 'webserial';

/**
 * Label media type for product barcode printing.
 * - 'plain'    : Plain receipt paper — printer cuts after each copy so the operator
 *                can tear/tape the strip onto the product.
 * - 'adhesive' : Die-cut adhesive label roll — no extra feeds or mid-batch cuts; the
 *                roll auto-advances to the next sticker. A single cut is issued only
 *                after the last copy in the batch.
 */
export type LabelMediaType = 'plain' | 'adhesive';

export interface DirectHardwareInfo {
  type: DirectPrinterType;
  name: string;
  isSupported: boolean;
  connected: boolean;
}

// In-memory reference to active Bluetooth device since Web Bluetooth doesn't always persist across tab refreshes
let activeBluetoothDevice: any = null;
let activeBluetoothCharacteristic: any = null;

// Standard GATT service UUIDs used by thermal ESC/POS receipt printers
const BLE_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
];

export const isWebUsbSupported = (): boolean => {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
};

export const isWebBluetoothSupported = (): boolean => {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
};

export const isWebSerialSupported = (): boolean => {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
};

export const getSavedHardwareType = (): DirectPrinterType => {
  if (typeof window === 'undefined') return 'none';
  return (localStorage.getItem('directHardwareType') as DirectPrinterType) || 'none';
};

export const getSavedHardwareName = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('directHardwareName') || '';
};

export const setSavedHardware = (type: DirectPrinterType, name: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('directHardwareType', type);
  localStorage.setItem('directHardwareName', name);
};

/**
 * Returns the saved label media type. Defaults to 'plain' so the shop works
 * out-of-the-box with plain receipt paper before switching to adhesive rolls.
 */
export const getSavedLabelMediaType = (): LabelMediaType => {
  if (typeof window === 'undefined') return 'plain';
  return (localStorage.getItem('labelMediaType') as LabelMediaType) || 'plain';
};

/** Persists the chosen label media type across page loads. */
export const setSavedLabelMediaType = (type: LabelMediaType): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('labelMediaType', type);
};

export const clearSavedHardware = async (): Promise<void> => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('directHardwareType');
    localStorage.removeItem('directHardwareName');
  }
  if (activeBluetoothDevice && activeBluetoothDevice.gatt?.connected) {
    try {
      activeBluetoothDevice.gatt.disconnect();
    } catch {
      // Ignore disconnect error
    }
  }
  activeBluetoothDevice = null;
  activeBluetoothCharacteristic = null;
};

/**
 * -----------------------------
 * WebUSB Implementation
 * -----------------------------
 */

export const requestUsbPrinter = async (): Promise<string> => {
  if (!isWebUsbSupported()) {
    throw new Error('WebUSB is not supported in this browser. Please use Chrome or Edge.');
  }

  const navUsb = (navigator as any).usb;
  const device = await navUsb.requestDevice({ filters: [] });

  // Test opening device to verify OS (e.g. ChromeOS) has not claimed/locked it
  try {
    if (!device.opened) {
      await device.open();
      await device.close();
    }
  } catch (openErr: any) {
    if (openErr.name === 'SecurityError' || openErr.message?.includes('Access denied')) {
      throw new Error('Access denied by OS (ChromeOS locks USB printers). Please use native Chromebook printing via Settings > Printers.');
    }
    throw openErr;
  }

  const name = device.productName || `USB Printer (VID: ${device.vendorId})`;

  setSavedHardware('webusb', name);
  return name;
};

const getUsbPrinterDevice = async (): Promise<any | null> => {
  if (!isWebUsbSupported()) return null;
  const navUsb = (navigator as any).usb;
  const devices = await navUsb.getDevices();
  if (!devices || devices.length === 0) return null;
  return devices[0];
};

const sendBytesToUsbPrinter = async (device: any, buffer: Uint8Array): Promise<boolean> => {
  try {
    if (!device.opened) {
      await device.open();
    }

    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }

    // Find interface with bulk OUT endpoint
    let targetInterface: any = null;
    let outEndpoint: any = null;

    const interfaces = device.configuration?.interfaces || [];
    for (const iface of interfaces) {
      for (const alt of iface.alternates) {
        // Look for OUT bulk endpoint
        const ep = alt.endpoints?.find(
          (e: any) => e.direction === 'out' && (e.type === 'bulk' || e.type === 'interrupt')
        );
        if (ep) {
          targetInterface = iface;
          outEndpoint = ep;
          break;
        }
      }
      if (outEndpoint) break;
    }

    if (!targetInterface || !outEndpoint) {
      // Fallback to first interface and first out endpoint
      if (interfaces.length > 0) {
        targetInterface = interfaces[0];
        const alt = targetInterface.alternates[0];
        outEndpoint = alt.endpoints?.find((e: any) => e.direction === 'out') || { endpointNumber: 1 };
      }
    }

    if (targetInterface) {
      await device.claimInterface(targetInterface.interfaceNumber);
    }

    const endpointNumber = outEndpoint?.endpointNumber ?? 1;

    // Send data in chunks of 512 bytes for USB reliability
    const chunkSize = 512;
    for (let i = 0; i < buffer.length; i += chunkSize) {
      const chunk = buffer.slice(i, i + chunkSize);
      await device.transferOut(endpointNumber, chunk);
    }

    return true;
  } catch (err: any) {
    // SecurityError means the OS/browser has claimed this device (e.g. ChromeOS locks USB printers).
    // This is expected when the print bridge is the active print path — suppress as a noisy error.
    if (err?.name === 'SecurityError' || err?.message?.includes('Access denied')) {
      console.warn('WebUSB blocked by OS (device claimed/locked). Will fall back to print bridge.');
    } else {
      console.warn('WebUSB print failed:', err);
    }
    return false;
  }
};

/**
 * -----------------------------
 * Web Serial Implementation
 * -----------------------------
 */

export const requestSerialPrinter = async (): Promise<string> => {
  if (!isWebSerialSupported()) {
    throw new Error('Web Serial is not supported in this browser. Please use Chrome or Edge.');
  }

  const navSerial = (navigator as any).serial;
  const port = await navSerial.requestPort();
  const info = port.getInfo?.() || {};
  const name = info.usbVendorId ? `Serial Printer (VID: ${info.usbVendorId})` : 'Serial Thermal Printer';

  setSavedHardware('webserial', name);
  return name;
};

const getSerialPort = async (): Promise<any | null> => {
  if (!isWebSerialSupported()) return null;
  const navSerial = (navigator as any).serial;
  const ports = await navSerial.getPorts();
  if (!ports || ports.length === 0) return null;
  return ports[0];
};

const sendBytesToSerialPrinter = async (port: any, buffer: Uint8Array): Promise<boolean> => {
  try {
    if (!port.readable && !port.writable) {
      // Standard baud rate for thermal ESC/POS printers is 9600 (or 115200)
      await port.open({ baudRate: 9600 });
    }

    const writer = port.writable.getWriter();
    await writer.write(buffer);
    writer.releaseLock();
    return true;
  } catch (err) {
    console.error('Web Serial print error:', err);
    return false;
  }
};

/**
 * -----------------------------
 * Web Bluetooth Implementation
 * -----------------------------
 */

export const requestBluetoothPrinter = async (): Promise<string> => {
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome on Chromebook, Android, or PC.');
  }

  const navBt = (navigator as any).bluetooth;
  const device = await navBt.requestDevice({
    acceptAllDevices: true,
    optionalServices: BLE_PRINTER_SERVICES,
  });

  activeBluetoothDevice = device;
  const name = device.name || 'Bluetooth Thermal Printer';
  setSavedHardware('webbluetooth', name);
  return name;
};

const getBluetoothCharacteristic = async (device: any): Promise<any | null> => {
  if (!device.gatt.connected) {
    await device.gatt.connect();
  }

  // Iterate over known printer services
  for (const serviceUuid of BLE_PRINTER_SERVICES) {
    try {
      const service = await device.gatt.getPrimaryService(serviceUuid);
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          return char;
        }
      }
    } catch {
      // Service not matched on this device, check next
    }
  }

  // Fallback: search all primary services if permitted
  try {
    const services = await device.gatt.getPrimaryServices();
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          return char;
        }
      }
    }
  } catch (e) {
    console.warn('Could not enumerate generic BLE services:', e);
  }

  return null;
};

const sendBytesToBluetoothPrinter = async (buffer: Uint8Array): Promise<boolean> => {
  if (!activeBluetoothDevice) return false;

  try {
    if (!activeBluetoothCharacteristic || !activeBluetoothDevice.gatt?.connected) {
      activeBluetoothCharacteristic = await getBluetoothCharacteristic(activeBluetoothDevice);
    }

    if (!activeBluetoothCharacteristic) {
      console.warn('No writable characteristic found on Bluetooth printer');
      return false;
    }

    // BLE MTU is usually small (~20 to 128 bytes). Split into 80-byte chunks with slight delay.
    const chunkSize = 80;
    for (let i = 0; i < buffer.length; i += chunkSize) {
      const chunk = buffer.slice(i, i + chunkSize);
      if (activeBluetoothCharacteristic.writeValueWithResponse) {
        await activeBluetoothCharacteristic.writeValueWithResponse(chunk);
      } else {
        await activeBluetoothCharacteristic.writeValue(chunk);
      }
      // 15ms pause between packets
      await new Promise((res) => setTimeout(res, 15));
    }

    return true;
  } catch (err) {
    console.error('Web Bluetooth print error:', err);
    activeBluetoothCharacteristic = null;
    return false;
  }
};

/**
 * ----------------------------------------------
 * Unified Direct Hardware Printing (No Dialog)
 * ----------------------------------------------
 */

export const printViaDirectHardware = async (buffer: Uint8Array): Promise<boolean> => {
  const savedType = getSavedHardwareType();

  // If user explicitly chose none (or disconnected), do not attempt direct hardware
  if (savedType === 'none') {
    return false;
  }

  // Try configured type only — auto-discovery is handled by printDirectToThermalPrinter
  if (savedType === 'webusb') {
    const device = await getUsbPrinterDevice();
    if (device) {
      const ok = await sendBytesToUsbPrinter(device, buffer);
      if (ok) return true;
    }
  } else if (savedType === 'webserial') {
    const port = await getSerialPort();
    if (port) {
      const ok = await sendBytesToSerialPrinter(port, buffer);
      if (ok) return true;
    }
  } else if (savedType === 'webbluetooth') {
    if (activeBluetoothDevice) {
      const ok = await sendBytesToBluetoothPrinter(buffer);
      if (ok) return true;
    }
  }

  return false;
};


export const getDirectHardwareStatus = async (): Promise<DirectHardwareInfo> => {
  const type = getSavedHardwareType();
  const name = getSavedHardwareName();

  let isSupported = false;
  let connected = false;

  if (type === 'webusb') {
    isSupported = isWebUsbSupported();
    if (isSupported) {
      const device = await getUsbPrinterDevice();
      connected = !!device;
    }
  } else if (type === 'webserial') {
    isSupported = isWebSerialSupported();
    if (isSupported) {
      const port = await getSerialPort();
      connected = !!port;
    }
  } else if (type === 'webbluetooth') {
    isSupported = isWebBluetoothSupported();
    connected = !!(activeBluetoothDevice && activeBluetoothDevice.gatt?.connected);
  }

  return {
    type,
    name,
    isSupported,
    connected,
  };
};
