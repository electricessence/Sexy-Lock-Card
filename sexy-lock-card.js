/**
 * Sexy Lock Card - Animated Lock Card for Home Assistant
 * A custom Lovelace card with smooth state transitions and animations
 * 
 * @license MIT
 * @version 1.2.2
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
    this._userInitiated = false; // Track if state change was user-initiated
    this._pendingUserAction = null; // 'lock' or 'unlock'
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
    
    // Clear any existing animation
    if (this._animationTimer) {
      clearTimeout(this._animationTimer);
      this._animationTimer = null;
    }
    
    // If there's a pending user action and entity confirms it, clear the flag
    if (this._pendingUserAction) {
      if ((this._pendingUserAction === 'lock' && (to === 'locking' || to === 'locked')) ||
          (this._pendingUserAction === 'unlock' && (to === 'unlocking' || to === 'unlocked'))) {
        this._userInitiated = false;
        this._pendingUserAction = null;
      }
    }
    
    // Get the state path from current to target
    const statePath = this._getStatePath(from, to);
    
    if (statePath.length > 1) {
      // Animate through each state in the path
      this._animateThroughPath(statePath);
    } else {
      // Direct transition
      this._currentVisualState = to;
      this._animationPhase = 'idle';
      this._updateVisuals();
    }
  }

  /**
   * Get the state path from current state to target state
   * State cycle: unlocked → lock-requested → locking → locked → unlock-requested → unlocking → unlocked
   */
  _getStatePath(from, to) {
    // Define the full state cycle
    const stateOrder = [
      'unlocked',
      'lock-requested',
      'locking', 
      'locked',
      'unlock-requested',
      'unlocking'
    ];
    
    // Special states that don't participate in the cycle
    if (to === 'jammed' || to === 'unknown' || to === 'unavailable') {
      return [to];
    }
    
    // Find positions in the cycle
    const fromIndex = stateOrder.indexOf(from);
    const toIndex = stateOrder.indexOf(to);
    
    // If either state is not in the cycle, do direct transition
    if (fromIndex === -1 || toIndex === -1) {
      return [to];
    }
    
    // If already at target, no transition needed
    if (fromIndex === toIndex) {
      return [];
    }
    
    // Skip lock-requested/unlock-requested when not user-initiated
    // If backend goes directly to locking/unlocking, don't show requested state
    if (!this._userInitiated) {
      if (from === 'unlocked' && to === 'locking') {
        return [to]; // Direct jump, skip lock-requested
      }
      if (from === 'locked' && to === 'unlocking') {
        return [to]; // Direct jump, skip unlock-requested
      }
    }
    
    // Calculate the path
    const path = [];
    let currentIndex = fromIndex;
    
    // Calculate distances for both directions
    let forwardDistance, backwardDistance;
    
    if (toIndex > fromIndex) {
      forwardDistance = toIndex - fromIndex;
      backwardDistance = (fromIndex + stateOrder.length - toIndex);
    } else {
      forwardDistance = (toIndex + stateOrder.length - fromIndex);
      backwardDistance = fromIndex - toIndex;
    }
    
    // Choose the shorter path
    const goForward = forwardDistance <= backwardDistance;
    
    if (goForward) {
      // Move forward through states
      while (currentIndex !== toIndex) {
        currentIndex = (currentIndex + 1) % stateOrder.length;
        path.push(stateOrder[currentIndex]);
      }
    } else {
      // Move backward through states
      while (currentIndex !== toIndex) {
        currentIndex = (currentIndex - 1 + stateOrder.length) % stateOrder.length;
        path.push(stateOrder[currentIndex]);
      }
    }
    
    return path;
  }

  /**
   * Animate through a path of states
   */
  _animateThroughPath(path) {
    if (path.length === 0) return;
    
    const duration = this._config.animation_duration;
    const stepDuration = duration / path.length;
    
    let currentStep = 0;
    
    const animateNextStep = () => {
      if (currentStep >= path.length) {
        this._animationPhase = 'idle';
        this._userInitiated = false;
        this._pendingUserAction = null;
        this._updateVisuals();
        return;
      }
      
      this._currentVisualState = path[currentStep];
      this._animationPhase = currentStep < path.length - 1 ? 'transitioning' : 'complete';
      this._updateVisuals();
      
      currentStep++;
      
      if (currentStep < path.length) {
        this._animationTimer = setTimeout(animateNextStep, stepDuration);
      } else {
        // Final state reached
        this._animationTimer = setTimeout(() => {
          this._animationPhase = 'idle';
          this._userInitiated = false;
          this._pendingUserAction = null;
          this._updateVisuals();
        }, stepDuration);
      }
    };
    
    // Start animation
    this._animationPhase = 'transitioning';
    animateNextStep();
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
    const lockIcon = this.shadowRoot.querySelector('.lock-icon');
    
    if (!iconContainer || !lockIcon) return;
    
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
    if (isLockedRotation) {
      lockIcon.classList.add('rotate-locked');
    } else if (isUnlockedRotation) {
      lockIcon.classList.add('rotate-unlocked');
    }
    // lock-requested keeps unlocked rotation, unlock-requested keeps locked rotation
    else if (this._currentVisualState === 'lock-requested') {
      lockIcon.classList.add('rotate-unlocked'); // Stay at 90° until locking/locked
    } else if (this._currentVisualState === 'unlock-requested') {
      lockIcon.classList.add('rotate-locked'); // Stay at 0° until unlocking/unlocked
    }
    // Unknown and jammed get 45° rotation
    else if (['unknown', 'jammed', 'unavailable'].includes(this._currentVisualState)) {
      lockIcon.classList.add('rotate-45');
    }
    
    // Apply slide class (completely independent, based on actual entity state)
    // Only update if we have a definitive locked or unlocked state
    if (slideClass) {
      lockIcon.classList.remove('slide-locked', 'slide-unlocked');
      lockIcon.classList.add(slideClass);
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
      'jammed': 'Jammed',
      'unknown': 'Unknown',
      'unavailable': 'Unavailable',
    };
    
    return labels[state.toLowerCase()] || state;
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
    const radius = 28; // Lock pieces radius
    const gap = 12; // Gap width in viewBox units
    const ringRadius = 46; // Ring radius - much larger than lock pieces
    const ringWidth = 5; // Ring thickness in viewBox units (slightly thicker)
    
    // Calculate chord endpoints for the gap
    const halfGap = gap / 2;
    const chordX = Math.sqrt(radius * radius - halfGap * halfGap);
    
    // Ring as single filled path (donut shape using fill-rule)
    const outerRadius = ringRadius + (ringWidth / 2);
    const innerRadius = ringRadius - (ringWidth / 2);
    const ringPath = `M ${centerX},${centerY - outerRadius}
               A ${outerRadius},${outerRadius} 0 1,1 ${centerX},${centerY + outerRadius}
               A ${outerRadius},${outerRadius} 0 1,1 ${centerX},${centerY - outerRadius}
               Z
               M ${centerX},${centerY - innerRadius}
               A ${innerRadius},${innerRadius} 0 1,0 ${centerX},${centerY + innerRadius}
               A ${innerRadius},${innerRadius} 0 1,0 ${centerX},${centerY - innerRadius}
               Z`;
    
    const ring = `
      <path class="lock-ring-base" 
            d="${ringPath}"
            fill="currentColor"
            fill-rule="evenodd"
            opacity="0.6"/>
      <g class="lock-ring-gradient-group">
        <path class="lock-ring-gradient" 
              d="${ringPath}"
              fill="url(#ring-gradient-requested)"
              fill-rule="evenodd"
              style="mix-blend-mode: screen;"
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
            <stop offset="0%" style="stop-color: rgba(255, 255, 255, 0.2); stop-opacity: 1" />
            <stop offset="25%" style="stop-color: rgba(255, 255, 255, 0.5); stop-opacity: 1" />
            <stop offset="50%" style="stop-color: rgba(255, 255, 255, 0.7); stop-opacity: 1" />
            <stop offset="75%" style="stop-color: rgba(255, 255, 255, 0.5); stop-opacity: 1" />
            <stop offset="100%" style="stop-color: rgba(255, 255, 255, 0.2); stop-opacity: 1" />
          </linearGradient>
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
          ${semiCircle1}
          ${semiCircle2}
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
   * Toggle lock state with optimistic UI
   */
  _toggleLock(entity) {
    const currentState = entity.state;
    const isLocked = currentState === 'locked';
    
    // Set user-initiated flag
    this._userInitiated = true;
    this._pendingUserAction = isLocked ? 'unlock' : 'lock';
    
    // Immediately show requested state for instant feedback
    const requestedState = isLocked ? 'unlock-requested' : 'lock-requested';
    this._currentVisualState = requestedState;
    this._animationPhase = 'transitioning';
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
    
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
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
        
        ha-card {
          width: 100%;
          height: 100%;
          cursor: pointer;
          overflow: hidden;
          box-sizing: border-box;
          position: relative;
          padding: var(--ha-card-padding, 0);
        }
        
        .lock-card {
          padding: 1em;
          cursor: pointer;
          user-select: none;
          transition: transform 0.1s ease;
          height: 100%;
          width: 100%;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }
        
        .lock-card:active {
          transform: scale(0.98);
        }
        
        .lock-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: clamp(0.5em, 2vh, 1em);
          flex: 1 1 auto;
          min-height: 0;
          min-width: 0;
          width: 100%;
          position: relative;
        }
        
        .lock-icon-container {
          flex: 1 1 0;
          max-width: 100%;
          max-height: 100%;
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          position: relative;
          transition: all 2000ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .lock-icon {
          width: 100%;
          height: 100%;
          fill: currentColor;
          transition: transform 2000ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .lock-ring-group {
          transform-origin: 50px 50px;
        }
        
        .lock-group {
          transition: transform var(--rotation-duration) cubic-bezier(0.4, 0, 0.2, 1);
          transform-origin: 50px 50px;
        }
        
        /* Rotation states */
        .lock-icon.rotate-locked .lock-group {
          transform: rotate(0deg);
        }
        
        .lock-icon.rotate-unlocked .lock-group {
          transform: rotate(${this._config?.unlock_direction === 'counterclockwise' ? '-' : ''}90deg);
        }
        
        .lock-icon.rotate-45 .lock-group {
          transform: rotate(${this._config?.unlock_direction === 'counterclockwise' ? '-' : ''}45deg);
        }
        
        .semi-circle {
          transition: transform var(--slide-duration) cubic-bezier(0.4, 0, 0.2, 1);
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
          margin: 0;
          text-align: center;
          flex-shrink: 0;
          min-height: 0;
        }
        
        .lock-state-text {
          font-size: clamp(0.75rem, 3vw, 0.875rem);
          color: var(--secondary-text-color);
          margin: 0;
          text-align: center;
          flex-shrink: 0;
          min-height: 0;
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
    
    // Initialize the SVG content
    const lockIcon = this.shadowRoot.querySelector('.lock-icon');
    if (lockIcon) {
      lockIcon.innerHTML = this._getIconSVG(this._currentVisualState);
    }
    
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
    
    // Update all selectors with hass if already rendered
    const selectors = this.shadowRoot?.querySelectorAll('ha-selector');
    if (selectors) {
      selectors.forEach(selector => {
        selector.hass = hass;
      });
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
        
        <div class="section-header">Animation Settings</div>
        
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
          <label>Unlock Direction</label>
          <div class="description">Direction to rotate when unlocking</div>
          <div class="unlock-direction-selector"></div>
        </div>
        
        <div class="option">
          <label>Slide Offset</label>
          <div class="description">Distance semi-circles slide apart when unlocked (0.0-1.0, can be negative)</div>
          <div class="number-input">
            <div class="offset-slide-input" style="flex: 1;"></div>
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
        
        <div class="section-header expandable">Actions</div>
        <div class="section-content">
          <div class="option">
            <label>Tap Action</label>
            <div class="description">Action to perform when card is tapped</div>
            <div class="tap-action-selector"></div>
          </div>
          
          <div class="option">
            <label>Hold Action</label>
            <div class="description">Action to perform when card is held</div>
            <div class="hold-action-selector"></div>
          </div>
        </div>
        

      </div>
    `;

    this._renderElements();
    this._setupAdvancedToggle();
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
    if (!this._hass) return;

    // Entity selector
    const entitySelector = document.createElement('ha-selector');
    entitySelector.hass = this._hass;
    entitySelector.selector = { entity: { domain: 'lock' } };
    entitySelector.value = this._config.entity || '';
    entitySelector.label = 'Entity';
    entitySelector.addEventListener('value-changed', this._entityChanged.bind(this));
    
    const entityContainer = this.shadowRoot.querySelector('.option');
    entityContainer.appendChild(entitySelector);

    // Name input
    const nameInput = document.createElement('ha-selector');
    nameInput.hass = this._hass;
    nameInput.selector = { text: { } };
    nameInput.value = this._config.name || '';
    nameInput.label = 'Name';
    nameInput.addEventListener('value-changed', this._nameChanged.bind(this));
    
    const nameContainer = this.shadowRoot.querySelector('.name-input');
    nameContainer.appendChild(nameInput);

    // Show name switch
    const showNameSwitch = document.createElement('ha-switch');
    showNameSwitch.checked = this._config.show_name !== false;
    showNameSwitch.addEventListener('change', this._showNameChanged.bind(this));
    
    const showNameContainer = this.shadowRoot.querySelector('.show-name-switch');
    showNameContainer.appendChild(showNameSwitch);

    // Show state switch
    const showStateSwitch = document.createElement('ha-switch');
    showStateSwitch.checked = this._config.show_state !== false;
    showStateSwitch.addEventListener('change', this._showStateChanged.bind(this));
    
    const showStateContainer = this.shadowRoot.querySelector('.show-state-switch');
    showStateContainer.appendChild(showStateSwitch);

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
    
    colorConfigs.forEach(colorConfig => {
      const colorInput = document.createElement('ha-selector');
      colorInput.hass = this._hass;
      colorInput.selector = { 
        text: { 
          type: 'text'
        } 
      };
      colorInput.value = this._config[`color_${colorConfig.name}`] || colorConfig.default;
      colorInput.label = colorConfig.label;
      colorInput.addEventListener('value-changed', (e) => {
        this._colorChanged(colorConfig.name, e);
      });
      
      const colorContainer = this.shadowRoot.querySelector(`.color-${colorConfig.name}-input`);
      if (colorContainer) {
        colorContainer.appendChild(colorInput);
      }
    });

    // Tap action selector
    const tapActionSelector = document.createElement('ha-selector');
    tapActionSelector.hass = this._hass;
    tapActionSelector.selector = { ui_action: { } };
    tapActionSelector.value = this._config.tap_action || { action: 'toggle' };
    tapActionSelector.addEventListener('value-changed', this._tapActionChanged.bind(this));
    
    const tapActionContainer = this.shadowRoot.querySelector('.tap-action-selector');
    tapActionContainer.appendChild(tapActionSelector);

    // Hold action selector
    const holdActionSelector = document.createElement('ha-selector');
    holdActionSelector.hass = this._hass;
    holdActionSelector.selector = { ui_action: { } };
    holdActionSelector.value = this._config.hold_action || { action: 'more-info' };
    holdActionSelector.addEventListener('value-changed', this._holdActionChanged.bind(this));
    
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
    
    const gradientSpeedContainer = this.shadowRoot.querySelector('.gradient-speed-input');
    gradientSpeedContainer.appendChild(gradientSpeedInput);
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

  _colorChanged(colorName, ev) {
    if (!this._config) return;
    
    const value = ev.detail.value;
    const newConfig = { ...this._config };
    const configKey = `color_${colorName}`;
    
    if (value) {
      newConfig[configKey] = value;
    } else {
      delete newConfig[configKey];
    }
    this._updateConfig(newConfig);
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
  '%c SEXY-LOCK-CARD %c 1.2.1 ',
  'color: white; background: #4caf50; font-weight: 700;',
  'color: #4caf50; background: white; font-weight: 700;'
);
