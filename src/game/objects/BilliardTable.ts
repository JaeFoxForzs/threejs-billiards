import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsWorld } from '../PhysicsWorld';

export interface Pocket {
  position: THREE.Vector3;
  radius: number;
  box: THREE.Box3;
}

export class BilliardTable {
  public tableHeight: number = 0.82;

  // Реальные размеры игрового поля по осям (X - ширина/длина, Z - глубина/длина)
  // Не пытаемся угадать кто из них длина, просто храним факты
  public playFieldX: number = 0;
  public playFieldZ: number = 0;
  
  // Ось, вдоль которой стол длиннее ('x' или 'z')
  public majorAxis: 'x' | 'z' = 'z';

  private mesh: THREE.Group;
  private physicsWorld: PhysicsWorld;
  private pockets: Pocket[] = [];
  private lightsGroup: THREE.Group;

  private debugCollisionMeshes: THREE.Mesh[] = [];
  private debugTriggerMeshes: THREE.Mesh[] = [];
  private debugHomeZoneMesh: THREE.Mesh | null = null;

  private readonly NAME_COLLISION = 'collision';
  private readonly NAME_TRIGGER = 'triggerpocket';
  private readonly NAME_BED = 'bed';

  constructor(model: THREE.Object3D, physicsWorld: PhysicsWorld) {
    this.physicsWorld = physicsWorld;
    this.mesh = new THREE.Group();
    this.lightsGroup = new THREE.Group();
    this.mesh.add(this.lightsGroup);

    this.extractLightsFromModel(model);
    this.setupVisuals(model); 
    
    const collisionFound = this.setupPhysicsFromModel(model);
    if (!collisionFound) {
      console.warn(`⚠️ Physics mesh "${this.NAME_COLLISION}" not found! Using fallback.`);
    }

    this.setupPocketsFromModel(model);
    this.calculateTableDimensions(model);
    
    this.drawHeadString();
    this.createHomeZoneDebug();
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
          
          // Берем размеры как есть. Если стол повернут в блендере, X может быть длинным
          this.playFieldX = size.x;
          this.playFieldZ = size.z;
          this.tableHeight = box.max.y;

      } else {
          // Fallback
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);
          
