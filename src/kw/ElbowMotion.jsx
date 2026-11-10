import React, { useEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { MousePointer2, Pause, Play, RotateCcw } from 'lucide-react';
import './elbow-motion.css';

const MUSCLES = [
  { name: 'BIClong', label: 'ذات الرأسين · الرأس الطويل', group: 'flexors', color: '#c8f45c' },
  { name: 'BICshort', label: 'ذات الرأسين · الرأس القصير', group: 'flexors', color: '#83d6ac' },
  { name: 'BRA', label: 'العضدية', group: 'flexors', color: '#e5de93' },
  { name: 'TRIlong', label: 'ثلاثية الرؤوس · الرأس الطويل', group: 'extensors', color: '#fa9877' },
  { name: 'TRIlat', label: 'ثلاثية الرؤوس · الرأس الوحشي', group: 'extensors', color: '#e1b69c' },
  { name: 'TRImed', label: 'ثلاثية الرؤوس · الرأس الإنسي', group: 'extensors', color: '#f0ca78' },
];

const SOURCE = 'https://github.com/opensim-org/opensim-models/blob/d9b05d470b1a481c222372c85b75772faf8f7792/Models/Arm26/arm26.osim';
const LICENSE = 'https://creativecommons.org/licenses/by/3.0/';
const BODY_NAMES = ['base', 'r_humerus', 'r_ulna_radius_hand'];

// Local coordinates from the pinned .osim: shoulder and elbow offset frames,
// plus marker r_radius_styloid. Rods only connect these model-defined positions;
// they are not the true outlines of bones, nor is the marker a wrist joint.
const HUMERUS_ELBOW = new THREE.Vector3(0.0061, -0.2904, -0.0123);
const RADIUS_STYLOID = new THREE.Vector3(-0.0011, -0.23559, 0.0943);

function defaultSamplesUrl() {
  const base = import.meta.env.BASE_URL || '/';
  return new URL('arm26_samples.json', new URL(base, document.baseURI)).href;
}

function isPoint(point) {
  return Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
}

function validateSamples(data) {
  if (!data || !Array.isArray(data.frames) || data.frames.length !== 131) throw new Error('Invalid sample count');
  data.frames.forEach((frame, index) => {
    if (frame.elbow_flex_deg !== index) throw new Error('Invalid angle sequence');
    BODY_NAMES.forEach((body) => {
      const matrix = frame.body_to_ground_matrix4?.[body];
      if (!Array.isArray(matrix) || matrix.length !== 4 || matrix.some((row) => !Array.isArray(row) || row.length !== 4 || !row.every(Number.isFinite))) {
        throw new Error('Invalid body transform');
      }
    });
    MUSCLES.forEach(({ name }) => {
      const path = frame.muscles?.[name];
      if (!path || !Array.isArray(path.points_ground_m) || path.points_ground_m.length < 2 || !path.points_ground_m.every(isPoint) || !Number.isFinite(path.opensim_path_length_m) || path.opensim_path_length_m <= 0) {
        throw new Error('Invalid muscle path');
      }
    });
  });
  return data;
}

function makeRod(end, material, geometry) {
  const rod = new THREE.Mesh(geometry, material);
  rod.position.copy(end).multiplyScalar(0.5);
  rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().normalize());
  rod.scale.set(0.0065, end.length(), 0.0065);
  return rod;
}

