import * as THREE from 'three';
import { CueStick } from '../objects/CueStick';
import { BallManager } from '../objects/BallManager';
import { UIManager } from '../ui/UIManager';
import { BallType } from '../objects/Ball';
import { GameRules } from '../GameRules';

/**
 * @class InputController
 * @description
 * Контроллер ввода и управления игрой в бильярд.
 * 
 * Система управления:
 * - **ЛКМ зажата + движение мыши вверх/вниз** → поворот кия (прицеливание)
 * - **Колесо мыши** → регулировка силы удара (0-100%)
 * - **Enter / Кнопка "Удар"** → выполнить удар
 * - **ЛКМ клик (в режиме размещения)** → разместить биток
 * 
 * Визуальные элементы:
 * - Прицельная линия (зелёная) - траектория удара
 * - Highlight (синяя сфера) - подсветка битка
 * - Ghost (полупрозрачный шар) - предпросмотр размещения битка
 * 
 * Режимы работы:
 * 1. **Обычный режим** - прицеливание и удар
 * 2. **Режим размещения битка** - после фола (биток забит)
 */
export class InputController {
  // КОНСТАНТЫ

  /** Чувствительность мыши для вращения кия */
  private readonly MOUSE_SENSITIVITY = 0.0022;

  /** Высота подъёма highlight над шаром */
  private readonly HIGHLIGHT_HEIGHT_OFFSET = 0.02;

  /** Максимальная длина прицельной линии (м) */
  private readonly AIM_LINE_MAX_LENGTH = 3;

  /** Ширина кольца highlight (м) */
  private readonly HIGHLIGHT_RING_WIDTH = 0.008;

  /** Множитель радиуса highlight */
  private readonly HIGHLIGHT_RADIUS_MULTIPLIER = 1.3;

  // Цвета
  private readonly COLOR_VALID = 0x00ff00;      // Зелёный (валидное размещение)
  private readonly COLOR_INVALID = 0xff0000;    // Красный (невалидное размещение)
  private readonly COLOR_HIGHLIGHT = 0x4dabf7;  // Голубой (подсветка битка)

  // ССЫЛКИ НА ПОДСИСТЕМЫ

  /** Камера Three.js */
  private camera: THREE.Camera;

  /** DOM-элемент canvas */
  private domElement: HTMLElement;

  /** Кий */
  private cueStick: CueStick;

  /** Менеджер шаров */
  private ballManager: BallManager;

  /** Правила игры */
  private gameRules: GameRules;

  /** Менеджер UI */
  private uiManager: UIManager;

  // ИНСТРУМЕНТЫ ВЗАИМОДЕЙСТВИЯ

  /** Raycaster для определения позиции мыши в 3D */
  private raycaster: THREE.Raycaster;

  /** Нормализованные координаты мыши (-1 до 1) */
  private mouse: THREE.Vector2;

  /** Плоскость стола для ray intersection */
  private tablePlane: THREE.Plane;

  // СОСТОЯНИЕ УПРАВЛЕНИЯ

  /** Текущая сила удара (0.0 - 1.0) */
  private power: number = 0.5;

  /** Режим размещения битка активен */
  private isPlacingCueBall: boolean = false;

  /** ЛКМ зажата (режим прицеливания) */
  private isMouseDown: boolean = false;

  /** Текущий угол поворота кия (радианы) */
  private currentCueAngle: number = 0;

  /** Последняя Y-позиция мыши (для отслеживания вертикального движения) */
  private lastMouseY: number = 0;

  // ВИЗУАЛЬНЫЕ ЭЛЕМЕНТЫ

  /** Прицельная линия (зелёная) */
  private aimLine: THREE.Line;

  /** Подсветка вокруг битка (синее кольцо) */
  private highlightOutline: THREE.Mesh | null = null;

  /** Призрак битка для предпросмотра размещения */
  private cueBallGhost: THREE.Mesh | null = null;

  // ПАРАМЕТРЫ

  /** Радиус бильярдного шара */
  private readonly BALL_RADIUS: number;

  // КОНСТРУКТОР

