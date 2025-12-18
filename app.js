/*eslint-env browser*/
/**
 * TTS Demo App for Ontime
 * 
 * This demo app allows you to configure and monitor custom fields with Text-to-Speech.
 * You can select which fields to monitor, set thresholds, and choose voices.
 */

// Configuration
const isSecure = window.location.protocol === 'https:';
const stageHash = getStageHash();
const baseUrl = `${window.location.protocol}//${window.location.host}${stageHash}`;
const socketUrl = `${isSecure ? 'wss' : 'ws'}://${window.location.host}${stageHash}/ws`;

// State
let websocket = null;
let localData = {};
let customFields = {};
let monitoredFields = new Map(); // fieldKey -> { enabled, threshold, voice, language }
let previousValues = new Map(); // fieldKey -> previous value
let speechSynthesis = null;
let isSpeaking = false;
let ttsSpeed = 1.1; // Default reading speed

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  speechSynthesis = window.speechSynthesis;
  loadCustomFields();
  connectSocket();
  setupEventListeners();
});

/**
 * Utility to handle a demo deployed in an ontime stage
 */
function getStageHash() {
  const href = window.location.href;
  if (!href.includes('getontime.no')) {
    return '';
  }
  const hash = href.split('/');
  const stageHash = hash.at(3);
  return stageHash ? `/${stageHash}` : '';
}

/**
 * Load custom fields definitions from API
 */
async function loadCustomFields() {
  try {
    const apiUrl = `${baseUrl}/data/custom-fields`;
    console.log('Fetching custom fields from:', apiUrl);
    
    const response = await fetch(apiUrl, {
      credentials: 'include', // Include cookies for authentication
    });
    
    console.log('Response status:', response.status, response.statusText);
    
    if (response.ok) {
      customFields = await response.json();
      console.log('Loaded custom fields:', customFields);
      console.log('Number of fields:', Object.keys(customFields).length);
      
      if (Object.keys(customFields).length === 0) {
        document.getElementById('fields-container').innerHTML = 
          '<p class="info-text">No custom fields found. Create some in Ontime settings first.</p>';
        populateAddFieldDropdown(); // Still populate dropdown (will be empty)
        return;
      }
      
      renderFieldsConfiguration();
      populateAddFieldDropdown(); // Ensure dropdown is populated after rendering
    } else {
      const errorText = await response.text();
      console.error('Failed to load custom fields. Status:', response.status, 'Response:', errorText);
      document.getElementById('fields-container').innerHTML = 
        `<p class="info-text">Error loading custom fields (${response.status}). Check console for details.</p>`;
    }
  } catch (error) {
    console.error('Failed to load custom fields:', error);
    document.getElementById('fields-container').innerHTML = 
      '<p class="info-text">Error loading custom fields. Check console for details.</p>';
  }
}

/**
 * Connect to WebSocket
 */
