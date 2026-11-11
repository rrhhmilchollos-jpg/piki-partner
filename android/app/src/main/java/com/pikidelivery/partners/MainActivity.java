package com.pikidelivery.partners;

import android.os.Bundle;
import androidx.annotation.Nullable;
import com.getcapacitor.BridgeActivity;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

public class MainActivity extends BridgeActivity {
    private static final int APP_UPDATE_REQUEST_CODE = 17001;
    private AppUpdateManager appUpdateManager;

    @Override public void onCreate(@Nullable Bundle savedInstanceState) {
        registerPlugin(SunmiPrinterPlugin.class);
        registerPlugin(PartnerNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        appUpdateManager = AppUpdateManagerFactory.create(this);
        checkForUpdate();
    }
    @Override public void onResume() { super.onResume(); if (appUpdateManager == null) return; appUpdateManager.getAppUpdateInfo().addOnSuccessListener(info -> { if (info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) startImmediateUpdate(info); }); }
    private void checkForUpdate() { appUpdateManager.getAppUpdateInfo().addOnSuccessListener(info -> { if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) startImmediateUpdate(info); }); }
    private void startImmediateUpdate(AppUpdateInfo info) { try { appUpdateManager.startUpdateFlowForResult(info, AppUpdateType.IMMEDIATE, this, APP_UPDATE_REQUEST_CODE); } catch (Exception ignored) { /* Play Store no disponible: continuar operando. */ } }
}
