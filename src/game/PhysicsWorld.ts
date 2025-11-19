import * as CANNON from 'cannon-es';

/**
 * Физический мир игры (Cannon.js)
 * Управляет симуляцией физики и материалами
 */
export class PhysicsWorld {
  private world: CANNON.World;
  private readonly timeStep: number = 1 / 120;  // 🔥 Увеличил частоту!
  private readonly maxSubSteps: number = 10;     // 🔥 Больше подшагов!

  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0)
    });

    this.setupPhysicsMaterials();
    this.world.allowSleep = true;

    // 🔥 Глобальные настройки контактов
    this.world.defaultContactMaterial.contactEquationStiffness = 1e14;
    this.world.defaultContactMaterial.contactEquationRelaxation = 0.5;
  }

  /**
   * Настраивает материалы и их взаимодействие
   */
  private setupPhysicsMaterials(): void {
    const ballMaterial = new CANNON.Material('ball');
    const tableMaterial = new CANNON.Material('table');


    // ШАР ↔ ШАР (МАКСИМАЛЬНАЯ ПЕРЕДАЧА ИМПУЛЬСА!)

    const ballBallContact = new CANNON.ContactMaterial(
      ballMaterial,
      ballMaterial,
      {
        friction: 0.0,
        restitution: 0.99,
        contactEquationStiffness: 1e13,
        contactEquationRelaxation: 0.6
      }
    );
    this.world.addContactMaterial(ballBallContact);


    // ШАР ↔ СТОЛ

    const ballTableContact = new CANNON.ContactMaterial(
      ballMaterial,
      tableMaterial,
      {
        friction: 1.0,
        restitution: 0.85,
        contactEquationStiffness: 1e11,
        contactEquationRelaxation: 0.8
      }
    );
    this.world.addContactMaterial(ballTableContact);

    console.log('⚙️ Physics mode:');
    console.log('  TimeStep: 1/120, SubSteps: 10');
    console.log('  Solver iterations: 20');
    console.log('  Ball-Ball: stiffness=1e12, relaxation=1');
  }

  public step(deltaTime: number): void {
    this.world.step(this.timeStep, deltaTime, this.maxSubSteps);
  }

  public getWorld(): CANNON.World {
    return this.world;
  }

  public addBody(body: CANNON.Body): void {
    this.world.addBody(body);
  }

  public removeBody(body: CANNON.Body): void {
    this.world.removeBody(body);
  }
}