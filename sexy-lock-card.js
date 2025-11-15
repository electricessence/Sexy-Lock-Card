/**
 * Sexy Lock Card - Animated Lock Card for Home Assistant
 * A custom Lovelace card with smooth state transitions and animations
 * 
 * @license MIT
 * @version 1.0.0
 */

class SexyLockCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;
    
    // Internal state machine
    this._currentVisualState = 'unknown';
    this._targetState = null;
    this._animationPhase = 'idle'; // idle, transitioning, complete
    this._animationTimer = null;
    this._lastEntityState = null;
  }

  /**
   * Home Assistant calls this to provide the configuration from YAML
   */
  setConfig(config) {
    if (!config.entity) {
      throw new Error('You need to define an entity');
    }
    
    this._config = {
      entity: config.entity,
      name: config.name || null,
      show_name: config.show_name !== false,
      show_state: config.show_state !== false,
      animation_duration: config.animation_duration || 400,
      tap_action: config.tap_action || { action: 'toggle' },
      hold_action: config.hold_action || { action: 'more-info' },
    };
    
    this._render();
  }

  /**
   * Return a visual editor configuration schema
   * This enables the UI card editor in Home Assistant
   */
  static getConfigElement() {
    return document.createElement('sexy-lock-card-editor');
  }

  /**
   * Return stub config for card picker
   */
  static getStubConfig() {
    return {
      entity: 'lock.example',
      show_name: true,
      show_state: true,
      animation_duration: 400,
    };
  }

  /**
   * Home Assistant calls this when it has new state data
   */
  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    
    if (!this._config) return;
    
    const entity = hass.states[this._config.entity];
    if (!entity) {
      console.error(`Entity ${this._config.entity} not found`);
      return;
    }
    
    // Detect state changes and trigger animations
    this._handleEntityStateChange(entity, oldHass);
    this._updateUI(entity);
  }

  /**
   * State machine: Handle entity state changes and trigger animations
   */
  _handleEntityStateChange(entity, oldHass) {
    const newState = entity.state;
    const oldState = this._lastEntityState;
    
    // First load
    if (oldState === null) {
      this._currentVisualState = this._normalizeState(newState);
      this._lastEntityState = newState;
      return;
    }
    
    // No change
    if (oldState === newState) {
      return;
    }
    
    // State changed - determine transition
    this._lastEntityState = newState;
    this._triggerTransition(oldState, newState);
  }

  /**
   * Normalize entity states to our internal state model
   */
  _normalizeState(state) {
    const normalized = state.toLowerCase();
    
    // Map all possible states
    switch (normalized) {
      case 'locked':
      case 'locking':
      case 'unlocked':
      case 'unlocking':
      case 'jammed':
      case 'unknown':
      case 'unavailable':
        return normalized;
      default:
        return 'unknown';
    }
  }

  /**
   * Trigger a visual transition from oldState to newState
   */
  _triggerTransition(oldState, newState) {
    const from = this._normalizeState(oldState);
    const to = this._normalizeState(newState);
    
    // Clear any existing animation
    if (this._animationTimer) {
      clearTimeout(this._animationTimer);
      this._animationTimer = null;
    }
    
    // Determine if we need to animate through a midpoint
    const needsMidpoint = this._shouldAnimateThroughMidpoint(from, to);
    
    if (needsMidpoint) {
      this._animateWithMidpoint(from, to);
    } else {
      // Direct transition (e.g., locked -> locking, or unlocked -> unlocking)
      this._currentVisualState = to;
      this._animationPhase = 'idle';
      this._updateVisuals();
    }
  }

  /**
   * Determine if we need to animate through a transitional midpoint state
   */
  _shouldAnimateThroughMidpoint(from, to) {
    // Transitions that require animation through midpoint
    const transitionMap = {
      'locked': ['unlocked', 'unlocking'],
      'unlocked': ['locked', 'locking'],
      'locking': ['unlocked', 'unlocking'],
      'unlocking': ['locked', 'locking'],
    };
    
    return transitionMap[from]?.includes(to) || false;
  }

  /**
   * Animate through a midpoint state for smooth transitions
   */
  _animateWithMidpoint(from, to) {
    const duration = this._config.animation_duration;
    const halfDuration = duration / 2;
    
    // Determine midpoint state
    const midpoint = this._getMidpointState(from, to);
    
    // Phase 1: Transition to midpoint
    this._animationPhase = 'transitioning';
    this._currentVisualState = midpoint;
    this._updateVisuals();
    
    // Phase 2: After half duration, transition to final state
    this._animationTimer = setTimeout(() => {
      this._currentVisualState = to;
      this._animationPhase = 'complete';
      this._updateVisuals();
      
      // Mark as idle after animation completes
      this._animationTimer = setTimeout(() => {
        this._animationPhase = 'idle';
        this._updateVisuals();
      }, halfDuration);
    }, halfDuration);
  }

  /**
   * Get the visual midpoint state for a transition
   */
  _getMidpointState(from, to) {
    // Determine direction
    const isLocking = to === 'locked' || to === 'locking';
    const isUnlocking = to === 'unlocked' || to === 'unlocking';
    
    if (isLocking) return 'locking';
    if (isUnlocking) return 'unlocking';
    
    // Fallback
    return 'transitioning';
  }

  /**
   * Update UI elements based on entity state
   */
  _updateUI(entity) {
    if (!this.shadowRoot) return;
    
    const nameEl = this.shadowRoot.querySelector('.lock-name');
    const stateEl = this.shadowRoot.querySelector('.lock-state-text');
    
    if (nameEl) {
      nameEl.textContent = this._config.name || entity.attributes.friendly_name || 'Lock';
    }
    
    if (stateEl) {
      stateEl.textContent = this._getStateLabel(entity.state);
    }
    
    this._updateVisuals();
  }

  /**
   * Update visual elements (icon, colors, animations)
   */
  _updateVisuals() {
    if (!this.shadowRoot) return;
    
    const iconContainer = this.shadowRoot.querySelector('.lock-icon-container');
    const icon = this.shadowRoot.querySelector('.lock-icon');
    
    if (!iconContainer || !icon) return;
    
    // Remove all state classes
    iconContainer.classList.remove(
      'locked', 'unlocked', 'locking', 'unlocking', 
      'jammed', 'unknown', 'transitioning'
    );
    
    // Add current visual state class
    iconContainer.classList.add(this._currentVisualState);
    
    // Update icon based on state
    icon.innerHTML = this._getIconSVG(this._currentVisualState);
    
    // Apply animation class if transitioning
    if (this._animationPhase === 'transitioning') {
      iconContainer.classList.add('animating');
    } else {
      iconContainer.classList.remove('animating');
    }
  }

  /**
   * Get human-readable state label
   */
  _getStateLabel(state) {
    const labels = {
      'locked': 'Locked',
      'unlocked': 'Unlocked',
      'locking': 'Locking...',
      'unlocking': 'Unlocking...',
      'jammed': 'Jammed',
      'unknown': 'Unknown',
      'unavailable': 'Unavailable',
    };
    
    return labels[state.toLowerCase()] || state;
  }

  /**
   * Get SVG icon for the current state
   */
  _getIconSVG(state) {
    // Lock icon SVG paths
    const lockBody = '<rect x="8" y="11" width="8" height="9" rx="1" />';
    const lockShackle = '<path d="M12 3C10.34 3 9 4.34 9 6v3h6V6c0-1.66-1.34-3-3-3z" />';
    const lockShackleOpen = '<path d="M12 3C10.34 3 9 4.34 9 6v1h6V6c0-1.66-1.34-3-3-3z" transform="translate(2, 0)" />';
    const lockShackleHalf = '<path d="M12 3C10.34 3 9 4.34 9 6v2h6V6c0-1.66-1.34-3-3-3z" transform="translate(1, 0) rotate(-15 12 8)" />';
    
    switch (state) {
      case 'locked':
        return `<svg viewBox="0 0 24 24">${lockBody}${lockShackle}</svg>`;
      
      case 'unlocked':
        return `<svg viewBox="0 0 24 24">${lockBody}${lockShackleOpen}</svg>`;
      
      case 'locking':
      case 'unlocking':
        return `<svg viewBox="0 0 24 24">${lockBody}${lockShackleHalf}</svg>`;
      
      case 'jammed':
        return `<svg viewBox="0 0 24 24">${lockBody}${lockShackle}<text x="12" y="17" text-anchor="middle" font-size="8">!</text></svg>`;
      
      case 'unknown':
      case 'unavailable':
        return `<svg viewBox="0 0 24 24">${lockBody}${lockShackle}<text x="12" y="17" text-anchor="middle" font-size="8">?</text></svg>`;
      
      default:
        return `<svg viewBox="0 0 24 24">${lockBody}${lockShackle}</svg>`;
    }
  }

  /**
   * Handle tap/click events
   */
  _handleTap(e) {
    e.stopPropagation();
    
    if (!this._hass || !this._config) return;
    
    const entity = this._hass.states[this._config.entity];
    if (!entity) return;
    
    // Handle tap action
    if (this._config.tap_action.action === 'toggle') {
      this._toggleLock(entity);
    } else if (this._config.tap_action.action === 'more-info') {
      this._showMoreInfo();
    } else if (this._config.tap_action.action === 'call-service') {
      this._callService(this._config.tap_action);
    }
  }

  /**
   * Handle hold events
   */
  _handleHold(e) {
    e.stopPropagation();
    
    if (this._config.hold_action.action === 'more-info') {
      this._showMoreInfo();
    } else if (this._config.hold_action.action === 'call-service') {
      this._callService(this._config.hold_action);
    }
  }

  /**
   * Toggle lock state
   */
  _toggleLock(entity) {
    const currentState = entity.state;
    const isLocked = currentState === 'locked';
    
    const service = isLocked ? 'unlock' : 'lock';
    
    this._hass.callService('lock', service, {
      entity_id: this._config.entity,
    });
  }

  /**
   * Show more info dialog
   */
  _showMoreInfo() {
    const event = new Event('hass-more-info', {
      bubbles: true,
      composed: true,
    });
    event.detail = { entityId: this._config.entity };
    this.dispatchEvent(event);
  }

  /**
   * Call a custom service
   */
  _callService(actionConfig) {
    const [domain, service] = actionConfig.service.split('.');
    this._hass.callService(domain, service, actionConfig.service_data || {});
  }

  /**
   * Render the card HTML and CSS
   */
  _render() {
    if (!this.shadowRoot) return;
    
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          --lock-locked-color: var(--success-color, #4caf50);
          --lock-unlocked-color: var(--error-color, #f44336);
          --lock-transitioning-color: var(--warning-color, #ff9800);
          --lock-jammed-color: var(--warning-color, #ff5722);
          --lock-unknown-color: var(--disabled-text-color, #9e9e9e);
        }
        
        .lock-card {
          padding: 16px;
          background: var(--ha-card-background, var(--card-background-color, white));
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,0.1));
          cursor: pointer;
          user-select: none;
          transition: transform 0.1s ease;
        }
        
        .lock-card:active {
          transform: scale(0.98);
        }
        
        .lock-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        
        .lock-icon-container {
          width: 120px;
          height: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: var(--primary-background-color);
          position: relative;
          overflow: hidden;
          transition: all ${this._config?.animation_duration || 400}ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .lock-icon {
          width: 64px;
          height: 64px;
          fill: currentColor;
          transition: all ${this._config?.animation_duration || 400}ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        /* State-specific colors */
        .lock-icon-container.locked {
          color: var(--lock-locked-color);
          box-shadow: 0 0 0 3px var(--lock-locked-color);
        }
        
        .lock-icon-container.unlocked {
          color: var(--lock-unlocked-color);
          box-shadow: 0 0 0 3px var(--lock-unlocked-color);
        }
        
        .lock-icon-container.locking,
        .lock-icon-container.unlocking {
          color: var(--lock-transitioning-color);
          box-shadow: 0 0 0 3px var(--lock-transitioning-color);
        }
        
        .lock-icon-container.jammed {
          color: var(--lock-jammed-color);
          box-shadow: 0 0 0 3px var(--lock-jammed-color);
          animation: shake 0.5s ease-in-out infinite;
        }
        
        .lock-icon-container.unknown,
        .lock-icon-container.unavailable {
          color: var(--lock-unknown-color);
          box-shadow: 0 0 0 3px var(--lock-unknown-color);
          animation: breathe 2s ease-in-out infinite;
        }
        
        /* Animation for transitioning state */
        .lock-icon-container.animating .lock-icon {
          animation: rotate-pulse ${this._config?.animation_duration || 400}ms ease-in-out;
        }
        
        @keyframes rotate-pulse {
          0% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.1) rotate(-10deg); }
          50% { transform: scale(1.15) rotate(0deg); }
          75% { transform: scale(1.1) rotate(10deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px) rotate(-2deg); }
          75% { transform: translateX(4px) rotate(2deg); }
        }
        
        @keyframes breathe {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        
        .lock-name {
          font-size: 18px;
          font-weight: 500;
          color: var(--primary-text-color);
          margin: 0;
        }
        
        .lock-state-text {
          font-size: 14px;
          color: var(--secondary-text-color);
          margin: 0;
        }
        
        .hidden {
          display: none;
        }
      </style>
      
      <ha-card class="lock-card">
        <div class="lock-content">
          <div class="lock-icon-container">
            <div class="lock-icon"></div>
          </div>
          <h2 class="lock-name ${this._config?.show_name === false ? 'hidden' : ''}"></h2>
          <p class="lock-state-text ${this._config?.show_state === false ? 'hidden' : ''}"></p>
        </div>
      </ha-card>
    `;
    
    // Add event listeners
    const card = this.shadowRoot.querySelector('.lock-card');
    card.addEventListener('click', this._handleTap.bind(this));
    
    // Add long-press support
    let pressTimer;
    card.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => this._handleHold(e), 500);
    });
    card.addEventListener('touchend', () => {
      if (pressTimer) clearTimeout(pressTimer);
    });
    card.addEventListener('mousedown', (e) => {
      pressTimer = setTimeout(() => this._handleHold(e), 500);
    });
    card.addEventListener('mouseup', () => {
      if (pressTimer) clearTimeout(pressTimer);
    });
  }

  /**
   * Return the card size for Home Assistant layout calculations
   */
  getCardSize() {
    return 3;
  }

  /**
   * Lifecycle: Element added to DOM
   */
  connectedCallback() {
    if (!this.shadowRoot.querySelector('.lock-card')) {
      this._render();
    }
  }

  /**
   * Lifecycle: Element removed from DOM
   */
  disconnectedCallback() {
    if (this._animationTimer) {
      clearTimeout(this._animationTimer);
      this._animationTimer = null;
    }
  }
}

// Define the custom element
customElements.define('sexy-lock-card', SexyLockCard);

/**
 * Visual Card Editor for Home Assistant UI
 */
class SexyLockCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    
    // Update entity picker options if rendered
    const entityPicker = this.shadowRoot?.querySelector('ha-entity-picker');
    if (entityPicker && !entityPicker.hass) {
      entityPicker.hass = hass;
    }
  }

  _render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        .card-config {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 16px;
        }
        
        .option {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .option label {
          font-weight: 500;
          font-size: 14px;
          color: var(--primary-text-color);
        }
        
        .option .description {
          font-size: 12px;
          color: var(--secondary-text-color);
          margin-top: -2px;
        }
        
        ha-entity-picker,
        ha-textfield,
        ha-switch,
        ha-selector {
          width: 100%;
        }
        
        .number-input {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .number-input ha-textfield {
          flex: 1;
        }
        
        .number-input span {
          font-size: 12px;
          color: var(--secondary-text-color);
        }
        
        .section-header {
          font-weight: 500;
          font-size: 16px;
          color: var(--primary-text-color);
          margin-top: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--divider-color);
        }
        
        .switch-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 40px;
        }
        
        .switch-row label {
          flex: 1;
        }
      </style>
      
      <div class="card-config">
        <div class="option">
          <label>Entity (Required)</label>
          <div class="description">Select a lock entity</div>
          <ha-entity-picker
            .hass=${this._hass}
            .value=${this._config.entity || ''}
            .includeDomains=${['lock']}
            allow-custom-entity
            @value-changed=${this._entityChanged}
          ></ha-entity-picker>
        </div>
        
        <div class="option">
          <label>Name</label>
          <div class="description">Custom display name (leave empty to use entity name)</div>
          <ha-textfield
            .value=${this._config.name || ''}
            placeholder="Front Door"
            @input=${this._nameChanged}
          ></ha-textfield>
        </div>
        
        <div class="section-header">Display Options</div>
        
        <div class="option">
          <div class="switch-row">
            <label>
              <div>Show Name</div>
              <div class="description">Display the lock name below the icon</div>
            </label>
            <ha-switch
              .checked=${this._config.show_name !== false}
              @change=${this._showNameChanged}
            ></ha-switch>
          </div>
        </div>
        
        <div class="option">
          <div class="switch-row">
            <label>
              <div>Show State</div>
              <div class="description">Display the current state text</div>
            </label>
            <ha-switch
              .checked=${this._config.show_state !== false}
              @change=${this._showStateChanged}
            ></ha-switch>
          </div>
        </div>
        
        <div class="section-header">Animation Settings</div>
        
        <div class="option">
          <label>Animation Duration</label>
          <div class="description">Duration of lock/unlock animations in milliseconds</div>
          <div class="number-input">
            <ha-textfield
              type="number"
              min="100"
              max="1000"
              step="50"
              .value=${this._config.animation_duration || 400}
              @input=${this._animationDurationChanged}
            ></ha-textfield>
            <span>ms</span>
          </div>
        </div>
        
        <div class="section-header">Actions</div>
        
        <div class="option">
          <label>Tap Action</label>
          <div class="description">Action to perform when card is tapped</div>
          <ha-selector
            .hass=${this._hass}
            .selector=${{ ui_action: {} }}
            .value=${this._config.tap_action || { action: 'toggle' }}
            @value-changed=${this._tapActionChanged}
          ></ha-selector>
        </div>
        
        <div class="option">
          <label>Hold Action</label>
          <div class="description">Action to perform when card is held</div>
          <ha-selector
            .hass=${this._hass}
            .selector=${{ ui_action: {} }}
            .value=${this._config.hold_action || { action: 'more-info' }}
            @value-changed=${this._holdActionChanged}
          ></ha-selector>
        </div>
      </div>
    `;

    // Update element references after render
    if (this._hass) {
      const entityPicker = this.shadowRoot.querySelector('ha-entity-picker');
      if (entityPicker) {
        entityPicker.hass = this._hass;
      }
    }
  }

  _entityChanged(ev) {
    if (!this._config || !this._hass) return;
    
    const newConfig = { ...this._config, entity: ev.detail.value };
    this._updateConfig(newConfig);
  }

  _nameChanged(ev) {
    if (!this._config) return;
    
    const newConfig = { ...this._config };
    if (ev.target.value) {
      newConfig.name = ev.target.value;
    } else {
      delete newConfig.name;
    }
    this._updateConfig(newConfig);
  }

  _showNameChanged(ev) {
    if (!this._config) return;
    
    const newConfig = { ...this._config, show_name: ev.target.checked };
    this._updateConfig(newConfig);
  }

  _showStateChanged(ev) {
    if (!this._config) return;
    
    const newConfig = { ...this._config, show_state: ev.target.checked };
    this._updateConfig(newConfig);
  }

  _animationDurationChanged(ev) {
    if (!this._config) return;
    
    const value = parseInt(ev.target.value, 10);
    if (!isNaN(value) && value >= 100 && value <= 1000) {
      const newConfig = { ...this._config, animation_duration: value };
      this._updateConfig(newConfig);
    }
  }

  _tapActionChanged(ev) {
    if (!this._config) return;
    
    const newConfig = { ...this._config, tap_action: ev.detail.value };
    this._updateConfig(newConfig);
  }

  _holdActionChanged(ev) {
    if (!this._config) return;
    
    const newConfig = { ...this._config, hold_action: ev.detail.value };
    this._updateConfig(newConfig);
  }

  _updateConfig(newConfig) {
    this._config = newConfig;
    
    // Fire config-changed event for Home Assistant
    const event = new CustomEvent('config-changed', {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }
}

// Define the editor element
customElements.define('sexy-lock-card-editor', SexyLockCardEditor);

// Register with Home Assistant card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'sexy-lock-card',
  name: 'Sexy Lock Card',
  description: 'Animated lock card with smooth state transitions',
  preview: true,
  documentationURL: 'https://github.com/electricessence/Sexy-Lock-Card',
});

// Log successful load
console.info(
  '%c SEXY-LOCK-CARD %c 1.0.0 ',
  'color: white; background: #4caf50; font-weight: 700;',
  'color: #4caf50; background: white; font-weight: 700;'
);
