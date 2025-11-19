export class SoundManager {
  private audioContext: AudioContext;
  private masterGain: GainNode;
  private enabled: boolean = true;

  constructor() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 1.0; 
    this.masterGain.connect(this.audioContext.destination);

    window.addEventListener('click', () => this.resumeContext(), { once: true });
    window.addEventListener('keydown', () => this.resumeContext(), { once: true });
    window.addEventListener('touchstart', () => this.resumeContext(), { once: true });
  }

  private resumeContext(): void {
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  public playBallHit(force: number): void {
    if (!this.enabled) return;
    const velocity = Math.min(Math.max(force, 0.1), 3.0);
    const volume = Math.min(velocity * 0.5, 1.0); 
    this.synthesizeThud(volume, 250, 0.08); 
  }

  public playCueHit(): void {
    if (!this.enabled) return;
    this.synthesizeClick(0.6, 1200);
  }

  public playCushionHit(force: number): void {
    if (!this.enabled) return;
    const volume = Math.min(force * 0.4, 0.7);
    this.synthesizeThud(volume, 120, 0.15);
  }

  public playPocketSound(): void {
    if (!this.enabled) return;
    this.synthesizeRattle();
  }

  private synthesizeThud(volume: number, freq: number, duration: number): void {
    const t = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + duration);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    osc.start(t);
    osc.stop(t + duration);
  }

  private synthesizeClick(volume: number, freq: number): void {
    const t = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'triangle';
    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.03);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.03);

    osc.start(t);
    osc.stop(t + 0.03);
  }

  private synthesizeRattle(): void {
    // Убрана неиспользуемая переменная t
    for(let i=0; i<3; i++){
        this.synthesizeThud(0.3 - i*0.1, 300 - i*50, 0.1);
    }
  }

  public setEnabled(enabled: boolean): void { this.enabled = enabled; }
}