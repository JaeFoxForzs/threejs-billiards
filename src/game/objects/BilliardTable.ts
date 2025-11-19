import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsWorld } from '../PhysicsWorld';

/**
 * @interface Pocket
 * @description Структура данных для описания лузы на бильярдном столе
 * 
 * @property {THREE.Mesh} mesh - Визуальное представление триггерной зоны лузы
 * @property {THREE.Box3} boundingBox - Ограничивающий бокс для проверки попадания шара
 * @property {THREE.Vector3} position - Мировая позиция центра лузы
 * @property {number} radius - Эффективный радиус лузы (максимальный размер по XZ)
 */
export interface Pocket {
  mesh: THREE.Mesh;
  boundingBox: THREE.Box3;
  position: THREE.Vector3;
  radius: number;
}

/**
 * @class BilliardTable
 * @description
 * Класс бильярдного стола, управляющий:
 * - Визуальной моделью стола (загружается из Blender)
 * - Физической коллизией (меш "Collision")
 * - Лузами (меши "TriggerPocket0" - "TriggerPocket5")
 * 
 * Архитектура модели в Blender:
 * ┌─────────────────────────────────────────┐
 * │ Table Root                              │
 * │ ├─ Bed (игровая поверхность)            │
 * │ ├─ Cushions (борта)                     │
 * │ ├─ Rails (перила)                       │
 * │ ├─ Legs (ножки)                         │
 * │ ├─ Collision (физический меш) [HIDDEN]  │
 * │ └─ TriggerPocket0..5 (лузы) [HIDDEN]    │
 * └─────────────────────────────────────────┘
 * 
 * Система координат:
 * - X: длина стола (влево-вправо)
 * - Y: высота (вверх)
 * - Z: ширина стола (вперед-назад)
 * 
 * @example
 * ```typescript
 * const loader = new GLTFLoader();
 * const gltf = await loader.loadAsync('/models/table.glb');
 * const table = new BilliardTable(gltf.scene, physicsWorld);
 * scene.add(table.getMesh());
 * 
 * // Проверка попадания в лузу
 * const pocket = table.isInPocket(ballPosition);
 * if (pocket) {
 *   console.log('Ball in pocket!');
 * }
 * ```
 */
export class BilliardTable {
  // КОНСТАНТЫ КЛАССА

  /**
   * Имя меша физической коллизии в модели Blender
   * @private
   * @readonly
   */
  private static readonly COLLISION_MESH_NAME = 'collision';

  /**
   * Префикс имени мешей триггеров луз в Blender
   * @private
   * @readonly
   */
  private static readonly POCKET_TRIGGER_PREFIX = 'triggerpocket';

  /**
   * Имя меша игровой поверхности (для определения высоты)
   * @private
   * @readonly
   */
  private static readonly BED_MESH_NAME = 'bed';

  /**
   * Коэффициент уменьшения размеров для вычисления игровой зоны
   * (компенсирует борта и края)
   * @private
   * @readonly
   */
  private static readonly PLAYING_AREA_SCALE = 0.93;

  // ПРИВАТНЫЕ ПОЛЯ

  /**
   * Корневой объект стола (содержит всю визуальную геометрию)
   * @private
   */
  private mesh: THREE.Group;

  /**
   * Ссылка на физический мир для добавления тел
   * @private
   */
  private physicsWorld: PhysicsWorld;

  /**
   * Массив всех луз на столе (обычно 6 штук)
   * @private
   */
  private pockets: Pocket[] = [];

  /**
   * Режим отладки (включается через ?debug в URL)
   * @private
   */
  private debugMode: boolean = false;

  /**
   * Массив отладочных мешей для визуализации коллизий и луз
   * @private
   */
  private debugMeshes: THREE.Object3D[] = [];

  // ПУБЛИЧНЫЕ СВОЙСТВА (READONLY)

  /**
   * Длина игровой зоны стола (по оси X), в метрах
   * Вычисляется автоматически из размеров модели
   * @public
   * @readonly
   */
  public tableLength: number = 3.6;

  /**
   * Ширина игровой зоны стола (по оси Z), в метрах
   * Вычисляется автоматически из размеров модели
   * @public
   * @readonly
   */
  public tableWidth: number = 1.8;

  /**
   * Высота игровой поверхности (Y-координата), в метрах
   * Определяется по мешу "Bed" из модели
   * @public
   * @readonly
   */
  public tableHeight: number = 0.8;

