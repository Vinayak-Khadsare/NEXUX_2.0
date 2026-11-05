"use client";
import React, { useState, useEffect, useRef, Suspense, Component, ErrorInfo, ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import PoliceInvestigatorModel from "./PoliceInvestigatorModel";

// Error Boundary to prevent any GLTF parsing failure from breaking the canvas
interface ErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
}

class ModelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("External GLB load failed, falling back to procedural 3D model:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// External GLTF/GLB loader if user provides /models/police_investigator.glb
function ExternalGLBModel({ url }: { url: string }) {
  const { scene, animations } = useGLTF(url);
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    // Traverse to enable shadows and adjust materials to NEXUS palette
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Play first idle animation if exists in the rig
    if (actions && Object.keys(actions).length > 0) {
      const firstAction = Object.values(actions)[0];
      firstAction?.reset().fadeIn(0.5).play();
    }
  }, [scene, actions]);

  return <primitive object={scene} position={[0, -1.2, 0]} scale={1.6} />;
}

export default function InvestigatorHeroVisualizer() {
  const [hasGlbModel, setHasGlbModel] = useState<boolean>(false);
  const [showReferenceModal, setShowReferenceModal] = useState<boolean>(false);
  const controlsRef = useRef<any>(null);

  // Check if a real external GLB file was placed in /models/police_investigator.glb
  useEffect(() => {
    let active = true;
    fetch("/models/police_investigator.glb", { method: "HEAD" })
      .then((res) => {
        if (active && res.ok && res.headers.get("content-type")?.includes("octet-stream")) {
          setHasGlbModel(true);
        }
      })
      .catch(() => {
        // Silently keep default procedural 3D model
      });
    return () => {
      active = false;
    };
  }, []);

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
        camera={{ position: [0, 0.45, 4.3], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      >
        {/* Soft Background Depth Fog */}
        <fog attach="fog" args={["#080808", 6, 18]} />

        {/* Studio Lighting Rig matching NEXUS Charcoal & Platinum Identity */}
        <ambientLight intensity={0.65} color="#181B22" />
        
        {/* Key Light (Front-Left, crisp daylight neutral) */}
        <directionalLight
          position={[3.2, 3.5, 4.0]}
          intensity={2.4}
          color="#F5F5F5"
          castShadow
        />

        {/* Fill Light (Front-Right, cool slate) */}
        <directionalLight
          position={[-3.5, 1.2, 3.0]}
          intensity={0.9}
          color="#858B93"
        />

        {/* Platinum Silver Rim Light 1 (Rear-Left for sharp shoulder/cap silhouette) */}
        <directionalLight
          position={[3.0, 2.8, -3.2]}
          intensity={3.8}
          color="#C7CDD4"
        />

        {/* Platinum Silver Rim Light 2 (Rear-Right edge highlight) */}
        <directionalLight
          position={[-3.0, 2.2, -3.2]}
          intensity={3.2}
          color="#AEB7C2"
        />

        {/* Overhead Badge & Insignia Highlight */}
        <pointLight
          position={[0, 3.8, 1.2]}
          intensity={1.6}
          color="#E2E8F0"
          distance={8}
        />

        {/* Model rendering with fallback */}
        <Suspense fallback={null}>
          {hasGlbModel ? (
            <ModelErrorBoundary fallback={<PoliceInvestigatorModel />}>
              <ExternalGLBModel url="/models/police_investigator.glb" />
            </ModelErrorBoundary>
          ) : (
            <PoliceInvestigatorModel />
          )}
        </Suspense>

        {/* 360-Degree Orbit Controls with sensible damping and vertical angle limits */}
        <OrbitControls
          ref={controlsRef}
          target={[0, 0.35, 0]}
          enablePan={false}
          enableZoom={true}
          enableDamping={true}
          dampingFactor={0.06}
          minDistance={2.6}
          maxDistance={6.0}
          minPolarAngle={Math.PI / 2.8} // Prevents looking excessively from above
          maxPolarAngle={Math.PI / 1.78} // Prevents looking from underneath
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
