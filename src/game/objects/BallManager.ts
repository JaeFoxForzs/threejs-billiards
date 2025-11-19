import * as THREE from 'three';
import { Ball, BallType } from './Ball';
import { BilliardTable } from './BilliardTable';
import { PhysicsWorld } from '../PhysicsWorld';
import type { GameRules } from '../GameRules';

/**
 * @class BallManager
 * @description
 * Менеджер всех бильярдных шаров на столе.
 * 
 * Управляет:
 * - Созданием 16 шаров (1 биток + 15 цветных)
 * - Расстановкой пирамиды и битка
 * - Обновлением физики и визуала шаров
 * - Проверкой попадания в лузы
 * - Размещением битка после фола
 * - Сбросом игры
 * 
 * Расстановка пирамиды (американский пул 8-ball):
 * ```
 *        [1]
 *      [2] [3]
 *    [4] [8] [5]
 *  [6] [7] [9] [10]
 * [11][12][13][14][15]
 * ```
 * 
 * Биток размещается на 1/4 длины стола слева.
 */
export class BallManager {
  // КОНСТАНТЫ

  /** Интервал проверки луз (мс) - ~60 FPS */
  private readonly POCKET_CHECK_INTERVAL = 16;

  /** Количество шаров в игре (1 биток + 15 цветных) */
  private readonly TOTAL_BALLS = 16;

  /** Минимальное расстояние для размещения битка от других шаров */
  private readonly MIN_PLACEMENT_DISTANCE_MULTIPLIER = 2.5;

  /** Отступ от краёв стола при размещении битка (м) */
  private readonly PLACEMENT_MARGIN = 0.05;

  /** Множитель расстояния между шарами в пирамиде */
  private readonly PYRAMID_SPACING_MULTIPLIER = 2.01;

  /** Коэффициент для расчёта треугольной пирамиды */
  private readonly SQRT_3_2 = Math.sqrt(3) / 2;

  // МАССИВЫ ШАРОВ

  /** Все шары на столе */
  private balls: Ball[] = [];

  /** Биток (белый шар, номер 0) */
  private cueBall: Ball | null = null;

  /** Забитые в лузы шары */
  private pocketedBalls: Ball[] = [];

  // ССЫЛКИ НА ПОДСИСТЕМЫ

  /** Бильярдный стол */
  private table: BilliardTable;

  /** Физический мир */
  private physicsWorld: PhysicsWorld;

  private gameRules: GameRules | null = null;

  // ПАРАМЕТРЫ ШАРОВ

  /** Радиус бильярдного шара (м) */
  private ballRadius: number = 0.0286;

  // ПРОВЕРКА ЛУЗ

  /** Временная метка последней проверки луз */
  private lastPocketCheck: number = 0;

  /** Флаг активности проверки луз (включается только во время движения шаров) */
  private pocketCheckEnabled: boolean = false;

  // КОЛЛБЭКИ

  /** Коллбэк, вызываемый при забивании шара */
  private onBallPocketedCallback?: (ball: Ball) => void;

  // КОНСТРУКТОР

  /**
   * Создаёт менеджер шаров
   * 
   * @param model - Загруженная 3D модель шара
   * @param physicsWorld - Физический мир
   * @param table - Бильярдный стол
   */
  constructor(
    model: THREE.Object3D,
    physicsWorld: PhysicsWorld,
    table: BilliardTable
  ) {
    this.physicsWorld = physicsWorld;
    this.table = table;

    this.createBallsFromModel(model);
    this.setupInitialPositions();
    this.setupCollisionDetection();

    console.log(`✅ BallManager created: ${this.TOTAL_BALLS} balls, radius=${this.ballRadius.toFixed(4)}m`);
  }

  // ИНИЦИАЛИЗАЦИЯ

  /**
   * 🆕 Устанавливает ссылку на GameRules для отслеживания контактов
   */
  public setGameRules(rules: GameRules): void {
    this.gameRules = rules;
    console.log('📞 GameRules reference set in BallManager');
  }

