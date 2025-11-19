import * as THREE from 'three';
import { CueStick } from '../objects/CueStick';
import { BallManager } from '../objects/BallManager';
import { UIManager } from '../ui/UIManager';
import { BallType } from '../objects/Ball';
import { GameRules } from '../GameRules';
import { SoundManager } from '../SoundManager';

export class InputController {
  private readonly MOUSE_SENSITIVITY = 0.005;
  private readonly AIM_LINE_MAX_LENGTH = 3.0;

  private camera: THREE.Camera;
  private domElement: HTMLElement;
  private cueStick: CueStick;
  private ballManager: BallManager;
  private gameRules: GameRules;
  private uiManager: UIManager;
  private soundManager?: SoundManager;

  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private tablePlane: THREE.Plane;

  private isMouseDown: boolean = false;
  private currentCueAngle: number = 0; 
  
  private aimLine: THREE.Line;
  private targetGhostBall: THREE.Mesh; 
  private cueBallPlacementGhost: THREE.Mesh; 
  
  private isPlacingCueBall: boolean = false;
  
  private readonly BALL_RADIUS: number;

  constructor(
    camera: THREE.Camera,
    domElement: HTMLElement,
    cueStick: CueStick,
    ballManager: BallManager,
    gameRules: GameRules
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.cueStick = cueStick;
    this.ballManager = ballManager;
    this.gameRules = gameRules;
    this.uiManager = new UIManager();
    this.BALL_RADIUS = this.ballManager.getBallRadius();

    this.tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.ballManager.getBallPositionY());
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.aimLine = this.createAimLine();
    this.targetGhostBall = this.createGhostBall(0xffffcc, 0.4); 
    this.cueBallPlacementGhost = this.createGhostBall(0xffffff, 0.5);

    this.setupUIEvents();
    this.setupMouseEvents();
    
