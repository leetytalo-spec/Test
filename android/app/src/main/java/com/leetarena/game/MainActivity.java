package com.leetarena.game;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

import java.io.File;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(Bundle savedInstanceState) {
		registerPlugin(ApkUpdaterPlugin.class);
		super.onCreate(savedInstanceState);
		getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
		restoreWebBundle();
	}

	// Carrega o pacote web baixado por OTA, quando existir.
	private void restoreWebBundle() {
		SharedPreferences prefs = getSharedPreferences(ApkUpdaterPlugin.WEB_PREFS, Context.MODE_PRIVATE);
		String basePath = prefs.getString("basePath", null);
		if (basePath == null) return;
		if (!new File(basePath, "index.html").exists()) return;
		getBridge().setServerBasePath(basePath);
	}
}
