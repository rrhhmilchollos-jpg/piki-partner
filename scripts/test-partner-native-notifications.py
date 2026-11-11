#!/usr/bin/env python3
"""Read-only Android contract checks. Not a Java build or a physical-device test."""
from pathlib import Path
import unittest
import wave
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / "android/app/src/main/java/com/pikidelivery/partners"
ANDROID = "{http://schemas.android.com/apk/res/android}"


class PartnerNativeNotificationsTests(unittest.TestCase):
    def test_manifest_declares_post_notifications_and_vibration_only(self):
        manifest = ET.parse(ROOT / "android/app/src/main/AndroidManifest.xml").getroot()
        permissions = {item.attrib[ANDROID + "name"] for item in manifest.findall("uses-permission")}
        self.assertIn("android.permission.POST_NOTIFICATIONS", permissions)
        self.assertIn("android.permission.VIBRATE", permissions)
        self.assertNotIn("android.permission.RECORD_AUDIO", permissions)
        self.assertNotIn("android.permission.READ_MEDIA_AUDIO", permissions)
        self.assertNotIn("android.permission.ACCESS_NOTIFICATION_POLICY", permissions)
        self.assertNotIn("android.permission.FOREGROUND_SERVICE_DATA_SYNC", permissions)
        self.assertFalse(manifest.findall("application/service"))

    def test_wav_samples_are_real_pcm(self):
        for name in ("new_order_partner.wav", "order_cancelled.wav"):
            with self.subTest(name=name):
                path = ROOT / "android/app/src/main/res/raw" / name
                self.assertTrue(path.is_file())
                with wave.open(str(path), "rb") as sample:
                    self.assertEqual(sample.getcomptype(), "NONE")
                    self.assertEqual(sample.getsampwidth(), 2)
                    self.assertEqual(sample.getnchannels(), 1)
                    self.assertEqual(sample.getframerate(), 24000)
                    self.assertGreater(sample.getnframes(), 0)
                    self.assertNotEqual(sample.readframes(sample.getnframes()), b"\0" * (sample.getnframes() * 2))

    def test_channels_keep_user_settings_and_resource_names(self):
        source = (JAVA / "PartnerNotificationService.java").read_text()
        self.assertIn('"order_cancelled" : "new_order_partner"', source)
        self.assertIn('"android.resource://"', source)
        self.assertIn('"/raw/"', source)
        self.assertIn("getNotificationChannel(id) != null", source)
        self.assertIn("USAGE_NOTIFICATION_EVENT", source)
        self.assertIn("hasUserSetSound", source)
        self.assertIn('base + "_fallback"', source)
        for unsafe in ("deleteNotificationChannel(", "setBypassDnd(", "setStreamVolume(", "MediaPlayer", "CATEGORY_ALARM", "DEFAULT_ALL", "startForegroundService(", "START_STICKY"):
            self.assertNotIn(unsafe, source)

    def test_runtime_permission_has_api_guard_and_callback(self):
        source = (JAVA / "PartnerNotificationsPlugin.java").read_text()
        self.assertIn("Manifest.permission.POST_NOTIFICATIONS", source)
        self.assertIn("Build.VERSION_CODES.TIRAMISU", source)
        self.assertIn('requestPermissionForAlias("notifications", call, "notificationPermissionResult")', source)
        self.assertIn("@PermissionCallback", source)
        self.assertIn("ACTION_CHANNEL_NOTIFICATION_SETTINGS", source)
        self.assertIn("getCurrentInterruptionFilter()", source)
        self.assertIn('result.put("backgroundReceiver", false)', source)
        self.assertIn("getStreamVolume(AudioManager.STREAM_NOTIFICATION)", source)

    def test_registered_plugin_and_monochrome_icon(self):
        source = (JAVA / "MainActivity.java").read_text()
        self.assertIn("registerPlugin(PartnerNotificationsPlugin.class)", source)
        self.assertIn("registerPlugin(SunmiPrinterPlugin.class)", source)
        icon = ET.parse(ROOT / "android/app/src/main/res/drawable/ic_partner_notification.xml").getroot()
        self.assertEqual(icon.tag, "vector")
        self.assertEqual(icon.find("path").attrib[ANDROID + "fillColor"], "#FFFFFFFF")

    def test_printer_does_not_start_a_fake_receiver(self):
        source = (JAVA / "SunmiPrinterPlugin.java").read_text()
        self.assertNotIn("PartnerNotificationService.start(", source)
        self.assertIn('result.put("backgroundReceiver", false)', source)

    def test_authenticated_reception_outlives_order_tab(self):
        app = (ROOT / "src/App.tsx").read_text()
        self.assertIn("PartnerKitchenReceptionProvider", app)
        reception = (ROOT / "src/PartnerKitchenReception.tsx").read_text()
        self.assertIn("partnerHeaders(token, locationId)", reception)
        self.assertIn("partnerEventMatchesLocation(event, locationId)", reception)
        self.assertIn("requestRef.current?.abort()", reception)
        self.assertIn("reconcileKitchenOrders(next)", reception)
        self.assertIn("eventVersion.current", reception)
        board = (ROOT / "src/OrdersBoard.tsx").read_text()
        self.assertIn("usePartnerKitchenReception()", board)
        self.assertNotIn("connectPikiRealtime({", board)
        self.assertNotIn("notifyPartnerOrder({", board)

    def test_native_audio_has_no_media_or_web_fallback(self):
        source = (ROOT / "src/PartnerOrderAlarm.tsx").read_text()
        self.assertIn("if (native) return;", source)
        self.assertIn("postPartnerNativeNotice({ ...notice, scope })", source)
        control = (ROOT / "src/PartnerNativeNotificationControl.tsx").read_text()
        self.assertIn("requestNotificationPermission()", control)
        self.assertNotIn("Notification.requestPermission()", control)


if __name__ == "__main__":
    unittest.main()
