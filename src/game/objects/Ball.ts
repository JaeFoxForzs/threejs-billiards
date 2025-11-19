import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsWorld } from '../PhysicsWorld';

export enum BallType {
  CUE = 0,
  NUMBERED = 1,
}

export class Ball {
  public static readonly RADIUS = 0.034;
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
      linearDamping: 0.2,  // Чуть повысил, чтобы естественнее останавливались
      angularDamping: 0.2,
      sleepSpeedLimit: 0.1, // Порог засыпания
      sleepTimeLimit: 0.5
    });

    physicsWorld.addBody(this.body);
  }

  private createMaterial(): THREE.Material {
    const color = this.type === BallType.CUE ? 0xB22222 : 0xffffee;
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.15,
      metalness: 0.05,
    });
  }

  public update(): void {
    if (this.isPocketed) return;

    // Синхронизация графики и физики
    this.mesh.position.copy(this.body.position as any);
    this.mesh.quaternion.copy(this.body.quaternion as any);

    // Агрессивная остановка, если скорость очень мала
    if (this.body.velocity.lengthSquared() < 0.001 && this.body.angularVelocity.lengthSquared() < 0.001) {
      this.body.sleep();
    }

    // Багфикс: защита от проваливания сквозь пол (если не в лузе)
    if (this.body.position.y < -Ball.RADIUS && !this.isFallingIntoPocket) {
      this.body.position.y = Ball.RADIUS + 0.05;
      this.body.velocity.set(0, 0, 0);
      this.body.angularVelocity.set(0, 0, 0);
    }
  }

  /**
   * Перемещает шар в точку без пробуждения физики.
   * Идеально для drag-n-drop.
   */
  public teleport(position: THREE.Vector3): void {
    this.body.position.set(position.x, position.y, position.z);
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.body.quaternion.set(0, 0, 0, 1);

    // ПРИНУДИТЕЛЬНО УСЫПЛЯЕМ, чтобы игра не подумала, что шар движется
    this.body.sleep();

    // Синхронизируем меш сразу, чтобы не было визуального лага
    this.mesh.position.copy(position);
  }

  public applyImpulse(direction: THREE.Vector3, power: number): void {
    const maxForce = 4.5;
    const force = power * maxForce;
    const impulse = direction.clone().normalize().multiplyScalar(force);

    this.body.wakeUp();
    // Применяем импульс чуть выше центра, чтобы шар покатился вперед (накат)
    // Если point = (0,0,0) это центр. (0, radius/2, 0) это верх.
    this.body.applyImpulse(
      new CANNON.Vec3(impulse.x, 0, impulse.z),
      new CANNON.Vec3(0, 0, 0)
    );
  }

  public fallIntoPocket(pocketPosition: THREE.Vector3): void {
    if (this.isFallingIntoPocket || this.isPocketed) return;
    this.isFallingIntoPocket = true;

    this.body.linearDamping = 0;
    this.body.angularDamping = 0;

    // Тянем к центру лузы и вниз
    const toCenter = new CANNON.Vec3(
      pocketPosition.x - this.body.position.x,
      -0.5,
      pocketPosition.z - this.body.position.z
    );
    toCenter.normalize();

    this.body.velocity.scale(0.5, this.body.velocity); // Гасим скорость
    this.body.velocity.vadd(toCenter.scale(1.5), this.body.velocity); // Добавляем тягу
    this.body.collisionResponse = false; // Отключаем коллизии
  }

  public setPocketed(pocketed: boolean): void {
    this.isPocketed = pocketed;
    this.isFallingIntoPocket = false;
    if (pocketed) {
      this.mesh.visible = false;
      this.body.sleep();
      this.body.position.set(0, -100, 0);
      this.body.collisionResponse = false;
    } else {
      this.mesh.visible = true;
      this.body.wakeUp();
      this.body.collisionResponse = true;
      this.body.linearDamping = 0.2;
      this.body.angularDamping = 0.2;
    }
  }

  public resetPosition(position: THREE.Vector3): void {
    this.body.position.set(position.x, position.y, position.z);
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.body.quaternion.set(0, 0, 0, 1);
    this.body.wakeUp();
    this.setPocketed(false);
  }

  public isMoving(): boolean {
    return !this.isPocketed && this.body.sleepState !== CANNON.Body.SLEEPING;
  }

  public getPosition(): THREE.Vector3 { return new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z); }
  public getMesh(): THREE.Mesh { return this.mesh; }
  public getBody(): CANNON.Body { return this.body; }
  public getNumber(): number { return this.number; }
  public getType(): BallType { return this.type; }
  public isPocketedState(): boolean { return this.isPocketed; }
  public isFalling(): boolean { return this.isFallingIntoPocket; }
}