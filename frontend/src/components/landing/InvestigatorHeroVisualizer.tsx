"use client";
import React, { useState, useRef, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import PoliceInvestigatorModel from "./PoliceInvestigatorModel";

export default function InvestigatorHeroVisualizer() {
  const [showReferenceModal, setShowReferenceModal] = useState<boolean>(false);
  const controlsRef = useRef<any>(null);

  const resetView = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  const handleZoom = (delta: number) => {
    if (controlsRef.current) {
      const camera = controlsRef.current.object;
      if (camera) {
        camera.position.z = Math.min(Math.max(camera.position.z + delta, 2.8), 5.8);
        controlsRef.current.update();
      }
    }
  };

  return (
    <div className="relative w-full h-full min-h-[460px] lg:min-h-[640px] flex items-center justify-center select-none overflow-hidden group">
      
      {/* 3D Canvas Visualizer */}
      <Canvas
        camera={{ position: [0, 0.46, 3.52], fov: 36 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      >
        {/* Soft Background Depth Fog */}
        <fog attach="fog" args={["#080808", 7, 20]} />

        {/* Studio Lighting Rig: High Contrast Separation Against Charcoal Background */}
        <ambientLight intensity={0.9} color="#222830" />
        
        {/* Key Light (Front-Left, crisp neutral illumination on face, cap and badges) */}
        <directionalLight
          position={[3.0, 3.4, 3.6]}
          intensity={3.2}
          color="#FFFFFF"
        />

        {/* Fill Light (Front-Right, cool slate tone to balance uniform shadows) */}
        <directionalLight
          position={[-3.0, 1.8, 3.0]}
          intensity={1.5}
          color="#BAC4CE"
        />

        {/* Front Soft Center Fill (Ensures face, tie and placket details are visible) */}
        <directionalLight
          position={[0, 0.9, 3.4]}
          intensity={1.0}
          color="#DCE2E8"
        />

        {/* High-Intensity Platinum Rim Light 1 (Rear-Left for sharp shoulder & cap silhouette) */}
        <directionalLight
          position={[3.4, 2.8, -3.2]}
          intensity={5.4}
          color="#E2E8F0"
        />

        {/* High-Intensity Platinum Rim Light 2 (Rear-Right edge highlight for 360° definition) */}
        <directionalLight
          position={[-3.4, 2.4, -3.2]}
          intensity={5.0}
          color="#CBD5E1"
        />

        {/* Overhead Top-Down Hair & Cap Crown Rim Light */}
        <directionalLight
          position={[0, 4.2, -1.0]}
          intensity={2.5}
          color="#FFFFFF"
        />

        {/* Overhead Badge & Insignia Spotlight */}
        <pointLight
          position={[0, 3.6, 1.2]}
          intensity={2.2}
          color="#F8FAFC"
          distance={8}
        />

        {/* Soft Badge & Nameplate Specular Fill */}
        <pointLight
          position={[-0.2, 1.4, 2.0]}
          intensity={1.2}
          color="#F0F4F8"
          distance={6}
        />

        {/* High-Fidelity Rigged 3D Character Rendering */}
        <Suspense
          fallback={
            <mesh position={[0, 0.42, 0]}>
              <octahedronGeometry args={[0.15, 0]} />
              <meshBasicMaterial color="#C7CDD4" wireframe />
            </mesh>
          }
        >
          <PoliceInvestigatorModel />
        </Suspense>

        {/* 360-Degree Orbit Controls with sensible damping and vertical angle limits */}
        <OrbitControls
          ref={controlsRef}
          target={[0, 0.44, 0]}
          enablePan={false}
          enableZoom={true}
          enableDamping={true}
          dampingFactor={0.06}
          minDistance={2.2}
          maxDistance={5.5}
          minPolarAngle={Math.PI / 3.2} // Prevents looking excessively from above
          maxPolarAngle={Math.PI / 1.72} // Prevents looking from underneath
          minAzimuthAngle={-Infinity} // Full 360° horizontal drag
          maxAzimuthAngle={Infinity}
        />
      </Canvas>

      {/* Interactive Controls Overlay Header */}
      <div className="absolute top-4 inset-x-4 flex items-center justify-between pointer-events-none z-20">
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#111111]/85 border border-[#303030] backdrop-blur-md shadow-lg">
          <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse"></span>
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-[#C7CDD4]">
            3D Investigator • 360° Interactive
          </span>
        </div>

        {/* Stitch Design Reference Inspection Pill */}
        <button
          onClick={() => setShowReferenceModal(true)}
          className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#1C1C1C]/90 hover:bg-[#222222] border border-[#303030] hover:border-[#C7CDD4] text-[#A1A1AA] hover:text-[#F5F5F5] text-[10px] font-mono tracking-wider transition-all duration-200 shadow-md cursor-pointer active:scale-95"
          title="View Google Stitch Design Reference"
        >
          <i className="fa-solid fa-image text-[9px] text-[#C7CDD4]"></i>
          <span>Design Spec</span>
        </button>
      </div>

      {/* Floating Bottom Navigation & Controls */}
      <div className="absolute bottom-4 inset-x-4 flex items-center justify-between pointer-events-none z-20">
        <div className="pointer-events-auto text-[10px] font-mono text-[#858B93] bg-[#111111]/80 px-2.5 py-1 rounded-md border border-[#303030]/60 backdrop-blur-sm hidden sm:block">
          <i className="fa-solid fa-arrows-rotate text-[9px] text-[#C7CDD4] mr-1.5"></i>
          Left Click + Drag: Rotate 360° | Scroll: Zoom
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => handleZoom(-0.5)}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#151515]/90 hover:bg-[#222222] border border-[#303030] hover:border-[#454545] text-[#C7CDD4] hover:text-[#F5F5F5] text-xs transition-all active:scale-95 cursor-pointer shadow-sm"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <i className="fa-solid fa-plus text-[10px]"></i>
          </button>
          <button
            onClick={() => handleZoom(0.5)}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#151515]/90 hover:bg-[#222222] border border-[#303030] hover:border-[#454545] text-[#C7CDD4] hover:text-[#F5F5F5] text-xs transition-all active:scale-95 cursor-pointer shadow-sm"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <i className="fa-solid fa-minus text-[10px]"></i>
          </button>
          <button
            onClick={resetView}
            className="px-2.5 h-7 flex items-center gap-1 rounded-lg bg-[#151515]/90 hover:bg-[#222222] border border-[#303030] hover:border-[#454545] text-[#C7CDD4] hover:text-[#F5F5F5] text-[10px] font-mono tracking-wider transition-all active:scale-95 cursor-pointer shadow-sm"
            title="Reset Perspective"
          >
            <i className="fa-solid fa-camera-rotate text-[10px]"></i> Reset
          </button>
        </div>
      </div>

      {/* Stitch Design Reference Modal */}
      {showReferenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in pointer-events-auto">
          <div className="bg-[#151515] border border-[#303030] rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-[#303030] flex items-center justify-between bg-[#1C1C1C]">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-id-badge text-[#C7CDD4] text-sm"></i>
                <h3 className="text-xs font-bold font-mono tracking-wider uppercase text-[#F5F5F5]">
                  Google Stitch Character Reference (screen.png)
                </h3>
              </div>
              <button
                onClick={() => setShowReferenceModal(false)}
                className="w-6 h-6 flex items-center justify-center rounded-md text-[#858B93] hover:text-[#F5F5F5] hover:bg-[#222222] transition-colors"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            </div>
            <div className="p-4 flex flex-col items-center">
              <div className="relative rounded-xl overflow-hidden border border-[#303030] bg-[#080808] max-h-[380px] w-full flex items-center justify-center">
                <img
                  src="/images/police_investigator_reference.png"
                  alt="Google Stitch Police Investigator Reference"
                  className="max-h-[360px] object-contain rounded-lg"
                />
              </div>
              <p className="mt-3 text-[11px] text-[#A1A1AA] leading-relaxed text-center font-sans">
                Supplied Google Stitch visual asset: 3D stylized police investigator with graphite-charcoal uniform, silver star cap insignia, chest badge, radio mic, and duty belt.
              </p>
            </div>
            <div className="p-3 border-t border-[#303030] bg-[#1C1C1C] flex justify-end">
              <button
                onClick={() => setShowReferenceModal(false)}
                className="px-4 py-1.5 rounded-lg bg-[#C7CDD4] hover:bg-[#E0E4E8] text-[#101010] text-xs font-bold transition-all cursor-pointer"
              >
                Close Spec
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

