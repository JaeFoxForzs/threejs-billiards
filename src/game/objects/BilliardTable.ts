import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsWorld } from '../PhysicsWorld';

export interface Pocket {
  position: THREE.Vector3;
  radius: number;
  box: THREE.Box3;
}

export class BilliardTable {
  public tableLength: number = 3.6;
  public tableWidth: number = 1.8;
  public tableHeight: number = 0.82;

  private mesh: THREE.Group;
  private physicsWorld: PhysicsWorld;
  private pockets: Pocket[] = [];

  // Группа для света
  private lightsGroup: THREE.Group;

  private readonly NAME_COLLISION = 'collision';
  private readonly NAME_TRIGGER = 'triggerpocket';
  private readonly NAME_BED = 'bed';

  constructor(model: THREE.Object3D, physicsWorld: PhysicsWorld) {
    this.physicsWorld = physicsWorld;
    this.mesh = new THREE.Group();
    this.lightsGroup = new THREE.Group();
    this.mesh.add(this.lightsGroup);

    console.log('🎱 Parsing Billiard Table model...');

    // 1. Парсим свет (Spot и Point)
    this.extractLightsFromModel(model);

    // 2. Настраиваем визуал
    this.setupVisuals(model);

    // 3. Физика стола
    const collisionFound = this.setupPhysicsFromModel(model);
    if (!collisionFound) {
      console.warn(`⚠️ Physics mesh "${this.NAME_COLLISION}" not found! Using fallback.`);
    }

    // 4. Лузы
    this.setupPocketsFromModel(model);

    // 5. Размеры
    this.calculateTableDimensions(model);
  }

  /**
   * Ищет объекты в модели с именами Light_...
   * Поддерживает Light_Spot и Light_Point.
   * Читает параметры из Custom Properties (userData) объекта в Blender.
   */
  private extractLightsFromModel(model: THREE.Object3D): void {
    const lightsToRemove: THREE.Object3D[] = [];

    model.traverse((child) => {
      if (child.name.includes('Light_')) {
        const position = child.position.clone();
        const quaternion = child.quaternion.clone();
        const userData = child.userData || {};

        // --- SPOT LIGHT ---
        if (child.name.includes('Spot')) {
          // Настройки по умолчанию или из Blender
          const intensity = userData.intensity ?? 15.0; // Яркость
          const distance = userData.distance ?? 0;      // 0 = бесконечно
          const angleDeg = userData.angle ?? 60;        // Угол в градусах
          const penumbra = userData.penumbra ?? 0.5;    // Мягкость краев

          this.createSpotLight(child.name, position, quaternion, {
            intensity, distance, angle: THREE.MathUtils.degToRad(angleDeg), penumbra
          });
        }
        // --- POINT LIGHT ---
        else if (child.name.includes('Point')) {
          // Настройки по умолчанию или из Blender
          const intensity = userData.intensity ?? 5.0; 
          const distance = userData.distance ?? 10.0;  // Радиус действия
          const decay = userData.decay ?? 2.0;         // Физическое затухание

          this.createPointLight(child.name, position, {
            intensity, distance, decay
          });
        }

        lightsToRemove.push(child);
      }
    });

    lightsToRemove.forEach(obj => obj.visible = false);
  }

  private createSpotLight(
    name: string, 
    pos: THREE.Vector3, 
    rot: THREE.Quaternion, 
    params: { intensity: number, distance: number, angle: number, penumbra: number }
  ): void {
    const spot = new THREE.SpotLight(0xffeebb, params.intensity);
    spot.position.copy(pos);
    spot.name = name;
    spot.distance = params.distance;
    spot.angle = params.angle;
    spot.penumbra = params.penumbra;
    
    // Настройки теней
    spot.castShadow = true;
    spot.shadow.bias = -0.0001;
    spot.shadow.mapSize.width = 2048;
    spot.shadow.mapSize.height = 2048;

    // Направление (Локальная ось Y вверх в Blender -> направление света)
    // Если в Blender свет направлен по оси Z локально, используйте (0,0,1) или (0,0,-1)
    const direction = new THREE.Vector3(0, 1, 0); 
    direction.applyQuaternion(rot);

    const target = new THREE.Object3D();
    target.position.copy(pos).add(direction);
    spot.target = target;

    this.lightsGroup.add(spot);
    this.lightsGroup.add(target);

    console.log(`   💡 Created SpotLight: "${name}" (Int: ${params.intensity}, Angle: ${(params.angle * 57.3).toFixed(0)}°)`);
  }

