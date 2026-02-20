// Spotify Web API integration with OAuth 2.0 PKCE
// Runs in the browser chrome context via Sine

var SpotifyAPI = (function () {
  "use strict";

  const CLIENT_ID = "9b6ff81687ce4a12951ef2db101ffe07";
  const REDIRECT_URI = "http://localhost:8888/callback";
  const SCOPES = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "user-library-modify",
    "user-library-read",
  ].join(" ");

  const TOKEN_PREF = "mod.spotify-miniplayer.access_token";
  const REFRESH_PREF = "mod.spotify-miniplayer.refresh_token";
  const EXPIRY_PREF = "mod.spotify-miniplayer.token_expiry";
  const VERIFIER_PREF = "mod.spotify-miniplayer.code_verifier";

  const API_BASE = "https://api.spotify.com/v1";
  const AUTH_URL = "https://accounts.spotify.com/authorize";
  const TOKEN_URL = "https://accounts.spotify.com/api/token";

  // --- PKCE Helpers ---

  function generateRandomString(length) {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const values = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values, (v) => possible[v % possible.length]).join("");
  }

  async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return crypto.subtle.digest("SHA-256", data);
  }

  function base64UrlEncode(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = "";
    for (const b of bytes) {
      str += String.fromCharCode(b);
    }
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function generateCodeChallenge(verifier) {
    const hashed = await sha256(verifier);
    return base64UrlEncode(hashed);
  }

  // --- Preference Helpers ---

  function getPref(key) {
    try {
      return Services.prefs.getStringPref(key, "");
    } catch (e) {
      return "";
    }
  }

  function setPref(key, value) {
    Services.prefs.setStringPref(key, value);
  }

  function getIntPref(key) {
    try {
      return Services.prefs.getIntPref(key, 0);
    } catch (e) {
      return 0;
    }
  }

  function setIntPref(key, value) {
    Services.prefs.setIntPref(key, value);
  }

  // --- Token Management ---

  function getAccessToken() {
    return getPref(TOKEN_PREF);
  }

  function isTokenExpired() {
    const expiry = getIntPref(EXPIRY_PREF);
    if (!expiry) return true;
    // Refresh 60 seconds before actual expiry
    return Date.now() / 1000 > expiry - 60;
  }

  async function exchangeCodeForToken(code) {
    const verifier = getPref(VERIFIER_PREF);
    if (!verifier) {
      throw new Error("No PKCE code verifier found. Please re-authenticate.");
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    });

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${err}`);
    }

    const data = await response.json();
    saveTokens(data);
    return data.access_token;
  }

  async function refreshAccessToken() {
    const refreshToken = getPref(REFRESH_PREF);
    if (!refreshToken) {
      throw new Error("No refresh token available. Please re-authenticate.");
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      // Refresh token may be revoked; clear tokens and require re-auth
      clearTokens();
      throw new Error("Token refresh failed. Please re-authenticate.");
    }

    const data = await response.json();
    saveTokens(data);
    return data.access_token;
  }

  function saveTokens(data) {
    setPref(TOKEN_PREF, data.access_token);
    if (data.refresh_token) {
      setPref(REFRESH_PREF, data.refresh_token);
    }
    setIntPref(EXPIRY_PREF, Math.floor(Date.now() / 1000) + data.expires_in);
  }

  function clearTokens() {
    setPref(TOKEN_PREF, "");
    setPref(REFRESH_PREF, "");
    setIntPref(EXPIRY_PREF, 0);
    setPref(VERIFIER_PREF, "");
  }

  // --- Auth Flow ---

  async function startAuth() {
    if (!CLIENT_ID) {
      console.error(
        "[SpotifyMiniPlayer] No Client ID set. Edit JS/spotify-api.js and add your Spotify Developer App Client ID."
      );
      return;
    }

    const verifier = generateRandomString(128);
    setPref(VERIFIER_PREF, verifier);
    const challenge = await generateCodeChallenge(verifier);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge_method: "S256",
      code_challenge: challenge,
    });

    const authUrl = `${AUTH_URL}?${params.toString()}`;

    // Open auth page in a new tab
    const tab = window.gBrowser.addTab(authUrl, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    window.gBrowser.selectedTab = tab;

    // Listen for the redirect
    _listenForAuthCallback(tab);
  }

  function _listenForAuthCallback(tab) {
    const browser = tab.linkedBrowser;

    const listener = {
      onLocationChange(webProgress, request, location) {
        if (!location || !location.spec.startsWith(REDIRECT_URI)) return;

        const url = new URL(location.spec);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        // Remove the listener and close the tab
        browser.removeProgressListener(listener);
        window.gBrowser.removeTab(tab);

        if (error) {
          console.error("[SpotifyMiniPlayer] Auth error:", error);
          if (typeof SpotifyMiniPlayer !== "undefined") {
            SpotifyMiniPlayer.onAuthError(error);
          }
          return;
        }

        if (code) {
          exchangeCodeForToken(code)
            .then(() => {
              console.log("[SpotifyMiniPlayer] Authentication successful!");
              if (typeof SpotifyMiniPlayer !== "undefined") {
                SpotifyMiniPlayer.onAuthSuccess();
              }
            })
            .catch((err) => {
              console.error("[SpotifyMiniPlayer] Token exchange failed:", err);
              if (typeof SpotifyMiniPlayer !== "undefined") {
                SpotifyMiniPlayer.onAuthError(err.message);
              }
            });
        }
      },
      QueryInterface: ChromeUtils.generateQI([
        Ci.nsIWebProgressListener,
        Ci.nsISupportsWeakReference,
      ]),
    };

    browser.addProgressListener(listener, Ci.nsIWebProgress.NOTIFY_LOCATION);
  }

  // --- API Calls ---

  async function getValidToken() {
    if (!getAccessToken()) {
      throw new Error("Not authenticated");
    }
    if (isTokenExpired()) {
      return await refreshAccessToken();
    }
    return getAccessToken();
  }

  async function apiRequest(method, endpoint, body) {
    const token = await getValidToken();
    const options = {
      method: method,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };

    if (body) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, options);

    if (response.status === 401) {
      // Token expired mid-request, try refresh once
      const newToken = await refreshAccessToken();
      options.headers.Authorization = `Bearer ${newToken}`;
      const retryResponse = await fetch(`${API_BASE}${endpoint}`, options);
      if (retryResponse.status === 204) return null;
      if (!retryResponse.ok) throw new Error(`API error: ${retryResponse.status}`);
      return retryResponse.json().catch(() => null);
    }

    if (response.status === 204) return null;
    if (!response.ok) {
      const err = await response.text().catch(() => "");
      throw new Error(`API error: ${response.status} ${err}`);
    }

    return response.json().catch(() => null);
  }

  // --- Public API ---

  return {
    get isAuthenticated() {
      return !!getAccessToken();
    },

    startAuth,
    clearTokens,

    async getPlaybackState() {
      return apiRequest("GET", "/me/player");
    },

    async getCurrentlyPlaying() {
      return apiRequest("GET", "/me/player/currently-playing");
    },

    async play() {
      return apiRequest("PUT", "/me/player/play");
    },

    async pause() {
      return apiRequest("PUT", "/me/player/pause");
    },

    async togglePlayback() {
      const state = await this.getPlaybackState();
      if (!state) return;
      return state.is_playing ? this.pause() : this.play();
    },

    async next() {
      return apiRequest("POST", "/me/player/next");
    },

    async previous() {
      return apiRequest("POST", "/me/player/previous");
    },

    async seek(positionMs) {
      return apiRequest("PUT", `/me/player/seek?position_ms=${positionMs}`);
    },

    async setVolume(volumePercent) {
      const vol = Math.max(0, Math.min(100, Math.round(volumePercent)));
      return apiRequest("PUT", `/me/player/volume?volume_percent=${vol}`);
    },

    async setShuffle(state) {
      return apiRequest("PUT", `/me/player/shuffle?state=${!!state}`);
    },

    async setRepeat(mode) {
      // mode: "off", "track", "context"
      return apiRequest("PUT", `/me/player/repeat?state=${mode}`);
    },

    async toggleShuffle() {
      const state = await this.getPlaybackState();
      if (!state) return;
      return this.setShuffle(!state.shuffle_state);
    },

    async cycleRepeat() {
      const state = await this.getPlaybackState();
      if (!state) return;
      const modes = ["off", "context", "track"];
      const current = modes.indexOf(state.repeat_state);
      const next = modes[(current + 1) % modes.length];
      return this.setRepeat(next);
    },

    async saveTrack(trackId) {
      return apiRequest("PUT", "/me/tracks", { ids: [trackId] });
    },

    async removeTrack(trackId) {
      return apiRequest("DELETE", "/me/tracks", { ids: [trackId] });
    },

    async checkSaved(trackId) {
      const result = await apiRequest("GET", `/me/tracks/contains?ids=${trackId}`);
      return result && result[0];
    },
  };
})();
