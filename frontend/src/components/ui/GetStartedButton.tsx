"use client";

import React from "react";
import Link from "next/link";

interface GetStartedButtonProps {
  href: string;
  className?: string;
}

export default function GetStartedButton({ href, className = "" }: GetStartedButtonProps) {
  return (
    <Link
      href={href}
      className={`group relative inline-flex items-center justify-between p-1.5 pl-6 rounded-full overflow-hidden transition-all duration-300 shadow-sm hover:shadow-[0_0_20px_rgba(199,205,212,0.25)] active:scale-[0.98] 
        bg-[#191919] border border-[#292929] 
        hover:border-[#C7CDD4]/60 ${className}`}
      style={{ minWidth: '180px' }}
    >
      <span className="relative z-10 font-bold tracking-wide text-[#F5F5F5] transition-colors duration-300 group-hover:text-[#000000]">
        Get Started
      </span>
      
      {/* Icon container - remains in flow */}
      <div className="relative z-10 flex items-center justify-center w-10 h-10 rounded-full text-[#F5F5F5] group-hover:text-[#000000] transition-colors duration-300">
        <svg 
          className="relative z-10 w-5 h-5 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-1" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24" 
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </div>

      {/* Expanding background element */}
      <div className="absolute right-1.5 top-1.5 bottom-1.5 w-10 rounded-full bg-[#C7CDD4] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:w-[calc(100%-12px)] group-hover:bg-[#F5F5F5] z-0"></div>
    </Link>
  );
}