function disposeScene(scene) {
  const geometries = new Set();
  const materials = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

/** Standalone educational viewer; the host can optionally override the data URL. */
export default function ElbowMotion({ samplesUrl } = {}) {
  const canvasHost = useRef(null);
  const engine = useRef(null);
  const angleRef = useRef(0);
  const [data, setData] = useState(null);
  const [angle, setAngle] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [showFlexors, setShowFlexors] = useState(true);
  const [showExtensors, setShowExtensors] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true);
  const rangeId = useId();
  angleRef.current = angle;

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const update = () => {
      setReducedMotion(query.matches);
      if (query.matches) setPlaying(false);
    };
    update();
    if (query.addEventListener) query.addEventListener('change', update);
    else query.addListener(update);
    return () => {
      if (query.removeEventListener) query.removeEventListener('change', update);
      else query.removeListener(update);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setStatus('loading');
    setError('');
    setData(null);
    setPlaying(false);
    setAngle(0);
    (async () => {
      try {
        const url = samplesUrl ? new URL(samplesUrl, document.baseURI).href : defaultSamplesUrl();
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = validateSamples(await response.json());
        if (active) setData(parsed);
      } catch (exception) {
        if (active && exception?.name !== 'AbortError') {
          setError('تعذّر تحميل عينات الحركة أو التحقق منها. تأكد من وجود ملف البيانات ثم أعد المحاولة.');
          setStatus('error');
        }
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [samplesUrl, retry]);

  useEffect(() => {
    if (!data || !canvasHost.current) return undefined;
    const host = canvasHost.current;
    let active = true;
    let lost = false;
    let scheduled = 0;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (exception) {
      setError('تعذّر تشغيل العرض ثلاثي الأبعاد. تأكد من دعم WebGL في متصفحك ثم أعد المحاولة.');
      setStatus('error');
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'elbow-motion__canvas';
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    const target = new THREE.Vector3(0.085, 0.55, 0.17);
    camera.position.set(0.085, 0.58, 1.65);
    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(target);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.rotateSpeed = 0.75;
    controls.update();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x74816c, 2.3));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(0.4, 1, 1.5);
    scene.add(light);

    const rodMaterial = new THREE.MeshStandardMaterial({ color: '#c5d1bb', roughness: 0.72, metalness: 0.08 });
    const rodGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
    const upper = new THREE.Group();
    const forearm = new THREE.Group();
    upper.matrixAutoUpdate = false;
    forearm.matrixAutoUpdate = false;
    upper.add(makeRod(HUMERUS_ELBOW, rodMaterial, rodGeometry));
    forearm.add(makeRod(RADIUS_STYLOID, rodMaterial, rodGeometry));
    scene.add(upper, forearm);

    const endpointGeometry = new THREE.SphereGeometry(0.004, 10, 8);
    const lines = {};
    MUSCLES.forEach((muscle) => {
      // Reserve enough segments once; each pose writes its actual points and
      // changes instanceCount. A changed wrap path is never interpolated.
      const maxPoints = Math.max(...data.frames.map((frame) => frame.muscles[muscle.name].points_ground_m.length));
      const geometry = new LineGeometry();
      geometry.setPositions(new Float32Array(maxPoints * 3));
      const material = new LineMaterial({ color: muscle.color, linewidth: 2.6, depthTest: false });
      const line = new Line2(geometry, material);
      line.frustumCulled = false;
      line.renderOrder = 1;
      const endpointMaterial = new THREE.MeshBasicMaterial({ color: muscle.color, depthTest: false });
      const first = new THREE.Mesh(endpointGeometry, endpointMaterial);
      const last = new THREE.Mesh(endpointGeometry, endpointMaterial);
      first.renderOrder = last.renderOrder = 2;
      const group = new THREE.Group();
      group.add(line, first, last);
      scene.add(group);
      lines[muscle.name] = { geometry, material, first, last, group };
    });

    function scheduleRender() {
      if (!active || lost || scheduled) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        if (!active || lost) return;
        try { renderer.render(scene, camera); } catch (exception) {
          lost = true;
          setPlaying(false);
          setError('تعذّر عرض الحركة. تحقق من دعم WebGL ثم أعد المحاولة.');
          setStatus('error');
        }
      });
    }
    controls.addEventListener('change', scheduleRender);

    function setFrame(frame) {
      // Three.Matrix4.set takes mathematical rows; both the rods and the
      // ground-space path points are children of the same untransformed scene.
      upper.matrix.set(...frame.body_to_ground_matrix4.r_humerus.flat());
      forearm.matrix.set(...frame.body_to_ground_matrix4.r_ulna_radius_hand.flat());
      upper.matrixWorldNeedsUpdate = true;
      forearm.matrixWorldNeedsUpdate = true;
      MUSCLES.forEach(({ name }) => {
        const points = frame.muscles[name].points_ground_m;
        const item = lines[name];
        const buffer = item.geometry.attributes.instanceStart.data;
        for (let i = 0; i < points.length - 1; i += 1) {
          buffer.array.set(points[i], i * 6);
          buffer.array.set(points[i + 1], i * 6 + 3);
        }
        buffer.needsUpdate = true;
        item.geometry.instanceCount = points.length - 1;
        item.first.position.fromArray(points[0]);
        item.last.position.fromArray(points[points.length - 1]);
      });
      scheduleRender();
    }

    function setVisibility(flexors, extensors) {
      MUSCLES.forEach((muscle) => { lines[muscle.name].group.visible = muscle.group === 'flexors' ? flexors : extensors; });
      scheduleRender();
    }

    function resetView() {
      controls.target.copy(target);
      camera.position.set(0.085, 0.58, 1.65);
      camera.up.set(0, 1, 0);
      controls.update();
      scheduleRender();
    }

    function turnView(direction) {
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * Math.PI / 6);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      scheduleRender();
    }

    function resize() {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      const aspect = width / height;
      // Fit the whole family of sampled poses, including the styloid marker.
      const verticalSpan = Math.max(0.72, 0.65 / aspect);
      camera.left = -verticalSpan * aspect / 2;
      camera.right = verticalSpan * aspect / 2;
      camera.top = verticalSpan / 2;
      camera.bottom = -verticalSpan / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      MUSCLES.forEach(({ name }) => lines[name].material.resolution.set(width, height));
      scheduleRender();
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(host);
    if (!observer) window.addEventListener('resize', resize);

    function onContextLost(event) {
      event.preventDefault();
      lost = true;
      if (scheduled) cancelAnimationFrame(scheduled);
      scheduled = 0;
      setPlaying(false);
      setError('فُقد اتصال WebGL. أعد المحاولة لاستعادة العرض.');
      setStatus('error');
    }
    canvas.addEventListener('webglcontextlost', onContextLost);
    engine.current = { setFrame, setVisibility, resetView, turnView };
    setFrame(data.frames[angleRef.current]);
    setVisibility(showFlexors, showExtensors);
    resize();
    setStatus('ready');

    return () => {
      active = false;
      if (engine.current?.setFrame === setFrame) engine.current = null;
      if (scheduled) cancelAnimationFrame(scheduled);
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      controls.removeEventListener('change', scheduleRender);
      controls.dispose();
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [data]);

  useEffect(() => {
    if (data) engine.current?.setFrame(data.frames[angle]);
  }, [data, angle]);

  useEffect(() => {
    engine.current?.setVisibility(showFlexors, showExtensors);
  }, [data, showFlexors, showExtensors]);

  useEffect(() => {
    if (!playing || reducedMotion || status !== 'ready') return undefined;
    let frame = 0;
    let previous = null;
    let progress = angleRef.current;
    let direction = progress >= 130 ? -1 : 1;
    function tick(time) {
      if (previous !== null) {
        progress += direction * Math.min((time - previous) / 1000, 0.1) * 36;
        if (progress >= 130) { progress = 130; direction = -1; }
        if (progress <= 0) { progress = 0; direction = 1; }
        setAngle(Math.round(progress)); // render one whole, recorded pose
      }
      previous = time;
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, reducedMotion, status]);

  function reset() {
    setPlaying(false);
    setAngle(0);
    engine.current?.resetView();
  }

  const ready = status === 'ready';
  const currentFrame = data?.frames[angle];
  return (
    <section className="elbow-motion" dir="rtl" lang="ar" aria-label="حركة المرفق التعليمية">
      <div className="elbow-motion__heading">
        <div><span className="elbow-motion__eyebrow">مختبر الحركة · OpenSim arm26</span><h2>كيف يتحرك المرفق؟</h2><p>استكشف عينات مسارات ست عضلات مع ثني المرفق في نموذج الذراع الأيمن.</p></div>
        <div className="elbow-motion__heading-badge"><span>نموذج تعليمي</span><strong>01°</strong><small>بين كل عيّنتين</small></div>
      </div>

      <div className="elbow-motion__workspace">
        <div className="elbow-motion__viewer">
          <div className="elbow-motion__stage">
            <div className="elbow-motion__stage-top"><span><i /> عرض تخطيطي</span><span>الكتف ثابت</span></div>
            <div className="elbow-motion__host" ref={canvasHost} />
            {status === 'loading' && <div className="elbow-motion__overlay" role="status">جارٍ تحميل عينات OpenSim…</div>}
            {status === 'error' && <div className="elbow-motion__overlay" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry((value) => value + 1)}>إعادة المحاولة</button></div>}
            <div className="elbow-motion__stage-help"><MousePointer2 size={15} aria-hidden="true" /> اسحب لتدوير العرض</div>
          </div>
          <div className="elbow-motion__controls">
            <div className="elbow-motion__angle-heading"><label htmlFor={rangeId}>زاوية ثني المرفق</label><output htmlFor={rangeId} dir="ltr">{angle}°</output></div>
            <input id={rangeId} type="range" min="0" max="130" step="1" value={angle} disabled={!ready} onChange={(event) => { setPlaying(false); setAngle(Number(event.target.value)); }} aria-valuetext={`${angle} درجة`} />
            <div className="elbow-motion__scale" aria-hidden="true"><span>0°</span><span>65°</span><span>130°</span></div>
            <div className="elbow-motion__buttons">
              <button className="elbow-motion__primary" type="button" disabled={!ready || reducedMotion} onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'إيقاف الحركة مؤقتاً' : 'تشغيل الحركة'}>{playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{playing ? 'إيقاف' : 'تشغيل'}</button>
              <button type="button" disabled={!ready} onClick={reset}><RotateCcw size={16} aria-hidden="true" /> إعادة ضبط</button>
              <div className="elbow-motion__rotate" role="group" aria-label="تدوير زاوية المشاهدة"><button type="button" disabled={!ready} onClick={() => engine.current?.turnView(1)} aria-label="تدوير العرض لليسار">↶</button><button type="button" disabled={!ready} onClick={() => engine.current?.turnView(-1)} aria-label="تدوير العرض لليمين">↷</button></div>
            </div>
            {reducedMotion && <p className="elbow-motion__motion-note">تفضيل تقليل الحركة مفعّل؛ استخدم شريط الزاوية للتنقل يدوياً بين العينات.</p>}
          </div>
        </div>

        <aside className="elbow-motion__legend" aria-label="مسارات العضلات الستة">
          <div className="elbow-motion__legend-heading"><div><span className="elbow-motion__eyebrow">المسارات في النموذج</span><h3>العضلات الست</h3></div><span>الطول بالسنتيمتر</span></div>
          <p>الأرقام لطول المسار الكامل في العينة المختارة، لا لطول بطن العضلة أو نشاطها.</p>
          <div className="elbow-motion__filters" role="group" aria-label="إظهار وإخفاء مجموعات المسارات">
            <button type="button" aria-pressed={showFlexors} onClick={() => setShowFlexors((value) => !value)}>المثنيات {showFlexors ? 'ظاهرة' : 'مخفية'}</button>
            <button type="button" aria-pressed={showExtensors} onClick={() => setShowExtensors((value) => !value)}>الباسطات {showExtensors ? 'ظاهرة' : 'مخفية'}</button>
          </div>
          <ul>{MUSCLES.map((muscle) => {
            const visible = muscle.group === 'flexors' ? showFlexors : showExtensors;
            const length = currentFrame?.muscles[muscle.name].opensim_path_length_m;
            return <li key={muscle.name} className={visible ? '' : 'is-hidden'}><span className="elbow-motion__swatch" style={{ '--path-color': muscle.color }} /><span className="elbow-motion__muscle"><strong>{muscle.label}</strong><small dir="ltr">{muscle.name}</small></span><span className="elbow-motion__length" dir="ltr">{Number.isFinite(length) ? (length * 100).toFixed(2) : '—'}</span></li>;
          })}</ul>
          <p className="elbow-motion__legend-note">النقطتان الملوّنتان عند طرفي كل مسار مأخوذتان من نقاط النموذج؛ بعض النهايات متطابقة وقد تتداخل.</p>
        </aside>
      </div>

      <div className="elbow-motion__disclosure">
        <div><span className="elbow-motion__eyebrow">حدود مهمة</span><h3>للتعلّم فقط، وليس للاستخدام السريري</h3></div>
        <div><p>هذا نموذج حركي مبسّط وليس محاكاة تشريحية كاملة، ولا يحسب القوى أو النشاط العضلي. الكتف ثابت؛ الزند والكعبرة واليد جسم صلب واحد في النموذج، دون مفاصل مستقلة بينها.</p><p>العضلات ممثلة بخطوط مسارات، لا بأشكالها أو أحجامها؛ والقضبان تخطيطية وليست هندسة العظام الحقيقية. ينتهي قضيب الساعد عند علامة الكعبرة في النموذج، لا عند مفصل رسغ مفترض. نهايات المسارات نقاط في نموذج مرجعي وليست قياسات شخصية.</p><p>حُسبت ١٣١ وضعية مستقلة بواسطة OpenSim من ٠° إلى ١٣٠° بفاصل درجة، مع تثبيت الكتف عند ٠°. يعرض الشريط والتشغيل عينات مسجّلة فقط دون استيفاء للمصفوفات أو المسارات بين العينات.</p></div>
      </div>
      <footer className="elbow-motion__sources"><span>المصدر والترخيص</span><p>نموذج <a href={SOURCE} target="_blank" rel="noopener noreferrer">OpenSim arm26</a> من OpenSim Development Team، مقتبس من نموذج Kate Holzbaur، بترخيص <a href={LICENSE} target="_blank" rel="noopener noreferrer">CC BY 3.0</a>. التعديل هنا: أخذ عينات وضعيات ومسارات وتحويل العرض إلى قضبان وخطوط تخطيطية؛ لم تُستخدم شبكات VTP.</p></footer>
    </section>
  );
}
