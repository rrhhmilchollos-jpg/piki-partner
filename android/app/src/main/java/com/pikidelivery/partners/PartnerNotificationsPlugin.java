package com.pikidelivery.partners;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
import android.app.NotificationManager;
import android.content.Intent;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "PartnerNotifications", permissions = {
        @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class PartnerNotificationsPlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        PartnerNotificationService.createChannels(getContext());
        JSObject result = new JSObject();
        result.put("permission", Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                ? "granted" : getPermissionState("notifications").toString());
        result.put("notificationsEnabled", PartnerNotificationService.enabled(getContext()));
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        int filter = manager == null ? NotificationManager.INTERRUPTION_FILTER_UNKNOWN
                : manager.getCurrentInterruptionFilter();
        result.put("dndMaySuppress", filter != NotificationManager.INTERRUPTION_FILTER_ALL);
        AudioManager audio = getContext().getSystemService(AudioManager.class);
        result.put("silentMode", audio == null || audio.getRingerMode() != AudioManager.RINGER_MODE_NORMAL);
        result.put("notificationVolumeZero", audio == null || audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION) == 0);
        result.put("newOrder", channelStatus(manager, false));
        result.put("cancelled", channelStatus(manager, true));
        result.put("backgroundReceiver", false);
        call.resolve(result);
    }

    private JSObject channelStatus(NotificationManager manager, boolean cancelled) {
        JSObject result = new JSObject();
        String id = PartnerNotificationService.channelId(getContext(), cancelled);
        result.put("id", id);
        result.put("sampleAvailable", PartnerNotificationService.hasSample(getContext(), cancelled));
        int importance = NotificationManager.IMPORTANCE_HIGH;
        boolean soundConfigured = true;
        boolean blocked = false;
        boolean customSampleSelected = PartnerNotificationService.hasSample(getContext(), cancelled);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = manager == null ? null : manager.getNotificationChannel(id);
            importance = channel == null ? NotificationManager.IMPORTANCE_NONE : channel.getImportance();
            soundConfigured = channel != null && channel.getSound() != null
                    && importance >= NotificationManager.IMPORTANCE_DEFAULT;
            customSampleSelected = channel != null && PartnerNotificationService.hasSample(getContext(), cancelled)
                    && PartnerNotificationService.sound(getContext(), cancelled).equals(channel.getSound());
            blocked = channel == null || importance == NotificationManager.IMPORTANCE_NONE;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && channel != null && channel.getGroup() != null) {
                NotificationChannelGroup group = manager.getNotificationChannelGroup(channel.getGroup());
                blocked = blocked || (group != null && group.isBlocked());
            }
        }
        result.put("importance", importance);
        result.put("enabled", !blocked);
        result.put("soundConfigured", soundConfigured && !blocked);
        result.put("customSampleSelected", customSampleSelected);
        return result;
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || getPermissionState("notifications") == PermissionState.GRANTED) {
            getStatus(call);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionResult");
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) { getStatus(call); }

    @PluginMethod
    public void openSettings(PluginCall call) {
        String category = call.getString("category", "app");
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            boolean channel = "new_order".equals(category) || "cancelled".equals(category);
            intent = new Intent(channel ? Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS
                    : Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            if (channel) intent.putExtra(Settings.EXTRA_CHANNEL_ID,
                    PartnerNotificationService.channelId(getContext(), "cancelled".equals(category)));
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
        }
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(intent);
                call.resolve();
            } catch (Exception exception) {
                call.reject("No se pudieron abrir los ajustes Android. Revisa Ajustes > Aplicaciones > PIKI.", exception);
            }
        });
    }

    @PluginMethod
    public void notifyOrder(PluginCall call) {
        String orderId = call.getString("orderId", "");
        String scope = call.getString("scope", "assigned");
        boolean cancelled = "cancelled".equals(call.getString("kind", "new_order"));
        JSObject result = new JSObject();
        result.put("posted", PartnerNotificationService.notifyOrder(getContext(),
                call.getString("title", cancelled ? "Pedido cancelado PIKI" : "Nuevo pedido PIKI"),
                call.getString("body", "Revisa el tablero de cocina"), orderId, scope, cancelled));
        call.resolve(result);
    }

    @PluginMethod
    public void clearOrder(PluginCall call) {
        PartnerNotificationService.clearOrder(getContext(), call.getString("orderId", ""), call.getString("scope", "assigned"));
        call.resolve();
    }

    @PluginMethod
    public void clearAllOrders(PluginCall call) {
        PartnerNotificationService.clearAllOrders(getContext());
        call.resolve();
    }
}
