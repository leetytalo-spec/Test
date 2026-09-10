package com.leetarena.game;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FilterInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    public static final String WEB_PREFS = "leet_web_update";

    private long downloadId = -1;
    private PluginCall pendingCall;
    private boolean downloadFinished;
    private final Handler progressHandler = new Handler(Looper.getMainLooper());
    private Runnable progressRunnable;

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
    public void getUpdateManifest(PluginCall call) {
        String manifestUrl = call.getString("url");
        if (manifestUrl == null || manifestUrl.isEmpty()) {
            call.reject("URL do manifesto é obrigatória.");
            return;
        }

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(manifestUrl).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);
                connection.setRequestProperty("Accept", "application/json");
                connection.setUseCaches(false);

                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    call.reject("Servidor de atualização respondeu " + status + ".");
                    return;
                }

                InputStream input = connection.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8));
                StringBuilder body = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
                reader.close();

                JSONObject manifest = new JSONObject(body.toString());
                JSObject result = new JSObject();
                result.put("versionCode", manifest.getLong("versionCode"));
                result.put("versionName", manifest.getString("versionName"));
                result.put("notes", manifest.optString("notes", ""));
                result.put("sha256", manifest.optString("sha256", ""));
                result.put("downloadUrl", manifest.getString("downloadUrl"));
                result.put("publishedAt", manifest.optString("publishedAt", ""));
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Falha ao acessar o servidor de atualização: " + error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void getWebVersion(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(WEB_PREFS, Context.MODE_PRIVATE);
        JSObject result = new JSObject();
        result.put("webVersion", prefs.getInt("webVersion", 0));
        call.resolve(result);
    }

    @PluginMethod
    public void installWebUpdate(PluginCall call) {
        String url = call.getString("url");
        int version = call.getInt("version", 0);
        if (url == null || url.isEmpty()) {
            call.reject("URL do pacote web é obrigatória.");
            return;
        }

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                File target = new File(new File(getContext().getFilesDir(), "web"), String.valueOf(version));
                deleteRecursive(target);
                if (!target.mkdirs()) throw new IllegalStateException("Não foi possível preparar o destino.");

                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(60000);
                connection.setUseCaches(false);

                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    call.reject("Servidor respondeu " + status + ".");
                    return;
                }

                long total = connection.getContentLengthLong();
                InputStream progressStream = new ProgressInputStream(connection.getInputStream(), total, this::emitDownloadProgress);
                unzip(progressStream, target);
                emitDownloadProgress(total > 0 ? total : 1, total > 0 ? total : 1);
                if (!new File(target, "index.html").exists()) {
                    call.reject("Pacote web inválido.");
                    return;
                }

                getContext()
                    .getSharedPreferences(WEB_PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putInt("webVersion", version)
                    .putString("basePath", target.getAbsolutePath())
                    .apply();

                JSObject result = new JSObject();
                result.put("applied", true);
                call.resolve(result);

                if (getActivity() != null) {
                    getActivity().runOnUiThread(() -> getBridge().setServerBasePath(target.getAbsolutePath()));
                }
            } catch (Exception error) {
                call.reject("Falha ao instalar a atualização: " + error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private void unzip(InputStream input, File targetDir) throws Exception {
        String root = targetDir.getCanonicalPath();
        byte[] buffer = new byte[8192];
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(input))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                File outFile = new File(targetDir, entry.getName());
                String outPath = outFile.getCanonicalPath();
                if (!outPath.equals(root) && !outPath.startsWith(root + File.separator)) {
                    throw new SecurityException("Entrada inválida no pacote web.");
                }
                if (entry.isDirectory()) {
                    outFile.mkdirs();
                } else {
                    File parent = outFile.getParentFile();
                    if (parent != null) parent.mkdirs();
                    try (FileOutputStream out = new FileOutputStream(outFile)) {
                        int read;
                        while ((read = zip.read(buffer)) != -1) out.write(buffer, 0, read);
                    }
                }
                zip.closeEntry();
            }
        }
    }

    private void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteRecursive(child);
        }
        file.delete();
    }

    private void emitDownloadProgress(long downloaded, long total) {
        JSObject data = new JSObject();
        data.put("downloaded", downloaded);
        data.put("total", total);
        data.put("percent", total > 0 ? Math.min(100.0, downloaded * 100.0 / total) : 0);
        notifyListeners("downloadProgress", data);
    }

    private interface ProgressCallback {
        void onProgress(long downloaded, long total);
    }

    private static class ProgressInputStream extends FilterInputStream {
        private final long total;
        private final ProgressCallback callback;
        private long downloaded = 0;
        private long lastEmitAt = 0;

        ProgressInputStream(InputStream in, long total, ProgressCallback callback) {
            super(in);
            this.total = total;
            this.callback = callback;
        }

        @Override
        public int read() throws java.io.IOException {
            int b = super.read();
            if (b != -1) track(1);
            return b;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws java.io.IOException {
            int read = super.read(buffer, offset, length);
            if (read > 0) track(read);
            return read;
        }

        private void track(int read) {
            downloaded += read;
            long now = System.currentTimeMillis();
            if (now - lastEmitAt >= 200) {
                lastEmitAt = now;
                callback.onProgress(downloaded, total);
            }
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
        downloadFinished = false;
        downloadId = manager.enqueue(request);
        ContextCompat.registerReceiver(
            getContext(),
            downloadReceiver,
            new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
        startProgressPolling(manager);
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        call.resolve();
        if (getActivity() != null) getActivity().finishAffinity();
        android.os.Process.killProcess(android.os.Process.myPid());
    }

    private void startProgressPolling(DownloadManager manager) {
        progressRunnable = new Runnable() {
            @Override
            public void run() {
                DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
                try (Cursor cursor = manager.query(query)) {
                    if (cursor == null || !cursor.moveToFirst()) return;
                    int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    long downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    JSObject data = new JSObject();
                    data.put("downloaded", downloaded);
                    data.put("total", total);
                    data.put("percent", total > 0 ? Math.min(100.0, downloaded * 100.0 / total) : 0);
                    notifyListeners("downloadProgress", data);
                    if (status == DownloadManager.STATUS_SUCCESSFUL || status == DownloadManager.STATUS_FAILED) {
                        finishDownload(getContext());
                        return;
                    }
                    if (status == DownloadManager.STATUS_RUNNING || status == DownloadManager.STATUS_PENDING) {
                        progressHandler.postDelayed(this, 300);
                    }
                }
            }
        };
        progressHandler.post(progressRunnable);
    }

    private void finishDownload(Context context) {
        if (downloadFinished) return;
        downloadFinished = true;
        if (progressRunnable != null) progressHandler.removeCallbacks(progressRunnable);
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
                int reason = cursor.getColumnIndex(DownloadManager.COLUMN_REASON) >= 0
                    ? cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
                    : -1;
                call.reject("Falha ao baixar a atualização (código " + reason + ").");
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
