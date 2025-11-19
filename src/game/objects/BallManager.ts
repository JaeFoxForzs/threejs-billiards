import * as THREE from 'three';
import { Ball } from './Ball';
import { BilliardTable } from './BilliardTable';
import { PhysicsWorld } from '../PhysicsWorld';
import { SoundManager } from '../SoundManager';
import type { GameRules } from '../GameRules';

export class BallManager {
  private balls: Ball[] = [];
  private cueBall: Ball | null = null;
  private pocketedBalls: Ball[] = [];
  
  private table: BilliardTable;
  private physicsWorld: PhysicsWorld;
  private soundManager: SoundManager | null = null;
  private gameRules: GameRules | null = null;

  constructor(physicsWorld: PhysicsWorld, table: BilliardTable) {
    this.physicsWorld = physicsWorld;
    this.table = table;
    this.createBalls();
  }

  public setSoundManager(sm: SoundManager): void { this.soundManager = sm; }
  public setGameRules(gr: GameRules): void { this.gameRules = gr; }

  private createBalls(): void {
    const y = this.getBallPositionY();
    
    this.cueBall = new Ball(0, new THREE.Vector3(-this.table.tableLength / 4, y, 0), this.physicsWorld, y);
    this.balls.push(this.cueBall);

    const startX = this.table.tableLength / 4;
    const spacing = Ball.RADIUS * 2.01;
    const rowOffset = Math.sqrt(3) * Ball.RADIUS;

    let count = 1;
    for (let row = 0; row < 5; row++) {
        const ballsInRow = row + 1;
        const zStart = -(ballsInRow - 1) * spacing / 2;
        
        for (let i = 0; i < ballsInRow; i++) {
            const x = startX + row * rowOffset;
            const z = zStart + i * spacing;
            
            const ball = new Ball(count++, new THREE.Vector3(x, y, z), this.physicsWorld, y);
            this.balls.push(ball);
        }
    }
  }

  public update(): void {
    this.balls.forEach(ball => {
        if (ball.isPocketedState()) return;

        ball.update();

        if (!ball.isFalling()) {
            const pocket = this.table.checkPocketEntry(ball.getPosition());
            if (pocket) {
                ball.fallIntoPocket(pocket.position);
                if (this.soundManager) this.soundManager.playPocketSound();
            }
        } else {
            if (ball.getPosition().y < this.table.tableHeight - 0.15) {
                this.pocketBall(ball);
            }
        }

        if (ball.getPosition().y < 0 && !ball.isFalling() && !ball.isPocketedState()) {
            this.pocketBall(ball);
        }
    });
  }

  private pocketBall(ball: Ball): void {
    ball.setPocketed(true);
    this.pocketedBalls.push(ball);
    if (this.gameRules) this.gameRules.onBallPocketed(ball);
  }

  public placeCueBall(pos: THREE.Vector3): void {
      if (!this.cueBall) return;
      const safePos = new THREE.Vector3(pos.x, this.getBallPositionY(), pos.z);
      this.cueBall.resetPosition(safePos);
      
      const index = this.pocketedBalls.indexOf(this.cueBall);
      if (index > -1) this.pocketedBalls.splice(index, 1);
  }
  
  public canPlaceCueBall(pos: THREE.Vector3): boolean {
      const bounds = this.table.getPlayingAreaBounds();
      if (pos.x < bounds.minX || pos.x > bounds.maxX || pos.z < bounds.minZ || pos.z > bounds.maxZ) return false;

      for (const b of this.balls) {
          if (b === this.cueBall || b.isPocketedState()) continue;
          if (pos.distanceTo(b.getPosition()) < Ball.RADIUS * 2.1) return false;
      }
      return true;
  }

  public resetGame(): void {
      this.pocketedBalls = [];
      this.balls.forEach(b => this.physicsWorld.removeBody(b.getBody()));
      this.balls = [];
      this.createBalls();
  }

  public getCueBall(): Ball | null { return this.cueBall; }
  public getBalls(): Ball[] { return this.balls; }
  public getPocketedBalls(): Ball[] { return this.pocketedBalls; }
  
  public getActiveBalls(): Ball[] { 
      return this.balls.filter(b => !b.isPocketedState()); 
  }

  public getBallRadius(): number {
      return Ball.RADIUS;
  }

  public getBallPositionY(): number {
      return this.table.tableHeight + Ball.RADIUS;
  }
  
  public areAllBallsStopped(): boolean {
      return this.balls.every(b => b.isPocketedState() || !b.isMoving());
  }

  public setPocketCheckEnabled(_enabled: boolean): void {}
}