function connectSocket() {
  try {
    websocket = new WebSocket(socketUrl);

    websocket.onopen = () => {
      updateConnectionStatus(true);
      console.log('WebSocket connected');
    };

    websocket.onclose = () => {
      updateConnectionStatus(false);
      console.log('WebSocket disconnected');
      // Attempt reconnect after 2 seconds
      setTimeout(connectSocket, 2000);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      updateConnectionStatus(false);
    };

    websocket.onmessage = (event) => {
      const { tag, payload } = JSON.parse(event.data);
      if (tag === 'runtime-data') {
        handleOntimePayload(payload);
        // Try to get custom fields from runtime data if API call failed
        if (Object.keys(customFields).length === 0 && payload.eventNow) {
          // Custom fields might be in the event data, but we still need definitions
          // So we'll keep trying the API
        }
      }
    };
  } catch (error) {
    console.error('Failed to connect WebSocket:', error);
    updateConnectionStatus(false);
  }
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(connected) {
  const statusEl = document.getElementById('connection-status');
  if (connected) {
    statusEl.textContent = 'Connected';
    statusEl.className = 'status-badge connected';
  } else {
    statusEl.textContent = 'Disconnected';
    statusEl.className = 'status-badge disconnected';
  }
}

/**
 * Handle Ontime payload updates
 */
function handleOntimePayload(payload) {
  // Apply patch to local data
  localData = { ...localData, ...payload };

  // Update current values display
  if ('eventNow' in payload || 'eventNext' in payload) {
    updateCurrentValues();
  }

  // Check monitored fields and trigger TTS if needed
  if (document.getElementById('tts-enabled').checked) {
    checkMonitoredFields();
  }
}

/**
 * Update current values display
 */
function updateCurrentValues() {
  const container = document.getElementById('current-values');
  const eventNow = localData.eventNow;
  const eventNext = localData.eventNext;

  if (!eventNow && !eventNext) {
    container.innerHTML = '<p class="info-text">No current event data</p>';
    return;
  }

  let html = '';

  // Current event
  if (eventNow && eventNow.custom) {
    html += '<div class="value-item"><strong>Current Event:</strong></div>';
    Object.entries(eventNow.custom).forEach(([key, value]) => {
      const field = customFields[key];
      if (field) {
        html += `
          <div class="value-item">
            <span class="value-item-label">${field.label}:</span>
            <span class="value-item-value">${value || '-'}</span>
          </div>
        `;
      }
    });
  }

  // Next event
  if (eventNext && eventNext.custom) {
    html += '<div class="value-item" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e0e0e0;"><strong>Next Event:</strong></div>';
    Object.entries(eventNext.custom).forEach(([key, value]) => {
      const field = customFields[key];
      if (field) {
        html += `
          <div class="value-item">
            <span class="value-item-label">${field.label}:</span>
            <span class="value-item-value">${value || '-'}</span>
          </div>
        `;
      }
    });
  }

  container.innerHTML = html || '<p class="info-text">No custom field values</p>';
}

/**
 * Parse time string to seconds
 */
function parseTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    return null;
  }

  const trimmed = timeStr.trim();
  const timePattern = /^(\d{1,2}):(\d{2}):(\d{2})$|^(\d{1,2}):(\d{2})$/;
  const match = trimmed.match(timePattern);

  if (!match) {
    return null;
  }

  // hh:mm:ss format
  if (match[1] !== undefined) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    return hours * 3600 + minutes * 60 + seconds;
  }

  // mm:ss format
  if (match[4] !== undefined) {
    const minutes = parseInt(match[4], 10);
    const seconds = parseInt(match[5], 10);
    return minutes * 60 + seconds;
  }

  return null;
}

/**
 * Check monitored fields and trigger TTS
 */
function checkMonitoredFields() {
  const eventNow = localData.eventNow;
  const eventNext = localData.eventNext;

  // Check current event
  if (eventNow && eventNow.custom) {
    checkEventFields(eventNow.custom, 'current');
  }

  // Check next event
  if (eventNext && eventNext.custom) {
    checkEventFields(eventNext.custom, 'next');
  }

  updateMonitoringDisplay();
}

/**
 * Check fields in an event
 */
function checkEventFields(customValues, eventType) {
  const event = eventType === 'current' ? localData.eventNow : localData.eventNext;
  const eventId = event?.id || eventType;
  
  Object.entries(customValues).forEach(([fieldKey, fieldValue]) => {
    if (!monitoredFields.has(fieldKey)) {
      return;
    }

    const config = monitoredFields.get(fieldKey);
    if (!config.enabled) {
      return;
    }

    // Create unique key for this event+field combination
    const uniqueKey = `${eventId}-${fieldKey}`;
    
    // Only process if value changed
    const previousValue = previousValues.get(uniqueKey);
    if (previousValue === fieldValue) {
      return;
    }

    previousValues.set(uniqueKey, fieldValue);

    if (!fieldValue || typeof fieldValue !== 'string') {
      console.log(`[TTS] Field ${fieldKey} has no valid value:`, fieldValue);
      return;
    }

    // Parse time to seconds
    const seconds = parseTimeToSeconds(fieldValue);
    if (seconds === null) {
      console.log(`[TTS] Field ${fieldKey} value "${fieldValue}" could not be parsed as time`);
      return;
    }

    console.log(`[TTS] Field ${fieldKey} parsed: "${fieldValue}" = ${seconds} seconds (threshold: ${config.threshold})`);

    // Check threshold
    if (seconds > config.threshold) {
      console.log(`[TTS] Field ${fieldKey} value ${seconds}s is above threshold ${config.threshold}s`);
      return;
    }

    // Trigger TTS
    console.log(`[TTS] Triggering speech for field ${fieldKey}: ${seconds} seconds`);
    speakValue(fieldKey, seconds, config);
  });
}

