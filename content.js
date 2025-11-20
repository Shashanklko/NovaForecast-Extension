let widgetContainer = null;
let weatherWidget = null;
let timeWidget = null;
let locationData = null;
let weatherIntervalId = null;
let timeIntervalId = null;
let weatherFetcher = null;
let timeUpdateFn = null;

let settings = {
  widgetEnabled: true,
  timeEnabled: true,
  isCelsius: true,
  widgetPosition: 'top-right',
  transparency: 0.75,
};

const WEATHER_ICONS = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌦️',
  56: '🌨️', 57: '🌨️',
  61: '🌧️', 63: '🌧️', 65: '⛈️',
  66: '🌨️', 67: '🌨️',
  71: '❄️', 73: '❄️', 75: '🌨️',
  77: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  85: '❄️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

chrome.storage.sync.get([
  'widgetEnabled', 'timeEnabled', 'isCelsius', 'widgetPosition',
  'transparency', 'weatherPosition', 'timePosition', 'lastLocation', 'customLocation'
], (result) => {
  settings.widgetEnabled = result.widgetEnabled !== false;
  settings.timeEnabled = result.timeEnabled !== false;
  settings.isCelsius = result.isCelsius === true;
  settings.widgetPosition = result.widgetPosition || 'top-right';
  settings.transparency = result.transparency ?? 0.75;

  if (result.customLocation) {
    locationData = { ...result.customLocation };
  } else if (result.lastLocation) {
    locationData = { ...result.lastLocation };
  }

  createWidgetContainer();

  if (settings.widgetEnabled) createWeatherWidget(result.weatherPosition);
  if (settings.timeEnabled) createTimeWidget(result.timePosition);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateSettings') {
    settings = { ...settings, ...message.settings };
    updateWidgets();
    sendResponse({ success: true });
  } else if (message.action === 'locationUpdated') {
    if (message.location) {
      locationData = { ...message.location };
      refreshWeatherWidget();
      refreshTimeWidget();
    }
    sendResponse({ success: true });
  }
  return true;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') return;
  if (changes.customLocation) {
    locationData = changes.customLocation.newValue ? { ...changes.customLocation.newValue } : null;
    refreshWeatherWidget();
    refreshTimeWidget();
  } else if (!locationData && changes.lastLocation) {
    locationData = changes.lastLocation.newValue ? { ...changes.lastLocation.newValue } : null;
    refreshWeatherWidget();
  }
});

function createWidgetContainer() {
  if (!widgetContainer) {
    widgetContainer = document.createElement('div');
    widgetContainer.id = 'weather-time-widget';
    document.body.appendChild(widgetContainer);
  }
}

