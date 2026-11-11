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

    @Override
    public void load() {
        printerCallback = new InnerPrinterCallback() {
            @Override
            protected void onConnected(SunmiPrinterService service) {
                printerService = service;
            }

            @Override
            protected void onDisconnected() {
                printerService = null;
            }
        };
        try {
            InnerPrinterManager.getInstance().bindService(getContext(), printerCallback);
        } catch (Exception ignored) {
            printerService = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (printerCallback != null) {
            try {
                InnerPrinterManager.getInstance().unBindService(getContext(), printerCallback);
            } catch (Exception ignored) {
                // The SUNMI service may already be unavailable during shutdown.
            }
        }
        printerService = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void startNotificationService(PluginCall call) {
        try {
            // Legacy bridge compatibility: local channels only, NOT a background receiver.
            PartnerNotificationService.createChannels(getContext());
            JSObject result = new JSObject();
            result.put("backgroundReceiver", false);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("No se pudo iniciar el servicio de notificaciones", exception);
        }
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
        } catch (Exception exception) {
            call.reject("No se pudo mostrar el aviso del pedido", exception);
        }
    }

    @PluginMethod
    public void print(PluginCall call) {
        final String text = call.getString("text");
        final String orderId = call.getString("orderId", "");
        if (text == null || text.trim().isEmpty()) {
            call.reject("El ticket está vacío");
            return;
        }
        if (printerService == null) {
            call.reject("No se ha conectado la impresora SUNMI");
            return;
        }
        try {
            final boolean[] completed = {false};
            printerService.printText(text, new InnerResultCallback() {
                @Override
                public void onRunResult(boolean isSuccess) throws RemoteException {
                    if (completed[0]) return;
                    if (!isSuccess) {
                        completed[0] = true;
                        call.reject("La impresora SUNMI rechazó el ticket");
                        return;
                    }
                    completed[0] = true;
                    JSObject result = new JSObject();
                    result.put("printed", true);
                    result.put("orderId", orderId);
                    call.resolve(result);
                }

                @Override
                public void onReturnString(String result) throws RemoteException { }

                @Override
                public void onRaiseException(int code, String msg) throws RemoteException {
                    if (completed[0]) return;
                    completed[0] = true;
                    call.reject(msg == null ? "Error de impresión SUNMI" : msg);
                }

                @Override
                public void onPrintResult(int code, String msg) throws RemoteException {
                    if (completed[0]) return;
                    if (code != 0) {
                        completed[0] = true;
                        call.reject(msg == null ? "Error de impresión SUNMI" : msg);
                        return;
                    }
                    completed[0] = true;
                    JSObject result = new JSObject();
                    result.put("printed", true);
                    result.put("orderId", orderId);
                    call.resolve(result);
                }
            });
        } catch (RemoteException exception) {
            call.reject("No se pudo enviar el ticket a la impresora SUNMI", exception);
        } catch (Exception exception) {
            call.reject("Error inesperado de la impresora SUNMI", exception);
        }
    }
}
