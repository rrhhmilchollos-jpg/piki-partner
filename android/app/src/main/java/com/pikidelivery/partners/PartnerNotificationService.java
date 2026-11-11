package com.pikidelivery.partners;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/** Local alerts for events received by the authenticated WebView. NOT a network receiver. */
public final class PartnerNotificationService {
    public static final String CHANNEL_ORDERS = "piki_partner_orders";
    public static final String CHANNEL_CANCELLED = "piki_partner_order_cancelled";
    private static final String TAG_PREFIX = "piki-partner-order:";
    private static final long[] VIBRATION = new long[]{0, 250, 120, 250};

    private PartnerNotificationService() { }

    public static boolean hasSample(Context context, boolean cancelled) {
        return context.getResources().getIdentifier(
                cancelled ? "order_cancelled" : "new_order_partner", "raw", context.getPackageName()) != 0;
    }

    public static Uri sound(Context context, boolean cancelled) {
        // Resource NAME, not the numeric resource ID: stable across future Android builds.
        return hasSample(context, cancelled)
                ? Uri.parse("android.resource://" + context.getPackageName() + "/raw/"
                    + (cancelled ? "order_cancelled" : "new_order_partner"))
                : Settings.System.DEFAULT_NOTIFICATION_URI;
    }

    public static String channelId(Context context, boolean cancelled) {
        String base = cancelled ? CHANNEL_CANCELLED : CHANNEL_ORDERS;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            // Never replace/reset a channel that the operator may have muted or customized.
            if (manager != null && manager.getNotificationChannel(base) != null) return base;
        }
        // Do not freeze a missing WAV's fallback URI into the final, immutable sample channel.
        return hasSample(context, cancelled) ? base : base + "_fallback";
    }

    public static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        createChannel(context, manager, false);
        createChannel(context, manager, true);
    }

    private static void createChannel(Context context, NotificationManager manager, boolean cancelled) {
        String id = channelId(context, cancelled);
        if (manager.getNotificationChannel(id) != null) return;
        String base = cancelled ? CHANNEL_CANCELLED : CHANNEL_ORDERS;
        NotificationChannel previous = manager.getNotificationChannel(base + "_fallback");
        // A new cancellation category must not bypass a disabled/silent legacy order channel.
        if (previous == null && cancelled) previous = manager.getNotificationChannel(channelId(context, false));
        int importance = previous == null ? NotificationManager.IMPORTANCE_HIGH : previous.getImportance();
        NotificationChannel channel = new NotificationChannel(id,
                cancelled ? "Pedidos cancelados PIKI" : "Nuevos pedidos PIKI", importance);
        channel.setDescription("Avisos de cocina recibidos mientras la aplicación mantiene su conexión");
        channel.setVibrationPattern(previous == null ? VIBRATION : previous.getVibrationPattern());
        channel.enableVibration(previous == null || previous.shouldVibrate());
        Uri selectedSound = sound(context, cancelled);
        if (previous != null) {
            // Preserve silence and explicit custom choices during fallback-to-sample migration.
            boolean userSound = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && previous.hasUserSetSound();
            if (previous.getSound() == null || userSound
                    || (!Settings.System.DEFAULT_NOTIFICATION_URI.equals(previous.getSound())
                        && !sound(context, false).equals(previous.getSound()))) {
                selectedSound = previous.getSound();
            }
            channel.setGroup(previous.getGroup());
        }
        AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        channel.setSound(selectedSound, attributes);
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        // No DND bypass, alarm stream, full-screen intent or forced volume.
        manager.createNotificationChannel(channel);
    }

    public static boolean enabled(Context context) {
        return (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED)
                && NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    public static boolean notifyOrder(Context context, String title, String body, String orderId,
                                      String scope, boolean cancelled) {
        if (orderId == null || orderId.trim().isEmpty() || !enabled(context)) return false;
        createChannels(context);
        String channelId = channelId(context, cancelled);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = manager.getNotificationChannel(channelId);
            if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        }
        String tag = TAG_PREFIX + scope + ":" + orderId;
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent pendingIntent = launchIntent == null ? null : PendingIntent.getActivity(context,
                tag.hashCode(), launchIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                .setSmallIcon(R.drawable.ic_partner_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_EVENT)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setSound(sound(context, cancelled)).setVibrate(VIBRATION);
        }
        if (pendingIntent != null) builder.setContentIntent(pendingIntent);
        try {
            NotificationManagerCompat.from(context).notify(tag, 4200, builder.build());
            return true; // Posted, not proof of audible delivery, DND/OEM remain authoritative.
        } catch (SecurityException ignored) {
            return false; // Permission may have been revoked between checking and posting.
        }
    }

    public static void clearOrder(Context context, String orderId, String scope) {
        NotificationManagerCompat.from(context).cancel(TAG_PREFIX + scope + ":" + orderId, 4200);
    }

    public static void clearAllOrders(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        for (android.service.notification.StatusBarNotification notification : manager.getActiveNotifications()) {
            if (notification.getTag() != null && notification.getTag().startsWith(TAG_PREFIX)) {
                manager.cancel(notification.getTag(), notification.getId());
            }
        }
        manager.cancel(4100); // Old APK's operational notification, if still present after an upgrade.
    }
}
