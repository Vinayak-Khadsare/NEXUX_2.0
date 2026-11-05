"use client";
import React, { useRef, useMemo, useEffect, useState } from "react";
import { useFrame, createPortal } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";

interface InvestigatorProps {
  interactive?: boolean;
}

// 5-Point Star 2D Shape generator
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

// Police Shield Badge 2D Shape with flared crest
function createShieldShape(width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;

  shape.moveTo(-w * 0.88, h);
  shape.lineTo(w * 0.88, h);
  shape.quadraticCurveTo(w * 1.02, h * 0.38, w * 0.94, -h * 0.16);
  shape.quadraticCurveTo(w * 0.52, -h * 0.84, 0, -h);
  shape.quadraticCurveTo(-w * 0.52, -h * 0.84, -w * 0.94, -h * 0.16);
  shape.quadraticCurveTo(-w * 1.02, h * 0.38, -w * 0.88, h);
  shape.closePath();
  return shape;
}

// Sub-component: Natural Stylized Eyelids for lifelike blinking
function StylizedEyelids({
  blinkProgress,
  materials,
}: {
  blinkProgress: number; // 0 = fully open, 1 = fully closed
  materials: Record<string, THREE.Material>;
}) {
  // Eye coordinates in Head bone space: left x=-0.038, right x=0.038, y=0.108, z=0.103
  const yPos = 0.117 - blinkProgress * 0.009;
  const scaleY = 0.08 + blinkProgress * 0.92;

  return (
    <group position={[0, 0, 0.002]}>
      {/* Left Eyelid */}
      <mesh position={[-0.038, yPos, 0.104]} scale={[1, scaleY, 1]} castShadow>
        <boxGeometry args={[0.026, 0.016, 0.006]} />
        <primitive object={materials.naturalSkin} />
      </mesh>
      {/* Right Eyelid */}
      <mesh position={[0.038, yPos, 0.104]} scale={[1, scaleY, 1]} castShadow>
        <boxGeometry args={[0.026, 0.016, 0.006]} />
        <primitive object={materials.naturalSkin} />
      </mesh>
    </group>
  );
}

