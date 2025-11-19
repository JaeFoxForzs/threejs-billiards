import { BilliardGame } from './game/BilliardGame';
import type { GameState } from './game/GameRules';

/**
 * @class App
 * @description
 * Главный класс приложения, который инициализирует и запускает игру.
 * Отвечает за управление элементами UI верхнего уровня (например, экран загрузки).
 */
class App {
  private game: BilliardGame | null = null;
  private loadingElement: HTMLElement | null;
  private uiOverlay: HTMLElement | null;

  constructor() {
    this.loadingElement = document.getElementById('loading');
    this.uiOverlay = document.getElementById('ui-overlay');
    this.init();
  }

  /**
   * @private
   * @async
   * @method init
   * @description
   * Асинхронно инициализирует все компоненты игры.
   * После успешной загрузки скрывает экран загрузки и показывает игровой UI.
   */
  private async init(): Promise<void> {
    try {
      this.game = new BilliardGame();
      await this.game.init();

      if (this.loadingElement) {
        this.loadingElement.classList.add('hidden');
      }
      if (this.uiOverlay) {
        this.uiOverlay.classList.remove('hidden');
      }

      this.setupGameEvents();

    } catch (error) {
      console.error('Не удалось инициализировать игру:', error);
      if (this.loadingElement) {
        this.loadingElement.textContent = 'Ошибка загрузки игры';
      }
    }
  }

  /**
   * @private
   * @method setupGameEvents
   * @description
   * Настраивает глобальные слушатели событий, исходящих от игры,
   * для обновления пользовательского интерфейса.
   */
  private setupGameEvents(): void {
    window.addEventListener('gameStateUpdate', ((e: CustomEvent) => {
      const { state, pocketed } = e.detail;
      this.updateUI(state, pocketed);
    }) as EventListener);
  }

  /**
   * @private
   * @method updateUI
   * @param {GameState} state - Текущее состояние правил игры.
   * @param {number} pocketed - Количество забитых шаров.
   * @description
   * Обрабатывает обновление состояния игры и выводит информацию в консоль.
   * В полноценном приложении здесь будет логика обновления UI.
   */
  private updateUI(state: GameState, pocketed: number): void {
    console.log('🎮 Состояние игры:', state);
    console.log(`📊 Забито: ${pocketed}/15`);
  }
}

new App();