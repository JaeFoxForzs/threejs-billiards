import * as THREE from 'three';
import { SceneManager } from './SceneManager';
import { PhysicsWorld } from './PhysicsWorld';
import { BilliardTable } from './objects/BilliardTable';
import { CueStick } from './objects/CueStick';
import { BallManager } from './objects/BallManager';
import { InputController } from './input/InputController';
import { GameRules } from './GameRules';
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import CannonDebugger from 'cannon-es-debugger';

/**
 * @class BilliardGame
 * @description
 * Главный класс игры в бильярд (американский пул 8-ball).
 * 
 * Координирует все подсистемы:
 * - SceneManager: управление сценой, камерой, рендером (Three.js)
 * - PhysicsWorld: физическая симуляция (Cannon.js)
 * - BilliardTable: стол, борта, лузы
 * - BallManager: управление 16 шарами
 * - CueStick: визуализация кия
 * - InputController: обработка ввода (мышь/тач)
 * - GameRules: правила игры и логика ходов
 * 
 * Жизненный цикл:
 * 1. init() - асинхронная инициализация
 * 2. animate() - игровой цикл (60 FPS)
 * 3. destroy() - очистка ресурсов
 */
export class BilliardGame {
  // ПОДСИСТЕМЫ

  /** Менеджер сцены Three.js */
  private sceneManager!: SceneManager;

  /** Физический мир Cannon.js */
  private physicsWorld!: PhysicsWorld;

  /** Бильярдный стол */
  private table!: BilliardTable;

  /** Кий */
  private cueStick!: CueStick;

  /** Менеджер шаров */
  private ballManager!: BallManager;

  /** Контроллер ввода */
  private inputController!: InputController;

  /** Правила игры */
  private gameRules!: GameRules;

  // СОСТОЯНИЕ ИГРЫ

  /** Часы для отслеживания времени */
  private clock: THREE.Clock;

  /** ID текущего кадра анимации */
  private animationId: number = 0;

  /** Флаг движения шаров (ход в процессе) */
  private ballsAreMoving: boolean = false;

  /** Таймер задержки окончания хода */
  private turnEndTimer: number | null = null;

  /** Отладчик физики Cannon.js (только в debug режиме) */
  private cannonDebugger: any | null = null;

  // КОНСТАНТЫ

  /** Задержка перед подтверждением окончания хода (мс) */
  private readonly TURN_END_DELAY = 200;

  // КОНСТРУКТОР

  /**
   * Создаёт экземпляр игры
   */
  constructor() {
    this.clock = new THREE.Clock();
  }

  // ИНИЦИАЛИЗАЦИЯ

  /**
   * Асинхронная инициализация игры
   * 
   * Выполняет:
   * 1. Создание подсистем (сцена, физика, правила)
   * 2. Загрузку 3D моделей (стол, кий, шары)
   * 3. Настройку обработчиков событий
   * 4. Запуск игрового цикла
   * 
   * @throws {Error} Если не удалось загрузить модели
   */
  public async init(): Promise<void> {
    console.log('🎱 Initializing Billiard Game...');

    // Инициализация подсистем
    this.sceneManager = new SceneManager();
    this.physicsWorld = new PhysicsWorld();
    this.gameRules = new GameRules();

    // Загрузка 3D моделей
    await this.loadAssets();

    this.ballManager.setGameRules(this.gameRules);

    // Подписка на события забивания шаров
    this.ballManager.setOnBallPocketed((ball) => {
      console.log(`🎯 Ball ${ball.getNumber()} pocketed - notifying GameRules`);
      this.gameRules.onBallPocketed(ball);
      this.updateUI();
    });

    // Инициализация контроллера ввода
    this.inputController = new InputController(
      this.sceneManager.getCamera(),
      this.sceneManager.getRenderer().domElement,
      this.cueStick,
      this.ballManager,
      this.gameRules
    );

    // Добавление элементов UI на сцену
    this.sceneManager.addToScene(this.inputController.getAimLine());

    const highlight = this.inputController.getHighlightOutline();
    if (highlight) {
      this.sceneManager.addToScene(highlight);
    }

    const cueBallGhost = this.inputController.getCueBallGhost();
    if (cueBallGhost) {
      this.sceneManager.addToScene(cueBallGhost);
    }

    // Инициализация отладчика физики (если включен debug режим)
    const isDebug = new URLSearchParams(window.location.search).has('debug');
    if (isDebug) {
      console.log('🐛 Debug mode enabled - activating physics debugger');
      this.cannonDebugger = CannonDebugger(
        this.sceneManager.getScene(),
        this.physicsWorld.getWorld(),
        {}
      );
    }

    // Начальная настройка UI и запуск игры
    this.inputController.handleTurnEnd();
    this.updateUI();
    this.animate();

    // Регистрация глобальных обработчиков событий
    window.addEventListener('resize', () => this.onWindowResize());
    window.addEventListener('restartGame', () => this.restartGame());

    console.log('✅ Billiard Game initialized successfully');
  }