  private createPointLight(
    name: string, 
    pos: THREE.Vector3, 
    params: { intensity: number, distance: number, decay: number }
  ): void {
    const point = new THREE.PointLight(0xffffff, params.intensity, params.distance, params.decay);
    point.position.copy(pos);
    point.name = name;
    
    // PointLight обычно делает мягкие тени во все стороны, это дорого.
    // Часто для бильярда PointLight используют для заполнения ("Fill"), без теней.
    // Если нужны тени от лампы над столом - раскомментируйте castShadow.
    point.castShadow = false; 
    // point.shadow.bias = -0.0001;

    this.lightsGroup.add(point);

    console.log(`   💡 Created PointLight: "${name}" (Int: ${params.intensity}, Dist: ${params.distance}m)`);
  }

  private setupVisuals(model: THREE.Object3D): void {
    const tableClone = model.clone();

    tableClone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const name = child.name.toLowerCase();

        // Скрываем служебные меши
        if (name.includes(this.NAME_COLLISION) ||
          name.includes(this.NAME_TRIGGER) ||
          name.includes('light_')) {
          child.visible = false;
          return;
        }

        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.mesh.add(tableClone);
  }

  private setupPhysicsFromModel(model: THREE.Object3D): boolean {
    let foundMesh: THREE.Mesh | null = null;
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name.toLowerCase().includes(this.NAME_COLLISION)) {
        foundMesh = child;
      }
    });
    if (!foundMesh) return false;

    const collisionMesh = foundMesh as THREE.Mesh;
    const geometry = collisionMesh.geometry;
    const vertices: number[] = [];
    const indices: number[] = [];
    const posAttr = geometry.attributes.position;
    const indexAttr = geometry.index;

    collisionMesh.updateMatrixWorld(true);
    const matrix = collisionMesh.matrixWorld;
    const tempVec = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      tempVec.fromBufferAttribute(posAttr, i);
      tempVec.applyMatrix4(matrix);
      vertices.push(tempVec.x, tempVec.y, tempVec.z);
    }

    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i++) {
        indices.push(indexAttr.getX(i));
      }
    } else {
      for (let i = 0; i < posAttr.count; i++) {
        indices.push(i);
      }
    }

    const trimeshShape = new CANNON.Trimesh(vertices, indices);
    const body = new CANNON.Body({
      mass: 0,
      material: this.physicsWorld.getTableMaterial(),
      shape: trimeshShape
    });
    this.physicsWorld.addBody(body);
    return true;
  }

  private setupPocketsFromModel(model: THREE.Object3D): void {
    this.pockets = [];
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name.toLowerCase().includes(this.NAME_TRIGGER)) {
        const box = new THREE.Box3().setFromObject(child);
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);
        const radius = Math.max(size.x, size.z) / 2;
        this.pockets.push({ position: center, radius: radius, box: box });
      }
    });
  }

  private calculateTableDimensions(model: THREE.Object3D): void {
    let foundBed: THREE.Mesh | null = null;
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && (child.name.toLowerCase().includes(this.NAME_BED) || child.name.toLowerCase().includes('cloth'))) {
        foundBed = child;
      }
    });

    if (foundBed) {
      const bedMesh = foundBed as THREE.Mesh;
      const box = new THREE.Box3().setFromObject(bedMesh);
      const size = new THREE.Vector3();
      box.getSize(size);
      this.tableLength = size.x;
      this.tableWidth = size.z;
      this.tableHeight = box.max.y;
    } else {
      const box = new THREE.Box3().setFromObject(model);
      this.tableHeight = box.max.y * 0.75;
    }
  }

  public checkPocketEntry(ballPos: THREE.Vector3): Pocket | null {
    for (const pocket of this.pockets) {
      const dx = ballPos.x - pocket.position.x;
      const dz = ballPos.z - pocket.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < pocket.radius * pocket.radius) return pocket;
    }
    return null;
  }

  public getMesh(): THREE.Group { return this.mesh; }

  public getPlayingAreaBounds() {
    const margin = 0.1;
    return {
      minX: -this.tableLength / 2 + margin,
      maxX: this.tableLength / 2 - margin,
      minZ: -this.tableWidth / 2 + margin,
      maxZ: this.tableWidth / 2 - margin
    };
  }
}