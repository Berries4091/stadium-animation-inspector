import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { samplePose, sampleTextureIndices } from "../rig/pose";
import type { DsmModel } from "../dsm/format";

type PrimitiveView = {
  primitive: DsmModel["prims"][number];
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  positions: THREE.BufferAttribute;
  normals: THREE.BufferAttribute;
  textures: THREE.DataTexture[];
};

class ModelDrawable {
  readonly group = new THREE.Group();
  private readonly primitiveViews: PrimitiveView[] = [];
  private readonly boneLines: THREE.LineSegments;
  private readonly bonePositions: THREE.BufferAttribute;
  private readonly textures: THREE.DataTexture[];
  private readonly model: DsmModel;

  constructor(model: DsmModel) {
    this.model = model;
    const worldHeight = 14;
    this.group.scale.setScalar((model.rootScale || 1) * worldHeight / Math.max(model.height, 1e-6));
    this.group.rotation.y = Math.PI;

    const textures = model.textures.map((texture) => {
      const uploaded = new THREE.DataTexture(
        texture.rgba,
        texture.w,
        texture.h,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
      );
      uploaded.magFilter = THREE.NearestFilter;
      uploaded.minFilter = THREE.NearestFilter;
      uploaded.generateMipmaps = false;
      uploaded.colorSpace = THREE.SRGBColorSpace;
      uploaded.needsUpdate = true;
      return uploaded;
    });
    this.textures = textures;

    for (const primitive of model.prims) {
      const positions = new THREE.BufferAttribute(new Float32Array(primitive.vertCount * 3), 3);
      const normals = new THREE.BufferAttribute(new Float32Array(primitive.vertCount * 3), 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", positions);
      geometry.setAttribute("normal", normals);
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(primitive.uv, 2));
      geometry.setIndex(primitive.index);
      const material = new THREE.MeshStandardMaterial({
        map: textures[primitive.tex] ?? null,
        side: primitive.cull ? THREE.FrontSide : THREE.DoubleSide,
        transparent: primitive.additive,
        blending: primitive.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: !primitive.additive,
        roughness: 0.86,
        metalness: 0,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.primitiveViews.push({ primitive, mesh, positions, normals, textures });
    }

    const linePositions = new Float32Array(model.boneCount * 6);
    this.bonePositions = new THREE.BufferAttribute(linePositions, 3);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", this.bonePositions);
    this.boneLines = new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({ color: 0xffca67, depthTest: false }),
    );
    this.boneLines.renderOrder = 10;
    this.boneLines.visible = false;
    this.group.add(this.boneLines);
  }

  updatePose(animationIndex: number | null, frame: number, wrap: boolean) {
    const pose = samplePose(this.model, animationIndex, frame, wrap);
    const animation = animationIndex === null ? null : this.model.anims[animationIndex] ?? null;
    const textureIndices = sampleTextureIndices(this.model, animation, pose.frameAt);

    for (let primitiveIndex = 0; primitiveIndex < this.primitiveViews.length; primitiveIndex += 1) {
      const view = this.primitiveViews[primitiveIndex];
      const { primitive, positions, normals, mesh } = view;
      const positionArray = positions.array as Float32Array;
      const normalArray = normals.array as Float32Array;
      for (let vertex = 0; vertex < primitive.vertCount; vertex += 1) {
        const matrixOffset = primitive.bone[vertex] * 12;
        const x = primitive.px[vertex];
        const y = primitive.py[vertex];
        const z = primitive.pz[vertex];
        const positionOffset = vertex * 3;
        positionArray[positionOffset] = pose.draw[matrixOffset] * x
          + pose.draw[matrixOffset + 1] * y
          + pose.draw[matrixOffset + 2] * z
          + pose.draw[matrixOffset + 3];
        positionArray[positionOffset + 1] = pose.draw[matrixOffset + 4] * x
          + pose.draw[matrixOffset + 5] * y
          + pose.draw[matrixOffset + 6] * z
          + pose.draw[matrixOffset + 7];
        positionArray[positionOffset + 2] = pose.draw[matrixOffset + 8] * x
          + pose.draw[matrixOffset + 9] * y
          + pose.draw[matrixOffset + 10] * z
          + pose.draw[matrixOffset + 11];
        const nx = primitive.nx[vertex];
        const ny = primitive.ny[vertex];
        const nz = primitive.nz[vertex];
        normalArray[positionOffset] = pose.pivot[matrixOffset] * nx
          + pose.pivot[matrixOffset + 1] * ny
          + pose.pivot[matrixOffset + 2] * nz;
        normalArray[positionOffset + 1] = pose.pivot[matrixOffset + 4] * nx
          + pose.pivot[matrixOffset + 5] * ny
          + pose.pivot[matrixOffset + 6] * nz;
        normalArray[positionOffset + 2] = pose.pivot[matrixOffset + 8] * nx
          + pose.pivot[matrixOffset + 9] * ny
          + pose.pivot[matrixOffset + 10] * nz;
      }
      positions.needsUpdate = true;
      normals.needsUpdate = true;
      view.mesh.material.map = view.textures[textureIndices[primitiveIndex]] ?? null;
      view.mesh.material.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
    }

    const boneArray = this.bonePositions.array as Float32Array;
    for (let bone = 0; bone < this.model.boneCount; bone += 1) {
      const offset = bone * 12;
      const lineOffset = bone * 6;
      const parent = this.model.parent[bone];
      const childX = pose.draw[offset + 3];
      const childY = pose.draw[offset + 7];
      const childZ = pose.draw[offset + 11];
      const parentOffset = parent >= 0 ? parent * 12 : offset;
      boneArray[lineOffset] = childX;
      boneArray[lineOffset + 1] = childY;
      boneArray[lineOffset + 2] = childZ;
      boneArray[lineOffset + 3] = pose.draw[parentOffset + 3];
      boneArray[lineOffset + 4] = pose.draw[parentOffset + 7];
      boneArray[lineOffset + 5] = pose.draw[parentOffset + 11];
    }
    this.bonePositions.needsUpdate = true;
    this.boneLines.geometry.computeBoundingSphere();
  }

  setWireframe(value: boolean) {
    for (const view of this.primitiveViews) view.mesh.material.wireframe = value;
  }

  setBonesVisible(value: boolean) { this.boneLines.visible = value; }

  dispose() {
    for (const view of this.primitiveViews) {
      view.mesh.geometry.dispose();
      view.mesh.material.dispose();
    }
    for (const texture of this.textures) texture.dispose();
    this.boneLines.geometry.dispose();
    (this.boneLines.material as THREE.Material).dispose();
  }
}

export class ModelScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.01, 10000);
  private readonly controls: OrbitControls;
  private readonly canvas: HTMLCanvasElement;
  private readonly resizeObserver: ResizeObserver;
  private animationFrame = 0;
  private drawable: ModelDrawable | null = null;
  private currentModel: DsmModel | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x10131a, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 1000;

    this.scene.add(new THREE.HemisphereLight(0xb7c9ff, 0x29303d, 2.2));
    const key = new THREE.DirectionalLight(0xfff5dc, 3.2);
    key.position.set(4, 8, 5);
    key.castShadow = true;
    this.scene.add(key);
    const grid = new THREE.GridHelper(10, 20, 0x3a4659, 0x202938);
    grid.position.y = -0.01;
    this.scene.add(grid);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.animationFrame = requestAnimationFrame(this.render);
  }

  private render = () => {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.render);
  };

  private resize() {
    const parent = this.canvas.parentElement;
    const width = Math.max(parent?.clientWidth ?? 1, 1);
    const height = Math.max(parent?.clientHeight ?? 1, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setModel(model: DsmModel | null) {
    if (this.drawable) {
      this.scene.remove(this.drawable.group);
      this.drawable.dispose();
      this.drawable = null;
    }
    this.currentModel = model;
    if (!model) return;
    this.drawable = new ModelDrawable(model);
    this.scene.add(this.drawable.group);
    this.drawable.updatePose(null, 0, false);
    this.resetCamera();
  }

  setPose(animationIndex: number | null, frame: number, loop: boolean) {
    this.drawable?.updatePose(animationIndex, frame, loop);
  }

  setWireframe(value: boolean) { this.drawable?.setWireframe(value); }

  setBonesVisible(value: boolean) { this.drawable?.setBonesVisible(value); }

  resetCamera() {
    const model = this.currentModel;
    if (!model) return;
    const size = 14;
    this.camera.position.set(size * 1.65, size * 0.95, size * 1.65);
    this.controls.target.set(0, size * 0.42, 0);
    this.controls.update();
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    if (this.drawable) this.drawable.dispose();
    this.renderer.dispose();
  }
}
