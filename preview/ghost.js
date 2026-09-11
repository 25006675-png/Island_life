import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createAtmosphere } from '../src/atmosphere.js';
import { CATEGORIES } from '../src/data.js';
import { SPECIES } from '../src/groves.js';
import { ghostMaterial } from '../src/forest.js';

// Preview for ghost trees (PRODUCT.md): a planned activity stands as a
// translucent glass version of its species. Left: the tree as it is when
// done; right: its ghost. ?tree=purple (or oak, palm, willow, pale,
// magic_mushrooms) previews another species.
const key = new URLSearchParams(location.search).get('tree') ?? 'sakura';
const cat = Object.keys(SPECIES).find(c => SPECIES[c] === key);
const tint = new T.Color(CATEGORIES[cat]?.color ?? '#ffffff');


const canvas = document.querySelector('canvas');
const renderer = new T.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = .95;
renderer.shadowMap.enabled = true;

const scene = new T.Scene();
const camera = new T.PerspectiveCamera(40, innerWidth / innerHeight, .1, 2000);
camera.position.set(0, 6, 18);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 4, 0);
controls.enableDamping = true;
controls.update();

// Same sky and lights as the islands (main.js init).
const atmosphere = createAtmosphere(scene);
atmosphere.setTone('peach');
scene.add(new T.HemisphereLight('#fff2d4', '#8d92aa', 1.15));
const sun = new T.DirectionalLight('#ffdeb2', 2.0);
sun.position.set(-45, 65, 25); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, far: 180 });
scene.add(sun);
const fill = new T.DirectionalLight('#bcd9e5', .9); fill.position.set(20, 20, -30); scene.add(fill);
const ground = new T.Mesh(new T.CircleGeometry(16, 64).rotateX(-Math.PI / 2),
  new T.MeshStandardMaterial({ color: '#b9c98c', roughness: .95 }));
ground.receiveShadow = true;
scene.add(ground);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new T.Vector2(innerWidth / 2, innerHeight / 2), .35, .6, .85));
composer.addPass(new OutputPass());

const solid = (await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/${key}.glb`)).scene;
solid.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.material.side = T.DoubleSide; } });
const ghost = solid.clone(true);
const mat = ghostMaterial(tint);
ghost.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
solid.position.x = -5.5;
ghost.position.x = 5.5;
// what the ghost becomes once it has taken root
const rooted = solid.clone(true);
rooted.position.x = 5.5;
rooted.visible = false;
scene.add(solid, ghost, rooted);
mat.uniforms.uHeight.value = new T.Box3().setFromObject(solid).getSize(new T.Vector3()).y;

// "Mark done": the ghost takes root, exactly as on the islands (forest.js).
const button = Object.assign(document.createElement('button'), { textContent: 'Mark done' });
Object.assign(button.style, { position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
  padding: '10px 20px', border: 0, borderRadius: '999px', background: '#3b3450', color: '#fff', font: 'inherit', cursor: 'pointer' });
document.body.append(button);
let rooting = -1;
button.onclick = () => {
  if (rooting >= 0) return;
  if (!ghost.visible) { ghost.visible = true; rooted.visible = false; mat.uniforms.uFill.value = 0; button.textContent = 'Mark done'; return; }
  rooting = 0; mat.depthWrite = true;
};

const tags = [[solid, document.getElementById('tag-solid')], [ghost, document.getElementById('tag-ghost')]];
const v = new T.Vector3();
let last = 0;
renderer.setAnimationLoop(t => {
  const dt = Math.min((t - last) / 1000, .05); last = t;
  if (rooting >= 0) {
    rooting = Math.min(1, rooting + dt / 2.6);
    mat.uniforms.uFill.value = 1 - Math.pow(1 - rooting, 2);
    // once full, the real tree takes the ghost's place
    if (rooting >= 1) { rooting = -1; mat.depthWrite = false; ghost.visible = false; rooted.visible = true; button.textContent = 'Show the ghost again'; }
  }
  controls.update();
  atmosphere.update(t / 1000);
  for (const [obj, el] of tags) {
    v.copy(obj.position).setY(-.6).project(camera);
    el.style.left = `${(v.x * .5 + .5) * innerWidth}px`;
    el.style.top = `${(-v.y * .5 + .5) * innerHeight}px`;
  }
  composer.render();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});
window.ghostReady = true;
