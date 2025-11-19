// src/game/objects/CueStick.ts

import * as THREE from 'three';

/**
 * Кий для ударов
 * Управляет позицией, вращением, оттягиванием и анимацией удара
 */
export class CueStick {
  private mesh: THREE.Group;
  private cueLength: number = 1.4;

  private targetBall: THREE.Vector3 | null = null;
  private currentRotation: number = 0;
  private pullbackDistance: number = 0;
  private maxPullback: number = 0.5;

  private isAnimating: boolean = false;

  constructor(model: THREE.Object3D) {
    this.mesh = new THREE.Group();
    this.setupCueFromModel(model);
    this.mesh.position.set(0, 0.85, 0);
  }

  /**
   * Настраивает модель кия
   */
  private setupCueFromModel(model: THREE.Object3D): void {
    const cueClone = model.clone();

    cueClone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = false;

        if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material.roughness = 0.4;
          child.material.metalness = 0.2;
          child.material.needsUpdate = true;
        }
      }
    });

    const box = new THREE.Box3().setFromObject(cueClone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    this.cueLength = Math.max(size.x, size.y, size.z);

    const cueContainer = new THREE.Group();
    cueContainer.add(cueClone);

    cueClone.position.set(-center.x, -center.y, -center.z);

    if (size.y > size.x && size.y > size.z) {
      cueContainer.rotation.z = Math.PI / 2;
    } else if (size.z > size.x && size.z > size.y) {
      cueContainer.rotation.y = -Math.PI / 2;
    }

    this.mesh.add(cueContainer);

    console.log(`🎱 Cue length: ${this.cueLength.toFixed(2)}m`);
  }

  /**
   * Устанавливает целевой шар (биток)
   */
  public setTargetBall(position: THREE.Vector3): void {
    this.targetBall = position.clone();
    this.updatePosition();
  }

  public clearTargetBall(): void {
    this.targetBall = null;
  }

  /**
   * Устанавливает угол поворота кия
   */
  public setRotation(angle: number): void {
    this.currentRotation = angle;
    this.updatePosition();
  }

  /**
   * Устанавливает оттягивание кия
   */
  public setPullback(distance: number): void {
    if (this.isAnimating) return;
    this.pullbackDistance = Math.min(distance, this.maxPullback);
    this.updatePosition();
  }

  public getPullback(): number {
    return this.pullbackDistance;
  }

  public resetPullback(): void {
    if (this.isAnimating) return;
    this.pullbackDistance = 0;
    this.updatePosition();
  }

  /**
   * Возвращает вектор направления удара
   */
  public getStrikeVector(): THREE.Vector3 {
    const direction = new THREE.Vector3(
      Math.cos(this.currentRotation),
      0,
      -Math.sin(this.currentRotation)
    );

    return direction.normalize();
  }

  public getStrikePower(): number {
    return this.pullbackDistance / this.maxPullback;
  }

  /**
   * Анимация удара кием
   */
  public animateStrike(onComplete: () => void): void {
    if (this.isAnimating) return;

    this.isAnimating = true;
    const startPullback = this.pullbackDistance;
    const duration = 150;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const eased = progress * progress * progress;
      this.pullbackDistance = startPullback * (1 - eased);
      this.updatePosition();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.pullbackDistance = 0;
        this.updatePosition();
        this.isAnimating = false;
        onComplete();
      }
    };

    animate();
  }

  /**
   * Обновляет позицию кия
   */
  private updatePosition(): void {
    if (!this.targetBall) {
      return;
    }

    const offset = 0.15;
    const totalDistance = offset + this.pullbackDistance;

    const direction = this.getStrikeVector();

    const cuePosition = this.targetBall.clone();
    cuePosition.add(
      direction.clone().multiplyScalar(-(this.cueLength / 2 + totalDistance))
    );

    this.mesh.position.copy(cuePosition);
    this.mesh.rotation.y = this.currentRotation;
  }

  public update(): void {
  }

  public getMesh(): THREE.Group {
    return this.mesh;
  }

  public getMaxPullback(): number {
    return this.maxPullback;
  }
}