  /**
     * 🆕 Настраивает отслеживание столкновений между шарами
     */
  private setupCollisionDetection(): void {
    const world = this.physicsWorld.getWorld();

    // Подписываемся на события начала контакта
    world.addEventListener('beginContact', (event: any) => {
      const { bodyA, bodyB } = event;

      // Находим шары по физическим телам
      const ballA = this.balls.find(b => b.getBody() === bodyA);
      const ballB = this.balls.find(b => b.getBody() === bodyB);

      // Игнорируем контакты не-шаров (стол, борта)
      if (!ballA || !ballB) return;

      // Определяем биток и цель
      let cueBall: Ball | null = null;
      let targetBall: Ball | null = null;

      if (ballA.getType() === BallType.CUE && ballB.getType() === BallType.NUMBERED) {
        cueBall = ballA;
        targetBall = ballB;
      } else if (ballB.getType() === BallType.CUE && ballA.getType() === BallType.NUMBERED) {
        cueBall = ballB;
        targetBall = ballA;
      }

      // Если это контакт битка с цветным шаром → уведомляем GameRules
      if (cueBall && targetBall && this.gameRules) {
        this.gameRules.onCueBallContact(targetBall);
      }
    });

    console.log('🎯 Collision detection configured');
  }

  /**
   * Создаёт все 16 шаров из загруженной модели
   * 
   * @private
   */
  private createBallsFromModel(model: THREE.Object3D): void {
    let ballMesh: THREE.Mesh | null = null;

    // Извлекаем первый меш из модели
    const firstModelChild = model.children[0];
    if (firstModelChild instanceof THREE.Mesh) {
      ballMesh = firstModelChild;
    }

    // Вычисляем радиус шара из размеров модели
    const box = new THREE.Box3().setFromObject(firstModelChild, true);
    const size = box.getSize(new THREE.Vector3());
    this.ballRadius = Math.max(size.x, size.y, size.z) / 2;

    console.log(`🎱 Creating ${this.TOTAL_BALLS} balls from model...`);

    // Создаём 16 шаров (0 = биток, 1-15 = цветные)
    for (let i = 0; i < this.TOTAL_BALLS; i++) {
      const ball = new Ball(
        i,
        new THREE.Vector3(0, 0, 0), // Временная позиция
        ballMesh,
        this.physicsWorld.getWorld(),
        this.ballRadius,
        this.getBallPositionY()
      );

      this.balls.push(ball);

      // Запоминаем биток
      if (i === 0) {
        this.cueBall = ball;
      }
    }

    console.log(`  ✓ Created ${this.balls.length} balls (cue ball: ${this.cueBall?.getNumber()})`);
  }

  /**
   * Расставляет шары в начальные игровые позиции
   * 
   * @private
   */
  private setupInitialPositions(): void {
    const lockedY = this.getBallPositionY();

    // Размещаем биток на 1/4 длины стола слева
    if (this.cueBall) {
      const cueBallPosition = new THREE.Vector3(
        -this.table.tableLength / 4,
        lockedY,
        0
      );
      this.cueBall.resetPosition(cueBallPosition);
      console.log(`  ✓ Cue ball at (${cueBallPosition.x.toFixed(2)}, ${cueBallPosition.z.toFixed(2)})`);
    }

    // Расставляем пирамиду
    this.setupPyramid(lockedY);
  }

  /**
   * Расставляет пирамиду из 15 цветных шаров
   * 
   * Стандартная расстановка американского пула:
   * - Вершина: шар 1
   * - Центр: шар 8 (чёрный)
   * - Углы: random distribution
   * 
   * @private
   * @param y - Высота размещения (фиксированная для 2D физики)
   */
  private setupPyramid(y: number): void {
    // Расстояние между центрами шаров
    const spacing = this.ballRadius * this.PYRAMID_SPACING_MULTIPLIER;

    // Начальная позиция пирамиды (на 1/4 длины стола справа)
    const startX = this.table.tableLength / 4;
    const startZ = 0;

    // Стандартная расстановка американского пула
    const arrangement = [
      [1],              // Ряд 1: вершина
      [2, 3],           // Ряд 2
      [4, 8, 5],        // Ряд 3: восьмёрка в центре
      [6, 7, 9, 10],    // Ряд 4
      [11, 12, 13, 14, 15] // Ряд 5: основание
    ];

    console.log(`  🔺 Setting up pyramid at (${startX.toFixed(2)}, ${startZ.toFixed(2)})`);

    // Расстановка по рядам
    for (let row = 0; row < arrangement.length; row++) {
      const ballsInRow = arrangement[row];

      for (let col = 0; col < ballsInRow.length; col++) {
        const ballNumber = ballsInRow[col];
        const ball = this.balls.find(b => b.getNumber() === ballNumber);

        if (!ball) {
          console.warn(`⚠️ Ball ${ballNumber} not found`);
          continue;
        }

        // Вычисляем позицию шара в треугольной сетке
        const x = startX + row * spacing * this.SQRT_3_2;
        const z = startZ + (col - (ballsInRow.length - 1) / 2) * spacing;

        ball.resetPosition(new THREE.Vector3(x, y, z));
      }
    }

    console.log(`  ✓ Pyramid set up (${arrangement.flat().length} balls)`);
  }

