import React, { useEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const buttonStyle = {
  minHeight: 42,
  padding: '8px 12px',
  border: '1px solid #52634d',
  borderRadius: 9,
  background: '#26342a',
  color: '#f0f5ec',
  font: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

// A GLTF can share geometry, materials, textures and skeletons between meshes.
function disposeModel(gltf) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const skeletons = new Set();
  const roots = gltf.scenes?.length ? gltf.scenes : [gltf.scene];
  roots.forEach((root) => root?.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.skeleton) skeletons.add(object.skeleton);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => materials.add(material));
  }));
  materials.forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value?.isTexture) textures.add(value);
    });
    material.dispose();
  });
  const images = new Set();
  textures.forEach((texture) => {
    if (texture.source?.data?.close) images.add(texture.source.data);
    texture.dispose();
  });
  images.forEach((image) => image.close());
  geometries.forEach((geometry) => geometry.dispose());
  skeletons.forEach((skeleton) => skeleton.dispose());
}

function decoderPath() {
  // BASE_URL is '/' for a normal Vite build and can be './' or '/subpath/'
  // for Capacitor and deployments under a prefix.
  const base = import.meta.env.BASE_URL || '/';
  return new URL('draco/', new URL(base, document.baseURI)).href;
}

function isVisibleThroughParents(object) {
  for (let node = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

/**
 * onReady receives searchable muscle/bone records. The same record instances
 * are passed to onSelect; IDs remain stable for the lifetime of one load.
 * Actions may be repeated by changing nonce. A pending action is applied
 * once the model has loaded, without reloading it for other prop changes.
 */
export default function AnatomyCanvas({ modelUrl, mode = 'all', onSelect, onReady, action }) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const propsRef = useRef({ mode, onSelect, onReady, action });
  propsRef.current = { mode, onSelect, onReady, action };
  const pendingActionRef = useRef(null);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [selected, setSelected] = useState(null);
  const descriptionId = useId();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let active = true;
    let contextLost = false;
    let frame = 0;
    let loadedModel = null;
    const abortController = new AbortController();
    setStatus('loading');
    setErrorMessage('');
    setSelected(null);
    propsRef.current.onReady?.([]);
    propsRef.current.onSelect?.(null);
    pendingActionRef.current = propsRef.current.action || null;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (error) {
      setErrorMessage('تعذّر تشغيل العرض ثلاثي الأبعاد. تأكد من دعم WebGL في جهازك أو متصفحك ثم أعد المحاولة.');
      setStatus('error');
      return () => { active = false; };
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.style.position = 'relative';
    container.appendChild(renderer.domElement);

    // Some embedded browser compositors show an incomplete WebGL frame even
    // though the drawing buffer contains the full model. Present a 2D copy
    // synchronously after rendering while keeping pointer input on WebGL.
    const displayCanvas = document.createElement('canvas');
    let displayContext = displayCanvas.getContext('2d');
    if (displayContext) {
      displayCanvas.setAttribute('aria-hidden', 'true');
      displayCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
      renderer.domElement.style.opacity = '0';
      container.appendChild(displayCanvas);
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.001, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enablePan = false;
    controls.rotateSpeed = 0.8;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = Math.PI - 0.02;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x889b88, 2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.9);
    fillLight.position.set(-4, 1, -3);
    scene.add(fillLight);

    const loadingManager = new THREE.LoadingManager();
    const dracoLoader = new DRACOLoader(loadingManager);
    dracoLoader.setDecoderPath(decoderPath());
    const loader = new GLTFLoader(loadingManager);
    loader.setDRACOLoader(dracoLoader);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const meshes = [];
    const recordsById = new Map();
    const recordsByMesh = new WeakMap();
    let selectedMesh = null;
    let originalMaterial = null;
    let highlightMaterials = [];
    let center = new THREE.Vector3();
    let size = new THREE.Vector3(1, 1, 1);
    let fitDistance = 3;
    let currentMode = propsRef.current.mode;
    let pointerStart = null;
    const pointers = new Set();

    function scheduleRender() {
      if (!active || contextLost || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!active || contextLost) return;
        try {
          controls.update();
          renderer.render(scene, camera);
          if (displayContext) {
            try {
              displayContext.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
              displayContext.drawImage(renderer.domElement, 0, 0);
            } catch {
              // Keep the original WebGL surface usable if presentation fails.
              displayCanvas.remove();
              displayContext = null;
              renderer.domElement.style.opacity = '1';
            }
          }
        } catch (error) {
          contextLost = true;
          propsRef.current.onReady?.([]);
          propsRef.current.onSelect?.(null);
          setErrorMessage('تعذّر عرض النموذج ثلاثي الأبعاد. تحقق من دعم WebGL ثم أعد المحاولة.');
          setStatus('error');
        }
      });
    }
    controls.addEventListener('change', scheduleRender);

    function restoreSelection() {
      if (selectedMesh) selectedMesh.material = originalMaterial;
      highlightMaterials.forEach((material) => material.dispose());
      selectedMesh = null;
      originalMaterial = null;
      highlightMaterials = [];
    }

    function selectMesh(mesh) {
      restoreSelection();
      const record = mesh ? recordsByMesh.get(mesh) : null;
      if (record) {
        selectedMesh = mesh;
        originalMaterial = mesh.material;
        const originals = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
        highlightMaterials = originals.map((material) => {
          const highlight = material.clone();
          if (highlight.color) highlight.color.set('#c8f45c');
          if (highlight.emissive) {
            highlight.emissive.set('#304c08');
            highlight.emissiveIntensity = 0.7;
          }
          if ('map' in highlight) highlight.map = null;
          if ('vertexColors' in highlight) highlight.vertexColors = false;
          return highlight;
        });
        mesh.material = Array.isArray(originalMaterial) ? highlightMaterials : highlightMaterials[0];
      }
      setSelected(record || null);
      propsRef.current.onSelect?.(record || null);
      scheduleRender();
    }

    function applyMode(nextMode) {
      currentMode = ['all', 'muscle', 'bone'].includes(nextMode) ? nextMode : 'all';
      // Layers filter individual drawables, not whole subtrees: a nested mesh
      // of the requested type remains visible even if its parent is a mesh.
      meshes.forEach((mesh) => {
        const type = mesh.userData.type;
        const categorized = type === 'muscle' || type === 'bone';
        if (categorized && (currentMode === 'all' || type === currentMode)) mesh.layers.enable(0);
        else mesh.layers.disable(0);
      });
      scheduleRender();
    }

    function recalculateFit() {
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const verticalDistance = (size.y / 2) / Math.tan(verticalFov / 2);
      const horizontalDistance = (Math.max(size.x, size.z) / 2) / Math.tan(horizontalFov / 2);
      fitDistance = Math.max(verticalDistance, horizontalDistance) * 1.18 + Math.max(size.x, size.z) / 2;
      const dimension = Math.max(size.x, size.y, size.z, 0.001);
      controls.minDistance = dimension * 0.12;
      controls.maxDistance = Math.max(dimension * 8, fitDistance * 3);
      camera.near = Math.max(dimension / 2000, 0.0001);
      camera.far = controls.maxDistance + dimension * 5;
      camera.updateProjectionMatrix();
    }

    function stopInertia() {
      const damping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = damping;
    }

    function orient(direction, resetDistance = false) {
      stopInertia();
      const distance = resetDistance ? fitDistance : THREE.MathUtils.clamp(camera.position.distanceTo(controls.target), controls.minDistance, controls.maxDistance);
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(direction, distance);
      camera.up.set(0, 1, 0);
      controls.update();
      scheduleRender();
    }

    function runAction(command) {
      if (!command || !loadedModel || contextLost) return false;
      switch (command.type) {
        case 'front': orient(new THREE.Vector3(0, 0, 1)); break;
        case 'back': orient(new THREE.Vector3(0, 0, -1)); break;
        // For this model +X is the anatomical left side.
        case 'left': orient(new THREE.Vector3(1, 0, 0)); break;
        case 'reset': orient(new THREE.Vector3(0, 0, 1), true); break;
        case 'zoomIn':
        case 'zoomOut': {
          stopInertia();
          const offset = camera.position.clone().sub(controls.target);
          const factor = command.type === 'zoomIn' ? 0.8 : 1.25;
          const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
          camera.position.copy(controls.target).add(offset.setLength(distance));
          controls.update();
          scheduleRender();
          break;
        }
        case 'select': selectMesh(recordsById.get(command.id)?.mesh || null); break;
        default: break;
      }
      return true;
    }

    function resize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      if (displayContext) {
        displayCanvas.width = renderer.domElement.width;
        displayCanvas.height = renderer.domElement.height;
      }
      if (loadedModel) {
        const previousFit = fitDistance;
        const offset = camera.position.clone().sub(controls.target);
        recalculateFit();
        const distance = THREE.MathUtils.clamp(offset.length() * fitDistance / previousFit, controls.minDistance, controls.maxDistance);
        camera.position.copy(controls.target).add(offset.setLength(distance));
        controls.update();
      }
      scheduleRender();
    }
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(container);
    if (!resizeObserver) window.addEventListener('resize', resize);
    resize();

    function onPointerDown(event) {
      pointers.add(event.pointerId);
      if (pointers.size === 1 && (event.pointerType !== 'mouse' || event.button === 0)) {
        pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
      } else {
        pointerStart = null;
      }
    }
    function onPointerMove(event) {
      if (pointerStart && event.pointerId === pointerStart.id && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 7) pointerStart = null;
    }
    function onPointerUp(event) {
      pointers.delete(event.pointerId);
      if (!pointerStart || event.pointerId !== pointerStart.id || !loadedModel || contextLost) return;
      const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
      pointerStart = null;
      if (moved > 7) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      // THREE.Raycaster does not automatically skip hidden parents or layers.
      const visibleMeshes = meshes.filter((mesh) => mesh.layers.test(camera.layers) && isVisibleThroughParents(mesh));
      const hit = raycaster.intersectObjects(visibleMeshes, false)[0];
      selectMesh(hit?.object || null);
    }
    function onPointerCancel(event) {
      pointers.delete(event.pointerId);
      pointerStart = null;
    }
    function onContextLost(event) {
      event.preventDefault();
      contextLost = true;
      propsRef.current.onReady?.([]);
      propsRef.current.onSelect?.(null);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      setErrorMessage('فُقد اتصال WebGL. أعد المحاولة لاستعادة العرض ثلاثي الأبعاد.');
      setStatus('error');
    }
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('webglcontextlost', onContextLost);
    engineRef.current = { applyMode, runAction };

    async function loadModel() {
      try {
        if (!modelUrl) throw new Error('Missing model URL');
        const url = new URL(modelUrl, document.baseURI);
        const response = await fetch(url.href, { signal: abortController.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        if (data.byteLength < 4 || new DataView(data).getUint32(0, true) !== 0x46546c67) throw new Error('Invalid GLB file');
        if (!active) return;
        const gltf = await loader.parseAsync(data, new URL('.', url).href);
        if (!active) {
          disposeModel(gltf);
          return;
        }
        loadedModel = gltf;
        scene.add(gltf.scene);
        gltf.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        if (box.isEmpty()) throw new Error('The model contains no visible geometry');
        center = box.getCenter(new THREE.Vector3());
        size = box.getSize(new THREE.Vector3());
        const records = [];
        gltf.scene.traverse((object) => {
          if (!object.isMesh) return;
          meshes.push(object);
          const data = object.userData || {};
          if (data.type !== 'muscle' && data.type !== 'bone') return;
          const record = {
            id: object.uuid,
            name: data.name || object.name || 'جزء دون اسم',
            detail: data.nameDetail || '',
            type: data.type,
            wikiLink: data.wikiLink || '',
          };
          records.push(record);
          recordsById.set(record.id, { mesh: object, record });
          recordsByMesh.set(object, record);
        });
        applyMode(propsRef.current.mode);
        recalculateFit();
        orient(new THREE.Vector3(0, 0, 1), true);
        if (!contextLost) setStatus('ready');
        propsRef.current.onReady?.(records);
        if (pendingActionRef.current) {
          const pending = pendingActionRef.current;
          pendingActionRef.current = null;
          runAction(pending);
        }
        scheduleRender();
      } catch (error) {
        if (active && !contextLost && error?.name !== 'AbortError') {
          propsRef.current.onReady?.([]);
          propsRef.current.onSelect?.(null);
          setErrorMessage('تعذّر تحميل نموذج التشريح. تحقق من الاتصال ورابط النموذج ثم أعد المحاولة.');
          setStatus('error');
        }
      } finally {
        // Also dispose if a decoder library finished loading during teardown.
        if (!active) dracoLoader.dispose();
      }
    }
    loadModel();

    return () => {
      active = false;
      abortController.abort();
      loadingManager.abort();
      if (engineRef.current?.runAction === runAction) engineRef.current = null;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      controls.removeEventListener('change', scheduleRender);
      controls.dispose();
      restoreSelection();
      if (loadedModel) disposeModel(loadedModel);
      dracoLoader.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      displayCanvas.remove();
    };
  }, [modelUrl, retry]);

  useEffect(() => {
    engineRef.current?.applyMode(mode);
  }, [mode]);

  useEffect(() => {
    if (!action) return;
    pendingActionRef.current = action;
    // Commands before loading stay pending; a command that ran is consumed.
    if (engineRef.current?.runAction(action)) pendingActionRef.current = null;
  }, [action?.type, action?.id, action?.nonce]);

  const buttons = [
    ['front', 'أمام'], ['back', 'خلف'], ['left', 'الجانب الأيسر'],
    ['zoomIn', 'تكبير'], ['zoomOut', 'تصغير'], ['reset', 'إعادة العرض'],
  ];

  return (
    <section dir="rtl" lang="ar" aria-label="عارض تشريح الجسم ثلاثي الأبعاد" aria-describedby={descriptionId} style={{ width: '100%', minWidth: 0 }}>
      <div style={{ position: 'relative', height: 'min(65vh, 620px)', minHeight: 340, overflow: 'hidden', borderRadius: 14, background: '#141d17', border: '1px solid #354438' }}>
        <div ref={containerRef} aria-hidden="true" style={{ width: '100%', height: '100%' }} />
        {status === 'loading' && <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#e4eddf', background: '#141d17e8', padding: 20, textAlign: 'center' }}>جارٍ تحميل نموذج التشريح…</div>}
        {status === 'error' && <div role="alert" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: '#fff', background: '#141d17f5', padding: 24, textAlign: 'center' }}><span>{errorMessage}</span><button type="button" style={buttonStyle} onClick={() => setRetry((value) => value + 1)}>إعادة المحاولة</button></div>}
      </div>
      <div role="group" aria-label="التحكم باتجاه النموذج وتكبيره" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {buttons.map(([type, label]) => <button key={type} type="button" style={buttonStyle} disabled={status !== 'ready'} onClick={() => engineRef.current?.runAction({ type })}>{label}</button>)}
      </div>
      <p id={descriptionId} style={{ color: '#b8c8b7', fontSize: 12, lineHeight: 1.8, margin: '10px 0 0' }}>اسحب أو المس لتدوير النموذج، واستخدم عجلة الفأرة أو إصبعين للتكبير والتصغير. اضغط على جزء لتحديده، أو استخدم قائمة الأجزاء المتاحة في الصفحة. يمكن أيضًا استخدام أزرار الاتجاه والتكبير.</p>
      <p aria-live="polite" style={{ color: '#dce8d3', fontSize: 12, margin: '5px 0 0' }}>{selected ? `الجزء المحدد: ${selected.name}${mode !== 'all' && selected.type !== mode ? ' (مخفي في العرض الحالي)' : ''}` : 'لم يُحدد جزء بعد.'}</p>
    </section>
  );
}
