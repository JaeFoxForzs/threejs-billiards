export class UIManager {
  private container: HTMLElement;
  
  // ... остальные элементы UI (scoreP1, scoreP2 и т.д.) ...
  private scoreP1: HTMLElement;
  private scoreP2: HTMLElement;
  private gameMessage: HTMLElement;
  private powerFill: HTMLElement;
  private powerTrigger: HTMLElement;
  private aimTrigger: HTMLElement;
  private wheelMarks: HTMLElement;
  private menuBtn: HTMLButtonElement;

  // Callbacks
  private onStrikeCallback?: (power: number) => void;
  private onPowerUpdateCallback?: (power: number) => void;
  private onAimDeltaCallback?: (delta: number) => void;
  private onRestartCallback?: () => void;
  
  // Новые колбэки для отладки
  private onToggleCollisionCallback?: (visible: boolean) => void;
  private onToggleTriggersCallback?: (visible: boolean) => void;

  // ... переменные drag ...
  private isDraggingPower: boolean = false;
  private isDraggingAim: boolean = false;
  private lastAimY: number = 0;
  private currentPower: number = 0;

  constructor() {
    this.container = document.getElementById('game-ui')!;
    // ... инициализация элементов ...
    this.scoreP1 = document.getElementById('score-p1')!;
    this.scoreP2 = document.getElementById('score-p2')!;
    this.gameMessage = document.getElementById('game-message')!;
    this.powerFill = document.getElementById('power-fill')!;
    this.powerTrigger = document.getElementById('power-trigger')!;
    this.aimTrigger = document.getElementById('aim-trigger')!;
    this.wheelMarks = document.querySelector('.wheel-marks') as HTMLElement;
    this.menuBtn = document.getElementById('menu-btn') as HTMLButtonElement;

    this.setupInteractions();
    this.createDebugPanel(); // Создаем панель
  }

  private createDebugPanel(): void {
      const panel = document.createElement('div');
      panel.style.position = 'absolute';
      panel.style.top = '10px';
      panel.style.left = '10px';
      panel.style.backgroundColor = 'rgba(0,0,0,0.7)';
      panel.style.padding = '10px';
      panel.style.borderRadius = '8px';
      panel.style.color = 'white';
      panel.style.fontFamily = 'sans-serif';
      panel.style.fontSize = '12px';
      panel.style.pointerEvents = 'auto';
      panel.style.zIndex = '1000';

      const title = document.createElement('div');
      title.textContent = '🔧 Debug Mode';
      title.style.marginBottom = '5px';
      title.style.fontWeight = 'bold';
      panel.appendChild(title);

      // Чекбокс Коллизии
      const lblCol = document.createElement('label');
      lblCol.style.display = 'block';
      lblCol.style.marginBottom = '3px';
      lblCol.style.cursor = 'pointer';
      
      const chkCol = document.createElement('input');
      chkCol.type = 'checkbox';
      chkCol.style.marginRight = '5px';
      chkCol.addEventListener('change', (e) => {
          if (this.onToggleCollisionCallback) this.onToggleCollisionCallback((e.target as HTMLInputElement).checked);
      });
      
      lblCol.appendChild(chkCol);
      lblCol.appendChild(document.createTextNode('Collision Mesh (Red)'));
      panel.appendChild(lblCol);

      // Чекбокс Триггеры
      const lblTrig = document.createElement('label');
      lblTrig.style.display = 'block';
      lblTrig.style.cursor = 'pointer';

      const chkTrig = document.createElement('input');
      chkTrig.type = 'checkbox';
      chkTrig.style.marginRight = '5px';
      chkTrig.addEventListener('change', (e) => {
          if (this.onToggleTriggersCallback) this.onToggleTriggersCallback((e.target as HTMLInputElement).checked);
      });

      lblTrig.appendChild(chkTrig);
      lblTrig.appendChild(document.createTextNode('Pockets (Green)'));
      panel.appendChild(lblTrig);

      this.container.appendChild(panel);
  }

  public onToggleCollision(cb: (v: boolean) => void) { this.onToggleCollisionCallback = cb; }
  public onToggleTriggers(cb: (v: boolean) => void) { this.onToggleTriggersCallback = cb; }

  // ... setupInteractions и остальные методы без изменений ...
  private setupInteractions(): void {
    // (Весь код драга и управления остался прежним, не дублирую для краткости)
    const startPowerDrag = (e: MouseEvent | TouchEvent) => {
      this.isDraggingPower = true;
      this.updatePowerFromEvent(e);
    };
    const movePowerDrag = (e: MouseEvent | TouchEvent) => {
      if (!this.isDraggingPower) return;
      this.updatePowerFromEvent(e);
      e.preventDefault();
    };
    const endPowerDrag = () => {
      if (!this.isDraggingPower) return;
      this.isDraggingPower = false;
      if (this.currentPower > 0.05) {
        if (this.onStrikeCallback) this.onStrikeCallback(this.currentPower);
      }
      this.currentPower = 0;
      this.powerFill.style.height = '0%';
      if(this.onPowerUpdateCallback) this.onPowerUpdateCallback(0);
    };
    this.powerTrigger.addEventListener('mousedown', startPowerDrag);
    this.powerTrigger.addEventListener('touchstart', startPowerDrag);
    window.addEventListener('mousemove', movePowerDrag);
    window.addEventListener('touchmove', movePowerDrag, { passive: false });
    window.addEventListener('mouseup', endPowerDrag);
    window.addEventListener('touchend', endPowerDrag);
    const startAimDrag = (e: MouseEvent | TouchEvent) => {
      this.isDraggingAim = true;
      this.lastAimY = this.getClientY(e);
    };
    const moveAimDrag = (e: MouseEvent | TouchEvent) => {
      if (!this.isDraggingAim) return;
      const y = this.getClientY(e);
      const delta = this.lastAimY - y; 
      this.lastAimY = y;
      const currentBgPos = parseFloat(this.wheelMarks.style.backgroundPositionY || '0');
      this.wheelMarks.style.backgroundPositionY = `${currentBgPos - delta}px`;
      if (this.onAimDeltaCallback) {
        this.onAimDeltaCallback(delta * 0.005); 
      }
      e.preventDefault();
    };
    const endAimDrag = () => {
      this.isDraggingAim = false;
    };
    this.aimTrigger.addEventListener('mousedown', startAimDrag);
    this.aimTrigger.addEventListener('touchstart', startAimDrag);
    window.addEventListener('mousemove', moveAimDrag);
    window.addEventListener('touchmove', moveAimDrag, { passive: false });
    window.addEventListener('mouseup', endAimDrag);
    window.addEventListener('touchend', endAimDrag);
    this.menuBtn.addEventListener('click', () => {
        if(confirm("Перезапустить игру?")) {
            if(this.onRestartCallback) this.onRestartCallback();
        }
    });
  }

  private updatePowerFromEvent(e: MouseEvent | TouchEvent): void {
    const rect = this.powerTrigger.getBoundingClientRect();
    const clientY = this.getClientY(e);
    const relativeY = rect.bottom - clientY;
    let percent = relativeY / rect.height;
    percent = Math.max(0, Math.min(1, percent));
    this.currentPower = percent;
    this.powerFill.style.height = `${percent * 100}%`;
    if (this.onPowerUpdateCallback) this.onPowerUpdateCallback(this.currentPower);
  }

  private getClientY(e: MouseEvent | TouchEvent): number {
    if ((e as TouchEvent).touches && (e as TouchEvent).touches.length > 0) {
      return (e as TouchEvent).touches[0].clientY;
    }
    return (e as MouseEvent).clientY;
  }

  public updateGameInfo(message: string, player: number, scoreText: string, _pocketed: number): void {
    this.gameMessage.textContent = message;
    const [s1, s2] = scoreText.split('|').map(s => s.replace(/\D/g, ''));
    this.scoreP1.textContent = s1 || '0';
    this.scoreP2.textContent = s2 || '0';
    this.scoreP1.classList.toggle('active', player === 1);
    this.scoreP2.classList.toggle('active', player === 2);
    document.querySelector('.avatar.p1')?.classList.toggle('active', player === 1);
    document.querySelector('.avatar.p2')?.classList.toggle('active', player === 2);
  }

  public setControlsEnabled(enabled: boolean): void {
    this.container.style.pointerEvents = 'none'; 
    this.powerTrigger.style.pointerEvents = enabled ? 'auto' : 'none';
    this.aimTrigger.style.pointerEvents = enabled ? 'auto' : 'none';
    this.powerTrigger.style.opacity = enabled ? '1' : '0.5';
  }

  public onStrike(cb: (power: number) => void) { this.onStrikeCallback = cb; }
  public onPowerUpdate(cb: (power: number) => void) { this.onPowerUpdateCallback = cb; }
  public onAimDelta(cb: (delta: number) => void) { this.onAimDeltaCallback = cb; }
  public onRestart(cb: () => void) { this.onRestartCallback = cb; }
  public dispose() {}
}