/**
 * Speak a value using TTS
 */
function speakValue(fieldKey, seconds, config) {
  if (!speechSynthesis) {
    console.error('[TTS] Speech synthesis not available');
    return;
  }

  if (isSpeaking) {
    console.log('[TTS] Already speaking, skipping');
    return;
  }

  // Cancel any pending speech
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    console.log('[TTS] Cancelling previous speech');
    speechSynthesis.cancel();
  }

  setTimeout(() => {
    // Double-check we're not speaking
    if (isSpeaking) {
      return;
    }

    isSpeaking = true;
    console.log(`[TTS] Speaking: "${seconds}" (field: ${fieldKey}, lang: ${config.language || 'en-US'})`);

    const utterance = new SpeechSynthesisUtterance(`${seconds}`);
    utterance.lang = config.language || 'en-US';
    utterance.rate = ttsSpeed;

    // Set voice if available
    if (config.voice) {
      const voices = speechSynthesis.getVoices();
      const voice = voices.find(v => v.voiceURI === config.voice || v.name === config.voice);
      if (voice) {
        utterance.voice = voice;
        console.log(`[TTS] Using voice: ${voice.name}`);
      } else {
        console.log(`[TTS] Voice not found: ${config.voice}, using default`);
      }
    }

    utterance.onstart = () => {
      console.log('[TTS] Speech started');
    };

    utterance.onend = () => {
      console.log('[TTS] Speech ended');
      isSpeaking = false;
    };

    utterance.onerror = (error) => {
      console.error('[TTS] Speech error:', error);
      isSpeaking = false;
    };

    try {
      speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('[TTS] Failed to speak:', error);
      isSpeaking = false;
    }
  }, 100);
}

/**
 * Get available voices
 */
function getAvailableVoices() {
  if (!speechSynthesis) {
    return [];
  }
  return speechSynthesis.getVoices();
}

/**
 * Populate add field dropdown
 */
function populateAddFieldDropdown() {
  const select = document.getElementById('add-field-select');
  if (!select) {
    console.error('Add field select element not found');
    return;
  }

  const textFields = Object.entries(customFields).filter(([key, field]) => 
    field.type === 'text' && !monitoredFields.has(key)
  );

  console.log('Populating dropdown. Available text fields:', textFields.length);
  console.log('All custom fields:', Object.keys(customFields));
  console.log('Monitored fields:', Array.from(monitoredFields.keys()));

  select.innerHTML = '<option value="">Select a field to add...</option>';
  textFields.forEach(([key, field]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = field.label;
    select.appendChild(option);
  });

  const addBtn = document.getElementById('add-field-btn');
  if (addBtn) {
    addBtn.disabled = textFields.length === 0;
  }
  
  if (textFields.length === 0 && Object.keys(customFields).length > 0) {
    console.log('No text fields available. All fields are already monitored or not text type.');
  }
}

/**
 * Render fields configuration UI
 */
