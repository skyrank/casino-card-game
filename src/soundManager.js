// soundManager.js - Handles all audio for the Casino game

class SoundManager {
  constructor() {
    this.sounds = {};
    this.audioUnlocked = false;

    // localStorage can return null in iframe contexts (itch.io).
    // Default to TRUE (sound on) if no preference has been saved yet.
    const stored = localStorage.getItem('casinoSoundEnabled');
    this.enabled = stored === null ? true : stored === 'true';

    // Unlock audio on the first user gesture (required in iframes).
    // We bind once to touchstart, touchend, and click.
    this._boundUnlock = this._unlockAudio.bind(this);
    document.addEventListener('touchstart', this._boundUnlock, { once: true });
    document.addEventListener('touchend',   this._boundUnlock, { once: true });
    document.addEventListener('click',      this._boundUnlock, { once: true });
  }

  // Play a silent sound to unlock the audio pipeline in iframe/mobile browsers.
  _unlockAudio() {
    if (this.audioUnlocked) return;

    // Create and immediately play a silent Audio element
    const silent = new Audio();
    silent.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAA' +
                 'EAAQAAgD4AAAB9AAACABAAZGFUYQQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    silent.volume = 0;
    silent.play()
      .then(() => {
        this.audioUnlocked = true;
        console.log('[Casino] Audio unlocked.');
        // Remove remaining listeners (once:true handles it, but belt-and-suspenders)
        document.removeEventListener('touchstart', this._boundUnlock);
        document.removeEventListener('touchend',   this._boundUnlock);
        document.removeEventListener('click',      this._boundUnlock);
      })
      .catch(err => {
        console.log('[Casino] Silent unlock failed:', err);
      });
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
    this.loadSound('trail', '/sounds/trail.mp3');
  }

  // Play a sound if enabled
  play(soundName) {
    if (!this.enabled || !this.sounds[soundName]) return;

    const sound = this.sounds[soundName].cloneNode();
    sound.volume = 0.5;
    sound.play().catch(err => {
      console.log('[Casino] Audio play failed:', err);
    });
  }

  // Toggle sound on/off
  toggle() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem('casinoSoundEnabled', this.enabled);
    } catch(e) {
      // localStorage may be blocked in some iframe contexts — fail silently
    }
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
