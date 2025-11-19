import * as THREE from 'three';
import { SceneManager } from './SceneManager';
import { PhysicsWorld } from './PhysicsWorld';
import { SoundManager } from './SoundManager';
import { BilliardTable } from './objects/BilliardTable';
import { CueStick } from './objects/CueStick';
import { BallManager } from './objects/BallManager';
import { InputController } from './input/InputController';
import { GameRules } from './GameRules';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class BilliardGame {
  private sceneManager!: SceneManager;
  private physicsWorld!: PhysicsWorld;
  private soundManager!: SoundManager;
  private table!: BilliardTable;
  private cueStick!: CueStick;
  private ballManager!: BallManager;
  private inputController!: InputController;
  private gameRules!: GameRules;

  private clock: THREE.Clock;
  private ballsAreMoving: boolean = false;
  private turnEndTimer: number | null = null;

  constructor() {
    this.clock = new THREE.Clock();
  }

  public async init(): Promise<void> {
    console.log('🎱 Initializing Russian Billiards...');

    // 1. Базовые системы
    this.sceneManager = new SceneManager();
    this.soundManager = new SoundManager();
    this.physicsWorld = new PhysicsWorld();
    this.physicsWorld.setSoundManager(this.soundManager);

    this.gameRules = new GameRules();

    // 2. Загрузка ассетов (ТОЛЬКО стол и кий, шары процедурные)
    await this.loadAssets();

    // 3. Связи
    // BallManager создается в loadAssets, настраиваем его здесь
    this.ballManager.setSoundManager(this.soundManager); // Теперь метод существует
    this.ballManager.setGameRules(this.gameRules);

    // 4. Управление
    this.inputController = new InputController(
      this.sceneManager.getCamera(),
      this.sceneManager.getRenderer().domElement,
      this.cueStick,
      this.ballManager,
      this.gameRules
    );

    // Добавляем UI элементы
    this.sceneManager.addToScene(this.inputController.getAimLine());
    
    // Здесь getHighlightOutline теперь возвращает targetGhostBall (желтый призрак удара)
    const ghostHit = this.inputController.getHighlightOutline();
    if (ghostHit) this.sceneManager.addToScene(ghostHit);

    // Призрак для расстановки битка
    const ghostPlace = this.inputController.getCueBallGhost();
    if (ghostPlace) this.sceneManager.addToScene(ghostPlace);

    // 5. Старт
    this.inputController.handleTurnEnd();
    this.updateUI();
    this.animate();

    window.addEventListener('resize', () => this.sceneManager.onWindowResize());
    window.addEventListener('restartGame', () => this.restartGame());

    console.log('✅ Game initialized');
  }

  private async loadAssets(): Promise<void> {
    const loader = new GLTFLoader();

    // Загружаем только стол и кий
    const [tableGltf, cueGltf] = await Promise.all([
      loader.loadAsync('/models/billiard_table.glb'),
      loader.loadAsync('/models/billiard_cue.glb')
    ]);

    // Создаем стол
    this.table = new BilliardTable(tableGltf.scene, this.physicsWorld);
    this.sceneManager.addToScene(this.table.getMesh());

    // Создаем кий
    this.cueStick = new CueStick(cueGltf.scene);
    this.sceneManager.addToScene(this.cueStick.getMesh());

    // Создаем менеджер шаров (БЕЗ МОДЕЛИ)
    // Передаем только physicsWorld и table
    this.ballManager = new BallManager(this.physicsWorld, this.table);

    // Добавляем созданные процедурные шары на сцену
    this.ballManager.getBalls().forEach(b => this.sceneManager.addToScene(b.getMesh()));
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());
    const dt = this.clock.getDelta();

    this.physicsWorld.step(dt);
    this.ballManager.update();
    this.cueStick.update();

    this.checkTurnState();
    this.sceneManager.render();
  }

  private checkTurnState(): void {
    const allStopped = this.ballManager.areAllBallsStopped();

    if (!allStopped && !this.ballsAreMoving) {
      this.ballsAreMoving = true;
      this.gameRules.onTurnStart();
      this.inputController.handleTurnStart();
      if (this.turnEndTimer) clearTimeout(this.turnEndTimer);
    } else if (allStopped && this.ballsAreMoving) {
      if (!this.turnEndTimer) {
        this.turnEndTimer = window.setTimeout(() => {
          this.ballsAreMoving = false;
          this.gameRules.onTurnEnd();
          this.inputController.handleTurnEnd();
          this.updateUI();
          this.turnEndTimer = null;
        }, 500);
      }
    }
  }

  private updateUI(): void {
    const state = this.gameRules.getState();
    this.inputController.updateGameInfo(
      state.message,
      state.currentPlayer,
      `Счет: ${state.scoreP1} : ${state.scoreP2}`,
      state.scoreP1 + state.scoreP2
    );
  }

  public restartGame(): void {
    // Удаляем старые меши шаров со сцены
    this.ballManager.getBalls().forEach(b => this.sceneManager.getScene().remove(b.getMesh()));

    this.gameRules.resetGame();
    this.ballManager.resetGame();

    // Добавляем новые меши
    this.ballManager.getBalls().forEach(b => this.sceneManager.addToScene(b.getMesh()));

    this.updateUI();
    this.inputController.handleTurnEnd();
  }
}