"use client";
import React, { useRef, useMemo, useEffect, useState } from "react";
import { useFrame, createPortal } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";

interface InvestigatorProps {
  interactive?: boolean;
}

// 5-Point Star 2D Shape for badges
function createStarShape(radius: number, innerRadius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const l = i % 2 === 0 ? radius : innerRadius;
    const a = (i / points) * Math.PI - Math.PI / 2;
    const x = Math.cos(a) * l;
    const y = Math.sin(a) * l;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

// Police Shield Badge 2D Shape
function createShieldShape(width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;

  shape.moveTo(-w * 0.85, h);
  shape.lineTo(w * 0.85, h);
  shape.quadraticCurveTo(w, h * 0.4, w * 0.95, -h * 0.15);
  shape.quadraticCurveTo(w * 0.55, -h * 0.82, 0, -h);
  shape.quadraticCurveTo(-w * 0.55, -h * 0.82, -w * 0.95, -h * 0.15);
  shape.quadraticCurveTo(-w, h * 0.4, -w * 0.85, h);
  shape.closePath();
  return shape;
}

// Sub-component: 8-Point Police Officer Cap with Platinum Badge
function PoliceOfficerCap({ materials }: { materials: Record<string, THREE.Material> }) {
  const starShape = useMemo(() => createStarShape(0.016, 0.007), []);
  const shieldShape = useMemo(() => createShieldShape(0.048, 0.058), []);

  return (
    <group position={[0, 0.165, 0.015]} rotation={[0.04, 0, 0]}>
      {/* 1. Cap Base Band / Sweatband */}
      <mesh position={[0, 0, 0.01]} castShadow receiveShadow>
        <cylinderGeometry args={[0.115, 0.118, 0.038, 32]} />
        <primitive object={materials.capBand} />
      </mesh>

      {/* 2. Cap Flared Crown (8-Point Officer Top) */}
      <mesh position={[0, 0.042, 0.018]} rotation={[0.06, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.152, 0.116, 0.052, 8]} />
        <primitive object={materials.uniformCloth} />
      </mesh>

      {/* 3. Cap Top Crown Plate */}
      <mesh position={[0, 0.068, 0.02]} rotation={[0.06, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.154, 0.152, 0.01, 8]} />
        <primitive object={materials.uniformCloth} />
      </mesh>

      {/* 4. Glossy Patent Leather Visor / Bill */}
      <mesh position={[0, -0.014, 0.108]} rotation={[0.34, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.174, 0.012, 0.082]} />
        <primitive object={materials.glossyVisor} />
      </mesh>
      {/* Visor Beveled Lip */}
      <mesh position={[0, -0.028, 0.142]} rotation={[0.42, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.158, 0.008, 0.022]} />
        <primitive object={materials.glossyVisor} />
      </mesh>

      {/* 5. Braided Chinstrap over Visor Seam */}
      <mesh position={[0, -0.002, 0.104]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[0.182, 0.012, 0.014]} />
        <primitive object={materials.leatherBlack} />
      </mesh>
      {/* Chinstrap Silver Accent Line */}
      <mesh position={[0, -0.001, 0.112]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[0.176, 0.004, 0.004]} />
        <primitive object={materials.platinumSilver} />
      </mesh>

      {/* 6. Chinstrap Side Fastener Buttons (Left & Right) */}
      <mesh position={[-0.108, 0.002, 0.055]} rotation={[0, -Math.PI / 2.8, 0]} castShadow>
        <cylinderGeometry args={[0.009, 0.009, 0.006, 16]} />
        <primitive object={materials.platinumSilver} />
      </mesh>
      <mesh position={[0.108, 0.002, 0.055]} rotation={[0, Math.PI / 2.8, 0]} castShadow>
        <cylinderGeometry args={[0.009, 0.009, 0.006, 16]} />
        <primitive object={materials.platinumSilver} />
      </mesh>

      {/* 7. Front Police Cap Shield Badge */}
      <group position={[0, 0.038, 0.126]} rotation={[-0.08, 0, 0]}>
        {/* Extruded Platinum Shield */}
        <mesh castShadow receiveShadow>
          <extrudeGeometry
            args={[
              shieldShape,
              { depth: 0.006, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.003, bevelThickness: 0.003 },
            ]}
          />
          <primitive object={materials.platinumSilver} />
        </mesh>
        {/* Embossed Inner Star */}
        <mesh position={[0, 0.004, 0.009]} castShadow>
          <extrudeGeometry
            args={[
              starShape,
              { depth: 0.004, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.001, bevelThickness: 0.001 },
            ]}
          />
          <primitive object={materials.platinumHighSpec} />
        </mesh>
      </group>
    </group>
  );
}

// Sub-component: Chest Uniform Embellishments (Badge, Nameplate, Pockets, Placket, Mic)
function UniformChestDetails({ materials }: { materials: Record<string, THREE.Material> }) {
  const starShape = useMemo(() => createStarShape(0.013, 0.006), []);
  const shieldShape = useMemo(() => createShieldShape(0.042, 0.052), []);

  return (
    <group position={[0, 0.024, 0.098]}>
      {/* 1. Center Vertical Button Placket */}
      <mesh position={[0, -0.04, 0.018]} castShadow receiveShadow>
        <boxGeometry args={[0.032, 0.28, 0.01]} />
        <primitive object={materials.uniformDarkTrim} />
      </mesh>
      {/* Placket Shank Buttons (5 Polish Silver Buttons) */}
      {[-0.14, -0.09, -0.04, 0.01, 0.06].map((yOffset, i) => (
        <mesh key={`btn-${i}`} position={[0, yOffset, 0.024]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.0055, 0.0055, 0.005, 16]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
      ))}

      {/* 2. Left Breast Pocket (Pleated Pocket + Scalloped Flap + Official Badge) */}
      <group position={[-0.102, -0.018, 0.015]}>
        {/* Pocket Body */}
        <mesh position={[0, -0.045, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.082, 0.092, 0.012]} />
          <primitive object={materials.uniformCloth} />
        </mesh>
        {/* Center Vertical Pleat Crease */}
        <mesh position={[0, -0.045, 0.007]} castShadow>
          <boxGeometry args={[0.014, 0.09, 0.004]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Scalloped Pocket Flap */}
        <mesh position={[0, 0.005, 0.006]} rotation={[0.08, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.086, 0.028, 0.01]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Flap Silver Button */}
        <mesh position={[0, 0.002, 0.014]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.0045, 0.0045, 0.004, 14]} />
          <primitive object={materials.platinumSilver} />
        </mesh>

        {/* 3D Extruded Platinum Investigator Shield Badge */}
        <group position={[0, 0.038, 0.014]} rotation={[-0.04, 0, 0]}>
          <mesh castShadow receiveShadow>
            <extrudeGeometry
              args={[
                shieldShape,
                { depth: 0.005, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.002, bevelThickness: 0.002 },
              ]}
            />
            <primitive object={materials.platinumSilver} />
          </mesh>
          {/* Centered Star on Badge */}
          <mesh position={[0, 0.003, 0.008]} castShadow>
            <extrudeGeometry
              args={[
                starShape,
                { depth: 0.003, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.001, bevelThickness: 0.001 },
              ]}
            />
            <primitive object={materials.platinumHighSpec} />
          </mesh>
        </group>
      </group>

      {/* 3. Right Breast Pocket (Pleated Pocket + Flap + Silver Nameplate) */}
      <group position={[0.102, -0.018, 0.015]}>
        {/* Pocket Body */}
        <mesh position={[0, -0.045, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.082, 0.092, 0.012]} />
          <primitive object={materials.uniformCloth} />
        </mesh>
        {/* Center Vertical Pleat Crease */}
        <mesh position={[0, -0.045, 0.007]} castShadow>
          <boxGeometry args={[0.014, 0.09, 0.004]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Scalloped Pocket Flap */}
        <mesh position={[0, 0.005, 0.006]} rotation={[0.08, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.086, 0.028, 0.01]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Flap Silver Button */}
        <mesh position={[0, 0.002, 0.014]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.0045, 0.0045, 0.004, 14]} />
          <primitive object={materials.platinumSilver} />
        </mesh>

        {/* Polished Platinum-Silver Engraved Nameplate */}
        <group position={[0, 0.034, 0.012]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.068, 0.016, 0.006]} />
            <primitive object={materials.platinumSilver} />
          </mesh>
          {/* Beveled Edge Highlight */}
          <mesh position={[0, 0, 0.004]} castShadow>
            <boxGeometry args={[0.062, 0.012, 0.002]} />
            <primitive object={materials.platinumHighSpec} />
          </mesh>
        </group>
      </group>

      {/* 4. Left Shoulder Epaulette & Radio Microphone */}
      <group position={[-0.178, 0.105, -0.02]} rotation={[0, 0, -0.22]}>
        {/* Epaulette Strap */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.052, 0.014, 0.125]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Neck Fastener Silver Button */}
        <mesh position={[0.015, 0.009, -0.035]} rotation={[0, 0, 0]} castShadow>
          <cylinderGeometry args={[0.005, 0.005, 0.005, 14]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
        {/* Silver Rank Bars */}
        <mesh position={[-0.008, 0.009, 0.025]} castShadow>
          <boxGeometry args={[0.016, 0.003, 0.006]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
        <mesh position={[-0.008, 0.009, 0.042]} castShadow>
          <boxGeometry args={[0.016, 0.003, 0.006]} />
          <primitive object={materials.platinumSilver} />
        </mesh>

        {/* Tactical Shoulder Lapel Radio Microphone */}
        <group position={[-0.01, 0.022, 0.015]} rotation={[0.2, 0.35, 0]}>
          {/* Mic Head Case */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.026, 0.034, 0.022]} />
            <primitive object={materials.gearBlack} />
          </mesh>
          {/* Speaker Grille */}
          <mesh position={[0, 0, 0.012]} castShadow>
            <boxGeometry args={[0.018, 0.022, 0.003]} />
            <primitive object={materials.gearGrille} />
          </mesh>
          {/* Push-to-Talk Button (PTT) */}
          <mesh position={[-0.014, 0.004, 0]} castShadow>
            <boxGeometry args={[0.005, 0.016, 0.012]} />
            <primitive object={materials.gearCharcoal} />
          </mesh>
        </group>
      </group>

      {/* 5. Right Shoulder Epaulette */}
      <group position={[0.178, 0.105, -0.02]} rotation={[0, 0, 0.22]}>
        {/* Epaulette Strap */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.052, 0.014, 0.125]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Neck Fastener Silver Button */}
        <mesh position={[-0.015, 0.009, -0.035]} castShadow>
          <cylinderGeometry args={[0.005, 0.005, 0.005, 14]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
        {/* Silver Rank Bars */}
        <mesh position={[0.008, 0.009, 0.025]} castShadow>
          <boxGeometry args={[0.016, 0.003, 0.006]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
        <mesh position={[0.008, 0.009, 0.042]} castShadow>
          <boxGeometry args={[0.016, 0.003, 0.006]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
      </group>
    </group>
  );
}

// Sub-component: 360-Degree Duty Belt with Holster, Pouches, Handcuffs, Radio & Belt Keepers
function DutyBeltGear({ materials }: { materials: Record<string, THREE.Material> }) {
  return (
    <group position={[0, 0.162, 0.012]}>
      {/* 1. Contoured Heavy-Duty Leather Belt Loop */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.228, 0.234, 0.058, 36]} />
        <primitive object={materials.leatherDutyBelt} />
      </mesh>

      {/* 2. Front Heavy-Duty Platinum Buckle */}
      <mesh position={[0, 0, 0.236]} castShadow receiveShadow>
        <boxGeometry args={[0.076, 0.068, 0.018]} />
        <primitive object={materials.platinumSilver} />
      </mesh>
      {/* Buckle Inner Bevel */}
      <mesh position={[0, 0, 0.244]} castShadow>
        <boxGeometry args={[0.058, 0.048, 0.006]} />
        <primitive object={materials.leatherDutyBelt} />
      </mesh>

      {/* 3. Front Snap Belt Keepers (Left & Right of Buckle) */}
      {[-0.078, 0.078].map((x, i) => (
        <group key={`keeper-front-${i}`} position={[x, 0, 0.226]}>
          <mesh castShadow>
            <boxGeometry args={[0.022, 0.066, 0.018]} />
            <primitive object={materials.leatherBlack} />
          </mesh>
          {/* Dual Chrome Snaps */}
          <mesh position={[0, 0.018, 0.01]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0035, 0.0035, 0.003, 10]} />
            <primitive object={materials.platinumSilver} />
          </mesh>
          <mesh position={[0, -0.018, 0.01]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0035, 0.0035, 0.003, 10]} />
            <primitive object={materials.platinumSilver} />
          </mesh>
        </group>
      ))}

      {/* 4. Right Hip: Molded Duty Holster with Service Weapon Grip */}
      <group position={[0.222, -0.062, 0.045]} rotation={[0.08, 0, -0.16]}>
        {/* Holster Shell */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.046, 0.158, 0.082]} />
          <primitive object={materials.gearBlack} />
        </mesh>
        {/* Retention Hood / Strap */}
        <mesh position={[0, 0.082, 0]} castShadow>
          <boxGeometry args={[0.052, 0.016, 0.088]} />
          <primitive object={materials.gearCharcoal} />
        </mesh>
        {/* Handgun Grip Angled Naturally Forward */}
        <mesh position={[0, 0.098, -0.015]} rotation={[-0.38, 0, 0]} castShadow>
          <boxGeometry args={[0.028, 0.078, 0.038]} />
          <primitive object={materials.gearCharcoal} />
        </mesh>
      </group>

      {/* 5. Left Hip: Double Magazine Pouch + Tactical Taser Holster */}
      <group position={[-0.224, -0.018, 0.045]} rotation={[0.05, 0, 0.14]}>
        {/* Double Mag Pouch */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.042, 0.086, 0.076]} />
          <primitive object={materials.leatherBlack} />
        </mesh>
        {/* Snaps on Mag Flaps */}
        <mesh position={[-0.022, 0.014, -0.018]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.004, 0.004, 0.004, 12]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
        <mesh position={[-0.022, 0.014, 0.018]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.004, 0.004, 0.004, 12]} />
          <primitive object={materials.platinumSilver} />
        </mesh>

        {/* Taser Carrier */}
        <group position={[0.012, -0.038, 0.058]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.038, 0.094, 0.048]} />
            <primitive object={materials.gearBlack} />
          </mesh>
          {/* High-visibility yellow safety stripe */}
          <mesh position={[-0.02, 0.022, 0]} castShadow>
            <boxGeometry args={[0.003, 0.026, 0.044]} />
            <primitive object={materials.taserYellow} />
          </mesh>
        </group>
      </group>

      {/* 6. Rear of Duty Belt: Handcuff Pouch & Police Radio Receiver */}
      {/* Left-Rear: Double Handcuff Case */}
      <group position={[-0.078, -0.022, -0.222]} rotation={[0.08, 0, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.082, 0.086, 0.044]} />
          <primitive object={materials.leatherBlack} />
        </mesh>
        {/* Twin Silver Snaps */}
        <mesh position={[-0.022, 0.016, -0.024]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0045, 0.0045, 0.004, 12]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
        <mesh position={[0.022, 0.016, -0.024]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0045, 0.0045, 0.004, 12]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
      </group>

      {/* Right-Rear: Tactical Police Radio Unit with Whip Antenna */}
      <group position={[0.092, 0.012, -0.224]} rotation={[0.08, 0, 0]}>
        {/* Main Radio Chassis */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.048, 0.124, 0.042]} />
          <primitive object={materials.gearBlack} />
        </mesh>
        {/* Channel & Volume Dials */}
        <mesh position={[-0.014, 0.068, 0]} castShadow>
          <cylinderGeometry args={[0.006, 0.006, 0.014, 12]} />
          <primitive object={materials.gearCharcoal} />
        </mesh>
        <mesh position={[0.014, 0.068, 0]} castShadow>
          <cylinderGeometry args={[0.005, 0.005, 0.012, 12]} />
          <primitive object={materials.gearCharcoal} />
        </mesh>
        {/* Flexible Whip Rubber Antenna Extending Upward */}
        <mesh position={[0.015, 0.148, 0]} castShadow>
          <cylinderGeometry args={[0.003, 0.004, 0.165, 10]} />
          <primitive object={materials.gearCharcoal} />
        </mesh>
      </group>

      {/* Rear Belt Keepers */}
      {[-0.14, 0.15].map((x, i) => (
        <mesh key={`keeper-rear-${i}`} position={[x, 0, -0.222]} castShadow>
          <boxGeometry args={[0.018, 0.064, 0.016]} />
          <primitive object={materials.leatherBlack} />
        </mesh>
      ))}
    </group>
  );
}

