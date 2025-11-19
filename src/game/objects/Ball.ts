import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * @enum BallType
 * @description
 * Тип бильярдного шара в игре американский пул (8-ball)
 */
export enum BallType {
  /**
   * Биток (белый шар)
   * Используется игроком для удара по другим шарам
   */
  CUE = 0,

  /**
   * Цветной нумерованный шар (1-15)
   * Целевые шары, которые нужно забить в лузы
   */
  NUMBERED = 1,
}

/**
 * @interface BallColorScheme
 * @description Схема цветов для стандартного американского пула
 * @private
 */
interface BallColorScheme {
  [key: number]: string;
}

/**
 * @class Ball
 * @description
 * Класс бильярдного шара для игры в американский пул (8-ball).
 * 
 * Управляет:
 * - Визуальным представлением (Three.js Mesh с процедурной текстурой)
 * - Физическим телом (Cannon.js Body со сферической формой)
 * - Состоянием движения и покоя
 * - Применением ударов и импульсов
 * 
 * Нумерация шаров (стандарт американского пула):
 * ```
 * 0: Биток (белый)
 * ─────────────────────────────────────
 * СПЛОШНЫЕ (solids):
 * 1: Жёлтый    2: Синий     3: Красный
 * 4: Фиолетовый 5: Оранжевый 6: Зелёный
 * 7: Бордовый
 * ─────────────────────────────────────
 * 8: Чёрный (восьмёрка)
 * ─────────────────────────────────────
 * ПОЛОСАТЫЕ (striped):
 * 9: Жёлтый    10: Синий    11: Красный
 * 12: Фиолетовый 13: Оранжевый 14: Зелёный
 * 15: Бордовый
 * ```
 * 
 * Физические особенности:
 * - Движение ограничено плоскостью XZ (2D бильярд)
 * - Автоматическое гашение вращения при остановке
 * - Realistic collision response с другими шарами
 * - Система усыпления (sleep) для оптимизации производительности
 * 
 * @example
 * ```typescript
 * const ball = new Ball(
 *   1,                           // Номер шара
 *   new THREE.Vector3(0, 0.8, 0), // Позиция
 *   ballMesh,                     // Меш из модели
 *   physicsWorld,                 // Cannon.js мир
 *   0.0286,                       // Радиус (м)
 *   0.8286                        // Высота (м)
 * );
 * 
 * // Применить удар
 * ball.applyImpulse(
 *   new THREE.Vector3(1, 0, 0), // Направление
 *   0.7                          // Сила (0-1)
 * );
 * 
 * // Обновление каждый кадр
 * ball.update();
 * 
 * // Проверка движения
 * if (!ball.isMoving()) {
 *   console.log('Ball stopped');
 * }
 * ```
 */
export class Ball {
  // ═══════════════════════════════════════════════════════════════════════
  // ФИЗИЧЕСКИЕ КОНСТАНТЫ
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Порог скорости для перехода в режим сна (м/с)
   * Используется Cannon.js для автоматического усыпления
   * @private
   * @static
   * @readonly
   */
  static readonly SLEEP_SPEED_LIMIT = 0.15;

  /**
 * Порог для полного усыпления шара (м/с)
 * Ниже этого значения шар принудительно останавливается
 * @private
 * @static
 * @readonly
 */
  private static readonly SLEEP_THRESHOLD = 0.005;

  /**
   * Порог для начала гашения вращения (м/с)
   * Когда линейная скорость падает ниже этого значения,
   * начинается экспоненциальное затухание angular velocity
   * @private
   * @static
   * @readonly
   */
  private static readonly SPIN_DAMPING_THRESHOLD = 0.05;

  /**
   * Порог для принудительной остановки линейного движения (м/с)
   * Применяется дополнительное торможение
   * @private
   * @static
   * @readonly
   */
  private static readonly FULL_STOP_THRESHOLD = 0.01;

  // ═══════════════════════════════════════════════════════════════════════
  // КОНСТАНТЫ УДАРА
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Минимальная сила удара (Н·с)
   * Соответствует power = 0.0
   * @private
   * @static
   * @readonly
   */
  private static readonly MIN_STRIKE_FORCE = 0.005;

  /**
   * Максимальная сила удара (Н·с)
   * Соответствует power = 1.0
   * @private
   * @static
   * @readonly
   */
  private static readonly MAX_STRIKE_FORCE = 0.1;

  /**
   * Коэффициент применения вращения (spin) при ударе
   * Определяет, насколько сильно удар влияет на угловую скорость
   * @private
   * @static
   * @readonly
   */
  private static readonly SPIN_FACTOR = 0.3;

