package com.pikidelivery.partners;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * Keeps the partner operation visible on Android and provides a high-priority
 * sound/vibration channel for new orders while the Capacitor WebView is alive.
 */
public class PartnerNotificationService extends Service {
    public static final String CHANNEL_OPERATION = "piki_partner_operation";
    public static final String CHANNEL_ORDERS = "piki_partner_orders";
    public static final int OPERATION_NOTIFICATION_ID = 4100;

    private static final String ACTION_START = "com.pikidelivery.partners.action.START_NOTIFICATIONS";
    private static final String ACTION_ORDER = "com.pikidelivery.partners.action.ORDER_NOTIFICATION";
    private static final String EXTRA_TITLE = "title";
    private static final String EXTRA_BODY = "body";
    private static final String EXTRA_ORDER_ID = "orderId";

    public static void start(Context context) {
        Intent intent = new Intent(context, PartnerNotificationService.class).setAction(ACTION_START);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void notifyOrder(Context context, String title, String body, String orderId) {
        createChannels(context);
        Intent intent = new Intent(context, PartnerNotificationService.class)
                .setAction(ACTION_ORDER)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_BODY, body)
                .putExtra(EXTRA_ORDER_ID, orderId);
        try {
            ContextCompat.startForegroundService(context, intent);
        } catch (Exception ignored) {
            showOrderNotification(context, title, body, orderId);
        }
    }

    public static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel operation = new NotificationChannel(
                CHANNEL_OPERATION,
                "Estado operativo PIKI",
                NotificationManager.IMPORTANCE_LOW
        );
        operation.setDescription("Mantiene visible la conexión de pedidos PIKI");
        operation.setShowBadge(false);

        NotificationChannel orders = new NotificationChannel(
                CHANNEL_ORDERS,
                "Nuevos pedidos PIKI",
                NotificationManager.IMPORTANCE_HIGH
        );
        orders.setDescription("Alerta sonora y vibración para nuevos pedidos");
        orders.enableVibration(true);
        orders.setVibrationPattern(new long[]{0, 250, 120, 250});
        orders.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI, Notification.AUDIO_ATTRIBUTES_DEFAULT);

        manager.createNotificationChannel(operation);
        manager.createNotificationChannel(orders);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels(this);
        startForeground(OPERATION_NOTIFICATION_ID, buildOperationNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_ORDER.equals(intent.getAction())) {
            String title = intent.getStringExtra(EXTRA_TITLE);
            String body = intent.getStringExtra(EXTRA_BODY);
            String orderId = intent.getStringExtra(EXTRA_ORDER_ID);
            showOrderNotification(this, title, body, orderId);
        }
        return START_STICKY;
    }

    private Notification buildOperationNotification() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pendingIntent = launchIntent == null ? null : PendingIntent.getActivity(
                this,
                4101,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_OPERATION)
                .setSmallIcon(com.pikidelivery.partners.R.mipmap.ic_launcher)
                .setContentTitle("PIKI Partner Orders activo")
                .setContentText("Escuchando nuevos pedidos")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        if (pendingIntent != null) builder.setContentIntent(pendingIntent);
        return builder.build();
    }

    private static void showOrderNotification(Context context, String title, String body, String orderId) {
        createChannels(context);
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent pendingIntent = launchIntent == null ? null : PendingIntent.getActivity(
                context,
                4102,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        int notificationId = 4200 + Math.abs((orderId == null ? String.valueOf(System.nanoTime()) : orderId).hashCode() % 100000);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ORDERS)
                .setSmallIcon(com.pikidelivery.partners.R.mipmap.ic_launcher)
                .setContentTitle(title == null || title.trim().isEmpty() ? "Nuevo pedido PIKI" : title)
                .setContentText(body == null || body.trim().isEmpty() ? "Hay un pedido pendiente de aceptación" : body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        if (pendingIntent != null) builder.setContentIntent(pendingIntent);
        try {
            NotificationManagerCompat.from(context).notify(notificationId, builder.build());
        } catch (SecurityException ignored) {
            // Android 13+ requires POST_NOTIFICATIONS; the app remains usable.
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        // START_STICKY lets Android recreate the foreground service when permitted.
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
