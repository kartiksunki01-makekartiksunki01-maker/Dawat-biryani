# Dawat Anna — the virtual host

## What is included

`src/components/character/AnnaModel.tsx` builds a stylised South Indian host entirely in code (white shirt, gold-bordered mundu, beard, tilak, gold chains, kada and watch, sandals), based on the supplied reference image.

The model is a real joint hierarchy — waist → torso → neck/head, shoulders → elbows → hands — so the gestures are genuine procedural animation:

| Trigger | Gesture | Line |
|---|---|---|
| After the intro (once per session) | Namaste | "Namaskaram! Welcome to Dawat Biryani House." |
| Menu enters view (once) | Point | "Anna recommends exploring our Chicken Dum Biryani!" |
| Bulk orders enters view (once) | Present a plate | "Planning a family function? Check our bulk-order options." |
| Item added to the order | Celebrate | "Excellent choice! Your Dawat is getting ready." |
| Enquiry sent | Thank-you bow | "Thank you! See you at Dawat Biryani House." |
| *Talk to Anna* button | Wave / point / present / namaste | Cycles through helpful lines |

Idle breathing, gentle head movement and blinking run continuously (disabled with reduced motion).

Dawat Anna is presented as a **fictional** host — not the restaurant owner.

## The supplied ZIP

`south-indian-men-traditional-fit.zip` was referenced in the brief but was not attached, so it could not be inspected or bundled. To use a GLB/GLTF model instead:

1. Put the file (and its textures) in `public/assets/models/`, e.g. `anna.glb`.
2. In `AnnaCanvas.tsx`, load it with Drei's `useGLTF(asset('assets/models/anna.glb'))` and `useAnimations(animations, ref)`.
3. Map clip names to gestures (`idle`, `namaste`, `wave`, `point`, `present`, `celebrate`, `thanks`) and play the clip matching `useHost().gesture.name`, falling back to `idle`.
4. If the model has no skeleton/clips, keep the procedural body motion (bob, sway, bow) on the whole model and rely on the speech bubbles — don't describe it as skeletal animation.
5. For FBX/OBJ, convert to GLB first (Blender → File → Export → glTF 2.0) and compress textures (e.g. `gltf-transform optimize`).