function renderFieldsConfiguration() {
  const container = document.getElementById('fields-container');
  const textFields = Object.entries(customFields).filter(([_, field]) => field.type === 'text');

  if (textFields.length === 0) {
    container.innerHTML = '<p class="info-text">No text custom fields found. Create some in Ontime settings first.</p>';
    return;
  }

  // Only show fields that are being monitored
  const monitoredKeys = Array.from(monitoredFields.keys());
  const fieldsToShow = textFields.filter(([key]) => monitoredKeys.includes(key));

  if (fieldsToShow.length === 0) {
    container.innerHTML = '<p class="info-text">No fields configured. Use "Add Field" to start monitoring.</p>';
    return;
  }

  let html = '';
  fieldsToShow.forEach(([key, field]) => {
    const config = monitoredFields.get(key) || {
      enabled: false,
      threshold: 10,
      voice: '',
      language: 'en-US',
    };

    html += `
      <div class="field-row" data-field-key="${key}">
        <div class="field-row-header">
          <div class="field-row-title">
            <div class="field-color" style="background-color: ${field.colour}"></div>
            <span>${field.label}</span>
          </div>
          <div class="field-row-controls">
            <label>
              <input type="checkbox" class="field-enabled" data-field-key="${key}" ${config.enabled ? 'checked' : ''} />
              Enable
            </label>
            <button class="btn btn-danger remove-field-btn" data-field-key="${key}">Remove</button>
          </div>
        </div>
        <div class="field-row-fields">
          <div class="field-input-group">
            <label>Threshold (seconds)</label>
            <input type="number" class="field-threshold" data-field-key="${key}" 
                   value="${config.threshold}" min="0" step="1" />
          </div>
          <div class="field-input-group">
            <label>Language</label>
            <select class="field-language" data-field-key="${key}">
              <option value="en-US" ${config.language === 'en-US' ? 'selected' : ''}>English (US)</option>
              <option value="en-GB" ${config.language === 'en-GB' ? 'selected' : ''}>English (UK)</option>
              <option value="es-ES" ${config.language === 'es-ES' ? 'selected' : ''}>Spanish (Spain)</option>
              <option value="es-MX" ${config.language === 'es-MX' ? 'selected' : ''}>Spanish (Mexico)</option>
              <option value="fr-FR" ${config.language === 'fr-FR' ? 'selected' : ''}>French (France)</option>
              <option value="de-DE" ${config.language === 'de-DE' ? 'selected' : ''}>German (Germany)</option>
              <option value="it-IT" ${config.language === 'it-IT' ? 'selected' : ''}>Italian (Italy)</option>
              <option value="pt-BR" ${config.language === 'pt-BR' ? 'selected' : ''}>Portuguese (Brazil)</option>
              <option value="pt-PT" ${config.language === 'pt-PT' ? 'selected' : ''}>Portuguese (Portugal)</option>
            </select>
          </div>
          <div class="field-input-group">
            <label>Voice</label>
            <select class="field-voice" data-field-key="${key}">
              <option value="">Default</option>
            </select>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Populate voice options
  populateVoiceOptions();

  // Update add field dropdown
  populateAddFieldDropdown();
}

/**
 * Populate voice options for all selects
 */
function populateVoiceOptions() {
  const voices = getAvailableVoices();
  const voiceSelects = document.querySelectorAll('.field-voice');

  voiceSelects.forEach(select => {
    const fieldKey = select.dataset.fieldKey;
    const config = monitoredFields.get(fieldKey) || { language: 'en-US' };
    const langCode = config.language.split('-')[0];

    // Filter voices by language
    const filteredVoices = voices.filter(v => v.lang.startsWith(langCode));

    // Clear and populate
    select.innerHTML = '<option value="">Default</option>';
    filteredVoices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} (${voice.lang})`;
      if (config.voice === voice.voiceURI) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  });

  // Reload voices when they become available (some browsers load asynchronously)
  if (speechSynthesis && speechSynthesis.onvoiceschanged) {
    speechSynthesis.onvoiceschanged = populateVoiceOptions;
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // TTS enabled toggle
  document.getElementById('tts-enabled').addEventListener('change', (e) => {
    if (!e.target.checked) {
      speechSynthesis?.cancel();
      isSpeaking = false;
    }
  });

  // TTS speed slider
  const speedSlider = document.getElementById('tts-speed');
  const speedValue = document.getElementById('speed-value');
  speedSlider.addEventListener('input', (e) => {
    ttsSpeed = parseFloat(e.target.value);
    speedValue.textContent = `${ttsSpeed.toFixed(1)}x`;
    // Save to localStorage
    localStorage.setItem('ontime-tts-speed', ttsSpeed.toString());
  });
  
  // Load saved speed
  const savedSpeed = localStorage.getItem('ontime-tts-speed');
  if (savedSpeed) {
    ttsSpeed = parseFloat(savedSpeed);
    speedSlider.value = ttsSpeed;
    speedValue.textContent = `${ttsSpeed.toFixed(1)}x`;
  }

  // Field enabled toggles
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('field-enabled')) {
      const fieldKey = e.target.dataset.fieldKey;
      const config = monitoredFields.get(fieldKey) || {
        enabled: false,
        threshold: 10,
        voice: '',
        language: 'en-US',
      };
      config.enabled = e.target.checked;
      monitoredFields.set(fieldKey, config);
      saveConfiguration();
      updateMonitoringDisplay();
    }

    if (e.target.classList.contains('field-threshold')) {
      const fieldKey = e.target.dataset.fieldKey;
      const config = monitoredFields.get(fieldKey) || {
        enabled: false,
        threshold: 10,
        voice: '',
        language: 'en-US',
      };
      config.threshold = parseInt(e.target.value, 10) || 10;
      monitoredFields.set(fieldKey, config);
      saveConfiguration();
    }

    if (e.target.classList.contains('field-language')) {
      const fieldKey = e.target.dataset.fieldKey;
      const config = monitoredFields.get(fieldKey) || {
        enabled: false,
        threshold: 10,
        voice: '',
        language: 'en-US',
      };
      config.language = e.target.value;
      config.voice = ''; // Clear voice when language changes
      monitoredFields.set(fieldKey, config);
      saveConfiguration();
      populateVoiceOptions(); // Reload voices for new language
    }

    if (e.target.classList.contains('field-voice')) {
      const fieldKey = e.target.dataset.fieldKey;
      const config = monitoredFields.get(fieldKey) || {
        enabled: false,
        threshold: 10,
        voice: '',
        language: 'en-US',
      };
      config.voice = e.target.value;
      monitoredFields.set(fieldKey, config);
      saveConfiguration();
    }
  });

  // Remove field buttons
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-field-btn')) {
      const fieldKey = e.target.dataset.fieldKey;
      monitoredFields.delete(fieldKey);
      previousValues.delete(fieldKey);
      saveConfiguration();
      renderFieldsConfiguration();
      updateMonitoringDisplay();
    }
  });

  // Add field button
  document.getElementById('add-field-btn').addEventListener('click', () => {
    const select = document.getElementById('add-field-select');
    const fieldKey = select.value;
    if (fieldKey && customFields[fieldKey]) {
      const config = {
        enabled: true,
        threshold: 10,
        voice: '',
        language: 'en-US',
      };
      monitoredFields.set(fieldKey, config);
      saveConfiguration();
      renderFieldsConfiguration();
      updateMonitoringDisplay();
      select.value = '';
      populateAddFieldDropdown();
    }
  });

  // Enable/disable add button based on selection
  document.getElementById('add-field-select').addEventListener('change', (e) => {
    document.getElementById('add-field-btn').disabled = !e.target.value;
  });
}