  /**
   * Создаёт контроллер ввода
   * 
   * @param camera - Камера Three.js
   * @param domElement - Canvas элемент
   * @param cueStick - Кий
   * @param ballManager - Менеджер шаров
   * @param gameRules - Правила игры
   */
  constructor(
    camera: THREE.Camera,
    domElement: HTMLElement,
    cueStick: CueStick,
    ballManager: BallManager,
    gameRules: GameRules
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.cueStick = cueStick;
    this.ballManager = ballManager;
    this.gameRules = gameRules;
    this.uiManager = new UIManager();

    this.BALL_RADIUS = this.ballManager.getBallRadius();

    // Создание плоскости стола для ray casting
    this.tablePlane = new THREE.Plane(
      new THREE.Vector3(0, 1, 0),
      -this.ballManager.getBallPositionY()
    );

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Создание визуальных элементов
    this.aimLine = this.createAimLine();
    this.highlightOutline = this.createHighlightOutline();
    this.cueBallGhost = this.createCueBallGhost();

    // Настройка обработчиков
    this.setupUICallbacks();
    this.setupEventListeners();

    console.log('🎮 InputController initialized');
  }

  // СОЗДАНИЕ ВИЗУАЛЬНЫХ ЭЛЕМЕНТОВ

  /**
   * Создаёт прицельную линию
   * @private
   */
  private createAimLine(): THREE.Line {
    const material = new THREE.LineBasicMaterial({
      color: this.COLOR_VALID,
      linewidth: 2,
      transparent: true,
      opacity: 0.75
    });

    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3()
    ]);

    const line = new THREE.Line(geometry, material);
    line.visible = false;

    return line;
  }

  /**
   * Создаёт highlight-кольцо вокруг битка
   * @private
   */
  private createHighlightOutline(): THREE.Mesh {
    const radius = this.BALL_RADIUS * this.HIGHLIGHT_RADIUS_MULTIPLIER;

    // Используем RingGeometry для плоского кольца
    const geometry = new THREE.RingGeometry(
      radius,
      radius + this.HIGHLIGHT_RING_WIDTH,
      32
    );

    const material = new THREE.MeshBasicMaterial({
      color: this.COLOR_HIGHLIGHT,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthTest: false, // Всегда поверх других объектов
    });

    const outline = new THREE.Mesh(geometry, material);
    outline.rotation.x = -Math.PI / 2; // Поворачиваем горизонтально
    outline.visible = false;
    outline.renderOrder = 1000; // Рендерим поверх всего

    return outline;
  }

  /**
   * Создаёт призрак битка для предпросмотра размещения
   * @private
   */
  private createCueBallGhost(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(this.BALL_RADIUS, 32, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      wireframe: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;

    return mesh;
  }

  // НАСТРОЙКА ОБРАБОТЧИКОВ

  /**
   * Настраивает коллбэки UI
   * @private
   */
  private setupUICallbacks(): void {
    // Изменение силы удара
    this.uiManager.onPowerChanged((power) => {
      this.power = power;
      this.updateCuePullback();
    });

    // Кнопка удара
    this.uiManager.onStrikeClicked(() => this.performStrike());

    // Кнопка рестарта
    this.uiManager.onRestartClicked(() => {
      window.dispatchEvent(new Event('restartGame'));
    });
  }

  /**
   * Настраивает обработчики событий мыши и клавиатуры
   * @private
   */
  private setupEventListeners(): void {
    this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.domElement.addEventListener('mouseleave', this.onMouseUp.bind(this));
    this.domElement.addEventListener('wheel', this.onWheel.bind(this), { passive: false });

    // Enter для удара
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.performStrike();
    });
  }

  // ОБРАБОТЧИКИ СОБЫТИЙ

  /**
   * Обработчик движения мыши
   * @private
   */
  private onMouseMove(event: MouseEvent): void {
    this.updateMousePosition(event.clientX, event.clientY);

    // Режим размещения битка
    if (this.isPlacingCueBall) {
      this.updateCueBallPlacement();
      this.hideHighlight(); // 🔥 Скрываем highlight
      return;
    }

    // Режим прицеливания (ЛКМ зажата)
    if (this.isMouseDown && this.ballManager.areAllBallsStopped()) {
      this.updateAimWithVerticalMouse(event.clientY);
    }

    // 🔥 Обновляем позицию highlight каждый кадр
    this.updateHighlightPosition();
  }

  /**
   * Обновляет позицию highlight по текущей позиции битка
   * @private
   */
  private updateHighlightPosition(): void {
    const cueBall = this.ballManager.getCueBall();

    // Скрываем если битка нет или он забит
    if (!cueBall || cueBall.isPocketedState()) {
      this.hideHighlight();
      return;
    }

    // Скрываем в режиме размещения
    if (this.isPlacingCueBall) {
      this.hideHighlight();
      return;
    }

    // Обновляем позицию по актуальной позиции битка
    if (this.highlightOutline && this.highlightOutline.visible) {
      const currentPosition = cueBall.getPosition();
      this.highlightOutline.position.set(
        currentPosition.x,
        currentPosition.y + this.HIGHLIGHT_HEIGHT_OFFSET, // 🔥 Чуть выше
        currentPosition.z
      );
    }
  }

  /**
   * Обновляет прицеливание при вертикальном движении мыши
   * @private
   */
  private updateAimWithVerticalMouse(clientY: number): void {
    const cueBall = this.ballManager.getCueBall();
    
    if (!cueBall || cueBall.isPocketedState()) {
      this.hideHighlight();
      this.aimLine.visible = false;
      return;
    }

    // Вычисляем изменение Y-позиции мыши
    const deltaY = clientY - this.lastMouseY;
    this.lastMouseY = clientY;

    // Обновляем угол кия
    this.currentCueAngle -= deltaY * this.MOUSE_SENSITIVITY;
    this.currentCueAngle = this.currentCueAngle % (Math.PI * 2);

    // Применяем поворот к кию
    this.cueStick.setRotation(this.currentCueAngle);
    this.updateCuePullback();

    // Обновляем прицельную линию
    const cueBallPos = cueBall.getPosition();
    const direction = new THREE.Vector3(
      Math.cos(this.currentCueAngle),
      0,
      -Math.sin(this.currentCueAngle)
    );

    this.updateAimLine(cueBallPos, direction);
  }

  /**
   * Обработчик нажатия кнопки мыши
   * @private
   */
  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // Только ЛКМ

    if (this.isPlacingCueBall) {
      // Размещение битка
      this.placeCueBall();
    } else {
      // Включение режима прицеливания
      this.isMouseDown = true;
      this.lastMouseY = event.clientY;
      console.log('🎯 Aiming mode ON');
    }
  }

  /**
   * Обработчик отпускания кнопки мыши
   * @private
   */
  private onMouseUp(event: MouseEvent): void {
    if (event.button === 0 || event.type === 'mouseleave') {
      if (this.isMouseDown) {
        this.isMouseDown = false;
        console.log('🎯 Aiming mode OFF');
      }
    }
  }

  /**
   * Обработчик колеса мыши (регулировка силы)
   * @private
   */
  private onWheel(event: WheelEvent): void {
    event.preventDefault();

    // Не работает во время движения шаров или размещения
    if (!this.ballManager.areAllBallsStopped() || this.isPlacingCueBall) {
      return;
    }

    // Изменение силы
    const delta = -Math.sign(event.deltaY) * 5;
    const currentPower = this.uiManager.getPower();
    const newPower = THREE.MathUtils.clamp(currentPower + delta / 100, UIManager.MIN_POWER, UIManager.MAX_POWER);

    this.power = this.uiManager.setPower(newPower);
    this.updateCuePullback();
  }

  // УПРАВЛЕНИЕ СОСТОЯНИЕМ ХОДА

  /**
   * Обрабатывает начало хода (удар совершён, шары движутся)
   */
  public handleTurnStart(): void {
    this.aimLine.visible = false;
    this.uiManager.setStrikeEnabled(false);
    this.hideHighlight();
    this.cueStick.getMesh().visible = false;
    this.isMouseDown = false;

    console.log('▶️ Turn started');
  }

  /**
   * Обрабатывает окончание хода (шары остановились)
   */
  public handleTurnEnd(): void {
    const cueBall = this.ballManager.getCueBall();
    const state = this.gameRules.getState();

    // 🔥 Проверяем нужно ли размещать биток
    if (state.canPlaceCueBall || !cueBall || cueBall.isPocketedState()) {
      console.log('🎯 Starting cue ball placement mode...');
      this.enterCueBallPlacementMode();
      return;
    }

    // Обычный режим - можно целиться
    this.uiManager.setStrikeEnabled(true);
    this.cueStick.setTargetBall(cueBall.getPosition());
    this.highlightCueBall();
    this.cueStick.getMesh().visible = true;
    this.aimLine.visible = true;
    this.updateAimLineFromCurrentAngle();

    // 🔥 Обновляем UI из актуального состояния
    this.updateGameInfoFromState();

    console.log('⏸️ Turn ended - ready for next strike');
  }

  /**
   * Обновляет UI из актуального состояния игры
   * @private
   */
  private updateGameInfoFromState(): void {
    const state = this.gameRules.getState();
    const message = this.gameRules.getTurnStartMessage();
    const pocketed = this.ballManager.getPocketedBalls().length;

    let groupsText = 'Группы не определены';
    if (state.player1Group !== 'none') {
      const p1 = state.player1Group === 'solids' ? 'Сплошные (1-7)' : 'Полосатые (9-15)';
      const p2 = state.player2Group === 'solids' ? 'Сплошные (1-7)' : 'Полосатые (9-15)';
      groupsText = `P1: ${p1} | P2: ${p2}`;
    }

    this.uiManager.updateGameInfo(message, state.currentPlayer, groupsText, pocketed);
  }

  // РЕЖИМ РАЗМЕЩЕНИЯ БИТКА

  /**
   * Входит в режим размещения битка (после фола)
   * @private
   */
  private enterCueBallPlacementMode(): void {
    this.isPlacingCueBall = true;
    this.isMouseDown = false;
    this.aimLine.visible = false;
    this.cueStick.getMesh().visible = false;
    this.hideHighlight(); // 🔥 Скрываем highlight
    this.uiManager.setStrikeEnabled(false);

    // Показываем призрак битка
    if (this.cueBallGhost) {
      this.cueBallGhost.visible = true;
    }

    // Обновляем UI
    const state = this.gameRules.getState();
    this.uiManager.updateGameInfo(
      '🎯 Разместите биток (ЛКМ для подтверждения)',
      state.currentPlayer,
      '',
      this.ballManager.getPocketedBalls().length
    );

    console.log('📍 Cue ball placement mode activated');
  }

  /**
   * Обновляет предпросмотр размещения битка
   * @private
   */
  private updateCueBallPlacement(): void {
    const worldPos = this.getWorldPositionFromMouse();
    if (!worldPos || !this.cueBallGhost) return;

    // Обновляем позицию призрака
    this.cueBallGhost.position.copy(worldPos);

    // Изменяем цвет в зависимости от валидности размещения
    const canPlace = this.ballManager.canPlaceCueBall(worldPos);
    (this.cueBallGhost.material as THREE.MeshBasicMaterial).color.setHex(
      canPlace ? this.COLOR_VALID : this.COLOR_INVALID
    );
  }

  /**
   * Размещает биток в текущей позиции мыши
   * @private
   */
  private placeCueBall(): void {
    const worldPos = this.getWorldPositionFromMouse();
    if (!worldPos) return;

    if (this.ballManager.canPlaceCueBall(worldPos)) {
      // Размещаем биток
      this.ballManager.placeCueBall(worldPos);
      this.exitCueBallPlacementMode();
      this.gameRules.cueBallPlaced();

      console.log('✅ Cue ball placed at', worldPos);

      // Переходим в режим прицеливания
      this.handleTurnEnd();
    } else {
      console.warn('⚠️ Cannot place cue ball here!');
    }
  }

  /**
   * Выходит из режима размещения битка
   * @private
   */
  private exitCueBallPlacementMode(): void {
    this.isPlacingCueBall = false;
    if (this.cueBallGhost) {
      this.cueBallGhost.visible = false;
    }
  }

  // ПРИЦЕЛИВАНИЕ И УДАР

  /**
   * Обновляет прицельную линию из текущего угла кия
   * @private
   */
  private updateAimLineFromCurrentAngle(): void {
    const cueBall = this.ballManager.getCueBall();
    if (!cueBall || cueBall.isPocketedState()) return;

    const cueBallPos = cueBall.getPosition();
    const direction = new THREE.Vector3(
      Math.cos(this.currentCueAngle),
      0,
      -Math.sin(this.currentCueAngle)
    );

    this.updateAimLine(cueBallPos, direction);
  }

  /**
   * Обновляет прицельную линию
   * 
   * Вычисляет траекторию луча и находит первое пересечение с другим шаром.
   * 
   * @private
   * @param startPoint - Начальная точка (позиция битка)
   * @param direction - Направление удара
   */
  private updateAimLine(startPoint: THREE.Vector3, direction: THREE.Vector3): void {
    const ray = new THREE.Ray(startPoint, direction);
    const balls = this.ballManager.getActiveBalls().filter(b => b.getType() !== BallType.CUE);
    
    let firstHit: { distance: number; point: THREE.Vector3 } | null = null;

    // Находим ближайшее пересечение с шарами
    for (const ball of balls) {
      const sphere = new THREE.Sphere(ball.getPosition(), this.BALL_RADIUS);
      const intersectionPoint = new THREE.Vector3();
      
      if (ray.intersectSphere(sphere, intersectionPoint)) {
        const distance = startPoint.distanceTo(intersectionPoint);
        if (!firstHit || distance < firstHit.distance) {
          firstHit = { distance, point: intersectionPoint };
        }
      }
    }

    // Определяем конечную точку линии
    const endPoint = firstHit
      ? firstHit.point
      : startPoint.clone().add(direction.multiplyScalar(this.AIM_LINE_MAX_LENGTH));

    // Обновляем геометрию линии
    const positions = new Float32Array([...startPoint.toArray(), ...endPoint.toArray()]);
    this.aimLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.aimLine.geometry.computeBoundingSphere();
  }

  /**
   * Выполняет удар кием
   * @private
   */
  private performStrike(): void {
    const state = this.gameRules.getState();

    // Проверка: игра окончена
    if (state.gameOver) {
      console.log('⚠️ Game is over!');
      return;
    }

    // Проверка: шары движутся или удар недоступен
    if (!this.ballManager.areAllBallsStopped() || !this.uiManager.isStrikeEnabled()) {
      return;
    }

    // Проверка: режим размещения битка
    if (this.isPlacingCueBall) {
      console.warn('⚠️ Cannot strike while placing cue ball!');
      return;
    }

    const cueBall = this.ballManager.getCueBall();

    // Проверка: биток существует и не забит
    if (!cueBall || cueBall.isPocketedState()) {
      console.warn('⚠️ Cannot strike: cue ball is pocketed!');
      return;
    }

    // Выполняем удар
    const direction = this.cueStick.getStrikeVector();
    this.cueStick.animateStrike(() => {
      cueBall.applyImpulse(direction, this.power);
      console.log(`💥 Strike executed: power=${(this.power * 100).toFixed(0)}%, angle=${this.currentCueAngle.toFixed(2)}rad`);
    });
  }

  /**
   * Обновляет оттяжку кия в зависимости от силы
   * @private
   */
  private updateCuePullback(): void {
    const pullback = this.power * this.cueStick.getMaxPullback();
    this.cueStick.setPullback(pullback);
  }

  // ВИЗУАЛЬНЫЕ ЭЛЕМЕНТЫ

  /**
   * Показывает highlight вокруг битка
   * @private
   */
  private highlightCueBall(): void {
    const cueBall = this.ballManager.getCueBall();

    if (this.highlightOutline && cueBall && !cueBall.isPocketedState()) {
      const position = cueBall.getPosition();
      this.highlightOutline.position.set(
        position.x,
        position.y + this.HIGHLIGHT_HEIGHT_OFFSET,
        position.z
      );
      this.highlightOutline.visible = true;
    } else {
      this.hideHighlight();
    }
  }

  /**
   * Скрывает highlight
   * @private
   */
  private hideHighlight(): void {
    if (this.highlightOutline) {
      this.highlightOutline.visible = false;
    }
  }

  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ

  /**
   * Получает мировые координаты из позиции мыши
   * @private
   * @returns Позиция на плоскости стола или null
   */
  private getWorldPositionFromMouse(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersection = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.tablePlane, intersection)
      ? intersection
      : null;
  }

  /**
   * Обновляет нормализованные координаты мыши
   * @private
   */
  private updateMousePosition(clientX: number, clientY: number): void {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  // ПУБЛИЧНЫЕ МЕТОДЫ

  /**
   * Обновляет информацию на UI
   * 
   * @param message - Сообщение о состоянии игры
   * @param player - Номер текущего игрока
   * @param groups - Информация о группах
   * @param pocketed - Количество забитых шаров
   */
  public updateGameInfo(message: string, player: number, groups: string, pocketed: number): void {
    this.uiManager.updateGameInfo(message, player, groups, pocketed);
  }

  // ГЕТТЕРЫ

  /**
   * Возвращает прицельную линию
   * @returns Three.js Line
   */
  public getAimLine(): THREE.Line {
    return this.aimLine;
  }

  /**
   * Возвращает highlight-кольцо
   * @returns Three.js Mesh или null
   */
  public getHighlightOutline(): THREE.Mesh | null {
    return this.highlightOutline;
  }

  /**
   * Возвращает призрак битка
   * @returns Three.js Mesh или null
   */
  public getCueBallGhost(): THREE.Mesh | null {
    return this.cueBallGhost;
  }

  // ОЧИСТКА РЕСУРСОВ

  /**
   * Освобождает ресурсы контроллера
   */
  public dispose(): void {
    console.log('🗑️ Disposing InputController...');

    this.uiManager.dispose();

    // Очистка геометрий и материалов
    this.aimLine.geometry.dispose();
    (this.aimLine.material as THREE.Material).dispose();

    if (this.highlightOutline) {
      this.highlightOutline.geometry.dispose();
      (this.highlightOutline.material as THREE.Material).dispose();
    }

    if (this.cueBallGhost) {
      this.cueBallGhost.geometry.dispose();
      (this.cueBallGhost.material as THREE.Material).dispose();
    }

    console.log('✅ InputController disposed');
  }
}