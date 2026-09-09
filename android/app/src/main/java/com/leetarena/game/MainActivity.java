package com.leetarena.game;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(Bundle savedInstanceState) {
		registerPlugin(ApkUpdaterPlugin.class);
		super.onCreate(savedInstanceState);
		getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
	}
}
