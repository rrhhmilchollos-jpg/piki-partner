package com.pikidelivery.partners;

import android.os.RemoteException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.sunmi.peripheral.printer.InnerPrinterCallback;
import com.sunmi.peripheral.printer.InnerPrinterManager;
import com.sunmi.peripheral.printer.InnerResultCallback;
import com.sunmi.peripheral.printer.SunmiPrinterService;

/** Capacitor bridge for the built-in SUNMI V2S 58mm printer. */
@CapacitorPlugin(name = "SunmiPrinter")
public class SunmiPrinterPlugin extends Plugin {
    private SunmiPrinterService printerService;
    private InnerPrinterCallback printerCallback;

    private void bindPrinterService() {
        if (printerCallback == null) {
            printerCallback = new InnerPrinterCallback() {
                @Override
                protected void onConnected(SunmiPrinterService service) { printerService = service; }
                @Override
                protected void onDisconnected() { printerService = null; }
            };
        }
        try { InnerPrinterManager.getInstance().bindService(getContext(), printerCallback); }
        catch (Exception ignored) { printerService = null; }
    }

    @Override public void load() { bindPrinterService(); }

    @Override
    protected void handleOnDestroy() {
        if (printerCallback != null) {
            try { InnerPrinterManager.getInstance().unBindService(getContext(), printerCallback); }
            catch (Exception ignored) { }
        }
        printerService = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void startNotificationService(PluginCall call) {
        try {
            PartnerNotificationService.createChannels(getContext());
            JSObject result = new JSObject();
            result.put("backgroundReceiver", false);
            call.resolve(result);
        } catch (Exception exception) { call.reject("No se pudo iniciar el servicio de notificaciones", exception); }
    }

    @PluginMethod
    public void notifyOrder(PluginCall call) {
        String title = call.getString("title", "Nuevo pedido PIKI");
        String body = call.getString("body", "Hay un pedido pendiente de aceptación");
        String orderId = call.getString("orderId", "");
        try {
            JSObject result = new JSObject();
            result.put("posted", PartnerNotificationService.notifyOrder(getContext(), title, body, orderId, "assigned", false));
            call.resolve(result);
        } catch (Exception exception) { call.reject("No se pudo mostrar el aviso del pedido", exception); }
    }

    @PluginMethod
    public void print(PluginCall call) {
        final String text = call.getString("text");
        final String orderId = call.getString("orderId", "");
        final String qrCode = call.getString("qrCode", "");
        final String afterQrText = call.getString("afterQrText", "");
        if (text == null || text.trim().isEmpty()) { call.reject("El ticket está vacío"); return; }
        if (printerService == null) bindPrinterService();
        if (printerService == null) { call.reject("No se ha conectado la impresora SUNMI"); return; }
        final boolean[] completed = {false};
        try {
            printerService.printText(text, new InnerResultCallback() {
                @Override public void onRunResult(boolean success) throws RemoteException {
                    if (!success || completed[0]) { if (!success) rejectOnce(call, completed, "La impresora SUNMI rechazó el ticket"); return; }
                    printQrThenRemaining(call, orderId, qrCode, afterQrText, completed);
                }
                @Override public void onReturnString(String result) throws RemoteException { }
                @Override public void onRaiseException(int code, String msg) throws RemoteException { rejectOnce(call, completed, msg == null ? "Error de impresión SUNMI" : msg); }
                @Override public void onPrintResult(int code, String msg) throws RemoteException {
                    if (code != 0) rejectOnce(call, completed, msg == null ? "Error de impresión SUNMI" : msg);
                    else if (!completed[0]) printQrThenRemaining(call, orderId, qrCode, afterQrText, completed);
                }
            });
        } catch (RemoteException exception) { call.reject("No se pudo enviar el ticket a la impresora SUNMI", exception); }
        catch (Exception exception) { call.reject("Error inesperado de la impresora SUNMI", exception); }
    }

    private void printQrThenRemaining(PluginCall call, String orderId, String qrCode, String afterQrText, boolean[] completed) {
        if (completed[0]) return;
        if (qrCode == null || qrCode.trim().isEmpty()) { printRemaining(call, orderId, afterQrText, completed); return; }
        try {
            printerService.printQRCode(qrCode, 8, 1, new InnerResultCallback() {
                @Override public void onRunResult(boolean success) throws RemoteException {
                    if (!success) rejectOnce(call, completed, "La impresora SUNMI rechazó el QR");
                    else printRemaining(call, orderId, afterQrText, completed);
                }
                @Override public void onReturnString(String result) throws RemoteException { }
                @Override public void onRaiseException(int code, String msg) throws RemoteException { rejectOnce(call, completed, msg == null ? "Error de impresión QR" : msg); }
                @Override public void onPrintResult(int code, String msg) throws RemoteException { if (code != 0) rejectOnce(call, completed, msg == null ? "Error de impresión QR" : msg); }
            });
        } catch (RemoteException exception) { call.reject("No se pudo imprimir el QR", exception); }
    }

    private void printRemaining(PluginCall call, String orderId, String text, boolean[] completed) {
        if (text == null || text.isEmpty()) { resolvePrinted(call, orderId, completed); return; }
        try {
            printerService.printText(text, new InnerResultCallback() {
                @Override public void onRunResult(boolean success) throws RemoteException { if (!success) rejectOnce(call, completed, "La impresora SUNMI rechazó el ticket"); else resolvePrinted(call, orderId, completed); }
                @Override public void onReturnString(String result) throws RemoteException { }
                @Override public void onRaiseException(int code, String msg) throws RemoteException { rejectOnce(call, completed, msg == null ? "Error de impresión SUNMI" : msg); }
                @Override public void onPrintResult(int code, String msg) throws RemoteException { if (code != 0) rejectOnce(call, completed, msg == null ? "Error de impresión SUNMI" : msg); else resolvePrinted(call, orderId, completed); }
            });
        } catch (RemoteException exception) { rejectOnce(call, completed, "No se pudo imprimir el final del ticket"); }
    }

    private void resolvePrinted(PluginCall call, String orderId, boolean[] completed) {
        if (completed[0]) return;
        completed[0] = true;
        JSObject result = new JSObject();
        result.put("printed", true);
        result.put("orderId", orderId);
        call.resolve(result);
    }

    private void rejectOnce(PluginCall call, boolean[] completed, String message) {
        if (completed[0]) return;
        completed[0] = true;
        call.reject(message);
    }
}
