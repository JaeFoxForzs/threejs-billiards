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
  private lightsGroup: THREE.Group;

  // Массивы для хранения отладочных мешей
  private debugCollisionMeshes: THREE.Mesh[] = [];
  private debugTriggerMeshes: THREE.Mesh[] = [];

  private readonly NAME_COLLISION = 'collision';
  private readonly NAME_TRIGGER = 'triggerpocket';
  private readonly NAME_BED = 'bed';

  constructor(model: THREE.Object3D, physicsWorld: PhysicsWorld) {
    this.physicsWorld = physicsWorld;
    this.mesh = new THREE.Group();
    this.lightsGroup = new THREE.Group();
    this.mesh.add(this.lightsGroup);

    console.log('🎱 Parsing Billiard Table model...');

    this.extractLightsFromModel(model);
    this.setupVisuals(model); // Здесь теперь логика сохранения отладочных мешей
    
    const collisionFound = this.setupPhysicsFromModel(model);
    if (!collisionFound) {
      console.warn(`⚠️ Physics mesh "${this.NAME_COLLISION}" not found! Using fallback.`);
    }

    this.setupPocketsFromModel(model);
    this.calculateTableDimensions(model);
  }

  // ... extractLightsFromModel, createSpotLight, createPointLight остаются без изменений ...
  private extractLightsFromModel(model: THREE.Object3D): void {
      // (код тот же, что в предыдущем ответе)
      const lightsToRemove: THREE.Object3D[] = [];
      model.traverse((child) => {
          if (child.name.includes('Light_')) {
              const position = child.position.clone();
              const quaternion = child.quaternion.clone();
              const userData = child.userData || {};
              if (child.name.includes('Spot')) {
                  const intensity = userData.intensity ?? 15.0;
                  const distance = userData.distance ?? 0;
                  const angleDeg = userData.angle ?? 60;
                  const penumbra = userData.penumbra ?? 0.5;
                  this.createSpotLight(child.name, position, quaternion, {
                      intensity, distance, angle: THREE.MathUtils.degToRad(angleDeg), penumbra
                  });
              } else if (child.name.includes('Point')) {
                  const intensity = userData.intensity ?? 5.0;
                  const distance = userData.distance ?? 10.0;
                  const decay = userData.decay ?? 2.0;
                  this.createPointLight(child.name, position, { intensity, distance, decay });
              }
              lightsToRemove.push(child);
          }
      });
      lightsToRemove.forEach(obj => obj.visible = false);
  }
  
  private createSpotLight(name: string, pos: THREE.Vector3, rot: THREE.Quaternion, params: any) {
     // (код тот же, что в предыдущем ответе)
      const spot = new THREE.SpotLight(0xffeebb, params.intensity);
      spot.position.copy(pos);
      spot.name = name;
      spot.distance = params.distance;
      spot.angle = params.angle;
      spot.penumbra = params.penumbra;
      spot.castShadow = true;
      spot.shadow.bias = -0.0001;
      spot.shadow.mapSize.set(2048, 2048);
      const direction = new THREE.Vector3(0, 1, 0).applyQuaternion(rot);
      const target = new THREE.Object3D();
      target.position.copy(pos).add(direction);
      spot.target = target;
      this.lightsGroup.add(spot);
      this.lightsGroup.add(target);
  }

  private createPointLight(name: string, pos: THREE.Vector3, params: any) {
      // (код тот же, что в предыдущем ответе)
      const point = new THREE.PointLight(0xffffff, params.intensity, params.distance, params.decay);
      point.position.copy(pos);
      point.name = name;
      point.castShadow = false; 
      this.lightsGroup.add(point);
  }

  /**
   * Измененный метод: вместо скрытия мешей, мы сохраняем их для отладки
   */
  private setupVisuals(model: THREE.Object3D): void {
    const tableClone = model.clone();

    tableClone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const name = child.name.toLowerCase();

        // 1. Обработка КОЛЛИЗИИ (стенки)
        if (name.includes(this.NAME_COLLISION)) {
          // Делаем красный каркас
          child.material = new THREE.MeshBasicMaterial({ 
              color: 0xff0000, 
              wireframe: true,
              transparent: true,
              opacity: 0.5
          });
          child.visible = false; // Скрыто по умолчанию
          this.debugCollisionMeshes.push(child);
          // Не делаем return, добавляем в сцену, но скрытым
        } 
        // 2. Обработка ТРИГГЕРОВ (лузы)
        else if (name.includes(this.NAME_TRIGGER)) {
          // Делаем зеленый полупрозрачный бокс
          child.material = new THREE.MeshBasicMaterial({ 
              color: 0x00ff00, 
              wireframe: false,
              transparent: true, 
              opacity: 0.4,
              side: THREE.DoubleSide
          });
          child.visible = false; // Скрыто по умолчанию
          this.debugTriggerMeshes.push(child);
        }
        // 3. Скрываем пустышки света
        else if (name.includes('light_')) {
          child.visible = false;
          return; 
        }
        // 4. Обычные меши стола
        else {
           child.castShadow = true;
           child.receiveShadow = true;
        }
      }
    });

    this.mesh.add(tableClone);
  }

  // ... setupPhysicsFromModel (без изменений) ...
  private setupPhysicsFromModel(model: THREE.Object3D): boolean {
      let foundMesh: THREE.Mesh | null = null;
      model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name.toLowerCase().includes(this.NAME_COLLISION)) foundMesh = child;
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
          for (let i = 0; i < indexAttr.count; i++) indices.push(indexAttr.getX(i));
      } else {
          for (let i = 0; i < posAttr.count; i++) indices.push(i);
      }
      const trimeshShape = new CANNON.Trimesh(vertices, indices);
      const body = new CANNON.Body({ mass: 0, material: this.physicsWorld.getTableMaterial(), shape: trimeshShape });
      this.physicsWorld.addBody(body);
      return true;
  }

  // ... setupPocketsFromModel (без изменений) ...
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

  // ... calculateTableDimensions (без изменений) ...
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

  // --- МЕТОДЫ ДЛЯ UI ---
  public toggleDebugCollision(visible: boolean): void {
      this.debugCollisionMeshes.forEach(m => m.visible = visible);
  }

  public toggleDebugTriggers(visible: boolean): void {
      this.debugTriggerMeshes.forEach(m => m.visible = visible);
  }
}