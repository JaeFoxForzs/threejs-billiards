import * as THREE from 'three';

export class SceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  
  // Для тряски
  private shakeIntensity: number = 0;
  private baseCameraPosition: THREE.Vector3;

  constructor() {
    this.container = document.getElementById('game-container') || document.body;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x151515); // Темно-серый фон
    
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    // Базовая позиция камеры (Вид сверху)
    this.baseCameraPosition = new THREE.Vector3(0, 2.8, 0.0);
    this.camera.position.copy(this.baseCameraPosition);
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    this.renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: 'high-performance',
    });
    
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.container.appendChild(this.renderer.domElement);
  }

  public addToScene(obj: THREE.Object3D) { this.scene.add(obj); }
  public getCamera() { return this.camera; }
  public getRenderer() { return this.renderer; }
  public getScene() { return this.scene; }
  
  // Вызывать при сильном ударе (например, > 2.0 force)
  public shakeCamera(intensity: number) {
      this.shakeIntensity = Math.min(intensity * 0.02, 0.1);
  }

  public render(): void {
      // Логика тряски
      if (this.shakeIntensity > 0) {
          const rx = (Math.random() - 0.5) * this.shakeIntensity;
          const rz = (Math.random() - 0.5) * this.shakeIntensity;
          this.camera.position.set(
              this.baseCameraPosition.x + rx,
              this.baseCameraPosition.y,
              this.baseCameraPosition.z + rz
          );
          this.shakeIntensity *= 0.9; // Затухание
          if (this.shakeIntensity < 0.001) {
              this.shakeIntensity = 0;
              this.camera.position.copy(this.baseCameraPosition);
          }
      }

      this.renderer.render(this.scene, this.camera);
  }

  public onWindowResize() {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
  }
  
  public dispose() { 
      this.renderer.dispose(); 
  }
}