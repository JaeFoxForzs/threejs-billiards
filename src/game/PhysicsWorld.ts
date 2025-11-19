import * as CANNON from 'cannon-es';
import { SoundManager } from './SoundManager';

/**
 * Физический мир игры (Cannon.js)
 * Оптимизирован для 60 FPS и точной передачи импульса
 */
export class PhysicsWorld {
  private world: CANNON.World;
  // Фиксированный шаг 1/60. Важно вызывать step именно с таким шагом в цикле
  private readonly timeStep: number = 1 / 60; 
  // Увеличиваем подшаги для обработки быстрых ударов
  private readonly maxSubSteps: number = 20; 

  // Материалы
  private ballMaterial: CANNON.Material;
  private tableMaterial: CANNON.Material;
  private cushionMaterial: CANNON.Material;
  private pocketMaterial: CANNON.Material;

  private soundManager: SoundManager | null = null;

  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0)
    });

    // Настройка решателя (Solver) для точности
    // GSSolver - стандартный, но нужно больше итераций для бильярда
    (this.world.solver as CANNON.GSSolver).iterations = 20; 
    (this.world.solver as CANNON.GSSolver).tolerance = 1e-4;
    
    // Отключаем broadphase 'Naive', ставим SAP (Sweep and Prune) - это быстрее для множества объектов
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;

    // Создаем материалы
    this.ballMaterial = new CANNON.Material('ball');
    this.tableMaterial = new CANNON.Material('table'); 
    this.cushionMaterial = new CANNON.Material('cushion'); 
    this.pocketMaterial = new CANNON.Material('pocket'); 

    this.setupPhysicsMaterials();

    // Стабильность контактов (чуть мягче, чем 1e8, чтобы не было взрывов, но достаточно жестко)
    this.world.defaultContactMaterial.contactEquationStiffness = 1e7;
    this.world.defaultContactMaterial.contactEquationRelaxation = 3;
  }

  public setSoundManager(manager: SoundManager): void {
    this.soundManager = manager;
    this.setupCollisionSounds();
  }

  private setupPhysicsMaterials(): void {
    // 1. ШАР ↔ ШАР
    // friction очень низкий, шары полированные. 
    // restitution высокий для передачи энергии.
    const ballBall = new CANNON.ContactMaterial(this.ballMaterial, this.ballMaterial, {
      friction: 0.04, // Было 0.1 - снижаем, чтобы не терять энергию на трение при ударе
      restitution: 0.95, // Почти упругий удар
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3
    });

    // 2. ШАР ↔ СУКНО
    // friction снижаем с 0.7 до 0.2. 0.7 - это наждачка, шары вставали колом.
    // Rolling friction (трение качения) в Cannon-es нет напрямую в ContactMaterial,
    // оно эмулируется через damping в классе Ball.
    const ballTable = new CANNON.ContactMaterial(this.ballMaterial, this.tableMaterial, {
      friction: 0.2, 
      restitution: 0.1, 
    });

    // 3. ШАР ↔ БОРТ
    const ballCushion = new CANNON.ContactMaterial(this.ballMaterial, this.cushionMaterial, {
      friction: 0.15,
      restitution: 0.8, // Хороший отскок
    });

    // 4. ШАР ↔ ЛУЗА
    const ballPocket = new CANNON.ContactMaterial(this.ballMaterial, this.pocketMaterial, {
      friction: 0.3,
      restitution: 0.0, // Гасим отскок полностью
    });

    this.world.addContactMaterial(ballBall);
    this.world.addContactMaterial(ballTable);
    this.world.addContactMaterial(ballCushion);
    this.world.addContactMaterial(ballPocket);
  }

  private setupCollisionSounds(): void {
    this.world.addEventListener('beginContact', (event: any) => {
      if (!this.soundManager) return;

      const bodyA = event.bodyA;
      const bodyB = event.bodyB;

      const velocityA = bodyA.velocity;
      const velocityB = bodyB.velocity;
      // Относительная скорость важна для силы звука
      const relativeVelocity = velocityA.vsub(velocityB).length();

      if (relativeVelocity < 0.2) return; // Фильтр шума

      const matA = bodyA.material;
      const matB = bodyB.material;

      if (!matA || !matB) return;

      if (matA.name === 'ball' && matB.name === 'ball') {
        // Усиливаем звук удара шаров, так как импульс стал лучше
        this.soundManager.playBallHit(relativeVelocity);
      }
      else if ((matA.name === 'ball' && matB.name === 'cushion') ||
        (matA.name === 'cushion' && matB.name === 'ball')) {
        this.soundManager.playCushionHit(relativeVelocity);
      }
    });
  }

  public step(deltaTime: number): void {
    // Важно: передаем фиксированный timeStep первым аргументом
    // deltaTime используется для интерполяции (если нужно), но физика считается дискретно
    this.world.step(this.timeStep, deltaTime, this.maxSubSteps);
  }

  public getWorld(): CANNON.World { return this.world; }
  public getBallMaterial(): CANNON.Material { return this.ballMaterial; }
  public getTableMaterial(): CANNON.Material { return this.tableMaterial; }
  public getCushionMaterial(): CANNON.Material { return this.cushionMaterial; }
  public getPocketMaterial(): CANNON.Material { return this.pocketMaterial; }

  public addBody(body: CANNON.Body): void { this.world.addBody(body); }
  public removeBody(body: CANNON.Body): void { this.world.removeBody(body); }
}