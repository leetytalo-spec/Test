package com.leetarena.game;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

import java.io.File;

public class MainActivity extends BridgeActivity {
	private static final String WEB_PREFS = "leet-web-update";
	private static final int BUNDLED_WEB_VERSION = 71;

	@Override
	public void onCreate(Bundle savedInstanceState) {
		registerPlugin(ApkUpdaterPlugin.class);
		super.onCreate(savedInstanceState);
		getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

		SharedPreferences prefs = getSharedPreferences(WEB_PREFS, Context.MODE_PRIVATE);
		if (prefs.getInt("webVersion", 0) < BUNDLED_WEB_VERSION) {
			prefs.edit().remove("basePath").putInt("webVersion", BUNDLED_WEB_VERSION).apply();
		}
		String basePath = prefs.getString("basePath", null);
		if (basePath != null) {
			File target = new File(basePath);
			if (target.exists() && new File(target, "index.html").exists()) {
				getBridge().setServerBasePath(basePath);
				if (getBridge().getWebView() != null) {
					getBridge().getWebView().clearCache(true);
					getBridge().getWebView().reload();
				}
			} else {
				prefs.edit().remove("basePath").remove("webVersion").apply();
			}
		}
	}
}
