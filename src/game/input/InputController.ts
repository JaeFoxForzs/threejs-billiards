import * as THREE from 'three';
import { CueStick } from '../objects/CueStick';
import { BallManager } from '../objects/BallManager';
import { UIManager } from '../ui/UIManager';
import { GameRules } from '../GameRules';
import { SoundManager } from '../SoundManager';
import { BilliardTable } from '../objects/BilliardTable';
import { SceneManager } from '../SceneManager';

export class InputController {
    private readonly MOUSE_SENSITIVITY = 0.005;

    private sceneManager: SceneManager;
    private camera: THREE.Camera;
    private domElement: HTMLElement;
    private cueStick: CueStick;
    private ballManager: BallManager;
    private gameRules: GameRules;
    private table: BilliardTable;
    private uiManager: UIManager;
    private soundManager?: SoundManager;

    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;
    private tablePlane: THREE.Plane;

    private isMouseDown: boolean = false;
    private currentCueAngle: number = 0;

    // Визуал
    private aimLine: THREE.Line;
    private targetGhostBall: THREE.Mesh;
    private placementGuides: THREE.Group; // Стрелочки под шаром при размещении

    // Состояния ввода
    private isPlacementMode: boolean = false;
    private isSelectingShooterMode: boolean = false; // Выбираем шар для удара
    private isAimingMode: boolean = false;           // Целимся

    constructor(
        sceneManager: SceneManager,
        domElement: HTMLElement,
        cueStick: CueStick,
        ballManager: BallManager,
        gameRules: GameRules,
        table: BilliardTable
    ) {
        this.sceneManager = sceneManager;
        this.camera = sceneManager.getCamera();
        this.domElement = domElement;
        this.cueStick = cueStick;
        this.ballManager = ballManager;
        this.gameRules = gameRules;
        this.table = table;

        this.uiManager = new UIManager();

        const ballY = this.ballManager.getBallPositionY();
        this.tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ballY);
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.aimLine = this.createAimLine();
        this.targetGhostBall = this.createGhostBall(0xffffcc, 0.4);
        this.placementGuides = this.createPlacementGuides();
        this.sceneManager.addToScene(this.placementGuides);

