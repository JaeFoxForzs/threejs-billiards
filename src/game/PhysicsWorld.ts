import * as CANNON from 'cannon-es';
import { SoundManager } from './SoundManager';

/**
 * Физический мир игры (Cannon.js)
 * Настроен под физику Русского бильярда (тяжелые шары, жесткие борта)
 */
export class PhysicsWorld {
  private world: CANNON.World;
  private readonly timeStep: number = 1 / 120;
  private readonly maxSubSteps: number = 10;

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

    // Создаем материалы
    this.ballMaterial = new CANNON.Material('ball');
    this.tableMaterial = new CANNON.Material('table'); // Сукно
    this.cushionMaterial = new CANNON.Material('cushion'); // Резина бортов
    this.pocketMaterial = new CANNON.Material('pocket'); // Внутри лузы

    this.setupPhysicsMaterials();
    this.world.allowSleep = true;

    // Улучшение стабильности контактов
    this.world.defaultContactMaterial.contactEquationStiffness = 1e8;
    this.world.defaultContactMaterial.contactEquationRelaxation = 3;
  }

  public setSoundManager(manager: SoundManager): void {
    this.soundManager = manager;
    this.setupCollisionSounds();
  }

  /**
   * Настраивает взаимодействие материалов
   */
  private setupPhysicsMaterials(): void {
    // 1. ШАР ↔ ШАР
    // Упругий удар, почти без потери энергии, но с небольшим трением
    const ballBall = new CANNON.ContactMaterial(this.ballMaterial, this.ballMaterial, {
      friction: 0.1,
      restitution: 0.92, // Высокая упругость (фенол-альдегидная смола)
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3
    });

    // 2. ШАР ↔ СУКНО (СТОЛ)
    // Высокое трение скольжения, низкая упругость (чтобы не прыгал)
    const ballTable = new CANNON.ContactMaterial(this.ballMaterial, this.tableMaterial, {
      friction: 0.7, // Сильное трение сукна
      restitution: 0.1, // Не прыгает на столе
    });

    // 3. ШАР ↔ БОРТ (РЕЗИНА)
    // Упругость зависит от силы, но в среднем высокая. Русские борта жестче пула.
    const ballCushion = new CANNON.ContactMaterial(this.ballMaterial, this.cushionMaterial, {
      friction: 0.3, // Трение при вращении о борт
      restitution: 0.75, // Отскок от борта
    });

    // 4. ШАР ↔ ЛУЗА
    const ballPocket = new CANNON.ContactMaterial(this.ballMaterial, this.pocketMaterial, {
      friction: 0.5,
      restitution: 0.0, // ГАСИМ ВЕСЬ ОТСКОК
      contactEquationStiffness: 1e8,
      contactEquationRelaxation: 3
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

      // Скорость столкновения (проекция относительной скорости на нормаль)
      // Cannon.js не дает напрямую impact velocity в событии beginContact в старых версиях,
      // но можно оценить по относительной скорости тел.
      const velocityA = bodyA.velocity;
      const velocityB = bodyB.velocity;
      const relativeVelocity = velocityA.vsub(velocityB).length();

      // Фильтруем очень слабые касания
      if (relativeVelocity < 0.1) return;

      // Определяем типы материалов
      const matA = bodyA.material;
      const matB = bodyB.material;

      // Шар об шар
      if (matA.name === 'ball' && matB.name === 'ball') {
        this.soundManager.playBallHit(relativeVelocity);
      }
      // Шар об борт
      else if ((matA.name === 'ball' && matB.name === 'cushion') ||
        (matA.name === 'cushion' && matB.name === 'ball')) {
        this.soundManager.playCushionHit(relativeVelocity);
      }
    });
  }

  public step(deltaTime: number): void {
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