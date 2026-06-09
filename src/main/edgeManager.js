const { screen } = require('electron');

class EdgeManager {
  constructor(floatWindow) {
    this.win = floatWindow;
    this.state = 'FREE'; // FREE | SNAPPING | SNAPPED | HIDING | HIDDEN
    this.snappedEdge = null; // 'left' | 'right' | 'top' | 'bottom'
    this.snappedDisplay = null;
    this.hideTimer = null;
    this.triggerZoneSize = 4; // pixels visible when hidden
    this.snapThreshold = 20; // px distance to trigger snap
    this.hideDelay = 3000; // ms after snap before auto-hide
    this.mousePollInterval = null;
    this.mouseLeaveInterval = null;
    this.savedBounds = null;
    this.isAnimating = false;
    this.enabled = true;
  }

  // Load settings from database
  loadSettings(db) {
    const settings = db.getSettings();
    this.enabled = settings.edge_snap_enabled !== false; // default true
    this.hideDelay = settings.edge_hide_delay || 3000;
    this.snapThreshold = settings.edge_snap_threshold || 20;
  }

  // Save settings to database
  saveSettings(db, settings) {
    db.saveSettings(settings);
    if (settings.edge_snap_enabled !== undefined) {
      this.enabled = settings.edge_snap_enabled;
    }
    if (settings.edge_hide_delay !== undefined) {
      this.hideDelay = settings.edge_hide_delay;
    }
    if (settings.edge_snap_threshold !== undefined) {
      this.snapThreshold = settings.edge_snap_threshold;
    }
    // If disabled, un-snap
    if (!this.enabled && this.state !== 'FREE') {
      this.unSnap();
    }
  }

  // Get current settings
  getSettings() {
    return {
      edge_snap_enabled: this.enabled,
      edge_hide_delay: this.hideDelay,
      edge_snap_threshold: this.snapThreshold,
    };
  }

  // Detect which edge the window is near
  detectEdge(bounds) {
    if (!this.enabled) return null;

    const displays = screen.getAllDisplays();
    for (const display of displays) {
      const wa = display.workArea;
      const threshold = this.snapThreshold;

      // Check all four edges
      if (Math.abs(bounds.x - wa.x) <= threshold) {
        return { edge: 'left', display };
      }
      if (Math.abs((bounds.x + bounds.width) - (wa.x + wa.width)) <= threshold) {
        return { edge: 'right', display };
      }
      if (Math.abs(bounds.y - wa.y) <= threshold) {
        return { edge: 'top', display };
      }
      if (Math.abs((bounds.y + bounds.height) - (wa.y + wa.height)) <= threshold) {
        return { edge: 'bottom', display };
      }
    }
    return null;
  }

  // Called when window moves
  onWindowMoved() {
    if (this.isAnimating) return;
    if (this.state === 'HIDDEN' || this.state === 'HIDING') return;

    const bounds = this.win.getBounds();
    const detected = this.detectEdge(bounds);

    if (detected && this.state === 'FREE') {
      this.snappedDisplay = detected.display;
      this.snapToEdge(detected.edge, detected.display.workArea);
    }

    // If user drags away while snapped, un-snap
    if (!detected && this.state === 'SNAPPED') {
      this.unSnap();
    }
  }

  // Called when window resizes
  onWindowResized() {
    if (this.isAnimating) return;
    if (this.state === 'SNAPPED' || this.state === 'HIDDEN') {
      this.realignToEdge();
    }
  }

  // Snap window to edge with animation
  snapToEdge(edge, workArea) {
    if (!edge || !workArea) {
      console.error('[EdgeManager] Invalid snap parameters:', edge, workArea);
      return;
    }

    this.isAnimating = true;
    this.savedBounds = this.win.getBounds();
    this.snappedEdge = edge;

    const [w, h] = this.win.getSize();
    const [curX, curY] = this.win.getPosition();
    let targetX, targetY;

    switch (edge) {
      case 'left':
        targetX = workArea.x;
        targetY = curY;
        break;
      case 'right':
        targetX = workArea.x + workArea.width - w;
        targetY = curY;
        break;
      case 'top':
        targetX = curX;
        targetY = workArea.y;
        break;
      case 'bottom':
        targetX = curX;
        targetY = workArea.y + workArea.height - h;
        break;
      default:
        console.error('[EdgeManager] Unknown edge:', edge);
        this.isAnimating = false;
        return;
    }

    // Validate target coordinates
    if (typeof targetX !== 'number' || typeof targetY !== 'number' ||
        isNaN(targetX) || isNaN(targetY)) {
      console.error('[EdgeManager] Invalid target coordinates:', targetX, targetY);
      this.isAnimating = false;
      return;
    }

    this.animateTo(targetX, targetY, 200, () => {
      this.isAnimating = false;
      this.state = 'SNAPPED';
      this.notifyRenderer();
      this.startHideTimer();
    });
  }

