// Constants for configuration
const CONFIG = {
  MAX_RECENT_CHANNELS: 10,
  DEFAULT_THEME_COLOR: "#0057b8",
  DEBOUNCE_DELAY: 300,
  DEFAULT_LANGUAGE: "English",
};

// Main application class
class LiveTVPlatform {
  constructor() {
    this.channelManager = new ChannelManager();
    this.userPreferences = new UserPreferences();
    this.playerManager = new PlayerManager();
    this.uiManager = new UIManager(this);

    this.initialize();
  }

  async initialize() {
    await this.channelManager.loadChannelData();
    this.userPreferences.loadPreferences();
    this.uiManager.initializeUI();
    this.setupEventListeners();
  }

  setupEventListeners() {
    window.addEventListener("load", () => {
      this.uiManager.applyTheme(this.userPreferences.getPreference("theme"));
    });
  }
}

// Channel Management
class ChannelManager {
  constructor() {
    this.channels = [];
    this.currentChannel = null;
    this.favorites = this.loadFromStorage("favorites") || [];
    this.recentlyWatched = this.loadFromStorage("recentlyWatched") || [];
  }

  
  async loadChannelData() {
        try {
            const response = await fetch('channels.json');
            if (!response.ok) throw new Error('Failed to fetch channel data');
            this.channels = await response.json();
            return this.channels;
        } catch (error) {
            console.error('Error loading channel data:', error);
            throw error;
        }
    } 
  
  getChannelById(id) {
    return this.channels.find((channel) => channel.id === id);
  }

  toggleFavorite(channelId) {
    const index = this.favorites.findIndex((id) => id === channelId);
    if (index === -1) {
      this.favorites.push(channelId);
    } else {
      this.favorites.splice(index, 1);
    }
    this.saveToStorage("favorites", this.favorites);
    return this.favorites.includes(channelId);
  }

  addToRecentlyWatched(channelId) {
    this.recentlyWatched = this.recentlyWatched.filter(
      (id) => id !== channelId,
    );
    this.recentlyWatched.unshift(channelId);

    if (this.recentlyWatched.length > CONFIG.MAX_RECENT_CHANNELS) {
      this.recentlyWatched.pop();
    }

    this.saveToStorage("recentlyWatched", this.recentlyWatched);
  }

  getCurrentProgram(schedule) {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    return schedule.find((slot, index) => {
      const [hours, minutes] = slot.time.split(":").map(Number);
      const slotTime = hours * 60 + minutes;
      const nextSlot = schedule[index + 1];

      if (!nextSlot) return slotTime <= currentTime;

      const [nextHours, nextMinutes] = nextSlot.time.split(":").map(Number);
      const nextSlotTime = nextHours * 60 + nextMinutes;

      return slotTime <= currentTime && currentTime < nextSlotTime;
    });
  }

  filterChannels(filters) {
    return this.channels.filter((channel) => {
      const matchesSearch =
        !filters.search ||
        channel.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        channel.description
          .toLowerCase()
          .includes(filters.search.toLowerCase());

      const matchesLanguage =
        !filters.language || channel.language.includes(filters.language);

      const matchesCategory =
        !filters.category || channel.category === filters.category;

      return matchesSearch && matchesLanguage && matchesCategory;
    });
  }

  saveToStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error("Error saving to localStorage:", error);
    }
  }

  loadFromStorage(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (error) {
      console.error("Error loading from localStorage:", error);
      return null;
    }
  }
}

// User Preferences Management
class UserPreferences {
  constructor() {
    this.preferences = {
      theme: {
        mode: "light",
        color: CONFIG.DEFAULT_THEME_COLOR,
        fontSize: "medium",
      },
      language: CONFIG.DEFAULT_LANGUAGE,
      savedFilters: [],
      accessibility: {
        highContrast: false,
        subtitles: false,
      },
      notifications: {
        programStart: true,
        favoriteUpdates: true,
      },
    };
    this.loadPreferences();
  }

