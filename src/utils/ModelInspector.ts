// src/utils/ModelInspector.ts
import * as THREE from 'three';

export class ModelInspector {
  public static inspectModel(model: THREE.Object3D, indent: string = ''): void {
    console.log(`${indent}Name: "${model.name}"`);
    console.log(`${indent}Type: ${model.type}`);
    
    if (model instanceof THREE.Mesh) {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      console.log(`${indent}Size: x=${size.x.toFixed(2)}, y=${size.y.toFixed(2)}, z=${size.z.toFixed(2)}`);
      console.log(`${indent}Position: x=${model.position.x.toFixed(2)}, y=${model.position.y.toFixed(2)}, z=${model.position.z.toFixed(2)}`);
    }
    
    if (model.children.length > 0) {
      console.log(`${indent}Children (${model.children.length}):`);
      model.children.forEach(child => {
        this.inspectModel(child, indent + '  ');
      });
    }
    console.log(`${indent}---`);
  }

  public static listAllNames(model: THREE.Object3D): string[] {
    const names: string[] = [];
    
    model.traverse((child) => {
      if (child.name) {
        names.push(child.name);
      }
    });
    
    return names;
  }
}