  // Re-align window to snapped edge (after resize)
  realignToEdge() {
    if (!this.snappedEdge || !this.snappedDisplay) return;

    const wa = this.snappedDisplay.workArea;
    const [w, h] = this.win.getSize();
    const [curX, curY] = this.win.getPosition();
    let targetX, targetY;

    switch (this.snappedEdge) {
      case 'left':
        targetX = wa.x;
        targetY = curY;
        break;
      case 'right':
        targetX = wa.x + wa.width - w;
        targetY = curY;
        break;
      case 'top':
        targetX = curX;
        targetY = wa.y;
        break;
      case 'bottom':
        targetX = curX;
        targetY = wa.y + wa.height - h;
        break;
    }

    this.win.setPosition(targetX, targetY, false);
  }

  // Start auto-hide timer
  startHideTimer() {
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => {
      this.hideWindow();
    }, this.hideDelay);
  }

  // Clear auto-hide timer
  clearHideTimer() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  // Hide window (slide off-screen)
  hideWindow() {
    if (this.state !== 'SNAPPED') return;
    if (!this.snappedDisplay || !this.snappedEdge) {
      console.error('[EdgeManager] Missing snap state for hide');
      return;
    }

    this.clearHideTimer();
    this.state = 'HIDING';

    const wa = this.snappedDisplay.workArea;
    const [w, h] = this.win.getSize();
    const [curX, curY] = this.win.getPosition();
    let targetX, targetY;

    switch (this.snappedEdge) {
      case 'left':
        targetX = wa.x - w + this.triggerZoneSize;
        targetY = curY;
        break;
      case 'right':
        targetX = wa.x + wa.width - this.triggerZoneSize;
        targetY = curY;
        break;
      case 'top':
        targetX = curX;
        targetY = wa.y - h + this.triggerZoneSize;
        break;
      case 'bottom':
        targetX = curX;
        targetY = wa.y + wa.height - this.triggerZoneSize;
        break;
      default:
        console.error('[EdgeManager] Unknown edge for hide:', this.snappedEdge);
        this.state = 'SNAPPED';
        return;
    }

    this.animateTo(targetX, targetY, 250, () => {
      this.state = 'HIDDEN';
      this.notifyRenderer();
      this.startMousePolling();
    });
  }

  // Show window (slide back on-screen)
  showWindow() {
    if (this.state !== 'HIDDEN') return;
    if (!this.snappedDisplay || !this.snappedEdge) {
      console.error('[EdgeManager] Missing snap state for show');
      return;
    }

    this.stopMousePolling();
    this.state = 'HIDING';

    const wa = this.snappedDisplay.workArea;
    const [w, h] = this.win.getSize();
    let targetX, targetY;

    switch (this.snappedEdge) {
      case 'left':
        targetX = wa.x;
        targetY = this.win.getPosition()[1];
        break;
      case 'right':
        targetX = wa.x + wa.width - w;
        targetY = this.win.getPosition()[1];
        break;
      case 'top':
        targetX = this.win.getPosition()[0];
        targetY = wa.y;
        break;
      case 'bottom':
        targetX = this.win.getPosition()[0];
        targetY = wa.y + wa.height - h;
        break;
      default:
        console.error('[EdgeManager] Unknown edge for show:', this.snappedEdge);
        this.state = 'SNAPPED';
        return;
    }

    this.animateTo(targetX, targetY, 250, () => {
      this.state = 'SNAPPED';
      this.notifyRenderer();
      this.startMouseLeaveWatcher();
    });
  }

  // Toggle hide/show
  toggleHide() {
    if (this.state === 'SNAPPED') {
      this.hideWindow();
    } else if (this.state === 'HIDDEN') {
      this.showWindow();
    }
  }

  // Un-snap: restore to free state
  unSnap() {
    this.state = 'FREE';
    this.snappedEdge = null;
    this.snappedDisplay = null;
    this.clearHideTimer();
    this.stopMousePolling();
    this.stopMouseLeaveWatcher();
    this.notifyRenderer();
  }

  // Start mouse polling for trigger zone
  startMousePolling() {
    this.stopMousePolling();
    this.mousePollInterval = setInterval(() => {
      const point = screen.getCursorScreenPoint();
      if (this.isMouseInTriggerZone(point)) {
        this.showWindow();
      }
    }, 50);
  }

  // Stop mouse polling
  stopMousePolling() {
    if (this.mousePollInterval) {
      clearInterval(this.mousePollInterval);
      this.mousePollInterval = null;
    }
  }

  // Check if mouse is in trigger zone
  isMouseInTriggerZone(point) {
    if (!this.snappedDisplay) return false;

    const wa = this.snappedDisplay.workArea;
    const zone = this.triggerZoneSize + 2;

    switch (this.snappedEdge) {
      case 'left':
        return point.x <= wa.x + zone;
      case 'right':
        return point.x >= wa.x + wa.width - zone;
      case 'top':
        return point.y <= wa.y + zone;
      case 'bottom':
        return point.y >= wa.y + wa.height - zone;
    }
    return false;
  }

  // Start mouse leave watcher
  startMouseLeaveWatcher() {
    this.stopMouseLeaveWatcher();
    this.mouseLeaveInterval = setInterval(() => {
      if (this.state !== 'SNAPPED') {
        this.stopMouseLeaveWatcher();
        return;
      }

      const point = screen.getCursorScreenPoint();
      const bounds = this.win.getBounds();
      const margin = 30;

      const insideWindow =
        point.x >= bounds.x - margin &&
        point.x <= bounds.x + bounds.width + margin &&
        point.y >= bounds.y - margin &&
        point.y <= bounds.y + bounds.height + margin;

      if (!insideWindow) {
        this.stopMouseLeaveWatcher();
        this.hideTimer = setTimeout(() => this.hideWindow(), 500);
      }
    }, 100);
  }

  // Stop mouse leave watcher
  stopMouseLeaveWatcher() {
    if (this.mouseLeaveInterval) {
      clearInterval(this.mouseLeaveInterval);
      this.mouseLeaveInterval = null;
    }
  }

  // Animate window position
  animateTo(targetX, targetY, duration, callback) {
    // Validate parameters
    if (typeof targetX !== 'number' || typeof targetY !== 'number' ||
        isNaN(targetX) || isNaN(targetY)) {
      console.error('[EdgeManager] Invalid animation target:', targetX, targetY);
      if (callback) callback();
      return;
    }

    const startX = this.win.getPosition()[0];
    const startY = this.win.getPosition()[1];
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const ease = t * (2 - t); // easeOutQuad

      const curX = Math.round(startX + (targetX - startX) * ease);
      const curY = Math.round(startY + (targetY - startY) * ease);

      // Ensure values are valid integers
      if (isNaN(curX) || isNaN(curY)) {
        console.error('[EdgeManager] Animation produced NaN values');
        if (callback) callback();
        return;
      }

      this.win.setPosition(curX, curY, false);

      if (t < 1) {
        setTimeout(animate, 16);
      } else {
        if (callback) callback();
      }
    };
    animate();
  }

  // Notify renderer of state change
  notifyRenderer() {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('edge:stateChanged', {
        snapped: this.state === 'SNAPPED' || this.state === 'HIDDEN',
        edge: this.snappedEdge,
        hidden: this.state === 'HIDDEN',
      });
    }
  }

  // Get state for persistence
  getState() {
    if (this.state !== 'FREE' && this.snappedEdge && this.snappedDisplay) {
      return {
        edge: this.snappedEdge,
        displayId: this.snappedDisplay.id,
        bounds: this.win.getBounds(),
      };
    }
    return null;
  }

  // Restore state from persistence
  restoreState(state) {
    if (!state || !state.edge) return;

    const displays = screen.getAllDisplays();
    let display = displays.find(d => d.id === state.displayId);
    if (!display) {
      display = screen.getPrimaryDisplay();
    }

    this.snappedDisplay = display;
    this.snappedEdge = state.edge;

    // Position window at snapped edge
    const wa = display.workArea;
    const [w, h] = this.win.getSize();
    let targetX, targetY;

    switch (state.edge) {
      case 'left':
        targetX = wa.x;
        targetY = wa.y + Math.round((wa.height - h) / 2);
        break;
      case 'right':
        targetX = wa.x + wa.width - w;
        targetY = wa.y + Math.round((wa.height - h) / 2);
        break;
      case 'top':
        targetX = wa.x + Math.round((wa.width - w) / 2);
        targetY = wa.y;
        break;
      case 'bottom':
        targetX = wa.x + Math.round((wa.width - w) / 2);
        targetY = wa.y + wa.height - h;
        break;
    }

    this.win.setPosition(targetX, targetY, false);
    this.state = 'SNAPPED';
    this.notifyRenderer();
    this.startHideTimer();
  }

  // Cleanup
  destroy() {
    this.clearHideTimer();
    this.stopMousePolling();
    this.stopMouseLeaveWatcher();
  }
}

module.exports = EdgeManager;
