package com.leetarena.game;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.content.SharedPreferences;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String WEB_PREFS = "leet-web-update";

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
        if (url == null || url.isEmpty() || version <= 0) {
            call.reject("URL e versão do pacote web são obrigatórias.");
            return;
        }

        call.setKeepAlive(true);
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                File webRoot = new File(getContext().getFilesDir(), "web");
                File target = new File(webRoot, String.valueOf(version));
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

                try (InputStream input = connection.getInputStream()) {
                    unzip(input, target);
                }
                if (!new File(target, "index.html").exists()) {
                    call.reject("Pacote web inválido.");
                    return;
                }

                getContext().getSharedPreferences(WEB_PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putInt("webVersion", version)
                    .putString("basePath", target.getAbsolutePath())
                    .apply();

                if (getActivity() == null) {
                    call.reject("A tela do aplicativo não está disponível para aplicar a atualização.");
                    return;
                }
                getActivity().runOnUiThread(() -> {
                    try {
                        getBridge().setServerBasePath(target.getAbsolutePath());
                        if (getBridge().getWebView() != null) {
                            getBridge().getWebView().clearCache(true);
                            getBridge().getWebView().reload();
                        }
                        JSObject result = new JSObject();
                        result.put("applied", true);
                        call.resolve(result);
                    } catch (Exception error) {
                        call.reject("Não foi possível aplicar o conteúdo atualizado.", error);
                    }
                });
            } catch (Exception error) {
                call.reject("Falha ao instalar a atualização: " + error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private void unzip(InputStream input, File target) throws Exception {
        byte[] buffer = new byte[8192];
        try (ZipInputStream zip = new ZipInputStream(input)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                File output = new File(target, entry.getName());
                String targetPath = target.getCanonicalPath() + File.separator;
                if (!output.getCanonicalPath().startsWith(targetPath)) {
                    throw new SecurityException("Entrada ZIP inválida.");
                }
                if (entry.isDirectory()) {
                    output.mkdirs();
                } else {
                    File parent = output.getParentFile();
                    if (parent != null) parent.mkdirs();
                    try (FileOutputStream stream = new FileOutputStream(output)) {
                        int count;
                        while ((count = zip.read(buffer)) != -1) stream.write(buffer, 0, count);
                    }
                }
                zip.closeEntry();
            }
        }
    }

    private void deleteRecursive(File file) {
        if (!file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursive(child);
        }
        file.delete();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName", "leet-arena-update.apk");
        String expectedSha256 = call.getString("sha256", "");
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
        File tempFile = new File(targetDir, fileName + ".part");
        if (targetFile.exists()) targetFile.delete();
        if (tempFile.exists()) tempFile.delete();
        call.setKeepAlive(true);
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(120000);
                connection.setInstanceFollowRedirects(true);
                connection.setUseCaches(false);
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    call.reject("Servidor respondeu " + status + ".");
                    return;
                }
                long expectedLength = connection.getContentLengthLong();
                long total = 0;
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(tempFile)) {
                    byte[] buffer = new byte[16384];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        output.write(buffer, 0, count);
                        total += count;
                    }
                    output.flush();
                    if (total == 0) throw new IllegalStateException("O servidor enviou um arquivo vazio.");
                }
                if (!tempFile.exists() || total == 0 || (expectedLength > 0 && total != expectedLength)) {
                    tempFile.delete();
                    call.reject("O APK não foi baixado por completo.");
                    return;
                }
                if (!expectedSha256.isEmpty() && !expectedSha256.equalsIgnoreCase(sha256(tempFile))) {
                    tempFile.delete();
                    call.reject("A validação do APK falhou.");
                    return;
                }
                if (!tempFile.renameTo(targetFile) || !targetFile.exists() || targetFile.length() == 0) {
                    tempFile.delete();
                    call.reject("O APK baixado está vazio.");
                    return;
                }
                installApk(targetFile);
                JSObject result = new JSObject();
                result.put("installing", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Falha ao baixar a atualização: " + error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[16384];
        try (InputStream input = new java.io.FileInputStream(file)) {
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder result = new StringBuilder();
        for (byte value : digest.digest()) result.append(String.format("%02x", value));
        return result.toString();
    }

    private void installApk(File apkFile) {
        Uri apkUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apkFile
        );
        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        installIntent.setClipData(android.content.ClipData.newRawUri("APK", apkUri));
        getContext().startActivity(installIntent);
    }
}
