// Poki SDK Integration for Casino Card Game
// Documentation: https://sdk.poki.com/

class PokiSDK {
  constructor() {
    this.isInitialized = false;
    this.isPokiEnvironment = this.detectPokiEnvironment();
  }

  // Detect if we're running in Poki's environment
  detectPokiEnvironment() {
    // Check if Poki SDK script is loaded
    return typeof window.PokiSDK !== 'undefined';
  }

  // Initialize SDK
  async init() {
    if (this.isInitialized) {
      console.log('[Poki] SDK already initialized - skipping');
      return;
    }

    if (!this.isPokiEnvironment) {
      console.log('[Poki] Not in Poki environment - SDK disabled');
      return;
    }

    try {
      await window.PokiSDK.init();
      this.isInitialized = true;
      console.log('[Poki] SDK initialized successfully');
    } catch (error) {
      console.error('[Poki] SDK initialization failed:', error);
    }
  }

  // Call when gameplay starts (user starts playing)
  gameplayStart() {
    if (!this.isInitialized) return;
    
    try {
      window.PokiSDK.gameplayStart();
      console.log('[Poki] Gameplay started');
    } catch (error) {
      console.error('[Poki] gameplayStart error:', error);
    }
  }

  // Call when gameplay stops (pause, menu, game over)
  gameplayStop() {
    if (!this.isInitialized) return;
    
    try {
      window.PokiSDK.gameplayStop();
      console.log('[Poki] Gameplay stopped');
    } catch (error) {
      console.error('[Poki] gameplayStop error:', error);
    }
  }

  // Show commercial break (between rounds/games)
  async commercialBreak() {
    if (!this.isInitialized) {
      console.log('[Poki] Commercial break skipped (not in Poki)');
      return;
    }

    try {
      await window.PokiSDK.commercialBreak();
      console.log('[Poki] Commercial break completed');
    } catch (error) {
      console.error('[Poki] commercialBreak error:', error);
    }
  }

  // Show rewarded ad (optional - for bonus features)
  async rewardedBreak() {
    if (!this.isInitialized) {
      console.log('[Poki] Rewarded break skipped (not in Poki)');
      return false;
    }

    try {
      const result = await window.PokiSDK.rewardedBreak();
      console.log('[Poki] Rewarded break:', result ? 'completed' : 'skipped');
      return result;
    } catch (error) {
      console.error('[Poki] rewardedBreak error:', error);
      return false;
    }
  }

  // Display ad (generic ad display)
  async displayAd() {
    if (!this.isInitialized) return;
    
    try {
      await window.PokiSDK.displayAd();
      console.log('[Poki] Ad displayed');
    } catch (error) {
      console.error('[Poki] displayAd error:', error);
    }
  }
}

// Export singleton instance
export const pokiSdk = new PokiSDK();
