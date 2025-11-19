import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsWorld } from '../PhysicsWorld';

export enum BallType {
  CUE = 0,
  NUMBERED = 1,
}

export class Ball {
  public static readonly RADIUS = 0.034; 
  // Масса стандартная для русского бильярда (~280г)
  private static readonly MASS = 0.280;  

  private mesh: THREE.Mesh;
  private body: CANNON.Body;
  private number: number;
  private type: BallType;
  private isPocketed: boolean = false;
  private isFallingIntoPocket: boolean = false;

  constructor(
    number: number,
    position: THREE.Vector3,
    physicsWorld: PhysicsWorld,
    _lockedPositionY: number 
  ) {
    this.number = number;
    this.type = number === 0 ? BallType.CUE : BallType.NUMBERED;

    // Визуал
    const geometry = new THREE.SphereGeometry(Ball.RADIUS, 32, 32);
    const material = this.createMaterial();
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.position.copy(position);

    // Физика
    const shape = new CANNON.Sphere(Ball.RADIUS);
    this.body = new CANNON.Body({
      mass: Ball.MASS,
      material: physicsWorld.getBallMaterial(),
      shape: shape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      // Damping (Сопротивление воздуха/трение качения)
      // Снижаем, чтобы шары катились дольше ("легче")
      linearDamping: 0.15, // Было 0.3
      angularDamping: 0.20, // Было 0.4
      
      // Сон
      sleepSpeedLimit: 0.05, 
      sleepTimeLimit: 0.5
    });

    physicsWorld.addBody(this.body);
  }

  private createMaterial(): THREE.Material {
    let color = 0xfffff0; 
    if (this.type === BallType.CUE) {
      color = 0xB22222; // Темно-красный биток
    } else {
        // Можно сделать желтоватый оттенок для слоновой кости
        color = 0xffffee;
    }

    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.1, // Более гладкий шар
      metalness: 0.1,
    });
  }

  public update(): void {
    if (this.isPocketed) return;

    this.mesh.position.copy(this.body.position as any);
    this.mesh.quaternion.copy(this.body.quaternion as any);

    // Защита от вылета за пределы мира (багфикс)
    if (this.body.position.y < -0.5 && !this.isFallingIntoPocket) {
        // Если шар провалился сквозь пол не в лузе
        this.body.position.y = Ball.RADIUS + 0.1;
        this.body.velocity.setZero();
    }
  }

  public applyImpulse(direction: THREE.Vector3, power: number): void {
    // Увеличиваем множитель силы, так как friction снижен, но mass остался.
    // Для "разрыва" пирамиды нужно много энергии.
    const maxForce = 4.0; // Было 5.0, теперь удар будет мощным
    const force = power * maxForce;
    
    // Удар должен идти в центр шара или чуть выше/ниже (пока в центр)
    const impulse = direction.clone().normalize().multiplyScalar(force);
    
    this.body.wakeUp();
    this.body.applyImpulse(
      new CANNON.Vec3(impulse.x, 0, impulse.z),
      new CANNON.Vec3(0, 0, 0) // Точка приложения импульса (относительно центра масс)
    );
  }

  /**
   * Логика падения в лузу с защитой от вылета обратно
   */
  public fallIntoPocket(pocketPosition: THREE.Vector3): void {
    if (this.isFallingIntoPocket || this.isPocketed) return;

    this.isFallingIntoPocket = true;

    // 1. Убираем damping, чтобы падал как камень
    this.body.linearDamping = 0;
    this.body.angularDamping = 0;

    // 2. Вычисляем вектор к центру лузы
    const toCenter = new CANNON.Vec3(
        pocketPosition.x - this.body.position.x,
        -0.2, // Тянем сильно вниз
        pocketPosition.z - this.body.position.z
    );
    
    // Нормализуем и умножаем на силу "магнита"
    toCenter.normalize();
    toCenter.scale(1.0, toCenter); // Сила притяжения к центру лузы

    // 3. Применяем силу
    // Используем velocity напрямую для мгновенного эффекта, чтобы не ждать step
    // Гасим текущую горизонтальную скорость, направляем в лузу
    this.body.velocity.x *= 0.14; 
    this.body.velocity.z *= 0.14;
    this.body.velocity.vadd(toCenter, this.body.velocity);

    // 4. (Опционально) Можно отключить коллизию шара с другими шарами, 
    // чтобы "влетающий" шар не выбил этот обратно.
    // В Cannon это collisionFilterGroup/Mask, но проще пока просто сильно тянуть вниз.
    this.body.collisionResponse = false;
  }

  public setPocketed(pocketed: boolean): void {
    this.isPocketed = pocketed;
    this.isFallingIntoPocket = false;

    if (pocketed) {
      this.mesh.visible = false;
      this.body.sleep();
      // Убираем далеко вниз
      this.body.position.set(0, -10 - this.number, 0); 
      this.body.velocity.setZero();
      this.body.angularVelocity.setZero();
    } else {
      this.mesh.visible = true;
      this.body.wakeUp();
      // Возвращаем физические свойства
      this.body.linearDamping = 0.15;
      this.body.angularDamping = 0.20;
    }
  }

  public resetPosition(position: THREE.Vector3): void {
    this.body.position.set(position.x, position.y, position.z);
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.body.quaternion.set(0,0,0,1); // Сброс вращения
    this.body.wakeUp();
    this.setPocketed(false);
  }

  public isMoving(): boolean {
    if (this.isPocketed) return false;
    // Пороги остановки
    const v = this.body.velocity.lengthSquared();
    const w = this.body.angularVelocity.lengthSquared();
    return v > 0.0005 || w > 0.005;
  }

  public getPosition(): THREE.Vector3 { return new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z); }
  public getMesh(): THREE.Mesh { return this.mesh; }
  public getBody(): CANNON.Body { return this.body; }
  public getNumber(): number { return this.number; }
  public getType(): BallType { return this.type; }
  public isPocketedState(): boolean { return this.isPocketed; }
  public isFalling(): boolean { return this.isFallingIntoPocket; }
}