  // ═══════════════════════════════════════════════════════════════════════
  // КОНСТАНТЫ ВИЗУАЛИЗАЦИИ
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Разрешение canvas-текстуры для процедурного рендеринга шара
   * @private
   * @static
   * @readonly
   */
  private static readonly TEXTURE_SIZE = 512;

  /**
   * Количество сегментов сферической геометрии
   * @private
   * @static
   * @readonly
   */
  private static readonly SPHERE_SEGMENTS = 32;

  // ═══════════════════════════════════════════════════════════════════════
  // ПРИВАТНЫЕ ПОЛЯ
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Визуальное представление шара (Three.js)
   * @private
   */
  private mesh: THREE.Mesh;

  /**
   * Физическое тело шара (Cannon.js)
   * @private
   */
  private body: CANNON.Body;

  /**
   * Номер шара (0 = биток, 1-15 = цветные)
   * @private
   * @readonly
   */
  private readonly number: number;

  /**
   * Тип шара (биток или цветной)
   * @private
   * @readonly
   */
  private readonly type: BallType;

  /**
   * Флаг забитого в лузу шара
   * @private
   */
  private isPocketed: boolean = false;

  /**
   * Фиксированная высота позиции Y (для 2D физики)
   * Шар всегда находится на этой высоте
   * @private
   * @readonly
   */
  private readonly lockedPositionY: number;

  // ═══════════════════════════════════════════════════════════════════════
  // КОНСТРУКТОР
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Создаёт новый бильярдный шар
   * 
   * @param {number} number - Номер шара (0 = биток, 1-15 = цветные)
   * @param {THREE.Vector3} position - Начальная позиция шара в мировых координатах
   * @param {THREE.Mesh | null} ballMesh - Меш шара из загруженной модели (если есть)
   * @param {CANNON.World} physicsWorld - Физический мир Cannon.js
   * @param {number} radius - Радиус шара в метрах (стандарт: 0.0286м = 57.2мм / 2)
   * @param {number} lockedPositionY - Фиксированная высота для 2D физики
   * 
   * @throws {Error} Если номер шара вне диапазона 0-15
   * 
   * @example
   * ```typescript
   * const ball = new Ball(
   *   8,                            // Восьмёрка
   *   new THREE.Vector3(0, 0.8, 0), // Центр стола
   *   loadedBallMesh,
   *   world,
   *   0.0286,
   *   0.8286
   * );
   * ```
   */
  constructor(
    number: number,
    position: THREE.Vector3,
    ballMesh: THREE.Mesh | null,
    physicsWorld: CANNON.World,
    radius: number,
    lockedPositionY: number
  ) {
    // Валидация номера шара
    if (number < 0 || number > 15) {
      throw new Error(`Invalid ball number: ${number}. Must be 0-15.`);
    }

    this.number = number;
    this.type = number === 0 ? BallType.CUE : BallType.NUMBERED;
    this.lockedPositionY = lockedPositionY;

    // СОЗДАНИЕ ВИЗУАЛЬНОГО ПРЕДСТАВЛЕНИЯ
    if (ballMesh) {
      // Используем загруженный меш из модели
      this.mesh = ballMesh.clone() as THREE.Mesh;
      this.setupMaterialWithTexture();
    } else {
      // Fallback: создаём меш программно
      console.warn(`⚠️ Ball ${number}: No mesh provided, creating fallback sphere`);
      this.mesh = this.createBallWithTexture(radius);
    }

    // Настройка теней
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.position.copy(position);

    // СОЗДАНИЕ ФИЗИЧЕСКОГО ТЕЛА
    const ballMaterial = new CANNON.Material('ball');
    const shape = new CANNON.Sphere(radius);

    this.body = new CANNON.Body({
      mass: 0.170, // Стандартная масса бильярдного шара (кг)
      material: ballMaterial,
      shape: shape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      linearDamping: 0.15,  // Линейное затухание (трение сукна)
      angularDamping: 0.45, // Угловое затухание (сопротивление вращению)
      collisionResponse: true,
      sleepSpeedLimit: Ball.SLEEP_SPEED_LIMIT,
      sleepTimeLimit: 0.3, // Время до усыпления (сек)
      type: CANNON.Body.DYNAMIC,
    });

    physicsWorld.addBody(this.body);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ВИЗУАЛИЗАЦИЯ И ТЕКСТУРЫ
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Настраивает материал с процедурной текстурой для загруженного меша
   * 
   * Заменяет стандартный материал из модели на кастомный
   * с процедурно-сгенерированной текстурой номера шара
   * 
   * @private
   * @returns {void}
   */
  private setupMaterialWithTexture(): void {
    const texture = this.createBallTexture();

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.2,  // Слегка глянцевая поверхность
      metalness: 0.3,  // Легкий металлический отблеsk
    });

