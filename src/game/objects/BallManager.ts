import * as THREE from 'three';
import { Ball } from './Ball';
import { BilliardTable } from './BilliardTable';
import { PhysicsWorld } from '../PhysicsWorld';
import { SoundManager } from '../SoundManager';
import type { GameRules } from '../GameRules';

export class BallManager {
    private balls: Ball[] = [];
    private activeCueBall: Ball | null = null;
    private breakBall: Ball | null = null;
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
        const axis = this.table.majorAxis;
        const length = axis === 'x' ? this.table.playFieldX : this.table.playFieldZ;

        // Координата центра дома (Head Spot) - линия на -L/4
        // Координата пирамиды (Foot Spot) - точка на +L/4

        const headPos = -length / 4;
        const footPos = length / 4;

        // 1. Шар для разбоя (БИТОК)
        const cuePos = new THREE.Vector3(0, y, 0);
        if (axis === 'x') {
            cuePos.set(headPos, y, 0);
        } else {
            cuePos.set(0, y, headPos);
        }

        this.breakBall = new Ball(0, cuePos, this.physicsWorld, y);
        this.activeCueBall = this.breakBall;
        this.balls.push(this.breakBall);

        // 2. Пирамида
        const spacing = Ball.RADIUS * 2.02;
        const rowOffset = Math.sqrt(3) * Ball.RADIUS * 1.01;

        let count = 1;
        for (let row = 0; row < 5; row++) {
            const ballsInRow = row + 1;
            // Смещение "вширь" (по короткой стороне)
            const sideStart = -(ballsInRow - 1) * spacing / 2;
            // Смещение "вглубь" (по длинной стороне) от точки Foot Spot
            const depthPos = footPos + row * rowOffset;

            for (let i = 0; i < ballsInRow; i++) {
                // Координата на короткой стороне
                const sidePos = sideStart + i * spacing;

                let bx = 0, bz = 0;
                if (axis === 'x') {
                    // Длинная ось X: глубина по X, ширина по Z
                    bx = depthPos;
                    bz = sidePos;
                } else {
                    // Длинная ось Z: глубина по Z, ширина по X
                    bx = sidePos;
                    bz = depthPos;
                }

                const ball = new Ball(count++, new THREE.Vector3(bx, y, bz), this.physicsWorld, y);
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
                if (ball.getPosition().y < this.table.tableHeight - 0.2) {
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
        if (!this.pocketedBalls.includes(ball)) {
            this.pocketedBalls.push(ball);
        }
        if (ball === this.activeCueBall) {
            this.activeCueBall = null;
        }
        if (this.gameRules) this.gameRules.onBallPocketed(ball);
    }

    public updateBreakBallPosition(pos: THREE.Vector3): void {
        if (!this.breakBall) return;
        this.breakBall.teleport(new THREE.Vector3(pos.x, this.getBallPositionY(), pos.z));
    }

    public canPlaceBreakBall(pos: THREE.Vector3): boolean {
        const bounds = this.table.getPlayingAreaBounds();
        const axis = this.table.majorAxis;

        // Проверка внешних границ
        if (pos.x < bounds.minX || pos.x > bounds.maxX) return false;
        if (pos.z < bounds.minZ || pos.z > bounds.maxZ) return false;

        // Проверка зоны "Дома"
        const length = axis === 'x' ? this.table.playFieldX : this.table.playFieldZ;
        const headLine = -length / 4;

        if (axis === 'x') {
            // Дом - это отрицательные X до линии headLine
            if (pos.x > headLine) return false;
        } else {
            // Дом - это отрицательные Z до линии headLine
            if (pos.z > headLine) return false;
        }

        // Коллизии
        for (const b of this.balls) {
            if (b === this.breakBall || b.isPocketedState()) continue;
            const dist = pos.distanceTo(b.getPosition());
            if (dist < Ball.RADIUS * 2.05) return false;
        }
        return true;
    }

    public setActiveCueBall(ball: Ball): void {
        if (!ball.isPocketedState()) {
            this.activeCueBall = ball;
        }
    }

    public getActiveCueBall(): Ball | null { return this.activeCueBall; }

    public findBallByRay(raycaster: THREE.Raycaster): Ball | null {
        let closestBall: Ball | null = null;
        let minDistance = Infinity;
        for (const ball of this.balls) {
            if (ball.isPocketedState()) continue;
            const mesh = ball.getMesh();
            const intersects = raycaster.intersectObject(mesh);
            if (intersects.length > 0) {
                if (intersects[0].distance < minDistance) {
                    minDistance = intersects[0].distance;
                    closestBall = ball;
                }
            }
        }
        return closestBall;
    }

    public resetGame(): void {
        this.pocketedBalls = [];
        this.balls.forEach(b => this.physicsWorld.removeBody(b.getBody()));
        this.balls = [];
        this.createBalls();
    }

    public getBalls(): Ball[] { return this.balls; }
    public getActiveBalls(): Ball[] { return this.balls.filter(b => !b.isPocketedState()); }
    public getBallRadius(): number { return Ball.RADIUS; }
    public getBallPositionY(): number { return this.table.tableHeight + Ball.RADIUS; }

    public areAllBallsStopped(): boolean {
        return this.balls.every(b => b.isPocketedState() || !b.isMoving());
    }
}