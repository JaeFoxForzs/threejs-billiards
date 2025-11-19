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
    _lockedPositionY: number // Исправлено: _lockedPositionY
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
      linearDamping: 0.3,
      angularDamping: 0.4,
      sleepSpeedLimit: 0.1, 
      sleepTimeLimit: 0.5
    });

    physicsWorld.addBody(this.body);
  }

  private createMaterial(): THREE.Material {
    let color = 0xfffff0; 
    if (this.type === BallType.CUE) {
      color = 0xB22222; 
    }

    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.15,
      metalness: 0.1,
    });
  }

  public update(): void {
    if (this.isPocketed) return;

    this.mesh.position.copy(this.body.position as any);
    this.mesh.quaternion.copy(this.body.quaternion as any);

    if (!this.isFallingIntoPocket) {
       if (this.body.position.y < Ball.RADIUS - 0.01 && this.body.position.y > 0) {
           // logic
       }
    }
  }

  public applyImpulse(direction: THREE.Vector3, power: number): void {
    const maxForce = 9.0;
    const force = power * maxForce;
    const impulse = direction.clone().normalize().multiplyScalar(force);
    
    this.body.wakeUp();
    this.body.applyImpulse(
      new CANNON.Vec3(impulse.x, 0, impulse.z),
      new CANNON.Vec3(0, 0, 0)
    );
  }

  public fallIntoPocket(pocketPosition: THREE.Vector3): void {
    if (this.isFallingIntoPocket || this.isPocketed) return;

    this.isFallingIntoPocket = true;
    const toCenter = new CANNON.Vec3(
        pocketPosition.x - this.body.position.x,
        0,
        pocketPosition.z - this.body.position.z
    ).unit().scale(0.2);

    this.body.applyImpulse(toCenter, this.body.position);
  }

  public setPocketed(pocketed: boolean): void {
    this.isPocketed = pocketed;
    this.isFallingIntoPocket = false;

    if (pocketed) {
      this.mesh.visible = false;
      this.body.sleep();
      this.body.position.set(0, -10, 0);
      this.body.velocity.setZero();
      this.body.angularVelocity.setZero();
    } else {
      this.mesh.visible = true;
      this.body.wakeUp();
    }
  }

  public resetPosition(position: THREE.Vector3): void {
    this.body.position.set(position.x, position.y, position.z);
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.body.wakeUp();
    this.setPocketed(false);
  }

  public isMoving(): boolean {
    if (this.isPocketed) return false;
    const v = this.body.velocity.lengthSquared();
    const w = this.body.angularVelocity.lengthSquared();
    return v > 0.0001 || w > 0.001;
  }

  public getPosition(): THREE.Vector3 { return new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z); }
  public getMesh(): THREE.Mesh { return this.mesh; }
  public getBody(): CANNON.Body { return this.body; }
  public getNumber(): number { return this.number; }
  public getType(): BallType { return this.type; }
  public isPocketedState(): boolean { return this.isPocketed; }
  public isFalling(): boolean { return this.isFallingIntoPocket; }
}