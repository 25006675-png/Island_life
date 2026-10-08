// The torii every member island is built around (meadow_a/b/c all have it in the same place). The models put it
// inland, up three stone steps; it stands at the shore instead, where the pier begins (main.js buildPier), so
// arriving is simply off the pier and through the gate. moveGate() does that to a loaded model, and everything
// placed by the gate -- its posts, the signpost, the timetable's start, the clearing kept free of trees -- reads
// GATE. Model units (member islands are shown at scale 2).
export const GATE_OUT={x:-.742,z:-.671};              // the way out through the gate, toward the pier
const MODEL_GATE={x:-5.4,z:-5.0}, SHIFT=4.1;           // where the models put it; how far it moves out (shores lie 5-6 out)
export const GATE={x:MODEL_GATE.x+GATE_OUT.x*SHIFT,z:MODEL_GATE.z+GATE_OUT.z*SHIFT};
export const GATE_POSTS=[{x:-6.44,z:-3.85},{x:-4.36,z:-6.15}].map(p=>({x:p.x+GATE_OUT.x*SHIFT,z:p.z+GATE_OUT.z*SHIFT,r:.42}));

export function moveGate(model){
  for(const name of ['Torii','ToriiGlass','ToriiMetal']){
    const o=model.getObjectByName(name);if(o){o.position.x+=GATE_OUT.x*SHIFT;o.position.z+=GATE_OUT.z*SHIFT;}
  }
  model.getObjectByName('ToriiSteps')?.removeFromParent();   // the steps only climbed to where it used to stand
}