  loadPreferences() {
    const saved = localStorage.getItem("userPreferences");
    if (saved) {
      this.preferences = { ...this.preferences, ...JSON.parse(saved) };
    }
  }

  savePreferences() {
    localStorage.setItem("userPreferences", JSON.stringify(this.preferences));
  }

  getPreference(key) {
    return this.preferences[key];
  }

  setPreference(key, value) {
    this.preferences[key] = value;
    this.savePreferences();
  }

  addSavedFilter(filter) {
    this.preferences.savedFilters.push(filter);
    this.savePreferences();
  }

  removeSavedFilter(filterId) {
    this.preferences.savedFilters = this.preferences.savedFilters.filter(
      (filter) => filter.id !== filterId,
    );
    this.savePreferences();
  }
}

// Video Player Management
class PlayerManager {
  constructor() {
    this.currentPlayer = null;
    this.hlsInstance = null;
  }

  initializePlayer(channel) {
    const playerContainer = document.getElementById("videoPlayer");
    playerContainer.innerHTML = "";

    if (channel.type === "m3u8") {
      return this.initializeHLSPlayer(channel.videoLink, playerContainer);
    } else if (channel.type === "youtube") {
      return this.initializeYoutubePlayer(channel.videoLink, playerContainer);
    }
  }

  initializeHLSPlayer(videoLink, container) {
    if (this.hlsInstance) {
      this.hlsInstance.destroy();
    }

    const video = document.createElement("video");
    video.controls = true;
    video.classList.add("video-player");
    container.appendChild(video);

    if (Hls.isSupported()) {
      this.hlsInstance = new Hls();
      this.hlsInstance.loadSource(videoLink);
      this.hlsInstance.attachMedia(video);
      this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play();
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = videoLink;
      video.addEventListener("loadedmetadata", () => {
        video.play();
      });
    }

    this.currentPlayer = video;
    return video;
  }

  initializeYoutubePlayer(videoLink, container) {
    const videoId = this.getYoutubeId(videoLink);
    const iframe = document.createElement("iframe");

    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.classList.add("youtube-player");

    container.appendChild(iframe);
    this.currentPlayer = iframe;
    return iframe;
  }

  getYoutubeId(url) {
    const regExp =
      /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[7].length === 11 ? match[7] : false;
  }

  setVolume(volume) {
    if (this.currentPlayer && this.currentPlayer.tagName === "VIDEO") {
      this.currentPlayer.volume = volume;
    }
  }

  toggleMute() {
    if (this.currentPlayer && this.currentPlayer.tagName === "VIDEO") {
      this.currentPlayer.muted = !this.currentPlayer.muted;
    }
  }
}

// UI Management
class UIManager {
  constructor(platform) {
    this.platform = platform;
    this.searchDebounceTimer = null;
  }

  initializeUI() {
    this.createMainLayout();
    this.setupEventListeners();
    this.renderChannelGrid(this.platform.channelManager.channels);
  }

  createMainLayout() {
    document.body.innerHTML = `
            <div class="tv-platform">
                <header class="header">
                    <div class="search-container">
                        <input type="text" id="searchInput" placeholder="Search channels...">
                        <select id="languageFilter">
                            <option value="">All Languages</option>
                            ${this.generateLanguageOptions()}
                        </select>
                        <select id="categoryFilter">
                            <option value="">All Categories</option>
                            ${this.generateCategoryOptions()}
                        </select>
                    </div>
                    <div class="user-controls">
                        <button id="themeToggle">🌓</button>
                        <button id="preferencesButton">⚙️</button>
                    </div>
                </header>
                
                <div class="main-content">
                    <nav class="sidebar">
                        <div class="nav-section">
                            <h3>Categories</h3>
                            <div id="categoryList"></div>
                        </div>
                        <div class="nav-section">
                            <h3>Favorites</h3>
                            <div id="favoritesList"></div>
                        </div>
                        <div class="nav-section">
                            <h3>Recently Watched</h3>
                            <div id="recentList"></div>
                        </div>
                    </nav>
                    
                    <main class="content">
                        <div id="playerContainer" class="hidden">
                            <div id="videoPlayer"></div>
                            <div id="programInfo"></div>
                        </div>
                        <div id="channelGrid"></div>
                    </main>
                </div>
            </div>
            ${this.createPreferencesPanel()}
        `;
  }