  /**
   * Высота бортов стола, в метрах
   * @public
   * @readonly
   */
  public readonly cushionHeight: number = 0.037;

  /**
   * Радиус лузы, в метрах
   * @public
   * @readonly
   */
  public readonly pocketRadius: number = 0.08;

  // КОНСТРУКТОР

  /**
   * Создает экземпляр бильярдного стола
   * 
   * @param {THREE.Object3D} model - Загруженная 3D модель из Blender (GLTF)
   * @param {PhysicsWorld} physicsWorld - Экземпляр физического мира
   * 
   * @throws {Error} Если модель не содержит необходимых мешей
   * 
   * @example
   * ```typescript
   * const gltf = await new GLTFLoader().loadAsync('/models/table.glb');
   * const table = new BilliardTable(gltf.scene, physicsWorld);
   * ```
   */
  constructor(model: THREE.Object3D, physicsWorld: PhysicsWorld) {
    this.physicsWorld = physicsWorld;
    this.mesh = new THREE.Group();
    this.debugMode = new URLSearchParams(window.location.search).has('debug');

    console.log('🎱 Initializing Billiard Table...');

    // Инициализация в строгом порядке
    this.setupTableFromModel(model);
    this.createPhysicsFromCollisionMesh(model);
    this.setupPocketsFromTriggerMesh(model);

    console.log('✅ Billiard Table initialized successfully');
  }

  // ИНИЦИАЛИЗАЦИЯ: ВИЗУАЛЬНАЯ МОДЕЛЬ

  /**
   * Настраивает визуальную модель стола из загруженного Blender объекта
   * 
   * Выполняет:
   * 1. Клонирование модели (чтобы не изменять оригинал)
   * 2. Настройка теней для всех мешей
   * 3. ✅ СОХРАНЕНИЕ материалов из Blender (БЕЗ перезаписи)
   * 4. Скрытие служебных мешей (Collision, TriggerPockets)
   * 5. Определение высоты игровой поверхности по мешу "Bed"
   * 6. Центрирование стола в начале координат
   * 7. Вычисление размеров игровой зоны
   * 
   * @private
   * @param {THREE.Object3D} model - Исходная модель из Blender
   * @returns {void}
   */
  private setupTableFromModel(model: THREE.Object3D): void {
    console.log('  📦 Setting up table model from Blender...');

    // Клонируем модель для изоляции от оригинала
    const tableClone = model.clone();
    let playingSurfaceHeight: number | null = null;

    // Логирование материалов (для отладки импорта из Blender)
    if (this.debugMode) {
      console.log('  🎨 Materials loaded from Blender:');
    }

    // Обход всех дочерних мешей
    tableClone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return; // Пропускаем не-меши (Group, Light и т.д.)
      }

      const name = child.name.toLowerCase();

      // СКРЫВАЕМ СЛУЖЕБНЫЕ МЕШИ
      if (
        name === BilliardTable.COLLISION_MESH_NAME ||
        name.startsWith(BilliardTable.POCKET_TRIGGER_PREFIX)
      ) {
        child.visible = false;
        console.log(`    🚫 Hidden service mesh: "${child.name}"`);
        return;
      }

      // НАСТРОЙКА ТЕНЕЙ
      child.castShadow = true;
      child.receiveShadow = true;

      // ✅ СОХРАНЕНИЕ МАТЕРИАЛОВ ИЗ BLENDER
      if (child.material) {
        // Обработка как одного материала, так и массива материалов
        const materials = Array.isArray(child.material) 
          ? child.material 
          : [child.material];

        materials.forEach((mat) => {
          // Помечаем материал для обновления в GPU
          mat.needsUpdate = true;

          // Логирование материалов в debug режиме
          if (this.debugMode && mat instanceof THREE.MeshStandardMaterial) {
            console.log(`    🎨 "${child.name}":`, {
              type: mat.type,
              color: mat.color ? `#${mat.color.getHexString()}` : 'N/A',
              roughness: mat.roughness,
              metalness: mat.metalness,
              map: mat.map ? '✅ Texture' : '❌ No texture',
              normalMap: mat.normalMap ? '✅ Normal' : '❌',
              roughnessMap: mat.roughnessMap ? '✅ Roughness' : '❌',
            });
          }
        });
      }

