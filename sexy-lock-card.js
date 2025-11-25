/**
 * Sexy Lock Card - Animated Lock Card for Home Assistant
 * A custom Lovelace card with smooth state transitions and animations
 * 
 * @license MIT
 */

let sexyLockCardInstanceCounter = 0;

class SexyLockCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;
    
    // Internal state machine
    this._currentVisualState = 'unknown';
    this._targetState = null;
    this._animationPhase = 'idle'; // idle or transitioning
    this._animationTimer = null;
    this._lastEntityState = null;
    this._userInitiated = false; // Track if state change was user-initiated
    this._pendingUserAction = null; // 'lock' or 'unlock'
    this._doorInfo = null; // Cache of latest door/contact status
    this._interactionFeedbackTimer = null;
    this._requestedTimeoutTimer = null;
    this._requestedFallbackState = null;
    this._lastStableActionState = null;
    this._lastTapTimestamp = 0;
    this._directRotationTarget = null;
    this._instanceId = ++sexyLockCardInstanceCounter;
  }
  
  /**
   * Compute state color using HA theme variables with fallbacks
   * Similar to button-card's stateColorCss
   */
  _getStateColor(state) {
    if (!this._hass || !state) return null;
    
    // Custom colors override theme
    const customColors = {
      'locked': this._config?.color_locked,
      'unlocked': this._config?.color_unlocked,
      'locking': this._config?.color_transitioning,
      'unlocking': this._config?.color_transitioning,
      'jammed': this._config?.color_jammed,
      'unknown': this._config?.color_unknown,
      'unavailable': this._config?.color_unknown,
    };
    
    if (customColors[state]) {
      return customColors[state];
    }
    
    // Fall back to HA theme CSS variables
    // These are set by computeStyle() but we provide defaults
    return null; // Let CSS variables handle it
  }

  /**
   * Home Assistant calls this to provide the configuration from YAML
   */
  setConfig(config) {
    if (!config.entity) {
      throw new Error('You need to define an entity');
    }
    
    const baseTapAction = config.tap_action || { action: 'toggle' };
    let lockedTap = config.tap_action_locked || null;
    let unlockedTap = config.tap_action_unlocked || null;

    if (!lockedTap) {
      lockedTap = baseTapAction;
    }
    if (!unlockedTap) {
      unlockedTap = baseTapAction;
    }

    if (config.allow_locked_action === false && !config.tap_action_locked) {
      lockedTap = { action: 'none' };
    }
    if (config.allow_unlocked_action === false && !config.tap_action_unlocked) {
      unlockedTap = { action: 'none' };
    }
    if (lockedTap?.action === undefined) {
      lockedTap = { action: 'toggle' };
    }
    if (unlockedTap?.action === undefined) {
      unlockedTap = { action: 'toggle' };
    }

    this._config = {
      entity: config.entity,
      name: config.name || null,
      show_name: config.show_name !== false,
      show_state: config.show_state !== false,
      animation_duration: config.animation_duration || 2000,
      unlock_direction: config.unlock_direction || 'counterclockwise', // counterclockwise or clockwise
      offset_slide: config.offset_slide !== undefined ? config.offset_slide : 0.3, // 0 to 1.0, proportion of radius
      // Color configuration
      color_locked: config.color_locked || null,
      color_unlocked: config.color_unlocked || null,
      color_transitioning: config.color_transitioning || null,
      color_jammed: config.color_jammed || null,
      color_unknown: config.color_unknown || null,
      hold_action: config.hold_action || { action: 'more-info' },
      // Door/contact sensor integration (optional)
      door_entity: config.door_entity || null,
      battery_entity: config.battery_entity || null,
      battery_threshold: typeof config.battery_threshold === 'number' ? config.battery_threshold : 35,
      battery_indicator_position: config.battery_indicator_position || 'top-right',
      tap_action_locked: lockedTap,
      tap_action_unlocked: unlockedTap,
      requested_timeout: typeof config.requested_timeout === 'number' ? config.requested_timeout : 15000,
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
  static getStubConfig(hass, entities, entitiesFallback) {
    const availableEntities = [
      ...(entities || []),
      ...(entitiesFallback || []),
      ...Object.keys(hass?.states || {}),
    ];
    const lockEntity = availableEntities.find((entityId) => typeof entityId === 'string' && entityId.startsWith('lock.'));
    const friendlyName = lockEntity && hass?.states?.[lockEntity]?.attributes?.friendly_name;
    return {
      entity: lockEntity || 'lock.front_door',
      name: friendlyName || 'Sexy Lock',
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
   * State cycle: unlocked → lock-requested → locking → locked → unlock-requested → unlocking → unlocked
   */
  _normalizeState(state) {
    const normalized = state.toLowerCase();
    
    // Map all possible states (entity + UI states)
    switch (normalized) {
      case 'unlocked':
      case 'lock-requested':  // UI state when user clicks to lock
      case 'locking':
      case 'locked':
      case 'unlock-requested':  // UI state when user clicks to unlock
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
    const previousVisualState = this._currentVisualState;
    
    // Clear any existing animation
    if (this._animationTimer) {
      clearTimeout(this._animationTimer);
      this._animationTimer = null;
    }
    this._clearRequestedTimeout();
    
    const hadPendingAction = !!this._pendingUserAction;

    // If there's a pending user action and entity confirms it, clear the flag
    if (this._pendingUserAction) {
      if ((this._pendingUserAction === 'lock' && (to === 'locking' || to === 'locked')) ||
          (this._pendingUserAction === 'unlock' && (to === 'unlocking' || to === 'unlocked'))) {
        this._userInitiated = false;
        this._pendingUserAction = null;
      }
    }
    
    // Direct transition—match the state HA reports without inventing stops
    if (from !== to) {
      this._currentVisualState = to;
      this._animationPhase = 'idle';
      this._updateVisuals();
    }

    const visualMatchedFrom = previousVisualState === from;
    const isDirectStableFlip = (from === 'locked' && to === 'unlocked') || (from === 'unlocked' && to === 'locked');
    if (!hadPendingAction && visualMatchedFrom && isDirectStableFlip) {
      this._directRotationTarget = to;
    } else if (from !== to) {
      this._directRotationTarget = null;
    }
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
    
    this._doorInfo = this._computeDoorInfo();
    const displayState = this._isDoorClosed() ? entity.state : 'door-open';
    if (stateEl) {
      stateEl.textContent = this._getStateLabel(displayState);
    }

    this._syncVisualStateWithEntity(entity);
    this._updateVisuals();
    this._updateBatteryIndicator();
  }

  /**
   * Ensure the visual state never drifts from the actual entity state.
   * If HA says we're in a stable state (locked/unlocked/etc.), snap the
   * animation to that state and clear any lingering timers.
   */
  _syncVisualStateWithEntity(entity) {
    if (!entity) return;
    const normalized = this._normalizeState(entity.state);
    const stableStates = new Set(['locked', 'unlocked', 'jammed', 'unknown', 'unavailable']);
    if (!stableStates.has(normalized)) {
      return;
    }

    const isRequestedState = this._currentVisualState === 'lock-requested' || this._currentVisualState === 'unlock-requested';
    const pendingLock = this._pendingUserAction === 'lock';
    const pendingUnlock = this._pendingUserAction === 'unlock';
    const isRepeatOfSourceState = (pendingLock && normalized === 'unlocked') || (pendingUnlock && normalized === 'locked');
    if (isRequestedState && isRepeatOfSourceState) {
      // Ignore duplicate source-state updates while we wait for the actual transition
      return;
    }

    if (this._currentVisualState !== normalized) {
      if (this._animationTimer) {
        clearTimeout(this._animationTimer);
        this._animationTimer = null;
      }
      this._clearRequestedTimeout();
      this._requestedFallbackState = null;
      this._pendingUserAction = null;
      this._animationPhase = 'idle';
      this._currentVisualState = normalized;
    }

    if (normalized === 'locked' || normalized === 'unlocked') {
      this._lastStableActionState = normalized;
    }
  }

  /**
   * Update visual elements (icon, colors, animations)
   */
  _updateVisuals() {
    if (!this.shadowRoot) return;
    
    const iconContainer = this.shadowRoot.querySelector('.lock-icon-container');
    const lockIcon = this.shadowRoot.querySelector('.lock-icon');
    const card = this.shadowRoot.querySelector('.lock-card');
    const doorOpen = !!(this._doorInfo && this._doorInfo.isClosed === false);
    
    if (!iconContainer || !lockIcon) return;
    if (card) {
      card.classList.toggle('door-open', doorOpen);
    }
    iconContainer.classList.toggle('door-open', doorOpen);
    
    // Remove all state classes
    iconContainer.classList.remove(
      'locked', 'unlocked', 'locking', 'unlocking', 
      'lock-requested', 'unlock-requested',
      'jammed', 'unknown', 'transitioning'
    );
    
    // Add current visual state class
    iconContainer.classList.add(this._currentVisualState);
    
    // NEW LOGIC: Rotation waits for locking/unlocking/locked/unlocked
    // lock-requested doesn't rotate yet, unlock-requested doesn't rotate yet
    const isLockedRotation = ['locked', 'locking'].includes(this._currentVisualState);
    const isUnlockedRotation = ['unlocked', 'unlocking'].includes(this._currentVisualState);
    
    // NEW LOGIC: Slide happens on lock-requested (slides together early)
    // or ONLY on unlocked (slides apart late)
    const entity = this._hass?.states[this._config.entity];
    const entityState = entity?.state;
    
    let slideClass = null;
    // Slide together when lock-requested, locking, locked, unlock-requested, or unlocking
    if (['lock-requested', 'locking', 'locked', 'unlock-requested', 'unlocking'].includes(this._currentVisualState) || entityState === 'locked') {
      slideClass = 'slide-locked';
    } 
    // Slide apart ONLY when unlocked
    else if (this._currentVisualState === 'unlocked' || entityState === 'unlocked') {
      slideClass = 'slide-unlocked';
    }
    
    // Apply rotation class
    lockIcon.classList.remove('rotate-locked', 'rotate-unlocked', 'rotate-45');
    let rotationClass = null;
    if (isLockedRotation) {
      rotationClass = 'rotate-locked';
    } else if (isUnlockedRotation) {
      rotationClass = 'rotate-unlocked';
    }
    // lock-requested keeps unlocked rotation, unlock-requested keeps locked rotation
    else if (this._currentVisualState === 'lock-requested') {
      rotationClass = 'rotate-unlocked'; // Stay at 90° until locking/locked
    } else if (this._currentVisualState === 'unlock-requested') {
      rotationClass = 'rotate-locked'; // Stay at 0° until unlocking/unlocked
    }
    // Unknown and jammed get 45° rotation
    else if (['unknown', 'jammed', 'unavailable'].includes(this._currentVisualState)) {
      rotationClass = 'rotate-45';
    }

    if (rotationClass) {
      lockIcon.classList.add(rotationClass);
    }

    const directRotationClass = this._directRotationTarget === 'unlocked' ? 'rotate-unlocked'
      : this._directRotationTarget === 'locked' ? 'rotate-locked' : null;
    if (rotationClass && directRotationClass && rotationClass === directRotationClass) {
      const baseRotationDuration = this._config?.rotation_duration !== undefined ? this._config.rotation_duration : 3000;
      const adjustedRotationDuration = Math.round(baseRotationDuration * 0.25);
      lockIcon.style.setProperty('--rotation-timing-function', 'cubic-bezier(0.85, 0.05, 0.85, 1)');
      lockIcon.style.setProperty('--rotation-duration', `${adjustedRotationDuration}ms`);
      this._directRotationTarget = null;
    } else {
      lockIcon.style.removeProperty('--rotation-timing-function');
      lockIcon.style.removeProperty('--rotation-duration');
    }
    
    // Apply slide class (completely independent, based on actual entity state)
    // Only update if we have a definitive locked or unlocked state
    if (slideClass) {
      lockIcon.classList.remove('slide-locked', 'slide-unlocked');
      lockIcon.classList.add(slideClass);

      const baseSlideDuration = this._config?.slide_duration !== undefined ? this._config.slide_duration : 1000;
      let slideTiming = slideClass === 'slide-unlocked'
        ? 'cubic-bezier(0.6, 0, 1, 1)'
        : 'cubic-bezier(0.1, 0, 0.25, 1)';
      let adjustedDuration = slideClass === 'slide-unlocked'
        ? Math.round(baseSlideDuration * 0.8)
        : baseSlideDuration;

      lockIcon.style.setProperty('--slide-timing-function', slideTiming);
      lockIcon.style.setProperty('--slide-duration', `${adjustedDuration}ms`);
    } else {
      lockIcon.style.removeProperty('--slide-timing-function');
      lockIcon.style.removeProperty('--slide-duration');
    }
    // Otherwise, keep whatever slide position we had before
    
    // Don't regenerate SVG - it breaks CSS transitions!
    // SVG is created once in render()
    
    // Apply animation class if transitioning
    if (this._animationPhase === 'transitioning') {
      iconContainer.classList.add('animating');
    } else {
      iconContainer.classList.remove('animating');
    }
  }

  /**
   * Update the lock SVG based on current state
   */
  _updateLockSVG() {
    const lockIcon = this.shadowRoot.querySelector('.lock-icon');
    if (!lockIcon) return;
    
    lockIcon.innerHTML = this._getIconSVG(this._currentVisualState);
  }

  /**
   * Get human-readable state label
   */
  _getStateLabel(state) {
    const labels = {
      'locked': 'Locked',
      'unlocked': 'Unlocked',
      'lock-requested': 'Locking...',
      'locking': 'Locking...',
      'unlock-requested': 'Unlocking...',
      'unlocking': 'Unlocking...',
      'door-open': 'Open',
      'jammed': 'Jammed',
      'unknown': 'Unknown',
      'unavailable': 'Unavailable',
    };
    
    return labels[state.toLowerCase()] || state;
  }

  _getTapActionForState(state) {
    if (state === 'locked') {
      return this._config?.tap_action_locked || null;
    }
    if (state === 'unlocked') {
      return this._config?.tap_action_unlocked || null;
    }
    return null;
  }

  _executeTapAction(actionConfig, entity, state) {
    if (!actionConfig || actionConfig.action === 'none') {
      return;
    }

    switch (actionConfig.action) {
      case 'toggle':
        this._toggleLock(entity, state);
        break;
      case 'more-info':
        this._showMoreInfo();
        break;
      case 'call-service':
        this._callService(actionConfig);
        break;
      default:
        break;
    }
  }

  _getDoorEntity() {
    if (!this._config?.door_entity || !this._hass) {
      return null;
    }
    return this._hass.states[this._config.door_entity] || null;
  }

  _computeDoorInfo() {
    const entity = this._getDoorEntity();
    if (!entity) {
      return null;
    }

    const rawState = (entity.state || '').toString().toLowerCase();
    const closedStates = new Set(['off', 'closed', 'inactive', 'clear', 'standby', 'false', '0']);
    const openStates = new Set(['on', 'open', 'active', 'detected', 'true', '1']);

    let isClosed = false;
    if (closedStates.has(rawState)) {
      isClosed = true;
    } else if (openStates.has(rawState)) {
      isClosed = false;
    } else {
      // Default to "not safe" so we do not allow locking when sensor is unknown
      isClosed = false;
    }

    return {
      entity,
      rawState,
      isClosed,
    };
  }

  _isDoorClosed() {
    if (!this._doorInfo) {
      return true; // No door sensor configured
    }
    return this._doorInfo.isClosed;
  }

  _getBatteryEntity() {
    if (!this._config?.battery_entity || !this._hass) {
      return null;
    }
    return this._hass.states[this._config.battery_entity] || null;
  }

  _extractBatteryLevel(entity) {
    if (!entity) return null;
    const candidates = [
      entity.state,
      entity.attributes?.battery_level,
      entity.attributes?.battery,
      entity.attributes?.level,
      entity.attributes?.percentage,
    ];

    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null || candidate === '') continue;
      const parsed = parseFloat(candidate);
      if (!Number.isNaN(parsed)) {
        return Math.max(0, Math.min(100, parsed));
      }
    }
    return null;
  }

  _getBatteryColor(level) {
    const clamped = Math.max(0, Math.min(100, level || 0));
    const hue = (clamped / 100) * 120; // 0 => red, 120 => green
    return `hsl(${Math.round(hue)}, 80%, 50%)`;
  }

  _updateBatteryIndicator() {
    const indicator = this.shadowRoot?.querySelector('.battery-indicator');
    if (!indicator) return;

    const position = this._config?.battery_indicator_position || 'top-right';
    indicator.dataset.position = position;

    const batteryEntity = this._getBatteryEntity();
    const level = this._extractBatteryLevel(batteryEntity);
    const threshold = typeof this._config?.battery_threshold === 'number' ? this._config.battery_threshold : 35;

    if (!batteryEntity || level === null || level > threshold) {
      indicator.setAttribute('hidden', '');
      return;
    }

    const clamped = Math.max(0, Math.min(100, level));
    const color = this._getBatteryColor(clamped);
    const fill = indicator.querySelector('.battery-fill');
    const cap = indicator.querySelector('.battery-cap');
    const text = indicator.querySelector('.battery-text');

    if (fill) {
      fill.style.height = `${clamped}%`;
      fill.style.background = color;
    }
    if (cap) {
      cap.style.background = color;
    }
    if (text) {
      text.textContent = `${Math.round(clamped)}%`;
      text.style.color = color;
    }

    indicator.style.setProperty('--battery-indicator-color', color);
    indicator.removeAttribute('hidden');
  }

  _showInteractionBlockedFeedback() {
    const card = this.shadowRoot?.querySelector('.lock-card');
    if (!card) return;
    card.classList.add('interaction-blocked');
    if (this._interactionFeedbackTimer) {
      clearTimeout(this._interactionFeedbackTimer);
    }
    this._interactionFeedbackTimer = setTimeout(() => {
      card.classList.remove('interaction-blocked');
      this._interactionFeedbackTimer = null;
    }, 600);
  }

  _startRequestedTimeout(requestedState) {
    this._clearRequestedTimeout();
    const timeout = Math.max(500, this._config?.requested_timeout || 4000);
    if (requestedState === 'lock-requested' || requestedState === 'unlock-requested') {
      this._requestedFallbackState = this._lastStableActionState || (requestedState === 'lock-requested' ? 'unlocked' : 'locked');
      this._requestedTimeoutTimer = setTimeout(() => {
        if (this._currentVisualState === requestedState) {
          this._currentVisualState = this._requestedFallbackState || this._currentVisualState;
          this._animationPhase = 'idle';
          this._pendingUserAction = null;
          this._updateVisuals();
        }
        this._requestedTimeoutTimer = null;
      }, timeout);
    }
  }

  _clearRequestedTimeout() {
    if (this._requestedTimeoutTimer) {
      clearTimeout(this._requestedTimeoutTimer);
      this._requestedTimeoutTimer = null;
    }
  }

  /**
   * Get SVG icon for the current state
   * Uses viewBox for natural responsive scaling
   */
  _getIconSVG(state) {
    // Use viewBox coordinates for scalability
    // ViewBox: 0 0 100 100 (arbitrary square that will scale)
    const viewBoxSize = 100;
    const centerX = 50;
    const centerY = 50;
    const radius = 26; // Lock pieces radius
    const gap = 12; // Gap width in viewBox units
    const ringRadius = 45; // Ring radius - much larger than lock pieces (max size is 45)
    const ringWidth = 8; // Ring thickness in viewBox units (slightly thicker)
    const maskId = `lock-ring-mask-${this._instanceId}`;
    
    // Calculate chord endpoints for the gap
    const halfGap = gap / 2;
    const chordX = Math.sqrt(radius * radius - halfGap * halfGap);
    
    // Ring as single filled path (donut shape using fill-rule)
    const outerRadius = ringRadius + (ringWidth / 2);
    const innerRadius = ringRadius - (ringWidth / 2);
    const ring = `
      <circle class="lock-ring-base"
              cx="${centerX}"
              cy="${centerY}"
              r="${outerRadius}"
              fill="currentColor"
              opacity="0.6"
              mask="url(#${maskId})"/>
      <g class="lock-ring-gradient-group">
        <circle class="lock-ring-gradient"
                cx="${centerX}"
                cy="${centerY}"
                r="${ringRadius}"
                fill="none"
                stroke="url(#ring-gradient-requested)"
                stroke-width="${ringWidth}"
                opacity="0"/>
      </g>
    `;
    
    // Top piece: arc above the cut
    const semiCircle1 = `
      <path class="semi-circle semi-circle-1" 
            d="M ${centerX - chordX} ${centerY - halfGap}
               A ${radius} ${radius} 0 0 1 ${centerX + chordX} ${centerY - halfGap}
               L ${centerX - chordX} ${centerY - halfGap}
               Z" 
            fill="currentColor" 
            stroke="none"/>
    `;
    
    // Bottom piece: arc below the cut
    const semiCircle2 = `
      <path class="semi-circle semi-circle-2" 
            d="M ${centerX - chordX} ${centerY + halfGap}
               A ${radius} ${radius} 0 0 0 ${centerX + chordX} ${centerY + halfGap}
               L ${centerX - chordX} ${centerY + halfGap}
               Z" 
            fill="currentColor" 
            stroke="none"/>
    `;
    
    // Return SVG with viewBox for responsive scaling
    return `
      <svg viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="ring-gradient-requested">
            <stop offset="0%" style="stop-color: rgba(255, 255, 255, 0.1); stop-opacity: 1" />
            <stop offset="25%" style="stop-color: rgba(255, 255, 255, 0.35); stop-opacity: 1" />
            <stop offset="50%" style="stop-color: rgba(255, 255, 255, 0.45); stop-opacity: 1" />
            <stop offset="75%" style="stop-color: rgba(255, 255, 255, 0.35); stop-opacity: 1" />
            <stop offset="100%" style="stop-color: rgba(255, 255, 255, 0.1); stop-opacity: 1" />
          </linearGradient>
          <mask id="${maskId}" maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="${viewBoxSize}" height="${viewBoxSize}" fill="white" />
            <circle class="lock-ring-inner-mask"
                    cx="${centerX}"
                    cy="${centerY}"
                    r="${innerRadius}"
                    fill="black" />
          </mask>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <g class="lock-ring-group" transform-origin="${centerX} ${centerY}">
          ${ring}
        </g>
        <g class="lock-group" transform-origin="${centerX} ${centerY}">
          <g class="lock-center-group">
            ${semiCircle1}
            ${semiCircle2}
          </g>
        </g>
      </svg>
    `;
  }

  /**
   * Handle tap/click events
   */
  _handleTap(e) {
    e.stopPropagation();
    
    if (!this._hass || !this._config) return;
    
    const now = performance?.now ? performance.now() : Date.now();
    const debounceMs = Math.max(120, this._config?.tap_debounce || 350);
    if (now - this._lastTapTimestamp < debounceMs) {
      return;
    }
    this._lastTapTimestamp = now;

    const entity = this._hass.states[this._config.entity];
    if (!entity) return;

    if (!this._isDoorClosed()) {
      this._showInteractionBlockedFeedback();
      return;
    }

    const normalizedState = this._normalizeState(this._currentVisualState);
    const stableTapStates = new Set(['locked', 'unlocked']);
    if (!stableTapStates.has(normalizedState)) {
      this._showInteractionBlockedFeedback();
      return;
    }

    const actionConfig = this._getTapActionForState(normalizedState);
    if (!actionConfig || actionConfig.action === 'none') {
      this._showInteractionBlockedFeedback();
      return;
    }

    this._executeTapAction(actionConfig, entity, normalizedState);
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
   * Toggle lock state with optimistic UI
   */
  _toggleLock(entity, visualStateOverride = null) {
    const currentState = entity.state;
    const visualState = visualStateOverride || this._normalizeState(this._currentVisualState);
    const isLocked = visualState === 'locked';
    
    // Set user-initiated flag
    this._userInitiated = true;
    this._pendingUserAction = isLocked ? 'unlock' : 'lock';
    
    // Immediately show requested state for instant feedback
    const requestedState = isLocked ? 'unlock-requested' : 'lock-requested';
    this._currentVisualState = requestedState;
    this._animationPhase = 'transitioning';
    this._startRequestedTimeout(requestedState);
    this._updateVisuals();
    
    // Call the service
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
    
    const directionClass = this._config?.unlock_direction === 'clockwise' ? ' flip-horizontal' : '';
    
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100%;
          padding: 0;
          margin: 0;
          --state-inactive-color: var(--state-icon-color);
          --lock-locked-color: ${this._config?.color_locked || 'var(--state-lock-locked-color, var(--state-active-color, var(--success-color, #4caf50)))'};
          --lock-unlocked-color: ${this._config?.color_unlocked || 'var(--state-lock-unlocked-color, var(--error-color, #f44336))'}; 
          --lock-transitioning-color: ${this._config?.color_transitioning || 'var(--warning-color, #ff9800)'};
          --lock-jammed-color: ${this._config?.color_jammed || 'var(--state-lock-jammed-color, var(--warning-color, #ff5722))'}; 
          --lock-unknown-color: ${this._config?.color_unknown || 'var(--state-unavailable-color, var(--disabled-text-color, #9e9e9e))'};
          
          /* Responsive sizing variables */
          --lock-slide-offset: ${this._config?.offset_slide || 0};
          
          /* Animation durations */
          --rotation-duration: ${this._config?.rotation_duration || 3000}ms;
          --slide-duration: ${this._config?.slide_duration || 1000}ms;
        }
        
        /* Critical: prevent overflow in all flex children */
        :host,
        ha-card,
        .lock-card,
        .lock-content,
        .lock-icon-container {
          min-height: 0 !important;
          min-width: 0 !important;
        }
        
        ha-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          width: 100%;
          height: 100%;
          cursor: pointer;
          overflow: hidden;
          box-sizing: border-box;
          position: relative;
          padding: var(--ha-card-padding, 4% 0);
          --ha-ripple-color: var(--state-color, var(--state-icon-color, var(--primary-color)));
          --ha-ripple-hover-opacity: 0.06;
          --ha-ripple-pressed-opacity: 0.14;
        }

        ha-card:focus {
          outline: none;
        }

        ha-card::after {
          content: '';
          position: absolute;
          inset: 0;
          background: var(--ha-ripple-color);
          opacity: 0;
          pointer-events: none;
          transition: opacity 120ms ease;
        }

        ha-card:hover::after {
          opacity: var(--ha-ripple-hover-opacity);
        }

        ha-card:active::after,
        ha-card:focus-visible::after {
          opacity: var(--ha-ripple-pressed-opacity);
        }
        
        .lock-card {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          box-sizing: border-box;
          padding: 0 1rem;
          cursor: pointer;
          user-select: none;
          transition: transform 0.1s ease;
          flex: 1 1 auto;
        }
        
        .lock-card:active {
          transform: scale(0.98);
        }
        
        .lock-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          flex: 1 1 auto;
          min-height: 0;
          min-width: 0;
          position: relative;
          box-sizing: border-box;
        }

        .lock-icon-container {
          flex: 1 1 auto;
          width: 100%;
          max-height: 100%;
          overflow: visible;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          transition: all 2000ms cubic-bezier(0.4, 0, 0.2, 1);
          padding: 0 1rem;
        }

        .lock-icon-wrapper {
          height: min(80%, 280px);
          width: auto;
          max-width: min(90%, 320px);
          max-height: min(90%, 280px);
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.15s ease;
          --lock-direction-scale: 1;
          transform: scaleX(var(--lock-direction-scale));
        }

        .lock-icon-wrapper.flip-horizontal {
          --lock-direction-scale: -1;
        }

        ha-card:hover .lock-icon-wrapper,
        ha-card:focus-visible .lock-icon-wrapper {
          transform: scaleX(var(--lock-direction-scale)) scale(1.03);
        }

        .lock-icon {
          width: 100%;
          height: 100%;
          fill: currentColor;
          transition: transform 2000ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .lock-ring-group {
          transform-origin: 50px 50px;
          isolation: isolate; /* confine blend effects to the ring */
        }

        .lock-ring-inner-mask {
          transform-origin: 50px 50px;
          transform-box: fill-box;
          transition: transform 400ms cubic-bezier(0, 0, 0, 1);
        }

        .lock-icon-container.door-open .lock-ring-inner-mask {
          transform: scale(0.9);
        }
        
        .lock-group {
          transition: transform var(--rotation-duration) var(--rotation-timing-function, cubic-bezier(0.4, 0, 0.2, 1));
          transform-origin: 50px 50px;
        }

        .lock-center-group {
          transform-origin: 50px 50px;
          transition: opacity 220ms ease, transform 220ms ease;
        }
        
        /* Rotation states */
        .lock-icon.rotate-locked .lock-group {
          transform: rotate(0deg);
        }
        
        .lock-icon.rotate-unlocked .lock-group {
          transform: rotate(-90deg);
        }
        
        .lock-icon.rotate-45 .lock-group {
          transform: rotate(-45deg);
        }
        
        .semi-circle {
          transition: transform var(--slide-duration) var(--slide-timing-function, cubic-bezier(0.4, 0, 0.2, 1));
        }
        
        /* Slide is controlled ONLY by locked vs unlocked state */
        /* Slide uses percentage of container width to scale with SVG */
        
        /* Unlocked state - slide apart */
        .lock-icon.slide-unlocked .semi-circle-1 {
          transform: translateX(calc(var(--lock-slide-offset) * 30%));
        }
        
        .lock-icon.slide-unlocked .semi-circle-2 {
          transform: translateX(calc(var(--lock-slide-offset) * -30%));
        }
        
        /* Locked state - slide together */
        .lock-icon.slide-locked .semi-circle-1 {
          transform: translateX(0);
        }
        
        .lock-icon.slide-locked .semi-circle-2 {
          transform: translateX(0);
        }
        
        /* State-specific colors */
        .lock-icon-container.locked {
          color: var(--lock-locked-color);
        }
        
        .lock-icon-container.unlocked {
          color: var(--lock-unlocked-color);
        }
        
        .lock-icon-container.locking,
        .lock-icon-container.unlocking,
        .lock-icon-container.lock-requested,
        .lock-icon-container.unlock-requested {
          color: var(--lock-transitioning-color);
        }
        
        .lock-icon-container.jammed {
          color: var(--lock-jammed-color);
        }
        
        .lock-icon-container.unknown,
        .lock-icon-container.unavailable {
          color: var(--lock-unknown-color);
        }

        .lock-icon-container.door-open .lock-center-group {
          opacity: 0;
          transform: scale(0.85);
        }
        
        /* SVG ring styling */
        .lock-ring {
          transition: all 2000ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        /* Gradient overlay ring for requested states */
        .lock-icon-container.lock-requested .lock-ring-gradient,
        .lock-icon-container.unlock-requested .lock-ring-gradient {
          opacity: 1;
        }
        
        .lock-icon-container.lock-requested .lock-ring-gradient-group {
          animation: ring-rotate-cw ${this._config?.gradient_speed || 2}s linear infinite;
        }
        
        .lock-icon-container.unlock-requested .lock-ring-gradient-group {
          animation: ring-rotate-ccw ${this._config?.gradient_speed || 2}s linear infinite;
        }
        
        .lock-ring-gradient {
          transition: opacity 0.3s ease;
          mix-blend-mode: screen;
          stroke-linecap: round;
          stroke-linejoin: round;
          pointer-events: none;
        }
        
        .lock-ring-gradient-group {
          transform-origin: 50px 50px;
        }
        
        /* Breathing animation for jammed/unknown states */
        .lock-icon-container.jammed .lock-ring-base {
          animation: breathe 2s ease-in-out infinite;
        }
        
        .lock-icon-container.unknown .lock-ring-base,
        .lock-icon-container.unavailable .lock-ring-base {
          animation: breathe-subtle 2s ease-in-out infinite;
        }
        
        @keyframes ring-rotate-cw {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes ring-rotate-ccw {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-0.25em) rotate(-2deg); }
          75% { transform: translateX(0.25em) rotate(2deg); }
        }
        
        @keyframes breathe {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        
        @keyframes breathe-subtle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        
        .lock-name {
          font-size: clamp(0.875rem, 4vw, 1.125rem);
          font-weight: 500;
          color: var(--primary-text-color);
          margin: -1em 0 0;
          text-align: center;
          flex: 0 0 auto;
          min-height: 0;
        }
        
        .lock-state-text {
          font-size: clamp(0.75rem, 3vw, 0.875rem);
          color: var(--secondary-text-color);
          margin: 0;
          text-align: center;
          flex: 0 0 auto;
          min-height: 0;
        }

        .battery-indicator {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          padding: 0;
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--battery-indicator-color, #ffb74d);
          z-index: 2;
          min-width: auto;
          pointer-events: none;
        }

        .battery-indicator[hidden] {
          display: none;
        }

        .battery-indicator[data-position="top-right"] {
          top: 0.75rem;
          right: 0.75rem;
        }

        .battery-indicator[data-position="top-left"] {
          top: 0.75rem;
          left: 0.75rem;
        }

        .battery-indicator[data-position="bottom-right"] {
          bottom: 0.75rem;
          right: 0.75rem;
        }

        .battery-indicator[data-position="bottom-left"] {
          bottom: 0.75rem;
          left: 0.75rem;
        }

        .battery-body {
          position: relative;
          width: 14px;
          height: 38px;
          border-radius: 5px;
          border: 1.25px solid rgba(255, 255, 255, 0.35);
          overflow: hidden;
          background: rgba(255, 255, 255, 0.06);
          flex-shrink: 0;
        }

        .battery-fill {
          position: absolute;
          left: 0;
          bottom: 0;
          width: 100%;
          height: 50%;
          background: var(--battery-indicator-color, #ffb74d);
          transition: height 150ms ease, background 150ms ease;
        }

        .battery-cap {
          position: absolute;
          top: -5px;
          left: 50%;
          transform: translateX(-50%);
          width: 9px;
          height: 3px;
          border-radius: 2px;
          background: var(--battery-indicator-color, #ffb74d);
        }

        .battery-text {
          text-align: center;
          color: var(--battery-indicator-color, #ffb74d);
        }

        .lock-card.interaction-blocked {
          animation: shake 0.4s ease;
        }
        
        .hidden {
          display: none;
        }
      </style>
      
      <ha-card class="lock-card">
        <div class="battery-indicator" data-position="${this._config?.battery_indicator_position || 'top-right'}" hidden>
          <div class="battery-body" aria-hidden="true">
            <div class="battery-fill"></div>
            <span class="battery-cap"></span>
          </div>
          <span class="battery-text">--%</span>
        </div>
        <div class="lock-content">
          <div class="lock-icon-container">
            <div class="lock-icon-wrapper${directionClass}">
              <div class="lock-icon">${this._getIconSVG(this._currentVisualState)}</div>
            </div>
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

    this._updateBatteryIndicator();
  }

  /**
   * Return the card size for Home Assistant layout calculations
   */
  getCardSize() {
    return 3;
  }

  /**
   * Define default sizing for the sections/grid dashboard layout
   */
  getGridOptions() {
    return {
      rows: 2,
      columns: 6,
      min_rows: 2,
      min_columns: 2,
    };
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
    if (this._interactionFeedbackTimer) {
      clearTimeout(this._interactionFeedbackTimer);
      this._interactionFeedbackTimer = null;
    }
    this._clearRequestedTimeout();
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
    this._isRendered = false;
    this._colorInputs = {};
    this._lastConfigJSON = '';
  }

  setConfig(config) {
    const safeConfig = config || {};
    const incomingJSON = JSON.stringify(safeConfig);
    const hasRealChange = incomingJSON !== this._lastConfigJSON;

    this._config = { ...safeConfig };
    this._lastConfigJSON = incomingJSON;

    if (!this._isRendered) {
      this._render();
      return;
    }

    if (hasRealChange) {
      this._updateFormValues();
    }
  }

  set hass(hass) {
    this._hass = hass;
    
    // Update all selectors with hass if already rendered
    const selectors = this.shadowRoot?.querySelectorAll('ha-selector');
    if (selectors) {
      selectors.forEach(selector => {
        selector.hass = hass;
      });
    }
    if (this._isRendered) {
      this._updateFormValues();
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
          padding: 0;
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
          margin-bottom: 4px;
        }
        
        ha-selector {
          width: 100%;
        }
        
        paper-input,
        ha-textfield {
          width: 100%;
        }

        .color-picker-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .color-picker-row input[type="color"] {
          appearance: none;
          border: none;
          padding: 0;
          width: 48px;
          height: 32px;
          background: transparent;
          cursor: pointer;
        }

        .color-picker-row input[type="color"]::-webkit-color-swatch-wrapper {
          padding: 0;
        }

        .color-picker-row input[type="color"]::-webkit-color-swatch,
        .color-picker-row input[type="color"]::-moz-color-swatch {
          border-radius: 6px;
          border: 1px solid var(--divider-color);
        }

        .color-picker-row ha-textfield {
          flex: 1;
        }
        
        .number-input {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .number-input paper-input,
        .number-input ha-textfield {
          flex: 1;
        }
        
        .number-input span {
          font-size: 12px;
          color: var(--secondary-text-color);
          white-space: nowrap;
        }
        
        .section-header {
          font-weight: 500;
          font-size: 16px;
          color: var(--primary-text-color);
          margin-top: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--divider-color);
        }
        
        .section-header.expandable {
          cursor: pointer;
          user-select: none;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .section-header.expandable::before {
          content: '▶';
          font-size: 12px;
          transition: transform 0.2s;
        }
        
        .section-header.expandable.expanded::before {
          transform: rotate(90deg);
        }
        
        .section-content {
          display: none;
          flex-direction: column;
          gap: 16px;
          margin-top: 16px;
        }
        
        .section-content.expanded {
          display: flex;
        }
        
        .switch-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 40px;
        }
        
        .switch-row .label-wrapper {
          flex: 1;
        }
        
        ha-switch {
          padding: 8px;
        }
      </style>
      
      <div class="card-config">
        <div class="option">
          <label>Entity (Required)</label>
          <div class="description">Select a lock entity</div>
        </div>
        <div class="option">
          <div class="name-input"></div>
        </div>
        
        <div class="section-header">Display Options</div>
        
        <div class="option">
          <div class="switch-row">
            <div class="label-wrapper">
              <label>Show Name</label>
              <div class="description">Display the lock name below the icon</div>
            </div>
            <div class="show-name-switch"></div>
          </div>
        </div>
        
        <div class="option">
          <div class="switch-row">
            <div class="label-wrapper">
              <label>Show State</label>
              <div class="description">Display the current state text</div>
            </div>
            <div class="show-state-switch"></div>
          </div>
        </div>

        <div class="section-header expandable">Door Sensor (Optional)</div>
        <div class="section-content door-section">
          <div class="option">
            <label>Door / Contact Entity</label>
            <div class="description">Binary sensor that reports whether the door is closed</div>
            <div class="door-entity-input"></div>
          </div>
        </div>

        <div class="section-header expandable">Battery Indicator (Optional)</div>
        <div class="section-content battery-section">
          <div class="option">
            <label>Battery Entity</label>
            <div class="description">Sensor that reports battery percentage (0-100)</div>
            <div class="battery-entity-input"></div>
          </div>
          <div class="option">
            <label>Show Threshold</label>
            <div class="description">Only show the indicator when the battery is at or below this percentage</div>
            <div class="number-input">
              <div class="battery-threshold-input" style="flex: 1;"></div>
              <span>%</span>
            </div>
          </div>
          <div class="option">
            <label>Indicator Position</label>
            <div class="description">Choose which corner displays the warning pill</div>
            <div class="battery-position-selector"></div>
          </div>
        </div>
        
        <div class="section-header expandable">Color Settings</div>
        <div class="section-content">
          <div class="option">
            <label>Locked Color</label>
            <div class="description">Color when lock is locked (default: green #4caf50)</div>
            <div class="color-locked-input"></div>
          </div>
          
          <div class="option">
            <label>Unlocked Color</label>
            <div class="description">Color when lock is unlocked (default: red #f44336)</div>
            <div class="color-unlocked-input"></div>
          </div>
          
          <div class="option">
            <label>Transitioning Color</label>
            <div class="description">Color during locking/unlocking (default: orange #ff9800)</div>
            <div class="color-transitioning-input"></div>
          </div>
          
          <div class="option">
            <label>Jammed Color</label>
            <div class="description">Color when lock is jammed (default: red-orange #ff5722)</div>
            <div class="color-jammed-input"></div>
          </div>
          
          <div class="option">
            <label>Unknown Color</label>
            <div class="description">Color when state is unknown (default: gray #9e9e9e)</div>
            <div class="color-unknown-input"></div>
          </div>
        </div>
        
        <div class="section-header expandable">Animation Settings</div>
        <div class="section-content">
        
        <div class="option">
          <label>Unlock Direction</label>
          <div class="description">Flip the entire animation horizontally to match your hardware</div>
          <div class="unlock-direction-selector"></div>
        </div>

        <div class="option">
          <label>Animation Duration</label>
          <div class="description">Duration of lock/unlock animations in milliseconds</div>
          <div class="number-input">
            <div class="animation-input" style="flex: 1;"></div>
            <span>ms</span>
          </div>
        </div>

        <div class="option">
          <label>Rotation Duration</label>
          <div class="description">Duration for lock rotation animation</div>
          <div class="number-input">
            <div class="rotation-duration-input" style="flex: 1;"></div>
            <span>ms</span>
          </div>
        </div>

        <div class="option">
          <label>Slide Duration</label>
          <div class="description">Duration for semi-circle slide animation</div>
          <div class="number-input">
            <div class="slide-duration-input" style="flex: 1;"></div>
            <span>ms</span>
          </div>
        </div>
        
        <div class="option">
          <label>Gradient Rotation Speed</label>
          <div class="description">Speed of the spinning gradient during requested states</div>
          <div class="number-input">
            <div class="gradient-speed-input" style="flex: 1;"></div>
            <span>seconds</span>
          </div>
        </div>
        
        <div class="option">
          <label>Slide Offset</label>
          <div class="description">Distance semi-circles slide apart when unlocked (0.0-1.0, can be negative)</div>
          <div class="number-input">
            <div class="offset-slide-input" style="flex: 1;"></div>
          </div>
        </div>
        
        </div>
        
        <div class="section-header expandable">Actions</div>
        <div class="section-content">
          <div class="option">
            <label>Tap Action (Locked State)</label>
            <div class="description">Action to perform when tapped while the lock reports locked</div>
            <div class="tap-locked-action-selector"></div>
          </div>

          <div class="option">
            <label>Tap Action (Unlocked State)</label>
            <div class="description">Action to perform when tapped while the lock reports unlocked</div>
            <div class="tap-unlocked-action-selector"></div>
          </div>

          <div class="option">
            <label>Hold Action</label>
            <div class="description">Action to perform when the card is held</div>
            <div class="hold-action-selector"></div>
          </div>

          <div class="option">
            <label>Requested State Timeout</label>
            <div class="description">Milliseconds before a requested state snaps back if no update arrives</div>
            <div class="number-input">
              <div class="requested-timeout-input" style="flex: 1;"></div>
              <span>ms</span>
            </div>
          </div>
        </div>
        

      </div>
    `;

    this._renderElements();
    this._setupAdvancedToggle();
    this._isRendered = true;
    this._updateFormValues();
  }
  
  _setupAdvancedToggle() {
    const expandableHeaders = this.shadowRoot.querySelectorAll('.section-header.expandable');
    
    expandableHeaders.forEach((header, index) => {
      const content = header.nextElementSibling;
      
      if (content && content.classList.contains('section-content')) {
        header.addEventListener('click', () => {
          header.classList.toggle('expanded');
          content.classList.toggle('expanded');
        });
      }
    });
  }

  _renderElements() {
    // Entity selector
    const entitySelector = document.createElement('ha-selector');
    entitySelector.hass = this._hass;
    entitySelector.selector = { entity: { domain: 'lock' } };
    entitySelector.value = this._config.entity || '';
    entitySelector.label = 'Entity';
    entitySelector.addEventListener('value-changed', this._entityChanged.bind(this));
    this._entitySelector = entitySelector;
    
    const entityContainer = this.shadowRoot.querySelector('.option');
    entityContainer.appendChild(entitySelector);

    // Name input
    const nameInput = document.createElement('ha-selector');
    nameInput.hass = this._hass;
    nameInput.selector = { text: { } };
    nameInput.value = this._config.name || '';
    nameInput.label = 'Name';
    nameInput.addEventListener('value-changed', this._nameChanged.bind(this));
    this._nameInput = nameInput;
    
    const nameContainer = this.shadowRoot.querySelector('.name-input');
    nameContainer.appendChild(nameInput);

    // Show name switch
    const showNameSwitch = document.createElement('ha-switch');
    showNameSwitch.checked = this._config.show_name !== false;
    showNameSwitch.addEventListener('change', this._showNameChanged.bind(this));
    this._showNameSwitch = showNameSwitch;
    
    const showNameContainer = this.shadowRoot.querySelector('.show-name-switch');
    showNameContainer.appendChild(showNameSwitch);

    // Show state switch
    const showStateSwitch = document.createElement('ha-switch');
    showStateSwitch.checked = this._config.show_state !== false;
    showStateSwitch.addEventListener('change', this._showStateChanged.bind(this));
    this._showStateSwitch = showStateSwitch;
    
    const showStateContainer = this.shadowRoot.querySelector('.show-state-switch');
    showStateContainer.appendChild(showStateSwitch);

    // Door entity selector
    const doorEntitySelector = document.createElement('ha-selector');
    doorEntitySelector.hass = this._hass;
    doorEntitySelector.selector = {
      entity: {
        domain: ['binary_sensor', 'sensor'],
        device_class: ['door', 'opening', 'window', 'lock']
      }
    };
    doorEntitySelector.value = this._config.door_entity || '';
    doorEntitySelector.label = 'Door Entity';
    doorEntitySelector.addEventListener('value-changed', this._doorEntityChanged.bind(this));
    this._doorEntitySelector = doorEntitySelector;
    const doorEntityContainer = this.shadowRoot.querySelector('.door-entity-input');
    if (doorEntityContainer) {
      doorEntityContainer.appendChild(doorEntitySelector);
    }

    // Battery entity selector
    const batteryEntitySelector = document.createElement('ha-selector');
    batteryEntitySelector.hass = this._hass;
    batteryEntitySelector.selector = {
      entity: {
        domain: ['sensor', 'binary_sensor'],
        device_class: ['battery']
      }
    };
    batteryEntitySelector.value = this._config.battery_entity || '';
    batteryEntitySelector.label = 'Battery Entity';
    batteryEntitySelector.addEventListener('value-changed', this._batteryEntityChanged.bind(this));
    this._batteryEntitySelector = batteryEntitySelector;
    const batteryEntityContainer = this.shadowRoot.querySelector('.battery-entity-input');
    if (batteryEntityContainer) {
      batteryEntityContainer.appendChild(batteryEntitySelector);
    }

    const batteryThresholdInput = document.createElement('ha-selector');
    batteryThresholdInput.hass = this._hass;
    batteryThresholdInput.selector = {
      number: {
        min: 0,
        max: 100,
        step: 1,
        mode: 'box'
      }
    };
    batteryThresholdInput.value = this._config.battery_threshold !== undefined ? this._config.battery_threshold : 35;
    batteryThresholdInput.addEventListener('value-changed', this._batteryThresholdChanged.bind(this));
    this._batteryThresholdInput = batteryThresholdInput;
    const batteryThresholdContainer = this.shadowRoot.querySelector('.battery-threshold-input');
    if (batteryThresholdContainer) {
      batteryThresholdContainer.appendChild(batteryThresholdInput);
    }

    const batteryPositionSelector = document.createElement('ha-selector');
    batteryPositionSelector.hass = this._hass;
    batteryPositionSelector.selector = {
      select: {
        options: [
          { value: 'top-right', label: 'Top Right' },
          { value: 'top-left', label: 'Top Left' },
          { value: 'bottom-right', label: 'Bottom Right' },
          { value: 'bottom-left', label: 'Bottom Left' }
        ]
      }
    };
    batteryPositionSelector.value = this._config.battery_indicator_position || 'top-right';
    batteryPositionSelector.addEventListener('value-changed', this._batteryPositionChanged.bind(this));
    this._batteryPositionSelector = batteryPositionSelector;
    const batteryPositionContainer = this.shadowRoot.querySelector('.battery-position-selector');
    if (batteryPositionContainer) {
      batteryPositionContainer.appendChild(batteryPositionSelector);
    }

    // Animation duration
    const animationInput = document.createElement('ha-selector');
    animationInput.hass = this._hass;
    animationInput.selector = { 
      number: { 
        min: 100, 
        max: 1000, 
        step: 50,
        mode: 'box',
        unit_of_measurement: 'ms'
      } 
    };
    animationInput.value = this._config.animation_duration || 400;
    animationInput.addEventListener('value-changed', this._animationDurationChanged.bind(this));
    this._animationDurationInput = animationInput;
    
    const animationContainer = this.shadowRoot.querySelector('.animation-input');
    animationContainer.appendChild(animationInput);

    // Color inputs
    const colorConfigs = [
      { name: 'locked', default: '#4caf50', label: 'Locked Color' },
      { name: 'unlocked', default: '#f44336', label: 'Unlocked Color' },
      { name: 'transitioning', default: '#ff9800', label: 'Transitioning Color' },
      { name: 'jammed', default: '#ff5722', label: 'Jammed Color' },
      { name: 'unknown', default: '#9e9e9e', label: 'Unknown Color' }
    ];

    this._colorInputs = {};
    
    colorConfigs.forEach(colorConfig => {
      const container = this.shadowRoot.querySelector(`.color-${colorConfig.name}-input`);
      if (!container) {
        return;
      }

      const row = document.createElement('div');
      row.classList.add('color-picker-row');

      const colorPicker = document.createElement('input');
      colorPicker.type = 'color';
      colorPicker.ariaLabel = colorConfig.label;

      const textInput = document.createElement('ha-textfield');
      textInput.label = colorConfig.label;
      textInput.placeholder = colorConfig.default;

      const currentValue = this._config[`color_${colorConfig.name}`] || colorConfig.default;
      const normalizedDefault = this._normalizeHexColor(colorConfig.default) || '#ffffff';
      const normalizedCurrent = this._normalizeHexColor(currentValue) || normalizedDefault;
      colorPicker.value = normalizedCurrent;
      textInput.value = currentValue;

      colorPicker.addEventListener('input', (event) => {
        const value = event.target.value;
        textInput.value = value;
        this._colorChanged(colorConfig.name, value);
      });

      textInput.addEventListener('value-changed', (event) => {
        const value = event.detail.value;
        this._colorChanged(colorConfig.name, value);
        const normalized = this._normalizeHexColor(value);
        if (normalized) {
          colorPicker.value = normalized;
        }
      });

      row.appendChild(colorPicker);
      row.appendChild(textInput);
      container.appendChild(row);

      this._colorInputs[colorConfig.name] = {
        picker: colorPicker,
        text: textInput,
        default: colorConfig.default,
      };
    });

    const tapLockedSelector = document.createElement('ha-selector');
    tapLockedSelector.hass = this._hass;
    tapLockedSelector.selector = { ui_action: { } };
    tapLockedSelector.value = this._getEffectiveTapAction('locked');
    tapLockedSelector.addEventListener('value-changed', this._tapLockedActionChanged.bind(this));
    this._tapLockedActionSelector = tapLockedSelector;
    const tapLockedContainer = this.shadowRoot.querySelector('.tap-locked-action-selector');
    tapLockedContainer.appendChild(tapLockedSelector);

    const tapUnlockedSelector = document.createElement('ha-selector');
    tapUnlockedSelector.hass = this._hass;
    tapUnlockedSelector.selector = { ui_action: { } };
    tapUnlockedSelector.value = this._getEffectiveTapAction('unlocked');
    tapUnlockedSelector.addEventListener('value-changed', this._tapUnlockedActionChanged.bind(this));
    this._tapUnlockedActionSelector = tapUnlockedSelector;
    const tapUnlockedContainer = this.shadowRoot.querySelector('.tap-unlocked-action-selector');
    tapUnlockedContainer.appendChild(tapUnlockedSelector);

    const requestedTimeoutInput = document.createElement('ha-selector');
    requestedTimeoutInput.hass = this._hass;
    requestedTimeoutInput.selector = {
      number: {
        min: 500,
        max: 15000,
        step: 250,
        mode: 'box',
        unit_of_measurement: 'ms',
      }
    };
    requestedTimeoutInput.value = this._config.requested_timeout !== undefined ? this._config.requested_timeout : 15000;
    requestedTimeoutInput.addEventListener('value-changed', this._requestedTimeoutChanged.bind(this));
    this._requestedTimeoutInput = requestedTimeoutInput;
    const requestedTimeoutContainer = this.shadowRoot.querySelector('.requested-timeout-input');
    requestedTimeoutContainer.appendChild(requestedTimeoutInput);

    // Hold action selector
    const holdActionSelector = document.createElement('ha-selector');
    holdActionSelector.hass = this._hass;
    holdActionSelector.selector = { ui_action: { } };
    holdActionSelector.value = this._config.hold_action || { action: 'more-info' };
    holdActionSelector.addEventListener('value-changed', this._holdActionChanged.bind(this));
    this._holdActionSelector = holdActionSelector;
    
    const holdActionContainer = this.shadowRoot.querySelector('.hold-action-selector');
    holdActionContainer.appendChild(holdActionSelector);
    
    // Advanced settings
    
    // Rotation duration input
    const rotationDurationInput = document.createElement('ha-selector');
    rotationDurationInput.hass = this._hass;
    rotationDurationInput.selector = { 
      number: { 
        min: 500, 
        max: 10000, 
        step: 100,
        mode: 'box'
      } 
    };
    rotationDurationInput.value = this._config.rotation_duration !== undefined ? this._config.rotation_duration : 3000;
    rotationDurationInput.addEventListener('value-changed', this._rotationDurationChanged.bind(this));
    this._rotationDurationInput = rotationDurationInput;
    
    const rotationDurationContainer = this.shadowRoot.querySelector('.rotation-duration-input');
    if (rotationDurationContainer) {
      rotationDurationContainer.appendChild(rotationDurationInput);
    }
    
    // Slide duration input
    const slideDurationInput = document.createElement('ha-selector');
    slideDurationInput.hass = this._hass;
    slideDurationInput.selector = { 
      number: { 
        min: 100, 
        max: 5000, 
        step: 100,
        mode: 'box'
      } 
    };
    slideDurationInput.value = this._config.slide_duration !== undefined ? this._config.slide_duration : 1000;
    slideDurationInput.addEventListener('value-changed', this._slideDurationChanged.bind(this));
    this._slideDurationInput = slideDurationInput;
    
    const slideDurationContainer = this.shadowRoot.querySelector('.slide-duration-input');
    if (slideDurationContainer) {
      slideDurationContainer.appendChild(slideDurationInput);
    }
    
    // Unlock direction selector
    const unlockDirectionSelector = document.createElement('ha-selector');
    unlockDirectionSelector.hass = this._hass;
    unlockDirectionSelector.selector = { 
      select: {
        options: [
          { value: 'counterclockwise', label: 'Counter-clockwise' },
          { value: 'clockwise', label: 'Clockwise' }
        ]
      }
    };
    unlockDirectionSelector.value = this._config.unlock_direction || 'counterclockwise';
    unlockDirectionSelector.addEventListener('value-changed', this._unlockDirectionChanged.bind(this));
    this._unlockDirectionSelector = unlockDirectionSelector;
    
    const unlockDirectionContainer = this.shadowRoot.querySelector('.unlock-direction-selector');
    unlockDirectionContainer.appendChild(unlockDirectionSelector);
    
    // Offset slide input
    const offsetSlideInput = document.createElement('ha-selector');
    offsetSlideInput.hass = this._hass;
    offsetSlideInput.selector = { 
      number: { 
        min: -1.0, 
        max: 1.0, 
        step: 0.05,
        mode: 'box'
      } 
    };
    offsetSlideInput.value = this._config.offset_slide !== undefined ? this._config.offset_slide : 0.3;
    offsetSlideInput.addEventListener('value-changed', this._offsetSlideChanged.bind(this));
    this._offsetSlideInput = offsetSlideInput;
    
    const offsetSlideContainer = this.shadowRoot.querySelector('.offset-slide-input');
    offsetSlideContainer.appendChild(offsetSlideInput);
    
    // Gradient speed input
    const gradientSpeedInput = document.createElement('ha-selector');
    gradientSpeedInput.hass = this._hass;
    gradientSpeedInput.selector = { 
      number: { 
        min: 0.5, 
        max: 10, 
        step: 0.5,
        mode: 'box'
      } 
    };
    gradientSpeedInput.value = this._config.gradient_speed !== undefined ? this._config.gradient_speed : 2;
    gradientSpeedInput.addEventListener('value-changed', this._gradientSpeedChanged.bind(this));
    this._gradientSpeedInput = gradientSpeedInput;
    
    const gradientSpeedContainer = this.shadowRoot.querySelector('.gradient-speed-input');
    gradientSpeedContainer.appendChild(gradientSpeedInput);
  }

  _updateFormValues() {
    if (!this._config) return;
    if (this._entitySelector) {
      this._entitySelector.value = this._config.entity || '';
    }
    if (this._nameInput) {
      this._nameInput.value = this._config.name || '';
    }
    if (this._showNameSwitch) {
      this._showNameSwitch.checked = this._config.show_name !== false;
    }
    if (this._showStateSwitch) {
      this._showStateSwitch.checked = this._config.show_state !== false;
    }
    if (this._doorEntitySelector) {
      this._doorEntitySelector.value = this._config.door_entity || '';
    }
    if (this._batteryEntitySelector) {
      this._batteryEntitySelector.value = this._config.battery_entity || '';
    }
    if (this._batteryThresholdInput) {
      this._batteryThresholdInput.value = this._config.battery_threshold !== undefined ? this._config.battery_threshold : 35;
    }
    if (this._batteryPositionSelector) {
      this._batteryPositionSelector.value = this._config.battery_indicator_position || 'top-right';
    }
    if (this._animationDurationInput) {
      this._animationDurationInput.value = this._config.animation_duration || 400;
    }
    if (this._rotationDurationInput) {
      this._rotationDurationInput.value = this._config.rotation_duration !== undefined ? this._config.rotation_duration : 3000;
    }
    if (this._slideDurationInput) {
      this._slideDurationInput.value = this._config.slide_duration !== undefined ? this._config.slide_duration : 1000;
    }
    if (this._unlockDirectionSelector) {
      this._unlockDirectionSelector.value = this._config.unlock_direction || 'counterclockwise';
    }
    if (this._offsetSlideInput) {
      this._offsetSlideInput.value = this._config.offset_slide !== undefined ? this._config.offset_slide : 0.3;
    }
    if (this._gradientSpeedInput) {
      this._gradientSpeedInput.value = this._config.gradient_speed !== undefined ? this._config.gradient_speed : 2;
    }
    if (this._tapLockedActionSelector) {
      this._tapLockedActionSelector.value = this._getEffectiveTapAction('locked');
    }
    if (this._tapUnlockedActionSelector) {
      this._tapUnlockedActionSelector.value = this._getEffectiveTapAction('unlocked');
    }
    if (this._holdActionSelector) {
      this._holdActionSelector.value = this._config.hold_action || { action: 'more-info' };
    }
    if (this._requestedTimeoutInput) {
      this._requestedTimeoutInput.value = this._config.requested_timeout !== undefined ? this._config.requested_timeout : 4000;
    }
    Object.entries(this._colorInputs || {}).forEach(([key, refs]) => {
      if (!refs) return;
      const storedValue = this._config[`color_${key}`] || refs.default;
      if (refs.text) {
        refs.text.value = storedValue;
      }
      const normalized = this._normalizeHexColor(storedValue) || this._normalizeHexColor(refs.default);
      if (refs.picker && normalized) {
        refs.picker.value = normalized;
      }
    });
  }

  _getEffectiveTapAction(state) {
    const config = this._config || {};
    const baseAction = config.tap_action || { action: 'toggle' };
    const key = state === 'locked' ? 'tap_action_locked' : 'tap_action_unlocked';
    let action = config[key] || baseAction;
    const allowKey = state === 'locked' ? 'allow_locked_action' : 'allow_unlocked_action';
    if (config[allowKey] === false && !config[key]) {
      action = { action: 'none' };
    }
    if (!action || typeof action !== 'object' || action.action === undefined) {
      action = { action: 'toggle' };
    }
    return action;
  }

  _entityChanged(ev) {
    if (!this._config || !this._hass) return;
    
    const newConfig = { ...this._config, entity: ev.detail.value };
    this._updateConfig(newConfig);
  }

  _nameChanged(ev) {
    if (!this._config) return;
    
    const newConfig = { ...this._config };
    const value = ev.detail.value;
    if (value) {
      newConfig.name = value;
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
    
    const value = ev.detail.value;
    if (value !== undefined && value >= 100 && value <= 1000) {
      const newConfig = { ...this._config, animation_duration: value };
      this._updateConfig(newConfig);
    }
  }

  _colorChanged(colorName, value) {
    if (!this._config) return;
    const newConfig = { ...this._config };
    const configKey = `color_${colorName}`;
    if (value) {
      newConfig[configKey] = value;
    } else {
      delete newConfig[configKey];
    }
    this._updateConfig(newConfig);
  }

  _normalizeHexColor(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (/^#([0-9a-fA-F]{6})$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    const shortMatch = trimmed.match(/^#([0-9a-fA-F]{3})$/);
    if (shortMatch) {
      const expanded = shortMatch[1]
        .split('')
        .map((char) => `${char}${char}`)
        .join('');
      return `#${expanded.toLowerCase()}`;
    }
    return null;
  }

  _tapLockedActionChanged(ev) {
    if (!this._config) return;
    const newConfig = { ...this._config, tap_action_locked: ev.detail.value };
    this._updateConfig(newConfig);
  }

  _tapUnlockedActionChanged(ev) {
    if (!this._config) return;
    const newConfig = { ...this._config, tap_action_unlocked: ev.detail.value };
    this._updateConfig(newConfig);
  }

  _holdActionChanged(ev) {
    if (!this._config) return;
    
    const newConfig = { ...this._config, hold_action: ev.detail.value };
    this._updateConfig(newConfig);
  }

  _requestedTimeoutChanged(ev) {
    if (!this._config) return;
    const value = ev.detail.value;
    if (typeof value === 'number' && value >= 500 && value <= 15000) {
      const newConfig = { ...this._config, requested_timeout: value };
      this._updateConfig(newConfig);
    }
  }

  _doorEntityChanged(ev) {
    if (!this._config) return;
    const value = ev.detail.value;
    const newConfig = { ...this._config, door_entity: value || null };
    this._updateConfig(newConfig);
  }

  _batteryEntityChanged(ev) {
    if (!this._config) return;
    const value = ev.detail.value;
    const newConfig = { ...this._config, battery_entity: value || null };
    this._updateConfig(newConfig);
  }

  _batteryThresholdChanged(ev) {
    if (!this._config) return;
    const value = ev.detail.value;
    if (typeof value === 'number' && value >= 0 && value <= 100) {
      const newConfig = { ...this._config, battery_threshold: value };
      this._updateConfig(newConfig);
    }
  }

  _batteryPositionChanged(ev) {
    if (!this._config) return;
    const value = ev.detail.value || 'top-right';
    const newConfig = { ...this._config, battery_indicator_position: value };
    this._updateConfig(newConfig);
  }
  
  _unlockDirectionChanged(ev) {
    if (!this._config) return;
    
    const newConfig = { ...this._config, unlock_direction: ev.detail.value };
    this._updateConfig(newConfig);
  }
  
  _offsetSlideChanged(ev) {
    if (!this._config) return;
    
    const value = ev.detail.value;
    if (value !== undefined && value >= -1.0 && value <= 1.0) {
      const newConfig = { ...this._config, offset_slide: value };
      this._updateConfig(newConfig);
    }
  }
  
  _gradientSpeedChanged(ev) {
    if (!this._config) return;
    
    const value = ev.detail.value;
    if (value !== undefined && value >= 0.5 && value <= 10) {
      const newConfig = { ...this._config, gradient_speed: value };
      this._updateConfig(newConfig);
    }
  }
  
  _rotationDurationChanged(ev) {
    if (!this._config) return;
    
    const value = ev.detail.value;
    if (value !== undefined && value >= 500 && value <= 10000) {
      const newConfig = { ...this._config, rotation_duration: value };
      this._updateConfig(newConfig);
    }
  }
  
  _slideDurationChanged(ev) {
    if (!this._config) return;
    
    const value = ev.detail.value;
    if (value !== undefined && value >= 100 && value <= 5000) {
      const newConfig = { ...this._config, slide_duration: value };
      this._updateConfig(newConfig);
    }
  }

  _updateConfig(newConfig) {
    this._config = newConfig;
    this._lastConfigJSON = JSON.stringify(newConfig);
    
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
  '%c SEXY-LOCK-CARD %c 2.0.1 ',
  'color: white; background: #4caf50; font-weight: 700;',
  'color: #4caf50; background: white; font-weight: 700;'
);