// Sub-component: 8-Point Police Officer Cap with Fluted Crest & Platinum Badge
function PoliceOfficerCap({ materials }: { materials: Record<string, THREE.Material> }) {
  const starShape = useMemo(() => createStarShape(0.017, 0.0075), []);
  const shieldShape = useMemo(() => createShieldShape(0.052, 0.062), []);

  return (
    <group position={[0, 0.168, 0.015]} rotation={[0.045, 0, 0]}>
      {/* 1. Cap Base Band / Sweatband (#20252A Dark Details) */}
      <mesh position={[0, 0, 0.01]} castShadow receiveShadow>
        <cylinderGeometry args={[0.118, 0.121, 0.038, 32]} />
        <primitive object={materials.uniformDarkTrim} />
      </mesh>

      {/* 2. Cap Flared Crown (Graphite Charcoal #3A4148 with 8-point officer bevels) */}
      <mesh position={[0, 0.044, 0.018]} rotation={[0.06, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.156, 0.118, 0.054, 8]} />
        <primitive object={materials.uniformCloth} />
      </mesh>

      {/* 3. Cap Top Crown Plate with tailored seam edge */}
      <mesh position={[0, 0.071, 0.02]} rotation={[0.06, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.158, 0.156, 0.01, 8]} />
        <primitive object={materials.uniformCloth} />
      </mesh>

      {/* 4. Glossy Patent Leather Visor / Bill (#0C0E12) */}
      <mesh position={[0, -0.014, 0.11]} rotation={[0.35, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.176, 0.012, 0.084]} />
        <primitive object={materials.glossyVisor} />
      </mesh>
      {/* Visor Beveled Lip */}
      <mesh position={[0, -0.029, 0.145]} rotation={[0.42, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.162, 0.008, 0.024]} />
        <primitive object={materials.glossyVisor} />
      </mesh>

      {/* 5. Chinstrap over Visor Seam (#20252A with #C7CDD4 Silver Trim Line) */}
      <mesh position={[0, -0.002, 0.106]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[0.184, 0.012, 0.014]} />
        <primitive object={materials.uniformDarkTrim} />
      </mesh>
      <mesh position={[0, -0.001, 0.114]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[0.178, 0.0035, 0.004]} />
        <primitive object={materials.platinumSilver} />
      </mesh>

      {/* 6. Chinstrap Side Fastener Buttons (Left & Right Platinum Silver #C7CDD4) */}
      <mesh position={[-0.11, 0.002, 0.056]} rotation={[0, -Math.PI / 2.8, 0]} castShadow>
        <cylinderGeometry args={[0.009, 0.009, 0.006, 16]} />
        <primitive object={materials.platinumSilver} />
      </mesh>
      <mesh position={[0.11, 0.002, 0.056]} rotation={[0, Math.PI / 2.8, 0]} castShadow>
        <cylinderGeometry args={[0.009, 0.009, 0.006, 16]} />
        <primitive object={materials.platinumSilver} />
      </mesh>

      {/* 7. Front Police Cap Shield Badge with 5-Point Star & Eagle Crest (#C7CDD4) */}
      <group position={[0, 0.04, 0.13]} rotation={[-0.08, 0, 0]}>
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
        {/* Eagle Crest / Top Arch Header */}
        <mesh position={[0, 0.034, 0.005]} castShadow>
          <boxGeometry args={[0.044, 0.008, 0.004]} />
          <primitive object={materials.platinumHighSpec} />
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

// Sub-component: Chest Uniform Details (Graphite Charcoal #3A4148 with Dark Details #20252A and Platinum #C7CDD4)
function UniformChestDetails({ materials }: { materials: Record<string, THREE.Material> }) {
  const starShape = useMemo(() => createStarShape(0.014, 0.0065), []);
  const shieldShape = useMemo(() => createShieldShape(0.044, 0.054), []);

  return (
    <group position={[0, 0.024, 0.098]}>
      {/* 1. Center Vertical Button Placket (#20252A Dark Details) */}
      <mesh position={[0, -0.04, 0.018]} castShadow receiveShadow>
        <boxGeometry args={[0.034, 0.28, 0.01]} />
        <primitive object={materials.uniformDarkTrim} />
      </mesh>
      {/* 5 Polished Platinum-Silver (#C7CDD4) Shank Buttons */}
      {[-0.14, -0.09, -0.04, 0.01, 0.06].map((yOffset, i) => (
        <mesh key={`btn-${i}`} position={[0, yOffset, 0.024]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.0055, 0.0055, 0.005, 16]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
      ))}

      {/* 2. Left Breast Pocket (Pleated Body #3A4148 + Flap #20252A + Platinum Shield Badge #C7CDD4) */}
      <group position={[-0.104, -0.018, 0.015]}>
        {/* Pocket Body in Graphite Charcoal #3A4148 */}
        <mesh position={[0, -0.045, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.084, 0.092, 0.012]} />
          <primitive object={materials.uniformCloth} />
        </mesh>
        {/* Center Vertical Pleat Crease */}
        <mesh position={[0, -0.045, 0.007]} castShadow>
          <boxGeometry args={[0.014, 0.09, 0.004]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Scalloped Pocket Flap in #20252A */}
        <mesh position={[0, 0.005, 0.006]} rotation={[0.08, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.088, 0.028, 0.01]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Flap Silver Button */}
        <mesh position={[0, 0.002, 0.014]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.0045, 0.0045, 0.004, 14]} />
          <primitive object={materials.platinumSilver} />
        </mesh>

        {/* 3D Extruded Platinum-Silver Investigator Shield Badge (#C7CDD4) */}
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

      {/* 3. Right Breast Pocket (Pleated Body #3A4148 + Flap #20252A + Silver Nameplate #C7CDD4) */}
      <group position={[0.104, -0.018, 0.015]}>
        {/* Pocket Body */}
        <mesh position={[0, -0.045, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.084, 0.092, 0.012]} />
          <primitive object={materials.uniformCloth} />
        </mesh>
        {/* Center Vertical Pleat Crease */}
        <mesh position={[0, -0.045, 0.007]} castShadow>
          <boxGeometry args={[0.014, 0.09, 0.004]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Scalloped Pocket Flap */}
        <mesh position={[0, 0.005, 0.006]} rotation={[0.08, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.088, 0.028, 0.01]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Flap Silver Button */}
        <mesh position={[0, 0.002, 0.014]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.0045, 0.0045, 0.004, 14]} />
          <primitive object={materials.platinumSilver} />
        </mesh>

        {/* Polished Platinum-Silver Engraved Nameplate (#C7CDD4) */}
        <group position={[0, 0.034, 0.012]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.07, 0.016, 0.006]} />
            <primitive object={materials.platinumSilver} />
          </mesh>
          {/* Beveled Edge Highlight */}
          <mesh position={[0, 0, 0.004]} castShadow>
            <boxGeometry args={[0.064, 0.012, 0.002]} />
            <primitive object={materials.platinumHighSpec} />
          </mesh>
        </group>
      </group>

      {/* 4. Left Shoulder Epaulette (#20252A Strap + #C7CDD4 Rank Bars) & Radio Mic */}
      <group position={[-0.182, 0.108, -0.02]} rotation={[0, 0, -0.2]}>
        {/* Epaulette Strap in #20252A */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.054, 0.014, 0.128]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Neck Fastener Silver Button */}
        <mesh position={[0.015, 0.009, -0.036]} castShadow>
          <cylinderGeometry args={[0.005, 0.005, 0.005, 14]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
        {/* Silver Rank Bars */}
        <mesh position={[-0.008, 0.009, 0.026]} castShadow>
          <boxGeometry args={[0.016, 0.003, 0.006]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
        <mesh position={[-0.008, 0.009, 0.044]} castShadow>
          <boxGeometry args={[0.016, 0.003, 0.006]} />
          <primitive object={materials.platinumSilver} />
        </mesh>

        {/* Tactical Shoulder Lapel Radio Microphone */}
        <group position={[-0.01, 0.022, 0.016]} rotation={[0.2, 0.35, 0]}>
          {/* Mic Head Case in #20252A */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.028, 0.036, 0.022]} />
            <primitive object={materials.gearDark} />
          </mesh>
          {/* Speaker Grille */}
          <mesh position={[0, 0, 0.012]} castShadow>
            <boxGeometry args={[0.018, 0.024, 0.003]} />
            <primitive object={materials.uniformDarkTrim} />
          </mesh>
          {/* PTT Button */}
          <mesh position={[-0.015, 0.004, 0]} castShadow>
            <boxGeometry args={[0.005, 0.016, 0.012]} />
            <primitive object={materials.uniformDarkTrim} />
          </mesh>
        </group>
      </group>

      {/* 5. Right Shoulder Epaulette (#20252A Strap + #C7CDD4 Rank Bars) */}
      <group position={[0.182, 0.108, -0.02]} rotation={[0, 0, 0.2]}>
        {/* Epaulette Strap */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.054, 0.014, 0.128]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Neck Fastener Silver Button */}
        <mesh position={[-0.015, 0.009, -0.036]} castShadow>
          <cylinderGeometry args={[0.005, 0.005, 0.005, 14]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
        {/* Silver Rank Bars */}
        <mesh position={[0.008, 0.009, 0.026]} castShadow>
          <boxGeometry args={[0.016, 0.003, 0.006]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
        <mesh position={[0.008, 0.009, 0.044]} castShadow>
          <boxGeometry args={[0.016, 0.003, 0.006]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
      </group>
    </group>
  );
}

// Sub-component: 360-Degree Duty Belt (#181B20 Leather, #20252A Pouches, #C7CDD4 Platinum Buckle)
function DutyBeltGear({ materials }: { materials: Record<string, THREE.Material> }) {
  return (
    <group position={[0, 0.165, 0.012]}>
      {/* 1. Contoured Heavy-Duty Leather Belt Loop */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.236, 0.242, 0.058, 36]} />
        <primitive object={materials.leatherDutyBelt} />
      </mesh>

      {/* 2. Front Heavy-Duty Platinum Buckle (#C7CDD4) */}
      <mesh position={[0, 0, 0.244]} castShadow receiveShadow>
        <boxGeometry args={[0.078, 0.068, 0.018]} />
        <primitive object={materials.platinumSilver} />
      </mesh>
      {/* Buckle Inner Bevel */}
      <mesh position={[0, 0, 0.252]} castShadow>
        <boxGeometry args={[0.06, 0.048, 0.006]} />
        <primitive object={materials.leatherDutyBelt} />
      </mesh>
      {/* Center Buckle Prong */}
      <mesh position={[0, 0, 0.254]} castShadow>
        <boxGeometry args={[0.006, 0.038, 0.005]} />
        <primitive object={materials.platinumHighSpec} />
      </mesh>

      {/* 3. Front Snap Belt Keepers (#20252A with dual #C7CDD4 Chrome Snaps) */}
      {[-0.08, 0.08].map((x, i) => (
        <group key={`keeper-front-${i}`} position={[x, 0, 0.234]}>
          <mesh castShadow>
            <boxGeometry args={[0.022, 0.066, 0.018]} />
            <primitive object={materials.uniformDarkTrim} />
          </mesh>
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

      {/* 4. Right Hip: Molded Duty Holster with Service Weapon Grip (#20252A) */}
      <group position={[0.228, -0.062, 0.045]} rotation={[0.08, 0, -0.16]}>
        {/* Holster Shell */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.048, 0.162, 0.084]} />
          <primitive object={materials.gearDark} />
        </mesh>
        {/* Retention Hood / Strap */}
        <mesh position={[0, 0.084, 0]} castShadow>
          <boxGeometry args={[0.054, 0.016, 0.09]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Handgun Grip Angled Forward */}
        <mesh position={[0, 0.102, -0.016]} rotation={[-0.38, 0, 0]} castShadow>
          <boxGeometry args={[0.028, 0.08, 0.04]} />
          <primitive object={materials.gearDark} />
        </mesh>
        {/* Grip Silver Medallion */}
        <mesh position={[0.015, 0.102, -0.016]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.004, 0.004, 0.003, 10]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
      </group>

      {/* 5. Left Hip: Double Magazine Pouch + Tactical Taser Holster (#20252A) */}
      <group position={[-0.23, -0.018, 0.045]} rotation={[0.05, 0, 0.14]}>
        {/* Double Mag Pouch */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.044, 0.088, 0.078]} />
          <primitive object={materials.gearDark} />
        </mesh>
        {/* Snaps on Mag Flaps */}
        <mesh position={[-0.023, 0.014, -0.018]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.004, 0.004, 0.004, 12]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
        <mesh position={[-0.023, 0.014, 0.018]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.004, 0.004, 0.004, 12]} />
          <primitive object={materials.platinumSilver} />
        </mesh>

        {/* Taser Carrier */}
        <group position={[0.012, -0.038, 0.06]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.04, 0.096, 0.05]} />
            <primitive object={materials.gearDark} />
          </mesh>
          {/* Tactical yellow safety stripe */}
          <mesh position={[-0.021, 0.022, 0]} castShadow>
            <boxGeometry args={[0.003, 0.026, 0.046]} />
            <primitive object={materials.taserYellow} />
          </mesh>
        </group>
      </group>

      {/* 6. Rear of Duty Belt: Handcuff Pouch & Police Radio Receiver */}
      {/* Left-Rear: Double Handcuff Case (#20252A) with twin silver snaps (#C7CDD4) */}
      <group position={[-0.082, -0.022, -0.23]} rotation={[0.08, 0, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.084, 0.088, 0.046]} />
          <primitive object={materials.gearDark} />
        </mesh>
        {/* Twin Silver Snaps */}
        <mesh position={[-0.022, 0.016, -0.025]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0045, 0.0045, 0.004, 12]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
        <mesh position={[0.022, 0.016, -0.025]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0045, 0.0045, 0.004, 12]} />
          <primitive object={materials.platinumSilver} />
        </mesh>
      </group>

      {/* Right-Rear: Tactical Police Radio Unit (#20252A) with Antenna */}
      <group position={[0.096, 0.012, -0.232]} rotation={[0.08, 0, 0]}>
        {/* Main Radio Chassis */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.05, 0.128, 0.044]} />
          <primitive object={materials.gearDark} />
        </mesh>
        {/* Volume & Channel Dials */}
        <mesh position={[-0.014, 0.07, 0]} castShadow>
          <cylinderGeometry args={[0.006, 0.006, 0.014, 12]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        <mesh position={[0.014, 0.07, 0]} castShadow>
          <cylinderGeometry args={[0.005, 0.005, 0.012, 12]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
        {/* Flexible Whip Rubber Antenna */}
        <mesh position={[0.016, 0.152, 0]} castShadow>
          <cylinderGeometry args={[0.003, 0.004, 0.168, 10]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
      </group>

      {/* Rear Belt Keepers */}
      {[-0.145, 0.155].map((x, i) => (
        <mesh key={`keeper-rear-${i}`} position={[x, 0, -0.23]} castShadow>
          <boxGeometry args={[0.018, 0.064, 0.016]} />
          <primitive object={materials.uniformDarkTrim} />
        </mesh>
      ))}
    </group>
  );
}

// Main High-Fidelity Rigged 3D Character Component
export default function PoliceInvestigatorModel({ interactive = true }: InvestigatorProps) {
  const rootGroupRef = useRef<THREE.Group>(null);
  const [blinkProgress, setBlinkProgress] = useState<number>(0);
  const blinkTimerRef = useRef({ nextBlink: 3.2, blinkDuration: 0.14, blinkStart: -1 });

  // Load the organic rigged 3D character mesh and skeletal animations
  const { scene, animations } = useGLTF("/models/police_character.glb");
  const { actions } = useAnimations(animations, scene);

  // Bones state for portal mounting & anatomy tuning
  const [bones, setBones] = useState<{
    head: THREE.Object3D | null;
    chest: THREE.Object3D | null;
    hips: THREE.Object3D | null;
    torso: THREE.Object3D | null;
    neck: THREE.Object3D | null;
    shoulderL: THREE.Object3D | null;
    shoulderR: THREE.Object3D | null;
  }>({ head: null, chest: null, hips: null, torso: null, neck: null, shoulderL: null, shoulderR: null });

  // NEXUS Graphite Charcoal (#3A4148) + Dark Details (#20252A) + Platinum Silver (#C7CDD4) Palette
  const customMaterials = useMemo(() => {
    return {
      // 1. Uniform Cloth: Graphite Charcoal (#3A4148) with fine twill weave sheen
      uniformCloth: new THREE.MeshStandardMaterial({
        color: "#3A4148",
        roughness: 0.72,
        metalness: 0.08,
      }),
      // 2. Uniform Dark Details (#20252A: placket, pocket flaps, tie, epaulettes, cap band)
      uniformDarkTrim: new THREE.MeshStandardMaterial({
        color: "#20252A",
        roughness: 0.68,
        metalness: 0.12,
      }),
      // 3. Officer Inner Collar / Shirt (Graphite Charcoal #3A4148 - no excessive white!)
      shirtGraphite: new THREE.MeshStandardMaterial({
        color: "#3A4148",
        roughness: 0.70,
        metalness: 0.08,
      }),
      // 4. Midnight Tie (#20252A)
      tieDark: new THREE.MeshStandardMaterial({
        color: "#20252A",
        roughness: 0.52,
        metalness: 0.18,
      }),
      // 5. Stylized Natural Skin (#D29D75, warm healthy skin tone)
      naturalSkin: new THREE.MeshStandardMaterial({
        color: "#D29D75",
        roughness: 0.64,
        metalness: 0.02,
      }),
      // 6. Styled Charcoal Hair & Brows (#181A1D)
      charcoalHair: new THREE.MeshStandardMaterial({
        color: "#181A1D",
        roughness: 0.85,
        metalness: 0.05,
      }),
      // 7. Platinum Silver Insignia (#C7CDD4: Badges, Buttons, Nameplate, Buckles, Rank Bars)
      platinumSilver: new THREE.MeshStandardMaterial({
        color: "#C7CDD4",
        roughness: 0.22,
        metalness: 0.94,
      }),
      // 8. High-Spec Platinum Highlights (#E5E9EE)
      platinumHighSpec: new THREE.MeshStandardMaterial({
        color: "#E5E9EE",
        roughness: 0.14,
        metalness: 0.98,
      }),
      // 9. Patent Leather Glossy Visor (#0C0E12)
      glossyVisor: new THREE.MeshStandardMaterial({
        color: "#0C0E12",
        roughness: 0.10,
        metalness: 0.32,
      }),
      // 10. Duty Belt Leather (#181B20)
      leatherDutyBelt: new THREE.MeshStandardMaterial({
        color: "#181B20",
        roughness: 0.44,
        metalness: 0.16,
      }),
      // 11. Duty Gear Black/Charcoal (#20252A)
      gearDark: new THREE.MeshStandardMaterial({
        color: "#20252A",
        roughness: 0.42,
        metalness: 0.22,
      }),
      // 12. Taser Safety Accent
      taserYellow: new THREE.MeshStandardMaterial({
        color: "#EAB308",
        roughness: 0.35,
        metalness: 0.1,
      }),
    };
  }, []);

  // Repaint meshes to Graphite Charcoal & Platinum Silver palette and tune anatomy
  useEffect(() => {
    if (!scene) return;

    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Hide detached weapon mesh from hand so our molded duty holster is primary
        if (mesh.name === "Pistol" || mesh.name.includes("Pistol")) {
          mesh.visible = false;
        }

        // Remap materials cleanly to NEXUS #3A4148 Graphite Charcoal & #20252A Dark Details
        if (mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          const matName = mat.name;

          if (matName === "Suit") {
            mesh.material = customMaterials.uniformCloth; // Graphite Charcoal #3A4148
          } else if (matName === "White") {
            mesh.material = customMaterials.shirtGraphite; // Replace excessive white with #3A4148
          } else if (matName === "Tie") {
            mesh.material = customMaterials.tieDark; // Dark detail #20252A
          } else if (matName === "Skin") {
            mesh.material = customMaterials.naturalSkin;
          } else if (matName === "Hair" || matName === "Eyebrows") {
            mesh.material = customMaterials.charcoalHair;
          } else if (matName === "Black") {
            mesh.material = customMaterials.leatherDutyBelt;
          } else if (matName === "Grey") {
            mesh.material = customMaterials.platinumSilver; // Platinum Silver #C7CDD4
          }
        }
      }
    });

    // Locate target bones for mounting accessories and proportional shaping
    const head = scene.getObjectByName("Head");
    const chest = scene.getObjectByName("Chest");
    const hips = scene.getObjectByName("Hips");
    const torso = scene.getObjectByName("Torso");
    const neck = scene.getObjectByName("Neck");
    const shoulderL = scene.getObjectByName("Shoulder.L");
    const shoulderR = scene.getObjectByName("Shoulder.R");

    // Anatomical proportion tuning: slightly broaden chest, shoulders and torso
    if (chest) chest.scale.set(1.08, 1.0, 1.05);
    if (torso) torso.scale.set(1.05, 1.0, 1.03);
    if (neck) neck.scale.set(1.03, 0.98, 1.03);

    setBones({
      head: head || null,
      chest: chest || null,
      hips: hips || null,
      torso: torso || null,
      neck: neck || null,
      shoulderL: shoulderL || null,
      shoulderR: shoulderR || null,
    });

    // Start idle animation smoothly
    if (actions) {
      const idleClip = actions["Idle_Neutral"] || actions["Idle"] || Object.values(actions)[0];
      if (idleClip) {
        idleClip.reset().fadeIn(0.6).play();
        idleClip.setEffectiveTimeScale(0.85); // Calm breathing pace
      }
    }
  }, [scene, actions, customMaterials]);

  // Frame loop: Subtle idle breathing, natural blinking, and gentle head micro-movements
  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    // 1. Natural Blinking Logic
    let currentBlink = 0;
    if (t > blinkTimerRef.current.nextBlink) {
      if (blinkTimerRef.current.blinkStart < 0) {
        blinkTimerRef.current.blinkStart = t;
      }
      const elapsed = t - blinkTimerRef.current.blinkStart;
      if (elapsed < blinkTimerRef.current.blinkDuration) {
        currentBlink = Math.sin((elapsed / blinkTimerRef.current.blinkDuration) * Math.PI);
      } else {
        blinkTimerRef.current.blinkStart = -1;
        blinkTimerRef.current.nextBlink = t + 3.4 + Math.sin(t * 0.2) * 1.6;
      }
    }
    setBlinkProgress(currentBlink);

    // 2. Subtle Idle Breathing on Chest Bone
    if (bones.chest) {
      const breath = Math.sin(t * 1.6) * 0.016;
      bones.chest.scale.set(1.08 + breath, 1.0, 1.05 + breath * 1.2);
    }

    // 3. Subtle Head Micro-Movement (calm, non-distracting gaze adjustments)
    if (bones.head) {
      bones.head.rotation.y = Math.sin(t * 0.38) * 0.022; // subtle ~1.2° turn
      bones.head.rotation.x = -0.025 + Math.sin(t * 0.26) * 0.012; // subtle ~0.7° tilt
    }

    // 4. Subtle Postural Micro-Sway
    if (rootGroupRef.current) {
      rootGroupRef.current.rotation.y = Math.sin(t * 0.3) * 0.012;
    }
  });

  return (
    // Slightly enlarged presentation within right-side hero area (scale 1.68)
    <group ref={rootGroupRef} position={[0, -1.45, 0]} scale={1.68}>
      {/* 1. Rigged Organic Human 3D Character Mesh */}
      <primitive object={scene} />

      {/* 2. Police Cap & Eyelids Portal (Anchored directly to Head Bone) */}
      {bones.head &&
        createPortal(
          <group>
            <PoliceOfficerCap materials={customMaterials} />
            <StylizedEyelids blinkProgress={blinkProgress} materials={customMaterials} />
          </group>,
          bones.head
        )}

      {/* 3. Police Uniform Chest Details Portal (Badge, Nameplate, Pockets, Epaulettes, Mic) */}
      {bones.chest && createPortal(<UniformChestDetails materials={customMaterials} />, bones.chest)}

      {/* 4. Full 360-Degree Duty Belt Gear Portal (Holster, Taser, Handcuffs, Radio, Buckle) */}
      {bones.hips && createPortal(<DutyBeltGear materials={customMaterials} />, bones.hips)}
    </group>
  );
}

// Preload the rigged character model
useGLTF.preload("/models/police_character.glb");
