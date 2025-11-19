export class UIManager {
  public static readonly MIN_POWER = 0.01;
  public static readonly MAX_POWER = 1;
  public static readonly DEFAULT_POWER = 0.5;

  private container: HTMLDivElement;
  private powerSlider: HTMLInputElement;
  private powerValue: HTMLSpanElement;
  private strikeButton: HTMLButtonElement;
  private gameInfo: HTMLDivElement;
  private playerInfo: HTMLDivElement;
  private groupsInfo: HTMLDivElement;
  private pocketedInfo: HTMLDivElement;
  private restartButton: HTMLButtonElement;

  private onPowerChange?: (power: number) => void;
  private onStrike?: () => void;
  private onRestart?: () => void;

  constructor() {
    this.container = this.createUI();
    this.powerSlider = this.container.querySelector('#powerSlider')!;
    this.powerValue = this.container.querySelector('#powerValue')!;
    this.strikeButton = this.container.querySelector('#strikeButton')!;

    this.gameInfo = document.querySelector('#gameInfo')!;
    this.restartButton = document.querySelector('#restartButton')!;
    this.playerInfo = this.gameInfo.querySelector('.player-info')!;
    this.groupsInfo = this.gameInfo.querySelector('.groups-info')!;
    this.pocketedInfo = this.gameInfo.querySelector('.pocketed-info')!;

    this.setupEventListeners();
  }

  private createUI(): HTMLDivElement {
    const gameInfo = document.createElement('div');
    gameInfo.id = 'gameInfo';
    gameInfo.className = 'game-info';
    gameInfo.innerHTML = `
    <div class="player-info">Игрок 1 ход</div>
    <div class="groups-info">Группы не определены</div>
    <div class="pocketed-info">Забито: 0/15</div>
    <button id="restartButton" class="restart-btn">🔄 Новая игра</button>
  `;
    document.body.appendChild(gameInfo);

    const container = document.createElement('div');
    container.id = 'billiard-ui';
    container.innerHTML = `
    <div class="power-control">
      <label for="powerSlider">Сила удара: <span id="powerValue">50%</span></label>
      <input type="range" min="${UIManager.MIN_POWER * 100}" max="${UIManager.MAX_POWER * 100}" value="${UIManager.DEFAULT_POWER * 100}" id="powerSlider" />
    </div>
    
    <button id="strikeButton" class="strike-btn" disabled>💥 Удар (Enter)</button>
    
    <div class="hint">🎯 Зажмите ЛКМ и двигайте мышь ВЕРТИКАЛЬНО для прицеливания</div>
  `;
    document.body.appendChild(container);

    return container;
  }

  private setupEventListeners(): void {
    this.powerSlider.addEventListener('input', () => {
      const power = parseInt(this.powerSlider.value) / 100;
      this.powerValue.textContent = this.powerSlider.value + '%';
      if (this.onPowerChange) {
        this.onPowerChange(power);
      }
    });

    this.strikeButton.addEventListener('click', () => {
      if (this.onStrike) {
        this.onStrike();
      }
    });

    this.restartButton.addEventListener('click', () => {
      if (this.onRestart && confirm('Начать новую игру?')) {
        this.onRestart();
      }
    });
  }

  public setPower(value: number): number {
    value = Math.max(UIManager.MIN_POWER, Math.min(UIManager.MAX_POWER, value));

    const percent = Math.round(value * 100);
    this.powerSlider.value = percent.toString();
    this.powerValue.textContent = percent + '%';

    return value;
  }

  public getPower(): number {
    return parseInt(this.powerSlider.value) / 100;
  }

  public setStrikeEnabled(enabled: boolean): void {
    this.strikeButton.disabled = !enabled;
  }

  public isStrikeEnabled(): boolean {
    return !this.strikeButton.disabled;
  }

  public updateGameInfo(message: string, player: number, groups: string, pocketed: number): void {
    this.playerInfo.textContent = `Игрок ${player} ход`;
    this.groupsInfo.textContent = groups;
    this.pocketedInfo.textContent = `Забито: ${pocketed}/15`;

    const hint = this.container.querySelector('.hint')!;
    hint.textContent = message;
  }

  public onPowerChanged(callback: (power: number) => void): void {
    this.onPowerChange = callback;
  }

  public onStrikeClicked(callback: () => void): void {
    this.onStrike = callback;
  }

  public onRestartClicked(callback: () => void): void {
    this.onRestart = callback;
  }

  public dispose(): void {
    this.container.remove();
    this.gameInfo.remove();
  }
}