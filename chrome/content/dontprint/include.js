// Only create main object once
if (window.Dontprint === undefined) {
	const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
					.getService(Components.interfaces.mozIJSSubScriptLoader);
	loader.loadSubScript("chrome://dontprint/content/translate.js");
	loader.loadSubScript("chrome://dontprint/content/dontprint.js");
}