  // ОБНОВЛЕНИЕ

  /**
   * Обновляет все шары (вызывается каждый кадр)
   * 
   * Выполняет:
   * - Обновление физики и визуала каждого шара
   * - Периодическую проверку луз (если разрешено)
   */
  public update(): void {
    this.balls.forEach(ball => {
      if (!ball.isPocketedState()) {
        ball.update();
      }
    });

    if (this.pocketCheckEnabled && !this.areAllBallsStopped()) {
      const now = Date.now();
      if (now - this.lastPocketCheck > this.POCKET_CHECK_INTERVAL) {
        this.checkPockets();
        this.lastPocketCheck = now;
      }
    }
  }

  // ПРОВЕРКА ЛУЗ

  /**
   * Включает или выключает проверку попадания в лузы
   * 
   * Используется для предотвращения ложных срабатываний:
   * - Выключено при расстановке шаров
   * - Включается только после удара (когда шары начали движение)
   * - Выключается после остановки шаров
   * 
   * @param enabled - true для включения проверки
   */
  public setPocketCheckEnabled(enabled: boolean): void {
    this.pocketCheckEnabled = enabled;
    console.log(`🕳️ Pocket check: ${enabled ? 'ENABLED ✅' : 'DISABLED 🚫'}`);
  }

  /**
   * Проверяет, не попал ли какой-либо шар в лузу
   * 
   * Вызывается периодически во время движения шаров.
   * Проверяет только активные (не забитые) шары.
   */
  public checkPockets(): void {
    this.balls.forEach(ball => {
      // Пропускаем уже забитые шары
      if (ball.isPocketedState()) return;

      const position = ball.getPosition();
      const pocket = this.table.isInPocket(position);

      if (pocket) {
        console.log(
          `🎯 Ball ${ball.getNumber()} → Pocket at ` +
          `(${pocket.position.x.toFixed(2)}, ${pocket.position.y.toFixed(2)}, ${pocket.position.z.toFixed(2)})`
        );
        this.pocketBall(ball);
      }
    });
  }

  /**
   * Забивает шар в лузу
   * 
   * @private
   * @param ball - Шар, который попал в лузу
   */
  private pocketBall(ball: Ball): void {
    console.log(`🕳️ Pocketing ball ${ball.getNumber()}`);

    // Устанавливаем состояние "забит"
    ball.setPocketed(true);

    // Убираем физическое тело далеко вниз
    const body = ball.getBody();
    body.position.set(0, -10, 0);
    body.velocity.setZero();
    body.angularVelocity.setZero();
    body.sleep();

    // Добавляем в список забитых
    this.pocketedBalls.push(ball);

    // Уведомляем игровую логику
    if (this.onBallPocketedCallback) {
      this.onBallPocketedCallback(ball);
    }
  }

  // РАЗМЕЩЕНИЕ БИТКА

  /**
   * Размещает биток в указанной позиции
   * 
   * Используется после фола (когда биток забит).
   * Автоматически возвращает биток из состояния "забит".
   * 
   * @param position - Новая позиция битка (X и Z), Y вычисляется автоматически
   */
  public placeCueBall(position: THREE.Vector3): void {
    if (!this.cueBall) {
      console.error('❌ Cue ball not found');
      return;
    }

    // Возвращаем биток на стол, если он был забит
    if (this.cueBall.isPocketedState()) {
      this.cueBall.setPocketed(false);
      console.log('  ↪️ Cue ball returned from pocket');
    }

    // Размещаем биток на фиксированной высоте
    const y = this.getBallPositionY();
    this.cueBall.resetPosition(new THREE.Vector3(position.x, y, position.z));

    console.log(`📍 Cue ball placed at (${position.x.toFixed(2)}, ${position.z.toFixed(2)})`);
  }