        this.setupUIEvents();
        this.setupMouseEvents();
        this.resetAimToCenter();
    }

    public setSoundManager(sm: SoundManager) { this.soundManager = sm; }

    private createAimLine(): THREE.Line {
        const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1, transparent: true, opacity: 0.3 });
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        const line = new THREE.Line(geometry, material);
        line.visible = false;
        return line;
    }

    private createGhostBall(color: number, opacity: number): THREE.Mesh {
        const geometry = new THREE.SphereGeometry(this.ballManager.getBallRadius(), 32, 32);
        const material = new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: opacity, roughness: 0.1 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        return mesh;
    }

    /**
    * Исправленные стрелки: 
    * - Острые (ConeGeometry)
    * - Серый цвет
    * - Углом наружу
    */
    private createPlacementGuides(): THREE.Group {
        const group = new THREE.Group();
        const r = this.ballManager.getBallRadius();

        // Серый цвет
        const material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.9 });

        // Острая стрелка: радиус 0.2r, длина 1.2r
        const arrowLen = r * 1.2;
        // ConeGeometry создает конус высотой H, центр в H/2.
        // Нам нужно, чтобы основание (широкое) было в 0, а пик в +H.
        const arrowGeom = new THREE.ConeGeometry(r * 0.2, arrowLen, 16);
        arrowGeom.translate(0, arrowLen / 2, 0); // Сдвигаем, теперь Base в 0,0,0, Tip в 0,len,0

        for (let i = 0; i < 4; i++) {
            const arrow = new THREE.Mesh(arrowGeom, material);

            // Обертка для вращения вокруг центра шара
            const wrapper = new THREE.Object3D();

            // Сдвигаем стрелку от центра: радиус шара + зазор
            const dist = r * 1.1;
            arrow.position.set(0, 0, dist);

            // Поворачиваем саму стрелку, чтобы она лежала и смотрела "от" центра
            // Конус смотрит вверх по Y. Поворачиваем на 90 по X -> смотрит по Z (наружу)
            arrow.rotation.x = Math.PI / 2;

            wrapper.add(arrow);

            // Вращаем обертку вокруг Y (вокруг шара) на 0, 90, 180, 270
            wrapper.rotation.y = -i * Math.PI / 2;

            group.add(wrapper);
        }

        group.visible = false;
        return group;
    }

    private setupUIEvents(): void {
        this.uiManager.onStrike((power) => {
            if (this.isPlacementMode || this.isSelectingShooterMode) return;
            this.performStrike(power);
        });

        this.uiManager.onPowerUpdate((power) => {
            if (this.isPlacementMode || this.isSelectingShooterMode) return;
            this.cueStick.setPullback(power * this.cueStick.getMaxPullback());
        });

        this.uiManager.onAimDelta((delta) => {
            if (this.isAimingMode && this.ballManager.areAllBallsStopped()) {
                this.updateCueAngle(delta);
            }
        });

        this.uiManager.onRestart(() => window.dispatchEvent(new Event('restartGame')));
        this.uiManager.onToggleCollision((v) => this.table.toggleDebugCollision(v));
        this.uiManager.onToggleTriggers((v) => this.table.toggleDebugTriggers(v));
    }

    private setupMouseEvents(): void {
        this.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.isMouseDown = true;

                // Обработка клика в разных режимах
                if (this.isPlacementMode) {
                    this.tryPlaceCueBall();
                }
                else if (this.isSelectingShooterMode) {
                    this.trySelectShooter();
                }
            }
        });

        window.addEventListener('mouseup', () => this.isMouseDown = false);

        this.domElement.addEventListener('mousemove', (e) => {
            this.updateMouseCoords(e.clientX, e.clientY);

            if (this.isPlacementMode) {
                this.updatePlacementPosition();
            }
            else if (this.isAimingMode && this.isMouseDown && this.ballManager.areAllBallsStopped()) {
                const delta = -e.movementY * this.MOUSE_SENSITIVITY;
                this.updateCueAngle(delta);
            }
        });
    }

    private resetAimToCenter(): void { this.currentCueAngle = 0; }

    private updateCueAngle(deltaRad: number): void {
        this.currentCueAngle += deltaRad;
        this.updateCueTransform();
    }

    private updateCueTransform(): void {
        const cueBall = this.ballManager.getActiveCueBall();
        // Если биток не выбран или забит
        if (!cueBall || cueBall.isPocketedState()) {
            this.hideAimingAids();
            return;
        }
        this.cueStick.setTargetBall(cueBall.getPosition());
        this.cueStick.setRotation(this.currentCueAngle);
        this.showAimingAids();
        this.updatePrediction();
    }

    private updatePrediction(): void {
        const cueBall = this.ballManager.getActiveCueBall();
        if (!cueBall) return;

        const start = cueBall.getPosition();
        const dir = new THREE.Vector3(Math.cos(this.currentCueAngle), 0, -Math.sin(this.currentCueAngle));
        // Все активные шары кроме самого битка
        const balls = this.ballManager.getActiveBalls().filter(b => b !== cueBall);

        let minT = 3.0;
        let collisionFound = false;
        let targetCenter = new THREE.Vector3();
        const r2 = this.ballManager.getBallRadius() * 2;

        for (const b of balls) {
            const v = new THREE.Vector3().subVectors(start, b.getPosition());
            const bVal = 2 * v.dot(dir);
            const cVal = v.lengthSq() - r2 * r2;
            const delta = bVal * bVal - 4 * cVal;
            if (delta >= 0) {
                const t1 = (-bVal - Math.sqrt(delta)) / 2;
                if (t1 > 0.01 && t1 < minT) {
                    minT = t1;
                    collisionFound = true;
                    targetCenter = b.getPosition();
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
        if (this.isPlacementMode || this.isSelectingShooterMode) return;

        const cueBall = this.ballManager.getActiveCueBall();
        if (!cueBall || cueBall.isPocketedState()) return;

        // === СООБЩАЕМ ИГРЕ, ЧТО БЫЛ УДАР ===
        window.dispatchEvent(new Event('playerStrike'));

        const adjustedPower = power * 0.6;
        const dir = new THREE.Vector3(Math.cos(this.currentCueAngle), 0, -Math.sin(this.currentCueAngle));

        this.cueStick.animateStrike(() => {
            if (this.soundManager) this.soundManager.playCueHit();
            cueBall.applyImpulse(dir, adjustedPower);
            if (adjustedPower > 1.5) this.sceneManager.shakeCamera(adjustedPower * 2.0);
        });
        this.handleTurnStart();
    }

    // --- РЕЖИМ 1: УСТАНОВКА БИТКА (РАЗБОЙ) ---
    private enterPlacementMode(): void {
        this.isPlacementMode = true;
        this.isSelectingShooterMode = false;
        this.isAimingMode = false;

        this.hideAimingAids();
        this.placementGuides.visible = true;

        const state = this.gameRules.getState();
        this.uiManager.updateGameInfo(
            "Переместите биток в Дом (слева)",
            state.currentPlayer,
            `Счет: ${state.scoreP1} : ${state.scoreP2}`,
            0
        );
        this.uiManager.setControlsEnabled(false);
    }

    private updatePlacementPosition(): void {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hit = new THREE.Vector3();

        if (this.raycaster.ray.intersectPlane(this.tablePlane, hit)) {
            const cueBall = this.ballManager.getActiveCueBall();
            if (!cueBall) return;

            // Двигаем сам шар, а не призрак
            this.ballManager.updateBreakBallPosition(hit);

            // Двигаем стрелочки за шаром
            this.placementGuides.position.copy(cueBall.getPosition());
            this.placementGuides.position.y = this.ballManager.getBallPositionY() - 0.02; // Чуть ниже шара

            // Подсветка валидности
            const valid = this.ballManager.canPlaceBreakBall(hit);

            // Красим стрелки
            this.placementGuides.children.forEach((wrapper: any) => {
                // wrapper - это Object3D, внутри него Mesh
                const arrow = wrapper.children[0] as THREE.Mesh;
                if (arrow && arrow.material) {
                    (arrow.material as THREE.MeshBasicMaterial).color.setHex(valid ? 0xaaaaaa : 0xff0000);
                }
            });
        }
    }

    private tryPlaceCueBall(): void {
        const cueBall = this.ballManager.getActiveCueBall();
        if (!cueBall) return;

        const pos = cueBall.getPosition();
        if (this.ballManager.canPlaceBreakBall(pos)) {
            // Фиксируем позицию
            this.isPlacementMode = false;
            this.placementGuides.visible = false;

            this.gameRules.cueBallPlaced();

            // Сразу переходим в прицеливание, так как биток уже выбран
            this.enterAimingMode();
        }
    }

    // --- РЕЖИМ 2: ВЫБОР БИТКА (СВОБОДНАЯ ПИРАМИДА) ---
    private enterSelectionMode(): void {
        this.isSelectingShooterMode = true;
        this.isPlacementMode = false;
        this.isAimingMode = false;

        this.hideAimingAids();
        this.uiManager.updateGameInfo(
            "Кликните по любому шару для удара",
            this.gameRules.getState().currentPlayer,
            "", 0
        );
        this.uiManager.setControlsEnabled(false);
    }

    private trySelectShooter(): void {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const ball = this.ballManager.findBallByRay(this.raycaster);

        if (ball && !ball.isPocketedState()) {
            this.ballManager.setActiveCueBall(ball);
            this.isSelectingShooterMode = false;
            this.enterAimingMode();
        }
    }

    // --- РЕЖИМ 3: ПРИЦЕЛИВАНИЕ ---
    private enterAimingMode(): void {
        this.isAimingMode = true;
        this.resetAimToCenter();
        this.showAimingAids();
        this.updateCueTransform();

        this.uiManager.setControlsEnabled(true);
        this.updateUIInfo();
    }

    // --- ОБЩИЙ ЦИКЛ ---

    public handleTurnStart(): void {
        this.uiManager.setControlsEnabled(false);
        this.hideAimingAids();
    }

    public handleTurnEnd(): void {
        const state = this.gameRules.getState();

        // 1. Если это разбой - включаем режим перемещения
        if (state.isBreakShot && state.canPlaceCueBall) {
            this.enterPlacementMode();
            return;
        }

        // 2. Если обычный ход - включаем режим выбора шара
        // (В свободной пирамиде мы каждый раз можем выбирать новый биток)
        this.enterSelectionMode();
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
        const score = `Счет: ${state.scoreP1} : ${state.scoreP2}`;
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
    public getCueBallGhost() { return this.targetGhostBall; } // Используется в main.ts (legacy name)
    public dispose() { this.uiManager.dispose(); }
}