/**
 * Update monitoring display
 */
function updateMonitoringDisplay() {
  const container = document.getElementById('monitoring-list');
  const enabledFields = Array.from(monitoredFields.entries()).filter(([_, config]) => config.enabled);

  if (enabledFields.length === 0) {
    container.innerHTML = '<p class="info-text">No fields being monitored</p>';
    return;
  }

  let html = '';
  enabledFields.forEach(([fieldKey, config]) => {
    const field = customFields[fieldKey];
    if (!field) return;

    const eventNow = localData.eventNow;
    const eventNext = localData.eventNext;
    let currentValue = '-';
    let isActive = false;

    // Get current value from events
    if (eventNow && eventNow.custom && eventNow.custom[fieldKey]) {
      currentValue = eventNow.custom[fieldKey];
      const seconds = parseTimeToSeconds(currentValue);
      if (seconds !== null && seconds <= config.threshold) {
        isActive = true;
      }
    } else if (eventNext && eventNext.custom && eventNext.custom[fieldKey]) {
      currentValue = eventNext.custom[fieldKey];
    }

    html += `
      <div class="monitoring-item ${isActive ? 'active' : ''}">
        <div class="monitoring-item-info">
          <div class="monitoring-item-label">${field.label}</div>
          <div class="monitoring-item-value">Value: ${currentValue} | Threshold: ${config.threshold}s</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/**
 * Save configuration to localStorage
 */
function saveConfiguration() {
  const config = {};
  monitoredFields.forEach((value, key) => {
    config[key] = value;
  });
  localStorage.setItem('ontime-tts-config', JSON.stringify(config));
}

/**
 * Load saved configuration from localStorage
 */
function loadSavedConfiguration() {
  try {
    const saved = localStorage.getItem('ontime-tts-config');
    if (saved) {
      const config = JSON.parse(saved);
      Object.entries(config).forEach(([key, value]) => {
        if (customFields[key]) {
          monitoredFields.set(key, value);
        }
      });
      renderFieldsConfiguration();
      updateMonitoringDisplay();
    }
  } catch (error) {
    console.error('Failed to load saved configuration:', error);
  }
}
