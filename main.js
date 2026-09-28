/* NewTube landing page: two small progressive enhancements, no dependencies.
   1. Show the latest release and link its arm64-v8a APK directly.
      Any failure (no release yet, rate limit, missing asset, offline) leaves the
      plain "releases/latest" links in place and shows nothing extra.
   2. Copy buttons for the Obtainium URL and the certificate fingerprint. */
(function () {
  "use strict";

  var REPO = "aleixrodriala/newtube";
  // The list endpoint answers 200 with [] while there are no releases, where
  // /releases/latest answers 404 and leaves an error in the console.
  var API = "https://api.github.com/repos/" + REPO + "/releases?per_page=5";
  var DOWNLOAD_PREFIX = "https://github.com/" + REPO + "/releases/download/";
  var CACHE_KEY = "newtube-release-v1";
  var CACHE_TTL = 30 * 60 * 1000;

  function readCache() {
    try {
      var raw = window.sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || Date.now() - entry.t > CACHE_TTL) return null;
      return entry.d;
    } catch (e) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: data }));
    } catch (e) { /* storage unavailable: fine */ }
  }

  // Same choice as GitHub's "latest": the newest release that is neither a draft nor a prerelease.
  function latestOf(list) {
    if (!Array.isArray(list)) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && !list[i].draft && !list[i].prerelease) return list[i];
    }
    return null;
  }

  function pickRelease(json) {
    if (!json || typeof json.tag_name !== "string" || json.draft || json.prerelease) return null;
    var apk = null;
    var assets = Array.isArray(json.assets) ? json.assets : [];
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      if (a && typeof a.name === "string" && /_arm64-v8a\.apk$/i.test(a.name) &&
          typeof a.browser_download_url === "string" &&
          a.browser_download_url.indexOf(DOWNLOAD_PREFIX) === 0) {
        apk = a;
        break;
      }
    }
    return {
      tag: json.tag_name,
      date: typeof json.published_at === "string" ? json.published_at : "",
      url: apk ? apk.browser_download_url : "",
      name: apk ? apk.name : ""
    };
  }

  function applyRelease(r) {
    if (!r || !r.tag) return;
    var version = /^v/i.test(r.tag) ? r.tag : "v" + r.tag;
    var when = r.date ? new Date(r.date) : null;
    var dateText = "";
    if (when && !isNaN(when.getTime())) {
      var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      dateText = when.getUTCDate() + " " + months[when.getUTCMonth()] + " " + when.getUTCFullYear();
    }

    var lines = document.querySelectorAll("[data-release]");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var v = line.querySelector("[data-release-version]");
      var t = line.querySelector("[data-release-date]");
      var sep = line.querySelector("[data-release-sep]");
      if (v) v.textContent = version;
      if (t && dateText) {
        t.textContent = dateText;
        t.setAttribute("datetime", r.date);
      } else {
        if (t) t.remove();
        if (sep) sep.remove();
      }
      line.hidden = false;
    }

    if (r.url) {
      var links = document.querySelectorAll("a[data-apk]");
      for (var j = 0; j < links.length; j++) {
        links[j].href = r.url;
        links[j].setAttribute("title", r.name);
      }
    }
  }

  function loadRelease() {
    var cached = readCache();
    if (cached) { applyRelease(cached); return; }
    if (!window.fetch) return;

    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 6000) : null;

    fetch(API, {
      headers: { Accept: "application/vnd.github+json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (json) {
        var r = pickRelease(latestOf(json));
        if (!r) return;
        writeCache(r);
        applyRelease(r);
      })
      .catch(function () { /* keep the releases/latest links */ })
      .then(function () { if (timer) clearTimeout(timer); });
  }

  function setupCopy() {
    if (!navigator.clipboard || !window.isSecureContext) return;
    var status = document.querySelector("[data-copy-status]");
    var buttons = document.querySelectorAll("[data-copy]");
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        var target = document.getElementById(btn.getAttribute("data-copy"));
        var label = btn.querySelector("span");
        if (!target || !label) return;
        btn.setAttribute("aria-label", "Copy " + (target.id === "cert-sha" ? "certificate fingerprint" : "repository URL"));
        btn.hidden = false;
        var reset = null;
        btn.addEventListener("click", function () {
          navigator.clipboard.writeText(target.textContent.trim()).then(function () {
            label.textContent = "Copied";
            btn.classList.add("is-done");
            if (status) status.textContent = "Copied to the clipboard.";
            clearTimeout(reset);
            reset = setTimeout(function () {
              label.textContent = "Copy";
              btn.classList.remove("is-done");
              if (status) status.textContent = "";
            }, 2000);
          }, function () { /* clipboard refused: nothing to do */ });
        });
      })(buttons[i]);
    }
  }

  loadRelease();
  setupCopy();
})();
