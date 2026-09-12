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
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import org.json.JSONObject;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String WEB_PREFS = "leet-web-update";
    private static final String AUTH_BASE_URL = "https://leetarena.tech/media";

    @PluginMethod
    public void mediaManifest(PluginCall call) {
        call.setKeepAlive(true);
        new Thread(() -> {
            try {
                JSObject source = new JSObject(readUrl(AUTH_BASE_URL + "/manifest.json"));
                JSObject localManifest = new JSObject();
                File cacheRoot = new File(getContext().getFilesDir(), "game-media");
                if (!cacheRoot.exists() && !cacheRoot.mkdirs()) {
                    throw new IllegalStateException("Não foi possível preparar o cache de imagens.");
                }

                Iterator<String> characters = source.keys();
                while (characters.hasNext()) {
                    String character = characters.next();
                    JSONObject entries = source.optJSONObject(character);
                    if (entries == null) continue;
                    JSObject localEntries = new JSObject();
                    Iterator<String> abilities = entries.keys();
                    while (abilities.hasNext()) {
                        String ability = abilities.next();
                        String relativePath = entries.optString(ability, "");
                        if (!relativePath.matches("^/[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$")) continue;
                        File target = new File(cacheRoot, character + "-" + new File(relativePath).getName());
                        downloadFile(AUTH_BASE_URL + relativePath, target);
                        localEntries.put(ability, Uri.fromFile(target).toString());
                    }
                    localManifest.put(character, localEntries);
                }
                call.resolve(localManifest);
            } catch (Exception error) {
                call.reject("Falha ao carregar as imagens do jogo: " + error.getMessage(), error);
            }
        }).start();
    }

    private String readUrl(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setUseCaches(false);
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("Servidor respondeu " + status + ".");
            return readText(connection.getInputStream());
        } finally {
            connection.disconnect();
        }
    }

    private void downloadFile(String url, File target) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        File temporary = new File(target.getAbsolutePath() + ".part");
        try {
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(60000);
            connection.setUseCaches(false);
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("Servidor respondeu " + status + ".");
            long contentLength = connection.getContentLengthLong();
            if (target.exists() && target.length() > 0 && contentLength > 0 && target.length() == contentLength) return;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temporary)) {
                byte[] buffer = new byte[16384];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            }
            if (temporary.length() == 0 || (!temporary.renameTo(target) && !target.exists())) {
                throw new IllegalStateException("Imagem recebida incompleta.");
            }
        } finally {
            connection.disconnect();
            if (temporary.exists()) temporary.delete();
        }
    }

    @PluginMethod
    public void authRequest(PluginCall call) {
        String path = call.getString("path", "");
        String method = call.getString("method", "GET");
        String token = call.getString("token", "");
        String body = call.getString("body", "");
        if (!path.matches("^/(auth/(login|register|session|logout)|admin/session)$")) {
            call.reject("Rota de autenticação inválida.");
            return;
        }

        call.setKeepAlive(true);
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(AUTH_BASE_URL + path).openConnection();
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(30000);
                connection.setRequestMethod(method);
                connection.setRequestProperty("Accept", "application/json");
                connection.setUseCaches(false);
                if (!token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
                if (!body.isEmpty()) {
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/json");
                    try (OutputStream output = connection.getOutputStream()) {
                        output.write(body.getBytes(StandardCharsets.UTF_8));
                    }
                }

                int status = connection.getResponseCode();
                InputStream responseStream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                String responseBody = responseStream == null ? "" : readText(responseStream);
                JSObject result = new JSObject();
                result.put("status", status);
                result.put("body", responseBody);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Falha na conexão com o servidor: " + error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private String readText(InputStream input) throws Exception {
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = stream.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

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
