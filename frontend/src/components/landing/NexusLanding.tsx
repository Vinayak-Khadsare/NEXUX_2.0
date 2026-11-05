"use client";
import React from 'react';
import LandingNavbar from './LandingNavbar';
import { Hero } from './Hero';
import CapabilitiesSection from './CapabilitiesSection';
import WorkflowSection from './WorkflowSection';
import FeatureHighlightSection from './FeatureHighlightSection';
import FinalCTASection from './FinalCTASection';
import { footerContent } from '@/content/footer';

export default function NexusLanding() {
  return (
    <div className="bg-[#000000] min-h-screen text-[#F5F5F5] font-sans selection:bg-[#C7CDD4]/30 selection:text-[#F5F5F5]">
      <LandingNavbar />
      
      <Hero />

      {/* Content Sections */}
      <CapabilitiesSection />
      <WorkflowSection />
      <FeatureHighlightSection />
      <FinalCTASection />

      {/* Minimal Footer */}
      <footer className="py-8 bg-nexus-bg-base border-t border-nexus-glass-border text-center relative z-20">
        <p className="text-[#A1A1AA] text-sm font-display font-medium tracking-wide">
          &copy; {new Date().getFullYear()} {footerContent.logo} {footerContent.tagline}. ALL RIGHTS RESERVED.
        </p>
      </footer>
    </div>
  );
}
