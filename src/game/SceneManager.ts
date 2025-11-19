import * as THREE from 'three';

export class SceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;

  constructor() {
    this.container = document.getElementById('game-container') || document.body;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
    
    // Камера
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(0, 2.6, 0.0); 
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    // Рендерер
    this.renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: 'high-performance',
    });
    
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    
    // Тени и свет
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Tone Mapping делает свет реалистичным, не пересвеченным
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.container.appendChild(this.renderer.domElement);

    // Добавляем базовый Ambient, чтобы совсем темно не было, если парсинг не сработает
    const ambient = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambient);
  }

  public addToScene(obj: THREE.Object3D) { this.scene.add(obj); }
  public getCamera() { return this.camera; }
  public getRenderer() { return this.renderer; }
  public getScene() { return this.scene; }
  
  public render(): void {
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