async function createWeatherWidget(savedPosition = null) {
  if (weatherWidget) return;

  weatherWidget = document.createElement('div');
  weatherWidget.id = 'weather-widget';
  weatherWidget.className = 'widget-item';
  setWidgetPosition(weatherWidget, savedPosition, { top: 20, right: 20 });
  setWidgetTransparency(weatherWidget);

  const fetchWeather = async () => {
    try {
      const coords = getActiveCoords();
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current_weather=true&timezone=auto`);
      const data = await response.json();

      let temp = '--';
      let icon = '🌤️';
      if (data.current_weather) {
        temp = settings.isCelsius
          ? `${Math.round(data.current_weather.temperature)}°C`
          : `${Math.round((data.current_weather.temperature * 9) / 5 + 32)}°F`;
        icon = WEATHER_ICONS[data.current_weather.weathercode] || '🌤️';
      }

      const label = coords.label || locationData?.label || 'Device location';
      weatherWidget.innerHTML = `
        <div class="weather-icon">${icon}</div>
        <div class="weather-temp">${temp}</div>
        <div class="widget-location">${label}</div>
      `;
    } catch (err) {
      console.error('Weather fetch error:', err);
      weatherWidget.innerHTML = '<div class="weather-error">Weather unavailable 🌤️</div>';
    }
  };

  weatherFetcher = fetchWeather;
  fetchWeather();
  weatherIntervalId = setInterval(fetchWeather, 15 * 60 * 1000);

  document.body.appendChild(weatherWidget);
  makeDraggable(weatherWidget, 'weatherPosition');
}

function createTimeWidget(savedPosition = null) {
  if (timeWidget) return;

  timeWidget = document.createElement('div');
  timeWidget.id = 'time-widget';
  timeWidget.className = 'widget-item';
  setWidgetPosition(timeWidget, savedPosition, { top: 90, right: 20 });
  setWidgetTransparency(timeWidget);

  const updateTime = () => {
    const now = new Date();
    const timeZone = getActiveTimezone();
    const label = locationData?.label || 'Device time';
    const timeString = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone,
    });
    timeWidget.innerHTML = `
      <div class="time-display">${timeString}</div>
      <div class="widget-location">${label}</div>
    `;
  };

  timeUpdateFn = updateTime;
  updateTime();
  timeIntervalId = setInterval(updateTime, 1000);

  document.body.appendChild(timeWidget);
  makeDraggable(timeWidget, 'timePosition');
}

function updateWidgets() {
  if (settings.widgetEnabled) {
    if (!weatherWidget) createWeatherWidget();
    else setWidgetTransparency(weatherWidget);
  } else if (weatherWidget) {
    weatherWidget.remove();
    weatherWidget = null;
    if (weatherIntervalId) {
      clearInterval(weatherIntervalId);
      weatherIntervalId = null;
    }
    weatherFetcher = null;
  }

  if (settings.timeEnabled) {
    if (!timeWidget) createTimeWidget();
    else setWidgetTransparency(timeWidget);
  } else if (timeWidget) {
    timeWidget.remove();
    timeWidget = null;
    if (timeIntervalId) {
      clearInterval(timeIntervalId);
      timeIntervalId = null;
    }
    timeUpdateFn = null;
  }

  if (!settings.widgetEnabled && !settings.timeEnabled && widgetContainer) {
    widgetContainer.remove();
    widgetContainer = null;
  }
}

function setWidgetPosition(widget, savedPosition, defaultPosition) {
  if (savedPosition) {
    widget.style.left = savedPosition.left + 'px';
    widget.style.top = savedPosition.top + 'px';
    widget.style.right = 'auto';
    widget.style.bottom = 'auto';
  } else {
    if (defaultPosition.top !== undefined) widget.style.top = defaultPosition.top + 'px';
    if (defaultPosition.right !== undefined) widget.style.right = defaultPosition.right + 'px';
  }
}

function setWidgetTransparency(widget) {
  const alpha = settings.transparency ?? 0.75;
  widget.style.background = `rgba(20, 30, 25, ${alpha})`;
}

function makeDraggable(element, positionKey) {
  let isDragging = false;
  let offsetX, offsetY;

  element.style.cursor = 'grab';
  element.addEventListener('pointerdown', (e) => {
    isDragging = true;
    element.setPointerCapture(e.pointerId);
    element.style.cursor = 'grabbing';
    offsetX = e.clientX - element.offsetLeft;
    offsetY = e.clientY - element.offsetTop;
    element.style.userSelect = 'none';
  });

  element.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    let x = e.clientX - offsetX;
    let y = e.clientY - offsetY;
    x = Math.max(0, Math.min(x, window.innerWidth - element.offsetWidth));
    y = Math.max(0, Math.min(y, window.innerHeight - element.offsetHeight));
    element.style.left = x + 'px';
    element.style.top = y + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  });

  element.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    element.releasePointerCapture(e.pointerId);
    element.style.cursor = 'grab';
    element.style.userSelect = '';
    if (positionKey) {
      chrome.storage.sync.set({
        [positionKey]: { left: parseInt(element.style.left), top: parseInt(element.style.top) }
      });
    }
  });
}

window.addEventListener('resize', () => {
  [weatherWidget, timeWidget].forEach(widget => {
    if (!widget) return;
    const maxX = window.innerWidth - widget.offsetWidth;
    const maxY = window.innerHeight - widget.offsetHeight;
    let x = parseInt(widget.style.left) || 0;
    let y = parseInt(widget.style.top) || 0;
    widget.style.left = Math.min(x, maxX) + 'px';
    widget.style.top = Math.min(y, maxY) + 'px';
  });
});

function getActiveCoords() {
  if (locationData?.latitude && locationData?.longitude) {
    return locationData;
  }
  return { latitude: 40.7128, longitude: -74.0060, label: 'New York, USA' };
}

function getActiveTimezone() {
  return locationData?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function refreshWeatherWidget() {
  if (weatherFetcher) {
    weatherFetcher();
  }
}

function refreshTimeWidget() {
  if (timeUpdateFn) {
    timeUpdateFn();
  }
}