  /**
   * Загружает все 3D модели
   * 
   * @private
   * @throws {Error} Если не удалось загрузить модели
   */
  private async loadAssets(): Promise<void> {
    const loader = new GLTFLoader();

    console.log('📦 Loading 3D models...');

    try {
      const [tableGltf, cueGltf, ballGltf] = await Promise.all([
        this.loadGLTF(loader, '/models/billiard_table.glb'),
        this.loadGLTF(loader, '/models/billiard_cue.glb'),
        this.loadGLTF(loader, '/models/billiard_ball.glb')
      ]);

      // Создание стола
      this.table = new BilliardTable(tableGltf.scene, this.physicsWorld);
      this.sceneManager.addToScene(this.table.getMesh());
      console.log('✅ Table loaded');

      // Создание кия
      this.cueStick = new CueStick(cueGltf.scene);
      this.sceneManager.addToScene(this.cueStick.getMesh());
      console.log('✅ Cue stick loaded');

      // Создание шаров
      this.ballManager = new BallManager(ballGltf.scene, this.physicsWorld, this.table);
      this.ballManager.getBalls().forEach(ball => {
        this.sceneManager.addToScene(ball.getMesh());
      });
      console.log('✅ Balls loaded (16 balls)');

    } catch (error) {
      console.error('❌ Failed to load models:', error);
      throw error;
    }
  }

  /**
   * Загружает один GLTF файл
   * 
   * @private
   * @param loader - GLTFLoader
   * @param path - Путь к файлу
   * @returns Promise с загруженной моделью
   */
  private loadGLTF(loader: GLTFLoader, path: string): Promise<any> {
    return new Promise((resolve, reject) => {
      loader.load(
        path,
        (gltf) => {
          console.log(`  ✓ ${path}`);
          resolve(gltf);
        },
        undefined,
        (error) => {
          console.error(`  ✗ ${path}:`, error);
          reject(error);
        }
      );
    });
  }

  // ИГРОВОЙ ЦИКЛ

  /**
   * Главный игровой цикл (вызывается каждый кадр ~60 FPS)
   * 
   * Выполняет:
   * 1. Шаг физической симуляции
   * 2. Обновление шаров
   * 3. Проверку состояния игры
   * 4. Проверку луз
   * 5. Рендеринг кадра
   * 
   * @private
   */
  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();

    // Обновление физики
    this.physicsWorld.step(delta);

    // Обновление шаров (синхронизация физики с визуалом)
    this.ballManager.update();

    // Проверка состояния игры (начало/окончание хода)
    this.updateGameState();

    // Отладчик физики (если включен)
    if (this.cannonDebugger) {
      this.cannonDebugger.update();
    }

