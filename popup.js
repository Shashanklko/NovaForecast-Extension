// Popup script for extension
document.addEventListener('DOMContentLoaded', async () => {
  const weatherDisplay = document.getElementById('weatherDisplay');
  const timeDisplay = document.getElementById('timeDisplay');
  const toggleWidget = document.getElementById('toggleWidget');
  const toggleTime = document.getElementById('toggleTime');
  const toggleCelsius = document.getElementById('toggleCelsius');
  const widgetPosition = document.getElementById('widgetPosition');
  const transparencySlider = document.getElementById('transparencySlider');
  const transparencyValue = document.getElementById('transparencyValue');
  const refreshWeather = document.getElementById('refreshWeather');
  const locationInput = document.getElementById('locationInput');
  const saveLocationBtn = document.getElementById('saveLocation');
  const locationStatus = document.getElementById('locationStatus');

  let currentLocation = null;

  // Load saved settings
  const loadSettings = async () => {
    const result = await chrome.storage.sync.get([
      'widgetEnabled',
      'timeEnabled',
      'isCelsius',
      'widgetPosition',
      'transparency',
      'customLocation',
      'lastLocation',
    ]);

    toggleWidget.checked = result.widgetEnabled !== false;
    toggleTime.checked = result.timeEnabled !== true;
    toggleCelsius.checked = result.isCelsius === true;
    widgetPosition.value = result.widgetPosition || 'top-right';
    const transparency = result.transparency !== undefined ? result.transparency : 0.75;
    transparencySlider.value = transparency;
    transparencyValue.textContent = Math.round(transparency * 100) + '%';

    if (result.customLocation) {
      currentLocation = { ...result.customLocation };
      locationInput.value = currentLocation.label || '';
      locationStatus.textContent = `Using ${currentLocation.label || 'saved location'}`;
    } else if (result.lastLocation) {
      currentLocation = { ...result.lastLocation };
      locationStatus.textContent = 'Using previously detected location';
    } else {
      currentLocation = null;
      locationStatus.textContent = 'Using device location';
    }
  };

  // Save settings
  const saveSettings = async () => {
    const transparency = parseFloat(transparencySlider.value);
    await chrome.storage.sync.set({
      widgetEnabled: toggleWidget.checked,
      timeEnabled: toggleTime.checked,
      isCelsius: toggleCelsius.checked,
      widgetPosition: widgetPosition.value,
      transparency: transparency,
    });

    // Notify content script of changes
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'updateSettings',
        settings: {
          widgetEnabled: toggleWidget.checked,
          timeEnabled: toggleTime.checked,
          isCelsius: toggleCelsius.checked,
          position: widgetPosition.value,
          transparency: transparency,
        },
      });
    }
  };

  // Update time display
