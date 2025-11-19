import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * @class SceneManager
 * @description
 * Управляет всеми объектами, связанными с рендерингом в Three.js:
 * сценой, камерой, рендерером и освещением. Также предоставляет режим отладки с OrbitControls.
 */
export class SceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;

  private isVerticalLayout: boolean = false;
  private debugMode: boolean = false;
  private controls: OrbitControls | null = null;

  constructor() {
    this.container = document.getElementById('game-container') || document.body;
    this.debugMode = new URLSearchParams(window.location.search).has('debug');

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a2a2a);

    this.isVerticalLayout = this.container.clientHeight > this.container.clientWidth;

    this.camera = new THREE.PerspectiveCamera(
      50,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.setupCameraAndControls();
    this.setupLights();
  }

  /**
   * @private
   * @method setupCameraAndControls
   * @description
   * Настраивает камеру и элементы управления в зависимости от того,
   * включен ли режим отладки (`?debug=true` в URL).
   */
  private setupCameraAndControls(): void {
    if (this.debugMode) {
      // Режим отладки со свободной камерой
      console.log('🚀 Включен режим отладки камеры');
      this.camera.position.set(0, 2.5, 4);

      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.screenSpacePanning = false;
      this.controls.minDistance = 1;
      this.controls.maxDistance = 10;
      this.controls.target.set(0, 0.8, 0);
      this.controls.update();

    } else {
      // Стандартный игровой режим с видом сверху
      this.camera.position.set(0, 3.25, 0);
      this.camera.rotation.set(-Math.PI / 2, 0, 0);

      if (this.isVerticalLayout) {
        this.camera.rotation.z = Math.PI / 2;
        console.log('📱 Вертикальная ориентация - камера повернута на 90°');
      } else {
        console.log('💻 Горизонтальная ориентация');
      }
    }
  }

  /**
   * @private
   * @method setupLights
   * @description
   * Создает и настраивает источники света в сцене.
   */
  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(2, 4, -2);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 10;
    directionalLight.shadow.camera.left = -3;
    directionalLight.shadow.camera.right = 3;
    directionalLight.shadow.camera.top = 3;
    directionalLight.shadow.camera.bottom = -3;
    this.scene.add(directionalLight);
  }

  /**
   * @method addToScene
   * @param {THREE.Object3D} object - Объект для добавления на сцену.
   * @description Добавляет объект Three.js в главную сцену.
   */
  public addToScene(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  /**
   * @method render
   * @description Выполняет один кадр рендеринга. Обновляет OrbitControls, если они активны.
   */
  public render(): void {
    if (this.debugMode && this.controls) {
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * @method onWindowResize
   * @description
   * Обработчик изменения размера окна. Обновляет соотношение сторон камеры и размер рендерера.
   */
  public onWindowResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    if (!this.debugMode) {
      const newIsVertical = height > width;
      if (newIsVertical !== this.isVerticalLayout) {
        this.isVerticalLayout = newIsVertical;
        this.setupCameraAndControls();
      }
    }

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public getCamera(): THREE.Camera { return this.camera; }
  public getRenderer(): THREE.WebGLRenderer { return this.renderer; }
  public getScene(): THREE.Scene { return this.scene; }

  /**
   * @method dispose
   * @description Освобождает ресурсы, связанные с рендерером и элементами управления.
   */
  public dispose(): void {
    this.controls?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}