    // Рендеринг кадра
    this.sceneManager.render();
  }

  /**
   * Обновляет состояние игры и отслеживает переходы между ходами
   * 
   * Логика:
   * - Шары остановились после движения → окончание хода (с задержкой)
   * - Шары снова начали движение → отмена окончания хода
   * - Шары начали движение из покоя → начало хода
   * 
   * @private
   */
  private updateGameState(): void {
    const allBallsStopped = this.ballManager.areAllBallsStopped();

    // ───────────────────────────────────────────────────────
    // СЛУЧАЙ 1: Шары остановились после движения
    // ───────────────────────────────────────────────────────
    if (allBallsStopped && this.ballsAreMoving) {
      if (!this.turnEndTimer) {
        console.log('⏱️ Balls stopped, waiting for confirmation...');

        // Задержка перед подтверждением (защита от ложных остановок)
        this.turnEndTimer = window.setTimeout(() => {
          if (this.ballManager.areAllBallsStopped()) {
            this.ballsAreMoving = false;
            this.turnEndTimer = null;

            console.log('✅ Turn confirmed as ended');

            // Отключаем проверку луз до следующего удара
            this.ballManager.setPocketCheckEnabled(false);

            // Обработка окончания хода
            this.gameRules.onTurnEnd(this.ballManager.getBalls());
            this.inputController.handleTurnEnd();
            this.updateUI();
          } else {
            console.log('⚠️ False stop detected, continuing turn');
            this.turnEndTimer = null;
          }
        }, this.TURN_END_DELAY);
      }
    }
    // ───────────────────────────────────────────────────────
    // СЛУЧАЙ 2: Шары снова начали движение (отмена остановки)
    // ───────────────────────────────────────────────────────
    else if (!allBallsStopped && this.ballsAreMoving) {
      if (this.turnEndTimer) {
        console.log('🔄 Balls moving again, canceling turn end timer');
        clearTimeout(this.turnEndTimer);
        this.turnEndTimer = null;
      }
    }
    // ───────────────────────────────────────────────────────
    // СЛУЧАЙ 3: Шары начали движение из состояния покоя
    // ───────────────────────────────────────────────────────
    else if (!allBallsStopped && !this.ballsAreMoving) {
      this.ballsAreMoving = true;

      if (this.turnEndTimer) {
        clearTimeout(this.turnEndTimer);
        this.turnEndTimer = null;
      }

      console.log('🎱 Turn started: Balls are moving');

      // Включаем проверку луз ТОЛЬКО когда шары начали движение
      this.ballManager.setPocketCheckEnabled(true);

      // Обработка начала хода
      this.gameRules.onTurnStart();
      this.inputController.handleTurnStart();
    }
  }

  // ИНТЕРФЕЙС ПОЛЬЗОВАТЕЛЯ

  /**
   * Обновляет информационную панель игры
   * 
   * Отображает:
   * - Текущее сообщение (статус игры, фолы, победа)
   * - Текущий игрок
   * - Группы шаров игроков
   * - Количество забитых шаров
   * 
   * @private
   */
  private updateUI(): void {
    const state = this.gameRules.getState();
    const pocketed = this.ballManager.getPocketedBalls().length;

    const message = state.message;

    // Формирование текста о группах
    let groupsText = 'Группы не определены';
    if (state.player1Group !== 'none') {
      const p1 = state.player1Group === 'solids' ? 'Сплошные (1-7)' : 'Полосатые (9-15)';
      const p2 = state.player2Group === 'solids' ? 'Сплошные (1-7)' : 'Полосатые (9-15)';
      groupsText = `P1: ${p1} | P2: ${p2}`;
    }

    // Обновление UI через InputController
    this.inputController.updateGameInfo(
      message,
      state.currentPlayer,
      groupsText,
      pocketed
    );
  }

  /**
   * Обработчик изменения размера окна
   * 
   * @private
   */
  private onWindowResize(): void {
    this.sceneManager.onWindowResize();
  }

  // УПРАВЛЕНИЕ ИГРОЙ

  /**
   * Перезапускает игру (новая партия)
   * 
   * Сбрасывает:
   * - Правила игры
   * - Позиции всех шаров
   * - UI
   */
  public restartGame(): void {
    console.log('🔄 Restarting game...');

    // Сброс правил
    this.gameRules.resetGame();

    // Сброс шаров (расстановка)
    this.ballManager.resetGame();

    // Сброс UI
    this.inputController.handleTurnEnd();
    this.updateUI();

    console.log('✅ Game restarted');
  }

  /**
   * Уничтожает игру и освобождает ресурсы
   * 
   * Вызывать при выходе из игры или смене сцены
   */
  public destroy(): void {
    console.log('🗑️ Destroying game...');

    // Очистка таймеров
    if (this.turnEndTimer) {
      clearTimeout(this.turnEndTimer);
      this.turnEndTimer = null;
    }

    // Остановка игрового цикла
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }

    // Очистка подсистем
    this.sceneManager.dispose();
    this.inputController.dispose();

    // Очистка отладчика
    this.cannonDebugger = null;

    console.log('✅ Game destroyed');
  }
}