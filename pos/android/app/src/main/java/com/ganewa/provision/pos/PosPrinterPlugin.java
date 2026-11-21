package com.ganewa.provision.pos;

import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(name = "PosPrinter")
public class PosPrinterPlugin extends Plugin {

    private static final String ACTION_USB_PERMISSION = "com.ganewa.provision.pos.USB_PERMISSION";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private PluginCall pendingPermissionCall = null;
    private BroadcastReceiver usbReceiver = null;

    @PluginMethod
    public void getUsbPrinters(PluginCall call) {
        Context context = getContext();
        UsbManager usbManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);
        if (usbManager == null) {
            call.reject("USB Manager unavailable on this device");
            return;
        }

        HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
        JSArray devicesArray = new JSArray();

        for (Map.Entry<String, UsbDevice> entry : deviceList.entrySet()) {
            UsbDevice device = entry.getValue();
            boolean isPrinter = isPrinterDevice(device);
            boolean hasPermission = usbManager.hasPermission(device);

            JSObject obj = new JSObject();
            obj.put("deviceId", device.getDeviceId());
            obj.put("deviceName", device.getDeviceName());
            obj.put("vendorId", device.getVendorId());
            obj.put("productId", device.getProductId());
            obj.put("manufacturerName", Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP ? device.getManufacturerName() : "");
            obj.put("productName", Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP ? device.getProductName() : "");
            obj.put("isPrinter", isPrinter);
            obj.put("hasPermission", hasPermission);

            devicesArray.put(obj);
        }

        JSObject ret = new JSObject();
        ret.put("devices", devicesArray);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestUsbPermission(PluginCall call) {
        Context context = getContext();
        UsbManager usbManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);
        if (usbManager == null) {
            call.reject("USB Manager unavailable");
            return;
        }

        Integer targetDeviceId = call.getInt("deviceId");
        UsbDevice targetDevice = null;

        HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
        for (UsbDevice device : deviceList.values()) {
            if (targetDeviceId != null && device.getDeviceId() == targetDeviceId) {
                targetDevice = device;
                break;
            } else if (targetDeviceId == null && isPrinterDevice(device)) {
                targetDevice = device;
                break;
            }
        }

        if (targetDevice == null) {
            if (!deviceList.isEmpty()) {
                targetDevice = deviceList.values().iterator().next();
            } else {
                call.reject("No USB printer or device detected");
                return;
            }
        }

