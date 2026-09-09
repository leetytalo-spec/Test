package com.leetarena.game;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private long downloadId = -1;
    private PluginCall pendingCall;

    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (completedId != downloadId || pendingCall == null) return;
            try {
                context.unregisterReceiver(this);
            } catch (IllegalArgumentException ignored) {}
            finishDownload(context);
        }
    };

    @PluginMethod
    public void getVersionInfo(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
            result.put("versionCode", versionCode);
            result.put("versionName", info.versionName);
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException e) {
            call.reject("Não foi possível ler a versão instalada.", e);
        }
    }

    @PluginMethod
    public void canRequestInstall(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject result = new JSObject();
        result.put("allowed", allowed);
        call.resolve(result);
    }

    @PluginMethod
    public void requestInstallPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(
                android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            getActivity().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName", "leet-arena-update.apk");
        if (url == null || url.isEmpty()) {
            call.reject("URL do pacote de atualização é obrigatória.");
            return;
        }

        File targetDir = getContext().getExternalFilesDir(null);
        if (targetDir == null) {
            call.reject("Armazenamento indisponível para baixar a atualização.");
            return;
        }
        File targetFile = new File(targetDir, fileName);
        if (targetFile.exists()) targetFile.delete();

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle("Atualizando Leet Arena");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationUri(Uri.fromFile(targetFile));
        request.setMimeType("application/vnd.android.package-archive");

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("Serviço de download indisponível.");
            return;
        }

        call.setKeepAlive(true);
        pendingCall = call;
        downloadId = manager.enqueue(request);
        ContextCompat.registerReceiver(
            getContext(),
            downloadReceiver,
            new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    private void finishDownload(Context context) {
        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        PluginCall call = pendingCall;
        pendingCall = null;
        if (manager == null || call == null) return;

        try (Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                call.reject("Não foi possível verificar o download.");
                return;
            }
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                call.reject("Falha ao baixar a atualização.");
                return;
            }
            String localUriString = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI));
            File apkFile = new File(Uri.parse(localUriString).getPath());
            installApk(apkFile);
            JSObject result = new JSObject();
            result.put("installing", true);
            call.resolve(result);
        }
    }

    private void installApk(File apkFile) {
        Uri apkUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apkFile
        );
        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(installIntent);
    }
}