    this.mesh.material = material;
  }

  /**
   * Создаёт шар с процедурной текстурой (fallback если модель не загружена)
   * 
   * @private
   * @param {number} radius - Радиус сферы
   * @returns {THREE.Mesh} Меш шара с текстурой
   */
  private createBallWithTexture(radius: number): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(
      radius,
      Ball.SPHERE_SEGMENTS,
      Ball.SPHERE_SEGMENTS
    );

    const texture = this.createBallTexture();

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.2,
      metalness: 0.3,
    });

    return new THREE.Mesh(geometry, material);
  }

  /**
   * Создаёт процедурную текстуру для шара в стиле американского пула
   * 
   * Рисует на canvas:
   * - Фон (цвет шара или полосы для 9-15)
   * - Белый круг с номером (для цветных шаров)
   * - Номер шара (чёрный текст)
   * 
   * @private
   * @returns {THREE.CanvasTexture} Canvas-текстура для материала
   */
  private createBallTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    const size = Ball.TEXTURE_SIZE;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d')!;

    const ballColor = this.getBallColor();
    const isStriped = this.number >= 9 && this.number <= 15;

    // РИСУЕМ ФОН ШАРА
    if (this.type === BallType.CUE) {
      // Биток - полностью белый
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);
    } else if (this.number === 8) {
      // Восьмёрка - полностью чёрная
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size, size);
    } else if (isStriped) {
      // Полосатые шары (9-15)
      // Белый фон
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);

      // Цветные полосы
      const stripeWidth = size / 5;
      ctx.fillStyle = ballColor;
      ctx.fillRect(0, size * 0.3, size, stripeWidth);
      ctx.fillRect(0, size * 0.3 + stripeWidth * 2, size, stripeWidth);
    } else {
      // Сплошные шары (1-7)
      ctx.fillStyle = ballColor;
      ctx.fillRect(0, 0, size, size);
    }

    // РИСУЕМ НОМЕР НА БЕЛОМ КРУГЕ (только для цветных шаров)
    if (this.type === BallType.NUMBERED) {
      const circleSize = size * 0.35;
      const circleX = size / 2;
      const circleY = size / 2;

      // Белый круг
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(circleX, circleY, circleSize, 0, Math.PI * 2);
      ctx.fill();

      // Обводка круга
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Номер
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${size * 0.4}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.number.toString(), circleX, circleY);
    }

    // СОЗДАНИЕ ТЕКСТУРЫ
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;

    return texture;
  }

  /**
   * Возвращает цвет шара по номеру (стандарт американского пула)
   * 
   * Цветовая схема:
   * - 1, 9: Жёлтый
   * - 2, 10: Синий
   * - 3, 11: Красный
   * - 4, 12: Фиолетовый
   * - 5, 13: Оранжевый
   * - 6, 14: Зелёный
   * - 7, 15: Бордовый
   * - 8: Чёрный
   * 
   * @private
   * @returns {string} HEX-код цвета
   */
  private getBallColor(): string {
    const colors: BallColorScheme = {
      1: '#FFD700',  // Жёлтый (solid)
      2: '#0000CD',  // Синий (solid)
      3: '#DC143C',  // Красный (solid)
      4: '#9370DB',  // Фиолетовый (solid)
      5: '#FF8C00',  // Оранжевый (solid)
      6: '#228B22',  // Зелёный (solid)
      7: '#8B0000',  // Бордовый (solid)
      8: '#000000',  // Чёрный (eight-ball)
      9: '#FFD700',  // Жёлтый (striped)
      10: '#0000CD', // Синий (striped)
      11: '#DC143C', // Красный (striped)
      12: '#9370DB', // Фиолетовый (striped)
      13: '#FF8C00', // Оранжевый (striped)
      14: '#228B22', // Зелёный (striped)
      15: '#8B0000', // Бордовый (striped)
    };

    return colors[this.number] || '#CCCCCC';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ФИЗИКА И УПРАВЛЕНИЕ
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Применяет импульс к шару (выполняет удар кием)
   * 
   * Вычисляет силу удара на основе power (0-1) и применяет:
   * - Линейный импульс в направлении удара
   * - Угловой импульс (spin/вращение)
   * 
   * Формула силы:
   * ```
   * force = MIN_STRIKE_FORCE + (MAX_STRIKE_FORCE - MIN_STRIKE_FORCE) * power
   * ```
   * 
   * @public
   * @param {THREE.Vector3} direction - Направление удара (нормализованный вектор)
   * @param {number} power - Сила удара от 0.0 (слабо) до 1.0 (максимум)
   * @returns {void}
   * 
   * @example
   * ```typescript
   * // Удар на 70% силы в направлении +X
   * ball.applyImpulse(
   *   new THREE.Vector3(1, 0, 0),
   *   0.7
   * );
   * ```
   */
  public applyImpulse(direction: THREE.Vector3, power: number): void {
    // Клампим power в диапазоне [0, 1]
    power = Math.max(0, Math.min(1, power));

    // ВЫЧИСЛЕНИЕ СИЛЫ УДАРА
    const force =
      Ball.MIN_STRIKE_FORCE +
      (Ball.MAX_STRIKE_FORCE - Ball.MIN_STRIKE_FORCE) * power;

    const impulse = direction.clone().normalize().multiplyScalar(force);

    console.log('💥 Strike!', {
      ball: this.number,
      power: `${(power * 100).toFixed(0)}%`,
      force: force.toFixed(3),
      direction: `(${impulse.x.toFixed(3)}, ${impulse.z.toFixed(3)})`,
    });

    // ПРИМЕНЕНИЕ ЛИНЕЙНОГО ИМПУЛЬСА (только XZ - 2D физика)
    this.body.applyImpulse(
      new CANNON.Vec3(impulse.x, 0, impulse.z),
      this.body.position
    );

    // ПРИМЕНЕНИЕ УГЛОВОГО ИМПУЛЬСА (SPIN)
    const spinFactor = Ball.SPIN_FACTOR * power;
    const torque = new CANNON.Vec3(
      -impulse.z * spinFactor, // Вращение вокруг X
      0,                       // Не вращаемся вокруг Y (вертикаль)
      impulse.x * spinFactor   // Вращение вокруг Z
    );

    this.body.applyTorque(torque);

    // Пробуждаем шар (выход из sleep режима)
    this.body.wakeUp();
  }

  /**
   * Обновляет физику и визуальное представление шара
   * 
   * Выполняет каждый кадр:
   * 1. Фиксация Y-позиции (2D физика)
   * 2. Ограничение максимальной скорости
   * 3. Система гашения вращения
   * 4. Автоматическое усыпление при остановке
   * 5. Синхронизация визуала с физикой
   * 
   * Алгоритм гашения вращения:
   * ```
   * if (speed < SPIN_DAMPING_THRESHOLD):
   *   angularVelocity *= 0.85
   *   if (speed < FULL_STOP_THRESHOLD):
   *     angularVelocity = 0
   *     velocity *= 0.9
   *   if (speed < SLEEP_THRESHOLD):
   *     ПОЛНАЯ ОСТАНОВКА
   * ```
   * 
   * @public
   * @returns {void}
   * 
   * @example
   * ```typescript
   * // В игровом цикле
   * function animate() {
   *   ball.update();
   *   renderer.render(scene, camera);
   * }
   * ```
   */
  public update(): void {
    // Пропускаем забитые шары
    if (this.isPocketed) {
      return;
    }

    const velocity = this.body.velocity;

    // ФИКСАЦИЯ Y-ПОЗИЦИИ (2D физика на плоскости XZ)
    this.body.position.y = this.lockedPositionY;
    this.body.velocity.y = 0;

    // ВЫЧИСЛЕНИЕ СКОРОСТИ ПО ГОРИЗОНТАЛЬНОЙ ПЛОСКОСТИ
    const speedXZ = Math.sqrt(velocity.x ** 2 + velocity.z ** 2);

    // СИСТЕМА ГАШЕНИЯ ВРАЩЕНИЯ ПРИ ОСТАНОВКЕ
    if (speedXZ < Ball.SPIN_DAMPING_THRESHOLD) {
      // Шар почти остановился линейно - гасим вращение
      this.body.angularVelocity.scale(0.85, this.body.angularVelocity);

      if (speedXZ < Ball.FULL_STOP_THRESHOLD) {
        // Очень медленное движение - принудительная остановка вращения
        this.body.angularVelocity.setZero();
        velocity.scale(0.9, velocity);
      }
    }

    // ПОЛНАЯ ОСТАНОВКА И УСЫПЛЕНИЕ
    if (speedXZ < Ball.SLEEP_THRESHOLD) {
      velocity.setZero();
      this.body.angularVelocity.setZero();
      this.body.sleep();
    }

    // СИНХРОНИЗАЦИЯ ВИЗУАЛА С ФИЗИКОЙ
    this.mesh.position.copy(this.body.position as any);
    this.mesh.quaternion.copy(this.body.quaternion as any);
  }

  /**
   * Устанавливает состояние "забит в лузу"
   * 
   * Когда pocketed = true:
   * - Скрывает визуальный меш
   * - Усыпляет физическое тело
   * 
   * Когда pocketed = false:
   * - Показывает меш обратно
   * - Не пробуждает тело (это сделает resetPosition)
   * 
   * @public
   * @param {boolean} pocketed - true если шар забит, false если возвращён на стол
   * @returns {void}
   */
  public setPocketed(pocketed: boolean): void {
    this.isPocketed = pocketed;

    if (pocketed) {
      this.mesh.visible = false;
      this.body.sleep();
    } else {
      this.mesh.visible = true;
    }
  }

  /**
   * Проверяет, находится ли шар в движении
   * 
   * Критерии движения:
   * - Линейная скорость > SLEEP_SPEED_LIMIT
   * - ИЛИ угловая скорость > 0.5 рад/с
   * 
   * Оптимизация:
   * Если линейная скорость очень мала (< SLEEP_SPEED_LIMIT / 2),
   * игнорируем вращение (оно быстро загасится)
   * 
   * @public
   * @returns {boolean} true если шар движется (линейно или вращается)
   * 
   * @example
   * ```typescript
   * if (ball.isMoving()) {
   *   console.log('Wait for ball to stop...');
   * } else {
   *   console.log('Ball is stationary');
   * }
   * ```
   */
  public isMoving(): boolean {
    if (this.isPocketed) {
      return false;
    }

    const vel = this.body.velocity;
    const linearVel = Math.sqrt(vel.x ** 2 + vel.z ** 2); // Скорость по XZ
    const angularVel = this.body.angularVelocity.length();

    const linearThreshold = Ball.SLEEP_SPEED_LIMIT;
    const angularThreshold = 0.5;

    // Приоритет линейной скорости:
    // Если шар стоит на месте, вращение не учитываем
    if (linearVel < linearThreshold * 0.5) {
      return false;
    }

    return linearVel > linearThreshold || angularVel > angularThreshold;
  }

  /**
   * Сбрасывает шар в новую позицию (используется при расстановке)
   * 
   * Выполняет:
   * - Установка новой позиции
   * - Обнуление скоростей (linear + angular)
   * - Пробуждение тела
   * - Возврат из состояния "забит"
   * - Синхронизация визуала
   * 
   * @public
   * @param {THREE.Vector3} position - Новая позиция шара
   * @returns {void}
   * 
   * @example
   * ```typescript
   * // Расстановка в начальную позицию
   * ball.resetPosition(new THREE.Vector3(0, 0.8, 0));
   * ```
   */
  public resetPosition(position: THREE.Vector3): void {
    // Установка физической позиции
    this.body.position.set(position.x, position.y, position.z);

    // Обнуление скоростей
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();

    // Пробуждение тела
    this.body.wakeUp();

    // Возврат из лузы
    this.isPocketed = false;
    this.mesh.visible = true;

    // Синхронизация визуала
    this.update();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ГЕТТЕРЫ
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Возвращает текущую позицию шара в мировых координатах
   * 
   * @public
   * @returns {THREE.Vector3} Позиция центра шара
   */
  public getPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
  }

  /**
   * Возвращает текущую скорость шара
   * 
   * @public
   * @returns {THREE.Vector3} Вектор скорости (м/с)
   */
  public getVelocity(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.velocity.x,
      this.body.velocity.y,
      this.body.velocity.z
    );
  }

  /**
   * Возвращает визуальное представление шара
   * 
   * @public
   * @returns {THREE.Mesh} Three.js Mesh
   */
  public getMesh(): THREE.Mesh {
    return this.mesh;
  }

  /**
   * Возвращает физическое тело шара
   * 
   * @public
   * @returns {CANNON.Body} Cannon.js Body
   */
  public getBody(): CANNON.Body {
    return this.body;
  }

  /**
   * Возвращает номер шара
   * 
   * @public
   * @returns {number} Номер (0 = биток, 1-15 = цветные)
   */
  public getNumber(): number {
    return this.number;
  }

  /**
   * Возвращает тип шара
   * 
   * @public
   * @returns {BallType} BallType.CUE или BallType.NUMBERED
   */
  public getType(): BallType {
    return this.type;
  }

  /**
   * Проверяет, забит ли шар в лузу
   * 
   * @public
   * @returns {boolean} true если шар в лузе
   */
  public isPocketedState(): boolean {
    return this.isPocketed;
  }
}