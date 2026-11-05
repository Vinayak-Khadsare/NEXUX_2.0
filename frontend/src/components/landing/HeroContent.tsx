"use client";
import React from 'react';
import Link from 'next/link';
import GetStartedButton from '../ui/GetStartedButton';

export default function HeroContent() {
  return (
    <div className="relative z-10 w-full min-h-screen flex items-center pointer-events-none">
      <div className="max-w-7xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Left Side Content */}
        <div className="flex flex-col justify-center pointer-events-auto">
          {/* Status Indicator */}
          <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-[#000000]/80 border border-[#292929] backdrop-blur-sm mb-8 w-max shadow-xl">
            <div className="w-2 h-2 rounded-full bg-[#C7CDD4] animate-pulse"></div>
            <span className="text-xs font-semibold tracking-[0.2em] text-[#A1A1AA]">
              NEXUS SECURE NETWORK — ONLINE
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-[#F5F5F5] mb-2 leading-none drop-shadow-2xl">
            NEXUS
          </h1>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-wide bg-gradient-to-r from-[#F5F5F5] via-[#A1A1AA] to-[#A1A1AA]/60 bg-clip-text text-transparent mb-6">
            AI-Powered Intelligence<br />& Investigation Platform
          </h2>

          {/* Supporting Text */}
          <p className="text-[#A1A1AA] text-lg max-w-lg mb-10 leading-relaxed font-light">
            Transform complex evidence, entities, relationships, and intelligence into actionable investigative insight.
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-5">
            <GetStartedButton href="/login" />
            <a 
              href="#capabilities" 
              className="px-8 py-4 rounded-lg bg-[#111111] hover:bg-[#191919] border border-[#292929] hover:border-[#C7CDD4]/40 text-[#F5F5F5] font-semibold tracking-wide text-sm flex items-center justify-center backdrop-blur-sm transition-all duration-300"
            >
              EXPLORE PLATFORM
            </a>
          </div>
        </div>

        {/* Right Side - Empty space for the 3D scene to shine */}
        <div className="hidden lg:block"></div>
      </div>
      
      {/* Scroll indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-50 animate-bounce">
        <span className="text-[10px] uppercase tracking-widest text-[#A1A1AA] font-semibold">Scroll</span>
        <div className="w-[1px] h-12 bg-gradient-to-b from-[#A1A1AA] to-transparent"></div>
      </div>
    </div>
  );
}