      // ОПРЕДЕЛЕНИЕ ВЫСОТЫ ИГРОВОЙ ПОВЕРХНОСТИ
      if (name.includes(BilliardTable.BED_MESH_NAME)) {
        const bedBox = new THREE.Box3().setFromObject(child, true);
        playingSurfaceHeight = bedBox.max.y;
        console.log(`    📏 Bed mesh found, height: ${playingSurfaceHeight.toFixed(4)}m`);
      }
    });

    // ─────────────────────────────────────────────────────────────────────
    // ДОБАВЛЕНИЕ МОДЕЛИ В ГРУППУ
    // ─────────────────────────────────────────────────────────────────────
    this.mesh.add(tableClone);

    // ─────────────────────────────────────────────────────────────────────
    // ЦЕНТРИРОВАНИЕ СТОЛА В НАЧАЛЕ КООРДИНАТ
    // ─────────────────────────────────────────────────────────────────────
    const boundingBox = new THREE.Box3().setFromObject(this.mesh);
    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());

    // Перемещаем стол так, чтобы его центр был в (0, 0, 0),
    // а нижняя грань была на Y=0
    this.mesh.position.set(
      -center.x,
      -boundingBox.min.y,
      -center.z
    );

    console.log(`    🔧 Table centered at origin, offset: (${this.mesh.position.x.toFixed(3)}, ${this.mesh.position.y.toFixed(3)}, ${this.mesh.position.z.toFixed(3)})`);

    // ─────────────────────────────────────────────────────────────────────
    // ВЫЧИСЛЕНИЕ РАЗМЕРОВ ИГРОВОЙ ЗОНЫ
    // ─────────────────────────────────────────────────────────────────────
    // Определяем, какая ось длиннее (автоматическая ориентация)
    if (size.x > size.z) {
      this.tableLength = size.x * BilliardTable.PLAYING_AREA_SCALE;
      this.tableWidth = size.z * BilliardTable.PLAYING_AREA_SCALE;
    } else {
      this.tableLength = size.z * BilliardTable.PLAYING_AREA_SCALE;
      this.tableWidth = size.x * BilliardTable.PLAYING_AREA_SCALE;
    }

    // ─────────────────────────────────────────────────────────────────────
    // УСТАНОВКА ВЫСОТЫ ИГРОВОЙ ПОВЕРХНОСТИ
    // ─────────────────────────────────────────────────────────────────────
    if (playingSurfaceHeight !== null) {
      this.tableHeight = playingSurfaceHeight;
    } else {
      console.warn(`  ⚠️ Playing surface mesh ("${BilliardTable.BED_MESH_NAME}") not found, using bounding box max Y`);
      this.tableHeight = boundingBox.max.y;
    }

    console.log(`  ✅ Table dimensions: ${this.tableLength.toFixed(3)}m × ${this.tableWidth.toFixed(3)}m × ${this.tableHeight.toFixed(3)}m`);
  }

  // ИНИЦИАЛИЗАЦИЯ: ФИЗИЧЕСКАЯ КОЛЛИЗИЯ

  /**
   * Создает физическую коллизию стола из меша "Collision"
   * 
   * Workflow:
   * 1. Поиск меша "Collision" в модели
   * 2. Если найден → создание Trimesh из геометрии
   * 3. Если не найден → fallback на примитивные Box-коллайдеры
   * 4. В debug режиме → визуализация коллизии
   * 
   * @private
   * @param {THREE.Object3D} model - Исходная модель из Blender
   * @returns {void}
   */
  private createPhysicsFromCollisionMesh(model: THREE.Object3D): void {
    console.log('  ⚙️ Creating physics collision...');

    // Материал для физического тела стола
    const tableMaterial = new CANNON.Material('table');

    // Поиск меша коллизии
    let collisionMesh: THREE.Mesh | null = null;
    model.traverse((child) => {
      if (
        child.name.toLowerCase() === BilliardTable.COLLISION_MESH_NAME &&
        child instanceof THREE.Mesh
      ) {
        collisionMesh = child;
      }
    });

    // ─────────────────────────────────────────────────────────────────────
    // ВАРИАНТ 1: Найден меш "Collision" → создаем Trimesh
    // ─────────────────────────────────────────────────────────────────────
    if (collisionMesh) {
      collisionMesh = collisionMesh as THREE.Mesh;
  
      console.log(`    🎯 Found collision mesh: "${collisionMesh.name}"`);
      this.createCollisionBodyFromMesh(collisionMesh, tableMaterial);

      // Визуализация в debug режиме
      if (this.debugMode) {
        this.addCollisionDebugVisualization(collisionMesh);
      }
    }
    // ─────────────────────────────────────────────────────────────────────
    // ВАРИАНТ 2: Меш не найден → fallback на простые коллайдеры
    // ─────────────────────────────────────────────────────────────────────
    else {
      console.warn(`    ⚠️ Collision mesh "${BilliardTable.COLLISION_MESH_NAME}" not found`);
      console.log('    🔧 Using fallback collision (box primitives)');
      this.createFallbackCollision(this.tableHeight, tableMaterial);
    }
  }

  /**
   * Создает физическое тело Cannon.js из Three.js меша
   * 
   * Преобразование:
   * Three.js Mesh (BufferGeometry) → Cannon.js Trimesh (vertices + indices)
   * 
   * @private
   * @param {THREE.Mesh} mesh - Меш коллизии из Blender
   * @param {CANNON.Material} material - Физический материал
   * @returns {void}
   */
  private createCollisionBodyFromMesh(
    mesh: THREE.Mesh,
    material: CANNON.Material
  ): void {
    // Клонируем геометрию и применяем мировые трансформации
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);

    // Извлекаем атрибуты геометрии
    const positionAttr = geometry.getAttribute('position');
    const indexAttr = geometry.index;

    if (!positionAttr) {
      console.error('    ❌ Collision mesh has no position attribute');
      return;
    }

    // ─────────────────────────────────────────────────────────────────────
    // ИЗВЛЕЧЕНИЕ ВЕРШИН
    // ─────────────────────────────────────────────────────────────────────
    const vertices: number[] = [];
    for (let i = 0; i < positionAttr.count; i++) {
      vertices.push(
        positionAttr.getX(i),
        positionAttr.getY(i),
        positionAttr.getZ(i)
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // ИЗВЛЕЧЕНИЕ ИНДЕКСОВ (треугольников)
    // ─────────────────────────────────────────────────────────────────────
    let indices: number[] = [];
    if (indexAttr) {
      // Геометрия с индексами (оптимизированная)
      indices = Array.from(indexAttr.array);
    } else {
      // Геометрия без индексов (non-indexed)
      for (let i = 0; i < positionAttr.count; i++) {
        indices.push(i);
      }
    }

    const triangleCount = indices.length / 3;
    const vertexCount = vertices.length / 3;

    console.log(`    📐 Collision mesh: ${vertexCount} vertices, ${triangleCount} triangles`);

    // ─────────────────────────────────────────────────────────────────────
    // СОЗДАНИЕ TRIMESH
    // ─────────────────────────────────────────────────────────────────────
    const trimeshShape = new CANNON.Trimesh(vertices, indices);

    const collisionBody = new CANNON.Body({
      mass: 0, // Статическое тело (не движется)
      material: material,
      shape: trimeshShape,
      collisionResponse: true,
      type: CANNON.Body.STATIC,
    });

    this.physicsWorld.addBody(collisionBody);
    console.log('    ✅ Trimesh collision body created and added to physics world');
  }

  /**
   * Создает упрощенную физическую коллизию из примитивов Box
   * 
   * Используется как fallback, если меш "Collision" не найден в модели.
   * Создает 5 коллайдеров:
   * - 1 плоскость (игровая поверхность)
   * - 4 борта (стенки)
   * 
   * @private
   * @param {number} tableY - Высота игровой поверхности
   * @param {CANNON.Material} material - Физический материал
   * @returns {void}
   */
  private createFallbackCollision(
    tableY: number,
    material: CANNON.Material
  ): void {
    const halfLength = this.tableLength / 2;
    const halfWidth = this.tableWidth / 2;

    // ─────────────────────────────────────────────────────────────────────
    // ИГРОВАЯ ПОВЕРХНОСТЬ (пол стола)
    // ─────────────────────────────────────────────────────────────────────
    const floorShape = new CANNON.Box(new CANNON.Vec3(halfLength, 0.01, halfWidth));
    const floorBody = new CANNON.Body({
      mass: 0,
      material: material,
      shape: floorShape,
      position: new CANNON.Vec3(0, tableY, 0),
      type: CANNON.Body.STATIC,
    });
    this.physicsWorld.addBody(floorBody);

    // ─────────────────────────────────────────────────────────────────────
    // БОРТА (4 стенки)
    // ─────────────────────────────────────────────────────────────────────
    const cushionHeight = 0.15; // Высота бортов
    const cushionY = tableY + cushionHeight / 2;
    const thickness = 0.04; // Толщина бортов

    const walls = [
      // Борт сверху (+Z)
      { x: 0, z: halfWidth, w: this.tableLength, d: thickness },
      // Борт снизу (-Z)
      { x: 0, z: -halfWidth, w: this.tableLength, d: thickness },
      // Борт слева (-X)
      { x: -halfLength, z: 0, w: thickness, d: this.tableWidth },
      // Борт справа (+X)
      { x: halfLength, z: 0, w: thickness, d: this.tableWidth },
    ];

    walls.forEach((wall) => {
      const shape = new CANNON.Box(
        new CANNON.Vec3(wall.w / 2, cushionHeight / 2, wall.d / 2)
      );
      const body = new CANNON.Body({
        mass: 0,
        material: material,
        shape: shape,
        position: new CANNON.Vec3(wall.x, cushionY, wall.z),
        type: CANNON.Body.STATIC,
      });
      this.physicsWorld.addBody(body);
    });

    console.log(`    🧱 Fallback collision: 1 floor + ${walls.length} walls`);
  }

  /**
   * Добавляет визуализацию коллизионного меша (для отладки)
   * 
   * Создает полупрозрачный wireframe меш поверх физической геометрии
   * 
   * @private
   * @param {THREE.Mesh} mesh - Коллизионный меш
   * @returns {void}
   */
  private addCollisionDebugVisualization(mesh: THREE.Mesh): void {
    const debugMesh = mesh.clone();
    debugMesh.material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });

    // Применяем мировые трансформации
    debugMesh.applyMatrix4(mesh.matrixWorld);

    this.mesh.add(debugMesh);
    this.debugMeshes.push(debugMesh);

    console.log('    🟢 Collision debug visualization added');
  }

  // ИНИЦИАЛИЗАЦИЯ: ЛУЗЫ (ТРИГГЕРЫ)

  /**
   * Извлекает лузы из мешей TriggerPocket0..TriggerPocket5
   * 
   * Стандартная расстановка луз на американском столе:
   * ```
   *  [0]──────────[1]──────────[2]
   *   │                         │
   *   │    ИГРОВАЯ ЗОНА         │
   *   │                         │
   *  [3]──────────[4]──────────[5]
   * ```
   * 
   * @private
   * @param {THREE.Object3D} model - Исходная модель из Blender
   * @returns {void}
   */
  private setupPocketsFromTriggerMesh(model: THREE.Object3D): void {
    console.log('  🕳️ Setting up pockets...');

    const pocketMeshes: THREE.Mesh[] = [];

    // Поиск всех мешей с префиксом "TriggerPocket"
    model.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.name.toLowerCase().startsWith(BilliardTable.POCKET_TRIGGER_PREFIX)
      ) {
        pocketMeshes.push(child);
      }
    });

    // ─────────────────────────────────────────────────────────────────────
    // ПРОВЕРКА НАЛИЧИЯ ЛУЗ
    // ─────────────────────────────────────────────────────────────────────
    if (pocketMeshes.length === 0) {
      console.error('    ❌ No TriggerPocket meshes found in model!');
      console.warn('    💡 Make sure your Blender model contains meshes named "TriggerPocket0", "TriggerPocket1", etc.');
      return;
    }

    console.log(`    🎯 Found ${pocketMeshes.length} pocket trigger meshes`);

    // ─────────────────────────────────────────────────────────────────────
    // СОРТИРОВКА ПО НОМЕРУ (для предсказуемого порядка)
    // ─────────────────────────────────────────────────────────────────────
    pocketMeshes.sort((a, b) => {
      const numA = parseInt(a.name.match(/\d+$/)?.[0] || '0');
      const numB = parseInt(b.name.match(/\d+$/)?.[0] || '0');
      return numA - numB;
    });

    // ─────────────────────────────────────────────────────────────────────
    // ИЗВЛЕЧЕНИЕ ДАННЫХ О КАЖДОЙ ЛУЗЕ
    // ─────────────────────────────────────────────────────────────────────
    this.extractPocketsFromMultipleMeshes(pocketMeshes);
  }

  /**
   * Извлекает данные о лузах из отдельных мешей
   * 
   * Для каждого меша вычисляет:
   * - Мировую позицию центра
   * - Bounding box в мировых координатах
   * - Эффективный радиус (максимальный размер по XZ)
   * 
   * @private
   * @param {THREE.Mesh[]} meshes - Массив мешей триггеров луз
   * @returns {void}
   */
  private extractPocketsFromMultipleMeshes(meshes: THREE.Mesh[]): void {
    meshes.forEach((mesh, index) => {
      // Обновляем мировую матрицу
      mesh.updateMatrixWorld(true);

      // Клонируем геометрию и применяем мировые трансформации
      const clonedGeometry = mesh.geometry.clone();
      clonedGeometry.applyMatrix4(mesh.matrixWorld);

      // Создаем триггерный меш
      const triggerMesh = new THREE.Mesh(
        clonedGeometry,
        mesh.material instanceof THREE.Material
          ? mesh.material.clone()
          : mesh.material
      );

      // Позиция уже учтена в geometry после applyMatrix4
      triggerMesh.position.set(0, 0, 0);
      triggerMesh.name = mesh.name;

      // ВЫЧИСЛЕНИЕ BOUNDING BOX
      const box = new THREE.Box3().setFromObject(triggerMesh, true);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      // Радиус - максимальный размер по горизонтали (X или Z)
      const radius = Math.max(size.x, size.z) / 2;

      // СОХРАНЕНИЕ ДАННЫХ О ЛУЗЕ
      this.pockets.push({
        mesh: triggerMesh,
        boundingBox: box.clone(),
        position: center.clone(),
        radius: radius,
      });

      console.log(
        `    🕳️ Pocket ${index} "${mesh.name}":\n` +
        `       Position: (${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)})\n` +
        `       Size: ${size.x.toFixed(3)}×${size.y.toFixed(3)}×${size.z.toFixed(3)}\n` +
        `       Radius: ${radius.toFixed(3)}m`
      );

      // ВИЗУАЛИЗАЦИЯ В DEBUG РЕЖИМЕ
      if (this.debugMode) {
        this.addPocketDebugVisualization(triggerMesh, mesh.name);
      }
    });

    console.log(`  ✅ ${this.pockets.length} pockets configured successfully`);
  }

  /**
   * Добавляет визуализацию лузы (для отладки)
   * 
   * Создает:
   * - Полупрозрачный красный меш (зона триггера)
   * - Wireframe контур
   * - Текстовую метку с номером лузы
   * 
   * @private
   * @param {THREE.Mesh} triggerMesh - Триггерный меш лузы
   * @param {string} name - Имя меша из Blender
   * @returns {void}
   */
  private addPocketDebugVisualization(
    triggerMesh: THREE.Mesh,
    name: string
  ): void {
    const box = new THREE.Box3().setFromObject(triggerMesh);
    const center = box.getCenter(new THREE.Vector3());

    // ─────────────────────────────────────────────────────────────────────
    // ПОЛУПРОЗРАЧНАЯ ГЕОМЕТРИЯ ТРИГГЕРА
    // ─────────────────────────────────────────────────────────────────────
    const debugMesh = new THREE.Mesh(
      triggerMesh.geometry,
      new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      })
    );
    debugMesh.position.copy(triggerMesh.position);
    this.mesh.add(debugMesh);
    this.debugMeshes.push(debugMesh);

    // ─────────────────────────────────────────────────────────────────────
    // WIREFRAME КОНТУР
    // ─────────────────────────────────────────────────────────────────────
    const edges = new THREE.EdgesGeometry(triggerMesh.geometry);
    const wireframe = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: 0xff0000,
        linewidth: 2,
      })
    );
    wireframe.position.copy(triggerMesh.position);
    this.mesh.add(wireframe);
    this.debugMeshes.push(wireframe);

    // ─────────────────────────────────────────────────────────────────────
    // ТЕКСТОВАЯ МЕТКА
    // ─────────────────────────────────────────────────────────────────────
    const pocketNum = name.match(/\d+$/)?.[0] || '?';
    const sprite = this.createTextSprite(`P${pocketNum}`, center);
    this.mesh.add(sprite);
    this.debugMeshes.push(sprite);

    console.log(`    🔴 Debug visualization created for ${name}`);
  }

  /**
   * Создает текстовый спрайт для отладки
   * 
   * @private
   * @param {string} text - Текст для отображения
   * @param {THREE.Vector3} position - Позиция спрайта
   * @returns {THREE.Sprite} Созданный спрайт
   */
  private createTextSprite(text: string, position: THREE.Vector3): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d')!;

    // Фон
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, size, size);

    // Текст
    ctx.fillStyle = 'white';
    ctx.font = 'bold 120px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);

    sprite.position.set(position.x, position.y + 0.15, position.z);
    sprite.scale.set(0.2, 0.2, 1);

    return sprite;
  }

  // ПУБЛИЧНЫЕ МЕТОДЫ: ПРОВЕРКА ЛУЗ

  /**
   * Проверяет, находится ли точка (шар) внутри какой-либо лузы
   * 
   * Использует bounding box для быстрой проверки столкновений.
   * 
   * @public
   * @param {THREE.Vector3} position - Позиция шара для проверки
   * @returns {Pocket | null} Объект лузы, если шар в лузе, иначе null
   * 
   * @example
   * ```typescript
   * const ballPos = ball.getPosition();
   * const pocket = table.isInPocket(ballPos);
   * if (pocket) {
   *   console.log('Ball fell into pocket at', pocket.position);
   * }
   * ```
   */
  public isInPocket(position: THREE.Vector3): Pocket | null {
    for (const pocket of this.pockets) {
      if (pocket.boundingBox.containsPoint(position)) {
        return pocket;
      }
    }
    return null;
  }

  // ПУБЛИЧНЫЕ МЕТОДЫ: УТИЛИТЫ

  /**
   * Включает или выключает визуализацию отладки
   * 
   * @public
   * @param {boolean} enabled - true для включения, false для выключения
   * @returns {void}
   */
  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    this.debugMeshes.forEach((mesh) => {
      mesh.visible = enabled;
    });
    console.log(`🐛 Debug mode: ${enabled ? 'ENABLED ✅' : 'DISABLED 🚫'}`);
  }

  /**
   * Возвращает корневой объект стола
   * 
   * @public
   * @returns {THREE.Group} Группа, содержащая всю визуальную геометрию стола
   */
  public getMesh(): THREE.Group {
    return this.mesh;
  }

  /**
   * Возвращает массив всех луз
   * 
   * @public
   * @returns {Pocket[]} Массив объектов луз
   */
  public getPockets(): Pocket[] {
    return this.pockets;
  }

  /**
   * Возвращает границы игровой зоны стола
   * 
   * Используется для:
   * - Проверки валидности размещения битка
   * - Определения допустимой зоны движения камеры
   * - Детектирования выхода шаров за пределы стола
   * 
   * @public
   * @returns {{ minX: number; maxX: number; minZ: number; maxZ: number }}
   *          Границы в мировых координатах
   * 
   * @example
   * ```typescript
   * const bounds = table.getPlayingAreaBounds();
   * if (ballX < bounds.minX || ballX > bounds.maxX) {
   *   console.log('Ball is out of bounds!');
   * }
   * ```
   */
  public getPlayingAreaBounds(): {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  } {
    return {
      minX: -this.tableLength / 2,
      maxX: this.tableLength / 2,
      minZ: -this.tableWidth / 2,
      maxZ: this.tableWidth / 2,
    };
  }

  // ПУБЛИЧНЫЕ МЕТОДЫ: ОЧИСТКА РЕСУРСОВ

  /**
   * Освобождает все ресурсы, занятые столом
   * 
   * Вызывать при уничтожении сцены или переходе на другой уровень.
   * Освобождает:
   * - Геометрии мешей
   * - Материалы (включая текстуры)
   * - Canvas-элементы (текстовые спрайты)
   * 
   * @public
   * @returns {void}
   */
  public dispose(): void {
    console.log('🗑️ Disposing BilliardTable resources...');

    // Очистка отладочных мешей
    this.debugMeshes.forEach((mesh) => {
      if (mesh instanceof THREE.Mesh) {
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
        }
      } else if (mesh instanceof THREE.Sprite) {
        if (mesh.material.map) {
          mesh.material.map.dispose();
        }
        mesh.material.dispose();
      } else if (mesh instanceof THREE.LineSegments) {
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
        }
      }
    });

    this.debugMeshes = [];
    console.log('✅ BilliardTable disposed');
  }
}