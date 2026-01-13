// soundManager.js - Handles all audio for the Casino game

class SoundManager {
  constructor() {
    this.sounds = {};
    this.enabled = localStorage.getItem('casinoSoundEnabled') === 'true';
  }

  // Load a sound file
  loadSound(name, path) {
    this.sounds[name] = new Audio(path);
    this.sounds[name].preload = 'auto';
  }

  // Initialize all game sounds
  init() {
    this.loadSound('cardSelect', '/sounds/card-select.mp3');
    this.loadSound('tableSelect', '/sounds/table-select.mp3');
    this.loadSound('capture', '/sounds/capture.mp3');
  }

  // Play a sound if enabled
  play(soundName) {
    if (!this.enabled || !this.sounds[soundName]) return;
    
    // Clone the audio to allow overlapping sounds
    const sound = this.sounds[soundName].cloneNode();
    sound.volume = 0.5; // Adjust volume as needed (0.0 to 1.0)
    sound.play().catch(err => {
      console.log('Audio play failed:', err);
    });
  }

  // Toggle sound on/off
  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('casinoSoundEnabled', this.enabled);
    return this.enabled;
  }

  // Check if sound is enabled
  isEnabled() {
    return this.enabled;
  }

  // Set volume for all sounds (0.0 to 1.0)
  setVolume(level) {
    Object.values(this.sounds).forEach(sound => {
      sound.volume = level;
    });
  }
}

// Create singleton instance
const soundManager = new SoundManager();

export default soundManager;
