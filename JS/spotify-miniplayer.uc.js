// Spotify Mini-Player — popup UI, drag/snap, pin, toolbar button
// Runs in the browser chrome context via Sine

var SpotifyMiniPlayer = (function () {
  "use strict";

  // --- State ---
  let popup = null;
  let pollInterval = null;
  let currentState = null;
  let isDragging = false;
  let isPinned = false;
  let dragOffset = { x: 0, y: 0 };
  let progressTimer = null;

  // --- Preference Helpers ---

  function getPref(key, fallback) {
    try {
      return Services.prefs.getStringPref(key, fallback || "");
    } catch (e) {
      return fallback || "";
    }
  }

  function getBoolPref(key, fallback) {
    try {
      return Services.prefs.getBoolPref(key, fallback || false);
    } catch (e) {
      return fallback || false;
    }
  }

  function setPref(key, value) {
    Services.prefs.setStringPref(key, value);
  }

  function getControlMode() {
    return getPref("mod.spotify-miniplayer.control_mode", "minimal");
  }

  function isFreeMovement() {
    return getBoolPref("mod.spotify-miniplayer.free_movement", false);
  }

  function getDefaultCorner() {
    return getPref("mod.spotify-miniplayer.default_corner", "bottom-right");
  }

  function getOpacity() {
    return getPref("mod.spotify-miniplayer.opacity", "0.85");
  }

  function getGlassStyle() {
    return getPref("mod.spotify-miniplayer.glass_style", "acrylic");
  }

  function shouldLaunchSpotify() {
    return getBoolPref("mod.spotify-miniplayer.launch_spotify", true);
  }

  // --- SVG Icons ---

  const NS = 'xmlns="http://www.w3.org/2000/svg"';
  const ICONS = {
    play: `<svg ${NS} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg ${NS} viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
    next: `<svg ${NS} viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`,
    prev: `<svg ${NS} viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`,
    shuffle: `<svg ${NS} viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>`,
    repeat: `<svg ${NS} viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`,
    repeatOne: `<svg ${NS} viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>`,
    heart: `<svg ${NS} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    heartFilled: `<svg ${NS} viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    pin: `<svg ${NS} viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>`,
    pinOff: `<svg ${NS} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>`,
    spotify: `<svg ${NS} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
    volume: `<svg ${NS} viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
  };

  // --- UI Creation ---

  function createPopup() {
    if (popup) return;

    popup = document.createXULElement("vbox");
    popup.id = "spotify-miniplayer-popup";
    popup.setAttribute("hidden", "true");

    updatePopupContent();

    // Insert into the browser chrome
    document.getElementById("browser").appendChild(popup);

    // Apply initial position
    applyCornerPosition(getDefaultCorner());

    // Set up preference observer to rebuild UI on mode change
    Services.prefs.addObserver("mod.spotify-miniplayer.control_mode", {
      observe() {
        updatePopupContent();
      },
    });
    Services.prefs.addObserver("mod.spotify-miniplayer.opacity", {
      observe() {
        popup.style.setProperty("--smp-opacity", getOpacity());
      },
    });
    Services.prefs.addObserver("mod.spotify-miniplayer.glass_style", {
      observe() {
        // Remove old glass classes, apply new one
        popup.className = popup.className.replace(/smp-glass-\S+/g, "") + ` smp-glass-${getGlassStyle()}`;
      },
    });
  }

  function updatePopupContent() {
    if (!popup) return;

    const mode = getControlMode();
    popup.innerHTML = "";
    popup.className = `smp-mode-${mode} smp-glass-${getGlassStyle()}`;
    popup.style.setProperty("--smp-opacity", getOpacity());

    if (mode === "embedded") {
      buildEmbeddedMode();
    } else {
      buildPlayerMode(mode === "full");
    }

    // Always add pin button
    const pinBtn = createButton("smp-pin-btn", isPinned ? ICONS.pin : ICONS.pinOff, togglePin);
    pinBtn.title = isPinned ? "Unpin" : "Pin on top";
    popup.appendChild(pinBtn);

    setupDrag();
  }

  async function handlePlayClick() {
    try {
      const state = await SpotifyAPI.getPlaybackState();

      if (state && state.is_playing) {
        // Currently playing — pause
        await SpotifyAPI.pause();
      } else if (state && state.device) {
        // Paused but has an active device — resume
        await SpotifyAPI.play();
      } else if (shouldLaunchSpotify()) {
        // No active device — launch Spotify via URI, then retry play
        launchSpotifyApp();
        // Wait for Spotify to start and register as a device
        let retries = 0;
        const tryPlay = async () => {
          retries++;
          const s = await SpotifyAPI.getPlaybackState();
          if (s && s.device) {
            await SpotifyAPI.play();
            pollSoon();
          } else if (retries < 10) {
            setTimeout(tryPlay, 1500);
          }
        };
        setTimeout(tryPlay, 2000);
        return;
      }
      pollSoon();
    } catch (err) {
      console.warn("[SpotifyMiniPlayer] Play error:", err.message);
      // If no device, try launching Spotify
      if (shouldLaunchSpotify() && err.message.includes("404")) {
        launchSpotifyApp();
      }
    }
  }

  function launchSpotifyApp() {
    try {
      // Open spotify: URI which launches the desktop app
      const uri = Services.io.newURI("spotify:");
      const handler = Cc["@mozilla.org/uriloader/external-protocol-service;1"]
        .getService(Ci.nsIExternalProtocolService);
      handler.loadURI(uri);
    } catch (e) {
      console.warn("[SpotifyMiniPlayer] Could not launch Spotify:", e.message);
      // Fallback: open web player
      window.gBrowser.addTab("https://open.spotify.com", {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
    }
  }

  function buildPlayerMode(isFull) {
    // Album art
    const art = document.createElement("div");
    art.className = "smp-art";
    const artImg = document.createElement("img");
    artImg.className = "smp-art-img";
    artImg.src = "";
    artImg.alt = "";
    art.appendChild(artImg);
    popup.appendChild(art);

    // Track info
    const info = document.createElement("div");
    info.className = "smp-info";
    const trackName = document.createElement("div");
    trackName.className = "smp-track-name";
    trackName.textContent = "Not Playing";
    const artistName = document.createElement("div");
    artistName.className = "smp-artist-name";
    artistName.textContent = "";
    info.appendChild(trackName);
    info.appendChild(artistName);
    popup.appendChild(info);

    // Main controls
    const controls = document.createElement("div");
    controls.className = "smp-controls";

    if (isFull) {
      const shuffleBtn = createButton("smp-shuffle-btn", ICONS.shuffle, () => SpotifyAPI.toggleShuffle().then(pollNow));
      shuffleBtn.title = "Shuffle";
      controls.appendChild(shuffleBtn);
    }

    controls.appendChild(createButton("smp-prev-btn", ICONS.prev, () => SpotifyAPI.previous().then(pollSoon)));
    controls.appendChild(createButton("smp-play-btn", ICONS.play, handlePlayClick));
    controls.appendChild(createButton("smp-next-btn", ICONS.next, () => SpotifyAPI.next().then(pollSoon)));

    if (isFull) {
      const repeatBtn = createButton("smp-repeat-btn", ICONS.repeat, () => SpotifyAPI.cycleRepeat().then(pollNow));
      repeatBtn.title = "Repeat";
      controls.appendChild(repeatBtn);
    }

    popup.appendChild(controls);

    // Progress bar
    const progressWrap = document.createElement("div");
    progressWrap.className = "smp-progress-wrap";
    const progressBar = document.createElement("div");
    progressBar.className = "smp-progress-bar";
    const progressFill = document.createElement("div");
    progressFill.className = "smp-progress-fill";
    progressBar.appendChild(progressFill);
    progressWrap.appendChild(progressBar);

    if (isFull) {
      // Make progress bar seekable
      progressBar.classList.add("smp-seekable");
      progressBar.addEventListener("click", (e) => {
        const rect = progressBar.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        if (currentState && currentState.item) {
          const posMs = Math.round(pct * currentState.item.duration_ms);
          SpotifyAPI.seek(posMs).then(pollSoon);
        }
      });

      // Time labels
      const timeLeft = document.createElement("span");
      timeLeft.className = "smp-time smp-time-current";
      timeLeft.textContent = "0:00";
      const timeRight = document.createElement("span");
      timeRight.className = "smp-time smp-time-duration";
      timeRight.textContent = "0:00";
      progressWrap.insertBefore(timeLeft, progressBar);
      progressWrap.appendChild(timeRight);
    }

    popup.appendChild(progressWrap);

    // Full mode extras: volume + like
    if (isFull) {
      const extras = document.createElement("div");
      extras.className = "smp-extras";

      const likeBtn = createButton("smp-like-btn", ICONS.heart, toggleLike);
      likeBtn.title = "Save to library";
      extras.appendChild(likeBtn);

      const volWrap = document.createElement("div");
      volWrap.className = "smp-volume-wrap";
      const volIcon = document.createElement("span");
      volIcon.className = "smp-volume-icon";
      volIcon.innerHTML = ICONS.volume;
      const volSlider = document.createElement("input");
      volSlider.type = "range";
      volSlider.className = "smp-volume-slider";
      volSlider.min = "0";
      volSlider.max = "100";
      volSlider.value = "50";
      volSlider.addEventListener("input", (e) => {
        SpotifyAPI.setVolume(parseInt(e.target.value));
      });
      volWrap.appendChild(volIcon);
      volWrap.appendChild(volSlider);
      extras.appendChild(volWrap);

      popup.appendChild(extras);
    }

    // Auth overlay (shown when not authenticated)
    const authOverlay = document.createElement("div");
    authOverlay.className = "smp-auth-overlay";
    authOverlay.setAttribute("hidden", "true");
    const authBtn = document.createElement("button");
    authBtn.className = "smp-auth-btn";
    authBtn.textContent = "Connect to Spotify";
    authBtn.addEventListener("click", () => SpotifyAPI.startAuth());
    authOverlay.appendChild(authBtn);
    popup.appendChild(authOverlay);
  }

  function buildEmbeddedMode() {
    const browserEl = document.createXULElement("browser");
    browserEl.setAttribute("type", "content");
    browserEl.setAttribute("remote", "true");
    browserEl.setAttribute("src", "https://open.spotify.com");
    browserEl.className = "smp-embedded-browser";
    popup.appendChild(browserEl);
  }

  function createButton(className, svgContent, onClick) {
    const btn = document.createElement("button");
    btn.className = className;
    btn.innerHTML = svgContent;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  // --- Toolbar Button ---

  function createToolbarButton() {
    if (document.getElementById("spotify-miniplayer-toolbar-btn")) return;

    const btn = document.createXULElement("toolbarbutton");
    btn.id = "spotify-miniplayer-toolbar-btn";
    btn.setAttribute("class", "toolbarbutton-1 chromeclass-toolbar-additional");
    btn.setAttribute("label", "Spotify Mini-Player");
    btn.setAttribute("tooltiptext", "Toggle Spotify Mini-Player");
    btn.addEventListener("command", togglePopup);

    // Insert icon via CSS (see userChrome.css)

    // Add to the nav-bar
    const navBar = document.getElementById("nav-bar-customization-target");
    if (navBar) {
      navBar.appendChild(btn);
    }
  }

  // --- Toggle & Visibility ---

  function togglePopup() {
    if (!popup) {
      createPopup();
    }

    const isHidden = popup.hasAttribute("hidden");
    if (isHidden) {
      showPopup();
    } else {
      hidePopup();
    }
  }

  function showPopup() {
    if (!popup) return;
    popup.removeAttribute("hidden");
    popup.classList.add("smp-visible");

    if (!SpotifyAPI.isAuthenticated) {
      showAuthOverlay();
    } else {
      hideAuthOverlay();
      startPolling();
    }
  }

  function hidePopup() {
    if (!popup) return;
    popup.classList.remove("smp-visible");
    popup.setAttribute("hidden", "true");
    stopPolling();
  }

  function showAuthOverlay() {
    const overlay = popup.querySelector(".smp-auth-overlay");
    if (overlay) overlay.removeAttribute("hidden");
  }

  function hideAuthOverlay() {
    const overlay = popup.querySelector(".smp-auth-overlay");
    if (overlay) overlay.setAttribute("hidden", "true");
  }

  // --- Polling ---

  function startPolling() {
    pollNow();
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(pollNow, 2000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  function pollSoon() {
    // Short delay then poll, for responsive feel after user action
    setTimeout(pollNow, 300);
  }

  async function pollNow() {
    if (!SpotifyAPI.isAuthenticated) return;

    try {
      const state = await SpotifyAPI.getPlaybackState();
      currentState = state;
      updateUI(state);
    } catch (err) {
      console.warn("[SpotifyMiniPlayer] Poll error:", err.message);
      if (err.message.includes("Not authenticated") || err.message.includes("re-authenticate")) {
        showAuthOverlay();
        stopPolling();
      }
    }
  }

  // --- UI Updates ---

  function updateUI(state) {
    if (!popup || getControlMode() === "embedded") return;

    const isFull = getControlMode() === "full";

    // Album art
    const artImg = popup.querySelector(".smp-art-img");
    if (artImg) {
      if (state && state.item && state.item.album && state.item.album.images.length > 0) {
        // Use smallest image that's >= 64px
        const img = state.item.album.images[state.item.album.images.length - 1];
        artImg.src = img.url;
        artImg.alt = state.item.album.name;
      } else {
        artImg.src = "";
        artImg.alt = "";
      }
    }

    // Track info
    const trackEl = popup.querySelector(".smp-track-name");
    const artistEl = popup.querySelector(".smp-artist-name");
    if (trackEl) {
      trackEl.textContent = state && state.item ? state.item.name : "Not Playing";
    }
    if (artistEl) {
      artistEl.textContent =
        state && state.item ? state.item.artists.map((a) => a.name).join(", ") : "";
    }

    // Play/pause icon
    const playBtn = popup.querySelector(".smp-play-btn");
    if (playBtn) {
      playBtn.innerHTML = state && state.is_playing ? ICONS.pause : ICONS.play;
    }

    // Progress
    updateProgress(state);
    startProgressTimer(state);

    if (isFull) {
      // Shuffle state
      const shuffleBtn = popup.querySelector(".smp-shuffle-btn");
      if (shuffleBtn) {
        shuffleBtn.classList.toggle("smp-active", state && state.shuffle_state);
      }

      // Repeat state
      const repeatBtn = popup.querySelector(".smp-repeat-btn");
      if (repeatBtn) {
        if (state && state.repeat_state === "track") {
          repeatBtn.innerHTML = ICONS.repeatOne;
          repeatBtn.classList.add("smp-active");
        } else {
          repeatBtn.innerHTML = ICONS.repeat;
          repeatBtn.classList.toggle("smp-active", state && state.repeat_state === "context");
        }
      }

      // Volume
      const volSlider = popup.querySelector(".smp-volume-slider");
      if (volSlider && state && state.device) {
        volSlider.value = state.device.volume_percent;
      }

      // Like state
      updateLikeButton(state);
    }
  }

  function updateProgress(state) {
    const fill = popup.querySelector(".smp-progress-fill");
    if (!fill) return;

    if (state && state.item) {
      const pct = (state.progress_ms / state.item.duration_ms) * 100;
      fill.style.width = `${pct}%`;
    } else {
      fill.style.width = "0%";
    }

    // Time labels (full mode)
    const timeCurrent = popup.querySelector(".smp-time-current");
    const timeDuration = popup.querySelector(".smp-time-duration");
    if (timeCurrent && state) {
      timeCurrent.textContent = formatTime(state.progress_ms || 0);
    }
    if (timeDuration && state && state.item) {
      timeDuration.textContent = formatTime(state.item.duration_ms);
    }
  }

  function startProgressTimer(state) {
    if (progressTimer) clearInterval(progressTimer);
    if (!state || !state.is_playing || !state.item) return;

    let progressMs = state.progress_ms;
    const durationMs = state.item.duration_ms;
    const startTime = Date.now();

    progressTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const currentProgress = Math.min(progressMs + elapsed, durationMs);
      const pct = (currentProgress / durationMs) * 100;

      const fill = popup.querySelector(".smp-progress-fill");
      if (fill) fill.style.width = `${pct}%`;

      const timeCurrent = popup.querySelector(".smp-time-current");
      if (timeCurrent) timeCurrent.textContent = formatTime(currentProgress);
    }, 250);
  }

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  async function toggleLike() {
    if (!currentState || !currentState.item) return;
    const trackId = currentState.item.id;
    const isSaved = await SpotifyAPI.checkSaved(trackId);
    if (isSaved) {
      await SpotifyAPI.removeTrack(trackId);
    } else {
      await SpotifyAPI.saveTrack(trackId);
    }
    updateLikeButton(currentState);
  }

  async function updateLikeButton(state) {
    const likeBtn = popup.querySelector(".smp-like-btn");
    if (!likeBtn || !state || !state.item) return;

    try {
      const isSaved = await SpotifyAPI.checkSaved(state.item.id);
      likeBtn.innerHTML = isSaved ? ICONS.heartFilled : ICONS.heart;
      likeBtn.classList.toggle("smp-liked", isSaved);
    } catch (e) {
      // Ignore
    }
  }

  // --- Pin ---

  function togglePin() {
    isPinned = !isPinned;
    const pinBtn = popup.querySelector(".smp-pin-btn");
    if (pinBtn) {
      pinBtn.innerHTML = isPinned ? ICONS.pin : ICONS.pinOff;
      pinBtn.title = isPinned ? "Unpin" : "Pin on top";
    }
    popup.classList.toggle("smp-pinned", isPinned);
  }

  // --- Drag & Snap ---

  function setupDrag() {
    if (!popup) return;

    popup.addEventListener("mousedown", onDragStart);
  }

  function onDragStart(e) {
    // Don't drag when clicking buttons, sliders, or the embedded browser
    if (
      e.target.closest("button") ||
      e.target.closest("input") ||
      e.target.closest(".smp-embedded-browser")
    ) {
      return;
    }

    isDragging = true;
    const rect = popup.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;

    popup.classList.add("smp-dragging");
    popup.style.transition = "none";

    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!isDragging || !popup) return;

    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;

    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    popup.style.right = "auto";
    popup.style.bottom = "auto";
  }

  function onDragEnd(e) {
    if (!isDragging) return;
    isDragging = false;

    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    popup.classList.remove("smp-dragging");

    if (isFreeMovement()) {
      // Save free position
      popup.style.transition = "";
      setPref("mod.spotify-miniplayer.pos_x", popup.style.left);
      setPref("mod.spotify-miniplayer.pos_y", popup.style.top);
    } else {
      // Snap to nearest corner
      snapToNearestCorner();
    }
  }

  function snapToNearestCorner() {
    if (!popup) return;

    const rect = popup.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    const isRight = centerX > viewW / 2;
    const isBottom = centerY > viewH / 2;

    let corner;
    if (isBottom && isRight) corner = "bottom-right";
    else if (isBottom && !isRight) corner = "bottom-left";
    else if (!isBottom && isRight) corner = "top-right";
    else corner = "top-left";

    setPref("mod.spotify-miniplayer.default_corner", corner);
    applyCornerPosition(corner);
  }

  function applyCornerPosition(corner) {
    if (!popup) return;

    const margin = 16;

    // Enable spring transition
    popup.style.transition = "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)";

    // Reset positioning
    popup.style.right = "auto";
    popup.style.bottom = "auto";
    popup.style.left = "auto";
    popup.style.top = "auto";

    switch (corner) {
      case "top-left":
        popup.style.left = `${margin}px`;
        popup.style.top = `${margin}px`;
        break;
      case "top-right":
        popup.style.right = `${margin}px`;
        popup.style.top = `${margin}px`;
        break;
      case "bottom-left":
        popup.style.left = `${margin}px`;
        popup.style.bottom = `${margin}px`;
        break;
      case "bottom-right":
      default:
        popup.style.right = `${margin}px`;
        popup.style.bottom = `${margin}px`;
        break;
    }
  }

  // --- Auth Callbacks ---

  function onAuthSuccess() {
    hideAuthOverlay();
    startPolling();
  }

  function onAuthError(error) {
    console.error("[SpotifyMiniPlayer] Auth failed:", error);
    showAuthOverlay();
  }

  // --- Init ---

  function registerHotkey() {
    // Alt+S to toggle the mini-player
    document.addEventListener("keydown", (e) => {
      if (e.altKey && e.key.toLowerCase() === "s" && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        e.preventDefault();
        togglePopup();
      }
    });
  }

  function init() {
    createToolbarButton();
    createPopup();
    registerHotkey();

    // Restore position
    if (isFreeMovement()) {
      const x = getPref("mod.spotify-miniplayer.pos_x", "");
      const y = getPref("mod.spotify-miniplayer.pos_y", "");
      if (x && y) {
        popup.style.left = x;
        popup.style.top = y;
        popup.style.right = "auto";
        popup.style.bottom = "auto";
      }
    }
  }

  // Wait for browser to be ready
  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init, { once: true });
  }

  // Public API (for auth callbacks)
  return {
    togglePopup,
    onAuthSuccess,
    onAuthError,
  };
})();