          // Эвристика 85%
          this.playFieldX = size.x * 0.85;
          this.playFieldZ = size.z * 0.85;
          this.tableHeight = box.max.y * 0.75;
      }

      // Определяем главную ось (вдоль которой выстраиваем пирамиду)
      this.majorAxis = this.playFieldX > this.playFieldZ ? 'x' : 'z';

      console.log(`📏 Playing Field: X=${this.playFieldX.toFixed(2)}, Z=${this.playFieldZ.toFixed(2)} | Major Axis: ${this.majorAxis.toUpperCase()}`);
  }

  private drawHeadString(): void {
      // Линия дома. Если ось X главная, линия вертикальная (вдоль Z) на координате X = -Length/4
      // Если ось Z главная, линия горизонтальная (вдоль X) на координате Z = -Length/4
      
      let geometry: THREE.PlaneGeometry;
      let x = 0, z = 0;
      let rotY = 0;

      if (this.majorAxis === 'x') {
          // Длинный X. Линия дома слева (отрицательный X)
          const headX = -this.playFieldX / 4;
          geometry = new THREE.PlaneGeometry(0.005, this.playFieldZ); // Тонкая полоска вдоль Z
          x = headX;
          z = 0;
          rotY = 0; // Плоскость лежит в XY, нам надо повернуть в XZ? Нет PlaneGeometry создает в XY.
          // Нам надо повернуть её чтобы она лежала на столе.
      } else {
          // Длинный Z (классика). Линия дома сверху/снизу (отрицательный Z)
          const headZ = -this.playFieldZ / 4;
          geometry = new THREE.PlaneGeometry(this.playFieldX, 0.005); // Тонкая полоска вдоль X
          x = 0;
          z = headZ;
          rotY = 0;
      }

      const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
      const lineMesh = new THREE.Mesh(geometry, material);
      
      // PlaneGeometry создается вертикально в XY. Кладем на стол (поворот по X -90)
      lineMesh.rotation.x = -Math.PI / 2;
      // Если нужна доп ротация (для вертикальной линии при Major X)
      if (this.majorAxis === 'x') {
          // Если мы сделали геометрию (0.005, Z), и положили плашмя (-PI/2 по X),
          // то она станет (0.005 по X, Z по Z). Все верно, доп. поворот не нужен.
      }

      lineMesh.position.set(x, this.tableHeight + 0.001, z);
      this.mesh.add(lineMesh);
  }

  private createHomeZoneDebug(): void {
      // Создаем бокс зоны дома
      let width = 0, depth = 0;
      let posX = 0, posZ = 0;

      if (this.majorAxis === 'x') {
          // Зона слева
          width = this.playFieldX / 4;
          depth = this.playFieldZ;
          // Центр зоны: -L/2 + L/8 = -3/8 L
          posX = -this.playFieldX * 0.375;
          posZ = 0;
      } else {
          // Зона сверху (или снизу, в минус Z)
          width = this.playFieldX;
          depth = this.playFieldZ / 4;
          posX = 0;
          posZ = -this.playFieldZ * 0.375;
      }

      const geometry = new THREE.BoxGeometry(width, 0.1, depth);
      const material = new THREE.MeshBasicMaterial({ 
          color: 0xff0000, 
          transparent: true, 
          opacity: 0.2, 
          wireframe: false,
          depthTest: false
      });

      this.debugHomeZoneMesh = new THREE.Mesh(geometry, material);
      this.debugHomeZoneMesh.position.set(posX, this.tableHeight + 0.02, posZ);
      this.debugHomeZoneMesh.visible = false; 
      
      this.mesh.add(this.debugHomeZoneMesh);
  }

  // ... (extractLights, setupVisuals, setupPhysics - без изменений) ...
  private extractLightsFromModel(model: THREE.Object3D): void {
      const lightsToRemove: THREE.Object3D[] = [];
      model.traverse((child) => {
          if (child.name.includes('Light_')) {
              const position = child.position.clone();
              const quaternion = child.quaternion.clone();
              const userData = child.userData || {};
              if (child.name.includes('Spot')) {
                  this.createSpotLight(child.name, position, quaternion, {
                      intensity: userData.intensity ?? 15.0,
                      distance: userData.distance ?? 0,
                      angle: THREE.MathUtils.degToRad(userData.angle ?? 60),
                      penumbra: userData.penumbra ?? 0.5
                  });
              } else if (child.name.includes('Point')) {
                  this.createPointLight(child.name, position, { 
                      intensity: userData.intensity ?? 5.0, 
                      distance: userData.distance ?? 10.0, 
                      decay: userData.decay ?? 2.0 
                  });
              }
              lightsToRemove.push(child);
          }
      });
      lightsToRemove.forEach(obj => obj.visible = false);
  }
  private createSpotLight(name: string, pos: THREE.Vector3, rot: THREE.Quaternion, params: any) {
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
      const point = new THREE.PointLight(0xffffff, params.intensity, params.distance, params.decay);
      point.position.copy(pos);
      this.lightsGroup.add(point);
  }
  private setupVisuals(model: THREE.Object3D): void {
    const tableClone = model.clone();
    tableClone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const name = child.name.toLowerCase();
        if (name.includes(this.NAME_COLLISION)) {
          child.material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.5 });
          child.visible = false;
          this.debugCollisionMeshes.push(child);
        } else if (name.includes(this.NAME_TRIGGER)) {
          child.material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: false, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
          child.visible = false;
          this.debugTriggerMeshes.push(child);
        } else if (name.includes('light_')) {
          child.visible = false;
          return; 
        } else {
           child.castShadow = true;
           child.receiveShadow = true;
        }
      }
    });
    this.mesh.add(tableClone);
  }
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

  // Границы теперь возвращаем точные по X и Z
  public getPlayingAreaBounds() {
    const margin = 0.05; 
    return {
      minX: -this.playFieldX / 2 + margin,
      maxX: this.playFieldX / 2 - margin,
      minZ: -this.playFieldZ / 2 + margin,
      maxZ: this.playFieldZ / 2 - margin
    };
  }

  public toggleDebugCollision(visible: boolean): void {
      this.debugCollisionMeshes.forEach(m => m.visible = visible);
  }

  public toggleDebugTriggers(visible: boolean): void {
      this.debugTriggerMeshes.forEach(m => m.visible = visible);
      if (this.debugHomeZoneMesh) this.debugHomeZoneMesh.visible = visible;
  }
}