  setupEventListeners() {
    // Search and filter listeners
    document
      .getElementById("searchInput")
      .addEventListener("input", (e) => this.debounceSearch(e.target.value));

    document
      .getElementById("languageFilter")
      .addEventListener("change", (e) => this.applyFilters());

    document
      .getElementById("categoryFilter")
      .addEventListener("change", (e) => this.applyFilters());

    // Theme toggle
    document
      .getElementById("themeToggle")
      .addEventListener("click", () => this.toggleTheme());

    // Preferences panel
    document
      .getElementById("preferencesButton")
      .addEventListener("click", () => this.togglePreferencesPanel());
  }

  renderChannelGrid(channels) {
    const grid = document.getElementById("channelGrid");
    grid.innerHTML = "";

    channels.forEach((channel) => {
      const card = this.createChannelCard(channel);
      grid.appendChild(card);
    });
  }

  createChannelCard(channel) {
    const currentProgram = this.platform.channelManager.getCurrentProgram(
      channel.schedule,
    );
    const isFavorite = this.platform.channelManager.favorites.includes(
      channel.id,
    );

    const card = document.createElement("div");
    card.className = "channel-card";
    card.innerHTML = `
            <div class="channel-thumbnail">
                <img src="${channel.image}" alt="${channel.name}">
                <button class="play-button">▶</button>
            </div>
            <div class="channel-info">
                <h3>${channel.name}</h3>
                <p>${channel.description}</p>
                <div class="language-tags">
                    ${channel.language
                      .map(
                        (lang) => `<span class="language-tag">${lang}</span>`,
                      )
                      .join("")}
                </div>
                <div class="now-playing">
                    Now Playing: ${currentProgram?.program || "No program info"}
                </div>
                <button class="favorite-button ${isFavorite ? "active" : ""}">
                    ${isFavorite ? "❤️" : "🤍"}
                </button>
            </div>
        `;

    // Add event listeners
    card
      .querySelector(".play-button")
      .addEventListener("click", () => this.playChannel(channel));

    card.querySelector(".favorite-button").addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleFavorite(channel);
    });

    return card;
  }

  playChannel(channel) {
    this.platform.channelManager.currentChannel = channel;
    this.platform.channelManager.addToRecentlyWatched(channel.id);
    this.platform.playerManager.initializePlayer(channel);
    this.updateProgramInfo(channel);
    this.showPlayerContainer();
    this.applyChannelTheme(channel.themeColor);
  }

  updateProgramInfo(channel) {
    const programInfo = document.getElementById("programInfo");
    const currentProgram = this.platform.channelManager.getCurrentProgram(
      channel.schedule,
    );

    programInfo.innerHTML = `
            <h2>${channel.name}</h2>
            <p class="now-playing">Now Playing: ${currentProgram?.program}</p>
            <div class="schedule">
                <h3>Today's Schedule</h3>
                ${this.renderSchedule(channel.schedule)}
            </div>
        `;
  }

  renderSchedule(schedule) {
    return `
            <div class="schedule-list">
                ${schedule
                  .map(
                    (slot) => `
                    <div class="schedule-item">
                        <span class="time">${slot.time}</span>
                        <span class="program">${slot.program}</span>
                    </div>
                `,
                  )
                  .join("")}
            </div>
        `;
  }

  toggleFavorite(channel) {
    const isFavorite = this.platform.channelManager.toggleFavorite(channel.id);
    this.updateFavoritesList();
    this.updateChannelCard(channel.id, isFavorite);
  }

  updateChannelCard(channelId, isFavorite) {
    const card = document.querySelector(`[data-channel-id="${channelId}"]`);
    if (card) {
      const favoriteButton = card.querySelector(".favorite-button");
      favoriteButton.textContent = isFavorite ? "❤️" : "🤍";
      favoriteButton.classList.toggle("active", isFavorite);
    }
  }

  debounceSearch(searchTerm) {
    clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.applyFilters({ search: searchTerm });
    }, CONFIG.DEBOUNCE_DELAY);
  }

  applyFilters(additionalFilters = {}) {
    const searchTerm = document.getElementById("searchInput").value;
    const language = document.getElementById("languageFilter").value;
    const category = document.getElementById("categoryFilter").value;

    const filters = {
      search: searchTerm,
      language: language,
      category: category,
      ...additionalFilters,
    };

    const filteredChannels = this.platform.channelManager.filterChannels(filters);
    this.renderChannelGrid(filteredChannels);
  }

  generateLanguageOptions() {
    const languages = [...new Set(this.platform.channelManager.channels.flatMap(channel => channel.language))];
    return languages
      .map(lang => `<option value="${lang}">${lang}</option>`)
      .join("");
  }

  generateCategoryOptions() {
    const categories = [...new Set(this.platform.channelManager.channels.map(channel => channel.category))];
    return categories
      .map(category => `<option value="${category}">${category}</option>`)
      .join("");
  }

  updateFavoritesList() {
    const favoritesList = document.getElementById("favoritesList");
    const favorites = this.platform.channelManager.favorites
      .map(id => this.platform.channelManager.getChannelById(id))
      .filter(Boolean);

    favoritesList.innerHTML = favorites
      .map(channel => `
        <div class="sidebar-item" data-channel-id="${channel.id}">
          <img src="${channel.image}" alt="${channel.name}" class="sidebar-thumbnail">
          <span>${channel.name}</span>
        </div>
      `)
      .join("");

    // Add click listeners to favorite items
    favoritesList.querySelectorAll('.sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        const channelId = item.dataset.channelId;
        const channel = this.platform.channelManager.getChannelById(channelId);
        this.playChannel(channel);
      });
    });
  }

  updateRecentList() {
    const recentList = document.getElementById("recentList");
    const recentChannels = this.platform.channelManager.recentlyWatched
      .map(id => this.platform.channelManager.getChannelById(id))
      .filter(Boolean);

    recentList.innerHTML = recentChannels
      .map(channel => `
        <div class="sidebar-item" data-channel-id="${channel.id}">
          <img src="${channel.image}" alt="${channel.name}" class="sidebar-thumbnail">
          <span>${channel.name}</span>
        </div>
      `)
      .join("");

    // Add click listeners to recent items
    recentList.querySelectorAll('.sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        const channelId = item.dataset.channelId;
        const channel = this.platform.channelManager.getChannelById(channelId);
        this.playChannel(channel);
      });
    });
  }

  showPlayerContainer() {
    const playerContainer = document.getElementById("playerContainer");
    const channelGrid = document.getElementById("channelGrid");
    
    playerContainer.classList.remove("hidden");
    channelGrid.classList.add("hidden");
  }

  hidePlayerContainer() {
    const playerContainer = document.getElementById("playerContainer");
    const channelGrid = document.getElementById("channelGrid");
    
    playerContainer.classList.add("hidden");
    channelGrid.classList.remove("hidden");
  }

  toggleTheme() {
    const currentTheme = this.platform.userPreferences.getPreference("theme");
    const newMode = currentTheme.mode === "light" ? "dark" : "light";
    
    this.platform.userPreferences.setPreference("theme", {
      ...currentTheme,
      mode: newMode
    });
    
    this.applyTheme(this.platform.userPreferences.getPreference("theme"));
  }

  applyTheme(theme) {
    document.body.classList.remove("light-mode", "dark-mode");
    document.body.classList.add(`${theme.mode}-mode`);
    
    document.documentElement.style.setProperty('--theme-color', theme.color);
    document.documentElement.style.setProperty('--font-size', theme.fontSize);
  }

  applyChannelTheme(themeColor) {
    const currentTheme = this.platform.userPreferences.getPreference("theme");
    this.platform.userPreferences.setPreference("theme", {
      ...currentTheme,
      color: themeColor || CONFIG.DEFAULT_THEME_COLOR
    });
    
    this.applyTheme(this.platform.userPreferences.getPreference("theme"));
  }

  createPreferencesPanel() {
    return `
      <div id="preferencesPanel" class="preferences-panel hidden">
        <div class="preferences-content">
          <h2>Preferences</h2>
          
          <section class="preference-section">
            <h3>Appearance</h3>
            <div class="preference-item">
              <label for="fontSize">Font Size:</label>
              <select id="fontSize">
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div class="preference-item">
              <label for="themeColor">Theme Color:</label>
              <input type="color" id="themeColor" value="${CONFIG.DEFAULT_THEME_COLOR}">
            </div>
          </section>

          <section class="preference-section">
            <h3>Accessibility</h3>
            <div class="preference-item">
              <label>
                <input type="checkbox" id="highContrast">
                High Contrast Mode
              </label>
            </div>
            <div class="preference-item">
              <label>
                <input type="checkbox" id="subtitles">
                Enable Subtitles
              </label>
            </div>
          </section>

          <section class="preference-section">
            <h3>Notifications</h3>
            <div class="preference-item">
              <label>
                <input type="checkbox" id="programStart">
                Program Start Alerts
              </label>
            </div>
            <div class="preference-item">
              <label>
                <input type="checkbox" id="favoriteUpdates">
                Favorite Channel Updates
              </label>
            </div>
          </section>

          <div class="preference-actions">
            <button id="savePreferences">Save</button>
            <button id="cancelPreferences">Cancel</button>
          </div>
        </div>
      </div>
    `;
  }

  togglePreferencesPanel() {
    const panel = document.getElementById("preferencesPanel");
    panel.classList.toggle("hidden");

    if (!panel.classList.contains("hidden")) {
      this.loadPreferencesValues();
      this.setupPreferencesEventListeners();
    }
  }

  loadPreferencesValues() {
    const preferences = this.platform.userPreferences.preferences;
    
    document.getElementById("fontSize").value = preferences.theme.fontSize;
    document.getElementById("themeColor").value = preferences.theme.color;
    document.getElementById("highContrast").checked = preferences.accessibility.highContrast;
    document.getElementById("subtitles").checked = preferences.accessibility.subtitles;
    document.getElementById("programStart").checked = preferences.notifications.programStart;
    document.getElementById("favoriteUpdates").checked = preferences.notifications.favoriteUpdates;
  }

  setupPreferencesEventListeners() {
    document.getElementById("savePreferences").addEventListener("click", () => {
      this.savePreferencesValues();
      this.togglePreferencesPanel();
    });

    document.getElementById("cancelPreferences").addEventListener("click", () => {
      this.togglePreferencesPanel();
    });
  }

  savePreferencesValues() {
    const newPreferences = {
      theme: {
        ...this.platform.userPreferences.preferences.theme,
        fontSize: document.getElementById("fontSize").value,
        color: document.getElementById("themeColor").value
      },
      accessibility: {
        highContrast: document.getElementById("highContrast").checked,
        subtitles: document.getElementById("subtitles").checked
      },
      notifications: {
        programStart: document.getElementById("programStart").checked,
        favoriteUpdates: document.getElementById("favoriteUpdates").checked
      }
    };

    Object.entries(newPreferences).forEach(([key, value]) => {
      this.platform.userPreferences.setPreference(key, value);
    });

    this.applyTheme(newPreferences.theme);
  }
}

// Export the main application class
export default LiveTVPlatform;