const updateTime = () => {
  const now = new Date();

  // Use location timezone internally
  const timeZone = currentLocation?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Format time according to timezone
  const time = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone, 
  });

  // Format date according to timezone
  const date = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone, 
  });

  // Display only time and date in popup
  timeDisplay.innerHTML = `
    <div class="time">${time}</div>
    <div class="date">${date}</div>
  `;
};


  // Fetch and display weather
  const fetchWeather = async () => {
    try {
      weatherDisplay.innerHTML = '<div class="loading">Loading weather...</div>';

      // Prefer custom/saved location
      if (currentLocation?.latitude && currentLocation?.longitude) {
        await loadWeatherData(currentLocation);
        return;
      }

      const stored = await chrome.storage.sync.get(['customLocation', 'lastLocation']);
      if (stored.customLocation) {
        currentLocation = { ...stored.customLocation };
        await loadWeatherData(currentLocation);
        locationStatus.textContent = `Using ${currentLocation.label || 'saved location'}`;
        return;
      }

      if (stored.lastLocation) {
        currentLocation = { ...stored.lastLocation };
        await loadWeatherData(currentLocation);
        locationStatus.textContent = 'Using previously detected location';
        return;
      }

      // Try to get current location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            currentLocation = { ...location };
            await chrome.storage.sync.set({ lastLocation: location });
            await loadWeatherData(location);
          },
          async () => {
            const defaultLocation = { latitude: 40.7128, longitude: -74.0060, label: 'New York, USA' };
            await loadWeatherData(defaultLocation);
            locationStatus.textContent = 'Using default location (New York, USA)';
          }
        );
      } else {
        const defaultLocation = { latitude: 40.7128, longitude: -74.0060, label: 'New York, USA' };
        await loadWeatherData(defaultLocation);
        locationStatus.textContent = 'Using default location (New York, USA)';
      }
    } catch (error) {
      console.error('Weather fetch error:', error);
      weatherDisplay.innerHTML = '<div class="loading">Error loading weather</div>';
    }
  };

  const loadWeatherData = async (coords) => {
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current_weather=true&timezone=auto`
      );
      const data = await response.json();

      if (data.current_weather) {
        const temp = toggleCelsius.checked
          ? `${Math.round(data.current_weather.temperature)}°C`
          : `${Math.round((data.current_weather.temperature * 9) / 5 + 32)}°F`;

        const weatherCode = data.current_weather.weathercode;
        const weatherIcons = {
          0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
          45: '🌫️', 48: '🌫️',
          51: '🌦️', 53: '🌦️', 55: '🌦️',
          61: '🌧️', 63: '🌧️', 65: '⛈️',
          71: '❄️', 73: '❄️', 75: '🌨️',
          80: '🌦️', 81: '🌧️', 82: '⛈️',
          95: '⛈️', 96: '⛈️', 99: '⛈️',
        };

        const icon = weatherIcons[weatherCode] || '🌤️';

        weatherDisplay.innerHTML = `
          <div style="font-size: 48px; margin-bottom: 10px;">${icon}</div>
          <div class="weather-temp">${temp}</div>
          <div class="weather-condition">Weather Code: ${weatherCode}</div>
          <div class="weather-location">${coords.label || currentLocation?.label || 'Device location'}</div>
        `;
      }
    } catch (error) {
      console.error('Weather load error:', error);
      weatherDisplay.innerHTML = '<div class="loading">Error loading weather</div>';
    }
  };

  const handleLocationSave = async () => {
    const query = locationInput.value.trim();
    if (!query) {
      locationStatus.textContent = 'Please enter a location name.';
      return;
    }

    locationStatus.textContent = 'Searching...';
    saveLocationBtn.disabled = true;

    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`
      );
      if (!response.ok) {
        throw new Error('Failed to search location.');
      }
      const data = await response.json();
      if (!data.results || !data.results.length) {
        throw new Error('No matches found.');
      }

      const result = data.results[0];
      const label = [result.name, result.country_code].filter(Boolean).join(', ');
      const locationData = {
        label,
        latitude: result.latitude,
        longitude: result.longitude,
        timezone: result.timezone,
      };

      await chrome.storage.sync.set({
        customLocation: locationData,
        lastLocation: { latitude: locationData.latitude, longitude: locationData.longitude },
      });

      currentLocation = { ...locationData };
      locationStatus.textContent = `Using ${label}`;

      await fetchWeather();
      updateTime();
      notifyContentScripts(locationData);
    } catch (err) {
      console.error('Location update error:', err);
      locationStatus.textContent = err.message || 'Unable to set location.';
    } finally {
      saveLocationBtn.disabled = false;
    }
  };

  const notifyContentScripts = async (locationData) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'locationUpdated',
          location: locationData,
        });
      }
    } catch (err) {
      console.warn('Failed to notify content scripts', err);
    }
  };

  // Update transparency display
  transparencySlider.addEventListener('input', (e) => {
    const value = Math.round(parseFloat(e.target.value) * 100);
    transparencyValue.textContent = value + '%';
    saveSettings();
  });

  // Event listeners
  toggleWidget.addEventListener('change', saveSettings);
  toggleTime.addEventListener('change', saveSettings);
  toggleCelsius.addEventListener('change', saveSettings);
  widgetPosition.addEventListener('change', saveSettings);
  refreshWeather.addEventListener('click', fetchWeather);
  saveLocationBtn.addEventListener('click', handleLocationSave);
  locationInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleLocationSave();
    }
  });

  // Initialize
  await loadSettings();
  updateTime();
  setInterval(updateTime, 1000);
  await fetchWeather();
});