    this.resetAimToCenter();
  }

  public setSoundManager(sm: SoundManager) { this.soundManager = sm; }

  private createAimLine(): THREE.Line {
    // ИСПРАВЛЕНО: Убраны dashSize и gapSize из LineBasicMaterial
    const material = new THREE.LineBasicMaterial({ 
        color: 0xffffff, 
        linewidth: 1, 
        transparent: true, 
        opacity: 0.3
    });
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geometry, material);
    line.visible = false;
    return line;
  }

  private createGhostBall(color: number, opacity: number): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(this.BALL_RADIUS, 32, 32);
    const material = new THREE.MeshStandardMaterial({ 
        color: color, 
        transparent: true, 
        opacity: opacity,
        roughness: 0.1,
        metalness: 0.1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    return mesh;
  }

  private setupUIEvents(): void {
    this.uiManager.onStrike((power) => {
        this.performStrike(power);
    });

    this.uiManager.onPowerUpdate((power) => {
        if(this.isPlacingCueBall) return;
        this.cueStick.setPullback(power * this.cueStick.getMaxPullback());
    });

    this.uiManager.onAimDelta((delta) => {
        if(this.ballManager.areAllBallsStopped() && !this.isPlacingCueBall) {
            this.updateCueAngle(delta); 
        }
    });

    this.uiManager.onRestart(() => window.dispatchEvent(new Event('restartGame')));
  }

  private setupMouseEvents(): void {
    this.domElement.addEventListener('mousedown', (e) => {
       if(e.button === 0) this.isMouseDown = true;
       if(this.isPlacingCueBall) this.tryPlaceCueBall();
    });

    window.addEventListener('mouseup', () => this.isMouseDown = false);

    this.domElement.addEventListener('mousemove', (e) => {
        this.updateMouseCoords(e.clientX, e.clientY);

        if (this.isPlacingCueBall) {
            this.updatePlacementGhost();
            return;
        }

        if (this.isMouseDown && this.ballManager.areAllBallsStopped()) {
            const delta = -e.movementY * this.MOUSE_SENSITIVITY; 
            this.updateCueAngle(delta);
        }
    });
  }

  private resetAimToCenter(): void {
      this.currentCueAngle = 0; 
  }

  private updateCueAngle(deltaRad: number): void {
      this.currentCueAngle += deltaRad; 
      this.updateCueTransform();
  }

  private updateCueTransform(): void {
      const cueBall = this.ballManager.getCueBall();
      if(!cueBall || cueBall.isPocketedState()) {
          this.hideAimingAids();
          return;
      }

      this.cueStick.setTargetBall(cueBall.getPosition());
      this.cueStick.setRotation(this.currentCueAngle);

      this.showAimingAids();
      this.updatePrediction();
  }

  private updatePrediction(): void {
      const cueBall = this.ballManager.getCueBall();
      if(!cueBall) return;

      const start = cueBall.getPosition();
      const dir = new THREE.Vector3(Math.cos(this.currentCueAngle), 0, -Math.sin(this.currentCueAngle));
      
      const balls = this.ballManager.getActiveBalls().filter(b => b.getType() !== BallType.CUE);
      
      let minT = this.AIM_LINE_MAX_LENGTH;
      let collisionFound = false;
      let targetCenter = new THREE.Vector3();

      for(const b of balls) {
          const bPos = b.getPosition();
          
          const v = new THREE.Vector3().subVectors(start, bPos);
          const bVal = 2 * v.dot(dir);
          const cVal = v.lengthSq() - (2 * this.BALL_RADIUS) * (2 * this.BALL_RADIUS);
          const delta = bVal * bVal - 4 * cVal;

          if (delta >= 0) {
              const t1 = (-bVal - Math.sqrt(delta)) / 2;
              if (t1 > 0.01 && t1 < minT) {
                  minT = t1;
                  collisionFound = true;
                  targetCenter = bPos;
              }
          }
      }

      const ghostPos = start.clone().add(dir.clone().multiplyScalar(minT));

      const positions = new Float32Array([...start.toArray(), ...ghostPos.toArray()]);
      this.aimLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      if (collisionFound) {
          this.targetGhostBall.visible = true;
          this.targetGhostBall.position.copy(ghostPos);
          this.targetGhostBall.lookAt(targetCenter);
      } else {
          this.targetGhostBall.visible = false;
      }
  }

  private performStrike(power: number): void {
    if(this.isPlacingCueBall) return;

    const cueBall = this.ballManager.getCueBall();
    if (!cueBall || cueBall.isPocketedState()) return;

    const adjustedPower = power * 0.6; 
    const dir = new THREE.Vector3(Math.cos(this.currentCueAngle), 0, -Math.sin(this.currentCueAngle));
    
    this.cueStick.animateStrike(() => {
        if(this.soundManager) this.soundManager.playCueHit();
        cueBall.applyImpulse(dir, adjustedPower);
    });

    this.handleTurnStart();
  }

  private enterCueBallPlacementMode(): void {
      this.isPlacingCueBall = true;
      this.hideAimingAids();
      
      this.cueBallPlacementGhost.visible = true;
      this.uiManager.updateGameInfo("ФОЛ! Поставьте биток", this.gameRules.getState().currentPlayer, "", 0);
      this.uiManager.setControlsEnabled(false);
  }

  private updatePlacementGhost(): void {
      if(!this.cueBallPlacementGhost) return;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hit = new THREE.Vector3();
      if(this.raycaster.ray.intersectPlane(this.tablePlane, hit)) {
          this.cueBallPlacementGhost.position.copy(hit);
          const valid = this.ballManager.canPlaceCueBall(hit);
          const material = this.cueBallPlacementGhost.material as THREE.MeshStandardMaterial;
          material.color.setHex(valid ? 0x00ff00 : 0xff0000);
          material.opacity = 0.6;
      }
  }

  private tryPlaceCueBall(): void {
      const pos = this.cueBallPlacementGhost.position;
      if(this.ballManager.canPlaceCueBall(pos)) {
          this.ballManager.placeCueBall(pos);
          this.isPlacingCueBall = false;
          this.cueBallPlacementGhost.visible = false;
          this.gameRules.cueBallPlaced();
          
          this.resetAimToCenter();
          this.handleTurnEnd();
      }
  }

  public handleTurnStart(): void {
      this.uiManager.setControlsEnabled(false);
      this.hideAimingAids();
  }

  public handleTurnEnd(): void {
      const state = this.gameRules.getState();
      const cueBall = this.ballManager.getCueBall();

      if (state.canPlaceCueBall || !cueBall || cueBall.isPocketedState()) {
          this.enterCueBallPlacementMode();
          return;
      }

      this.uiManager.setControlsEnabled(true);
      this.updateCueTransform();
      this.updateUIInfo();
  }

  private hideAimingAids(): void {
      this.cueStick.getMesh().visible = false;
      this.aimLine.visible = false;
      this.targetGhostBall.visible = false;
  }
  
  private showAimingAids(): void {
      this.cueStick.getMesh().visible = true;
      this.aimLine.visible = true;
  }

  public updateUIInfo(): void {
      const state = this.gameRules.getState();
      const score = `P1: ${state.scoreP1} | P2: ${state.scoreP2}`;
      this.uiManager.updateGameInfo(state.message, state.currentPlayer, score, 0);
  }
  
  public updateGameInfo(message: string, player: number, scoreText: string, pocketed: number): void {
      this.uiManager.updateGameInfo(message, player, scoreText, pocketed);
  }

  private updateMouseCoords(x: number, y: number) {
      const rect = this.domElement.getBoundingClientRect();
      this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1;
  }

  public getAimLine() { return this.aimLine; }
  public getHighlightOutline() { return this.targetGhostBall; }
  public getCueBallGhost() { return this.cueBallPlacementGhost; }
  public dispose() { this.uiManager.dispose(); }
}