// Main High-Fidelity Rigged 3D Character Component
export default function PoliceInvestigatorModel({ interactive = true }: InvestigatorProps) {
  const rootGroupRef = useRef<THREE.Group>(null);
  
  // Load the organic rigged 3D character mesh and skeletal animations
  const { scene, animations } = useGLTF("/models/police_character.glb");
  const { actions, mixer } = useAnimations(animations, scene);

  // Bones refs for portal mounting
  const [bones, setBones] = useState<{
    head: THREE.Object3D | null;
    chest: THREE.Object3D | null;
    hips: THREE.Object3D | null;
  }>({ head: null, chest: null, hips: null });

  // Custom NEXUS Charcoal Black + Platinum Silver Materials Palette
  const customMaterials = useMemo(() => {
    return {
      // 1. Uniform Cloth: Fine graphite-charcoal weave
      uniformCloth: new THREE.MeshStandardMaterial({
        color: "#22262C",
        roughness: 0.74,
        metalness: 0.08,
      }),
      // 2. Uniform Trim: Deep tailored midnight charcoal
      uniformDarkTrim: new THREE.MeshStandardMaterial({
        color: "#181B20",
        roughness: 0.7,
        metalness: 0.12,
      }),
      // 3. Crisp Officer Shirt
      shirtWhite: new THREE.MeshStandardMaterial({
        color: "#E2E8F0",
        roughness: 0.65,
        metalness: 0.05,
      }),
      // 4. Midnight Tie
      tieMidnight: new THREE.MeshStandardMaterial({
        color: "#121418",
        roughness: 0.48,
        metalness: 0.22,
      }),
      // 5. Stylized Natural Skin
      naturalSkin: new THREE.MeshStandardMaterial({
        color: "#D6A67E",
        roughness: 0.66,
        metalness: 0.02,
      }),
      // 6. Styled Charcoal Hair & Brows
      charcoalHair: new THREE.MeshStandardMaterial({
        color: "#181A1D",
        roughness: 0.85,
        metalness: 0.05,
      }),
      // 7. Platinum Silver (Badges, Buttons, Insignia, Buckles)
      platinumSilver: new THREE.MeshStandardMaterial({
        color: "#D8DEE6",
        roughness: 0.22,
        metalness: 0.94,
      }),
      // 8. High-Spec Platinum Highlights
      platinumHighSpec: new THREE.MeshStandardMaterial({
        color: "#F0F4F8",
        roughness: 0.14,
        metalness: 0.98,
      }),
      // 9. Patent Leather High-Gloss Visor
      glossyVisor: new THREE.MeshStandardMaterial({
        color: "#08090C",
        roughness: 0.12,
        metalness: 0.28,
      }),
      // 10. Cap Band
      capBand: new THREE.MeshStandardMaterial({
        color: "#16191F",
        roughness: 0.68,
        metalness: 0.14,
      }),
      // 11. Duty Belt Leather
      leatherDutyBelt: new THREE.MeshStandardMaterial({
        color: "#121417",
        roughness: 0.46,
        metalness: 0.18,
      }),
      // 12. Accessory Leather
      leatherBlack: new THREE.MeshStandardMaterial({
        color: "#15181C",
        roughness: 0.42,
        metalness: 0.15,
      }),
      // 13. Tactical Polymer Gear
      gearBlack: new THREE.MeshStandardMaterial({
        color: "#0F1114",
        roughness: 0.38,
        metalness: 0.25,
      }),
      gearCharcoal: new THREE.MeshStandardMaterial({
        color: "#1D2024",
        roughness: 0.5,
        metalness: 0.2,
      }),
      gearGrille: new THREE.MeshStandardMaterial({
        color: "#2C3138",
        roughness: 0.6,
        metalness: 0.4,
      }),
      // 14. Taser Safety Accent
      taserYellow: new THREE.MeshStandardMaterial({
        color: "#EAB308",
        roughness: 0.35,
        metalness: 0.1,
      }),
    };
  }, []);

  // Prepare and recolor character meshes & link skeleton bones
  useEffect(() => {
    if (!scene) return;

    // Repaint model meshes to Charcoal Black & Platinum Silver uniform palette
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Hide detached weapon mesh from hand so our molded holster is primary
        if (mesh.name === "Pistol" || mesh.name.includes("Pistol")) {
          mesh.visible = false;
        }

        // Remap materials cleanly
        if (mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          const matName = mat.name;

          if (matName === "Suit") {
            mesh.material = customMaterials.uniformCloth;
          } else if (matName === "White") {
            mesh.material = customMaterials.shirtWhite;
          } else if (matName === "Tie") {
            mesh.material = customMaterials.tieMidnight;
          } else if (matName === "Skin") {
            mesh.material = customMaterials.naturalSkin;
          } else if (matName === "Hair" || matName === "Eyebrows") {
            mesh.material = customMaterials.charcoalHair;
          } else if (matName === "Black") {
            mesh.material = customMaterials.leatherBlack;
          } else if (matName === "Grey") {
            mesh.material = customMaterials.platinumSilver;
          }
        }
      }
    });

    // Locate target bones for mounting accessories
    const head = scene.getObjectByName("Head");
    const chest = scene.getObjectByName("Chest");
    const hips = scene.getObjectByName("Hips");

    setBones({ head: head || null, chest: chest || null, hips: hips || null });

    // Start idle animation smoothly
    if (actions) {
      const idleClip = actions["Idle_Neutral"] || actions["Idle"] || Object.values(actions)[0];
      if (idleClip) {
        idleClip.reset().fadeIn(0.6).play();
        idleClip.setEffectiveTimeScale(0.85); // Calm, professional breathing pace
      }
    }
  }, [scene, actions, customMaterials]);

  // Gentle micro-sway for subtle organic life
  useFrame((state) => {
    if (!rootGroupRef.current) return;
    const t = state.clock.getElapsedTime();
    // Micro-sway (0.015 rad = ~0.8 degrees)
    rootGroupRef.current.rotation.y = Math.sin(t * 0.45) * 0.018;
  });

  return (
    <group ref={rootGroupRef} position={[0, -1.35, 0]} scale={1.55}>
      {/* 1. Rigged Organic Human 3D Character Mesh */}
      <primitive object={scene} />

      {/* 2. Police Cap Portal (Anchored directly to Head Bone) */}
      {bones.head && createPortal(<PoliceOfficerCap materials={customMaterials} />, bones.head)}

      {/* 3. Police Uniform Chest Details Portal (Badge, Nameplate, Pockets, Epaulettes, Mic) */}
      {bones.chest && createPortal(<UniformChestDetails materials={customMaterials} />, bones.chest)}

      {/* 4. Full 360-Degree Duty Belt Gear Portal (Holster, Taser, Handcuffs, Radio, Buckle) */}
      {bones.hips && createPortal(<DutyBeltGear materials={customMaterials} />, bones.hips)}
    </group>
  );
}

// Preload the rigged character model
useGLTF.preload("/models/police_character.glb");