        if (usbManager.hasPermission(targetDevice)) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            ret.put("deviceId", targetDevice.getDeviceId());
            call.resolve(ret);
            return;
        }

        // Save call to resolve once user accepts or denies dialog
        pendingPermissionCall = call;
        final UsbDevice finalTarget = targetDevice;

        if (usbReceiver != null) {
            try {
                context.unregisterReceiver(usbReceiver);
            } catch (Exception ignored) {}
        }

        usbReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                String action = intent.getAction();
                if (ACTION_USB_PERMISSION.equals(action)) {
                    synchronized (this) {
                        UsbDevice dev = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                        boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);

                        if (pendingPermissionCall != null) {
                            if (granted) {
                                JSObject res = new JSObject();
                                res.put("granted", true);
                                res.put("deviceId", dev != null ? dev.getDeviceId() : finalTarget.getDeviceId());
                                pendingPermissionCall.resolve(res);
                            } else {
                                pendingPermissionCall.reject("User denied USB permission");
                            }
                            pendingPermissionCall = null;
                        }

                        try {
                            ctx.unregisterReceiver(this);
                            usbReceiver = null;
                        } catch (Exception ignored) {}
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            context.registerReceiver(usbReceiver, filter);
        }

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }

        Intent permissionIntent = new Intent(ACTION_USB_PERMISSION);
        permissionIntent.setPackage(context.getPackageName());
        PendingIntent pi = PendingIntent.getBroadcast(context, 0, permissionIntent, flags);
        usbManager.requestPermission(targetDevice, pi);
    }

    @PluginMethod
    public void printRaw(PluginCall call) {
        String base64Data = call.getString("data");
        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Data parameter (Base64) is required");
            return;
        }

        byte[] rawBytes;
        try {
            rawBytes = Base64.decode(base64Data, Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("Failed to decode Base64 data: " + e.getMessage());
            return;
        }

        Integer targetDeviceId = call.getInt("deviceId");
        try {
            int totalSent = writeToUsb(rawBytes, targetDeviceId);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("bytesWritten", totalSent);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void cutPaper(PluginCall call) {
        // ESC/POS GS V 0 (Full Cut)
        byte[] cutBytes = new byte[]{0x1D, 0x56, 0x00};
        Integer targetDeviceId = call.getInt("deviceId");
        try {
            int sent = writeToUsb(cutBytes, targetDeviceId);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("bytesWritten", sent);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to cut paper: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openCashDrawer(PluginCall call) {
        // ESC/POS ESC p 0 25 250 (Kick Drawer Pin 2)
        byte[] drawerBytes = new byte[]{0x1B, 0x70, 0x00, 0x19, (byte) 0xFA};
        Integer targetDeviceId = call.getInt("deviceId");
        try {
            int sent = writeToUsb(drawerBytes, targetDeviceId);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("bytesWritten", sent);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to open drawer: " + e.getMessage());
        }
    }

    private int writeToUsb(byte[] rawBytes, Integer targetDeviceId) throws Exception {
        Context context = getContext();
        UsbManager usbManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);
        if (usbManager == null) {
            throw new Exception("USB Manager unavailable");
        }

        UsbDevice targetDevice = null;
        HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
        for (UsbDevice device : deviceList.values()) {
            if (targetDeviceId != null && device.getDeviceId() == targetDeviceId) {
                targetDevice = device;
                break;
            } else if (targetDeviceId == null && usbManager.hasPermission(device) && isPrinterDevice(device)) {
                targetDevice = device;
                break;
            }
        }

        if (targetDevice == null) {
            for (UsbDevice device : deviceList.values()) {
                if (usbManager.hasPermission(device)) {
                    targetDevice = device;
                    break;
                }
            }
        }

        if (targetDevice == null) {
            throw new Exception("No connected USB printer found. Please plug in printer and grant permission.");
        }

        if (!usbManager.hasPermission(targetDevice)) {
            throw new Exception("USB permission not granted for printer. Please pair in Settings.");
        }

        UsbInterface usbInterface = null;
        UsbEndpoint outEndpoint = null;

        for (int i = 0; i < targetDevice.getInterfaceCount(); i++) {
            UsbInterface iface = targetDevice.getInterface(i);
            for (int j = 0; j < iface.getEndpointCount(); j++) {
                UsbEndpoint ep = iface.getEndpoint(j);
                if (ep.getDirection() == UsbConstants.USB_DIR_OUT &&
                    ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                    usbInterface = iface;
                    outEndpoint = ep;
                    break;
                }
            }
            if (outEndpoint != null) break;
        }

        if (usbInterface == null || outEndpoint == null) {
            throw new Exception("Could not find USB bulk OUT transfer endpoint on printer");
        }

        UsbDeviceConnection connection = usbManager.openDevice(targetDevice);
        if (connection == null) {
            throw new Exception("Failed to open connection to USB printer");
        }

        try {
            boolean claimed = connection.claimInterface(usbInterface, true);
            if (!claimed) {
                connection.close();
                throw new Exception("Failed to claim USB printer interface");
            }

            int chunkSize = 4096;
            int totalSent = 0;
            for (int offset = 0; offset < rawBytes.length; offset += chunkSize) {
                int len = Math.min(chunkSize, rawBytes.length - offset);
                byte[] chunk = new byte[len];
                System.arraycopy(rawBytes, offset, chunk, 0, len);

                int sent = connection.bulkTransfer(outEndpoint, chunk, len, 5000);
                if (sent < 0) {
                    connection.releaseInterface(usbInterface);
                    connection.close();
                    throw new Exception("USB bulk transfer write error code: " + sent);
                }
                totalSent += sent;
            }

            connection.releaseInterface(usbInterface);
            connection.close();
            return totalSent;
        } catch (Exception e) {
            try {
                connection.releaseInterface(usbInterface);
                connection.close();
            } catch (Exception ignored) {}
            throw e;
        }
    }

    @PluginMethod
    public void getBluetoothPrinters(PluginCall call) {
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) {
                call.reject("Bluetooth adapter not available on this device");
                return;
            }

            if (!adapter.isEnabled()) {
                call.reject("Bluetooth is turned off");
                return;
            }

            Set<BluetoothDevice> pairedDevices = adapter.getBondedDevices();
            JSArray arr = new JSArray();

            if (pairedDevices != null) {
                for (BluetoothDevice device : pairedDevices) {
                    JSObject d = new JSObject();
                    d.put("name", device.getName());
                    d.put("address", device.getAddress());
                    arr.put(d);
                }
            }

            JSObject res = new JSObject();
            res.put("devices", arr);
            call.resolve(res);
        } catch (SecurityException se) {
            call.reject("Bluetooth permission not granted: " + se.getMessage());
        } catch (Exception e) {
            call.reject("Error fetching Bluetooth devices: " + e.getMessage());
        }
    }

    @PluginMethod
    public void printBluetooth(PluginCall call) {
        String address = call.getString("address");
        String base64Data = call.getString("data");

        if (address == null || address.isEmpty()) {
            call.reject("Bluetooth device address is required");
            return;
        }

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Data parameter (Base64) is required");
            return;
        }

        byte[] rawBytes;
        try {
            rawBytes = Base64.decode(base64Data, Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("Failed to decode Base64 data: " + e.getMessage());
            return;
        }

        BluetoothSocket socket = null;
        OutputStream out = null;

        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isEnabled()) {
                call.reject("Bluetooth is disabled or unavailable");
                return;
            }

            BluetoothDevice device = adapter.getRemoteDevice(address);
            adapter.cancelDiscovery();

            socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
            socket.connect();
            out = socket.getOutputStream();

            int chunkSize = 256;
            for (int offset = 0; offset < rawBytes.length; offset += chunkSize) {
                int len = Math.min(chunkSize, rawBytes.length - offset);
                out.write(rawBytes, offset, len);
                out.flush();
                Thread.sleep(10);
            }

            out.close();
            socket.close();

            JSObject res = new JSObject();
            res.put("success", true);
            res.put("bytesWritten", rawBytes.length);
            call.resolve(res);
        } catch (Exception e) {
            try {
                if (out != null) out.close();
                if (socket != null) socket.close();
            } catch (Exception ignored) {}
            call.reject("Bluetooth print error: " + e.getMessage());
        }
    }

    private boolean isPrinterDevice(UsbDevice device) {
        if (device == null) return false;

        // Class 7 is USB Printer class
        if (device.getDeviceClass() == UsbConstants.USB_CLASS_PRINTER) {
            return true;
        }

        // Check interfaces
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            if (iface.getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) {
                return true;
            }
        }

        // Check common printer vendor IDs (Winbond, STMicro, Xprinter, Epson, Rongta)
        int vid = device.getVendorId();
        if (vid == 0x0416 || vid == 0x0483 || vid == 0x1FC9 || vid == 0x0FE6 || vid == 0x04B8) {
            return true;
        }

        // Check if device has bulk OUT endpoint
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            for (int j = 0; j < iface.getEndpointCount(); j++) {
                UsbEndpoint ep = iface.getEndpoint(j);
                if (ep.getDirection() == UsbConstants.USB_DIR_OUT &&
                    ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                    return true;
                }
            }
        }

        return false;
    }
}