  /**
   * Проверяет, можно ли разместить биток в данной точке
   * 
   * Проверяет:
   * - Находится ли точка в пределах стола
   * - Нет ли рядом других шаров
   * 
   * @param position - Предполагаемая позиция битка
   * @returns true если размещение допустимо
   */
  public canPlaceCueBall(position: THREE.Vector3): boolean {
    const bounds = this.table.getPlayingAreaBounds();

    // Проверка границ стола с отступом
    if (
      position.x < bounds.minX + this.PLACEMENT_MARGIN ||
      position.x > bounds.maxX - this.PLACEMENT_MARGIN ||
      position.z < bounds.minZ + this.PLACEMENT_MARGIN ||
      position.z > bounds.maxZ - this.PLACEMENT_MARGIN
    ) {
      return false;
    }

    // Минимальное расстояние от других шаров
    const minDistance = this.ballRadius * this.MIN_PLACEMENT_DISTANCE_MULTIPLIER;

    // Проверка расстояния до всех активных шаров
    for (const ball of this.balls) {
      // Пропускаем сам биток и забитые шары
      if (ball === this.cueBall || ball.isPocketedState()) continue;

      const distance = position.distanceTo(ball.getPosition());
      if (distance < minDistance) {
        return false; // Слишком близко к другому шару
      }
    }

    return true;
  }

  // СОСТОЯНИЕ ИГРЫ

  /**
   * Проверяет, остановились ли все шары
   * 
   * Используется для определения окончания хода.
   * 
   * @returns true если все активные шары остановились
   */
  public areAllBallsStopped(): boolean {
    return this.balls.every(ball =>
      ball.isPocketedState() || !ball.isMoving()
    );
  }

  /**
   * Сбрасывает игру (новая партия)
   * 
   * Выполняет:
   * - Возвращает все забитые шары на стол
   * - Расставляет шары в начальные позиции
   * - Очищает список забитых шаров
   * - Отключает проверку луз
   */
  public resetGame(): void {
    console.log('🔄 Resetting ball positions...');

    // Очищаем список забитых
    this.pocketedBalls = [];

    // Возвращаем все забитые шары на стол
    this.balls.forEach(ball => {
      if (ball.isPocketedState()) {
        ball.setPocketed(false);
        ball.getMesh().visible = true;
      }
    });

    // Расставляем в начальные позиции
    this.setupInitialPositions();

    // Отключаем проверку луз (включится при первом ударе)
    this.pocketCheckEnabled = false;

    console.log('✅ Balls reset complete');
  }

  // КОЛЛБЭКИ

  /**
   * Устанавливает коллбэк для события забивания шара
   * 
   * @param callback - Функция, вызываемая при забивании
   */
  public setOnBallPocketed(callback: (ball: Ball) => void): void {
    this.onBallPocketedCallback = callback;
    console.log('📞 Ball pocketed callback registered');
  }

  // ГЕТТЕРЫ

  /**
   * Возвращает биток
   * @returns Биток или null если не найден
   */
  public getCueBall(): Ball | null {
    return this.cueBall;
  }

  /**
   * Возвращает все шары
   * @returns Массив всех 16 шаров
   */
  public getBalls(): Ball[] {
    return this.balls;
  }

  /**
   * Возвращает только активные (не забитые) шары
   * @returns Массив активных шаров
   */
  public getActiveBalls(): Ball[] {
    return this.balls.filter(ball => !ball.isPocketedState());
  }

  /**
   * Возвращает забитые шары
   * @returns Массив забитых шаров
   */
  public getPocketedBalls(): Ball[] {
    return this.pocketedBalls;
  }

  /**
   * Возвращает радиус шара
   * @returns Радиус в метрах
   */
  public getBallRadius(): number {
    return this.ballRadius;
  }

  /**
   * Возвращает фиксированную высоту позиции шаров (для 2D физики)
   * @returns Y-координата центра шара
   */
  public getBallPositionY(): number {
    return this.table.tableHeight + this.ballRadius;
  }
}